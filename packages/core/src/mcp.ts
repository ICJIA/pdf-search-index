#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { indexPdfs, extractPdfText, indexDocuments, extractDocumentText } from './index.js';
import { clearCache, listCache } from './cache.js';
import { snippetHTMLFor } from './snippet.js';

const SERVER_VERSION = '0.1.0';

/**
 * Jail every MCP-tool-provided `cacheDir` under a single safe base inside
 * the OS tmpdir. Without this, an LLM client (potentially compromised via
 * prompt injection through PDF content the user just asked it to read)
 * could call any tool with `cacheDir: '/Users/victim/.ssh'` and have
 * `mkdir + writeFile` (or `clear_cache`'s `unlink`) run there.
 */
const SAFE_CACHE_BASE = path.resolve(tmpdir(), 'pdf-search-index-mcp');

export function safeCacheDir(input: unknown): string {
  if (typeof input !== 'string' || input === '') return SAFE_CACHE_BASE;
  const resolved = path.resolve(SAFE_CACHE_BASE, input);
  if (resolved !== SAFE_CACHE_BASE && !resolved.startsWith(SAFE_CACHE_BASE + path.sep)) {
    throw new Error(
      `cacheDir must stay within ${SAFE_CACHE_BASE}; got "${input}" which resolves to "${resolved}"`,
    );
  }
  return resolved;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const TOOLS: ToolDef[] = [
  // ------------------------------------------------------------------
  // Document tools (multi-format: PDF / DOCX / PPTX / XLSX) — added 1.1
  // ------------------------------------------------------------------
  {
    name: 'extract_document',
    description:
      'Extract text from a single document URL (PDF / DOCX / PPTX / XLSX). Auto-detects format from the URL extension. Returns plain text.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
        cacheDir: { type: 'string' },
      },
    },
    handler: async (args) => {
      const url = args.url as string;
      const cacheDir = safeCacheDir(args.cacheDir);
      return await extractDocumentText(url, { cacheDir });
    },
  },
  {
    name: 'index_documents',
    description:
      'Index a list of document URLs (PDF / DOCX / PPTX / XLSX). Auto-detects each format from URL extension. Returns JSON array of IndexedDocument.',
    inputSchema: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        cacheDir: { type: 'string' },
        concurrency: { type: 'number' },
      },
    },
    handler: async (args) => {
      const urls = args.urls as string[];
      const cacheDir = safeCacheDir(args.cacheDir);
      const concurrency = args.concurrency as number | undefined;
      const rows = await indexDocuments(urls, {
        cacheDir,
        ...(concurrency !== undefined ? { concurrency } : {}),
      });
      return JSON.stringify(rows, null, 2);
    },
  },
  {
    name: 'search_documents',
    description:
      'Build a Fuse index over the given document URLs (PDF / DOCX / PPTX / XLSX) and return ranked snippets for the query.',
    inputSchema: {
      type: 'object',
      required: ['urls', 'query'],
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        query: { type: 'string' },
        cacheDir: { type: 'string' },
      },
    },
    handler: async (args) => {
      const urls = args.urls as string[];
      const query = args.query as string;
      const cacheDir = safeCacheDir(args.cacheDir);
      const rows = await indexDocuments(urls, { cacheDir });
      const { default: Fuse } = await import('fuse.js');
      const { DEFAULT_FUSE_OPTIONS } = await import('./fuse.js');
      const fuse = new Fuse(rows, DEFAULT_FUSE_OPTIONS);
      const results = fuse.search(query);
      const payload = results.map((r) => ({
        id: r.item.id,
        url: r.item.url,
        title: r.item.title,
        format: r.item.format,
        snippet: snippetHTMLFor(r),
      }));
      return JSON.stringify(payload, null, 2);
    },
  },
  // ------------------------------------------------------------------
  // PDF-only tools (back-compat with 1.0.x MCP clients)
  // ------------------------------------------------------------------
  {
    name: 'extract_pdf',
    description:
      'Extract text from a single PDF URL. Returns plain text. PDF-only — for DOCX / PPTX / XLSX use `extract_document` (added in 1.1).',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
        cacheDir: { type: 'string' },
      },
    },
    handler: async (args) => {
      const url = args.url as string;
      const cacheDir = safeCacheDir(args.cacheDir);
      return await extractPdfText(url, { cacheDir });
    },
  },
  {
    name: 'index_pdfs',
    description:
      'Index a list of PDF URLs. Returns JSON array of IndexedPdf. PDF-only — for multi-format use `index_documents` (added in 1.1).',
    inputSchema: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        cacheDir: { type: 'string' },
        concurrency: { type: 'number' },
      },
    },
    handler: async (args) => {
      const urls = args.urls as string[];
      const cacheDir = safeCacheDir(args.cacheDir);
      const concurrency = args.concurrency as number | undefined;
      const rows = await indexPdfs(urls, {
        cacheDir,
        ...(concurrency !== undefined ? { concurrency } : {}),
      });
      return JSON.stringify(rows, null, 2);
    },
  },
  {
    name: 'get_pdf_index',
    description:
      'Return the current cached document index as JSON. Format-agnostic — returns rows for any cached document (PDF / DOCX / PPTX / XLSX). Tool name kept for 1.0.x back-compat.',
    inputSchema: {
      type: 'object',
      properties: { cacheDir: { type: 'string' } },
    },
    handler: async (args) => {
      const cacheDir = safeCacheDir(args.cacheDir);
      const entries = await listCache(cacheDir);
      return JSON.stringify(entries, null, 2);
    },
  },
  {
    name: 'search_pdfs',
    description:
      'Build a Fuse index over the given PDF URLs and return ranked snippets for the query. PDF-only — for multi-format use `search_documents` (added in 1.1).',
    inputSchema: {
      type: 'object',
      required: ['urls', 'query'],
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        query: { type: 'string' },
        cacheDir: { type: 'string' },
      },
    },
    handler: async (args) => {
      const urls = args.urls as string[];
      const query = args.query as string;
      const cacheDir = safeCacheDir(args.cacheDir);
      const rows = await indexPdfs(urls, { cacheDir });
      const { default: Fuse } = await import('fuse.js');
      const { DEFAULT_FUSE_OPTIONS } = await import('./fuse.js');
      const fuse = new Fuse(rows, DEFAULT_FUSE_OPTIONS);
      const results = fuse.search(query);
      const payload = results.map((r) => ({
        id: r.item.id,
        url: r.item.url,
        title: r.item.title,
        snippet: snippetHTMLFor(r),
      }));
      return JSON.stringify(payload, null, 2);
    },
  },
  {
    name: 'clear_cache',
    description: 'Clear all entries in the PDF text cache.',
    inputSchema: {
      type: 'object',
      properties: { cacheDir: { type: 'string' } },
    },
    handler: async (args) => {
      const cacheDir = safeCacheDir(args.cacheDir);
      await clearCache(cacheDir);
      return `Cleared ${cacheDir}`;
    },
  },
  {
    name: 'get_status',
    description: 'Return server and library versions plus cache stats.',
    inputSchema: {
      type: 'object',
      properties: { cacheDir: { type: 'string' } },
    },
    handler: async (args) => {
      const cacheDir = safeCacheDir(args.cacheDir);
      const entries = await listCache(cacheDir);
      return JSON.stringify(
        {
          server: SERVER_VERSION,
          cacheDir,
          cacheEntries: entries.length,
        },
        null,
        2,
      );
    },
  },
];

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'pdf-search-index', version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      const text = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
    }
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  void server.connect(transport);
}
