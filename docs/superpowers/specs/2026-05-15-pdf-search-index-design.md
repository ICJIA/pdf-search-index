---
title: PDF Search Index — v1.0 Design Spec
date: 2026-05-15
status: Approved (post-brainstorm)
supersedes: docs/PDF_SEARCH_DESIGN.md (retained as the original design seed)
companion: docs/pdfText.ts, docs/searchIndex.json.ts, docs/Search.vue (R3 reference impl)
---

# PDF Search Index — v1.0 Design Spec

A drop-in npm package for adding full-text PDF search to static sites that
already use Fuse.js for client-side fuzzy search. PDFs become first-class
search rows alongside pages and posts — a query like "applicant portal"
matches the body of the *linked PDF*, returns it as a result, and (with the
included snippet helper) renders the surrounding text with the match
highlighted.

Build-time extraction. No runtime servers. Pure ESM, no native deps.

| | |
|---|---|
| **Package scope (npm)** | `@icjia` |
| **Repo** | `github.com/ICJIA/pdf-search-index` (this directory) |
| **License** | MIT |
| **Scale target** | 10–1,000 PDFs per site (most ICJIA sites: 10–30) |
| **Node target** | 20 LTS, 22 LTS |
| **Build target** | ESM only |
| **Reference impl** | R3 (`docs/pdfText.ts`, `docs/searchIndex.json.ts`, `docs/Search.vue`) |

---

## 1. v1.0 ship scope

v1.0 publishes three packages exposing the following entry points:

| Entry point | Package | Path |
|---|---|---|
| Core library | `@icjia/pdf-search-index` | `.` |
| Fuse helper | `@icjia/pdf-search-index` | `./fuse` |
| Snippet helper | `@icjia/pdf-search-index` | `./snippet` |
| MCP server | `@icjia/pdf-search-index` | `./mcp` |
| CLI | `@icjia/pdf-search-index` | `bin: pdf-search-index` |
| Astro integration | `@icjia/astro-pdf-search-index` | `.` |
| Nuxt 4 module | `@icjia/nuxt-pdf-search-index` | `.` |

Core + helpers + CLI + MCP all live in one package because they share the
same ~200-line extractor core. The framework adapters are separate packages
so consumers don't pay for peerDeps they aren't using.

---

## 2. Why this exists

ICJIA sites publish many PDFs — annual reports, FAQs, technical documents,
board materials — that are invisible to site search today. Most ICJIA sites
use Fuse.js for client-side fuzzy search, which works for pages and news
posts but only matches the *prose that links to a PDF*, never the PDF's
content. A user searching for "lieutenant governor" gets nothing when the
only mention is inside a PDF body.

The fix: extract text from each PDF at build time, append it to the Fuse
index as a normal row. Apache Solr has done this for a decade via Tika —
but Solr is a JVM-based search *server*, massive overkill for static-site
ICJIA deployments. This package is the Tika-equivalent without Solr:
extract text at build time, output JSON, let the existing client-side
search engine handle the query.

The R3 site proved the approach works in ~210 lines of inline code across
three files. v1 generalizes that pattern into a publishable package.

---

## 3. Goals and non-goals

### Goals

- **Drop-in install.** `npm i @icjia/pdf-search-index`. No Java, no native
  binaries, no system deps. Works on Vercel, Netlify, Cloudflare Pages,
  GitHub Actions, any CI.
- **One-liner Fuse.js integration.** The common case ("add PDFs to my
  existing Fuse index") is three lines of consumer code.
- **Build-time only.** No runtime servers. Output is a static JSON file
  the consumer site bundles with its other static assets.
- **Five distribution surfaces from one core.** Library + helpers + CLI +
  MCP all live in the core package; Astro and Nuxt 4 adapters wrap it.
- **Snippet / highlight helper.** `snippetHTMLFor(fuseResult)` returns
  HTML with `<mark>` around the match — the part that makes results
  useful instead of just correct.
- **Cache.** Extracted text is keyed by URL hash; second-and-later builds
  are instant.
- **Graceful degradation.** A corrupt PDF doesn't fail the build — it
  logs and skips. The index stays valid.

### Non-goals

- Not a search server. No HTTP query endpoint, no inverted index, no
  live re-indexing. (For those, use Solr or Elasticsearch.)
- Not OCR. Image-only / scanned PDFs return empty text in v1.
- Not multi-format. `.docx`, `.xlsx`, `.pptx` are out of scope. Different
  format = different extractor; they belong in sibling packages.
- Not a Fuse competitor. We emit JSON. Consumers pick their engine.
- No automatic ETag-based cache invalidation in v1.

---

## 4. The 30-second integration story

You already have a static site with Fuse.js. Add PDF content searching in
three lines:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const pdfRows = await indexPdfs([
  'https://example.com/annual-report-2024.pdf',
  'https://example.com/faqs.pdf',
]);

const allRows = [...yourPageRows, ...pdfRows];
const fuse = new Fuse(allRows, { keys: ['title', 'text'], includeMatches: true });
```

For highlighted snippets in results:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

for (const r of results) {
  console.log(r.item.title, snippetHTMLFor(r));
  // "Annual Report 2024", "…the <mark>applicant portal</mark> requires…"
}
```

That's the consumer-facing surface. Everything else is configuration.

---

## 5. Architecture

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    │       @icjia/pdf-search-index           │
                    │       (core, pure functions)            │
                    │                                         │
                    │   extractPdfText(url) → string          │
                    │   extractPdfsFromBody(md) → Pdf[]       │
                    │   indexPdfs([urls]) → IndexedPdf[]      │
                    │                                         │
                    │   /fuse → createFuseIndex(...)          │
                    │   /snippet → snippetHTMLFor(result)     │
                    │   /mcp → MCP server                     │
                    │   bin → pdf-search-index CLI            │
                    │                                         │
                    └────┬────────────────────┬───────────────┘
                         │                    │
              ┌──────────┴──────┐  ┌──────────┴──────────┐
              │                 │  │                     │
              │   @icjia/astro- │  │   @icjia/nuxt-      │
              │   pdf-search-   │  │   pdf-search-       │
              │   index         │  │   index             │
              │                 │  │   (Nuxt 4)          │
              └─────────────────┘  └─────────────────────┘
```

The core library is the engine. CLI + MCP are bundled into core via `bin`
and the `./mcp` entry point. The two framework adapters are thin (≈50–100
lines each) and live in their own packages so consumers pull in only what
they use.

Each surface fails independently — an MCP server bug doesn't break the
CLI; an Astro version bump doesn't break the Nuxt module.

---

## 6. Core library API

### `extractPdfText(url, options?)`

```ts
const text = await extractPdfText('https://example.com/foo.pdf');
```

```ts
interface ExtractOptions {
  cacheDir?: string;       // default: '.pdf-cache'
  fetchTimeout?: number;   // default: 30000 (ms)
  maxBytes?: number;       // default: 100MB
  fetch?: typeof fetch;    // injectable for auth / tests
  cache?: 'use' | 'bypass' | 'refresh';  // default: 'use'
}
```

### `extractPdfsFromBody(markdown, options?)`

Scans a markdown body for PDF URLs (both `[Title](url.pdf)` markdown links
and bare `https://...pdf` URLs), extracts each one's text, returns:

```ts
interface ExtractedPdf {
  id: string;     // 'pdf-' + first 12 hex chars of SHA-256(url)
  url: string;
  title: string; // link-text > pdf.js info-dict title > humanized filename
  text: string;
}
```

Linked-text titles win over filename-derived titles. URLs appearing both
as links and bare URLs dedupe to the linked form.

### `indexPdfs(urls, options?)`

```ts
const rows = await indexPdfs([
  'https://example.com/a.pdf',
  { url: 'https://example.com/b.pdf', title: 'Custom Title' },
  { url: 'https://example.com/c.pdf', title: 'C', id: 'my-id' },
]);
```

Each entry is a bare URL string or `{ url, title?, id? }`.

### Indexed row shape

```ts
interface IndexedPdf {
  id: string;
  url: string;
  title: string;
  text: string;
  pages?: number;        // from pdf.js totalPages
  extractedAt?: string;  // ISO timestamp; omitted on cache hits
}
```

This shape is Fuse-friendly: `id` is the stable Fuse key, `title` and
`text` are the natural `keys: [...]`, `url` is the result anchor target.

---

## 7. Fuse.js integration

The bullseye reason this package exists.

### 7.1. "Just give me the PDF rows"

```ts
const pdfRows = await indexPdfs(pdfUrls);
const allRows = [...myPageRows, ...pdfRows];

const fuse = new Fuse(allRows, {
  keys: ['title', 'text'],
  threshold: 0.3,
  ignoreLocation: true,
  includeMatches: true,  // required for the snippet helper
});
```

### 7.2. "Build me a Fuse instance from scratch"

```ts
import { createFuseIndex } from '@icjia/pdf-search-index/fuse';

const fuse = await createFuseIndex({
  urls: ['https://...pdf', ...],
  fuseOptions: { threshold: 0.3, includeMatches: true },
});
```

### 7.3. "I have CMS bodies — extract URLs and index in one pass"

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';

const allPdfs = [];
for (const page of pages) {
  allPdfs.push(...await extractPdfsFromBody(page.body));
}
const uniquePdfs = [...new Map(allPdfs.map(p => [p.id, p])).values()];

const fuse = new Fuse([...pages, ...uniquePdfs], {
  keys: ['title', 'body', 'text'],
  includeMatches: true,
});
```

### 7.4. Snippet rendering

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const html = snippetHTMLFor(fuseResult, {
  contextChars: 80,
  matchKey: 'text',
  collapseWhitespace: true,
});
// "…the <mark>applicant portal</mark> requires registration…"
```

The helper picks the longest match span, slices ±N chars, collapses
whitespace (PDF text often has layout-reflow noise), HTML-escapes
everything except the `<mark>` wrap, and adds `…` ellipses where
truncated. Safe to pass to `v-html` / `dangerouslySetInnerHTML`.

---

## 8. CLI

```bash
# One-shot: index URLs to JSON
npx @icjia/pdf-search-index https://...pdf https://...pdf > index.json

# From a file (one URL per line)
npx @icjia/pdf-search-index --from urls.txt > index.json

# From a sitemap (scans pages for PDF links, indexes them)
npx @icjia/pdf-search-index --from-sitemap https://example.com/sitemap.xml \
  > index.json

# Interactive grep
npx @icjia/pdf-search-index search index.json "applicant portal"

# Force re-extraction
npx @icjia/pdf-search-index --refresh https://...pdf
npx @icjia/pdf-search-index --refresh-all --from urls.txt

# Sanity check a single PDF
npx @icjia/pdf-search-index verify https://...pdf

# Inspect cache
npx @icjia/pdf-search-index cache ls       # list cached entries
npx @icjia/pdf-search-index cache rm <url> # invalidate one
npx @icjia/pdf-search-index cache clear    # invalidate all
```

Output formats: JSON (default), `--ndjson`, `--text`.

**Exit codes:** Default `exit 0` even on individual PDF failures (graceful;
the index stays valid). `--strict` flips to `exit 1` on any extraction
failure — useful for CI where a broken upload pipeline should fail the
build.

---

## 9. MCP server

For LLM workflows where Claude (or any MCP-capable client) needs to search
inside PDFs during a conversation. Example: "What does the R3 FAQ say
about prequalification?" — the LLM should read the PDF, not guess.

```bash
npx @icjia/pdf-search-index/mcp
```

```json
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
| `extract_pdf` | Single URL → full text + page count |
| `index_pdfs` | URL list (or sitemap URL) → IndexedPdf[] |
| `get_pdf_index` | Returns the cached/built index for the session, format-agnostic |
| `search_pdfs` | URL list + query → ranked snippets (uses Fuse internally) |
| `clear_cache` | Manual flush |
| `get_status` | Server / lib / pdf.js versions, cache stats |

**Both `get_pdf_index` and `search_pdfs` ship in v1.** The raw index keeps
the MCP server format-agnostic (the LLM can grep it however it wants); the
ranked-snippet tool is the common path for "answer this question from the
PDF corpus" workflows. Internal Fuse use does not couple consumers —
only the MCP server depends on Fuse.

All tools accept an optional `cacheDir` so a single-session conversation
doesn't pollute the user's persistent cache.

**Auth in v1:** none. The server fetches public URLs only. The
`fetchHeaders` option ships when a real consumer needs auth-protected
sources.

**Framework:** `@modelcontextprotocol/sdk` (official Anthropic TS SDK).

---

## 10. Astro integration

`@icjia/astro-pdf-search-index` is a thin wrapper around the core. It
provides an Astro integration that:

1. Walks configured content collections
2. Calls `extractPdfsFromBody(entry.data.body)` on each
3. Emits a JSON endpoint at a configurable path

```ts
// astro.config.ts
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: '/searchIndex.pdfs.json',
      cacheDir: '.astro/.pdf-cache',
    }),
  ],
});
```

R3 is the proven reference for this pattern. The integration is a strict
generalization of `docs/searchIndex.json.ts`.

---

## 11. Nuxt 4 module

`@icjia/nuxt-pdf-search-index` is the Nuxt 4 adapter. The target site uses
**mixed content sources**: some content comes from a remote CMS (Strapi-
style), some from `@nuxt/content` (markdown files in the repo).

The module provides two extraction helpers and a shared Nitro server route
template:

### Helpers

```ts
// In server/api/searchIndex.get.ts (or a Nitro plugin)
import {
  extractPdfsFromCmsBody,
  extractPdfsFromContentDoc,
} from '@icjia/nuxt-pdf-search-index/server';
import { serverQueryContent } from '#content/server';

export default defineEventHandler(async (event) => {
  // CMS source
  const cmsPages = await $fetch('https://cms.example.com/api/pages');
  const cmsPdfs = [];
  for (const page of cmsPages) {
    cmsPdfs.push(...await extractPdfsFromCmsBody(page.attributes.body));
  }

  // @nuxt/content source
  const docs = await serverQueryContent(event).find();
  const contentPdfs = [];
  for (const doc of docs) {
    contentPdfs.push(...await extractPdfsFromContentDoc(doc));
  }

  // Dedupe and merge
  const pdfs = [...new Map(
    [...cmsPdfs, ...contentPdfs].map(p => [p.id, p])
  ).values()];

  return [...cmsPages, ...docs, ...pdfs];
});
```

### Module config

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
    contentSources: ['cms', 'content'],  // hints; the route logic is consumer-owned
  },
});
```

### Design notes

- **The shared Nitro route is a *template*, not a generated file.** The
  consumer site copies it and adapts the CMS fetch call to its own
  endpoint. We don't try to auto-fetch unknown CMS APIs.
- `extractPdfsFromContentDoc` traverses the parsed AST from `@nuxt/content`
  rather than re-parsing markdown — slightly more accurate than scanning
  the source string.
- `extractPdfsFromCmsBody` is identical to `extractPdfsFromBody` in core —
  re-exported under a clearer name for Nuxt's mental model.
- Module uses `addServerImports` to inject the helpers under `#imports`.

---

## 12. PDF library

`unpdf` (Anthony Fu / unjs). Modern ESM wrapper around pdf.js. Clean API:
`getDocumentProxy(buf)` → `extractText(pdf, { mergePages: true })`. Pure
JS, no native deps.

Alternative: `pdfjs-dist` directly (more verbose, no extra wrapper). Used
only if `unpdf` blocks us on a specific feature. `pdf-parse` is a fallback
if `unpdf` ever has issues. `pdftotext` (poppler) is rejected for v1
because it requires a system binary.

---

## 13. Caching

URL-keyed file cache. Cache key = first 16 hex chars of `SHA-256(url)`.
Default location: `.pdf-cache/`.

**Read-through, write-back flow:**

1. Look for `<cacheDir>/<key>.txt`. If found, return contents.
2. Fetch the PDF.
3. Run `unpdf` extraction.
4. Write text + sidecar metadata to cache.
5. Return text.

**Cache file layout** (v1.0):

- `<cacheDir>/<key>.txt` — extracted text (the data plane)
- `<cacheDir>/<key>.meta.json` — sidecar with `{ url, length, pages, extractedAt }`

The sidecar enables `cache ls` to show what's in the cache without
re-fetching, and supports later features like content-hash invalidation.

**No automatic invalidation in v1.** PDFs in most CMS systems are
content-addressed at the storage layer (a new version gets a new URL).
If a PDF is mutated in place at the same URL, the user runs `--refresh
<url>` or `cache clear`.

---

## 14. Concurrency

Fetches run through `p-limit(4)` by default. Configurable via the
`concurrency` option on `indexPdfs` / module config / CLI flag. Single-URL
calls (`extractPdfText`, CLI `verify`) ignore the limit.

Rationale: a sitemap-driven indexer hitting 100+ PDFs across pages can
unintentionally DoS a slow CDN if launched with unbounded `Promise.all`.
4 is conservative for slow CDNs but plenty for a 30-PDF ICJIA site.

---

## 15. Title fallback chain

When emitting an `IndexedPdf.title`:

1. Markdown link text (`[Title](url.pdf)`)
2. pdf.js info-dict `title` (the metadata embedded in the PDF itself)
3. Humanized filename (`r3-faq-2024.pdf` → `R3 Faq 2024`)

Step 2 is new in v1 vs the R3 reference. It cleanly handles "Click here"-
style links where the link text is generic but the PDF metadata has a
proper title.

---

## 16. Output format

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

`pages` and `extractedAt` are optional. `extractedAt` is **omitted on
cache hits** so the JSON is byte-stable across rebuilds. This makes
diffs reviewable and CDN caching effective.

`import type { IndexedPdf } from '@icjia/pdf-search-index'` for strict
typing.

---

## 17. Error handling

All failures are non-fatal:

| Failure | Behavior |
|---|---|
| Network error (DNS, timeout, refused) | Log warning, return `{ url, title, text: '' }` |
| HTTP non-2xx | Log warning with status, return empty text |
| Body bigger than `maxBytes` | Log warning, return empty text |
| pdf.js parse error (corrupt PDF) | Log warning with error message, return empty text |
| Encrypted PDF (no password) | Log warning, return empty text |
| Image-only / scanned PDF | Empty text returned silently (text layer is genuinely empty) |
| Cache write error (disk full, EACCES) | Log warning, return extracted text without caching |

Consumers receive `{ ..., text: '' }` for failed entries. The index stays
valid. Search just doesn't match those PDFs. The build doesn't fail.

CLI `--strict` flag flips to `exit 1` on any failure.

---

## 18. Repo / monorepo structure

pnpm workspace monorepo at `github.com/ICJIA/pdf-search-index`:

```
pdf-search-index/
├── package.json                           (private, workspaces root)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .changeset/                            (version + changelog)
├── .github/workflows/
│   ├── ci.yml                             (test on Node 20 + 22)
│   └── release.yml                        (changesets publish)
├── README.md                              (top-level, links to packages)
├── LICENSE                                (MIT)
├── docs/                                  (existing — design seed + ref impl)
│   ├── PDF_SEARCH_DESIGN.md
│   ├── pdfText.ts
│   ├── searchIndex.json.ts
│   ├── Search.vue
│   └── superpowers/specs/                 (this spec + future specs)
├── packages/
│   ├── core/                              (@icjia/pdf-search-index)
│   │   ├── src/
│   │   │   ├── index.ts                   (extractPdfText, extractPdfsFromBody, indexPdfs)
│   │   │   ├── extractor.ts               (unpdf wrapper)
│   │   │   ├── cache.ts                   (file-based cache + sidecar metadata)
│   │   │   ├── url-scan.ts                (markdown PDF-URL discovery)
│   │   │   ├── fuse.ts                    (./fuse entry — createFuseIndex)
│   │   │   ├── snippet.ts                 (./snippet entry — snippetHTMLFor)
│   │   │   ├── cli.ts                     (bin entry)
│   │   │   ├── mcp.ts                     (./mcp entry — MCP server)
│   │   │   ├── types.ts                   (IndexedPdf + option shapes)
│   │   │   └── concurrency.ts             (p-limit wrapper)
│   │   ├── test/
│   │   │   ├── fixtures/
│   │   │   │   ├── small-text.pdf
│   │   │   │   ├── multi-page.pdf
│   │   │   │   ├── image-only.pdf
│   │   │   │   └── encrypted.pdf
│   │   │   ├── extractor.test.ts
│   │   │   ├── cache.test.ts
│   │   │   ├── url-scan.test.ts
│   │   │   ├── snippet.test.ts
│   │   │   ├── cli.test.ts
│   │   │   └── mcp.test.ts
│   │   ├── tsup.config.ts
│   │   └── package.json
│   ├── astro-pdf-search-index/            (@icjia/astro-pdf-search-index)
│   │   ├── src/index.ts                   (Astro integration)
│   │   ├── test/                          (integration tests against a tiny Astro fixture)
│   │   ├── tsup.config.ts
│   │   └── package.json
│   └── nuxt-pdf-search-index/             (@icjia/nuxt-pdf-search-index)
│       ├── src/
│       │   ├── module.ts                  (Nuxt module entry)
│       │   ├── runtime/server/
│       │   │   ├── helpers.ts             (extractPdfsFromCmsBody, extractPdfsFromContentDoc)
│       │   │   └── route-template.ts      (Nitro route template)
│       │   └── types.ts
│       ├── test/
│       ├── build.config.ts                (unbuild config)
│       └── package.json
└── examples/
    ├── astro/                              (Astro + Fuse + @icjia/pdf-search-index)
    ├── vue/                                (Vite + Vue 3 + Fuse + @icjia/pdf-search-index)
    ├── html/                               (plain HTML + Fuse, index built via CLI)
    ├── nextjs/                             (Next.js app router + Fuse + @icjia/pdf-search-index)
    ├── eleventy/                           (Eleventy/11ty static site + Fuse, index built via CLI)
    ├── plain-node/                         (programmatic API showcase, no framework)
    └── nuxt-mixed/                         (Nuxt 4 adapter: Strapi + @nuxt/content)
```

`astro`, `vue`, `html` are explicit user requirements added on
2026-05-15. `nextjs`, `eleventy`, `plain-node` are added to broaden the
showcase across React-land, govt/civic static sites (11ty is heavily
used by USWDS-adjacent agencies), and direct programmatic API usage.

Each example must be runnable locally (`pnpm dev` or `pnpm start`),
consume `@icjia/pdf-search-index` via the pnpm workspace link, and
include a short example-local README describing the integration pattern.

`nuxt-mixed` exists primarily to validate the Nuxt 4 adapter against a
representative mixed-content site (Strapi-style remote CMS plus
`@nuxt/content` markdown), not as a showcase example.

A `LICENSE` file (MIT) and a very detailed top-level `README.md` are also
v1.0 ship-blockers. The LICENSE lands in Plan 1; the detailed README is
finalized at the end of Plan 2 when the full surface area exists to
document.

### Tooling

- **Workspace:** pnpm 9.x with `pnpm-workspace.yaml`
- **Build (core, Astro):** `tsup` — fast ESM + DTS, zero config
- **Build (Nuxt module):** `unbuild` — unjs convention, plays well with
  Nuxt 4's module conventions
- **Test:** `vitest` — shared base config in `tsconfig.base.json`
- **Lint:** `oxlint` (fast); `eslint` available if existing ICJIA config
  needs to apply
- **Format:** `prettier`
- **Versioning:** `changesets` — independent per-package versions,
  automated release notes
- **CI:** GitHub Actions, Node 20 + 22 matrix, pnpm cache
- **MCP framework:** `@modelcontextprotocol/sdk`

### `core/package.json` exports (illustrative)

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
    "unpdf": "^1.6.0",
    "p-limit": "^6.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "peerDependencies": {
    "fuse.js": "^7.0.0"
  },
  "peerDependenciesMeta": {
    "fuse.js": { "optional": true }
  }
}
```

`fuse.js` is a peer dep — only required if the consumer imports `/fuse`
or `/snippet`.

---

## 19. Implementation order (for the writing-plans phase)

The implementation plan should sequence the work as:

1. **Repo scaffold** — pnpm workspace, root config, CI skeleton, lint/format
2. **Core extractor + cache** — port `pdfText.ts` to `packages/core`, add
   `p-limit` concurrency, sidecar metadata, info-dict title fallback,
   `mergePages: false` opt-in
3. **Core types + URL scanner + Fuse helper + Snippet helper** — tests for
   each
4. **CLI** — `commander`-based, all subcommands, tests
5. **MCP server** — both `get_pdf_index` and `search_pdfs` tools, tests
6. **Astro integration** — generalize from `docs/searchIndex.json.ts`,
   integration test
7. **Nuxt 4 module** — two helpers + Nitro route template, integration test
8. **Examples** — `/examples/astro`, `/examples/vue`, `/examples/html` (user-required), plus `/examples/nextjs`, `/examples/eleventy`, `/examples/plain-node` (showcase additions), plus `/examples/nuxt-mixed` for adapter validation. Every example must run locally via its own `pnpm dev`/`pnpm start`.
9. **Docs polish + very detailed top-level `README.md`** — covers all three packages, CLI, MCP server, each example's integration pattern, and a side-by-side comparison of the integration code across the six showcase examples; links generously between packages
10. **R3 dogfood** — replace R3's inline reference with the npm package;
    confirm zero behavior change

Each step gets its own commit; each package gets its own changeset entry.

---

## 20. Test approach

- **Unit tests:** Each core module tested in isolation against fixture PDFs.
  Fixtures cover: small text-only PDF, multi-page PDF, image-only PDF,
  encrypted PDF, corrupt PDF.
- **CLI tests:** Spawn the built bin against fixtures, assert stdout / exit
  codes.
- **MCP tests:** Use `@modelcontextprotocol/sdk`'s in-process transport;
  assert tool surface and outputs.
- **Astro integration test:** Tiny Astro fixture project with one
  collection, one page, one PDF; run `astro build`, assert the JSON output.
- **Nuxt module test:** Tiny Nuxt 4 fixture project with `@nuxt/content`
  + a mocked CMS fetch; run `nuxt build`, assert the JSON output.
- **CI matrix:** Node 20 + 22 on Ubuntu (Mac/Windows added if real CI
  pain emerges).

---

## 21. Deferred to post-v1

Tracked here so the v1 scope stays disciplined:

| Feature | When |
|---|---|
| OCR for scanned PDFs | Separate package `@icjia/pdf-search-index-ocr` when a real consumer site needs it |
| ETag-based cache invalidation | When in-place PDF mutation becomes a real pain point |
| Auth-protected PDF sources | When a consumer needs it; ships as `fetchHeaders` option |
| Multi-format siblings (docx/xlsx/pptx) | Separate packages when prioritized |
| PDF metadata index (author, subject, etc.) | Easy add later; not in v1 scope |
| Per-page snippet links (`...#page=N`) | Requires `mergePages: false` adoption first |
| Client-side runtime extraction (Web Worker) | Only if a site exceeds the 1,000-PDF ceiling |

---

## 22. Migration / rollout order

When v1 ships:

1. **R3** — already has the inline reference; swap for the npm package.
   No behavior change; validates the API.
2. **Target Nuxt 4 site** (consumer-named, not in this spec) — first real
   Nuxt 4 adapter integration. Validates the mixed CMS + `@nuxt/content`
   path.
3. **i2i and other Astro ICJIA sites** — proves drop-in works on peer
   Astro sites.
4. **DVFR (`dvfr.illinois.gov`)** — second Astro integration.
5. **Smaller / older ICJIA sites** — case-by-case.

---

## Appendix A — Resolved decisions

All Appendix A questions from the original design doc are resolved:

| # | Decision |
|---|---|
| A.1 Concurrency | `p-limit(4)` default, configurable |
| A.2 Merged vs per-page | `mergePages: true` default; `mergePages: false` opt-in for `{ pageNum, text }[]` |
| A.3 Title heuristics | link-text → pdf.js info-dict title → humanized filename |
| A.4 JSON byte-stability | Omit `extractedAt` on cache hits |
| A.5 CLI exit codes | Exit 0 default; `--strict` flips to exit 1 on any failure |
| A.6 MCP scope | Ship BOTH `get_pdf_index` (raw) AND `search_pdfs` (Fuse-ranked) |

---

## Appendix B — Diffs from the original design doc

For reviewers familiar with `docs/PDF_SEARCH_DESIGN.md`, the substantive
changes:

1. **Monorepo with pnpm + changesets** (was unspecified; doc said
   "separate packages" without committing to layout).
2. **CLI and MCP live inside core** (was implied but layout was ambiguous).
3. **Nuxt 4 specifically, mixed content sources** (was generic "Nuxt"
   with `@nuxt/content` mentioned as one option). Two named helpers
   replace the implied single helper.
4. **Both MCP tools ship** (was an open either/or in Appendix A.6).
5. **Concurrency = `p-limit(4)`** (was open in A.1; reference impl used
   unbounded `Promise.all`).
6. **Title fallback adds pdf.js info-dict** (R3 reference didn't; new in v1).
7. **Cache sidecar `.meta.json`** (was unspecified; enables `cache ls`).
8. **Tooling stack pinned** (tsup, unbuild, vitest, oxlint, changesets,
   `@modelcontextprotocol/sdk`).
9. **Implementation order** (Section 19) added for the writing-plans phase.

---

*Spec authored 2026-05-15 after a brainstorming pass against
`docs/PDF_SEARCH_DESIGN.md` and the R3 reference impl.*
