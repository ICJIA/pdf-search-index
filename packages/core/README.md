# @icjia/pdf-search-index

> **Apache Solr for client-side apps — without Solr.** Build-time text extraction from **PDF, DOCX, PPTX, XLSX** that turns every document on your site into a searchable row and ships the index as a static JSON file. No JVM, no Tika service, no search server, no native deps — Node at build time, JSON at runtime.

**Multi-format added in 1.1.** PDF support is bundled (`unpdf`); DOCX/PPTX/XLSX are unlocked by installing the optional `officeparser` peer dep. The package emits a uniform `IndexedDocument` row with a `format` discriminator, so downstream search engines (Fuse.js, MiniSearch, FlexSearch, …) handle all four formats identically.

`@icjia/pdf-search-index` is the core library: it fetches documents, dispatches to the appropriate extractor (`unpdf` for PDF, `officeparser` for Office formats), and returns plain `IndexedDocument[]` rows. The output is fully **framework-agnostic** — first-party integrations ship for Astro 5 and Nuxt 4 (see [Adapter packages](#adapter-packages) below), and the same core works just as well from a `prebuild` script in **Next.js, SvelteKit, Remix, Eleventy, Vite/Vue, or vanilla HTML**.

**Fuse.js is recommended but optional.** The plain-JSON output drops into [Fuse.js](https://www.fusejs.io/), [MiniSearch](https://lucaong.github.io/minisearch/), Orama, Lunr, [FlexSearch](https://github.com/nextapps-de/flexsearch), [Pagefind](https://pagefind.app/), Typesense, MeiliSearch, or Algolia — your call. The `/fuse` and `/snippet` entry points are conveniences for Fuse callers, not gatekeepers; the core `indexPdfs` / `extractPdfText` / `extractPdfsFromBody` functions don't require `fuse.js` at all.

**Why this replaces Solr for static / Jamstack apps:** the typical Solr+Tika deployment is a JVM service, a schema, a managed index, and a network round-trip per query — enormous overhead when your corpus is the 50–500 PDFs your CMS or `public/` folder already publishes. This package collapses Solr's build-time stage (the Tika part) into a `pnpm build` hook and lets the framework you already use serve the JSON result. Zero ops, zero servers, zero JVM tuning.

ESM only. Node 20 LTS / 22 LTS. MIT.

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

**Status as of v1.0.5 (last audited 2026-05-16):** Every Critical and Important finding from the original audit against the core package is either **remediated and verified in 1.0.2**, or has a **documented active mitigation** while the structural fix lands in v1.1 / v2.0. Three audit passes (initial 1.0.1, 1.0.3 delta, 1.0.5 verification) confirm the fixes are still in place. **Zero unaddressed exploitable issues** against the documented usage envelope.

### Remediation scorecard (core-relevant items)

| Severity      | Found | Remediated & verified                  | Tracked for v1.1+ (mitigated)             | Exploitable now |
| ------------- | ----- | -------------------------------------- | ----------------------------------------- | --------------- |
| **Critical**  | 4     | 3 — C1, C3, C4 (shipped 1.0.2)         | 1 — C2 SSRF (CI egress-filter mitigation) | **0**           |
| **Important** | 6     | 5 — I1, I3, I4, I7, I8 (shipped 1.0.2) | 1 — I6 `maxUrls` cap (developer input)    | **0**           |
| **Minor**     | 3     | 2 — M2, M3 (shipped 1.0.2)             | 1 — M1 MIME validation (defense-in-depth) | **0**           |

(C5 is an Astro-adapter finding; see the Astro package README. I2 + I5 are deferred at the monorepo level — see the [top-level scorecard](../../README.md#remediation-scorecard) for the full picture.)

### Per-finding remediation detail

| ID     | What was found                                                                                      | What was specifically remediated                                                                                                                                                                                 | Verified by                                                                                                                                                                      | Status                                   |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **C1** | ReDoS in `extractPdfUrlsFromMarkdown` — 130 KB pathological body stalled a build for 50 s.          | Bounded greedy quantifiers `{1,2048}` URL / `{0,1024}` query; markdown bodies > 1 MB skipped with a warning before the scan.                                                                                     | `test/security.test.ts` → `"C1: ReDoS — handles a long hostile payload in under 200ms"` (130 KB body now scans < 200 ms).                                                        | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C3** | `fetchPdfBytes` buffered the entire response body before checking `maxBytes` — multi-GB PDF → OOM.  | `Content-Length` checked first; if absent, body streamed via `getReader()` aborting once running total > `maxBytes`. Default lowered 100 MB → 32 MB.                                                             | `test/security.test.ts` → `"C3: aborts streaming download once running total exceeds maxBytes"` + `"default maxBytes is 32 MB"`.                                                 | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C4** | MCP `cacheDir` attacker-controlled — prompt-injected LLM could write outside the cache.             | Every MCP tool's `cacheDir` routed through `safeCacheDir()`, jailed under `<os.tmpdir>/pdf-search-index-mcp/`. `clearCache` strict-allowlist-filters its deletion target to `<16hex>.txt` / `<16hex>.meta.json`. | `test/security.test.ts` → `"C4: safeCacheDir jail — rejects an absolute path outside the safe base"` (4 tests) + `"clearCache: allowlist only deletes cache-pattern filenames"`. | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I1** | Internal URLs (`/admin/secret.pdf` path components) leaked into CI failure logs.                    | New `scrubUrl(url)` export drops path/query/fragment. All `console.warn` paths that include a URL route through it. Full URL gated behind `debug: true`.                                                         | `test/security.test.ts` → `"I1 / M3: scrubUrl ... returns origin only for a normal URL"` + `"omits the path from failure logs by default"`.                                      | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I3** | Compression-bomb PDFs decompressing to hundreds of MB of text.                                      | New `maxExtractedTextChars` `ExtractOptions` field (default 5,000,000). Truncates above the cap and logs a warning. Raise it if a real PDF in your corpus has more text.                                         | `test/security.test.ts` → `"I3: maxExtractedTextChars cap — truncates extracted text above the cap and logs a warning"`.                                                         | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I4** | PDF text containing literal `</script>` broke out of `<script type="application/json">` islands.    | New top-level `safeJSONForHTML(obj, indent?)` export. Escapes `<`, `<!--`, U+2028, U+2029. Used by the CLI `--out` writer; available as a public export for consumers that inline rows themselves.               | `test/security.test.ts` → `"I4: safeJSONForHTML — escapes `<`so`</script>` cannot break out of a <script> embedding"` + `"escapes U+2028 and U+2029 line separators"`.           | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I7** | Cache write TOCTOU + non-atomic write — parallel builds could see partial files; corruption silent. | Both files written to `.tmp.<pid>.<rand>` then renamed atomically. Sidecar carries a `contentSha` (SHA-256 of text). `readCache` verifies; mismatch → cache miss.                                                | `test/security.test.ts` → `"I7: cache writes are atomic and content-hashed"` (4 tests including `"never returns a corrupt (mismatched-hash) hit under concurrent writes"`).      | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I8** | pdf.js `PasswordException` and other parse errors logged verbatim — leaked encrypted-PDF state.     | Parse errors categorized into `'encrypted PDF'` / `'corrupt PDF structure'` / `'PDF font error'` / `'PDF parse error'`. Full message gated behind `debug: true`.                                                 | `test/security.test.ts` → `"I8: categorized parse-error logging — categorizes xref/structure errors as 'corrupt PDF structure'"`.                                                | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **M2** | Cache files world-readable on POSIX.                                                                | `writeCache` writes files with mode `0o600`; cache dir created with mode `0o700`. POSIX-only; no-op on Windows.                                                                                                  | `test/security.test.ts` → `"I7: cache writes ... writes both files with mode 0o600"` (M2 pinned under the I7 describe).                                                          | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **M3** | ASCII control chars in URLs / error messages survived into terminal as escape sequences.            | Control chars (`\x00–\x1f`, `\x7f`) replaced with `?` before strings reach `console.warn`. Applies to both URL and error-message paths.                                                                          | `test/security.test.ts` → `"I1 / M3: scrubUrl drops path/query and strips control chars"`.                                                                                       | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C2** | SSRF — `indexPdfs` will fetch any URL incl. `http://169.254.169.254/` (AWS metadata).               | **Active mitigation:** outbound network policy at the CI level. **Structural fix tracked for v1.1:** `allowPrivateHosts: boolean` opt-in flag — deferred to avoid breaking intranet-PDF consumers.               | n/a — deferral intentional; CI egress-filter mitigation documented.                                                                                                              | ⚠️ **Mitigated; v1.1 allowlist tracked** |

For the complete picture across the monorepo (including the Astro-adapter finding C5, the I2 / I5 deferred items, and the [v1.0.5 verification pass](../../README.md#2026-05-16--v105-verification-pass) report), read the [top-level README's Security section](../../README.md#security) and the [Security considerations & audit history](../../README.md#security-considerations--audit-history). 115 tests pass at v1.0.5; every ✅ row above is pinned by a named test in `test/security.test.ts`.

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
