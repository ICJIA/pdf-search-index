# @icjia/pdf-search-index

> Full-text PDF search for static sites that already use [Fuse.js](https://www.fusejs.io/). Build-time PDF text extraction, no runtime servers, no native deps.

PDFs become first-class search rows alongside your pages and posts. A query like `"stigma"` matches the body of the **linked PDF** — not just the prose that links to it — and returns the PDF as a result with a `<mark>`-highlighted snippet from the surrounding text.

```
                    ┌─────────────────────────────────────────┐
                    │       @icjia/pdf-search-index           │
                    │       (core, pure functions)            │
                    │                                         │
                    │   extractPdfText(url) → string          │
                    │   extractPdfsFromBody(md) → IndexedPdf[]│
                    │   indexPdfs([urls]) → IndexedPdf[]      │
                    │                                         │
                    │   /fuse → createFuseIndex(...)          │
                    │   /snippet → snippetHTMLFor(result)     │
                    │   /mcp → MCP server                     │
                    │   bin → pdf-search-index CLI            │
                    └────┬────────────────────┬───────────────┘
                         │                    │
              ┌──────────┴──────┐  ┌──────────┴──────────┐
              │ @icjia/astro-   │  │ @icjia/nuxt-        │
              │ pdf-search-     │  │ pdf-search-         │
              │ index           │  │ index (Nuxt 4)      │
              └─────────────────┘  └─────────────────────┘
```

| Package                                                              | Version  | Description                                 |
| -------------------------------------------------------------------- | -------- | ------------------------------------------- |
| [`@icjia/pdf-search-index`](./packages/core)                         | `^1.0.0` | Core library, CLI, MCP server, helpers      |
| [`@icjia/astro-pdf-search-index`](./packages/astro-pdf-search-index) | `^1.0.0` | Astro 5 integration                         |
| [`@icjia/nuxt-pdf-search-index`](./packages/nuxt-pdf-search-index)   | `^1.0.0` | Nuxt 4 module (mixed CMS + `@nuxt/content`) |

ESM only. MIT licensed. Node 20 LTS / 22 LTS.

---

## Why this exists

ICJIA sites publish many PDFs — annual reports, FAQs, technical documents, board materials — that are invisible to site search today. Most ICJIA sites use Fuse.js for client-side fuzzy search, which works for pages and news posts but only matches the **prose that links to a PDF**, never the PDF's content.

The fix: extract text from each PDF at build time, append it to the Fuse index as a normal row. Solr has done this for a decade via Tika, but Solr is a JVM-based search **server** — overkill for static sites. This package is the Tika-equivalent without Solr: extract text at build time, output JSON, let the existing client-side search engine handle the query.

The R3 site proved the approach works in ~210 lines of inline code across three files. v1 generalizes that pattern into a publishable package.

---

## The 30-second integration

You already have a static site with Fuse.js. Add PDF content search in three lines:

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
  // → "Stigma PDF For Posting" "…recovery from substance use disorder is hampered by <mark>stigma</mark>…"
}
```

That's the consumer-facing surface. Everything else is configuration.

---

## Install

```bash
npm install @icjia/pdf-search-index
# or
pnpm add @icjia/pdf-search-index
# or
yarn add @icjia/pdf-search-index
```

Optional peer dependencies (only needed if you import the listed entry points):

| Entry point | Peer dependency | Required when                                   |
| ----------- | --------------- | ----------------------------------------------- |
| `/fuse`     | `fuse.js@^7`    | You import `createFuseIndex`                    |
| `/snippet`  | `fuse.js@^7`    | You import `snippetHTMLFor` (uses Fuse's types) |
| `/mcp`      | none            | Always — MCP SDK is bundled                     |

The core `indexPdfs` / `extractPdfText` / `extractPdfsFromBody` functions don't require `fuse.js` at all.

---

## Core API

### `extractPdfText(url, options?) → Promise<string>`

Fetch a PDF and return its text. The lowest-level entry point.

```ts
import { extractPdfText } from '@icjia/pdf-search-index';

const text = await extractPdfText('https://example.com/foo.pdf');
console.log(text.slice(0, 200));
```

**Options** (`ExtractOptions`):

| Option         | Type                             | Default                      | Notes                                            |
| -------------- | -------------------------------- | ---------------------------- | ------------------------------------------------ |
| `cacheDir`     | `string`                         | `'.pdf-cache'`               | Where extracted text is cached on disk           |
| `fetchTimeout` | `number` (ms)                    | `30000`                      | Abort the fetch after this many ms               |
| `maxBytes`     | `number`                         | `100 * 1024 * 1024` (100 MB) | Reject PDFs larger than this                     |
| `fetch`        | `typeof fetch`                   | global `fetch`               | Inject your own (auth headers, `file://`, tests) |
| `cache`        | `'use' \| 'bypass' \| 'refresh'` | `'use'`                      | `bypass` skips read+write; `refresh` overwrites  |
| `mergePages`   | `boolean`                        | `true`                       | When `false`, returns one entry per page         |

### `indexPdfs(urls, options?) → Promise<IndexedPdf[]>`

Batch-index an array of PDF URLs.

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  'https://example.com/a.pdf',
  { url: 'https://example.com/b.pdf', title: 'Custom Title' },
  { url: 'https://example.com/c.pdf', title: 'C', id: 'my-id' },
]);
```

Each entry is either a bare URL string or `{ url, title?, id? }`. Duplicates by URL are deduped (first occurrence wins).

**Additional option** beyond `ExtractOptions`:

| Option        | Type     | Default | Notes                          |
| ------------- | -------- | ------- | ------------------------------ |
| `concurrency` | `number` | `4`     | Parallel fetches via `p-limit` |

### `extractPdfsFromBody(markdown, options?) → Promise<IndexedPdf[]>`

Scan a markdown body for PDF URLs (both `[Title](url.pdf)` markdown links and bare `https://...pdf` URLs), extract each, return rows.

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';

const rows = await extractPdfsFromBody(page.body);
```

Title resolution order: markdown link text > pdf.js info-dict `Title` > humanized filename.

### Indexed row shape

```ts
interface IndexedPdf {
  id: string; // 'pdf-' + first 12 hex chars of SHA-256(url)
  url: string;
  title: string; // see title resolution order
  text: string; // empty string on extraction failure
  pages?: number; // total pages (when known)
  extractedAt?: string; // ISO timestamp; OMITTED on cache hits
}
```

`pages` and `extractedAt` are optional. `extractedAt` is **omitted on cache hits** so the JSON is byte-stable across rebuilds — diffs stay reviewable and CDN caching works.

---

## Fuse helper (`/fuse` entry)

```ts
import { createFuseIndex } from '@icjia/pdf-search-index/fuse';

const fuse = await createFuseIndex({
  urls: ['https://example.com/a.pdf', 'https://example.com/b.pdf'],
  fuseOptions: { threshold: 0.3, includeMatches: true },
});

const results = fuse.search('methamphetamine');
```

The defaults Fuse uses (when you pass `fuseOptions`, they're merged on top of):

```ts
{
  keys: ['title', 'text'],
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
}
```

The same defaults are used by the CLI's `search` subcommand and the MCP `search_pdfs` tool — keeping them DRY across surfaces means your CLI/MCP/in-browser results behave the same.

---

## Snippet helper (`/snippet` entry)

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const html = snippetHTMLFor(fuseResult, {
  contextChars: 80,
  matchKey: 'text',
  collapseWhitespace: true,
});
// → "…recovery from substance use disorder is hampered by <mark>stigma</mark>…"
```

Picks the longest match span in the matched key, slices ±N chars of context, collapses whitespace runs (PDF text reflow is noisy), HTML-escapes everything except the `<mark>` wrap, and adds ellipses where truncated. Safe to feed to `v-html` / `dangerouslySetInnerHTML`.

**Options:**

| Option               | Type      | Default  | Notes                                           |
| -------------------- | --------- | -------- | ----------------------------------------------- |
| `contextChars`       | `number`  | `80`     | Characters of context on each side of the match |
| `matchKey`           | `string`  | `'text'` | Which Fuse `matches` entry to use               |
| `collapseWhitespace` | `boolean` | `true`   | Collapse `\s+` to single space inside output    |

---

## CLI (`pdf-search-index` bin)

```bash
# One-shot: index URLs to JSON
npx @icjia/pdf-search-index https://...pdf https://...pdf

# From a file (one URL per line, # comments allowed)
npx @icjia/pdf-search-index --from urls.txt

# From a sitemap (scans pages for PDF links, indexes them)
npx @icjia/pdf-search-index --from-sitemap https://example.com/sitemap.xml

# Write to a file instead of stdout
npx @icjia/pdf-search-index --out public/searchIndex.json https://...pdf

# Force re-extraction (skip cache read, skip cache write)
npx @icjia/pdf-search-index --refresh https://...pdf
# Refetch but overwrite cache
npx @icjia/pdf-search-index --refresh-all https://...pdf

# Sanity check a single PDF (exit 1 on failure)
npx @icjia/pdf-search-index verify https://...pdf

# Search a previously built JSON
npx @icjia/pdf-search-index search index.json "drug testing"

# Cache management
npx @icjia/pdf-search-index cache ls           # list cached entries with url, length, pages, extractedAt
npx @icjia/pdf-search-index cache rm <url>     # invalidate one
npx @icjia/pdf-search-index cache clear        # wipe the whole cache
```

**Output formats** (root command):

- Default: pretty JSON to stdout
- `--ndjson`: one row per line
- `--text`: concatenated extracted text, no metadata

**Exit codes:**

- `0` by default, **even on individual PDF failures** (the index stays valid; the failed row has `text: ''`)
- `1` when `--strict` is set and any PDF failed extraction

**Global options:**

| Option                 | Type   | Default      | Notes                                |
| ---------------------- | ------ | ------------ | ------------------------------------ |
| `--from <file>`        | path   | —            | Read URLs from a file (one per line) |
| `--from-sitemap <url>` | url    | —            | Scan a sitemap, index linked PDFs    |
| `--cache-dir <dir>`    | path   | `.pdf-cache` | Cache directory                      |
| `--concurrency <n>`    | number | `4`          | Parallel fetches                     |
| `--out <file>`         | path   | stdout       | Where to write the output            |
| `--strict`             | flag   | off          | Exit 1 if any PDF failed             |
| `--refresh`            | flag   | off          | Refetch (do not write cache)         |
| `--refresh-all`        | flag   | off          | Refetch and overwrite cache          |
| `--ndjson`             | flag   | off          | Emit newline-delimited JSON          |
| `--text`               | flag   | off          | Emit concatenated text only          |

---

## MCP server (`/mcp` entry)

For LLM workflows where the model needs to search inside PDFs during a conversation.

```bash
npx @icjia/pdf-search-index/mcp
```

Wire it into Claude Desktop / Cursor / any MCP-aware client:

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

**Tools:**

| Tool            | Purpose                                                     |
| --------------- | ----------------------------------------------------------- |
| `extract_pdf`   | Single URL → `{ text, pages }`                              |
| `index_pdfs`    | URL list (or sitemap URL) → `IndexedPdf[]`                  |
| `get_pdf_index` | Returns the cached/built index for the session              |
| `search_pdfs`   | URL list + query → ranked snippets (Fuse-powered, internal) |
| `clear_cache`   | Manual flush                                                |
| `get_status`    | Server / library / pdf.js versions, cache stats             |

All tools accept an optional `cacheDir` so a single-session conversation doesn't pollute the user's persistent cache.

**Auth in v1**: none — the server fetches public URLs only. Add a `fetchHeaders` option when a real consumer needs auth.

---

## Astro integration

```bash
npm install @icjia/pdf-search-index @icjia/astro-pdf-search-index
```

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: '.astro/.pdf-cache',
    }),
  ],
});
```

The integration:

1. Walks each configured content collection.
2. Reads every `.md` / `.mdx` file, strips frontmatter, and passes the body to `extractPdfsFromBody`.
3. Dedupes PDF rows across collections.
4. Writes JSON to `public/<endpoint>` so Astro's build pipeline ships it alongside other static assets.

**Options:**

| Option             | Type           | Default                   | Notes                                             |
| ------------------ | -------------- | ------------------------- | ------------------------------------------------- |
| `collections`      | `string[]`     | (required)                | Names of Astro content collections                |
| `endpoint`         | `string`       | `'searchIndex.pdfs.json'` | Output filename under `public/`                   |
| `cacheDir`         | `string`       | `'.astro/.pdf-cache'`     | Extraction cache                                  |
| `concurrency`      | `number`       | `4`                       | Parallel fetches                                  |
| `contentSourceDir` | `string`       | `'content'`               | Directory under `srcDir` containing collections   |
| `fetch`            | `typeof fetch` | global `fetch`            | Custom fetch (auth, `file://` for tests/examples) |

In production you don't need the `fetch` option — your CMS-authored markdown links to real https URLs.

---

## Nuxt 4 module

```bash
npm install @icjia/pdf-search-index @icjia/nuxt-pdf-search-index
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
});
```

The module auto-imports two helpers into server-side `#imports`:

- `extractPdfsFromCmsBody(body, options?)` — for Strapi-style CMS body strings
- `extractPdfsFromContentDoc(doc, options?)` — for `@nuxt/content` docs (accepts `{ body }`, `{ _raw }`, `{ rawbody }`, or a plain markdown string)

Both honor `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from `nuxt.config.ts` unless overridden by the per-call `options` arg. Both return `IndexedPdf[]`.

A copy-paste Nitro route template lives at [`packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts`](./packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts). Drop it at `server/api/searchIndex.get.ts` in your Nuxt project and adapt the CMS fetch + `@nuxt/content` query to your stack.

---

## Examples

The [`examples/`](./examples) directory has seven runnable example sites, each demonstrating one integration pattern. Every example consumes the packages via the pnpm workspace link and reads PDFs from the shared [`examples/_fixtures/`](./examples/_fixtures) directory via `file://` URLs + a tiny `local-fetch.mjs` helper (so they work offline).

The fixture PDFs in [`examples/_fixtures/`](./examples/_fixtures) are **randomly-clicked public samples from ICJIA's website** ([icjia.illinois.gov](https://icjia.illinois.gov/)). They were not curated to make the examples look good — they're four arbitrary PDFs from the live public corpus, preserved with their original CMS filenames. None of them contain PII. Replace them with any PDFs you like; every example auto-discovers `.pdf` files in that directory at build time. See [`examples/_fixtures/README.md`](./examples/_fixtures/README.md) for the full provenance note.

| Example                               | Stack                               | Adapter / API                                                   | Run                                              |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| [`plain-node`](./examples/plain-node) | Node 20+, no UI                     | Programmatic (`indexPdfs`, `createFuseIndex`, `snippetHTMLFor`) | `pnpm --filter @icjia-examples/plain-node start` |
| [`html`](./examples/html)             | Vanilla HTML + Fuse CDN             | Programmatic, build via Node script                             | `pnpm --filter @icjia-examples/html dev`         |
| [`vue`](./examples/vue)               | Vite + Vue 3 + Fuse                 | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/vue dev`          |
| [`astro`](./examples/astro)           | Astro 5 + Vue island + Fuse         | `@icjia/astro-pdf-search-index`                                 | `pnpm --filter @icjia-examples/astro dev`        |
| [`nextjs`](./examples/nextjs)         | Next.js 15 App Router + Fuse        | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/nextjs dev`       |
| [`eleventy`](./examples/eleventy)     | 11ty 3 + Fuse CDN                   | Programmatic, inline JSON island                                | `pnpm --filter @icjia-examples/eleventy dev`     |
| [`nuxt-mixed`](./examples/nuxt-mixed) | Nuxt 4 + `@nuxt/content` + mock CMS | `@icjia/nuxt-pdf-search-index` (both helpers)                   | `pnpm --filter @icjia-examples/nuxt-mixed dev`   |

### Examples — step-by-step

1. **Clone, install, and confirm fixtures are present:**

   ```bash
   git clone https://github.com/ICJIA/pdf-search-index.git
   cd pdf-search-index
   pnpm install
   ls examples/_fixtures/*.pdf
   ```

   You should see four PDFs — they're randomly-clicked public samples from
   [icjia.illinois.gov](https://icjia.illinois.gov/) (see
   [`examples/_fixtures/README.md`](./examples/_fixtures/README.md) for
   provenance). No PII.

2. **Pick an example and run its dev script:**

   ```bash
   # Programmatic API, no UI
   pnpm --filter @icjia-examples/plain-node start

   # Vanilla HTML + Fuse via CDN
   pnpm --filter @icjia-examples/html dev          # http://localhost:4173/

   # Vite + Vue 3
   pnpm --filter @icjia-examples/vue dev           # http://localhost:5173/

   # Astro 5 + Vue island + integration
   pnpm --filter @icjia-examples/astro dev         # http://localhost:4321/

   # Next.js 15 App Router
   pnpm --filter @icjia-examples/nextjs dev        # http://localhost:3000/

   # 11ty 3 + inline JSON island
   pnpm --filter @icjia-examples/eleventy dev      # http://localhost:8080/

   # Nuxt 4 + @nuxt/content + mocked CMS
   pnpm --filter @icjia-examples/nuxt-mixed dev    # http://localhost:3001/
   ```

3. **Try a query that matches the committed fixtures.** The four samples
   are about stigma, drug testing, methamphetamine trends, and juvenile
   justice — so search terms that work out of the box include:
   - `"stigma"` — matches the Stigma PDF
   - `"methamphetamine"` — matches the meth-trends overview
   - `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot
   - `"drug testing"` — matches the drug-testing lit review

4. **Build for production:**

   ```bash
   pnpm --filter @icjia-examples/<name> build
   pnpm --filter @icjia-examples/<name> preview    # or `serve`, or `start`
   ```

   Each example documents its build output and serve command in its own
   README — see the table above.

### Side-by-side integration code

The core "how does the integration look?" comparison across stacks:

**plain-node (programmatic)**

```js
import { indexPdfs } from '@icjia/pdf-search-index';
const rows = await indexPdfs(['https://example.com/foo.pdf']);
// rows is ready to merge into your Fuse data
```

**Astro (adapter)**

```ts
// astro.config.ts
import pdfSearch from '@icjia/astro-pdf-search-index';
export default defineConfig({
  integrations: [pdfSearch({ collections: ['docs'], endpoint: 'searchIndex.pdfs.json' })],
});
```

**Nuxt (adapter + server route)**

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['@icjia/nuxt-pdf-search-index'] });

// server/api/searchIndex.get.ts
import { extractPdfsFromCmsBody } from '#imports';
export default defineEventHandler(async () => {
  const rows = await $fetch('https://cms.example.com/api/pages');
  const pdfs = [];
  for (const r of rows.data) pdfs.push(...(await extractPdfsFromCmsBody(r.attributes.body)));
  return pdfs;
});
```

**Vite / Next.js / 11ty / vanilla HTML (build-script pattern)**

```js
// build-index.mjs (run as a `prebuild` script)
import { indexPdfs } from '@icjia/pdf-search-index';
import { writeFile } from 'node:fs/promises';
const rows = await indexPdfs([
  /* your PDF URLs */
]);
await writeFile('public/searchIndex.json', JSON.stringify(rows));
```

### What if I want to use my own PDFs?

Drop them into `examples/_fixtures/` and re-run the example. Each example detects every `.pdf` in that directory and indexes all of them.

If you'd rather wire up a totally different URL set, edit the example's `build-index.mjs` (or, for Astro / Nuxt examples, the `scripts/generate-content.mjs` content-generation step). Each example has a comment block explaining where to swap.

---

## Caching

URL-keyed file cache at `<cacheDir>/<hash>.txt` + `<cacheDir>/<hash>.meta.json` sidecar. Cache key = first 16 hex chars of SHA-256(url).

**Read-through, write-back flow:**

1. Look for `<cacheDir>/<key>.txt`. If found, return contents.
2. Fetch the PDF.
3. Run extraction via `unpdf`.
4. Write text + sidecar metadata.
5. Return text.

**No automatic invalidation in v1.** PDFs in most CMS systems are content-addressed at the storage layer (a new version gets a new URL). If a PDF mutates in place at the same URL, run `pdf-search-index --refresh <url>` or `pdf-search-index cache clear`.

ETag-based invalidation is on the post-v1 roadmap; it lands when in-place PDF mutation becomes a real consumer pain point.

---

## Error handling

All failures are **non-fatal by default**. The index stays valid; failed rows have `text: ''`; the build doesn't fail.

| Failure                               | Behavior                                            |
| ------------------------------------- | --------------------------------------------------- |
| Network error (DNS, timeout, refused) | Log warning, return `{ ..., text: '' }`             |
| HTTP non-2xx                          | Log warning with status, return `{ ..., text: '' }` |
| Body bigger than `maxBytes`           | Log warning, return `{ ..., text: '' }`             |
| pdf.js parse error (corrupt PDF)      | Log warning with error message, return empty text   |
| Encrypted PDF (no password)           | Log warning, return empty text                      |
| Image-only / scanned PDF              | Empty text returned silently (no text layer)        |
| Cache write error (disk full, EACCES) | Log warning, return text without caching            |

For CI where a broken upload pipeline should fail the build, run the CLI with `--strict` to flip to `exit 1`.

OCR for scanned PDFs is out of scope for v1 — it lands in a separate `@icjia/pdf-search-index-ocr` package when a real consumer needs it.

---

## Troubleshooting

**My index has rows but `text` is empty.**
The PDF is likely image-only / scanned. Open it in a viewer; if you can't select text, neither can `pdf.js`. OCR is on the post-v1 roadmap.

**`fetch error … TypeError: fetch failed`**
Some PDF hosts reject default Node user agents or require cookies. Pass a custom `fetch` (or `fetchHeaders` once that ships) with appropriate headers.

**`unpdf` errors on a real but old PDF.**
`unpdf` wraps `pdfjs-dist`. Very old (pre-1.4) PDFs occasionally fail to parse. Re-export the PDF from Acrobat to a current version, or fall back to `pdf-parse` by writing your own extractor function and passing it via a fork (no plugin slot in v1; `unpdf` covers ~99% of real PDFs).

**The CLI works but my framework integration emits an empty index.**
Check that the markdown bodies actually contain PDF URLs the regex picks up: `[Title](url.pdf)` markdown links or bare `https://...pdf` URLs. Relative paths (`/foo.pdf`) won't be fetched — the extractor needs an absolute URL. For build-time integration with relative paths, see [the `fetch` option](#core-api) — pass a custom `fetch` that resolves your site's URLs.

**My CI build is slow.**
First build is genuinely O(N PDFs) bytes-downloaded + parse-time. Subsequent builds hit the cache. Persist `.pdf-cache/` between CI runs (GitHub Actions: `actions/cache@v4` keyed on a stable cache key).

---

## Limits and non-goals

- **Not a search server.** No HTTP query endpoint, no inverted index, no live re-indexing. (For those, use Solr or Elasticsearch.)
- **Not OCR.** Image-only / scanned PDFs return empty text in v1.
- **Not multi-format.** `.docx`, `.xlsx`, `.pptx` are out of scope. Different format = different extractor; they belong in sibling packages.
- **Not a Fuse competitor.** We emit JSON. Consumers pick their search engine.
- **No automatic ETag-based cache invalidation in v1.**
- **Scale target: 10–1,000 PDFs per site.** Above that, look at server-side indexers.

---

## Development

```bash
git clone https://github.com/ICJIA/pdf-search-index.git
cd pdf-search-index
pnpm install

pnpm test           # run vitest across all packages
pnpm typecheck      # strict TS across all packages
pnpm lint           # oxlint
pnpm format:check   # prettier
pnpm build          # tsup / unbuild per package
```

Releases are published from `main` via the `release.yml` GitHub Actions workflow on a successful merge of a changesets-generated Release PR. The v1.0.0 release was hand-cut (see commit `chore: release v1.0.0`) because changesets' 0.x semver rules don't cleanly handle a `0.x → 1.0` bump — future patch / minor / major bumps use the standard changesets flow.

To add a changeset for your contribution:

```bash
pnpm changeset
```

Pick the packages your change touches; pick the severity (`patch` / `minor` / `major`); write a 1-line description.

---

## Design docs

- [v1.0 design spec](./docs/superpowers/specs/2026-05-15-pdf-search-index-design.md) — what was decided and why
- [Original design seed](./docs/PDF_SEARCH_DESIGN.md) — pre-brainstorm draft
- [R3 reference impl](./docs) — the inline scripts the package generalizes from (`pdfText.ts`, `searchIndex.json.ts`, `Search.vue`)
- [Implementation plans](./docs/superpowers/plans/) — Plan 1 (foundation), Plan 2 (cleanup + adapters), Plan 3 (examples + README + release)

---

## License

MIT — see [LICENSE](./LICENSE).
