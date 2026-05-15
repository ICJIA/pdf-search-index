# PDF Search Index — Plan 2 (Cleanup + Adapters) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two new packages — `@icjia/astro-pdf-search-index@0.1.0` and `@icjia/nuxt-pdf-search-index@0.1.0` — after first cleaning up the four reviewer-flagged items from Plan 1. The end state has three fully-tested, publishable packages. Plan 3 (separate document, written after Plan 2 lands) adds the seven framework examples + detailed top-level README + canonical v1.0.0 release across all three packages.

**Architecture:** The Astro integration is a thin Astro `AstroIntegration` that hooks into the `astro:build:setup` lifecycle, walks configured content collections, calls `extractPdfsFromBody` on each entry's body, and emits a static JSON endpoint at a configurable path. The Nuxt 4 module is a `defineNuxtModule` build that registers two server-side helpers (`extractPdfsFromCmsBody`, `extractPdfsFromContentDoc`) plus a shared Nitro server-route template the consumer site can adapt. Both adapters wrap `@icjia/pdf-search-index@0.1.0` as a runtime dependency; nothing PDF-specific is reimplemented.

**Tech Stack:**
- Astro: `astro@^5.0.0` (peer), `@types/astro` types
- Nuxt 4: `@nuxt/kit@^4.0.0` (peer), `nuxt@^4.0.0` for fixture tests
- Shared: TypeScript ESM, tsup/unbuild for builds, vitest for tests, the pre-existing pnpm/changesets/oxlint/prettier toolchain

**Prerequisites:** Plan 1 is complete at commit `91c2260` on branch `feat/v1-foundation`, with tag `@icjia/pdf-search-index@0.1.0` pushed to GitHub. This plan starts a new branch `feat/v1-adapters` off `feat/v1-foundation`.

---

## Task 1: Plan 1 cleanup batch — title fallback + DRY + --out + sitemap concurrency + MCP polish

Bundles the small reviewer-flagged items so we don't litter the history with one-line fixes:

- **I1** (bare-URL title fallback in `extractPdfsFromBody`)
- **DRY** `DEFAULT_FUSE_OPTIONS` across `fuse.ts`, `cli.ts`, `mcp.ts`
- **--out** flag on the CLI's root command
- **Sitemap polish**: thread `concurrency` and `fetchTimeout` into `urlsFromSitemap`
- **MCP M2**: replace truthy `concurrency` check with `!== undefined`
- **MCP M3**: use `pathToFileURL(process.argv[1]).href` for Windows-portable stdio entry detection
- **M7**: have `extractPdfMetadata` consult the cache first (avoid double-fetch when paired with `extractPdfText`)

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/url-scan.ts`
- Modify: `packages/core/src/extractor.ts`
- Modify: `packages/core/src/fuse.ts`
- Modify: `packages/core/src/cli.ts`
- Modify: `packages/core/src/mcp.ts`
- Modify: `packages/core/test/url-scan.test.ts`
- Modify: `packages/core/test/index.test.ts`

- [ ] **Step 1: Branch off `feat/v1-foundation`**

```bash
git checkout feat/v1-foundation
git checkout -b feat/v1-adapters
```

- [ ] **Step 2: Fix the bare-URL title fallback (I1)**

The bug: `extractPdfUrlsFromMarkdown` already populates `title` for bare URLs with the humanized filename, so by the time `buildRow` runs in `extractPdfsFromBody`, `entry.title` is always defined for bare URLs, which skips the info-dict title step. Fix in `url-scan.ts`: give bare URLs `title: undefined` (let `buildRow` fill it in).

Modify `packages/core/src/url-scan.ts` — replace the `extractPdfUrlsFromMarkdown` function body to leave bare-URL titles empty:

```ts
export function extractPdfUrlsFromMarkdown(body: string): DiscoveredPdf[] {
  if (!body) return [];

  // Pass 1: linked PDFs win; capture the link text as title.
  const linked = new Map<string, string>();
  for (const m of body.matchAll(PDF_LINK_PATTERN)) {
    const title = (m[1] ?? '').trim();
    const url = m[2];
    if (url && title && !linked.has(url)) {
      linked.set(url, title);
    }
  }

  // Pass 2: bare URLs not already captured. Leave title undefined so
  // `buildRow` consults the pdf.js info-dict before falling back to the
  // humanized filename.
  const bare = new Set<string>();
  for (const m of body.matchAll(PDF_BARE_URL_PATTERN)) {
    const url = m[0];
    if (!linked.has(url)) bare.add(url);
  }

  const linkedEntries: DiscoveredPdf[] = [...linked.entries()].map(([url, title]) => ({
    url,
    title,
  }));

  const bareEntries: DiscoveredPdf[] = [...bare].map((url) => ({
    url,
    title: '', // intentional: triggers info-dict fallback in buildRow
  }));

  return [...linkedEntries, ...bareEntries];
}
```

- [ ] **Step 3: Update `extractPdfsFromBody` to drop empty titles before indexing**

In `packages/core/src/index.ts`, change the `extractPdfsFromBody` function to NOT pass through empty titles:

```ts
export async function extractPdfsFromBody(
  body: string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  if (!body) return [];
  const discovered = extractPdfUrlsFromMarkdown(body);
  return indexPdfs(
    discovered.map((d) => (d.title ? { url: d.url, title: d.title } : { url: d.url })),
    options,
  );
}
```

This way, linked URLs flow through with `title` set (so `buildRow` skips the fallback chain), and bare URLs flow through with `title` omitted (so `buildRow` reaches `result.infoTitle ?? titleFromUrl(url)`).

- [ ] **Step 4: Add a test for the bare-URL fallback**

In `packages/core/test/index.test.ts`, append a new test inside the existing `describe('extractPdfsFromBody', ...)` block (before the closing `});`):

```ts
  it('falls back through info-dict for bare URLs (no markdown link text)', async () => {
    const body = `Here is a bare PDF: https://example.com/r3-faq-2024.pdf`;
    const rows = await extractPdfsFromBody(body, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/r3-faq-2024.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
    // Fixture PDFs have no info-dict Title, so we fall through to the
    // humanized filename, exactly as before. Test value: the buildRow
    // fallback chain runs (would skip if title were pre-filled by url-scan).
    expect(rows[0]!.title).toBe('R3 Faq 2024');
  });
```

The fixture PDFs from Task 2 of Plan 1 don't set an info-dict Title, so the test only verifies that the chain runs end-to-end. (Task 2 of THIS plan will add a fixture WITH an info-dict Title and a more pointed test.)

- [ ] **Step 5: Update the url-scan test to reflect the new bare-title contract**

In `packages/core/test/url-scan.test.ts`, update the "finds bare PDF URLs" test:

```ts
  it('finds bare PDF URLs (title left blank for buildRow info-dict fallback)', () => {
    const body = `https://example.com/r3-faq-2024.pdf is available.`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/r3-faq-2024.pdf', title: '' },
    ]);
  });
```

- [ ] **Step 6: Run the modified tests, confirm pass**

Run: `pnpm --filter @icjia/pdf-search-index test test/url-scan.test.ts test/index.test.ts`
Expected: all url-scan tests pass, all index tests pass (including the new bare-URL fallback test).

- [ ] **Step 7: DRY the Fuse default options**

In `packages/core/src/fuse.ts`, EXPORT the `DEFAULT_FUSE_OPTIONS` constant so the CLI and MCP server can import it:

```ts
import Fuse, { type IFuseOptions } from 'fuse.js';
import { indexPdfs } from './index.js';
import type { IndexPdfsOptions, IndexedPdf, UrlOrEntry } from './types.js';

export interface CreateFuseOptions extends IndexPdfsOptions {
  urls: UrlOrEntry[];
  fuseOptions?: IFuseOptions<IndexedPdf>;
}

// Exported so CLI search subcommand and MCP search_pdfs tool can use the
// same canonical Fuse config. Don't drift these across call sites.
export const DEFAULT_FUSE_OPTIONS: IFuseOptions<IndexedPdf> = {
  keys: ['title', 'text'],
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
};

export async function createFuseIndex(opts: CreateFuseOptions): Promise<Fuse<IndexedPdf>> {
  const { urls, fuseOptions, ...indexOpts } = opts;
  const rows = await indexPdfs(urls, indexOpts);
  return new Fuse(rows, { ...DEFAULT_FUSE_OPTIONS, ...fuseOptions });
}
```

- [ ] **Step 8: Update CLI to import the shared defaults**

In `packages/core/src/cli.ts`, replace the inline Fuse config inside the `search` subcommand action:

```ts
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
```

- [ ] **Step 9: Update MCP to import the shared defaults**

In `packages/core/src/mcp.ts`, replace the inline Fuse config inside the `search_pdfs` handler:

```ts
    handler: async (args) => {
      const urls = args.urls as string[];
      const query = args.query as string;
      const cacheDir = args.cacheDir as string | undefined;
      const rows = await indexPdfs(urls, cacheDir ? { cacheDir } : {});
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
```

- [ ] **Step 10: Add `--out <file>` flag to the root CLI command**

In `packages/core/src/cli.ts`:

Add the option declaration in the root `program` chain (after `--text`):

```ts
  .option('--out <file>', 'write JSON output to <file> instead of stdout')
```

Extend `RootOptions`:

```ts
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
```

Update the `emit` function to accept the option:

```ts
async function emit(rows: IndexedPdf[], opts: RootOptions): Promise<void> {
  let output: string;
  if (opts.text) {
    output = rows.map((r) => r.text).join('\n');
  } else if (opts.ndjson) {
    output = rows.map((r) => JSON.stringify(r)).join('\n');
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
```

And update the call site in the root action:

```ts
    await emit(rows, opts);
```

- [ ] **Step 11: Add concurrency and timeout to `urlsFromSitemap`**

In `packages/core/src/cli.ts`, replace the `urlsFromSitemap` function:

```ts
async function urlsFromSitemap(
  sitemapUrl: string,
  opts: { concurrency: number; fetchTimeout?: number },
): Promise<string[]> {
  const controller = new AbortController();
  const timer = opts.fetchTimeout
    ? setTimeout(() => controller.abort(), opts.fetchTimeout)
    : null;
  let xml: string;
  try {
    const res = await fetch(sitemapUrl, { signal: controller.signal });
    if (!res.ok) return [];
    xml = await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }

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
```

And update the caller in `collectUrls`:

```ts
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
```

- [ ] **Step 12: Polish MCP `concurrency` check + Windows-portable stdio gate**

In `packages/core/src/mcp.ts`, update the `index_pdfs` handler:

```ts
    handler: async (args) => {
      const urls = args.urls as string[];
      const cacheDir = args.cacheDir as string | undefined;
      const concurrency = args.concurrency as number | undefined;
      const rows = await indexPdfs(urls, {
        ...(cacheDir ? { cacheDir } : {}),
        ...(concurrency !== undefined ? { concurrency } : {}),
      });
      return JSON.stringify(rows, null, 2);
    },
```

Replace the stdio entry-point check at the bottom of the file:

```ts
import { pathToFileURL } from 'node:url';

// ... (everything else unchanged)

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  void server.connect(transport);
}
```

The `import { pathToFileURL }` goes at the top of the file with the other imports.

- [ ] **Step 13: Have `extractPdfMetadata` consult the cache (M7)**

In `packages/core/src/extractor.ts`, replace `extractPdfMetadata` with a version that hits the cache first:

```ts
export async function extractPdfMetadata(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractedMetadata> {
  const o = resolveOptions(options);
  // Cache hit: derive what we can from the sidecar without re-fetching.
  // (info-dict title isn't in the cache today, so it returns undefined here.
  // That's acceptable: callers that need info-dict title use
  // extractPdfTextWithSource which extracts fresh.)
  if (o.cache === 'use') {
    const hit = await readCache(o.cacheDir, url);
    if (hit) {
      return hit.meta.pages !== undefined ? { pages: hit.meta.pages } : { pages: 0 };
    }
  }
  const bytes = await fetchPdfBytes(url, o);
  if (!bytes) return { pages: 0 };
  const parsed = await parsePdf(bytes, o.mergePages);
  if (!parsed) return { pages: 0 };
  return {
    pages: parsed.pages,
    ...(parsed.infoTitle !== undefined ? { infoTitle: parsed.infoTitle } : {}),
  };
}
```

- [ ] **Step 14: Run the full test suite + checks**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`
Expected: 58+ tests pass (Plan 1's 57 + the new bare-URL fallback test), all checks clean, build produces five dist bundles.

If a previously passing test breaks because of the Fuse-default DRY change or one of the cli/mcp refactors, fix and re-run.

- [ ] **Step 15: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/url-scan.ts \
  packages/core/src/extractor.ts packages/core/src/fuse.ts \
  packages/core/src/cli.ts packages/core/src/mcp.ts \
  packages/core/test/url-scan.test.ts packages/core/test/index.test.ts
git commit -m "fix(core): bare-URL title fallback, DRY Fuse defaults, --out, sitemap concurrency, MCP polish"
```

---

## Task 2: Plan 1 coverage gaps — encrypted-PDF mock + CLI sitemap/cache/output-mode tests

Closes the I2 and I3 reviewer gaps.

**Files:**
- Modify: `packages/core/test/fixtures/generate.ts` (add an info-dict-title fixture)
- Create: `packages/core/test/extractor-encrypted.test.ts`
- Modify: `packages/core/test/cli.test.ts` (add coverage for --from-sitemap, cache subcommands, --ndjson, --text, --refresh, --out)
- Modify: `packages/core/test/url-scan.test.ts` (small backfill — info-dict title path)

- [ ] **Step 1: Extend the fixture generator to add an info-dict-title PDF**

In `packages/core/test/fixtures/generate.ts`, add a fourth fixture inside `main()`:

```ts
  // titled.pdf — has an info-dict Title set, used to exercise the
  // info-dict title fallback in url-scan/extractor tests.
  {
    const doc = await PDFDocument.create();
    doc.setTitle('Fixture Info-Dict Title');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([300, 200]);
    page.drawText('body content', { x: 20, y: 100, font, size: 14 });
    writeFileSync(join(here, 'titled.pdf'), await doc.save());
  }
```

Update the trailing log:

```ts
  console.log(
    'Generated fixtures: small-text.pdf, multi-page.pdf, image-only.pdf, titled.pdf',
  );
```

Regenerate: `pnpm --filter @icjia/pdf-search-index fixtures`
Expected: four `.pdf` files in `packages/core/test/fixtures/`.

- [ ] **Step 2: Add an info-dict title test in `index.test.ts`**

Append to the existing `describe('extractPdfsFromBody', ...)` block:

```ts
  it('uses pdf.js info-dict Title for bare URLs when present', async () => {
    const body = `Document: https://example.com/r3-titled.pdf`;
    const rows = await extractPdfsFromBody(body, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/r3-titled.pdf': 'titled.pdf' }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Fixture Info-Dict Title');
  });
```

- [ ] **Step 3: Create the encrypted-PDF mock test**

`packages/core/test/extractor-encrypted.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `pdf-search-encrypted-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('encrypted PDF handling', () => {
  it('returns empty text and logs a warning when unpdf throws a PasswordException-like error', async () => {
    // Mock unpdf to simulate a password-protected PDF parse failure.
    vi.mock('unpdf', () => ({
      getDocumentProxy: async () => {
        throw new Error('PasswordException: No password given');
      },
      extractText: async () => ({ text: '', totalPages: 0 }),
    }));

    const { extractPdfText } = await import('../src/extractor.js');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchOk = (async () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]))) as unknown as typeof fetch;

    const text = await extractPdfText('https://example.com/locked.pdf', {
      cacheDir,
      fetch: fetchOk,
    });

    expect(text).toBe('');
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/PasswordException/);
  });
});
```

- [ ] **Step 4: Run the new tests**

Run: `pnpm --filter @icjia/pdf-search-index test test/extractor-encrypted.test.ts test/index.test.ts`
Expected: both files pass.

- [ ] **Step 5: Add CLI coverage — --from-sitemap, cache subcommands, --ndjson, --text, --refresh, --out**

In `packages/core/test/cli.test.ts`, add a new sitemap server in `beforeEach`. Modify the existing fixture HTTP server logic to also respond to `/sitemap.xml` with a generated sitemap and `/page-with-pdf` with HTML containing a bare PDF URL. Insert these handlers BEFORE the catchall `try` block:

```ts
  server = createServer(async (req, res) => {
    const url = req.url ?? '/';

    if (url === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://127.0.0.1:${(server.address() as { port: number }).port}/small-text.pdf</loc></url>
  <url><loc>http://127.0.0.1:${(server.address() as { port: number }).port}/page-with-pdf</loc></url>
</urlset>`,
      );
      return;
    }

    if (url === '/page-with-pdf') {
      const p = (server.address() as { port: number }).port;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        `<html><body>See http://127.0.0.1:${p}/multi-page.pdf for details.</body></html>`,
      );
      return;
    }

    const filename = url.replace('/', '');
    try {
      const buf = await readFile(join(fixturesDir, filename));
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(buf);
    } catch {
      res.writeHead(404).end();
    }
  });
```

Then append new `describe` blocks at the bottom of the file (before final closing braces):

```ts
describe('CLI: --from-sitemap', () => {
  it('extracts PDFs from a sitemap and its linked pages', async () => {
    const { stdout, code } = await runCli(['--from-sitemap', `${baseUrl}/sitemap.xml`], tmp);
    expect(code).toBe(0);
    const rows = JSON.parse(stdout) as Array<{ url: string }>;
    // small-text.pdf (direct loc) + multi-page.pdf (from page-with-pdf body)
    expect(rows.map((r) => r.url).sort()).toEqual([
      `${baseUrl}/multi-page.pdf`,
      `${baseUrl}/small-text.pdf`,
    ]);
  });
});

describe('CLI: --out <file>', () => {
  it('writes JSON to the file instead of stdout', async () => {
    const outFile = join(tmp, 'index.json');
    const { stdout, code } = await runCli([`${baseUrl}/small-text.pdf`, '--out', outFile], tmp);
    expect(code).toBe(0);
    expect(stdout).toBe('');
    const written = await readFile(outFile, 'utf-8');
    const rows = JSON.parse(written) as Array<{ url: string }>;
    expect(rows).toHaveLength(1);
  });
});

describe('CLI: --ndjson', () => {
  it('emits one JSON object per line', async () => {
    const { stdout, code } = await runCli(
      [`${baseUrl}/small-text.pdf`, `${baseUrl}/multi-page.pdf`, '--ndjson'],
      tmp,
    );
    expect(code).toBe(0);
    const lines = stdout.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('CLI: --text', () => {
  it('emits plain text bodies', async () => {
    const { stdout, code } = await runCli([`${baseUrl}/small-text.pdf`, '--text'], tmp);
    expect(code).toBe(0);
    expect(stdout.toLowerCase()).toContain('applicant portal');
    // Should NOT be JSON
    expect(() => JSON.parse(stdout)).toThrow();
  });
});

describe('CLI: --refresh modes', () => {
  it('--refresh bypasses cache reads', async () => {
    // Prime cache
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    // Refresh — should still fetch (we can't directly assert without instrumentation;
    // verify exit 0 + correct output)
    const { code, stdout } = await runCli(
      [`${baseUrl}/small-text.pdf`, '--cache-dir', tmp, '--refresh'],
      tmp,
    );
    expect(code).toBe(0);
    const rows = JSON.parse(stdout) as Array<{ url: string }>;
    expect(rows).toHaveLength(1);
  });
});

describe('CLI: cache subcommands', () => {
  it('cache ls returns lines for cached entries', async () => {
    // Prime cache
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    const { stdout, code } = await runCli(['cache', 'ls', '--cache-dir', tmp], tmp);
    expect(code).toBe(0);
    expect(stdout).toContain(`${baseUrl}/small-text.pdf`);
  });

  it('cache rm removes a single URL', async () => {
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    const rm = await runCli(['cache', 'rm', `${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    expect(rm.code).toBe(0);
    const ls = await runCli(['cache', 'ls', '--cache-dir', tmp], tmp);
    expect(ls.stdout.trim()).toBe('');
  });

  it('cache clear empties everything', async () => {
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    await runCli([`${baseUrl}/multi-page.pdf`, '--cache-dir', tmp], tmp);
    const clear = await runCli(['cache', 'clear', '--cache-dir', tmp], tmp);
    expect(clear.code).toBe(0);
    const ls = await runCli(['cache', 'ls', '--cache-dir', tmp], tmp);
    expect(ls.stdout.trim()).toBe('');
  });
});
```

- [ ] **Step 6: Rebuild and run the full CLI test file**

Run: `pnpm --filter @icjia/pdf-search-index build && pnpm --filter @icjia/pdf-search-index test test/cli.test.ts`
Expected: all CLI tests pass — both the original 7 and the 8 new ones (15 total).

- [ ] **Step 7: Full suite + checks**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: ~67 tests pass (Plan 1's 57 + Task 1's 1 new + this task's 9 new = 67), all checks clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/test/fixtures/generate.ts \
  packages/core/test/extractor-encrypted.test.ts \
  packages/core/test/cli.test.ts \
  packages/core/test/index.test.ts
git commit -m "test(core): encrypted-PDF mock + CLI sitemap/cache/output-mode coverage + info-dict title fixture"
```

---

## Task 3: `@icjia/astro-pdf-search-index` package

**Files (all new):**
- `packages/astro-pdf-search-index/package.json`
- `packages/astro-pdf-search-index/tsconfig.json`
- `packages/astro-pdf-search-index/tsup.config.ts`
- `packages/astro-pdf-search-index/vitest.config.ts`
- `packages/astro-pdf-search-index/src/index.ts`
- `packages/astro-pdf-search-index/test/integration.test.ts`
- `packages/astro-pdf-search-index/test/fixture-project/astro.config.mjs`
- `packages/astro-pdf-search-index/test/fixture-project/src/content/config.ts`
- `packages/astro-pdf-search-index/test/fixture-project/src/content/resources/example.md`
- `packages/astro-pdf-search-index/test/fixture-project/package.json`
- `packages/astro-pdf-search-index/README.md`

- [ ] **Step 1: Create `packages/astro-pdf-search-index/package.json`**

```json
{
  "name": "@icjia/astro-pdf-search-index",
  "version": "0.0.0",
  "description": "Astro integration for @icjia/pdf-search-index — adds linked PDFs as first-class search rows.",
  "type": "module",
  "license": "MIT",
  "author": "ICJIA",
  "repository": {
    "type": "git",
    "url": "https://github.com/ICJIA/pdf-search-index.git",
    "directory": "packages/astro-pdf-search-index"
  },
  "keywords": ["astro", "astro-integration", "pdf", "search", "fuse"],
  "engines": { "node": ">=20" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@icjia/pdf-search-index": "workspace:*"
  },
  "peerDependencies": {
    "astro": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "astro": "^5.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/astro-pdf-search-index/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/astro-pdf-search-index/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: ['astro', 'astro:content'],
});
```

- [ ] **Step 4: Create `packages/astro-pdf-search-index/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
```

- [ ] **Step 5: Create the integration in `packages/astro-pdf-search-index/src/index.ts`**

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';
import type { IndexedPdf, IndexPdfsOptions } from '@icjia/pdf-search-index';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface PdfSearchIntegrationOptions {
  /**
   * Names of Astro content collections to scan for PDF links in entry bodies.
   * Each entry's `body` (the raw markdown source) is passed to
   * `extractPdfsFromBody`. Default: scans no collections (consumer must specify).
   */
  collections: string[];

  /**
   * Output path relative to the project's public/ directory. Default:
   * `searchIndex.pdfs.json` → produces `public/searchIndex.pdfs.json` at build.
   */
  endpoint?: string;

  /**
   * Cache directory passed to extractPdfsFromBody. Default: `.astro/.pdf-cache`.
   */
  cacheDir?: string;

  /**
   * Concurrency passed to extractPdfsFromBody. Default: 4.
   */
  concurrency?: number;

  /**
   * Where to look up the source markdown for each entry. Default: `'content'`,
   * which means Astro's content collection root (`src/content/<collection>/...`).
   * Tests may override to point at a fixture path.
   */
  contentSourceDir?: string;
}

interface AstroIntegrationLike {
  name: string;
  hooks: {
    'astro:build:setup'?: (opts: { config: { srcDir: { pathname: string }; publicDir: { pathname: string } } }) => Promise<void> | void;
    'astro:build:done'?: (opts: { dir: { pathname: string } }) => Promise<void> | void;
  };
}

export default function pdfSearchIntegration(
  options: PdfSearchIntegrationOptions,
): AstroIntegrationLike {
  const endpoint = options.endpoint ?? 'searchIndex.pdfs.json';
  const cacheDir = options.cacheDir ?? '.astro/.pdf-cache';
  const concurrency = options.concurrency ?? 4;
  const contentSourceDir = options.contentSourceDir ?? 'content';

  return {
    name: '@icjia/astro-pdf-search-index',
    hooks: {
      'astro:build:setup': async (ctx) => {
        const srcDir = ctx.config.srcDir.pathname;
        const publicDir = ctx.config.publicDir.pathname;

        // Walk each configured collection, extract PDF rows from every entry's body.
        const allRows: IndexedPdf[] = [];
        const seen = new Set<string>();

        for (const collection of options.collections) {
          const collectionDir = resolve(srcDir, contentSourceDir, collection);
          const entries = await readMarkdownEntries(collectionDir);
          const baseOpts: IndexPdfsOptions = { cacheDir, concurrency };

          for (const { body } of entries) {
            const rows = await extractPdfsFromBody(body, baseOpts);
            for (const row of rows) {
              if (!seen.has(row.id)) {
                seen.add(row.id);
                allRows.push(row);
              }
            }
          }
        }

        // Emit to public/<endpoint> so Astro copies it into dist/ as static output.
        const outPath = join(publicDir, endpoint);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, JSON.stringify(allRows, null, 2), 'utf-8');
      },
    },
  };
}

/**
 * Minimal markdown-entry reader. Walks a directory recursively for `.md`/`.mdx`
 * files and returns each one's raw body. We deliberately don't try to parse
 * frontmatter here — `extractPdfsFromBody` only needs the body string.
 */
async function readMarkdownEntries(
  dir: string,
): Promise<Array<{ path: string; body: string }>> {
  const { readdir, readFile, stat } = await import('node:fs/promises');
  const out: Array<{ path: string; body: string }> = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    const st = await stat(full);
    if (st.isDirectory()) {
      out.push(...(await readMarkdownEntries(full)));
    } else if (e.endsWith('.md') || e.endsWith('.mdx')) {
      const raw = await readFile(full, 'utf-8');
      // Strip frontmatter if present (between leading `---` lines).
      const body = stripFrontmatter(raw);
      out.push({ path: full, body });
    }
  }
  return out;
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  return raw.slice(end + 4).trimStart();
}
```

- [ ] **Step 6: Create the fixture Astro project skeleton**

`packages/astro-pdf-search-index/test/fixture-project/package.json`:

```json
{
  "name": "astro-pdf-search-fixture",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "dependencies": {
    "astro": "^5.0.0"
  }
}
```

`packages/astro-pdf-search-index/test/fixture-project/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  // The test imports our integration directly — no need to configure here.
});
```

`packages/astro-pdf-search-index/test/fixture-project/src/content/config.ts`:

```ts
import { defineCollection, z } from 'astro:content';

export const collections = {
  resources: defineCollection({
    schema: z.object({
      title: z.string(),
    }),
  }),
};
```

`packages/astro-pdf-search-index/test/fixture-project/src/content/resources/example.md`:

```md
---
title: Example Resource
---

This page links to a PDF: [Annual Report](TEST_PDF_URL)
```

The `TEST_PDF_URL` placeholder will be substituted in the test before invoking the integration.

- [ ] **Step 7: Write the integration test**

`packages/astro-pdf-search-index/test/integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import pdfSearchIntegration from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureProjectSrc = join(here, 'fixture-project');
const corePdfFixtures = resolve(here, '../../core/test/fixtures');

let workDir: string;
let pdfServer: Server;
let baseUrl: string;

beforeEach(async () => {
  workDir = join(tmpdir(), `astro-pdf-search-${Date.now()}-${Math.random()}`);
  await mkdir(workDir, { recursive: true });
  await cp(fixtureProjectSrc, workDir, { recursive: true });

  pdfServer = createServer(async (req, res) => {
    const filename = (req.url ?? '/').replace('/', '');
    try {
      const buf = await readFile(join(corePdfFixtures, filename));
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

  // Substitute the placeholder PDF URL in the fixture markdown.
  const mdPath = join(workDir, 'src/content/resources/example.md');
  const md = await readFile(mdPath, 'utf-8');
  await writeFile(mdPath, md.replace('TEST_PDF_URL', `${baseUrl}/small-text.pdf`));

  // Ensure public/ exists (the integration writes the JSON there).
  await mkdir(join(workDir, 'public'), { recursive: true });
});

afterEach(async () => {
  await new Promise<void>((r) => pdfServer.close(() => r()));
  await rm(workDir, { recursive: true, force: true });
});

describe('astro integration: build hook', () => {
  it('walks configured collections and emits a JSON index to public/', async () => {
    const integration = pdfSearchIntegration({
      collections: ['resources'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: join(workDir, '.astro/.pdf-cache'),
    });

    await integration.hooks['astro:build:setup']!({
      config: {
        srcDir: { pathname: join(workDir, 'src/') },
        publicDir: { pathname: join(workDir, 'public/') },
      },
    });

    const raw = await readFile(join(workDir, 'public/searchIndex.pdfs.json'), 'utf-8');
    const rows = JSON.parse(raw) as Array<{ url: string; title: string; text: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Annual Report');
    expect(rows[0]!.text.toLowerCase()).toContain('applicant portal');
    expect(rows[0]!.url).toBe(`${baseUrl}/small-text.pdf`);
  });

  it('dedupes across multiple entries linking the same PDF', async () => {
    // Add a second markdown file that links the same PDF.
    const secondMd = `---
title: Duplicate Link
---

Same PDF: [Annual Report Again](${baseUrl}/small-text.pdf)`;
    await writeFile(join(workDir, 'src/content/resources/dupe.md'), secondMd);

    const integration = pdfSearchIntegration({
      collections: ['resources'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: join(workDir, '.astro/.pdf-cache'),
    });

    await integration.hooks['astro:build:setup']!({
      config: {
        srcDir: { pathname: join(workDir, 'src/') },
        publicDir: { pathname: join(workDir, 'public/') },
      },
    });

    const raw = await readFile(join(workDir, 'public/searchIndex.pdfs.json'), 'utf-8');
    const rows = JSON.parse(raw) as Array<unknown>;
    // Despite two markdown files linking it, the PDF appears exactly once.
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 8: Make sure core's fixtures are generated**

Run: `pnpm --filter @icjia/pdf-search-index fixtures`

- [ ] **Step 9: Build and test the adapter**

Run: `pnpm install && pnpm --filter @icjia/astro-pdf-search-index build && pnpm --filter @icjia/astro-pdf-search-index test`
Expected: tsup builds `dist/index.js` + dts; 2 integration tests pass.

- [ ] **Step 10: Create the adapter's README**

`packages/astro-pdf-search-index/README.md`:

```markdown
# @icjia/astro-pdf-search-index

Astro integration for [`@icjia/pdf-search-index`](../core). Walks configured
content collections, extracts every linked PDF's text at build time, and
emits a JSON index your search UI can fetch.

## Install

\`\`\`bash
npm install @icjia/pdf-search-index @icjia/astro-pdf-search-index
\`\`\`

## Use

\`\`\`ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: 'searchIndex.pdfs.json',
    }),
  ],
});
\`\`\`

The build emits \`public/searchIndex.pdfs.json\` which is served at
\`/searchIndex.pdfs.json\` in production. Merge it with your existing Fuse
index in the browser:

\`\`\`ts
const [pages, pdfs] = await Promise.all([
  fetch('/searchIndex.json').then((r) => r.json()),
  fetch('/searchIndex.pdfs.json').then((r) => r.json()),
]);
const fuse = new Fuse([...pages, ...pdfs], { keys: ['title', 'text'], includeMatches: true });
\`\`\`

See [`@icjia/pdf-search-index`](../core) for the underlying library and the
\`snippetHTMLFor\` helper for highlighted result snippets.

## Options

- \`collections\` — names of Astro content collections to scan (required)
- \`endpoint\` — output filename under \`public/\`. Default \`searchIndex.pdfs.json\`
- \`cacheDir\` — file cache for extracted text. Default \`.astro/.pdf-cache\`
- \`concurrency\` — parallel fetches. Default \`4\`

## License

MIT
```

- [ ] **Step 11: Full suite + checks**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`
Expected: all packages' tests pass, build clean.

- [ ] **Step 12: Commit**

```bash
git add packages/astro-pdf-search-index/ pnpm-lock.yaml
git commit -m "feat(astro): @icjia/astro-pdf-search-index integration with collection scanner"
```

---

## Task 4: `@icjia/nuxt-pdf-search-index` module

**Files (all new):**
- `packages/nuxt-pdf-search-index/package.json`
- `packages/nuxt-pdf-search-index/tsconfig.json`
- `packages/nuxt-pdf-search-index/build.config.ts`
- `packages/nuxt-pdf-search-index/vitest.config.ts`
- `packages/nuxt-pdf-search-index/src/module.ts`
- `packages/nuxt-pdf-search-index/src/runtime/server/helpers.ts`
- `packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts`
- `packages/nuxt-pdf-search-index/test/helpers.test.ts`
- `packages/nuxt-pdf-search-index/README.md`

- [ ] **Step 1: Create `packages/nuxt-pdf-search-index/package.json`**

```json
{
  "name": "@icjia/nuxt-pdf-search-index",
  "version": "0.0.0",
  "description": "Nuxt 4 module for @icjia/pdf-search-index — extract PDFs from mixed CMS + @nuxt/content sources.",
  "type": "module",
  "license": "MIT",
  "author": "ICJIA",
  "repository": {
    "type": "git",
    "url": "https://github.com/ICJIA/pdf-search-index.git",
    "directory": "packages/nuxt-pdf-search-index"
  },
  "keywords": ["nuxt", "nuxt-module", "nuxt4", "pdf", "search", "fuse"],
  "engines": { "node": ">=20" },
  "exports": {
    ".": {
      "types": "./dist/types.d.mts",
      "import": "./dist/module.mjs"
    },
    "./server": {
      "types": "./dist/runtime/server/helpers.d.mts",
      "import": "./dist/runtime/server/helpers.mjs"
    }
  },
  "main": "./dist/module.mjs",
  "types": "./dist/types.d.mts",
  "files": ["dist"],
  "scripts": {
    "build": "nuxt-module-build build",
    "dev": "nuxt-module-build build --stub",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@icjia/pdf-search-index": "workspace:*",
    "@nuxt/kit": "^4.0.0"
  },
  "peerDependencies": {
    "nuxt": "^4.0.0"
  },
  "devDependencies": {
    "@nuxt/module-builder": "^1.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/nuxt-pdf-search-index/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist",
    "types": ["node", "vitest/globals"],
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/nuxt-pdf-search-index/build.config.ts`**

```ts
import { defineBuildConfig } from '@nuxt/module-builder';

export default defineBuildConfig({
  entries: [
    {
      input: 'src/module',
    },
    {
      input: 'src/runtime/server/helpers',
    },
    {
      input: 'src/runtime/server/route-template',
    },
  ],
  externals: ['@icjia/pdf-search-index', '@nuxt/kit', 'nuxt', '#imports'],
});
```

- [ ] **Step 4: Create `packages/nuxt-pdf-search-index/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create the server helpers — `packages/nuxt-pdf-search-index/src/runtime/server/helpers.ts`**

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';
import type { IndexedPdf, IndexPdfsOptions } from '@icjia/pdf-search-index';

export type { IndexedPdf, IndexPdfsOptions };

/**
 * Extract PDFs linked from a CMS body string (Strapi-style markdown body).
 * Identical contract to `extractPdfsFromBody` from the core package; re-
 * exported under a Nuxt-friendly name.
 */
export async function extractPdfsFromCmsBody(
  body: string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  return extractPdfsFromBody(body, options);
}

/**
 * Extract PDFs from a `@nuxt/content` parsed document. The doc is expected
 * to have a `body` field that is the original markdown source string OR a
 * `_raw` field with the same content. We accept either to be tolerant of
 * the different @nuxt/content shapes consumers may have.
 */
export async function extractPdfsFromContentDoc(
  doc: { body?: string; _raw?: string; rawbody?: string } | string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  if (typeof doc === 'string') {
    return extractPdfsFromBody(doc, options);
  }
  const body = doc.body ?? doc._raw ?? doc.rawbody ?? '';
  return extractPdfsFromBody(body, options);
}
```

- [ ] **Step 6: Create the Nitro route template — `packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts`**

```ts
/**
 * Nitro server-route template for a mixed CMS + @nuxt/content site.
 *
 * Copy this file into your Nuxt project at `server/api/searchIndex.get.ts`,
 * then customize the CMS fetch logic and content query to match your stack.
 *
 * After customization, fetch `/api/searchIndex` from the client to load
 * the combined search index (pages + CMS rows + extracted PDF rows).
 */
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody, extractPdfsFromContentDoc } from '#imports';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default defineEventHandler(async () => {
  // === REPLACE WITH YOUR CMS FETCH ===
  // Example for Strapi:
  //   const cmsPages = await $fetch('https://cms.example.com/api/pages');
  //   const cmsRows = cmsPages.data.map((p) => ({
  //     type: 'cms', id: p.id, title: p.attributes.title, body: p.attributes.body,
  //   }));
  const cmsRows: Array<{ id: string; title: string; body: string }> = [];

  // === REPLACE WITH YOUR @nuxt/content QUERY ===
  // Example using queryContent (Nuxt 3 syntax):
  //   const event = useEvent();
  //   const docs = await serverQueryContent(event).find();
  const contentDocs: Array<{ _path?: string; title?: string; body?: string }> = [];

  // Extract PDFs from each source's body strings.
  const cmsPdfs: IndexedPdf[] = [];
  for (const row of cmsRows) {
    cmsPdfs.push(...(await extractPdfsFromCmsBody(row.body)));
  }

  const contentPdfs: IndexedPdf[] = [];
  for (const doc of contentDocs) {
    contentPdfs.push(...(await extractPdfsFromContentDoc(doc)));
  }

  // Dedupe by id (same PDF linked from multiple pages → one row).
  const allPdfs = [...new Map([...cmsPdfs, ...contentPdfs].map((p) => [p.id, p])).values()];

  return {
    cms: cmsRows.map((r) => ({ type: 'cms', id: r.id, title: r.title })),
    content: contentDocs.map((d) => ({ type: 'content', path: d._path, title: d.title })),
    pdfs: allPdfs,
  };
});
```

- [ ] **Step 7: Create the module entry — `packages/nuxt-pdf-search-index/src/module.ts`**

```ts
import { defineNuxtModule, addServerImports, createResolver } from '@nuxt/kit';

export interface ModuleOptions {
  /** File cache for extracted PDF text. Default `.nuxt/.pdf-cache`. */
  cacheDir?: string;
  /** Concurrent fetches. Default 4. */
  concurrency?: number;
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@icjia/nuxt-pdf-search-index',
    configKey: 'pdfSearchIndex',
    compatibility: {
      nuxt: '^4.0.0',
    },
  },
  defaults: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // Expose helpers in server-side #imports so Nitro routes can use them.
    addServerImports([
      {
        name: 'extractPdfsFromCmsBody',
        from: resolver.resolve('./runtime/server/helpers'),
      },
      {
        name: 'extractPdfsFromContentDoc',
        from: resolver.resolve('./runtime/server/helpers'),
      },
    ]);

    // Surface user options via runtimeConfig so the helpers (or a future
    // auto-registered route) can read them.
    nuxt.options.runtimeConfig = nuxt.options.runtimeConfig || {};
    const rc = nuxt.options.runtimeConfig as Record<string, unknown>;
    rc.pdfSearchIndex = {
      cacheDir: options.cacheDir,
      concurrency: options.concurrency,
    };
  },
});
```

- [ ] **Step 8: Write helper unit tests — `packages/nuxt-pdf-search-index/test/helpers.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  extractPdfsFromCmsBody,
  extractPdfsFromContentDoc,
} from '../src/runtime/server/helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const corePdfFixtures = resolve(here, '../../core/test/fixtures');

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `nuxt-pdf-search-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function fixtureFetch(map: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const filename = map[url];
    if (!filename) return new Response('', { status: 404 });
    const buf = await readFile(join(corePdfFixtures, filename));
    return new Response(buf, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('extractPdfsFromCmsBody', () => {
  it('finds PDF URLs in a markdown body string', async () => {
    const body = `[Doc](https://example.com/x.pdf) and prose.`;
    const rows = await extractPdfsFromCmsBody(body, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Doc');
  });
});

describe('extractPdfsFromContentDoc', () => {
  it('accepts a doc with `body` field', async () => {
    const doc = { body: `[Doc](https://example.com/x.pdf)` };
    const rows = await extractPdfsFromContentDoc(doc, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
  });

  it('accepts a doc with `_raw` field (some @nuxt/content shapes)', async () => {
    const doc = { _raw: `https://example.com/x.pdf` };
    const rows = await extractPdfsFromContentDoc(doc, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
  });

  it('accepts a raw markdown string directly', async () => {
    const rows = await extractPdfsFromContentDoc(`[Doc](https://example.com/x.pdf)`, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
  });

  it('returns empty array when no body field is present', async () => {
    const rows = await extractPdfsFromContentDoc({});
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 9: Make sure core's fixtures are present**

Run: `pnpm --filter @icjia/pdf-search-index fixtures`

- [ ] **Step 10: Build and test the module**

Run: `pnpm install && pnpm --filter @icjia/nuxt-pdf-search-index build && pnpm --filter @icjia/nuxt-pdf-search-index test`
Expected: module-builder produces `dist/module.mjs`, `dist/runtime/server/helpers.mjs`, etc.; 5 helper tests pass.

If `@nuxt/module-builder` is not available at v1.x, fall back to `unbuild` directly with a similar `build.config.ts` (the module-builder is a thin wrapper over unbuild for Nuxt-specific entries).

- [ ] **Step 11: Create the module's README**

`packages/nuxt-pdf-search-index/README.md`:

```markdown
# @icjia/nuxt-pdf-search-index

Nuxt 4 module for [`@icjia/pdf-search-index`](../core). Built for mixed sites
that combine a remote CMS (Strapi, Sanity, etc.) with `@nuxt/content` markdown.

## Install

\`\`\`bash
npm install @icjia/pdf-search-index @icjia/nuxt-pdf-search-index
\`\`\`

## Register

\`\`\`ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
});
\`\`\`

## Use in a server route

Copy [`route-template.ts`](./src/runtime/server/route-template.ts) into your
project at \`server/api/searchIndex.get.ts\` and adapt the CMS fetch + content
query to match your stack.

The module auto-imports two helpers into server-side \`#imports\`:

- \`extractPdfsFromCmsBody(body, options?)\` — for Strapi-style CMS body strings
- \`extractPdfsFromContentDoc(doc, options?)\` — for \`@nuxt/content\` parsed docs

Both return \`IndexedPdf[]\` from \`@icjia/pdf-search-index\`.

## License

MIT
```

- [ ] **Step 12: Full suite + checks**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`
Expected: all packages' tests pass.

- [ ] **Step 13: Commit**

```bash
git add packages/nuxt-pdf-search-index/ pnpm-lock.yaml
git commit -m "feat(nuxt): @icjia/nuxt-pdf-search-index module (mixed CMS + @nuxt/content)"
```

---

## Final: Plan 2 verification + push

- [ ] **Step 1: Confirm all three packages build, test, and dry-run-publish**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm --filter @icjia/pdf-search-index publish --dry-run
pnpm --filter @icjia/astro-pdf-search-index publish --dry-run
pnpm --filter @icjia/nuxt-pdf-search-index publish --dry-run
```

Expected: all green; each dry-run shows a small tarball with `dist/` only.

- [ ] **Step 2: Push `feat/v1-adapters` to GitHub**

```bash
git push -u origin feat/v1-adapters
```

(Hold off on a release tag — that lands in Plan 3 once examples + README are in.)

---

## Done

After Plan 2 lands you have three buildable, tested, publishable-shape packages:

| Package | Version | Entry points |
|---|---|---|
| `@icjia/pdf-search-index` | 0.1.0 (already tagged) | `.`, `./fuse`, `./snippet`, `./mcp`, `bin: pdf-search-index` |
| `@icjia/astro-pdf-search-index` | 0.0.0 (no version bump yet) | `.` |
| `@icjia/nuxt-pdf-search-index` | 0.0.0 (no version bump yet) | `.`, `./server` |

Plan 3 (separate document, written after Plan 2 lands) covers:

- Seven `/examples/` apps (plain-node, html, vue, astro, nextjs, eleventy, nuxt-mixed)
- Very detailed top-level `README.md` with side-by-side integration code from each example
- Coordinated v1.0.0 release across all three packages (changesets, version bump, tags, commit)
