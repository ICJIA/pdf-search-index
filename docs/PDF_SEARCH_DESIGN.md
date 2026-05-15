# PDF Search Index — Design Document

A small drop-in npm package for adding **full-text PDF search** to static
sites that already use **Fuse.js** (or MiniSearch / Lunr / FlexSearch) for
client-side fuzzy search. PDFs become first-class search rows alongside
your pages and posts: a query like "applicant portal" matches the body of
the *linked PDF*, returns it as a result, and — with the included snippet
helper — shows the surrounding text with the match highlighted.

| | |
|---|---|
| **Status** | Design. Inline reference implementation live in this repo at `astro/src/lib/pdfText.ts` + `astro/src/pages/searchIndex.json.ts`. |
| **Target package** | `@icjia/pdf-search-index` (npm, scoped to the ICJIA org) |
| **Target repo** | `github.com/ICJIA/pdf-search-index` (new — to be created) |
| **Scale target** | 10–1,000 PDFs per site (most ICJIA sites: 10–20) |
| **Architecture** | Build-time extraction; runtime is just a JSON fetch |
| **Distribution** | Library + CLI + MCP server, all from one repo |
| **License (proposed)** | MIT |

---

## 1. Why this exists

ICJIA sites publish a lot of PDFs — annual reports, FAQs, technical
documents, board materials — that are effectively invisible to site
search today. Most ICJIA sites use **Fuse.js** for client-side fuzzy
search, which works great for pages and news posts but only ever matches
the *prose that links to a PDF*, never the PDF's content. A user
searching for "lieutenant governor" gets nothing when the only mention is
inside a PDF body.

The fix is conceptually simple: extract text from each PDF at build time,
append it to your Fuse index as a normal row. Apache Solr has done this
for a decade via Tika — but Solr is a JVM-based search *server* and
massive overkill for a static-site ICJIA deployment. This package is the
**Tika-equivalent, no Solr**: extract text at build time, output JSON,
let your existing client-side search engine handle the query.

The R3 site in this repo proved the approach works:

- `astro/src/lib/pdfText.ts` (≈100 lines)
- `astro/src/pages/searchIndex.json.ts` (≈110 lines)
- Result: **48 search rows including 15 PDFs**, queries like "applicant
  portal" return PDF rows linking directly to the file, with the match
  text rendered as a highlighted snippet.

The next step is generalizing that pattern.

---

## 2. Goals and non-goals

### Goals

- **Drop-in install.** `npm i @icjia/pdf-search-index`. No Java, no native
  binaries, no system deps. Pure ESM, Node-compatible, works on Vercel /
  Netlify / Cloudflare Pages / any CI.
- **One-liner Fuse.js integration.** The common case is "add PDFs to my
  existing Fuse index"; that should be three lines of code.
- **Build-time only.** No runtime servers. Output is a static JSON file
  the consumer site bundles with its other static assets.
- **Three distribution surfaces from one core.** Library (npm), CLI
  (`npx`), MCP server (`@icjia/pdf-search-index/mcp`). All wrap the same
  ≈200-line core.
- **Snippet / highlight helper.** A `snippetFor(fuseResult)` function
  that returns HTML with `<mark>` around the match — the part that makes
  search results *useful* instead of just *correct*.
- **Cache.** Extracted text is keyed by URL hash; re-runs are instant.
- **Graceful degradation.** A corrupt PDF doesn't fail the build — it
  logs and skips. The index stays valid.

### Non-goals

- **Not a search server.** No HTTP query endpoint, no inverted index, no
  live re-indexing. (If you need that, you need Solr or Elasticsearch.)
- **Not OCR.** Image-only / scanned PDFs return empty text. An opt-in
  Tesseract.js adapter could land later, but it isn't in v1.
- **Not multi-format.** `.docx`, `.xlsx`, `.pptx` are out of scope.
  Different format = different extractor; they belong in sibling packages
  (`@icjia/docx-search-index`, etc.).
- **Not query-time extraction.** PDFs that change require a rebuild.
- **Not a Fuse competitor.** We emit JSON. Consumers pick their engine
  (Fuse, MiniSearch, Lunr, FlexSearch, or hand-rolled).
- **No automatic ETag-based cache invalidation in v1.** Manual flush
  via `rm -rf .pdf-cache/` if a PDF's content changes at the same URL.

---

## 3. The 30-second integration story

You already have a static site with Fuse.js. Add PDF content searching in
three lines:

```ts
// In your build script
import { indexPdfs } from '@icjia/pdf-search-index';

const pdfRows = await indexPdfs([
  'https://example.com/annual-report-2024.pdf',
  'https://example.com/faqs.pdf',
]);

// Merge into your existing Fuse data
const allRows = [...yourPageRows, ...pdfRows];
// Use as normal:
const fuse = new Fuse(allRows, { keys: ['title', 'text'], includeMatches: true });
```

If you *don't* already have Fuse wired up, the dedicated adapter does
both steps for you:

```ts
import { createFuseIndex } from '@icjia/pdf-search-index/fuse';

const fuse = await createFuseIndex({
  urls: ['https://...pdf', ...],
  fuseOptions: { threshold: 0.3 },   // optional Fuse passthrough
});

const results = fuse.search('applicant portal');
```

To turn each result into highlighted HTML:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

for (const r of results) {
  console.log(r.item.title, snippetHTMLFor(r));
  // → "Annual Report 2024", "…the <mark>applicant portal</mark> requires…"
}
```

That's the whole consumer-facing API. Everything else is configuration.

---

## 4. Architecture

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    │       @icjia/pdf-search-index           │
                    │       (core library — pure functions)   │
                    │                                         │
                    │   extractPdfText(url) → string          │
                    │   extractPdfsFromBody(md) → Pdf[]       │
                    │   indexPdfs([urls]) → IndexedPdf[]      │
                    │                                         │
                    │   /fuse → createFuseIndex(...)          │
                    │   /snippet → snippetHTMLFor(result)     │
                    │                                         │
                    └────┬────────────────────┬──────────┬────┘
                         │                    │          │
              ┌──────────┴──────┐  ┌──────────┴────┐  ┌──┴───────────────┐
              │                 │  │               │  │                  │
              │       CLI       │  │     MCP       │  │   Build plugins  │
              │     (npx)       │  │     server    │  │   (Astro/Nuxt)   │
              │                 │  │               │  │                  │
              └─────────────────┘  └───────────────┘  └──────────────────┘
                One-shot extract     LLM workflows      Auto-emit JSON
                + interactive grep   ("search these     during site build
                                     PDFs for X")
```

The core library is the engine. The three distribution wrappers are
thin: CLI ≈50 lines, MCP server ≈80 lines, build plugins ≈30 lines each.
All three sit on top of the same ≈200-line core.

This separation matters because it keeps each surface free to fail
independently. If the MCP server has a bug, the CLI still works. If the
Astro plugin is incompatible with a new Astro version, the Nuxt module
keeps running.

---

## 5. Core library API

### `extractPdfText(url, options?)` — single URL → string

```ts
import { extractPdfText } from '@icjia/pdf-search-index';

const text = await extractPdfText('https://example.com/foo.pdf');
// → "Full extracted text…"
```

Options:

```ts
interface ExtractOptions {
  cacheDir?: string;       // default: '.pdf-cache'
  fetchTimeout?: number;   // default: 30000 (ms)
  maxBytes?: number;       // default: 100MB
  fetch?: typeof fetch;    // inject a custom fetch (e.g. for auth)
  cache?: 'use' | 'bypass' | 'refresh';  // default: 'use'
}
```

### `extractPdfsFromBody(markdown, options?)` — scan a body for PDF links

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';

const pdfs = await extractPdfsFromBody(`
# Resources
- [Annual Report 2024](https://example.com/r3-2024.pdf)
- [FAQ Document](https://example.com/faq.pdf)
`);

// → [
//     { id: 'pdf-abc123', url: '...', title: 'Annual Report 2024', text: '...' },
//     { id: 'pdf-def456', url: '...', title: 'FAQ Document', text: '...' },
//   ]
```

Linked-text titles win over filename-derived titles. URLs that appear
both as markdown links and as bare URLs are deduped (the linked form
wins).

### `indexPdfs(urls, options?)` — batch indexer

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  'https://example.com/a.pdf',
  { url: 'https://example.com/b.pdf', title: 'Custom Title' },
  { url: 'https://example.com/c.pdf', title: 'C', id: 'my-custom-id' },
]);

// → IndexedPdf[]
```

Each entry can be a bare URL string (title derived from filename) or an
object with explicit `title` / `id`.

### Indexed row shape

```ts
interface IndexedPdf {
  id: string;            // 'pdf-' + first 12 hex chars of SHA-256(url)
  url: string;           // canonical URL
  title: string;         // link-text title, or filename-derived
  text: string;          // extracted body text, single string, no markup
  pages?: number;        // page count from pdf.js
  extractedAt?: string;  // ISO timestamp, present if not from cache
}
```

This shape is intentionally Fuse-friendly:
- `id` is a stable Fuse key
- `title` and `text` are the natural Fuse `keys: [...]`
- `url` is the direct-link target for search-result anchors

---

## 6. Fuse.js integration (the bullseye)

This is the main reason the package exists. Three patterns, in order of
common-ness:

### 6.1. "I already have a Fuse index — just give me the PDF rows"

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const pdfRows = await indexPdfs(pdfUrls);
const allRows = [...myPageRows, ...pdfRows];

const fuse = new Fuse(allRows, {
  keys: ['title', 'text'],
  threshold: 0.3,
  ignoreLocation: true,
  includeMatches: true,  // required for the snippet helper
});
```

`allRows` is just an array of objects with `title` and `text`. Your page
rows can use a `rawText` field instead of `text` — pass `keys: ['title',
'rawText', 'text']` to cover both. Fuse doesn't care about extra fields.

### 6.2. "Build me a Fuse instance from scratch"

```ts
import { createFuseIndex } from '@icjia/pdf-search-index/fuse';

const fuse = await createFuseIndex({
  urls: ['https://...pdf', ...],
  fuseOptions: {
    threshold: 0.3,           // optional Fuse override
    includeMatches: true,     // default: true
    minMatchCharLength: 2,    // default: 2
  },
});

const results = fuse.search('applicant portal');
```

### 6.3. "I have CMS bodies — extract URLs and index them in one pass"

For the Astro/Nuxt CMS case (R3's actual situation):

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';

const pages = await loadFromCMS();

const allPdfs = [];
for (const page of pages) {
  const pdfs = await extractPdfsFromBody(page.body);
  allPdfs.push(...pdfs);
}

// Dedupe by id (same PDF linked from multiple pages → one row)
const uniquePdfs = [...new Map(allPdfs.map(p => [p.id, p])).values()];

const fuse = new Fuse([...pages, ...uniquePdfs], {
  keys: ['title', 'body', 'text'],
  includeMatches: true,
});
```

### 6.4. Snippet rendering — the part that makes results actually useful

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const results = fuse.search('applicant portal');

for (const r of results) {
  const html = snippetHTMLFor(r, {
    contextChars: 80,       // chars before + after match (default: 80)
    matchKey: 'text',       // which Fuse key to snippet (default: 'text')
    collapseWhitespace: true,  // default: true — PDF text has weird wrap
  });
  // html: "…the <mark>applicant portal</mark> requires registration…"
}
```

The helper:
- Picks the longest match span (Fuse can return multiple per key)
- Slices ±N chars of context around it
- Collapses whitespace (PDF text from pdf.js often has line-wrap noise)
- HTML-escapes everything except the `<mark>` wrap
- Adds `…` ellipses when the snippet was truncated

Output is safe to `v-html` / `dangerouslySetInnerHTML` directly.

### 6.5. R3-style "filter by type" chips

Combine PDFs with pages in one index, then filter by `type` in the UI.
The R3 search component does exactly this — see `astro/src/components/
Search.vue` in this repo for a working reference of:
- Query-driven filter chips (hidden until a query has matches)
- Per-type counts based on Fuse results, not raw index size
- Zero-match chips disabled
- Auto-reset to "All" when the active filter would orphan to zero
- Snippet + highlight on every result
- `target="_blank"` on PDF results, normal nav on page results

---

## 7. CLI

```bash
# One-shot: index a list of URLs to JSON
npx @icjia/pdf-search-index https://...pdf https://...pdf > index.json

# From a file (one URL per line)
npx @icjia/pdf-search-index --from urls.txt > index.json

# From a sitemap (scans every page for PDF links, indexes them)
npx @icjia/pdf-search-index --from-sitemap https://example.com/sitemap.xml \
  > index.json

# Interactive grep: search inside the index without spinning up a site
npx @icjia/pdf-search-index search index.json "applicant portal"
# → 3 hits across 2 PDFs:
#     ▸ Annual Report 2024 (https://example.com/r3-2024.pdf)
#         …the applicant portal requires…
#     ▸ FAQ Document (https://example.com/faq.pdf)
#         …complete the applicant portal sign-up…

# Force re-extraction of one or all PDFs (ignore cache)
npx @icjia/pdf-search-index --refresh https://...pdf
npx @icjia/pdf-search-index --refresh-all --from urls.txt

# Verify a single PDF can be parsed (CI sanity check)
npx @icjia/pdf-search-index verify https://...pdf
# → exit 0 + page/char counts on success, exit 1 on parse failure
```

Output is JSON by default; `--ndjson` for newline-delimited, `--text` for
plain.

The interactive `search` subcommand is the "quick — search this PDF and
find all instances of XXX" use case: no site, no frontend, just a JSON
file and a query.

---

## 8. MCP server

Useful when you want Claude (or any MCP-capable LLM) to search inside
PDFs *during a conversation* — for example, when a user asks "what does
the R3 FAQ say about prequalification?" and you want the LLM to actually
read the PDF, not guess.

```bash
# Run the server (claude-code / Claude Desktop MCP config)
npx @icjia/pdf-search-index/mcp

# Or pin it in mcp.json:
{
  "servers": {
    "pdf-search": {
      "command": "npx",
      "args": ["@icjia/pdf-search-index/mcp"]
    }
  }
}
```

### Tool surface

| Tool | Purpose |
|---|---|
| `index_pdfs` | Given a URL list (or sitemap URL), extract + return the index JSON. |
| `search_pdfs` | Given an index (or a URL list) + a query, return matched snippets. |
| `extract_pdf` | Single-URL extraction. Returns full text + page count. |
| `clear_cache` | Manual cache flush. |
| `get_status` | Server / library / pdf.js versions, cache stats. |

All tools accept an optional `cacheDir` so a single-session conversation
doesn't pollute the user's persistent cache.

Auth: none in v1. The server fetches PDFs from public URLs only. If
auth-protected sources are needed, accept a `fetchHeaders` argument.

---

## 9. Distribution shapes

### 9.1. Plain Node library

```ts
import { indexPdfs } from '@icjia/pdf-search-index';
// use from any build script
```

### 9.2. Astro integration (optional convenience package)

```ts
// astro.config.ts
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      // Scan these content collections for PDF URLs in their bodies
      collections: ['resources', 'news'],
      // Emit the index as a static endpoint
      endpoint: '/searchIndex.pdfs.json',
    }),
  ],
});
```

### 9.3. Nuxt module (optional convenience package)

```ts
// nuxt.config.ts
export default {
  modules: ['@icjia/nuxt-pdf-search-index'],
  pdfSearchIndex: {
    contentDir: 'content',
    output: 'public/searchIndex.pdfs.json',
  },
};
```

The Astro and Nuxt packages are *separate* from the core — they're small
adapters. Core consumers don't pay for framework dependencies they
aren't using.

---

## 10. PDF library choice

Use **pdf.js via `unpdf`**. Rationale:

| Library | Verdict |
|---|---|
| **`unpdf`** (Anthony Fu / unjs) | ✅ Chosen. Modern ESM-first wrapper around pdf.js. Clean API: `getDocumentProxy(buf)` → `extractText(pdf, { mergePages: true })`. Pure JS, no native deps. |
| `pdf-parse` | Mature, but has a known top-level "test PDF" auto-run quirk that requires a workaround import path. Use as fallback if `unpdf` ever has issues. |
| `pdfjs-dist` directly | More verbose API but no extra wrapper. Acceptable for power users who need per-page granular control. |
| `pdftotext` (poppler-utils) | Best-in-class text quality. **Excludes serverless/CI environments** without explicit binary installation. Disqualifying for "drop-in" goal. |
| Apache Tika | Multi-format extractor + server. **Wrong tool** — heavyweight JVM, multi-format isn't a goal, and we don't want a server. |
| `qpdf` | **Not a text extractor.** Common confusion: qpdf is for PDF *manipulation* (split/rotate/encrypt/repair). Doesn't extract text. |

In v1 we wrap `unpdf` only. If a v2 needs poppler-quality extraction, we
can add an opt-in `extractor: 'unpdf' | 'pdftotext'` flag and shell out
to the binary when available.

---

## 11. Caching

PDFs are content-addressed by URL: cache key = first 16 hex chars of
`SHA-256(url)`. Cache files live at `<cacheDir>/<key>.txt` (default
`.pdf-cache/`).

Lookup is **read-through, write-back**:

1. Look for `<cacheDir>/<key>.txt`. If found, return it. (Fast path.)
2. Fetch the PDF from `url`.
3. Run `unpdf` extraction.
4. Write the text to `<cacheDir>/<key>.txt`.
5. Return the text.

No automatic invalidation. **Rationale**: PDFs in most CMS systems are
content-addressed at the storage layer — a "new version" gets a new URL
with a new hash suffix (Strapi does this, S3 versioned buckets do this).
If a PDF *is* mutated in place, the user can either:

- `rm -rf .pdf-cache/` before the build to refresh everything, or
- `npx @icjia/pdf-search-index --refresh <url>` to refresh one.

A v2 could add an opt-in ETag mode that does a HEAD request per cached
entry and re-extracts on header mismatch. Costs an extra round-trip per
PDF per build; not worth the default trade-off for most consumers.

---

## 12. Output format

```jsonc
[
  {
    "id": "pdf-aec02be5d905",
    "url": "https://example.com/r3-2024.pdf",
    "title": "R3 Annual Report 2024",
    "text": "PROGRAM ANNUAL REPORT | 2024 RESTORE, REINVEST AND RENEW…",
    "pages": 42,
    "extractedAt": "2026-05-15T13:42:18.391Z"
  }
]
```

`pages` and `extractedAt` are optional — `extractedAt` is present only
when the entry came from a fresh extraction (cache hits omit it so the
output is byte-stable across runs).

A consumer with strict typing can declare:

```ts
import type { IndexedPdf } from '@icjia/pdf-search-index';
```

---

## 13. Error handling

All failures are **non-fatal**:

| Failure mode | Behavior |
|---|---|
| Network error (DNS, timeout, refused) | Log warning, return `{ url, title, text: '' }` |
| HTTP non-2xx | Log warning with status, return empty text |
| Body bigger than `maxBytes` | Log warning, return empty text |
| pdf.js parse error (corrupt PDF) | Log warning with error message, return empty text |
| Encrypted PDF (no password) | Log warning, return empty text |
| Image-only / scanned PDF | Empty text returned silently — text layer is genuinely empty |
| Cache write error (disk full, EACCES) | Log warning, proceed with extracted text |

Consumers receive `{ ..., text: '' }` for failed entries. The index stays
valid. Search just doesn't match those PDFs. The build doesn't fail.

A `--strict` CLI flag can flip this — exit 1 on any extraction failure.
Useful for CI where you'd rather catch a broken upload pipeline than
ship a quietly-stale index.

---

## 14. Future extensions (post-v1)

| Extension | Sketch |
|---|---|
| **OCR for scanned PDFs** | Opt-in `ocr: true` option. Layer Tesseract.js on top — costly (~30s/page) but unlocks image-only PDFs. Probably ships as `@icjia/pdf-search-index-ocr` so the core stays lean. |
| **Per-page snippets** | `mergePages: false` mode that returns `{ pageNum, text }[]`. Snippet helper would link directly to `…#page=N` in compatible PDF viewers. |
| **ETag-based cache invalidation** | Opt-in `cacheMode: 'etag'`. HEAD per cached entry to detect upstream changes. |
| **Streaming / incremental indexing** | For larger sites: read a manifest of previously-indexed URLs, only extract the delta. |
| **Multi-format siblings** | `@icjia/docx-search-index` (mammoth), `@icjia/xlsx-search-index` (SheetJS). Same shape, different extractor. |
| **PDF metadata in index** | Extract pdf.js info dict (title, author, subject) as separate fields. Useful when the link-text title is generic ("Click here") but the PDF itself has a proper title. |
| **Client-side runtime extraction** | A Web Worker that extracts on demand — useful for sites with truly enormous PDF corpora where build-time extraction is prohibitive. Probably overkill for any ICJIA site (1,000 PDFs is the ceiling). |

---

## 15. R3 reference implementation

The R3 Astro site (this repo) is the proving ground. The relevant files:

| Path | Purpose |
|---|---|
| `astro/src/lib/pdfText.ts` | The extractor + cache (≈100 lines). Demonstrates URL scanning, fetch, unpdf, cache, error handling. |
| `astro/src/pages/searchIndex.json.ts` | The Astro endpoint that builds the JSON index (≈110 lines). Demonstrates merging PDF rows with CMS rows, de-duping across pages, the parent-row + PDF-row pattern. |
| `astro/src/components/Search.vue` | The Vue island that consumes the index and renders results (≈250 lines). Demonstrates query-driven filter chips, snippet rendering with `<mark>`-highlighted matches, direct-link PDF results in new tabs. |

What R3 has validated:
- ✅ Extraction works against Strapi-hosted PDFs at 7+ documents (the
  largest is 137 KB of text, the smallest is ~3 KB)
- ✅ Cache makes second-and-later builds instant
- ✅ Fuse.js with `keys: ['title', 'text']` + `includeMatches: true`
  surfaces PDF matches alongside page matches naturally
- ✅ The snippet helper renders correctly across PDF and prose rows
- ✅ Graceful degradation: one PDF that pdf.js couldn't parse logged a
  warning and got skipped; the index built fine

What R3 still doesn't exercise:
- ⏳ Image-only / scanned PDFs (no examples in the corpus today)
- ⏳ Truly large PDFs (most R3 PDFs are <100 pages)
- ⏳ ETag-based cache invalidation (no need yet)

These gaps are fine for v1. Add as second consumer sites surface real
edge cases.

---

## 16. Drop-in integration with an existing site

The single biggest design constraint: **adding PDF search to a site
that already has Fuse-based search should NOT require a refactor.** No
new routes. No CMS schema changes. No new infrastructure. Just `npm i`
plus ~10 lines of additive code in two existing files.

### 16.1. Astro site with a Fuse search (the i2i pattern)

Typical pre-existing files on an i2i-style Astro site:

- `src/pages/searchIndex.json.ts` — emits the JSON search index
- `src/components/Search.vue` (or `.astro`) — consumes the index, runs Fuse

**Install:**

```bash
npm i @icjia/pdf-search-index
```

**`src/pages/searchIndex.json.ts`** — 8 new lines (marked `+`):

```ts
 import type { APIRoute } from 'astro';
 import { getCollection } from 'astro:content';
+import { extractPdfsFromBody } from '@icjia/pdf-search-index';

 export const GET: APIRoute = async () => {
   const [pages, news, resources] = await Promise.all([/* ... */]);

+  // Extract PDFs linked from each row's markdown body.
+  const pdfRows = [];
+  const seen = new Set<string>();
+  for (const row of [...pages, ...news, ...resources]) {
+    for (const p of await extractPdfsFromBody(row.data.body ?? '')) {
+      if (seen.has(p.id)) continue;
+      seen.add(p.id);
+      pdfRows.push({ type: 'pdf', id: p.id, title: p.title, path: p.url, text: p.text });
+    }
+  }

   return new Response(JSON.stringify([
     ...pageRows, ...newsRows, ...resourceRows,
+    ...pdfRows,
   ]), { headers: { 'content-type': 'application/json' } });
 };
```

**Search component** — three small diffs:

```ts
// 1. Extend the row-type union
 interface Row {
-  type: 'pages' | 'news' | 'resources';
+  type: 'pages' | 'news' | 'resources' | 'pdf';
 }

// 2. Add a PDFs filter chip (optional but recommended)
 const types = [
   { key: 'all',       label: 'All' },
   { key: 'pages',     label: 'Pages' },
   { key: 'news',      label: 'News' },
+  { key: 'pdf',       label: 'PDFs' },
 ];

// 3. Enable Fuse match positions for the snippet helper
 const fuse = new Fuse(rows, {
   keys: ['title', 'text', 'rawText'],
   threshold: 0.3,
+  includeMatches: true,
 });

// 4. Import the snippet helper
+import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
```

**Search result template** — open PDFs in a new tab, render the snippet:

```vue
 <li v-for="r in results" :key="r.item.id">
   <a
     :href="r.item.path"
+    :target="r.item.type === 'pdf' ? '_blank' : undefined"
+    :rel="r.item.type === 'pdf' ? 'noopener noreferrer' : undefined"
   >
     <span class="search__type">{{ typeLabel(r.item.type) }}</span>
     <strong>{{ r.item.title }}</strong>
+    <p v-html="snippetHTMLFor(r)" class="search__snippet"></p>
   </a>
 </li>
```

That's the entire integration. **~12 added lines across 2 files**, no
routing changes, no CMS migrations, no new components, no new search
engine.

**Build cost** on first build: ~200–500 ms per unique PDF (one fetch +
one pdf.js parse). Subsequent builds: ~0 ms per PDF (cache hit). For
i2i-class sites with 10–30 PDFs, first build adds maybe 5–15 seconds;
subsequent builds are essentially free.

### 16.2. Nuxt site with a Fuse search

The Nuxt pattern is structurally identical to Astro — only the file
paths differ:

- Existing: `server/api/searchIndex.json.ts` or `server/api/searchIndex.get.ts`
- Add the `extractPdfsFromBody` call inside the handler
- Existing search component: same three-spot diff as above

If the Nuxt site uses `@nuxt/content` (markdown files on disk rather
than a remote CMS), pass each file's `body` content into
`extractPdfsFromBody` the same way.

### 16.3. Plain HTML site (no framework)

If a site is hand-authored HTML + a Fuse-backed search JSON, integration
is even simpler — no build pipeline hook needed, just a CLI invocation:

```bash
# In your deploy script / Makefile / package.json scripts
npx @icjia/pdf-search-index --from-sitemap https://example.com/sitemap.xml \
  > public/pdf-search.json
```

Then in your search code:

```js
const [pages, pdfs] = await Promise.all([
  fetch('/search.json').then(r => r.json()),
  fetch('/pdf-search.json').then(r => r.json()),
]);

const fuse = new Fuse([...pages, ...pdfs], {
  keys: ['title', 'text', 'rawText'],
  includeMatches: true,
});
```

### 16.4. What you do NOT have to change

For all three integration patterns:

- ❌ No new pages, routes, or API endpoints
- ❌ No CMS schema changes — PDFs continue to be linked from markdown
  bodies the same way they always have been
- ❌ No new search engine — keep using Fuse.js
- ❌ No service workers, edge functions, or runtime servers
- ❌ No client-side JS bundle bloat — `unpdf` is build-time only and
  never ships to the browser

### 16.5. Per-site adoption checklist

Four decisions when bringing this to a new site:

| Decision | Default | When to override |
|---|---|---|
| Which collections to scan for PDF links | All with a `body` field | Skip a collection if its PDFs are never user-facing |
| Cache directory | `.pdf-cache/` | Match your CI's persistent-cache convention (e.g. `.cache/pdf-text/` on Vercel) |
| Include the "PDFs" filter chip in the UI | Yes if site has ≥3 PDFs | Hide if PDFs are too few to be their own category |
| Snippet context length (chars before + after match) | 80 | Up to 200 if you have horizontal space; down to 40 for mobile-first |

### 16.6. Migration order for existing ICJIA sites

When this package ships, the natural rollout order:

1. **R3** — already has the inline reference; swap it for the npm package
   (no behavior change, just dependency consolidation).
2. **i2i** — proves "drop into existing site" works on a peer site.
3. **DVFR** (`dvfr.illinois.gov`) — already has an axe accessibility
   report at `/docs/accessibility/`; adding PDF search is a natural
   second integration since the pattern is the same.
4. **Smaller / older ICJIA sites** — case-by-case, as PDF search is
   useful for the corpus.

---

## 17. Prior art

- **Apache Tika** — multi-format extractor + Java server. The mature
  reference. Heavyweight (JVM, full server). What we're *not* building.
- **Solr ExtractingRequestHandler** + **Elasticsearch ingest-attachment**
  — both backed by Tika. Same shape: extract once, feed an inverted
  index. We're swapping Solr for a JSON file and Tika for pdf.js.
- **pdf.js** (Mozilla) — the JS PDF standard. Used in Firefox. The basis
  for almost every JS PDF library.
- **`unpdf`** (Anthony Fu / unjs) — modern ESM wrapper around pdf.js.
  Clean API. Our pick.
- **`pdf-parse`** (npm) — older mature Node wrapper around pdf.js. Has
  a quirky top-level import; backup choice if unpdf has issues.
- **`pdftotext`** (poppler-utils) — best-in-class CLI text extractor.
  Native binary; disqualifying for "drop-in npm" but worth offering as
  an opt-in `extractor: 'pdftotext'` mode in a later version.
- **Algolia / Meilisearch crawler+extractor pipelines** — much higher-
  level (full hosted search platforms). Different product category.
- **`pagefind`** — static-site search generator that handles HTML; does
  NOT handle PDFs out of the box. A natural complement.

---

## Appendix A — Open design questions

These are real questions worth resolving before v1 ships, not after.

1. **Concurrency**: How many PDFs do we fetch in parallel? Default 4?
   Configurable? `unpdf` itself isn't CPU-heavy but the fetches matter
   when indexing 100+ PDFs.
2. **Merged vs per-page text**: `mergePages: true` gives one string per
   PDF — easy snippet, no page numbers. `mergePages: false` gives an
   array — opens "result links to page N" but doubles the index size and
   complicates the snippet helper. Probably default to merged with an
   opt-in per-page mode.
3. **Title heuristics**: When a bare URL appears (not in a markdown
   link), we derive a title from the filename. The filename is often
   `R3_FAQ_v2_a3f8b2c.pdf` — half-useful. Should we also try pdf.js's
   info-dict `title`? Fallback chain: link-text > info-dict-title >
   filename.
4. **JSON output stability**: We omit `extractedAt` on cached entries to
   keep the JSON byte-stable across runs (good for CDN caching,
   diffability). Confirm this is the right call vs. always including it.
5. **CLI exit codes**: `--strict` = exit 1 on any extraction failure.
   Default = exit 0 always (graceful). Are these the right defaults?
6. **MCP scope**: Should `search_pdfs` accept a query and return ranked
   snippets, or just return the raw index for the LLM to grep itself?
   The former is more useful but couples the package to Fuse; the latter
   stays format-agnostic.

---

## Appendix B — Suggested package layout

```
@icjia/pdf-search-index/
├── package.json
├── README.md
├── LICENSE                          (MIT)
├── tsconfig.json
├── src/
│   ├── index.ts                     ← extractPdfText, extractPdfsFromBody, indexPdfs
│   ├── cache.ts                     ← file-based URL→text cache
│   ├── url-scan.ts                  ← markdown PDF-URL discovery
│   ├── extractor.ts                 ← unpdf wrapper
│   ├── fuse.ts                      ← createFuseIndex helper (entry: '/fuse')
│   ├── snippet.ts                   ← snippetHTMLFor + escape helpers (entry: '/snippet')
│   ├── cli.ts                       ← bin entry (entry: 'pdf-search-index')
│   ├── mcp.ts                       ← MCP server (entry: '/mcp')
│   └── types.ts                     ← IndexedPdf + option shapes
├── test/
│   ├── fixtures/
│   │   ├── small-text.pdf
│   │   ├── image-only.pdf
│   │   └── encrypted.pdf
│   ├── extractor.test.ts
│   ├── cache.test.ts
│   ├── url-scan.test.ts
│   └── snippet.test.ts
└── examples/
    ├── astro/                        ← Astro consumer example
    ├── nuxt/                         ← Nuxt consumer example
    └── plain-node/                   ← Vanilla Node script
```

`package.json` exports:

```jsonc
{
  "name": "@icjia/pdf-search-index",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./fuse": "./dist/fuse.js",
    "./snippet": "./dist/snippet.js",
    "./mcp": "./dist/mcp.js"
  },
  "bin": {
    "pdf-search-index": "./dist/cli.js"
  },
  "dependencies": {
    "unpdf": "^1.6.0"
  },
  "peerDependencies": {
    "fuse.js": "^7.0.0"
  },
  "peerDependenciesMeta": {
    "fuse.js": { "optional": true }
  }
}
```

`fuse.js` is a peer dep — only required if the consumer imports from
`/fuse` or `/snippet` (where `FuseResult` types live).

---

*Last revised 2026-05-15. Companion to the R3 inline reference at*
*`github.com/ICJIA/icjia-r3-v5-nuxt/blob/main/astro/src/lib/pdfText.ts`.*
