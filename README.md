# @icjia/pdf-search-index

> **Apache Solr for client-side apps — without Solr.** Build-time text extraction from **PDF, DOCX, PPTX, and XLSX** that turns every document on your site into a searchable row and ships the index as a static JSON file. No JVM, no Tika service, no search server, no native deps — Node at build time, JSON at runtime.

**Multi-format in v1.1.** The same pipeline that's been indexing PDFs since v1.0 now also indexes Microsoft Office documents (DOCX, PPTX, XLSX) when you install the optional `officeparser` peer dep. PDF-only consumers don't pay the install cost. See [Supported formats](#supported-formats) for the per-format extraction shape.

**Framework-agnostic.** First-party integrations ship for **Astro 5** and **Nuxt 4**, but the core library is plain ESM and slots cleanly into **Next.js, SvelteKit, Remix, Eleventy, Vite/Vue, or vanilla HTML**. If your build can run a Node script and your site can serve a JSON file, this works.

**Fuse.js is recommended but optional.** The package emits plain `IndexedDocument[]` rows you can feed to [Fuse.js](https://www.fusejs.io/), [MiniSearch](https://lucaong.github.io/minisearch/), [FlexSearch](https://github.com/nextapps-de/flexsearch), [Lunr](https://lunrjs.com/), [Pagefind](https://pagefind.app/), or your own index. The `/fuse` and `/snippet` entry points are conveniences, not gatekeepers — the core extraction (`indexDocuments`, `extractDocumentText`, `extractDocumentsFromBody`) has no `fuse.js` dependency at all. See [Using a search engine other than Fuse.js](#using-a-search-engine-other-than-fusejs) for concrete recipes.

Documents become first-class search rows alongside your pages and posts. A query like `"stigma"` matches the body of the **linked document** — not just the prose that links to it — and returns the document as a result with a `<mark>`-highlighted snippet from the surrounding text. The emitted `IndexedDocument` carries a `format` discriminator (`'pdf'` / `'docx'` / `'pptx'` / `'xlsx'`) so your UI can render different badges, route to different viewers, or filter by type.

**Why this replaces Solr for static / Jamstack apps:** the typical Solr+Tika deployment is a JVM service, a schema, a managed index, and a network round-trip per query — enormous overhead when your corpus is the 50–500 documents your CMS or `public/` folder already publishes. This package collapses Solr's build-time extraction stage (the Tika part) into a single `pnpm build` hook and lets the framework you already use serve the JSON result. The result on the wire is a static asset the CDN caches; the result in the browser is whatever client-side search engine you already had — Fuse.js, MiniSearch, anything. Zero ops, zero servers, zero JVM tuning, zero query latency past your edge.

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

**Live demo:** **<https://icjia-pdf-search.netlify.app/>** — search across 10 ICJIA-public PDFs with live snippet highlighting, a Fuse.js options tuner, a token-search wrapper for short queries, multi-region snippet highlighting, and a bundled Mozilla pdf.js viewer for cross-browser in-PDF find-and-highlight. See [Examples](#examples) below for how it works and how to deploy your own.

---

## Table of contents

- [Security](#security) — audit findings, fixes shipped in 1.0.2; v1.1 verification pass
- [Supported formats](#supported-formats) — PDF / DOCX / PPTX / XLSX
- [Why this exists](#why-this-exists)
- [The 30-second integration](#the-30-second-integration)
- [Install](#install)
- [Where your PDFs can live](#where-your-pdfs-can-live)
- [Using a search engine other than Fuse.js](#using-a-search-engine-other-than-fusejs)
- [Core API](#core-api)
- [Fuse helper (`/fuse` entry)](#fuse-helper-fuse-entry)
- [Snippet helper (`/snippet` entry)](#snippet-helper-snippet-entry)
- [CLI (`pdf-search-index` bin)](#cli-pdf-search-index-bin)
- [MCP server (`/mcp` entry)](#mcp-server-mcp-entry)
- [Astro integration](#astro-integration)
- [Nuxt 4 module](#nuxt-4-module)
- [Examples](#examples) — including the [live Netlify demo](#live-demo)
- [Caching](#caching)
- [Error handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Limits and non-goals](#limits-and-non-goals)
- [Security considerations & audit history](#security-considerations--audit-history)
- [Development](#development)
- [Design docs](#design-docs)
- [License](#license)

---

## Security

**Status as of v1.1.0 (last audited 2026-05-17):** Every Critical and Important finding from the original adversarial red/blue audit is either **remediated and verified in a shipped release**, or has a **documented active mitigation** while the structural fix lands in a future release. **Zero unaddressed exploitable issues against the documented usage envelope.** Four independent audit passes confirm this (initial v1.0.1 audit + v1.0.3 delta + v1.0.5 verification on 2026-05-16; v1.1.0 multi-format audit on 2026-05-17). The v1.1 audit verified all 11 prior fixes still in place after the multi-format refactor and surfaced **0 new Critical/Important/Minor findings** against the new DOCX/PPTX/XLSX surface — only one Informational note about dynamic-import resolution (same risk class as the existing `unpdf`/`fuse.js` dynamic imports).

### Remediation scorecard

| Severity      | Found  | Remediated & verified                  | Tracked for v1.1+ (mitigated)             | Exploitable now |
| ------------- | ------ | -------------------------------------- | ----------------------------------------- | --------------- |
| **Critical**  | 5      | 4 — C1, C3, C4, C5 (shipped 1.0.2)     | 1 — C2 SSRF (CI egress-filter mitigation) | **0**           |
| **Important** | 8      | 5 — I1, I3, I4, I7, I8 (shipped 1.0.2) | 3 — I2 → v2.0, I5 → v1.1, I6 → v1.1       | **0**           |
| **Minor**     | 8      | 3 — M2, M3 (1.0.2), V1 (1.0.3)         | 5 — defense-in-depth hardening            | **0**           |
| **Totals**    | **21** | **12**                                 | **9 (mitigated, not exploitable)**        | **0**           |

"Verified" means: (a) a named regression test exercises the fix against the original attack input, and (b) the fix is confirmed still in place at v1.1.0 HEAD by the 2026-05-17 verification pass (which re-traced every prior fix through the multi-format refactor's renamed/relocated code paths).

### Critical findings — what was found, what was specifically remediated, did it fix it

| ID     | What was found                                                                                                                                                            | What was specifically remediated                                                                                                                                                                                                                                                                                                                                         | Verified by                                                                                                                                                                                | Status                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **C1** | ReDoS in `extractPdfUrlsFromMarkdown`. Adversarial markdown `'[X](https://a'.repeat(N)` burned O(N²) CPU; a 130 KB pathological body stalled a build for 50 s.            | Bounded greedy quantifiers `{1,2048}` URL / `{0,1024}` query in the URL-scanner regex. Markdown bodies > 1 MB are skipped with a warning before the scan starts.                                                                                                                                                                                                         | `core/test/security.test.ts` → `"C1: ReDoS in extractPdfUrlsFromMarkdown — handles a long hostile payload in under 200ms"` (the same 130 KB body that stalled 50 s now scans in < 200 ms). | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C3** | `fetchPdfBytes` materialized the entire response body before checking `maxBytes`; a multi-GB PDF → OOM the build runner.                                                  | `Content-Length` checked first; if absent, body is streamed via `getReader()` and the download aborts the moment running total exceeds `maxBytes`. Default `maxBytes` lowered 100 MB → 32 MB.                                                                                                                                                                            | `core/test/security.test.ts` → `"C3: aborts streaming download once running total exceeds maxBytes"` + `"default maxBytes is 32 MB"`.                                                      | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C4** | MCP `cacheDir` attacker-controlled — a prompt-injected LLM could pass `cacheDir: '/etc/'` and write outside the cache.                                                    | Every MCP tool's `cacheDir` is routed through `safeCacheDir()` which jails it under `<os.tmpdir>/pdf-search-index-mcp/`. `clearCache` also strict-allowlist filters its deletion target to `<16hex>.txt` / `<16hex>.meta.json` files.                                                                                                                                    | `core/test/security.test.ts` → `"C4: safeCacheDir jail — rejects an absolute path outside the safe base"` (4 tests) + `"clearCache: allowlist only deletes cache-pattern filenames"`.      | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C5** | Astro `endpoint: '../../etc/escape.json'` would resolve outside `publicDir` and the build would write the index there.                                                    | The integration validates that the resolved output path stays inside the resolved `publicDir`; throws a clear error at build time otherwise.                                                                                                                                                                                                                             | `packages/astro-pdf-search-index/test/integration.test.ts` → `"rejects an endpoint that resolves outside publicDir (C5: path traversal)"`.                                                 | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C2** | SSRF — `indexPdfs` will fetch any URL the developer passes, including `http://169.254.169.254/` (AWS metadata) or internal hosts, with no opt-in to allow private ranges. | **Active mitigation right now:** outbound network policy at the CI / build-environment level (the attack surface is build-time only; the typical CI runner can't reach metadata endpoints anyway). **Structural fix tracked for v1.1:** `allowPrivateHosts: boolean` opt-in flag — deferred from 1.0.2 to avoid breaking consumers who legitimately fetch intranet PDFs. | n/a — deferral is intentional. Mitigation documented in [Audit reference → C2 mitigation](#audit-reference) below.                                                                         | ⚠️ **Mitigated; v1.1 allowlist tracked** |

### Important findings — what was found, what was specifically remediated, did it fix it

| ID     | What was found                                                                                                                       | What was specifically remediated                                                                                                                                                                                                                                                                               | Verified by                                                                                                                                                                      | Status                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **I1** | Internal URLs (`https://example.com/admin/secret.pdf`) leaked into CI failure logs.                                                  | New `scrubUrl(url)` export drops path / query / fragment, leaving only `protocol://host`. All `console.warn` paths that include a URL route through it. Full URL gated behind `debug: true` for triage.                                                                                                        | `core/test/security.test.ts` → `"I1 / M3: scrubUrl ... returns origin only for a normal URL"` + `"omits the path from failure logs by default"`.                                 | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I3** | Compression-bomb PDFs (flate-compressed streams that decompress to hundreds of MB of plain text) blew out memory.                    | New `maxExtractedTextChars` `ExtractOptions` field (default 5,000,000). Truncates extracted text above the cap and logs a warning.                                                                                                                                                                             | `core/test/security.test.ts` → `"I3: maxExtractedTextChars cap — truncates extracted text above the cap and logs a warning"`.                                                    | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I4** | PDF text containing literal `</script>` broke out of `<script type="application/json">` islands when the JSON was inlined into HTML. | New top-level `safeJSONForHTML(obj, indent?)` export. Escapes `<` (so `</script>` becomes `<\/script>`), `<!--`, U+2028, U+2029. Used by the CLI `--out` writer and the Astro adapter's emit. Available as a public export for consumers that inline rows themselves.                                          | `core/test/security.test.ts` → `"I4: safeJSONForHTML — escapes `<`so`</script>` cannot break out of a <script> embedding"` + `"escapes U+2028 and U+2029 line separators"`.      | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I7** | Cache write TOCTOU + non-atomic write — parallel builds could see partial files; external corruption went undetected.                | `writeCache` writes both text + sidecar to `.tmp.<pid>.<rand>` and renames atomically. Sidecar carries a `contentSha` (SHA-256 of the text file). `readCache` verifies the hash; mismatch → treat as cache miss.                                                                                               | `core/test/security.test.ts` → `"I7: cache writes are atomic and content-hashed"` (4 tests including `"never returns a corrupt (mismatched-hash) hit under concurrent writes"`). | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I8** | pdf.js `PasswordException` and other parse errors logged verbatim — leaked encrypted-PDF state and parser internals into CI logs.    | Parse errors categorized into `'encrypted PDF'`, `'corrupt PDF structure'`, `'PDF font error'`, `'PDF parse error'`. Full underlying message gated behind `debug: true`.                                                                                                                                       | `core/test/security.test.ts` → `"I8: categorized parse-error logging — categorizes xref/structure errors as 'corrupt PDF structure'"`.                                           | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I2** | Cache-key URL normalization missing — `?utm_*` query variants produce different cache keys for the same PDF.                         | **Active mitigation:** the duplicate-fetch cost is wasted bandwidth, not a security exposure (no information leak, no DoS path). **Structural fix tracked for v2.0:** breaking change to cache-key derivation — bundled with the next major bump rather than silently invalidating consumers' existing caches. | n/a — non-security cost; intentional v2.0 bundling.                                                                                                                              | ⚠️ **Tracked for v2.0 (breaking)**       |
| **I5** | CLI `--from-sitemap` hardening — no scheme allowlist, no body-size cap on the fetched sitemap.                                       | **Active mitigation:** the CLI is invoked by developers against URLs they control; it's not a public endpoint. **Structural fix tracked for v1.1:** reject `file://` / `data:` schemes, cap sitemap response size at 5 MB by default.                                                                          | n/a — design pass scheduled for v1.1.                                                                                                                                            | ⚠️ **Tracked for v1.1**                  |
| **I6** | `maxUrls` cap missing — a misconfigured / malicious sitemap could enqueue millions of fetch requests.                                | **Active mitigation:** URL lists are developer-supplied at build time and reviewed in code review. **Structural fix tracked for v1.1:** new `maxUrls` option with a sensible default (likely 5,000).                                                                                                           | n/a — needs default-value decision.                                                                                                                                              | ⚠️ **Tracked for v1.1**                  |

### Minor findings — what was found, what was specifically remediated, did it fix it

| ID            | What was found                                                                                                                                                                                       | What was specifically remediated                                                                                                                                                                                                                                               | Verified by                                                                                                                           | Status                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **M2**        | Cache files were world-readable on POSIX.                                                                                                                                                            | `writeCache` writes files with mode `0o600`; the cache directory is created with mode `0o700`. POSIX-only; no-op on Windows.                                                                                                                                                   | `core/test/security.test.ts` → `"I7: cache writes ... writes both files with mode 0o600"` (M2 is pinned under the I7 describe block). | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **M3**        | ASCII control characters (`\x00–\x1f`, `\x7f`) in URLs / error messages could survive into terminal output as escape sequences (terminal-escape smuggling via crafted CMS content).                  | Control characters replaced with `?` before any string is passed to `console.warn`. Applies to both URL and error-message paths.                                                                                                                                               | `core/test/security.test.ts` → `"I1 / M3: scrubUrl drops path/query and strips control chars"`.                                       | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **V1**        | (Found in 1.0.3 audit) `copy-pdfjs-viewer.mjs` idempotency-marker substring mismatch — re-running the script without the prebuild `outDir` wipe would double-apply the CSS overrides.                | Marker extracted into a single `PATCH_MARKER` constant referenced verbatim in both the `includes()` check and the appended overrides block — so the substring lookup can never disagree with the appended text.                                                                | Manual re-run regression: running the script twice in a row produces exactly one marker occurrence in `viewer.css`.                   | ✅ **Fixed in 1.0.3; verified at 1.0.5** |
| **M1, M4–M8** | Defense-in-depth hardening (5 items): tighter MIME validation on PDF fetch, additional cache-key entropy, periodic cache GC, stricter URL canonicalization on Fuse-index emit, log-format hardening. | **Active mitigation:** none individually meaningful in isolation — the core attack surfaces each one hardens are already remediated by the C / I-tier fixes above. **Tracked for future patches** so each ships in a small, reviewable change rather than a single big bundle. | n/a — deferred to future patches as independently shippable units.                                                                    | ⚠️ **Defense-in-depth, future patches**  |

### What "verified" actually means

Every ✅ row above ships a fix that we re-tested at v1.0.5 in two independent ways:

1. **Regression test pins the fix in place.** Run `pnpm test` and you'll see all 115 tests pass — including the security-named tests listed in the "Verified by" column above. A regression in any fix would fail CI before it shipped.
2. **Re-attack confirms the fix.** The 2026-05-16 v1.0.5 verification pass replayed each original attack input (the 130 KB ReDoS body, the `cacheDir: '/etc/'` MCP arg, the `endpoint: '../../etc/escape.json'` Astro config, the streaming-fetch oversized-body case, the `</script>`-poisoned PDF text, the compression-bomb PDF, etc.) against v1.0.5 HEAD and confirmed each is blocked exactly as the original fix specified.

The ⚠️ rows do **not** indicate an exploitable issue at the current release. Each one is either (a) tracked for a future release with an explicit version target and a documented active mitigation, or (b) a non-security cost (I2) or developer-supplied input (I5, I6) that doesn't increase the live attack surface.

### New public API surface (1.0.2)

- `safeJSONForHTML(obj, indent?)` — HTML-safe JSON serializer for embedding the index into `<script type="application/json">`.
- `scrubUrl(url)` — origin-only URL redaction helper for failure-log paths.
- `ExtractOptions.maxExtractedTextChars?: number` (default `5_000_000`).
- `ExtractOptions.debug?: boolean` (default `false`).

### Changed defaults (1.0.2)

- `maxBytes`: 100 MB → 32 MB. If you legitimately host larger PDFs, opt up: `{ maxBytes: 100 * 1024 * 1024 }`.
- Parse-error logs: full message → categorized tag. Flip `debug: true` for triage.
- Fetch-failure logs: full URL → origin only. Flip `debug: true` for triage.

### Test coverage

115 tests pass at v1.0.5 across the monorepo. 26 of those landed alongside the 1.0.2 audit fixes (105 total → 79 in 1.0.1); 9 more landed in 1.0.3 for the multi-snippet picker (V2/V3/V4 — malformed indices, perf bound, multi-region HTML-escape correctness); 1 explicit M3 regression test landed in 1.0.5 (added per the v1.0.5 verification pass). Every Critical and Important fix has at least one named regression test in the table above.

The full [Security considerations & audit history](#security-considerations--audit-history) section further down spells out the trust model, the migration notes, and the full audit transcript including the v1.0.5 verification pass.

---

## Supported formats

Added in v1.1: DOCX, PPTX, XLSX alongside the original PDF support. All four formats produce the same `IndexedDocument` row shape with a `format` discriminator, so your downstream search engine (Fuse.js, MiniSearch, FlexSearch, …) treats them uniformly.

| Format | Extension | Parser            | Page-like count                       | Optional peer dep                |
| ------ | --------- | ----------------- | ------------------------------------- | -------------------------------- |
| PDF    | `.pdf`    | `unpdf` (bundled) | Pages                                 | (no peer — bundled)              |
| DOCX   | `.docx`   | `officeparser`    | n/a (DOCX has no native page concept) | `officeparser@^5.0.0` (optional) |
| PPTX   | `.pptx`   | `officeparser`    | Slides                                | `officeparser@^5.0.0` (optional) |
| XLSX   | `.xlsx`   | `officeparser`    | Sheets                                | `officeparser@^5.0.0` (optional) |

**The single `officeparser` peer dependency covers all three Office formats.** PDF-only consumers don't install it.

```bash
# PDF-only (smallest install — what 1.0.x consumers already have):
npm install @icjia/pdf-search-index

# Multi-format (PDF + DOCX + PPTX + XLSX):
npm install @icjia/pdf-search-index officeparser
```

### Public API for multi-format

```ts
import {
  indexDocuments,
  extractDocumentText,
  extractDocumentsFromBody,
  type IndexedDocument,
  type DocumentFormat, // 'pdf' | 'docx' | 'pptx' | 'xlsx'
} from '@icjia/pdf-search-index';

// Mix any combination of the four formats in a single call:
const rows: IndexedDocument[] = await indexDocuments([
  'https://example.com/annual-report-2024.pdf',
  'https://example.com/board-minutes-march.docx',
  'https://example.com/quarterly-deck.pptx',
  'https://example.com/budget-2024.xlsx',
]);

// Each row carries a `format` discriminator:
for (const r of rows) {
  console.log(`[${r.format}] ${r.title} — ${r.text.length} chars`);
}
```

The PDF-only legacy API (`indexPdfs`, `extractPdfText`, `extractPdfsFromBody`) is **preserved exactly** for 1.0.x consumers. It dispatches to the PDF extractor regardless of URL extension — passing a `.docx` URL to `indexPdfs` will fail with a categorized parse error, just as it did before. **Migrate to `indexDocuments` to opt into multi-format dispatch.**

### Per-format notes

- **PDF.** Unchanged from 1.0.x. `unpdf` is bundled (no peer dep). Page count populates `pages`. Info-dict title (the PDF's metadata "Title" field) is used as the row title when no explicit title is provided.
- **DOCX.** Plain text is extracted in paragraph order. There is no native page concept in DOCX (pages only exist once rendered by Word/LibreOffice), so `pages` is left undefined. The row title falls back to a humanized filename.
- **PPTX.** Per-slide text concatenated. Speaker notes included when present. Slide count populates `pages`. The row title falls back to a humanized filename — the actual deck title is buried in slide-1 placeholder text and we don't try to guess.
- **XLSX.** Per-sheet text extracted. Sheet count populates `pages`. Each sheet's cells are concatenated; large spreadsheets can produce huge text blobs, which the existing `maxExtractedTextChars` cap (default 5 MB) bounds. For per-row or per-cell search semantics, you'd want a different design — tracked for a future major.

### What's NOT in scope

- **Legacy Office binary formats (`.doc`, `.ppt`, `.xls`).** Pre-2007 Office uses a different on-disk format (OLE compound documents). Not supported.
- **OpenDocument formats (`.odt`, `.odp`, `.ods`).** `officeparser` does support these underneath, but the package's URL scanner and dispatcher are scoped to the four Microsoft Office Open XML formats. ODT support is plausible for v1.2 if there's demand.
- **OCR for scanned PDFs / image-only DOCX.** Pre-flight with `ocrmypdf` (or equivalent) before passing the file to this package. See [Limits and non-goals](#limits-and-non-goals).
- **In-document highlighting for Office formats.** The bundled Mozilla pdf.js viewer in the netlify-demo provides in-document highlight for PDFs. There's no equivalent for Office docs — clicking a DOCX/PPTX/XLSX result in the demo opens the file in the OS-level handler (Word, PowerPoint, Excel, Pages, etc.) without query-anchored highlight.

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

## Where your PDFs can live

The package consumes URLs. Anything fetchable at build time becomes a searchable row — there's no required hosting model. The four patterns below cover everything we've seen in real deployments.

### Pattern 1 — Alongside the site (static / `public/`)

The simplest case. Drop PDFs into your framework's static-asset directory and let the build pipeline ship them with the rest of the site:

| Framework  | Drop PDFs in                   | Served at       |
| ---------- | ------------------------------ | --------------- |
| Astro      | `public/docs/`                 | `/docs/foo.pdf` |
| Vite / Vue | `public/docs/`                 | `/docs/foo.pdf` |
| Next.js    | `public/docs/`                 | `/docs/foo.pdf` |
| Nuxt       | `public/docs/`                 | `/docs/foo.pdf` |
| 11ty       | `src/docs/` (passthrough copy) | `/docs/foo.pdf` |

Reference them in markdown content or pass the URL list directly:

```ts
// scripts/build-index.mjs (run as a prebuild step)
import { indexPdfs } from '@icjia/pdf-search-index';

// The PDFs ship from public/docs/. During build, your dev server is up at
// the framework's port (Astro 4321, Vite 5173, Next 3000, Nuxt 3000) —
// fetch them through that.
const rows = await indexPdfs([
  'http://localhost:4321/docs/annual-report.pdf',
  'http://localhost:4321/docs/faq.pdf',
]);
```

For frameworks that don't run a dev server during build (or for hermetic CI), use a `file://` URL with a small `localFetch` helper (every example in [`examples/*`](./examples) demonstrates this pattern):

```ts
import { indexPdfs } from '@icjia/pdf-search-index';
import { localFetch } from './local-fetch.mjs';
import { resolve } from 'node:path';

const rows = await indexPdfs([`file://${resolve('public/docs/annual-report.pdf')}`], {
  fetch: localFetch,
});
```

**When to use this pattern:** small fixed corpus, slow-churn content, single team owns both content and code, no CMS in the stack.

### Pattern 2 — External CMS (Strapi, Sanity, Contentful, Drupal, etc.)

PDFs live in the CMS's media library; content authors upload them through the CMS UI; the markdown body references them via standard `[Title](url)` links. Your Nuxt / Astro / Next build fetches the body at build time, the package walks it, and the PDF text becomes searchable alongside the page text.

This is the canonical case for `@icjia/nuxt-pdf-search-index`. The module ships `extractPdfsFromCmsBody` for exactly this flow.

#### Strapi v5 (current as of 2025+)

v5 dropped the `attributes` wrapper — fields sit on the data object directly. Document IDs (string) replaced numeric `id`s as the stable identifier.

```ts
// server/api/searchIndex.get.ts
import { extractPdfsFromCmsBody } from '#imports';

interface StrapiV5Page {
  documentId: string;
  title: string;
  body: string;
}

export default defineEventHandler(async () => {
  const res = await $fetch<{ data: StrapiV5Page[] }>('https://cms.example.com/api/pages');

  const pdfs = [];
  for (const page of res.data) {
    pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
  }
  return pdfs;
});
```

#### Strapi v4

Wraps fields in `attributes`. Media relations need `populate=*` to be returned.

```ts
import { extractPdfsFromCmsBody } from '#imports';

interface StrapiV4Page {
  id: number;
  attributes: {
    title: string;
    body: string;
  };
}

const res = await $fetch<{ data: StrapiV4Page[] }>('https://cms.example.com/api/pages?populate=*');

const pdfs = [];
for (const page of res.data) {
  pdfs.push(...(await extractPdfsFromCmsBody(page.attributes.body)));
}
```

#### Strapi v3

Flat response shape (no `data` envelope, no `attributes`).

```ts
import { extractPdfsFromCmsBody } from '#imports';

interface StrapiV3Page {
  id: number;
  title: string;
  body: string;
}

const pages = await $fetch<StrapiV3Page[]>('https://cms.example.com/pages');

const pdfs = [];
for (const page of pages) {
  pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
}
```

#### Strapi quirk: relative URLs

By default, Strapi 4/5 serves uploaded media at relative paths like `/uploads/annual-report-abc123.pdf`. The URL scanner only matches absolute `https?://` URLs, so you need to absolutize before scanning:

```ts
const CMS_BASE = process.env.CMS_BASE!; // e.g. 'https://cms.example.com'

const absolutized = page.body.replaceAll(/\]\((\/uploads\/[^)]+\.pdf)/g, `](${CMS_BASE}$1`);
pdfs.push(...(await extractPdfsFromCmsBody(absolutized)));
```

Or configure Strapi to serve absolute URLs (Strapi 4/5: set `url` in `config/server.ts` to your public CMS hostname; or use an upload provider like `aws-s3` that returns absolute CDN URLs).

#### Strapi quirk: token-gated uploads

If your Strapi instance requires a JWT or API token to download media (private media or `users-permissions` restrictions), pass a custom `fetch` with the auth header:

```ts
const authFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
    },
  });

pdfs.push(...(await extractPdfsFromCmsBody(body, { fetch: authFetch })));
```

The `fetch` option threads through to every PDF download. Same pattern works for Bearer / Basic / API-key / custom-header auth on any CMS.

#### Strapi quirk: PDFs as structured media relations (not in body markdown)

If your CMS schema stores PDFs as typed media fields (`attachments: Media[]`) rather than as markdown links inside `body`, the scanner won't find them. Skip `extractPdfsFromCmsBody` and call `indexPdfs` directly with the URL list:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const directRows = await indexPdfs(
  page.attachments.map((a) => ({
    url: CMS_BASE + a.url,
    title: a.name ?? a.alternativeText,
  })),
);
```

#### Other CMSes

The pattern generalizes — any CMS that returns markdown bodies with `[Title](https://...pdf)` links works with `extractPdfsFromCmsBody` or core's `extractPdfsFromBody`. Sanity (`portableTextToMarkdown` first), Contentful (rich-text rendered to markdown), Directus, Drupal — all use the same shape.

### Pattern 3 — External CDN (S3, Cloudflare R2, GitHub raw, etc.)

PDFs live on an object store at known HTTPS URLs. Pass the URL list directly to `indexPdfs`:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  'https://cdn.example.com/reports/2024-annual.pdf',
  'https://cdn.example.com/reports/2023-annual.pdf',
  { url: 'https://cdn.example.com/legal/policy.pdf', title: 'Privacy Policy' },
]);
```

Works with signed URLs (S3 presigned, Cloudflare signed URLs) — just refresh them in your build script. For private buckets requiring SDK auth, use a custom `fetch` that pulls from the SDK:

```ts
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: 'us-east-1' });
const signedFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('s3://')) {
    const [, , bucket, ...keyParts] = url.split('/');
    const signed = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: keyParts.join('/') }),
      { expiresIn: 60 },
    );
    return fetch(signed);
  }
  return fetch(input);
};

const rows = await indexPdfs(['s3://my-bucket/reports/2024.pdf'], { fetch: signedFetch });
```

### Pattern 4 — Local-only (build-time, tests / examples)

For hermetic builds where the PDFs ship in your repo and never get a public URL, use `file://` URLs + a `localFetch` helper that intercepts the `file://` scheme. Every example in [`examples/`](./examples) uses this pattern — see [`examples/plain-node/local-fetch.mjs`](./examples/plain-node/local-fetch.mjs) for the 15-line helper.

```ts
import { indexPdfs } from '@icjia/pdf-search-index';
import { localFetch } from './local-fetch.mjs';
import { resolve } from 'node:path';

const rows = await indexPdfs(
  [`file://${resolve('./fixtures/foo.pdf')}`, `file://${resolve('./fixtures/bar.pdf')}`],
  { fetch: localFetch },
);
```

**When to use this pattern:** offline / air-gapped builds, deterministic fixtures for tests, examples in this repo.

### What's configurable

Every pattern above goes through the same options object. The full list:

| Option                  | Type                             | Default                    | What it's for                                                                                     |
| ----------------------- | -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `cacheDir`              | `string`                         | `'.pdf-cache'`             | Where extracted text is cached on disk between builds                                             |
| `fetch`                 | `typeof fetch`                   | global `fetch`             | **The escape hatch** — auth headers, `file://` URLs, signed URLs, redirects                       |
| `fetchTimeout`          | `number` (ms)                    | `30000`                    | Abort the fetch after this many ms                                                                |
| `maxBytes`              | `number`                         | `32 * 1024 * 1024` (32 MB) | Reject PDFs larger than this (declared `Content-Length` first, then streaming cap)                |
| `maxExtractedTextChars` | `number`                         | `5_000_000`                | Cap on extracted text length per PDF (defends against compression-bomb PDFs)                      |
| `concurrency`           | `number`                         | `4`                        | Parallel downloads via `p-limit`                                                                  |
| `cache`                 | `'use' \| 'bypass' \| 'refresh'` | `'use'`                    | `bypass` skips read+write; `refresh` overwrites cache; `use` is read-through                      |
| `debug`                 | `boolean`                        | `false`                    | When `true`, failure logs include the full URL and underlying error message (default scrubs both) |

For the Astro and Nuxt adapters, these flow through too — see the [Astro integration](#astro-integration) and [Nuxt 4 module](#nuxt-4-module) sections for the adapter-specific option tables.

### Cache invalidation across hosting patterns

Cache keys are `SHA-256(url)` truncated to 16 hex chars. Implications by hosting model:

- **Static `/public/` PDFs** — URL stable for the life of a deploy. Cache works perfectly.
- **Strapi (and most CMSes)** — uploads usually get a hash suffix in the filename (`annual-report-abc123.pdf`), so a re-upload gets a new URL and the cache invalidates naturally. If your CMS overwrites at the same URL (rare; check your media provider config), run `pdf-search-index cache rm <url>` or just `pdf-search-index cache clear` in your build script before `indexPdfs`.
- **External CDN with content-addressed URLs (S3 + Cloudfront with versioning, R2 with hashes)** — same as Strapi-with-hashing. Naturally cache-friendly.
- **External CDN with stable URLs (no versioning)** — same caveat as Strapi-no-hashing. Use `--refresh` or clear the cache when you know the content changed.

---

## Using a search engine other than Fuse.js

**Short answer: Fuse.js is optional.** The core extraction API produces plain JSON. You can feed it to any client- or server-side search engine — MiniSearch, Orama, Lunr, FlexSearch, Pagefind, Typesense, MeiliSearch, Algolia. Fuse.js is only required if you specifically import the `/fuse` or `/snippet` helper subpaths.

### Engine comparison — Fuse.js vs FlexSearch vs Pagefind

The three engines most often paired with this package work very differently. Pick by corpus size and the tradeoff you care about most.

| Dimension                  | **Fuse.js**                                                                         | **FlexSearch**                                                                 | **Pagefind**                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Operating model**        | In-memory fuzzy search over a flat array                                            | In-memory full-text search over a structured index                             | **Static-site search**: chunked index loaded on-demand from the CDN per query                                                |
| **Sweet spot (corpus)**    | < 1,000 documents                                                                   | 1,000 – 50,000 documents                                                       | 1,000 – 100,000+ documents                                                                                                   |
| **Initial bundle**         | ~12 KB gz + entire JSON index loaded up-front                                       | ~7 KB gz + entire encoded index loaded up-front (smaller than JSON)            | ~50 KB gz client + tiny manifest; **per-query chunks fetched only when needed** (~5-20 KB each)                              |
| **First-paint cost**       | High at scale — must download + parse the full index                                | Medium at scale — encoded format is denser but still all-or-nothing            | Low always — page paints immediately; first search triggers chunk fetch                                                      |
| **Typo tolerance**         | **Excellent (Bitap algorithm).** `"applicent"` → `"applicant"` works out of the box | Good (n-gram + phonetic encoders) but needs tuning                             | Limited — substring + word-boundary matching; no fuzzy match by default                                                      |
| **Match positions**        | **Yes (`includeMatches: true`)** — drives our `<mark>` highlight rendering directly | No native match-position output; you do your own substring search to highlight | Yes — Pagefind returns excerpt fragments pre-highlighted                                                                     |
| **Web Worker support**     | DIY (recipes online)                                                                | **Built-in `WorkerIndex`**                                                     | Built-in; recommended pattern                                                                                                |
| **Pre-built index?**       | Yes (Fuse 7's `createIndex` + `parseIndex`) — skip in-browser build                 | Yes (`index.export`/`import`)                                                  | **Required.** The build step IS the index — there's nothing to build at runtime                                              |
| **Build-time integration** | Just JSON; runs entirely in the browser                                             | Just JSON; runs entirely in the browser                                        | Crawls **HTML pages**, not JSON. Pair with this package by emitting one HTML page per document containing the extracted text |
| **License**                | Apache 2.0                                                                          | Apache 2.0                                                                     | MIT                                                                                                                          |

**Our recommendation for `@icjia/pdf-search-index` consumers:**

- **<1,000 documents** → **Fuse.js**. Smallest API, best typo tolerance, native match-position output. The default in our README and demos.
- **1,000–2,500 documents** → **Fuse.js + prebuilt index + Web Worker.** Keeps the typo tolerance. The prebuilt index skips the ~5–10 s in-browser build. Put Fuse in a Worker so the main thread stays responsive.
- **2,500–10,000 documents** → **FlexSearch.** Faster queries; denser on-disk index. Lose Fuse's typo tolerance — acceptable for most factual / proper-name searches.
- **10,000+ documents** → **Pagefind.** Only engine in this list that scales gracefully to six-figure corpora without paying the full-index-download cost on first load.

**Pagefind integration pattern.** Pagefind crawls _HTML pages_, not JSON. Our package outputs JSON document rows. To pair them: build a step that emits one HTML page per document, with the extracted text in the page body. Pagefind crawls those pages and produces its chunked indexes. The HTML pages don't need to be linked from your site's navigation — they exist purely for Pagefind to read. This is more setup than Fuse/FlexSearch, but at the corpus sizes where Pagefind shines, it's the only viable option.

We use Fuse.js in the live demo because the corpus is small (14 documents). For your own site, pick by the dimensions above.

### What's Fuse-coupled vs framework-agnostic

| Surface                                              | Fuse required? | Notes                                                                                    |
| ---------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `extractPdfText`, `indexPdfs`, `extractPdfsFromBody` | No             | Output is plain `IndexedPdf[]` JSON                                                      |
| `@icjia/astro-pdf-search-index` integration          | No             | Emits the same JSON to `public/<endpoint>.json`                                          |
| `@icjia/nuxt-pdf-search-index` helpers               | No             | Both helpers return `IndexedPdf[]` — feed to any engine                                  |
| `pdf-search-index` CLI (root, `cache`, `verify`)     | No             | The CLI's `search` subcommand uses Fuse internally, but it's bundled — not your peer dep |
| MCP `search_pdfs` tool                               | Internal       | Bundled with the MCP server; not a consumer concern                                      |
| `createFuseIndex` (`/fuse` entry)                    | **Yes**        | Helper specifically for building a Fuse instance                                         |
| `snippetHTMLFor` (`/snippet` entry)                  | **Yes**        | Types `FuseResult<T>` directly; tied to Fuse's match-indices shape                       |

If you're not using Fuse, don't install `fuse.js` and don't import the `/fuse` or `/snippet` subpaths. The core stays useful — you get the indexed JSON, you pick the search engine.

### The row shape every engine can consume

```ts
interface IndexedPdf {
  id: string; // 'pdf-' + first 12 hex chars of SHA-256(url) — stable across rebuilds
  url: string;
  title: string;
  text: string;
  pages?: number;
  extractedAt?: string;
}
```

### Recipes — minimum-working examples for each engine

All recipes assume you've already produced `rows: IndexedPdf[]` via `indexPdfs(...)` or one of the adapters. The result of each recipe is a queryable index — wire your UI to it as usual for that engine.

#### MiniSearch

```ts
import MiniSearch from 'minisearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const search = new MiniSearch({
  fields: ['title', 'text'],
  storeFields: ['id', 'url', 'title'],
  searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.2 },
});
search.addAll(rows);

const results = search.search('applicant portal'); // → [{ id, url, title, score, match, terms }]
```

#### Orama

```ts
import { create, insertMultiple, search } from '@orama/orama';
import { indexPdfs } from '@icjia/pdf-search-index';

const db = create({
  schema: { id: 'string', url: 'string', title: 'string', text: 'string' },
});
const rows = await indexPdfs([
  /* urls */
]);
await insertMultiple(db, rows);

const results = await search(db, { term: 'applicant portal' });
```

#### Lunr.js

```ts
import lunr from 'lunr';
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const idx = lunr(function () {
  this.ref('id');
  this.field('title', { boost: 10 });
  this.field('text');
  rows.forEach((r) => this.add(r));
});

const refs = idx.search('applicant portal').map((r) => r.ref);
const results = refs.map((id) => rows.find((r) => r.id === id)!);
```

#### FlexSearch

```ts
import FlexSearch from 'flexsearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const index = new FlexSearch.Document({
  document: { id: 'id', index: ['title', 'text'], store: ['url', 'title'] },
});
rows.forEach((r) => index.add(r));

const results = index.search('applicant portal'); // → results per field
```

#### Pagefind (static-site search bundler)

Pagefind crawls HTML rather than ingesting JSON, so the bridge is to emit one HTML stub per PDF that Pagefind then indexes:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';
import { mkdir, writeFile } from 'node:fs/promises';

const rows = await indexPdfs([
  /* urls */
]);
await mkdir('dist/pdf-stubs', { recursive: true });
for (const r of rows) {
  await writeFile(
    `dist/pdf-stubs/${r.id}.html`,
    `<!doctype html>
<html data-pagefind-body>
<head><title>${r.title}</title></head>
<body>
  <h1 data-pagefind-meta="title">${r.title}</h1>
  <a data-pagefind-meta="url" href="${r.url}">${r.url}</a>
  <pre>${r.text.replace(/</g, '&lt;')}</pre>
</body>
</html>`,
  );
}
// then: npx pagefind --site dist
```

#### Typesense

```ts
import Typesense from 'typesense';
import { indexPdfs } from '@icjia/pdf-search-index';

const client = new Typesense.Client({
  nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
  apiKey: process.env.TYPESENSE_API_KEY!,
});

const rows = await indexPdfs([
  /* urls */
]);
await client.collections('pdfs').documents().import(rows, { action: 'upsert' });
```

#### MeiliSearch

```ts
import { MeiliSearch } from 'meilisearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const client = new MeiliSearch({
  host: 'http://localhost:7700',
  apiKey: process.env.MEILI_KEY,
});
const rows = await indexPdfs([
  /* urls */
]);
await client.index('pdfs').addDocuments(rows);
```

#### Algolia

```ts
import { algoliasearch } from 'algoliasearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const client = algoliasearch('YOUR_APP_ID', process.env.ALGOLIA_WRITE_KEY!);
const rows = await indexPdfs([
  /* urls */
]);
await client.saveObjects({
  indexName: 'pdfs',
  objects: rows.map((r) => ({ objectID: r.id, ...r })),
});
```

### Snippet rendering without `snippetHTMLFor`

The packaged `snippetHTMLFor` consumes Fuse's `matches[].indices` shape — `[[start, end], ...]` character offsets. Other engines either:

- Return character-level match offsets in a different shape (Orama's `position[]`, MiniSearch's `match` object)
- Return term-level matches without offsets (Lunr's `metadata`, Pagefind's excerpts)
- Don't expose match offsets at all (FlexSearch returns just document IDs)

For engines that **don't** return character offsets, the simplest snippet path is to do your own substring search for the query terms inside `r.text` and slice ±N chars around the first hit. The vanilla-HTML example does this in ~30 inline lines: see [`examples/html/public/index.html`](./examples/html/public/index.html) — search for `snippetHTMLFor`. Copy-paste, adapt the result shape to whatever your engine returns.

For engines that **do** return character offsets (Orama, MiniSearch), you can write a thin adapter that maps their offset shape to Fuse's `indices` shape and re-use the package's `snippetHTMLFor`:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

// Example: Orama position[] → Fuse-shaped result
function asFuseResult(oramaHit) {
  return {
    item: oramaHit.document,
    matches: [
      {
        key: 'text',
        value: oramaHit.document.text,
        indices: oramaHit.positions.text.map((p) => [p.start, p.start + p.length - 1]),
      },
    ],
  };
}

const html = snippetHTMLFor(asFuseResult(hit));
```

This works because `snippetHTMLFor` only looks at `r.item[matchKey]` and the longest entry in `r.matches[*].indices`. As long as your adapter populates those two fields correctly, the helper produces correct output.

### Will the CLI / MCP / Astro / Nuxt surfaces work with my engine?

Yes — the index emitted by each is plain JSON, decoupled from any search engine:

- **CLI**: `pdf-search-index --out dist/searchIndex.json https://...` writes pure JSON
- **MCP `index_pdfs` / `get_pdf_index`**: returns rows; you do what you want with them
- **Astro integration**: writes `public/<endpoint>.json`
- **Nuxt helpers**: return `IndexedPdf[]`

Only the `/fuse` helper, `/snippet` helper, CLI's `search` subcommand, and MCP's `search_pdfs` tool are Fuse-internal — and the last two bundle Fuse themselves, so they don't require you to install it.

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

| Option                  | Type                             | Default                    | Notes                                                                                                       |
| ----------------------- | -------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `cacheDir`              | `string`                         | `'.pdf-cache'`             | Where extracted text is cached on disk                                                                      |
| `fetchTimeout`          | `number` (ms)                    | `30000`                    | Abort the fetch after this many ms                                                                          |
| `maxBytes`              | `number`                         | `32 * 1024 * 1024` (32 MB) | Reject PDFs larger than this. Lowered from 100 MB in 1.0.2 — opt up via this option if you host larger PDFs |
| `maxExtractedTextChars` | `number`                         | `5_000_000` (5 MB)         | Truncate extracted text above this length. Defends against compression-bomb-style PDFs                      |
| `fetch`                 | `typeof fetch`                   | global `fetch`             | Inject your own (auth headers, `file://`, tests)                                                            |
| `cache`                 | `'use' \| 'bypass' \| 'refresh'` | `'use'`                    | `bypass` skips read+write; `refresh` overwrites                                                             |
| `mergePages`            | `boolean`                        | `true`                     | When `false`, returns one entry per page                                                                    |
| `debug`                 | `boolean`                        | `false`                    | When `true`, failure logs include the full URL and underlying error message (default scrubs both)           |

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
  fuseOptions: { threshold: 0.2, includeMatches: true },
});

const results = fuse.search('methamphetamine');
```

The defaults Fuse uses (when you pass `fuseOptions`, they're merged on top of):

```ts
{
  keys: ['title', 'text'],
  threshold: 0.2,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
}
```

The same defaults are used by the CLI's `search` subcommand and the MCP `search_pdfs` tool — keeping them DRY across surfaces means your CLI/MCP/in-browser results behave the same.

**Note:** `createFuseIndex` accepts all `IndexPdfsOptions` fields (`cacheDir`, `concurrency`, `fetch`, etc.) — they're passed through to the internal `indexPdfs` call.

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

Picks the longest match span in the matched key, slices ±N chars of context, collapses whitespace runs (PDF text reflow is noisy), HTML-escapes everything except the `<mark>` wrap, and adds ellipses where truncated. Output is HTML-escaped except the `<mark>` wrap — safe to pass to `v-html` / `dangerouslySetInnerHTML` when the input comes from your own indexed PDFs.

**Options:**

| Option               | Type      | Default  | Notes                                                                                                                                |
| -------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `contextChars`       | `number`  | `80`     | Characters of context on each side of the match                                                                                      |
| `matchKey`           | `string`  | `'text'` | Which Fuse `matches` entry to use                                                                                                    |
| `collapseWhitespace` | `boolean` | `true`   | Collapse `\s+` to single space inside output                                                                                         |
| `maxSnippets`        | `number`  | `1`      | (1.0.3+) Render up to N non-overlapping snippets per result, ordered by document position. Default `1` is byte-identical to ≤ 1.0.2. |
| `separator`          | `string`  | `' … '`  | (1.0.3+) Joins snippets when `maxSnippets > 1`. Default is space + horizontal ellipsis + space.                                      |

**Multi-snippet example:**

```ts
const html = snippetHTMLFor(fuseResult, { maxSnippets: 3, contextChars: 100 });
// → "…drug <mark>testing</mark> required for… … evidence-based <mark>testing</mark> protocols… …<mark>testing</mark> programs are…"
```

The picker greedily takes the N **longest** non-overlapping spans (overlap = context windows intersect), then re-sorts them by start position so snippets appear in document order. Clustered hits collapse into one window; widely-spread hits surface as distinct passages.

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

| Option                 | Type   | Default      | Notes                                           |
| ---------------------- | ------ | ------------ | ----------------------------------------------- |
| `--from <file>`        | path   | —            | Read URLs from a file (one per line)            |
| `--from-sitemap <url>` | url    | —            | Scan a sitemap, index linked PDFs               |
| `--cache-dir <dir>`    | path   | `.pdf-cache` | Cache directory                                 |
| `--concurrency <n>`    | number | `4`          | Parallel fetches                                |
| `--out <file>`         | path   | stdout       | Where to write the output                       |
| `--strict`             | flag   | off          | Exit 1 if any PDF failed                        |
| `--refresh`            | flag   | off          | Re-extract this URL only, skip cache read+write |
| `--refresh-all`        | flag   | off          | Re-extract all URLs and overwrite cache entries |
| `--ndjson`             | flag   | off          | Emit newline-delimited JSON                     |
| `--text`               | flag   | off          | Emit concatenated text only                     |

---

## MCP server (`/mcp` entry)

For LLM workflows where the model needs to search inside PDFs during a conversation.

```bash
npx -p @icjia/pdf-search-index@latest pdf-search-index-mcp
```

Wire it into Claude Desktop / Cursor / any MCP-aware client. **Always use `@latest`** so the client picks up the most recent security and bug fixes — pinning to a specific version means missing patches:

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

**Tools:**

| Tool            | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `extract_pdf`   | Single URL → `{ text, pages }`                                      |
| `index_pdfs`    | URL list (or sitemap URL) → `IndexedPdf[]`                          |
| `get_pdf_index` | List cached entries with metadata (url, length, pages, extractedAt) |
| `search_pdfs`   | URL list + query → ranked snippets (Fuse-powered, internal)         |
| `clear_cache`   | Manual flush                                                        |
| `get_status`    | Server / library / pdf.js versions, cache stats                     |

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

**Module options:**

| Option        | Type     | Default              | Notes                         |
| ------------- | -------- | -------------------- | ----------------------------- |
| `cacheDir`    | `string` | `'.nuxt/.pdf-cache'` | File cache for extracted text |
| `concurrency` | `number` | `4`                  | Parallel fetches              |

**Per-call options** (passed to either helper):

The helpers accept `IndexPdfsOptions` directly — `fetch`, `fetchTimeout`, `maxBytes`, `cache`, `mergePages`, `concurrency` — overriding the module defaults per call.

The module auto-imports two helpers into server-side `#imports`:

- `extractPdfsFromCmsBody(body, options?)` — for Strapi-style CMS body strings
- `extractPdfsFromContentDoc(doc, options?)` — for `@nuxt/content` docs (accepts `{ body }`, `{ _raw }`, `{ rawbody }`, or a plain markdown string)

Both honor `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from `nuxt.config.ts` unless overridden by the per-call `options` arg. Both return `IndexedPdf[]`.

A copy-paste Nitro route template lives at [`packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts`](./packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts). Drop it at `server/api/searchIndex.get.ts` in your Nuxt project and adapt the CMS fetch + `@nuxt/content` query to your stack.

---

## Examples

### Live demo

The flagship live demo lives in [`examples/netlify-demo/`](./examples/netlify-demo) — an Astro 5 site with a Vue 3 search island, a hand-designed dark-mode UI, and a `netlify.toml` so deploying it to Netlify is one click. Once deployed it shows the indexed corpus (10 ICJIA-public PDFs), a sticky search bar, and live highlighted snippets across every committed PDF in `examples/_fixtures/`. Beyond the basics, it ships a live Fuse.js options tuner that exposes every native option Fuse v7.4-beta accepts — including the two new-in-7.4 additions, `ignoreDiacritics` (strip accents so `naïve` matches `naive`) and `useTokenSearch` (Fuse-native TF-IDF token search) — plus a demo-side token-search wrapper for multi-word queries (distinct from `useTokenSearch`; works in any Fuse version), a multi-region snippet picker (passages spread across the document, not clustered), a "Needs OCR — title only" badge for image-only PDFs, and a bundled Mozilla pdf.js viewer (`/pdfjs-viewer/web/viewer.html`) so result clicks open the PDF with the search term pre-filled in the viewer's find bar — reliably across Chrome, Edge, Firefox, and Safari.

> Screenshot (when deployed): dark-mode search interface, ICJIA PDFs listed with title/page count/file size, sticky search bar at top, live-highlighted snippets in result cards.

The reference deployment lives at **<https://icjia-pdf-search.netlify.app/>** — click through to try it. To deploy your own copy under your own subdomain, see "Deploying the live demo to Netlify" below.

The [`examples/`](./examples) directory has eight runnable example sites in total, each demonstrating one integration pattern. Every example consumes the packages via the pnpm workspace link and reads PDFs from the shared [`examples/_fixtures/`](./examples/_fixtures) directory via `file://` URLs + a tiny `local-fetch.mjs` helper (so they work offline).

The fixture PDFs in [`examples/_fixtures/`](./examples/_fixtures) are **randomly-clicked public samples from ICJIA's website** ([icjia.illinois.gov](https://icjia.illinois.gov/)) covering juvenile justice, public health, evaluation reports, methamphetamine trends, substance-use stigma, elder abuse, female criminality, youth and alcohol, and other ICJIA programmatic topics. They were not curated to make the examples look good — they're arbitrary PDFs from the live public corpus, preserved with their original CMS filenames. None of them contain PII. Two fixtures (`Seniors.pdf` and `Female Criminality.pdf`) are intentionally image-only, with no text layer, so the demo always surfaces at least one "Needs OCR — title only" row. Replace them with any PDFs you like; every example auto-discovers `.pdf` files in that directory at build time. See [`examples/_fixtures/README.md`](./examples/_fixtures/README.md) for the full provenance note.

| Example                                   | Stack                               | Adapter / API                                                   | Run                                              |
| ----------------------------------------- | ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| [`netlify-demo`](./examples/netlify-demo) | Astro 5 + Vue + dark-mode UI        | `@icjia/astro-pdf-search-index` — **polished, deployable**      | `pnpm --filter @icjia-examples/netlify-demo dev` |
| [`plain-node`](./examples/plain-node)     | Node 20+, no UI                     | Programmatic (`indexPdfs`, `createFuseIndex`, `snippetHTMLFor`) | `pnpm --filter @icjia-examples/plain-node start` |
| [`html`](./examples/html)                 | Vanilla HTML + Fuse CDN             | Programmatic, build via Node script                             | `pnpm --filter @icjia-examples/html dev`         |
| [`vue`](./examples/vue)                   | Vite + Vue 3 + Fuse                 | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/vue dev`          |
| [`astro`](./examples/astro)               | Astro 5 + Vue island + Fuse         | `@icjia/astro-pdf-search-index` — minimal smoke test            | `pnpm --filter @icjia-examples/astro dev`        |
| [`nextjs`](./examples/nextjs)             | Next.js 15 App Router + Fuse        | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/nextjs dev`       |
| [`eleventy`](./examples/eleventy)         | 11ty 3 + Fuse CDN                   | Programmatic, inline JSON island                                | `pnpm --filter @icjia-examples/eleventy dev`     |
| [`nuxt-mixed`](./examples/nuxt-mixed)     | Nuxt 4 + `@nuxt/content` + mock CMS | `@icjia/nuxt-pdf-search-index` (both helpers)                   | `pnpm --filter @icjia-examples/nuxt-mixed dev`   |

### Examples — step-by-step

1. **Clone and install:**

   ```bash
   git clone https://github.com/ICJIA/pdf-search-index.git
   cd pdf-search-index
   pnpm install
   ```

2. **Confirm fixtures are in place:**

   ```bash
   ls examples/_fixtures/*.pdf
   ```

   You should see several PDFs — they're randomly-clicked public samples
   from [icjia.illinois.gov](https://icjia.illinois.gov/) (see
   [`examples/_fixtures/README.md`](./examples/_fixtures/README.md) for
   provenance). No PII.

3. **Pick an example and run its dev script.** Start with `netlify-demo`
   if you want to see the package in a polished, ship-ready site:

   ```bash
   # Polished, deployable Astro 5 site — see "Deploying the live demo
   # to Netlify" below. (RECOMMENDED — this is the flagship demo.)
   pnpm --filter @icjia-examples/netlify-demo dev   # http://localhost:4322/

   # Programmatic API, no UI
   pnpm --filter @icjia-examples/plain-node start

   # Vanilla HTML + Fuse via CDN
   pnpm --filter @icjia-examples/html dev           # http://localhost:4173/

   # Vite + Vue 3
   pnpm --filter @icjia-examples/vue dev            # http://localhost:5173/

   # Minimal Astro 5 + Vue island (integration smoke test)
   pnpm --filter @icjia-examples/astro dev          # http://localhost:4321/

   # Next.js 15 App Router
   pnpm --filter @icjia-examples/nextjs dev         # http://localhost:3000/

   # 11ty 3 + inline JSON island
   pnpm --filter @icjia-examples/eleventy dev       # http://localhost:8080/

   # Nuxt 4 + @nuxt/content + mocked CMS
   pnpm --filter @icjia-examples/nuxt-mixed dev     # http://localhost:3001/
   ```

4. **Try a query that matches the committed fixtures.** The committed
   samples cover juvenile justice, public health, evaluation reports,
   substance-use stigma, methamphetamine trends, elder abuse, female
   criminality, youth and alcohol, and other ICJIA programmatic topics —
   so search terms that work out of the box include:
   - `"stigma"` — matches the Stigma PDF
   - `"methamphetamine"` — matches the meth-trends overview
   - `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot
   - `"drug testing"` — matches the drug-testing lit review
   - `"elder abuse"` — matches Elderabuse2
   - `"alcohol"` — matches Youth and Alcohol

5. **Build for production:**

   ```bash
   pnpm --filter @icjia-examples/<name> build
   pnpm --filter @icjia-examples/<name> preview    # or `serve`, or `start`
   ```

   Each example documents its build output and serve command in its own
   README — see the table above. For the Netlify-deployable variant, see
   "Deploying the live demo to Netlify" below.

### Deploying the live demo to Netlify

The [`examples/netlify-demo/`](./examples/netlify-demo) example is built around an **Astro 5** site that deploys to Netlify with zero manual config beyond pointing Netlify at the repo. The included [`examples/netlify-demo/netlify.toml`](./examples/netlify-demo/netlify.toml) handles Node version, build command, publish directory, and long-lived asset headers for the served PDFs.

To deploy your own copy:

1. **Fork or clone** [`https://github.com/ICJIA/pdf-search-index`](https://github.com/ICJIA/pdf-search-index) so Netlify can read it.
2. **Sign in** at [https://app.netlify.com](https://app.netlify.com). The free tier is sufficient.
3. **"Add new site" → "Import from Git"** → connect your GitHub account → pick the `pdf-search-index` repo.
4. In the build-settings dialog, leave most defaults but confirm:
   - **Base directory**: `examples/netlify-demo`
   - **Build command**: `pnpm install --frozen-lockfile=false && pnpm build` _(auto-detected from `netlify.toml`)_
   - **Publish directory**: `dist` _(auto-detected from `netlify.toml`)_
   - **Node version**: `22` _(auto-detected from `netlify.toml`'s `NODE_VERSION`)_
5. Click **Deploy**. Netlify clones the repo, runs the build from `examples/netlify-demo`, and gives you a live URL like `https://YOUR-SITE-NAME.netlify.app` within ~2 minutes.

Subsequent pushes to `main` (or whichever branch you've pointed Netlify at) trigger automatic redeploys. Pull requests get deploy previews automatically.

After your first deploy, update [`examples/netlify-demo/astro.config.ts`](./examples/netlify-demo/astro.config.ts)'s `site:` field to match your Netlify subdomain so Astro's canonical URLs are correct in the rendered HTML.

The full long-form deployment guide — including troubleshooting and the two-URL build-vs-runtime pattern — lives in [`examples/netlify-demo/README.md`](./examples/netlify-demo/README.md).

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

OCR for scanned PDFs is out of scope for v1 — see the next section for the recommended pre-OCR workflow.

---

## OCR — working with image-only / scanned PDFs

This package extracts the **text layer** of a PDF (whatever `pdf.js` already knows how to read). It does **not** do OCR. Image-only PDFs — scans, photographs-saved-as-PDF, image-export-to-PDF outputs — have no text layer, so they come back as `{ ..., text: '' }` and Fuse can't match them. You can detect this in the output: a row with `text.length` near zero is almost certainly image-only.

The [live demo](https://icjia-pdf-search.netlify.app/) tags such PDFs with a "Needs OCR — title only" badge in the corpus list. `examples/_fixtures/` ships a couple of legitimately image-only ICJIA samples (`Seniors.pdf`, `Female Criminality.pdf`) so the demo always surfaces at least one row in this state.

**The recommended workflow:** OCR your PDFs _before_ they reach this package. The standard tool is [`ocrmypdf`](https://github.com/ocrmypdf/OCRmyPDF) — it wraps Tesseract and adds a real text layer to an existing PDF without changing its visual appearance.

```bash
# One PDF
ocrmypdf input.pdf output.pdf

# Whole directory, skip ones that already have text
find ./pdfs -name '*.pdf' -exec ocrmypdf --skip-text {} {} \;
```

The OCR'd PDF then has a text layer this package picks up normally on the next build. Run it once when you add the PDF to your CMS / static directory — not at every build.

For a CMS pipeline (Strapi, Sanity, Contentful, Drupal, WordPress) the right hook is the upload-completed lifecycle event: when an editor uploads a PDF, run `ocrmypdf` on it before storage. Most CMSes have a plugin or webhook slot for this; if not, run a nightly batch.

**If you can't pre-OCR** — for instance, you're indexing third-party PDFs you don't control — then this package isn't the right fit alone. Options:

- **Tesseract.js in a build script.** Runs OCR purely in JavaScript. Slower than native Tesseract but no system deps. Pre-process each image-only PDF and stitch the OCR output into a new PDF before passing the URL to `indexPdfs`.
- **Cloud OCR APIs.** Google Document AI, AWS Textract, Adobe Extract API, Mathpix. Each adds API cost + a build-time call but produces high-quality extracted text.
- **Watch for `@icjia/pdf-search-index-ocr`.** The spec parks a sibling package for "ocrmypdf-in-a-box-without-system-deps" mode. Not yet on the roadmap with a hard date; depends on consumer demand.

If you ship to production with a mix of OCR'd and image-only PDFs, the empty-text rows are still in your index — Fuse just won't match them. They surface in the result list when the user filters by metadata (title, file path) but never via body-content queries. Some consumer sites display a small "scanned — search by title only" affordance next to such rows; the demo's "Needs OCR" badge is one way to do this.

---

## Troubleshooting

**My index has rows but `text` is empty.**
The PDF is image-only or scanned (no text layer). Open it in a viewer; if you can't select text, neither can `pdf.js`. See [OCR — working with image-only / scanned PDFs](#ocr--working-with-image-only--scanned-pdfs) for the recommended `ocrmypdf` workflow.

**`fetch error … TypeError: fetch failed`**
Some PDF hosts reject default Node user agents or require cookies. Pass a custom `fetch` (or `fetchHeaders` once that ships) with appropriate headers.

**`unpdf` errors on a real but old PDF.**
`unpdf` wraps `pdfjs-dist`. Very old (pre-1.4) PDFs occasionally fail to parse. Re-export the PDF from Acrobat to a current version, or fall back to `pdf-parse` by writing your own extractor function and passing it via a fork (no plugin slot in v1; `unpdf` covers ~99% of real PDFs).

**The CLI works but my framework integration emits an empty index.**
Check that the markdown bodies actually contain PDF URLs the regex picks up: `[Title](url.pdf)` markdown links or bare `https://...pdf` URLs. Relative paths (`/foo.pdf`) won't be fetched — the extractor needs an absolute URL. For build-time integration with relative paths, see [the `fetch` option](#core-api) — pass a custom `fetch` that resolves your site's URLs.

**`astro dev` doesn't produce my searchIndex.pdfs.json.**
The integration hooks into `astro:build:start`, which only fires during `astro build`. For dev mode, run `astro build` once first (or use the example pattern: a separate `predev` build script). The integration prioritizes byte-stable static output; dev-mode HMR was deferred to a future minor.

**My CI build is slow.**
First build is genuinely O(N PDFs) bytes-downloaded + parse-time. Subsequent builds hit the cache. Persist `.pdf-cache/` between CI runs (GitHub Actions: `actions/cache@v4` keyed on a stable cache key).

**In-PDF highlights only work in Firefox.**
The PDF viewer's `#search=<query>` URL fragment is honored reliably only by Firefox (whose built-in viewer is Mozilla's pdf.js); Chrome/Edge (PDFium) ignore it and Safari is inconsistent. The `examples/netlify-demo/` bundles Mozilla's pdf.js viewer at `/pdfjs-viewer/web/viewer.html` and routes result clicks through it so the same `#search=` behaviour works in every browser. ~7 MB of viewer assets on disk; ~2 MB gzipped over the wire; long-cached with `Cache-Control: immutable` because they're versioned by the installed `pdfjs-dist` release. See [`examples/netlify-demo/README.md`](./examples/netlify-demo/README.md#in-pdf-highlighting-via-mozilla-pdfjs-viewer) for the integration details.

---

## Limits and non-goals

- **Not a search server.** No HTTP query endpoint, no inverted index, no live re-indexing. (For those, use Solr or Elasticsearch.)
- **Not OCR.** Image-only / scanned PDFs return empty text in v1.
- **Not multi-format.** `.docx`, `.xlsx`, `.pptx` are out of scope. Different format = different extractor; they belong in sibling packages.
- **Not a Fuse competitor.** We emit JSON. Consumers pick their search engine.
- **No automatic ETag-based cache invalidation in v1.**
- **Scale target: 10–1,000 PDFs per site.** Above that, look at server-side indexers.

---

## Security considerations & audit history

<a id="security-considerations"></a>

This package is **build-time tooling**. It runs against URL lists you (or your CMS authors) explicitly supplied, on the developer's or CI machine, never against user-submitted input at request time. The threat model and the defenses below reflect that scope. The [top-of-README Security callout](#security) names the v1.0.2 fixes in summary; this section spells out the trust model, the migration notes, and the full audit reference.

### Trust model

| Input source                                                  | Trust level                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URLs you pass directly to `indexPdfs([...])`                  | **Trusted** as developer input — they're code.                                                                                                                                                                          |
| Markdown bodies fed to `extractPdfsFromBody(body)` / adapters | **Trusted as developer-author**, but the _content_ may be authored by CMS editors. Malicious-author scenarios (compromised CMS, hostile content) are partially defended against (see below).                            |
| PDF byte streams downloaded from those URLs                   | **Untrusted** — the bytes are parsed by `unpdf` / `pdfjs-dist`. We add belt-and-suspenders caps on size and extracted-text length.                                                                                      |
| LLM-supplied tool arguments via the MCP server                | **Untrusted** — the LLM may have been prompt-injected via PDF content it just summarized. The MCP `cacheDir` argument is jailed to a per-process safe base; you can't redirect cache I/O to arbitrary filesystem paths. |

What this package does **not** defend against (out of scope for build-time tooling):

- A compromised dependency in your build pipeline.
- A malicious developer pushing a URL list that points at internal-network targets (no SSRF allowlist in 1.0.x — on the 1.1 roadmap).
- A hostile PDF parser exploit in `pdfjs-dist` (track upstream advisories).

### Defenses added in 1.0.2

| Defense                               | Default                           | Knob                                       |
| ------------------------------------- | --------------------------------- | ------------------------------------------ |
| Bounded URL-scanner regex             | `{1,2048}` URL / `{0,1024}` query | none (regex is internal)                   |
| Markdown-body length cap before scan  | 1 MB                              | none — scan skipped above this size        |
| `Content-Length` pre-check on fetch   | enforced                          | `maxBytes` option                          |
| Streaming `maxBytes` enforcement      | 32 MB                             | `maxBytes` option                          |
| Extracted-text length cap             | 5 MB chars                        | `maxExtractedTextChars` option             |
| Scrubbed failure logs (origin only)   | enabled                           | `debug: true` to opt out                   |
| Categorized parse-error tags          | enabled                           | `debug: true` for full message             |
| Atomic cache writes + content hash    | enabled                           | none — sidecar gains `contentSha` field    |
| Restrictive cache file modes          | `0o600` / dir `0o700`             | none — POSIX-only, ignored on Windows      |
| MCP `cacheDir` jail                   | enabled                           | throws on out-of-jail paths                |
| Astro `endpoint` path-traversal guard | enabled                           | throws on out-of-publicDir paths           |
| HTML-safe JSON serializer             | exported as `safeJSONForHTML`     | used by CLI `--out` and Astro adapter emit |

### Embedding the index into HTML

If you inline the emitted JSON into a `<script type="application/json">` block on your page, **use `safeJSONForHTML` rather than `JSON.stringify`**. PDF text containing `</script>` (literally — copy-pasted from a PDF) would otherwise let an attacker break out of the embedding:

```ts
import { safeJSONForHTML, indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const html = `<script id="pdf-index" type="application/json">${safeJSONForHTML(rows)}</script>`;
```

`safeJSONForHTML` also escapes U+2028 / U+2029, which older JS engines treat as line terminators inside string literals.

The CLI's `--out` writer and the Astro adapter's emit both use `safeJSONForHTML` by default. You only need to call it yourself if you're serializing rows manually inside a build script that inlines them into HTML.

### Migration notes from 1.0.1

<a id="migration-notes-from-101"></a>

- **Default `maxBytes` lowered from 100 MB to 32 MB.** If you legitimately host PDFs larger than 32 MB, pass `{ maxBytes: 100 * 1024 * 1024 }` (or whatever cap fits your dataset). The library logs a warning when a PDF is rejected on size grounds.
- **Extracted text capped at 5 MB chars by default.** If a real PDF in your corpus exceeds 5 MB of plain text, raise `maxExtractedTextChars` accordingly.
- **Failure logs are now scrubbed by default** — full URLs and underlying error messages are gated behind `debug: true`. For CI triage, flip the flag.
- **MCP `cacheDir` is now jailed under `<os.tmpdir>/pdf-search-index-mcp/...`.** If your LLM client was passing absolute paths, switch to relative subdirectory names.
- **Astro `endpoint` is validated** — it must resolve inside `publicDir`. Existing valid configurations (relative paths inside `public/`) keep working.

### Audit reference

<a id="audit-reference"></a>

The 1.0.2 changes implement the Critical and Important fixes from a full adversarial red/blue team audit run against 1.0.1 on **2026-05-16**. A separate opus-class LLM agent ran proof-of-concept attack scripts in `/tmp/` against each finding before reporting, so every finding is reproducible from the audit transcript.

### 2026-05-16 — v1.0.3 audit (scope-limited delta)

A second adversarial red/blue team pass ran against the v1.0.3 deltas (the surfaces that didn't exist when the v1.0.2 audit ran). Scope:

- Core: `snippetHTMLFor` with the new `maxSnippets` / `separator` options (the multi-snippet greedy non-overlapping picker).
- netlify-demo: `tokenizeAndSearch` wrapper for multi-word queries.
- netlify-demo: `distributeMatches` spatial-bucket snippet picker.
- netlify-demo: bundled Mozilla pdf.js viewer at `public/pdfjs-viewer/` and the `#search=` URL fragment.
- netlify-demo: post-extraction patch of pdf.js `viewer.css` in `scripts/copy-pdfjs-viewer.mjs`.
- `fuse.js@7.4.0-beta.6` pin behavior (npm semver semantics around prereleases).

**Findings:**

| ID  | Severity      | What it was                                                                                                                                                                                                                                                                                                                                                                        | What we did                                                                                                                                                                                                                                                                                           |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------- |
| V1  | Minor         | `copy-pdfjs-viewer.mjs` idempotency-marker mismatch — the marker substring `icjia-pdf-search-index demo overrides` is NOT a substring of `@icjia/pdf-search-index demo overrides` (the `/` between `icjia` and `pdf-search-index` breaks the match). Re-running the script without the `outDir` wipe would double-apply the CSS overrides; the wipe masked the bug in normal flow. | Marker extracted into a `PATCH_MARKER` constant referenced verbatim in both the `includes()` check and the appended overrides block — fix in `examples/netlify-demo/scripts/copy-pdfjs-viewer.mjs`. Regression-tested by re-running the script and confirming exactly one marker occurrence.          |
| V2  | Informational | `snippetHTMLFor` with malformed indices (`[end, start]` reversed, negative, `NaN`, `Infinity`, out-of-bounds) produces degenerate but non-throwing output                                                                                                                                                                                                                          | Pinned the no-throw contract with a regression test (`test/snippet.test.ts`). Not exploitable — Fuse 7's own search only emits valid `[start, end]` tuples; the test guards against a future buggy upstream Fuse build crashing the search UI.                                                        |
| V3  | Informational | `snippetHTMLFor` with 50,000 indices completes in <3ms on Node and <500ms in the worst case — no DoS even under adversarial input                                                                                                                                                                                                                                                  | Added a perf regression test that asserts the picker is bounded by `maxSnippets` in output and finishes in <500ms on 50,000 indices. No production code change.                                                                                                                                       |
| V4  | Informational | Multi-snippet HTML-escape correctness — verified `</script>` and `<mark>` in source text are properly escaped across every snippet, not just the first                                                                                                                                                                                                                             | Added a regression test that adversarial PDF text containing `</script>` near every match still produces a fully-escaped multi-snippet HTML output. No production code change.                                                                                                                        |
| V5  | Informational | `tokenizeAndSearch` result-merge could accumulate up to ~200K spans on a 100-word user query against a long PDF (~50 MB heap on a 134 KB body × 2 rows)                                                                                                                                                                                                                            | Documented as a known cost in the netlify-demo's README. Not a security issue — the user is hurting only their own tab; browser memory limits self-clamp the worst case. Per-token loop is bounded by the user's query length; merge result is bounded by Fuse's own `findAllMatches` cap.            |
| V6  | Informational | `viewerUrl(r)` query and `?file=` parameter encoding — adversarial CMS-supplied `r.item.url` values (path-traversal characters, `?#&\n` in basename) safely encoded                                                                                                                                                                                                                | Verified by probing the `publicPdfUrl` + `viewerUrl` composition with adversarial inputs (`..`, `?`, `#`, `&`, `\n`). The single-`encodeURIComponent(basename)` pattern prevents traversal; `encodeURIComponent(query)` prevents fragment injection; viewer's `validateFileURL` enforces same-origin. |
| V7  | Informational | `fuse.js@7.4.0-beta.6` — no public CVE; lockfile pins to exact version; package.json `dependencies` use exact strings (no caret) so npm prerelease semver semantics resolve deterministically                                                                                                                                                                                      | Confirmed via web search (no public advisory) and lockfile inspection. Beta pre-release versions don't satisfy non-prerelease ranges (`^7.0.0` excludes betas), so the core package's peerDependencies `"^7.0.0                                                                                       |     | >=7.4.0-beta.0"` is the explicit opt-in. |

**No new Critical or Important findings against the v1.0.2 baseline.** The v1.0.3 deltas added attack surface narrowly (additive `snippetHTMLFor` option, demo-only wrappers, vendored viewer) and the audit verified that:

- The multi-snippet picker preserves the pre-1.0.3 HTML-escape contract under all input shapes (V4).
- The greedy non-overlapping picker is bounded by `maxSnippets` (default 1) — no path to unbounded output (V3).
- Malformed Fuse indices don't crash the renderer (V2) — degenerate output is acceptable.
- The vendored pdf.js viewer enforces same-origin on `?file=` (V6) and only accepts the literal `search=` query in `#search=<query>` after a `replaceAll('"', '')` strip — no script-injection path.
- The CSS patch idempotency bug (V1) only mis-fires in a manual-invocation path; the normal `prebuild` flow wipes `outDir` first, masking it. Fixed prospectively for cleanliness.

`fuse.js@7.4.0-beta.6` is pinned to an exact version in every workspace package.json + lockfile. No path for npm to silently roll a consumer onto a different beta point.

### 2026-05-16 — v1.0.5 verification pass

A **third** adversarial red/blue team pass ran against v1.0.5 (commit `fae222f`) with two explicit goals: (1) verify every 1.0.2 fix is still in place and provably remediates its original vulnerability, and (2) surface any new findings against the v1.0.3+ surface that the prior delta pass might have missed.

**Methodology.** Independent opus-class LLM agent. Source review at every named fix site. Adversarial probe scripts written to `/tmp/` and run against the built `dist/` of `@icjia/pdf-search-index@1.0.5`. Probe volumes 5× the existing regression-test payload sizes (e.g., the C1 ReDoS probe used a 50,000-iteration `'[X](https://a'.repeat(N)` payload against the live `dist/` — completed in 1.41 ms).

**Result: 11 of 11 prior fixes verified.**

| Fix ID | Located at                                                                              | Regression test                                                                                                                                              | Re-attack at v1.0.5                                                  |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| C1     | `packages/core/src/url-scan.ts:11-22`                                                   | `core/test/security.test.ts:33-61` (3 tests)                                                                                                                 | 50 K-iter payload → 1.41 ms ✅                                       |
| C3     | `packages/core/src/extractor.ts:81-162`; default at line 9                              | `core/test/security.test.ts:68-166` (3 tests)                                                                                                                | streaming abort confirmed ✅                                         |
| C4     | `packages/core/src/mcp.ts:21-32` + `packages/core/src/cache.ts:152-176`                 | `core/test/security.test.ts:314-347` (4 jail + 1 allowlist)                                                                                                  | `/etc/passwd`, `../../tmp`, `'..'`, `'.//../escape'` all rejected ✅ |
| C5     | `packages/astro-pdf-search-index/src/index.ts:100-111`                                  | `astro/test/integration.test.ts:119-129`                                                                                                                     | path-traversal blocked ✅                                            |
| I1     | `packages/core/src/extractor.ts:53-67`; usage 84, 91, 103, 119, 144, 156, 232, 282      | `core/test/security.test.ts:203-227` (3 tests)                                                                                                               | URL paths scrubbed in logs ✅                                        |
| I3     | `packages/core/src/extractor.ts:14` + 204-209                                           | `core/test/security.test.ts:171-198` (2 tests)                                                                                                               | text capped at 5 MB ✅                                               |
| I4     | `packages/core/src/json-safe.ts:23-29`; used in `cli.ts:199` + `astro/src/index.ts:118` | `core/test/security.test.ts:233-255` + `astro/test/integration.test.ts:131-158`                                                                              | `</script>` escaped end-to-end ✅                                    |
| I7     | `packages/core/src/cache.ts:81-125` (write); 58-75 (read); 41-43 (hash)                 | `core/test/security.test.ts:260-309` (4 tests)                                                                                                               | atomic + sha verified ✅                                             |
| I8     | `packages/core/src/extractor.ts:74-79` + 230-237                                        | `core/test/security.test.ts:354-376` + `extractor-encrypted.test.ts:19-78`                                                                                   | categorized tag only ✅                                              |
| M2     | `packages/core/src/cache.ts:28-29` (`FILE_MODE`, `DIR_MODE`)                            | `core/test/security.test.ts:261-269`                                                                                                                         | 0o600 / 0o700 confirmed ✅                                           |
| M3     | `packages/core/src/extractor.ts:62-67` (`scrubControl`); used at 56, 156, 232, 282      | `core/test/security.test.ts:228-249` — **new explicit test added in 1.0.5** (`'M3 explicit: strips ASCII control chars from error messages before logging'`) | NUL / ESC / BEL / BS / CR all replaced with `?` ✅                   |

**New finding (1 only): V8 — informational hardening.**

| ID  | Severity      | What it was                                                                                                                                                                                                                                                                                                                                                | What we did                                                                                                                                                                                                                                                                                                        |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V8  | Informational | `snippetHTMLFor(r, { separator })` concatenates the `separator` parameter raw into the returned HTML — by design, so consumers can pass `'<br>'` or `'<hr>'` if they want a markup separator. **Not exploitable in any documented consumer pattern.** A consumer-side bug would arise only if a UI control fed end-user text directly into this parameter. | Added an explicit JSDoc security note on `separator` in `packages/core/src/snippet.ts` warning callers to treat the parameter as developer-controlled input only. No code change to the function body — the unescaped concatenation is the documented behavior (consumers passing `' … '` or `'<br>'` rely on it). |

**Deferred items — status unchanged.** The third audit reconfirmed that C2 (SSRF allowlist), I2 (cache-key normalization), I5 (CLI sitemap hardening), I6 (`maxUrls` cap), and the six Minor defense-in-depth items (M1, M4–M8) remain appropriate deferrals. **Notable side-effect:** the I7 contentSha verification fix (shipped 1.0.2) **partially defuses I2's security impact** in 1.0.x — a hypothetical cache-key collision would now be caught at read time as a hash mismatch and treated as a miss, so the practical exposure of I2 is limited to cache-efficiency cost (duplicate fetches) rather than an information-leak path.

**Verdict.** The "Status as of v1.0.5" headline at the top of this README — "Zero unaddressed exploitable issues against the documented usage envelope" — is supported by this audit's evidence. The user-facing impact of the v1.0.5 release is documentation clarity, not new code; the V8 JSDoc note and the new M3 regression test are belt-and-suspenders hardening, not vulnerability fixes.

### 2026-05-17 — v1.1.0 multi-format audit

A **fourth** adversarial red/blue team pass ran against the v1.1.0 multi-format refactor (the changes that ship `@icjia/pdf-search-index` with DOCX/PPTX/XLSX support via the optional `officeparser` peer dep). Goals: re-verify every prior fix survives the refactor, and surface any new findings on the new surface.

**Methodology.** Independent opus-class LLM agent. Full source review through the renamed/relocated code paths (`fetchPdfBytes → fetchDocumentBytes`, `parsePdf → parseDocument → parsePdf | parseOfficeDoc`, widened URL-scan alternation, three new MCP tools, two new Nuxt helpers, Astro adapter rewire). Static trace of every probe scenario from the audit plan (plan-mode environment prevented `/tmp/` execution, but every probe has deterministic dispatch through the source).

**Scope:**

- `officeparser` integration (`parseOfficeDoc` in extractor.ts) including dynamic-import resolution, prototype-pollution paths, and CVE check of the dep tree.
- New format-mismatch defense (`detectFormatFamilyFromBytes` + `parseDocument` dispatcher) — every bypass class traced.
- Format dispatch by extension (`detectFormatFromUrl` + `extractCore` format resolution).
- ZIP-slip / XXE attack surface introduced by Office format parsing.
- V8 mitigation (1.0.5 JSDoc note on `SnippetOptions.separator`) — still in place.
- CLI / MCP surface changes (new `index_documents` / `extract_document` / `search_documents` tools, widened sitemap filter regex).
- Inflate-bomb deferral acceptability.

**Result: 11 of 11 prior fixes verified, 0 new Critical/Important/Minor findings.**

| Fix    | Verified at v1.1 source path                             | Evidence                                                                                                                   |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **C1** | `url-scan.ts:16-22, 34`                                  | Bounded `{1,2048}` / `{0,1024}` quantifiers preserved; alternation `(?:pdf\|docx\|pptx\|xlsx)` is O(1) in regex complexity |
| **C3** | `extractor.ts:156-237` (renamed to `fetchDocumentBytes`) | Content-Length pre-check + stream-cancel on overflow; single fetch serves all 4 formats                                    |
| **C4** | `mcp.ts:28-37`                                           | `safeCacheDir` wired into all 9 tools incl. 3 new 1.1 tools                                                                |
| **C5** | `astro/.../index.ts:114-121`                             | Path-traversal guard intact                                                                                                |
| **I1** | `extractor.ts:114-128`                                   | `scrubUrl` + `scrubControl` applied in every log site incl. `parseOfficeDoc` (lines 355-360, 386-394)                      |
| **I3** | `extractor.ts:282-287, 374-379`                          | **Extended** — Office formats hit the same 5 MB cap                                                                        |
| **I4** | `json-safe.ts:20-29`                                     | Wired into CLI `--out` (cli.ts:215) + Astro adapter (astro/.../index.ts:128)                                               |
| **I7** | `cache.ts:81-125`                                        | Tmp-file + rename + hash check                                                                                             |
| **I8** | `extractor.ts:139-154`                                   | **Extended** — new `format` parameter, defaults to `'pdf'` for back-compat; Office tags mirror PDF set                     |
| **M2** | `cache.ts:28-29, 87, 107-109`                            | `0o600`/`0o700` intact; `KEY_PATTERN` allowlist preserved                                                                  |
| **M3** | `extractor.ts:123, 231, 311, 358, 388, 504`              | Propagated to all new log sites incl. Office parser error paths                                                            |

**New finding (1 only, Informational):**

| ID  | Severity      | What it is                                                                                                                                                                                                                                                                                                                                        | What we did                                                                                                                                                                                                   |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V9  | Informational | The `officeparser` dynamic-import (`await import('officeparser')`) resolves whichever copy lives in `node_modules`. Same risk class as the pre-existing `unpdf` and `fuse.js` dynamic imports. Mitigated by the `^5.0.0` peer-dep range pin and standard npm-registry signature trust (the typosquat threat class is not unique to this package). | Documented as Informational. No code change. v1.1 ships as-is. The peer-dep range gives consumers control over which `officeparser` major they accept; an `npm overrides` block can lock to an exact version. |

**Dependency CVE check (officeparser 5.2.2 transitive tree):**

- `yauzl@3.3.0` — patched for CVE-2026-31988 (NTFS-extra-field off-by-one DoS). SAFE.
- `@xmldom/xmldom@0.8.13` — patched for CVE-2026-41672 / 41673 / 41675 / 34601. SAFE. **And** structurally: we only call `parseFromString` + read-only DOM traversal; never invoke `XMLSerializer`, so serialization-injection CVEs aren't reachable through our path even at older xmldom versions.
- `pdfjs-dist@5.7.284` (transitive via officeparser) — patched for CVE-2024-4367 (`isEvalSupported`). SAFE.

**ZIP-slip and XXE — structurally infeasible against officeparser 5.2.2:**

- **ZIP-slip:** read `officeparser/officeParser.js:617-647`. yauzl entries are piped through `concat-stream` into in-memory buffers, then `.toString()`'d. **No `fs.writeFile` of extracted contents.** No filesystem write → no zip-slip class to exploit. (Note: my v1.1 plan assumed officeparser used `jszip`; it actually uses `yauzl`. The audit was conducted against the actual tree.)
- **XXE:** `@xmldom/xmldom@0.8.13` parses `<!DOCTYPE>` but does NOT resolve `SYSTEM`/`PUBLIC` identifiers — no external fetch, no file read. Our wrapper does not invoke `XMLSerializer`. No external-entity expansion is reachable.
- **No consumer-facing option** in our API can relax these defenses. `parseOfficeAsync(buf)` is called with no config object — officeparser defaults apply, none of which affect parser security.

**Format-mismatch defense (new in 1.1) — every bypass class probed:**

| Probe | Input                                                                    | Traced outcome                                                                                                                                                                                                         | Test coverage                           |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1     | `%PDF...` bytes at `.docx` URL                                           | `actual='pdf', declared='office'` → mismatch → `console.warn(DOCX format mismatch (URL declares docx but bytes are PDF))` → `{ text: '', source: 'failed', format: 'docx' }`                                           | `multi-format.test.ts:272-290` verifies |
| 2     | `PK\x03\x04...` at `.pdf` URL                                            | `actual='office', declared='pdf'` → mismatch → `console.warn(PDF format mismatch...bytes are Office/ZIP)` → fail                                                                                                       | `multi-format.test.ts:292-306` verifies |
| 3     | Empty `Uint8Array(0)` at `.docx` URL                                     | `detectFormatFamily` returns `null` → falls through → yauzl rejects non-ZIP → `categorizeParseError(..., 'docx')` matches `/zip\|invalid\|.../` → tag `corrupt DOCX structure`                                         | Static trace                            |
| 4     | `<html>...` bytes at `.pdf` URL                                          | `actual=null` → passes mismatch check → `parsePdf` → unpdf rejects → tag `PDF parse error` (or `corrupt PDF structure` if message keywords match). Graceful.                                                           | Static trace                            |
| 5     | Adversarial markdown with `[X](https://a'.repeat(10000)` + 4-format URLs | Body cap (1 MB chars) fires first if oversized; bounded `[^\s)\]<>"']{1,2048}` + bounded alternation + no nested unbounded quantifiers ⇒ no catastrophic backtracking. **C1 bound holds for the widened alternation.** | Static trace                            |

Polyglot bypass impossible: first byte is either `0x25` (`%`, PDF) or `0x50` (`P`, ZIP), not both. Concatenated content: leading bytes win, consistent with the URL declaration.

**Inflate-bomb deferral — acceptable for v1.1 ship.** The audit confirmed this deferral's reasoning explicitly:

1. The threat class (DEFLATE-bomb → OOM) is already present in 1.0.5's PDF path via flate-compressed embedded streams — v1.1 does NOT introduce a novel severity class.
2. `maxBytes` (32 MB default) caps attacker-controlled compressed-byte volume.
3. `maxExtractedTextChars` (5 MB) bounds cache-write and indexed-text impact even if it doesn't bound peak memory.
4. Impact: availability (process OOM), not confidentiality or integrity.
5. Operators have mitigations: lower `maxBytes`, pass `--max-old-space-size=512` to Node.
6. The v1.2 structural fix (per-entry inflated-size cap) requires wrapping/forking officeparser — appropriate as its own release scope.

**Verdict.** The "Status as of v1.1.0" headline at the top of this README — "Zero unaddressed exploitable issues against the documented usage envelope" — is supported by this audit's evidence. **Risk posture vs. v1.0.5: the v1.1 release is at least as secure as v1.0.5 across the new surface, and adds two new defenses (format-mismatch detection, Office error categorization) that don't exist in any prior release.**

### Shipped in 1.0.2 (canonical reference)

| ID  | Severity  | What it was                                                                                     | What we did                                                                                                                              |
| --- | --------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Critical  | ReDoS in the URL scanner (O(N²) on `'[X](https://a'.repeat(N)`)                                 | Bounded quantifiers `{1,2048}` URL / `{0,1024}` query; bodies > 1 MB are skipped with a warning                                          |
| C3  | Critical  | `res.arrayBuffer()` buffered multi-GB streams before the `maxBytes` check (OOM)                 | `Content-Length` pre-check → streaming `getReader()` cap → abort the moment the cap is exceeded. Default 32 MB                           |
| C4  | Critical  | MCP `cacheDir` attacker-controlled — prompt-injected LLM could `mkdir` anywhere                 | All MCP tool `cacheDir` args jailed under `<os.tmpdir>/pdf-search-index-mcp/`; throws on out-of-jail paths                               |
| C5  | Critical  | Astro `endpoint: '../../etc/escape.json'` would write outside `publicDir`                       | Path-jailed at build time                                                                                                                |
| I1  | Important | Full URLs (`https://example.com/admin/secret.pdf`) leaked into CI failure logs                  | Logs scrub URLs to `protocol://host` only. Full URL gated behind `debug: true`                                                           |
| I3  | Important | Compression-bomb PDFs could decompress to hundreds of MB of text                                | New `maxExtractedTextChars` option (default 5 MB) caps per-PDF extraction                                                                |
| I4  | Important | PDF text containing literal `</script>` broke out of `<script type="application/json">` islands | New top-level `safeJSONForHTML(obj, indent?)` export used by CLI `--out` and Astro emit                                                  |
| I7  | Important | Parallel builds could corrupt cache (TOCTOU + non-atomic write)                                 | `.tmp.<pid>.<rand>` rename-atomic writes; sidecar `contentSha`; `readCache` verifies                                                     |
| I8  | Important | pdf.js `PasswordException` logged verbatim → encrypted-PDF state leak                           | Categorized tags (`'encrypted PDF'`, `'corrupt PDF structure'`, `'PDF font error'`, `'PDF parse error'`); full text behind `debug: true` |
| M2  | Minor     | Cache files world-readable                                                                      | Cache files `0o600` / cache dir `0o700` (POSIX; ignored on Windows)                                                                      |
| M3  | Minor     | Control characters could survive into log output                                                | Control-char sanitization in all warning paths                                                                                           |

**Deferred (with target versions):**

| ID                     | Severity  | What it is                                                         | Target         | Why deferred                                                                      |
| ---------------------- | --------- | ------------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| C2                     | Critical  | SSRF allowlist — `file://`, internal IPs, cloud metadata endpoints | v1.1           | Needs an `allowPrivateHosts: boolean` opt-in to avoid breaking existing consumers |
| I2                     | Important | Full SHA + URL normalization for cache keys                        | v2.0           | Breaking change to cache keys — bundled with the next major bump                  |
| I5                     | Important | CLI `--from-sitemap` size + scheme hardening                       | v1.1           | Opt-in flags needed; postpone for v1.1 design pass                                |
| I6                     | Important | `maxUrls` cap in `indexPdfs`                                       | v1.1           | New option, default needs a deliberate choice                                     |
| M1, M4, M5, M6, M7, M8 | Minor     | Defense-in-depth hardening                                         | future patches | Spread across the next few patch releases as they're independently shippable      |

**C2 mitigation in the meantime.** Until the allowlist lands in v1.1, configure outbound network policy in your CI environment so the build step can only reach the hosts you expect (your CMS, your CDN). Most CI runners (GitHub Actions, GitLab CI, Netlify, Vercel) support egress filtering at the worker level. This is belt-and-suspenders even after v1.1 ships.

**Migration map for consumers upgrading 1.0.1 → 1.0.2:** see the [Migration notes from 1.0.1](#migration-notes-from-101) subsection above.

**Test coverage of the audit fixes (cumulative).**

| Release | Tests | What landed                                                                                                                                                                                                |
| ------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.1   | 79    | Pre-audit baseline.                                                                                                                                                                                        |
| 1.0.2   | 105   | +26 regression tests pinning every Critical / Important / Minor fix listed above.                                                                                                                          |
| 1.0.3   | 114   | +9 regression tests for the multi-snippet picker (V2, V3, V4 — malformed indices, perf bound, multi-region HTML-escape correctness).                                                                       |
| 1.0.5   | 115   | +1 explicit M3 regression test (`'M3 explicit: strips ASCII control chars from error messages before logging'`) added per the v1.0.5 verification pass. Pins the previously-implicit control-char defense. |

Run `pnpm test` to execute all 115 tests. Each ✅ row in the top-level [Critical / Important / Minor remediation tables](#critical-findings--what-was-found-what-was-specifically-remediated-did-it-fix-it) maps to at least one named test in `packages/core/test/security.test.ts`, `packages/core/test/snippet.test.ts`, `packages/core/test/extractor-encrypted.test.ts`, or `packages/astro-pdf-search-index/test/integration.test.ts`.

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
