#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { indexPdfs, extractPdfText } from './index.js';
import { clearCache, listCache } from './cache.js';
import { snippetHTMLFor } from './snippet.js';

const SERVER_VERSION = '0.1.0';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'extract_pdf',
    description: 'Extract text from a single PDF URL. Returns plain text.',
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
      const cacheDir = args.cacheDir as string | undefined;
      return await extractPdfText(url, cacheDir ? { cacheDir } : {});
    },
  },
  {
    name: 'index_pdfs',
    description: 'Index a list of PDF URLs. Returns JSON array of IndexedPdf.',
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
      const cacheDir = args.cacheDir as string | undefined;
      const concurrency = args.concurrency as number | undefined;
      const rows = await indexPdfs(urls, {
        ...(cacheDir ? { cacheDir } : {}),
        ...(concurrency ? { concurrency } : {}),
      });
      return JSON.stringify(rows, null, 2);
    },
  },
  {
    name: 'get_pdf_index',
    description: 'Return the current cached PDF index as JSON (format-agnostic).',
    inputSchema: {
      type: 'object',
      properties: { cacheDir: { type: 'string' } },
    },
    handler: async (args) => {
      const cacheDir = (args.cacheDir as string | undefined) ?? '.pdf-cache';
      const entries = await listCache(cacheDir);
      return JSON.stringify(entries, null, 2);
    },
  },
  {
    name: 'search_pdfs',
    description:
      'Build a Fuse index over the given PDF URLs and return ranked snippets for the query.',
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
      const cacheDir = args.cacheDir as string | undefined;
      const rows = await indexPdfs(urls, cacheDir ? { cacheDir } : {});
      // Lazy-load Fuse — only search_pdfs needs it.
      const { default: Fuse } = await import('fuse.js');
      const fuse = new Fuse(rows, {
        keys: ['title', 'text'],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true,
      });
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
      const cacheDir = (args.cacheDir as string | undefined) ?? '.pdf-cache';
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
      const cacheDir = (args.cacheDir as string | undefined) ?? '.pdf-cache';
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  void server.connect(transport);
}
