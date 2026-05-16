import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

// Must stay inside SAFE_CACHE_BASE (`<tmpdir>/pdf-search-index-mcp/...`)
// or the MCP tool's `safeCacheDir` jail throws.
const SAFE_CACHE_BASE = resolve(tmpdir(), 'pdf-search-index-mcp');

// Per-test relative slug. `safeCacheDir` resolves it under SAFE_CACHE_BASE.
let cacheSlug: string;
// Absolute path for direct fs cleanup; the MCP tool resolves the same path
// from `cacheSlug`.
let cacheDir: string;
let pdfServer: Server;
let baseUrl: string;

beforeEach(async () => {
  cacheSlug = `pdf-search-mcp-${Date.now()}-${Math.random()}`;
  cacheDir = join(SAFE_CACHE_BASE, cacheSlug);
  await mkdir(cacheDir, { recursive: true });
  pdfServer = createServer(async (req, res) => {
    const filename = (req.url ?? '/').replace('/', '');
    try {
      const buf = await readFile(join(fixturesDir, filename));
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(buf);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => pdfServer.listen(0, () => r()));
  const addr = pdfServer.address();
  if (!addr || typeof addr === 'string') throw new Error('bad addr');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((r) => pdfServer.close(() => r()));
  await rm(cacheDir, { recursive: true, force: true });
});

async function connectClient() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}

describe('MCP server', () => {
  it('exposes the expected tools', async () => {
    const { client } = await connectClient();
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'clear_cache',
      'extract_pdf',
      'get_pdf_index',
      'get_status',
      'index_pdfs',
      'search_pdfs',
    ]);
  });

  it('extract_pdf returns text for a fixture PDF', async () => {
    const { client } = await connectClient();
    const r = await client.callTool({
      name: 'extract_pdf',
      arguments: { url: `${baseUrl}/small-text.pdf`, cacheDir: cacheSlug },
    });
    expect(JSON.stringify(r.content)).toMatch(/applicant portal/i);
  });

  it('index_pdfs returns an array of IndexedPdf', async () => {
    const { client } = await connectClient();
    const r = await client.callTool({
      name: 'index_pdfs',
      arguments: {
        urls: [`${baseUrl}/small-text.pdf`, `${baseUrl}/multi-page.pdf`],
        cacheDir: cacheSlug,
      },
    });
    const content = r.content as Array<{ text: string }>;
    const text = content[0]!.text;
    const rows = JSON.parse(text) as Array<{ id: string }>;
    expect(rows).toHaveLength(2);
  });

  it('search_pdfs returns ranked snippets', async () => {
    const { client } = await connectClient();
    const r = await client.callTool({
      name: 'search_pdfs',
      arguments: {
        urls: [`${baseUrl}/small-text.pdf`],
        query: 'applicant portal',
        cacheDir: cacheSlug,
      },
    });
    const content = r.content as Array<{ text: string }>;
    const text = content[0]!.text;
    const payload = JSON.parse(text) as Array<{ snippet: string }>;
    expect(payload[0]!.snippet.toLowerCase()).toContain('applicant portal');
  });

  it('get_status returns version info', async () => {
    const { client } = await connectClient();
    const r = await client.callTool({ name: 'get_status', arguments: {} });
    const content = r.content as Array<{ text: string }>;
    const text = content[0]!.text;
    const status = JSON.parse(text) as { server: string };
    expect(status.server).toBeDefined();
  });
});
