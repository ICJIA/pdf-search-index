#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { indexPdfs, extractPdfText, extractPdfsFromBody } from './index.js';
import { clearCache, listCache, removeCache } from './cache.js';
import type { IndexedPdf } from './types.js';
import { snippetHTMLFor } from './snippet.js';

interface RootOptions {
  from?: string;
  fromSitemap?: string;
  cacheDir: string;
  concurrency: number;
  strict?: boolean;
  refresh?: boolean;
  refreshAll?: boolean;
  ndjson?: boolean;
  text?: boolean;
}

interface CacheSubOpts {
  cacheDir: string;
}

const program = new Command();

program
  .name('pdf-search-index')
  .description('Build-time PDF text indexer for Fuse-backed static sites')
  .option('--from <file>', 'read URLs from a newline-delimited file')
  .option('--from-sitemap <url>', 'scan a sitemap, index every linked PDF')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .option('--concurrency <n>', 'fetch concurrency', (v) => parseInt(v, 10), 4)
  .option('--strict', 'exit 1 on any extraction failure', false)
  .option('--refresh', 'refetch (do not write cache)', false)
  .option('--refresh-all', 'refetch and overwrite cache', false)
  .option('--ndjson', 'emit newline-delimited JSON', false)
  .option('--text', 'emit plain text only', false)
  .argument('[urls...]', 'PDF URLs')
  .action(async (urls: string[], opts: RootOptions) => {
    const collected = await collectUrls(urls, opts);
    if (!collected.length) {
      console.error('No URLs given.');
      process.exit(1);
    }
    const cacheMode = opts.refreshAll ? 'refresh' : opts.refresh ? 'bypass' : 'use';
    const rows = await indexPdfs(collected, {
      cacheDir: opts.cacheDir,
      concurrency: opts.concurrency,
      cache: cacheMode,
    });
    if (opts.strict && rows.some((r) => r.text === '')) {
      console.error('Strict mode: one or more PDFs failed to extract.');
      process.exit(1);
    }
    emit(rows, opts);
  });

program
  .command('verify <url>')
  .description('Parse a single PDF and report pages + chars; exit 1 on failure')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (url: string, opts: CacheSubOpts) => {
    const text = await extractPdfText(url, { cacheDir: opts.cacheDir });
    if (!text) {
      console.error(`Failed to extract ${url}`);
      process.exit(1);
    }
    console.log(`OK ${url} chars=${text.length}`);
  });

program
  .command('search <indexFile> <query>')
  .description('Search a previously built index JSON for a query and print snippets')
  .action(async (indexFile: string, query: string) => {
    const raw = await readFile(indexFile, 'utf-8');
    const rows = JSON.parse(raw) as IndexedPdf[];
    // Lazy-load Fuse — only `search` needs it.
    const { default: Fuse } = await import('fuse.js');
    const fuse = new Fuse(rows, {
      keys: ['title', 'text'],
      threshold: 0.3,
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeMatches: true,
    });
    const results = fuse.search(query);
    if (!results.length) {
      console.log(`No matches for "${query}".`);
      return;
    }
    for (const r of results) {
      const html = snippetHTMLFor(r as unknown as Parameters<typeof snippetHTMLFor>[0]);
      console.log(`  ${r.item.title} (${r.item.url})`);
      console.log(`    ${html}`);
    }
  });

const cache = program.command('cache').description('Manage the PDF text cache');

cache
  .command('ls')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (opts: CacheSubOpts) => {
    const entries = await listCache(opts.cacheDir);
    for (const e of entries) {
      console.log(`${e.url}\t${e.length}\t${e.pages ?? '-'}\t${e.extractedAt}`);
    }
  });

cache
  .command('rm <url>')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (url: string, opts: CacheSubOpts) => {
    await removeCache(opts.cacheDir, url);
    console.log(`Removed ${url}`);
  });

cache
  .command('clear')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (opts: CacheSubOpts) => {
    await clearCache(opts.cacheDir);
    console.log(`Cleared ${opts.cacheDir}`);
  });

async function collectUrls(positional: string[], opts: RootOptions): Promise<string[]> {
  const urls = [...positional];
  if (typeof opts.from === 'string') {
    const raw = await readFile(opts.from, 'utf-8');
    urls.push(
      ...raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')),
    );
  }
  if (typeof opts.fromSitemap === 'string') {
    urls.push(...(await urlsFromSitemap(opts.fromSitemap)));
  }
  return urls;
}

async function urlsFromSitemap(sitemapUrl: string): Promise<string[]> {
  const res = await fetch(sitemapUrl);
  if (!res.ok) return [];
  const xml = await res.text();
  const pageUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const pdfs: string[] = [];
  for (const page of pageUrls) {
    if (page.endsWith('.pdf')) {
      pdfs.push(page);
      continue;
    }
    try {
      const pageRes = await fetch(page);
      if (!pageRes.ok) continue;
      const html = await pageRes.text();
      const rows = await extractPdfsFromBody(html);
      pdfs.push(...rows.map((r) => r.url));
    } catch {
      // skip
    }
  }
  return [...new Set(pdfs)];
}

function emit(rows: IndexedPdf[], opts: RootOptions): void {
  if (opts.text) {
    for (const r of rows) console.log(r.text);
    return;
  }
  if (opts.ndjson) {
    for (const r of rows) console.log(JSON.stringify(r));
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
}

program.parseAsync(process.argv);
