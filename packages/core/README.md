# @icjia/pdf-search-index

> Full-text PDF search for static sites that already use [Fuse.js](https://www.fusejs.io/). Build-time PDF text extraction, no runtime servers, no native deps.

`@icjia/pdf-search-index` extracts text from PDFs at build time so the PDF body becomes a first-class row in your client-side search engine — Tika without Solr, for static sites. Output is plain JSON, so you can feed it to Fuse.js, MiniSearch, Orama, Lunr, FlexSearch, Pagefind, Typesense, MeiliSearch, or Algolia. ESM only. Node 20 LTS / 22 LTS. MIT.

Two adapter packages are published alongside this one — see [Adapter packages](#adapter-packages) below.

## Install

```bash
npm install @icjia/pdf-search-index
# or
pnpm add @icjia/pdf-search-index
# or
yarn add @icjia/pdf-search-index
```

Optional peer dependency — `fuse.js@^7` — only when you import the `/fuse` or `/snippet` subpaths. The package's `peerDependencies` range is `"^7.0.0 || >=7.4.0-beta.0"` so both stable Fuse 7.x and the Fuse 7.4 beta channel resolve. The v1.0.3 examples in this monorepo pin to **`7.4.0-beta.6`** to demo the newest beta surface; consumers who prefer stability can pin to a stable `~7.3.0` and the peer still resolves.

## Security

**Audited and hardened in v1.0.2 (released 2026-05-16).** The core package went through an adversarial red/blue team review against v1.0.1; v1.0.2 ships 4 Critical fixes, 5 Important fixes, and 2 Minor fixes from that audit. Most-relevant items for the core surface:

- **C1 — ReDoS in the URL scanner.** Bounded regex quantifiers; bodies > 1 MB are skipped with a warning.
- **C3 — Body size cap applied before buffering.** `Content-Length` pre-check + streaming `getReader()` cap. **Default `maxBytes` lowered from 100 MB to 32 MB** — opt up via `{ maxBytes: 100 * 1024 * 1024 }` if you legitimately host larger PDFs.
- **I3 — Extracted-text length cap.** New `maxExtractedTextChars` option (default **5 MB**) defends against compression-bomb PDFs. Raise it if a real PDF in your corpus has more text.
- **I4 — HTML-safe JSON.** New `safeJSONForHTML(obj, indent?)` export — use it instead of `JSON.stringify` when embedding the index into a `<script type="application/json">` block. The CLI `--out` writer uses it by default.
- **I1, I8 — Scrubbed logs.** Failure logs now show origin-only URLs (`https://example.com` rather than the full path) and categorized parse-error tags. Flip `debug: true` for CI triage.
- **I7 — Atomic cache writes.** Writes go to `.tmp.<pid>.<rand>` and rename atomically; sidecar carries a `contentSha` and `readCache` verifies it. Parallel builds no longer corrupt the cache.

**C2 (SSRF allowlist), I2 (cache-key URL normalization), I5 (CLI sitemap hardening), I6 (`maxUrls` cap)** are deferred to v1.1 / v2.0 because they need an opt-in flag design or a breaking change. Configure outbound network policy in your CI environment as a mitigation in the meantime.

26 new regression tests cover the audit fixes (105 total in 1.0.2, up from 79; 1.0.3 adds snippet `maxSnippets` coverage; the 2026-05-16 v1.0.3 audit pass added 3 more regression tests for the multi-snippet picker → 114 total). Read the full audit reference, trust model, and migration notes in the [top-level README's Security section](../../README.md#security) and [Security considerations & audit history](../../README.md#security-considerations--audit-history) (including the 2026-05-16 v1.0.3 scope-limited delta pass).

## The 30-second integration

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const pdfRows = await indexPdfs([
  'https://example.com/annual-report-2024.pdf',
  'https://example.com/faqs.pdf',
]);

const allRows = [...yourPageRows, ...pdfRows];
const fuse = new Fuse(allRows, { keys: ['title', 'text'], includeMatches: true });
```

That's it. Each row is `{ id, url, title, text, pages?, extractedAt? }`. Failed extractions return rows with `text: ''` (the build doesn't fail unless you pass `--strict` to the CLI).

For highlighted snippets in results:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

for (const r of fuse.search('stigma')) {
  console.log(r.item.title, snippetHTMLFor(r));
  // → "Stigma PDF For Posting" "…recovery from substance use disorder is hampered by <mark>stigma</mark>…"
}
```

`snippetHTMLFor` accepts `{ contextChars?, matchKey?, collapseWhitespace?, maxSnippets?, separator? }`. The `maxSnippets` option (added 1.0.3, default `1` for backward compatibility) renders up to N non-overlapping highlighted spans per result, joined by `separator` (default `' … '`). Useful for surfacing several passages from a long PDF that matches the query in multiple regions.

## Core API

| Function                                 | What it does                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `extractPdfText(url, options?)`          | Fetch one PDF, return its text. Lowest-level entry point.                                                                            |
| `indexPdfs(urls, options?)`              | Batch-index an array of URLs / `{ url, title?, id? }` entries. Dedupes by URL. Concurrency 4 by default.                             |
| `extractPdfsFromBody(markdown, opts?)`   | Scan a markdown body for PDF URLs and index each.                                                                                    |
| `extractPdfUrlsFromMarkdown(markdown)`   | URL-discovery without extraction — handy for debugging "why is my index empty?".                                                     |
| `safeJSONForHTML(obj, indent?)`          | HTML-safe `JSON.stringify` — escapes `<`, `-->`, U+2028/2029 for `<script>` embedding.                                               |
| `scrubUrl(url)`                          | Drop path/query/fragment, return `protocol://host` only (used internally for failure logs).                                          |
| `createFuseIndex({ urls, fuseOptions })` | Convenience wrapper: index + build a Fuse instance in one call (from `/fuse` subpath).                                               |
| `snippetHTMLFor(fuseResult, options?)`   | `<mark>`-highlighted ±N-char snippet from a Fuse match (from `/snippet` subpath). Supports `maxSnippets` for multi-region rendering. |

Full option tables, semantics, and edge-case behavior are in the [top-level README's Core API section](../../README.md#core-api).

## Entry points

| Subpath                     | Purpose                                                                                                   | Peer dep needed |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | --------------- |
| `.`                         | Core extraction API (`indexPdfs`, `extractPdfText`, `extractPdfsFromBody`, `safeJSONForHTML`, `scrubUrl`) | none            |
| `/fuse`                     | `createFuseIndex` — convenience wrapper                                                                   | `fuse.js@^7`    |
| `/snippet`                  | `snippetHTMLFor` — `<mark>`-highlighted snippets                                                          | `fuse.js@^7`    |
| `/mcp`                      | MCP server entry — invoked via `pdf-search-index-mcp` bin (not direct import)                             | none            |
| `bin: pdf-search-index`     | CLI for one-shot indexing, sitemap scan, search, cache management                                         | none            |
| `bin: pdf-search-index-mcp` | MCP server bin for LLM workflows                                                                          | none            |

## The `IndexedPdf` row shape

```ts
interface IndexedPdf {
  id: string; // 'pdf-' + first 12 hex chars of SHA-256(url) — stable across rebuilds
  url: string;
  title: string; // markdown link text > pdf.js info-dict Title > humanized filename
  text: string; // empty string on extraction failure (not an error)
  pages?: number;
  extractedAt?: string; // ISO timestamp; OMITTED on cache hits so JSON is byte-stable
}
```

`pages` and `extractedAt` are optional. `extractedAt` is omitted on cache hits so the JSON stays byte-stable across rebuilds — diffs stay reviewable and CDN caching works.

## Options summary

`indexPdfs` accepts `IndexPdfsOptions = ExtractOptions & { concurrency? }`:

| Option                  | Type                             | Default                    | What it's for                                                             |
| ----------------------- | -------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `cacheDir`              | `string`                         | `'.pdf-cache'`             | Where extracted text is cached on disk                                    |
| `fetch`                 | `typeof fetch`                   | global `fetch`             | **The escape hatch** — auth headers, `file://` URLs, signed URLs          |
| `fetchTimeout`          | `number` (ms)                    | `30000`                    | Abort the fetch after this many ms                                        |
| `maxBytes`              | `number`                         | `32 * 1024 * 1024` (32 MB) | Reject PDFs larger than this. Lowered from 100 MB in 1.0.2                |
| `maxExtractedTextChars` | `number`                         | `5_000_000` (5 MB)         | Truncate extracted text above this length (compression-bomb defense)      |
| `concurrency`           | `number`                         | `4`                        | Parallel fetches via `p-limit`                                            |
| `cache`                 | `'use' \| 'bypass' \| 'refresh'` | `'use'`                    | `bypass` skips read+write; `refresh` overwrites; `use` is read-through    |
| `mergePages`            | `boolean`                        | `true`                     | When `false`, `extractPdfText` returns one entry per page                 |
| `debug`                 | `boolean`                        | `false`                    | When `true`, failure logs include full URLs and underlying error messages |

## CLI quick reference

```bash
# One-shot: index URLs to JSON on stdout
npx @icjia/pdf-search-index https://...pdf https://...pdf

# From a file (one URL per line, # comments allowed)
npx @icjia/pdf-search-index --from urls.txt

# From a sitemap (scans pages for PDF links, indexes them)
npx @icjia/pdf-search-index --from-sitemap https://example.com/sitemap.xml

# Write to a file instead of stdout
npx @icjia/pdf-search-index --out public/searchIndex.json https://...pdf

# Force re-extraction
npx @icjia/pdf-search-index --refresh https://...pdf
npx @icjia/pdf-search-index --refresh-all https://...pdf

# Sanity check / search / cache management
npx @icjia/pdf-search-index verify https://...pdf
npx @icjia/pdf-search-index search index.json "drug testing"
npx @icjia/pdf-search-index cache ls
npx @icjia/pdf-search-index cache rm <url>
npx @icjia/pdf-search-index cache clear
```

Exit code is `0` even when individual PDFs fail (the index stays valid; failed rows have `text: ''`). Pass `--strict` to flip to `exit 1` for CI where a broken upload pipeline should fail the build.

Full CLI option table and output formats: [README CLI section](../../README.md#cli-pdf-search-index-bin).

## MCP server

For LLM workflows where the model needs to search inside PDFs during a conversation:

```bash
npx -p @icjia/pdf-search-index@latest pdf-search-index-mcp
```

**Always use `@latest`** when wiring into Claude Desktop / Cursor / any MCP-aware client so the client picks up security patches and bug fixes automatically. Sample config:

```json
{
  "servers": {
    "pdf-search": {
      "command": "npx",
      "args": ["-p", "@icjia/pdf-search-index@latest", "pdf-search-index-mcp"]
    }
  }
}
```

Tools: `extract_pdf`, `index_pdfs`, `get_pdf_index`, `search_pdfs`, `clear_cache`, `get_status`. Since v1.0.2, every tool's `cacheDir` argument is jailed under `<os.tmpdir>/pdf-search-index-mcp/` — LLM-supplied paths can't escape the safe base. Full MCP details: [README MCP section](../../README.md#mcp-server-mcp-entry).

## Where to learn more

The [top-level README](../../README.md) is the source of truth. Key sections:

- [**Where your PDFs can live**](../../README.md#where-your-pdfs-can-live) — static `/public/`, external CMS (Strapi v3/v4/v5, Sanity, Contentful, Drupal), external CDN (S3, R2), local `file://`. Includes Strapi quirks: relative URLs, token-gated media, structured media relations.
- [**Using a search engine other than Fuse.js**](../../README.md#using-a-search-engine-other-than-fusejs) — recipes for MiniSearch, Orama, Lunr, FlexSearch, Pagefind, Typesense, MeiliSearch, Algolia.
- [**Security considerations**](../../README.md#security-considerations) — trust model, v1.0.2 hardening details, embedding the index into HTML.
- [**Examples**](../../README.md#examples) — seven runnable example sites covering every integration pattern.

## Adapter packages

| Adapter                                                       | For                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`@icjia/astro-pdf-search-index`](../astro-pdf-search-index/) | Astro 5 — emits `public/<endpoint>.json` from configured content collections at build time |
| [`@icjia/nuxt-pdf-search-index`](../nuxt-pdf-search-index/)   | Nuxt 4 — server helpers for mixed CMS + `@nuxt/content` sites                              |

For frameworks without an adapter (Vite, Next.js, Eleventy, SvelteKit, Remix, plain Node, etc.), use this package directly with a `prebuild` script — see the [AGENTS.md "Path A" recipe](../../AGENTS.md#path-a--plain-node-build-script).

## Versioning

Currently at **1.0.3** (documentation + ecosystem release, additive `snippetHTMLFor` `maxSnippets` option, default `DEFAULT_FUSE_OPTIONS.threshold` lowered to `0.2`, fuse.js dev/example pin moved to `7.4.0-beta.6`, second adversarial red/blue team audit pass on the v1.0.3 deltas on 2026-05-16 — see [CHANGELOG.md](./CHANGELOG.md) and the [top-level audit history](../../README.md#security-considerations--audit-history)). All three packages in this monorepo move in lockstep.

## License

[MIT](../../LICENSE)
