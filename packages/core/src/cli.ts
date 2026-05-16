#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { indexPdfs, extractPdfText, extractPdfsFromBody, safeJSONForHTML } from './index.js';
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
  out?: string;
}

interface CacheSubOpts {
  cacheDir: string;
}

// Subcommand options are silently shadowed by the same-named root option in
// commander, so `verify --cache-dir <x>` and `cache ls --cache-dir <x>` would
// otherwise always see the root default. Use `optsWithGlobals()` to merge the
// effective cache-dir from both scopes (local wins when explicitly set).
function resolveCacheDir(cmd: Command): string {
  const merged = cmd.optsWithGlobals() as { cacheDir?: string };
  return merged.cacheDir ?? '.pdf-cache';
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
  .option('--out <file>', 'write JSON output to <file> instead of stdout')
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
    await emit(rows, opts);
  });

program
  .command('verify <url>')
  .description('Parse a single PDF and report pages + chars; exit 1 on failure')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (url: string, _opts: CacheSubOpts, cmd: Command) => {
    const text = await extractPdfText(url, { cacheDir: resolveCacheDir(cmd) });
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
    const { default: Fuse } = await import('fuse.js');
    const { DEFAULT_FUSE_OPTIONS } = await import('./fuse.js');
    const fuse = new Fuse(rows, DEFAULT_FUSE_OPTIONS);
    const results = fuse.search(query);
    if (!results.length) {
      console.log(`No matches for "${query}".`);
      return;
    }
    for (const r of results) {
      const html = snippetHTMLFor(r);
      console.log(`  ${r.item.title} (${r.item.url})`);
      console.log(`    ${html}`);
    }
  });

const cache = program.command('cache').description('Manage the PDF text cache');

cache
  .command('ls')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (_opts: CacheSubOpts, cmd: Command) => {
    const cacheDir = resolveCacheDir(cmd);
    const entries = await listCache(cacheDir);
    for (const e of entries) {
      console.log(`${e.url}\t${e.length}\t${e.pages ?? '-'}\t${e.extractedAt}`);
    }
  });

cache
  .command('rm <url>')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (url: string, _opts: CacheSubOpts, cmd: Command) => {
    const cacheDir = resolveCacheDir(cmd);
    await removeCache(cacheDir, url);
    console.log(`Removed ${url}`);
  });

cache
  .command('clear')
  .option('--cache-dir <dir>', 'cache directory', '.pdf-cache')
  .action(async (_opts: CacheSubOpts, cmd: Command) => {
    const cacheDir = resolveCacheDir(cmd);
    await clearCache(cacheDir);
    console.log(`Cleared ${cacheDir}`);
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
    urls.push(...(await urlsFromSitemap(opts.fromSitemap, { concurrency: opts.concurrency })));
  }
  return urls;
}

async function urlsFromSitemap(
  sitemapUrl: string,
  opts: { concurrency: number },
): Promise<string[]> {
  const res = await fetch(sitemapUrl);
  if (!res.ok) return [];
  const xml = await res.text();

  const pageUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const pdfDirect = pageUrls.filter((u) => u.endsWith('.pdf'));
  const pageOnly = pageUrls.filter((u) => !u.endsWith('.pdf'));

  // Use the same p-limit primitive the core extractor uses, so --concurrency
  // controls both the sitemap page fan-out AND the PDF fetch fan-out.
  const { createLimiter } = await import('./concurrency.js');
  const limit = createLimiter(opts.concurrency);

  const fromPages = await Promise.all(
    pageOnly.map((page) =>
      limit(async () => {
        try {
          const pageRes = await fetch(page);
          if (!pageRes.ok) return [];
          const html = await pageRes.text();
          const rows = await extractPdfsFromBody(html);
          return rows.map((r) => r.url);
        } catch {
          return [];
        }
      }),
    ),
  );

  return [...new Set([...pdfDirect, ...fromPages.flat()])];
}

async function emit(rows: IndexedPdf[], opts: RootOptions): Promise<void> {
  let output: string;
  if (opts.text) {
    output = rows.map((r) => r.text).join('\n');
  } else if (opts.ndjson) {
    output = rows.map((r) => JSON.stringify(r)).join('\n');
  } else if (opts.out) {
    // File output is the most common path-of-attack into a static site
    // (the JSON gets inlined into HTML). Use the HTML-safe serializer so
    // PDF text containing `</script>` can't break out of a surrounding
    // `<script type="application/json">...</script>` embedding.
    output = safeJSONForHTML(rows, 2);
  } else {
    output = JSON.stringify(rows, null, 2);
  }

  if (opts.out) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(opts.out, output, 'utf-8');
  } else {
    console.log(output);
  }
}

program.parseAsync(process.argv);
