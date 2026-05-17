# AGENTS.md

> Guidance for AI coding agents asked to integrate `@icjia/pdf-search-index` into a consumer project. This file is the first thing you should read if a developer says "integrate this PDF search package into my site." Humans: see [README.md](./README.md) for the full documentation; this file is intentionally terse.

## What this package does (in one paragraph)

**Think Apache Solr for client-side apps — without Solr.** `@icjia/pdf-search-index` extracts text from **PDF, DOCX, PPTX, and XLSX** files at **build time** so the document body becomes a normal row in whatever client-side search engine the consumer already uses. It's the Tika stage of a Solr deployment collapsed into a `pnpm build` hook: no JVM, no schema, no search server, no runtime indexing. Output is plain JSON (`IndexedDocument[]`) with a `format` discriminator on every row. **Framework-agnostic** — first-party integrations for Astro 5 and Nuxt 4, and the same core works equally well from a prebuild script in Next.js, SvelteKit, Remix, Eleventy, Vite/Vue, vanilla HTML, or anything else that can run a Node script. **Fuse.js is the recommended client-side search engine** (and what every example uses), but the JSON rows feed [Fuse.js](https://www.fusejs.io/), MiniSearch, Orama, Lunr, FlexSearch, Pagefind, Typesense, MeiliSearch, or Algolia equally well — your call. ESM only. Node 20 LTS / 22 LTS. MIT.

**Multi-format added in v1.1.** PDF support is bundled; DOCX/PPTX/XLSX unlock by installing the optional `officeparser` peer dep (one dep covers all three Office formats). PDF-only integrations remain byte-identical to 1.0.x.

## Three packages in this monorepo

| npm package                     | Use when                                                         | Entry-point hint                                                       |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@icjia/pdf-search-index`       | Any framework — call the API yourself from a build script        | `import { indexPdfs } from '@icjia/pdf-search-index'`                  |
| `@icjia/astro-pdf-search-index` | Astro 5 — emits `public/<endpoint>.json` via `astro:build:start` | `import pdfSearch from '@icjia/astro-pdf-search-index'`                |
| `@icjia/nuxt-pdf-search-index`  | Nuxt 4 — auto-imports server helpers into Nitro `#imports`       | `extractPdfsFromCmsBody` / `extractPdfsFromContentDoc` from `#imports` |

All three move in lockstep at version **1.1.0+** (multi-format support: PDF + DOCX + PPTX + XLSX).

## Live demo

The reference deployment is live at **<https://icjia-pdf-search.netlify.app/>** — a dark-mode Astro 5 + Vue 3 site indexing 10 ICJIA-public PDFs with live snippet highlighting, a Fuse.js options tuner covering every native Fuse v7.4-beta option (including the two new-in-7.4 additions: `ignoreDiacritics` for accent-insensitive matching, and `useTokenSearch` for Fuse-native TF-IDF token search) plus a demo-side `tokenSearch` wrapper that works in any Fuse version, multi-region snippet picking (passages drawn from intro / middle / end of each PDF, not clustered), an image-only "Needs OCR — title only" badge, and a bundled Mozilla pdf.js viewer for cross-browser in-PDF find-and-highlight. Source: [`examples/netlify-demo/`](./examples/netlify-demo). If you're picking an example to model a real production site against, prefer this over the minimal [`examples/astro/`](./examples/astro/) (which exists as the smallest possible integration smoke test).

## Decision: which integration path is the consumer on?

Answer these in order:

1. Is there a `nuxt.config.ts` / `nuxt.config.js` and does `package.json` list `nuxt`? → **Path C — Nuxt 4** (use `@icjia/nuxt-pdf-search-index`)
2. Is there an `astro.config.ts` / `astro.config.mjs` and does `package.json` list `astro`? → **Path B — Astro 5** (use `@icjia/astro-pdf-search-index`)
3. Otherwise (Vite, Next.js, Eleventy, Vue, vanilla HTML, SvelteKit, Remix, Solid Start, Hugo, Jekyll, plain Node, anything else) → **Path A — Programmatic** (use `@icjia/pdf-search-index` core only, write a `build-index.mjs` prebuild script)

Path A is the universal escape hatch — every JS framework supports a prebuild hook.

## Path A — Plain Node (build script)

Works for Vite, Vue (Vite-based), Next.js, Eleventy, vanilla HTML, SvelteKit, Remix, Solid Start, Hugo (via Node prebuild), Jekyll, or anything else that runs a `build` script.

**`scripts/build-index.mjs`:**

```js
import { indexPdfs } from '@icjia/pdf-search-index';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const PDF_URLS = [
  'https://example.com/annual-report-2024.pdf',
  'https://example.com/faqs.pdf',
  { url: 'https://example.com/policy.pdf', title: 'Privacy Policy' }, // optional title override
];

const rows = await indexPdfs(PDF_URLS, {
  cacheDir: '.pdf-cache',
  concurrency: 4,
});

const out = 'public/searchIndex.pdfs.json';
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(rows, null, 2), 'utf-8');
console.log(`Wrote ${rows.length} PDF rows to ${out}`);
```

**`package.json`** — wire the prebuild hook:

```json
{
  "scripts": {
    "build-index": "node scripts/build-index.mjs",
    "prebuild": "npm run build-index",
    "predev": "npm run build-index",
    "build": "vite build",
    "dev": "vite dev"
  }
}
```

If the consumer inlines the index into an HTML page via `<script type="application/json">`, swap `JSON.stringify` for `safeJSONForHTML` (see Common pitfalls #4 below).

## Path B — Astro 5 (integration)

**`astro.config.ts`:**

```ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'], // names of src/content/<collection>/ dirs
      endpoint: 'searchIndex.pdfs.json', // emitted to public/searchIndex.pdfs.json
      cacheDir: '.astro/.pdf-cache',
      concurrency: 4,
    }),
  ],
});
```

The integration runs at `astro:build:start`. It walks every `.md` / `.mdx` file under each named content collection, strips frontmatter, scans the body for PDF links, fetches each PDF, extracts text, dedupes by row id, and writes the JSON to `public/<endpoint>`. Astro's build pipeline ships it alongside other static assets.

**Client island (Vue example — adapt for React / Svelte):**

```vue
<script setup lang="ts">
import Fuse from 'fuse.js';
import { onMounted, ref } from 'vue';

const fuse = ref<Fuse<unknown> | null>(null);

onMounted(async () => {
  const [pages, pdfs] = await Promise.all([
    fetch('/searchIndex.json').then((r) => r.json()), // your existing page index
    fetch('/searchIndex.pdfs.json').then((r) => r.json()),
  ]);
  fuse.value = new Fuse([...pages, ...pdfs], {
    keys: ['title', 'text'],
    threshold: 0.2,
    includeMatches: true,
  });
});
</script>
```

**Important:** `astro dev` does NOT fire `astro:build:start`, so the JSON isn't regenerated in dev mode. Run `astro build` once first, or add a separate `predev` build script — the canonical [`examples/astro/`](./examples/astro/) uses this pattern.

## Path C — Nuxt 4 (module + server route)

**`nuxt.config.ts`:**

```ts
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

### Recipe C1 — Strapi v5-only (`server/api/searchIndex.get.ts`)

```ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody } from '#imports';
import type { IndexedPdf } from '@icjia/pdf-search-index';

interface StrapiV5Page {
  documentId: string;
  title: string;
  body: string;
}

export default defineEventHandler(async () => {
  const res = await $fetch<{ data: StrapiV5Page[] }>('https://cms.example.com/api/pages');

  const pdfs: IndexedPdf[] = [];
  for (const page of res.data) {
    pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
  }
  return {
    cms: res.data.map((p) => ({ id: p.documentId, title: p.title })),
    pdfs,
  };
});
```

### Recipe C2 — `@nuxt/content`-only

```ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromContentDoc } from '#imports';
import { queryCollection } from '@nuxt/content/server';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default defineEventHandler(async (event) => {
  const docs = await queryCollection(event, 'content').all();

  const pdfs: IndexedPdf[] = [];
  for (const doc of docs) {
    // @nuxt/content v3 returns body as AST, not string. Extend the schema with
    // `rawbody: z.string()` in content.config.ts (see Recipe C3), then pass it.
    const raw = typeof doc.rawbody === 'string' ? doc.rawbody : '';
    pdfs.push(...(await extractPdfsFromContentDoc(raw)));
  }
  return { docs: docs.map((d) => ({ id: d.id, title: d.title })), pdfs };
});
```

### Recipe C3 — Mixed CMS + `@nuxt/content` (the design target)

Reference [`examples/nuxt-mixed/server/api/searchIndex.get.ts`](./examples/nuxt-mixed/server/api/searchIndex.get.ts) for the canonical working implementation.

```ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody, extractPdfsFromContentDoc } from '#imports';
import { queryCollection } from '@nuxt/content/server';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default defineEventHandler(async (event) => {
  // Source 1: external CMS (Strapi shown; adapt to your CMS shape).
  const cmsRes = await $fetch<{ data: Array<{ documentId: string; title: string; body: string }> }>(
    'https://cms.example.com/api/pages',
  );
  const cmsRows = cmsRes.data;
  const cmsPdfs: IndexedPdf[] = [];
  for (const row of cmsRows) {
    cmsPdfs.push(...(await extractPdfsFromCmsBody(row.body)));
  }

  // Source 2: @nuxt/content markdown collection.
  const docs = await queryCollection(event, 'content').all();
  const contentPdfs: IndexedPdf[] = [];
  for (const doc of docs) {
    const raw = typeof doc.rawbody === 'string' ? doc.rawbody : '';
    contentPdfs.push(...(await extractPdfsFromContentDoc(raw)));
  }

  // Dedupe by id — same PDF linked from CMS and @nuxt/content → one row.
  const allPdfs = [...new Map([...cmsPdfs, ...contentPdfs].map((p) => [p.id, p])).values()];

  return {
    cms: cmsRows.map((r) => ({ type: 'cms', id: r.documentId, title: r.title })),
    content: docs.map((d) => ({ type: 'content', id: d.id, title: d.title })),
    pdfs: allPdfs,
  };
});
```

The Nitro server route template at [`packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts`](./packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts) is copy-paste-ready — drop it at `server/api/searchIndex.get.ts` in the consumer's project and adapt the marked sections.

## The row shape every consumer must know

```ts
interface IndexedPdf {
  id: string; // 'pdf-' + first 12 hex chars of SHA-256(url) — stable across rebuilds
  url: string;
  title: string; // markdown link text > pdf.js info-dict Title > humanized filename
  text: string; // empty string on extraction failure (not an error)
  pages?: number;
  extractedAt?: string; // ISO timestamp; OMITTED on cache hits (so JSON is byte-stable)
}
```

Failed extractions return rows with `text: ''`, NOT a thrown error. The build never fails for bad PDFs unless the CLI is run with `--strict`. The `extractedAt` field is intentionally absent on cache hits so the emitted JSON stays byte-stable across rebuilds (clean diffs, CDN caching works).

## Snippet rendering — defaults vs multi-region

The `/snippet` subpath exports `snippetHTMLFor(fuseResult, options?)`:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

// Single-snippet default (back-compat behavior — 1.0.0 onward)
snippetHTMLFor(r);
// → "…the <mark>applicant</mark> portal opened in March…"

// Multi-snippet (added in 1.0.3) — render up to N non-overlapping spans
// joined by `separator` (default ' … '). Picker is greedy-longest by default.
snippetHTMLFor(r, { maxSnippets: 8, separator: ' … ' });
// → "…<mark>applicant</mark> registration… … <mark>applicant</mark> appeal…"
```

For long PDFs where matches cluster (common: a 100-page report with 40 occurrences of "stigma" all in chapters 2–3), the package's greedy-longest picker can yield only 1–3 visible snippets even with `maxSnippets: 8`. To force coverage of the whole document (intro / middle / end), pre-process the FuseResult to spread its match indices across spatial buckets — see [`examples/netlify-demo/src/components/Search.vue`](./examples/netlify-demo/src/components/Search.vue) `distributeMatches` for the canonical pattern. That's demo-side code; the core picker stays simple.

## The Fuse-or-not question

Fuse.js is one option. The package's row shape is plain JSON — it works equally well with MiniSearch, Orama, Lunr, FlexSearch, Pagefind, Typesense, MeiliSearch, and Algolia. Only the `/fuse` and `/snippet` subpath imports require `fuse.js` as a peer dependency; the core (`indexPdfs`, `extractPdfText`, `extractPdfsFromBody`, both Astro and Nuxt adapters) is engine-agnostic.

If the consumer is not on Fuse, point them at the [README's "Using a search engine other than Fuse.js" section](./README.md#using-a-search-engine-other-than-fusejs) — it has full minimum-working examples for all eight engines.

## Where PDFs can live

The package consumes URLs. Anything fetchable at build time becomes a searchable row:

- **Static `/public/`** — drop PDFs alongside the site, reference by relative URL via the framework's dev server during build
- **External CMS (Strapi v3/v4/v5, Sanity, Contentful, Drupal)** — fetch the body, scan it for PDF links
- **External CDN (S3, Cloudflare R2, GitHub raw)** — pass the URL list directly
- **Local `file://`** — for hermetic builds, tests, examples

Full guidance with concrete code for each pattern (including Strapi quirks: relative URLs, token-gated media, structured media relations) lives in the [README's "Where your PDFs can live" section](./README.md#where-your-pdfs-can-live).

## Common pitfalls (agents tripping over these is what this section exists for)

### 1. Markdown body has `[Title](/uploads/foo.pdf)` style relative URLs

The URL scanner only matches absolute `https?://...pdf` (and `file://` for tests). CMS bodies with relative paths need absolutizing **before** being passed to `extractPdfsFromCmsBody`:

```ts
const CMS_BASE = process.env.CMS_BASE!; // 'https://cms.example.com'
const absolutized = body.replaceAll(/\]\((\/uploads\/[^)]+\.pdf)/g, `](${CMS_BASE}$1`);
pdfs.push(...(await extractPdfsFromCmsBody(absolutized)));
```

Or configure the CMS to emit absolute URLs (Strapi 4/5: set `url` in `config/server.ts`; or use an upload provider like `aws-s3` that returns absolute CDN URLs).

### 2. The extracted index is empty even though the CMS has PDF links

Either (a) the regex doesn't match the URL format — debug by logging `extractPdfUrlsFromMarkdown(body)` first, or (b) the PDFs are image-only / scanned with no text layer (extractor returns `text: ''` silently — open the PDF in a viewer; if you can't select text, neither can pdf.js).

For image-only PDFs the recommended workflow is to OCR them upstream of this package via [`ocrmypdf`](https://github.com/ocrmypdf/OCRmyPDF) — that adds a real text layer that this package then reads normally. The package itself does not OCR (explicit v1 non-goal; sibling `@icjia/pdf-search-index-ocr` parked on the v2 roadmap). The live demo flags such rows with a "Needs OCR — title only" badge and a `r.text.length < 50` threshold; replicate that pattern in a consumer site to surface the state to end users. Full guidance: [README's "OCR — working with image-only / scanned PDFs"](./README.md#ocr--working-with-image-only--scanned-pdfs).

### 3. An LLM (via the MCP server) wants to point `cacheDir` outside the safe base

Since v1.0.2, the MCP server jails `cacheDir` under `os.tmpdir() + '/pdf-search-index-mcp'`. Don't try to escape it — the helper throws on out-of-jail paths. Use relative subdirectory names like `'session-abc123'` instead.

### 4. PDF text contains `</script>`

If the consumer embeds the index as `<script type="application/json">...</script>` inline (common for static-site islands), use the package's `safeJSONForHTML` helper instead of `JSON.stringify` (available as a top-level export since v1.0.2):

```ts
import { safeJSONForHTML, indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const html = `<script id="pdf-index" type="application/json">${safeJSONForHTML(rows)}</script>`;
```

Escapes `<`, `-->`, and U+2028 / U+2029. The CLI's `--out` and the Astro adapter's emit do this by default — you only need to call it yourself in manual build scripts that inline JSON into HTML.

### 5. Strapi returns relative URLs by default

See Pitfall #1 above. Or configure Strapi to emit absolute URLs.

### 6. The build is slow on the first run

Expected — first run hits every PDF over the network. Persist `.pdf-cache/` between CI runs to make subsequent builds instant. GitHub Actions: `actions/cache@v4` keyed on a stable cache key.

### 7. Auth-protected PDFs

Pass a custom `fetch` with the `Authorization` header to whichever helper you're using (`indexPdfs`, `extractPdfsFromBody`, `extractPdfsFromCmsBody`, `extractPdfsFromContentDoc`, or the Astro integration's `fetch` option):

```ts
const authFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
    },
  });

const rows = await indexPdfs(urls, { fetch: authFetch });
```

The `fetch` option threads through to every PDF download. Same pattern works for Bearer / Basic / API-key / custom-header auth on any CMS.

### 8. `@nuxt/content` v3 returns body as AST, not string

The `extractPdfsFromContentDoc` helper falls back through `doc.body` → `doc._raw` → `doc.rawbody`. For v3, extend your `content.config.ts` schema with `rawbody: z.string()` to surface the original markdown — see [`examples/nuxt-mixed/content.config.ts`](./examples/nuxt-mixed/content.config.ts).

### 9. Default `maxBytes` rejects a legitimate PDF

Since v1.0.2 the default is 32 MB (down from 100 MB). If the consumer hosts larger PDFs, raise it:

```ts
const rows = await indexPdfs(urls, { maxBytes: 100 * 1024 * 1024 }); // 100 MB
```

The library logs a categorized warning when a PDF is rejected on size grounds.

### 10. Default `maxExtractedTextChars` truncates a legitimate large PDF

Since v1.0.2 the default cap is 5 MB of plain text per PDF (defends against compression-bomb PDFs). If a legitimate PDF in the corpus exceeds 5 MB of plain text, raise the cap via `{ maxExtractedTextChars: 20_000_000 }` or similar.

## Canonical examples (read these to see real working code)

| Use case                                                | Example directory                                    |
| ------------------------------------------------------- | ---------------------------------------------------- |
| **Polished, deployable Astro 5 site** (Netlify-ready)   | [`examples/netlify-demo/`](./examples/netlify-demo/) |
| Plain Node                                              | [`examples/plain-node/`](./examples/plain-node/)     |
| Vanilla HTML + Fuse via CDN                             | [`examples/html/`](./examples/html/)                 |
| Vite + Vue 3                                            | [`examples/vue/`](./examples/vue/)                   |
| Astro 5 + Vue island (Path B canonical, minimal)        | [`examples/astro/`](./examples/astro/)               |
| Next.js 15 App Router                                   | [`examples/nextjs/`](./examples/nextjs/)             |
| Eleventy 3                                              | [`examples/eleventy/`](./examples/eleventy/)         |
| Nuxt 4 + mixed CMS + `@nuxt/content` (Path C canonical) | [`examples/nuxt-mixed/`](./examples/nuxt-mixed/)     |

`examples/netlify-demo/` is the production-shaped, polished variant — deployable to Netlify with the included `netlify.toml`. Use this as the starting point for a real consumer site (not the minimal Astro example, which exists only as the smallest possible integration smoke test).

The netlify-demo bundles Mozilla's pdf.js viewer at `/pdfjs-viewer/web/viewer.html` so result clicks open the PDF with the search term pre-filled in the viewer's find bar and every occurrence highlighted in the rendered page. The viewer's `#search=<query>` URL fragment is honored reliably only in Firefox (whose native viewer _is_ pdf.js); Chrome/Edge ignore it and Safari is inconsistent — bundling Mozilla's own viewer gives uniform cross-browser behaviour. The `pdfjs-dist` npm package only ships the embed component; the standalone viewer (`viewer.html` + assets) comes from Mozilla's GitHub release artifact, which `scripts/copy-pdfjs-viewer.mjs` fetches at prebuild time, pinned to the installed `pdfjs-dist` version. ~7 MB on disk; gitignored and rebuilt every dev/build.

Every example uses `file://` URLs against fixtures in [`examples/_fixtures/`](./examples/_fixtures/) plus a 15-line `local-fetch.mjs` helper so they work offline. The pattern is the same for real `https://` URLs — just drop the `fetch` option.

## When NOT to use this package

- **At runtime against user-submitted URLs.** This is build-time tooling. SSRF / ReDoS surfaces are mitigated assuming trusted CMS-author input. Don't expose `indexPdfs` to end users.
- **For OCR / scanned PDFs.** No text layer = empty extracted text. Use a separate OCR tool first.
- **For non-PDF docs.** As of v1.1, `.docx`, `.xlsx`, `.pptx` are all supported via the optional `officeparser` peer dep — use `indexDocuments(...)` instead of `indexPdfs(...)`. Pre-2007 binary Office formats (`.doc`, `.xls`, `.ppt`) and OpenDocument formats (`.odt`, `.ods`, `.odp`) are not supported.
- **As a search server.** This emits static JSON. Use Solr / Elasticsearch / Typesense for runtime indexing.
- **For PDF corpora > 1,000 documents.** The design target is 10–1,000 PDFs per site. Larger corpora work but may slow builds.

## Security notes for agents

The package is build-time tooling — it runs against URL lists you (or your CMS authors) supply, on the developer's or CI machine, never against user-submitted input at request time. Preserve the defaults; only relax them when the consumer explicitly asks.

Hardening landed in v1.0.2:

- Bounded URL-scanner regex (defeats ReDoS on adversarial markdown)
- `Content-Length` pre-check + streaming `maxBytes` enforcement
- Extracted-text length cap (defeats compression-bomb PDFs)
- Scrubbed failure logs (origin only — full URLs gated behind `debug: true`)
- Categorized parse-error tags (full message gated behind `debug: true`)
- Atomic cache writes + content-SHA verification (defeats TOCTOU during parallel builds)
- Restrictive cache file modes (`0o600` / dir `0o700`, POSIX-only)
- MCP `cacheDir` jail (under `<os.tmpdir>/pdf-search-index-mcp/`)
- Astro `endpoint` path-traversal guard (must resolve inside `publicDir`)
- HTML-safe JSON serializer (`safeJSONForHTML` top-level export)

Full trust model and defense table: [README "Security considerations"](./README.md#security-considerations).

## Versions

All three packages move in lockstep. Currently at **1.1.0** (multi-format support: PDF + DOCX + PPTX + XLSX via the optional `officeparser` peer dep; new `indexDocuments` / `extractDocumentText` / `extractDocumentsFromBody` API alongside the preserved PDF-only API; new MCP tools `extract_document` / `index_documents` / `search_documents`; format-mismatch security defense; 4th audit pass with 0 new Critical/Important/Minor findings). Node 20 LTS / 22 LTS. ESM only. MIT licensed.

**`fuse.js` is pinned to `7.4.0-beta.6`** across every workspace member (core devDep + all examples). Core's peer range is `"^7.0.0 || >=7.4.0-beta.0"` so consumers can pin either stable 7.x or the beta line. **Do not "upgrade" the pin to a different beta** without verifying the new beta's API surface against the package — agents asked to "update dependencies" should leave this one alone.

## Demo defaults vs core defaults

The live demo at `examples/netlify-demo/` overrides a couple of core defaults intentionally — keep these straight when copying patterns:

| Setting                         | Core default (`DEFAULT_FUSE_OPTIONS`) | Demo default                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `threshold`                     | `0.2`                                 | `0.2` (same)                                                                                                                                                                                                             |
| `ignoreLocation`                | `true`                                | `true` (same)                                                                                                                                                                                                            |
| `minMatchCharLength`            | `2`                                   | `2` (same)                                                                                                                                                                                                               |
| `findAllMatches`                | _(Fuse default: `false`)_             | **`true`** — to populate the per-result match-count badge and feed the distributed multi-snippet picker                                                                                                                  |
| `ignoreDiacritics` _(7.4-beta)_ | _(Fuse default: `false`)_             | `false` (same — exposed in the tuner; flip on for multilingual corpora)                                                                                                                                                  |
| `useTokenSearch` _(7.4-beta)_   | _(Fuse default: `false`)_             | `false` (same — exposed in the tuner; **distinct from the demo's `tokenSearch` wrapper** below)                                                                                                                          |
| Snippet `maxSnippets`           | `1`                                   | **`8`** — with the demo-side `distributeMatches` pre-processor for spatial coverage                                                                                                                                      |
| Demo `tokenSearch` wrapper      | not applied (not a core option)       | **on by default** — splits multi-word queries on whitespace, OR-merges results per-token. Works in any Fuse version. Suppressed when `useExtendedSearch` or `useTokenSearch` is on (those handle tokenization natively). |

A real consumer site adopting the package picks up the core defaults automatically. They can opt into the demo's stricter behavior by setting `findAllMatches: true` on their Fuse instance, passing `maxSnippets: N` to `snippetHTMLFor`, and (if desired) copying `tokenizeAndSearch` + `distributeMatches` from the demo's `Search.vue` directly — both are MIT-licensed and self-contained.

**`useTokenSearch` (Fuse native) vs the demo's `tokenSearch` wrapper.** Both improve recall on multi-word queries, but via different mechanisms:

- **`useTokenSearch: true`** is Fuse 7.4-beta's built-in token search with TF-IDF scoring — the runtime tokenizes the field text once at index time and the query at search time, then scores results by term-frequency × inverse-document-frequency. Better relevance ranking; requires the 7.4-beta pin. Recommended for new code.
- **`tokenizeAndSearch` (demo wrapper)** is a JS-side strategy described at <https://www.fusejs.io/token-search.html> — split the query on whitespace, run `fuse.search()` once per token, merge results by id taking the lowest score across tokens. Works in any Fuse 7.x. Use this if you can't move to the 7.4-beta or want explicit control over per-token results.

In the demo, both are exposed in the tuner so users can compare. Picking only one in a real consumer site is fine; combining them is wasteful (the wrapper passes the original query unchanged when either `useExtendedSearch` or `useTokenSearch` is on).

## Security audit history

- **2026-05-16 (v1.0.1 → v1.0.2 audit, full pass).** 21 findings: 5 Critical / 8 Important / 8 Minor. Shipped fixes: 4 Critical + 5 Important + 2 Minor. Deferred: C2 SSRF allowlist (1.1), I2 cache-key URL normalization (2.0), I5 CLI sitemap hardening (1.1), I6 `maxUrls` cap (1.1), the remaining Minor items.
- **2026-05-16 (v1.0.3 audit, scope-limited delta).** Audited only the surfaces added 1.0.2 → 1.0.3 (`snippetHTMLFor` `maxSnippets`, fuse.js 7.4-beta, token-search wrapper, distributed picker, pdf.js viewer bundle, `viewer.css` overlay, prerelease pin behavior). **No new Critical or Important findings.** 1 Minor (viewer.css idempotency marker substring mismatch — fixed) + 5 Informational (defended with regression tests where actionable).

Full audit trail in [README "Security considerations & audit history"](./README.md#security-considerations--audit-history).

## What to read after this

- [`README.md`](./README.md) — full human documentation (~1140 lines; the source of truth)
- [`docs/superpowers/specs/2026-05-15-pdf-search-index-design.md`](./docs/superpowers/specs/2026-05-15-pdf-search-index-design.md) — the design spec
- [`packages/core/README.md`](./packages/core/README.md) — standalone integration guide for the core
- [`packages/astro-pdf-search-index/README.md`](./packages/astro-pdf-search-index/README.md) — standalone integration guide for Astro
- [`packages/nuxt-pdf-search-index/README.md`](./packages/nuxt-pdf-search-index/README.md) — standalone integration guide for Nuxt (with Strapi recipes)
- [`examples/<framework>/`](./examples/) — working code for each integration

If the consumer's project differs from the seven examples (e.g. SvelteKit, Remix, Solid Start, Hugo), apply **Path A** (programmatic + prebuild script) — every JS framework supports this pattern.
