# @icjia/pdf-search-index

## 1.3.1

### Patch Changes

**Demo three-engine toggle is now live.** Docs-and-demo-only patch — package runtime source is byte-identical to 1.3.0. No API, security, or behavior change. What changed visible to consumers:

**Netlify demo: live three-engine toggle.** The flagship demo at [icjia-pdf-search.netlify.app](https://icjia-pdf-search.netlify.app/) now shows the **same corpus searched by Fuse.js, FlexSearch, and Pagefind side-by-side** via a segmented-control toggle at the top of the search card. Each engine has its own search path:

- **Fuse.js** (default) — unchanged from 1.3.0 (tuner, snippet helper, prebuilt-index inspector all preserved).
- **FlexSearch** — `createFlexSearchIndex` from `/flexsearch` (shipped in 1.3.0) builds the index on first selection; subsequent queries reuse the cached instance. Snippet via `snippetHTMLForFlexMatch`.
- **Pagefind** — wires to `/_pagefind/pagefind.js` (emitted by the demo's new postbuild step using `emitPagefindHTML` from `/pagefind`). Pre-highlighted excerpts come straight from Pagefind's `.data()`.

**Stats panel.** Inline under the search input: per-engine **index build time**, **last query time**, and the engine label. Lets visitors see the actual perf difference at the demo's 14-doc scale (Fuse < 1ms build; FlexSearch ~5-10ms; Pagefind ~50-100ms first-load chunk fetch — though the comparison is mostly illustrative at this corpus size).

**Demo build pipeline change.** New `postbuild` step (`scripts/emit-pagefind.mjs`) runs after `astro build`:

1. Reads the emitted `dist/searchIndex.pdfs.json`.
2. Calls `emitPagefindHTML(rows, { outDir: dist/pagefind-source, publicDirJail: dist })` to write one HTML page per indexed document.
3. Spawns `npx pagefind --site dist --output-subdir _pagefind` to produce the chunked search index at `dist/_pagefind/`.

Result: the deployed site serves the Pagefind client + chunked index alongside the existing Fuse rows JSON and prebuilt Fuse index.

**Tracked for v1.4 (the original v1.4 promise):**

- **Full officeparser source vendoring** — copy officeparser + yauzl + @xmldom/xmldom source into `packages/core/src/vendor/`. Drops the officeparser direct-dep entirely. Full npm-takedown protection.
- **V13-4 + V13-5 informational sweeps** — apply `scrubControl` to `/pagefind` HTML body + `/flexsearch`/`/worker` dynamic-import error messages for consistency with the M3 fix in `extractor.ts`.
- **Per-engine config + index inspector** — the existing "Inspect the search index" card currently shows Fuse-specific data only. v1.4 extends it to show the FlexSearch config + serialized index and the Pagefind metadata files when the corresponding engine is active.
- **7th adversarial audit** — scoped to the vendored officeparser code + the V13 sweeps.

Consumers running `^1.3.0` continue to work identically.

## 1.3.0

### Minor Changes

**Two new search-engine adapter entries: `/flexsearch` and `/pagefind`.** Closes the 2,500+ and 10,000+ document corpus-size paths from the v1.2 search-engine roadmap. Consumers crossing those thresholds can now swap engines with a one-line import change rather than rewriting the search-UI glue.

**1. `/flexsearch` entry** — `@icjia/pdf-search-index/flexsearch`

```ts
import {
  createFlexSearchIndex,
  snippetHTMLForFlexMatch,
  flattenFlexResults,
} from '@icjia/pdf-search-index/flexsearch';

const index = await createFlexSearchIndex(rows);
const results = await index.search('stigma', { enrich: true });
const flat = flattenFlexResults(results);
for (const row of flat) {
  const html = snippetHTMLForFlexMatch(row, 'stigma');
  // <mark>-wrapped HTML, same shape as snippetHTMLFor from /snippet
}
```

- New optional peer dependency: `flexsearch@^0.7.43`. Dynamic import keeps the cold-start cost down; PDF/Fuse consumers don't pay for FlexSearch's resolution.
- `DEFAULT_FLEX_OPTIONS` exported — sensible defaults for the `IndexedDocument` shape (search across title + text, store url/title/format/pages, case-insensitive ASCII encoding).
- `snippetHTMLForFlexMatch` does its own substring-based highlight since FlexSearch doesn't return character-range match positions. Falls back to a leading-text excerpt when the literal substring isn't found (e.g., when FlexSearch matched on a stemmed/tokenized form).
- `flattenFlexResults` flattens FlexSearch's per-field enriched-result shape (`{ id, doc }` per match) and dedupes by `id` across fields. Merges `id` back into the row so consumers get a complete `IndexedDocument`.
- **Sweet spot: 2,500 – 10,000 documents.** Faster queries than Fuse on this size range; denser encoded index format; built-in `WorkerIndex` for off-main-thread search. **Loses Fuse's typo tolerance.**

**2. `/pagefind` entry** — `@icjia/pdf-search-index/pagefind`

```ts
import { emitPagefindHTML } from '@icjia/pdf-search-index/pagefind';

await emitPagefindHTML(rows, {
  outDir: 'public/pagefind-source',
  publicDirJail: 'public', // C5-style path-jail
});
// Then run: pagefind --site public --output-subdir _pagefind
```

- New build-step helper. Pagefind crawls HTML, not JSON, so this is the bridge: writes one HTML page per `IndexedDocument` into a configured output directory. Each page wraps the document text in `<main data-pagefind-body>` so Pagefind only indexes the document content (not header/footer noise).
- Pages tagged with `data-pagefind-filter="format"` so consumers can build "PDF only" / "DOCX only" UI filters out of the box.
- HTML-escapes the row's `title`, `text`, and `url` to defend against `</script>`-style breakouts.
- `publicDirJail` option modeled on C5 (Astro adapter's `endpoint` path-jail from the 1.0.2 audit). Defends against `outDir: '../../escape'`. Plus a defensive second jail check on the resolved per-filename filepath.
- **Sweet spot: 10,000+ documents.** Only engine in this package's roadmap that scales gracefully past five-figure corpora without paying the full-index download cost on first load. **Requires running Pagefind's CLI at build time** as a follow-up step.

**3. officeparser promoted from `optionalPeerDependencies` to `dependencies`** — supply-chain hardening.

- Pinned to exact version `5.2.2` (the audited version).
- Auto-installs with `@icjia/pdf-search-index`; consumers no longer need to install officeparser separately or remember the optional-peer-dep dance.
- PDF-only consumers pay ~525 KB extra install size (officeparser + its transitive deps). Acceptable tradeoff for guaranteed availability + simpler consumer story.
- **Full source vendoring** (officeparser source physically inside our repo, eliminating npm fetch entirely) is tracked for **v1.4**. pnpm's `bundledDependencies` incompatibility means vendoring needs per-file source copies + their own audit pass — appropriate as its own focused release rather than rushed into v1.3.

**Engine roadmap status — what's shipping today:**

| Corpus size           | Recommended engine                      | This package's adapter                         |
| --------------------- | --------------------------------------- | ---------------------------------------------- |
| **< 1,000 documents** | Fuse.js                                 | `/fuse` + `/snippet` (since 1.0.0)             |
| **1,000 – 2,500**     | Fuse.js + `FuseWorker` + prebuilt index | `/worker` + `serializeFuseIndex` (since 1.2.0) |
| **2,500 – 10,000**    | FlexSearch                              | `/flexsearch` (this release)                   |
| **10,000+ documents** | Pagefind                                | `/pagefind` (this release)                     |

**6th adversarial red/blue team audit (2026-05-17).**

- All 11 prior 1.0.2 fixes verified still in place at v1.3 source.
- New surface audited: `/pagefind` HTML escape, `publicDirJail` path-jail, defensive per-filename jail; `/flexsearch` dynamic-import safety, snippet substring search robustness, prototype-pollution paths on row input.
- **3 Minor findings — all fixed before v1.3.0 publish:**
  - **V13-1** — `publicDirJail` symlink bypass. The string-prefix jail check could be defeated by a symlink inside the jail that resolves outside. Fixed with a post-`mkdir` `fs.realpath` re-check; closed in `packages/core/src/pagefind.ts`. Pinned by `test/pagefind.test.ts` → `"rejects symlink-based jail escape (V13-1 closure)"`.
  - **V13-2** — `baseUrl` was concatenated into emitted HTML without escape. A developer-supplied baseUrl containing `<script>` could inject markup. Fixed with `escapeHTMLText(baseUrl)` before concatenation. Pinned by `test/pagefind.test.ts` → `"escapes adversarial baseUrl (V13-2 closure)"`.
  - **V13-3** — `(row.format ?? 'pdf').toUpperCase()` was interpolated into `<meta>` and `<span>` without escape. A non-string `format` with a custom `toUpperCase` could inject markup. Fixed with runtime `typeof === 'string'` guard + `escapeHTMLText`. Pinned by `test/pagefind.test.ts` → `"escapes adversarial row.format that returns HTML (V13-3 closure)"`.
- **2 Informational findings — documented for symmetry sweeps:**
  - **V13-4** — control bytes survive `escapeHTMLText` (not XSS, but ANSI-escape smuggling possible if HTML is `cat`'d in a terminal).
  - **V13-5** — `/flexsearch` dynamic-import error wraps raw `e.message` without `scrubControl`. Same pattern exists in `worker.ts:137` since 1.2 (also unscrubbed).
- Full audit report and probe results in the [top-level README's v1.3.0 audit-history section](../../README.md#2026-05-17--v130-search-engine-entries-audit).

**15 new regression tests** across `test/flexsearch.test.ts` (6) and `test/pagefind.test.ts` (9, including the 3 V13-1/V13-2/V13-3 closure tests). Test count: 163 → 178 monorepo-wide.

**Tracked for v1.4 follow-up:**

- **Demo three-engine toggle** — live Fuse / FlexSearch / Pagefind side-by-side in the netlify-demo with stats panel + config inspector. Requires the netlify-demo's build pipeline to run Pagefind's CLI at deploy time; gets its own focused build pass.
- **Full source vendoring** — copy officeparser + yauzl + @xmldom/xmldom source into `packages/core/src/vendor/`. Full takedown protection without the pnpm `bundledDependencies` incompatibility. Drops the officeparser direct-dep entirely.
- **6th-audit findings response** — anything the 6th audit surfaces gets fixed in v1.3.x patch.

Consumers running `^1.2.x` continue to work identically. The minor version bump (1.2.1 → 1.3.0) reflects the new public API surface (two new adapter entries) without breaking the existing one.

## 1.2.1

### Patch Changes

Docs-and-demo-only patch. **Package runtime source is byte-identical to 1.2.0** — no API, security, or behavior change. Three things land on the npmjs.com-rendered README and the live demo at <https://icjia-pdf-search.netlify.app/>:

1. **Top-level README: full search-engine alternatives table.** New table with direct links + strengths + tradeoffs + recommended corpus-size for Fuse, MiniSearch, Orama, FlexSearch, Pagefind, Lunr, plus the three managed services (Typesense, MeiliSearch, Algolia). Sits above the existing three-way Fuse/FlexSearch/Pagefind deep comparison so consumers see the broader landscape first.

2. **Netlify demo: corpus browser + Fuse-index inspector.** The demo now (a) renders a corpus list with per-format chips (PDF / DOCX / PPTX / XLSX) when no query is active, sorted by format then title — visually demonstrates that the index covers mixed formats; (b) adds a second dropdown in the "Inspect the search index" card that shows the prebuilt Fuse index JSON (`/searchIndex.fuse-index.json`, new in 1.2) alongside the existing rows-JSON inspector — useful for verifying what the v1.2 prebuild path actually emits; (c) adds the same alternatives table from the README inside the "Why Fuse" card's "Not the only option" section, so demo visitors see the broader landscape without leaving the page.

3. **Accuracy pass on README + AGENTS.md.** Corrected the "10 ICJIA-public PDFs" stale claims to "14 ICJIA-public documents (10 PDFs + 3 DOCX + 1 XLSX as of v1.1)". Per-package READMEs updated to mention the new corpus-chips and prebuilt-index inspector features.

Consumers running `^1.2.0` continue to work identically.

## 1.2.0

### Minor Changes

**Performance: prebuilt Fuse index + first-party Worker entry. Security: two deferred-item closures (maxUrls + inflate-bomb).** Multi-format support from 1.1 is unchanged — same `IndexedDocument` shape, same `officeparser` peer dep, same audit posture. v1.2 adds three feature pairs:

**1. Prebuilt Fuse index emission** — new in `/fuse` entry. `serializeFuseIndex(rows, fuseOptions?)` returns a JSON string ready for `Fuse.parseIndex` at runtime; `prebuildFuseIndex(urls, options?)` returns `{ rows, indexJson }` in one call. The Astro adapter gains a `prebuildIndex` option that emits the index alongside the rows JSON; the CLI gains a `--prebuild-index <file>` flag. Cuts in-browser Fuse build from ~10s at 2K rows to ~200ms parse. Below ~1K rows the delta is barely visible.

**2. `/worker` entry** — re-export of `FuseWorker` from `fuse.js/worker` (7.4.0-beta.6+) with `IndexedDocument` typing. `FuseWorker` is upstream Fuse's multi-worker sharded runner (`Math.min(navigator.hardwareConcurrency, 8)` workers); we ship a thin `createFuseWorker(rows, options)` wrapper plus an ambient module declaration to fix the fuse.js/worker types gap. Use this for 1-5K-document corpora where keeping the main thread responsive matters. Caveats: function-valued Fuse options not supported (postMessage can't transfer them), `useTokenSearch` not supported (corpus stats diverge per shard).

**3. `maxUrls` cap (closes I6 from 1.0.2 audit)** — new `IndexPdfsOptions.maxUrls` / `IndexDocumentsOptions.maxUrls` option, default 5,000. Truncates with a `console.warn` when exceeded; applied AFTER URL dedup. Set to `Infinity` to disable. Sized to comfortably cover typical research/government CMS deployments (ICJIA's icjia.illinois.gov is in the 2K-2.5K range) while still bounding an attacker-controlled sitemap enqueue.

**4. Inflate-bomb defense (closes the deferral from the v1.1 audit)** — new `ExtractOptions.maxInflatedArchiveBytes` option, default 100 MB. New internal `inspectZipUncompressedSize` (`packages/core/src/zip-inspector.ts`) parses the ZIP central directory and sums declared uncompressed sizes; if the total exceeds the cap, `parseOfficeDoc` rejects with an `oversized {DOCX|PPTX|XLSX} archive` tag BEFORE invoking `officeparser`. Conservative posture — any malformed CD or ZIP64 sentinel falls through to the parser, which surfaces a normal corrupt-archive error. Defense closes the window between `maxBytes` (compressed input cap) and `maxExtractedTextChars` (post-extraction text cap) where officeparser materializes inflated XML in memory.

**Pages-field documentation correction.** v1.1's "Supported formats" docs claimed PPTX populates `pages` with the slide count and XLSX with the sheet count. **That was wrong** — `officeparser`'s text API returns a flat string with no structural metadata, so `parseOfficeDoc` leaves `pages` undefined for all Office formats. The docs in this release reflect that. (A future patch could re-read the ZIP after extraction to count slides/sheets if there's demand; not in scope for v1.2.)

**Search-engine roadmap documentation.** The README now leads the "Using a search engine other than Fuse.js" section with a roadmap table that calibrates engine choice by corpus size: Fuse.js (<1K), Fuse + `FuseWorker` (1-2.5K), FlexSearch (2.5-10K), Pagefind (10K+). First-party `/flexsearch` and `/pagefind` adapter entries are tracked for v1.3. The 14-document netlify-demo is updated to use the prebuilt-index pattern as a worked example of the production wiring for 2K-row deployments.

**5th adversarial red/blue team audit (2026-05-17).**

- All 11 prior 1.0.2 fixes verified still in place at v1.2 source.
- 0 new Critical / Important / Minor findings on the v1.2 surface.
- ZIP central-directory parser probed with: malformed CDs, ZIP64 sentinels, claim-vs-actual entry-count mismatches, comments with embedded EOCD signatures — all handled by the conservative pass-through.
- `maxUrls` cap probed with negative / `NaN` values, large dedup-then-cap scenarios — no bypass.
- `/worker` entry: dynamic-import safety, postMessage validation, type-leak surface — all clean.
- Astro adapter `prebuildIndex` path-jail (C5-style) verified.

**New test coverage:** 29 new regression tests across `test/max-urls.test.ts` (10, including 4 covering F1 normalization), `test/inflate-bomb.test.ts` (9), `test/prebuild-index.test.ts` (6 prebuild + 2 worker smoke), plus 2 F1 normalize tests added during the audit-response cycle. **Test count: 138 → 163 monorepo-wide.**

**New public API surface (1.2):**

- `serializeFuseIndex(rows, fuseOptions?)` — `/fuse` entry; returns prebuilt-index JSON.
- `prebuildFuseIndex(urls, options?)` — `/fuse` entry; one-call rows + prebuilt index.
- `createFuseWorker(rows, options?, workerOptions?)` — `/worker` entry; async-construct a `FuseWorker`.
- `FuseWorker` interface — `/worker` entry; type-narrowed Fuse worker.
- `FuseWorkerOptions` interface — `/worker` entry.
- `IndexPdfsOptions.maxUrls` — default 5,000.
- `ExtractOptions.maxInflatedArchiveBytes` — default 100 MB.
- New bin alias: `document-search-index-mcp` (existing `pdf-search-index-mcp` continues to work).

**Deferred items remaining (with target versions):**

- **C2** SSRF allowlist → v1.1 (still tracked — needs opt-in flag design).
- **I2** Cache-key URL normalization → v2.0 (breaking).
- **I5** CLI sitemap hardening → v1.3.
- **M1, M4–M8** Defense-in-depth hardening → future patches.

Consumers running `^1.1.x` continue to work identically. The minor version bump (1.1.0 → 1.2.0) reflects the new public API surface (prebuild + worker + caps) without breaking the existing one.

## 1.1.0

### Minor Changes

**Multi-format support: PDF + DOCX + PPTX + XLSX.** The headline 1.1 feature. The same pipeline that's been indexing PDFs since 1.0 now also indexes Microsoft Office Open XML documents via a single optional peer dependency (`officeparser@^5.0.0`). PDF-only consumers continue to work byte-identically — the `unpdf` parser stays bundled; the Office parser is opt-in.

**Headline numbers:**

- 1 new optional peer dep (`officeparser`) unlocks 3 new formats (DOCX, PPTX, XLSX).
- 6 new public exports: `indexDocuments`, `extractDocumentText`, `extractDocumentTextWithSource`, `extractDocumentMetadata`, `extractDocumentsFromBody`, `extractDocumentUrlsFromMarkdown`.
- 1 new public type: `IndexedDocument` (extends the old `IndexedPdf` shape with an optional `format: DocumentFormat` discriminator).
- 4 new format-detection helpers: `detectFormatFromUrl`, `detectFormatFamilyFromBytes` (magic-byte sniff), `categorizeParseError(msg, format)` (Office-aware error tags), `DocumentFormat` type union.
- 3 new MCP tools: `extract_document`, `index_documents`, `search_documents` (PDF-only `extract_pdf` / `index_pdfs` / `search_pdfs` preserved as back-compat aliases).
- 1 new optional CLI bin alias: `document-search-index` (the existing `pdf-search-index` bin stays — both point at the same script).
- 23 new regression tests in `test/multi-format.test.ts` covering URL-extension detection, magic-byte family detection, multi-format extraction against real ICJIA fixtures, format-mismatch defense, and Office-aware error categorization. **Test count: 115 → 138 monorepo-wide.**

**API additions (all back-compat — no existing API removed or changed):**

```ts
// New format-agnostic API (preferred for 1.1+ code):
import { indexDocuments, type IndexedDocument } from '@icjia/pdf-search-index';
const rows = await indexDocuments([
  'https://site.com/report.pdf',
  'https://site.com/policy.docx',
  'https://site.com/deck.pptx',
  'https://site.com/budget.xlsx',
]);
// Each row has `format: 'pdf' | 'docx' | 'pptx' | 'xlsx'`

// PDF-only API (1.0.x — still works identically):
import { indexPdfs, type IndexedPdf } from '@icjia/pdf-search-index';
const pdfRows = await indexPdfs(['https://site.com/report.pdf']);
// IndexedPdf is now a type alias for IndexedDocument; the shape is identical
```

**Architecture seam:**

- `parsePdf` (1.0.x) was wrapped in a new `parseDocument(bytes, format, opts, scrubbedUrl)` dispatcher. The dispatcher does format-mismatch detection (magic-byte sniff vs. URL extension) before invoking the right extractor. PDF parsing is byte-identical to 1.0.5.
- `fetchPdfBytes` (1.0.x) renamed to `fetchDocumentBytes` internally — no public-API change.
- URL-scan regex widened from `\.pdf` to `\.(pdf|docx|pptx|xlsx)` with the same bounded quantifier shape that defuses ReDoS (C1 from 1.0.2).
- Cache, security defenses, Fuse helpers, snippet rendering, CLI, MCP — all already format-agnostic and inherited the multi-format support transparently.

**Two new v1.1 security defenses:**

1. **Format-mismatch detection.** `parseDocument` calls `detectFormatFamilyFromBytes` on the fetched bytes and aborts with a categorized warning if the magic bytes don't match the URL extension (PDF magic `%PDF` vs. ZIP magic `PK\x03\x04`). Defends against the attack where a malicious CMS serves DOCX bytes at a `.pdf` URL (or inverse) to confuse the parser.
2. **Office-aware error categorization.** `categorizeParseError(msg, format)` gained the `format` parameter (defaults to `'pdf'` for back-compat). New tags surface in CI logs without leaking parser internals: `'encrypted DOCX document'`, `'corrupt PPTX structure'`, `'XLSX format mismatch'`, `'DOCX parse error'`.

**Per-format extraction notes:**

| Format | Parser            | `pages` field meaning | Native page concept? |
| ------ | ----------------- | --------------------- | -------------------- |
| `pdf`  | `unpdf` (bundled) | page count            | yes                  |
| `docx` | `officeparser`    | undefined             | no                   |
| `pptx` | `officeparser`    | slide count           | yes (slides)         |
| `xlsx` | `officeparser`    | sheet count           | yes (sheets)         |

**Out of scope for 1.1 (tracked for later):**

- **Pre-2007 Office binary formats** (`.doc`, `.ppt`, `.xls`) — different on-disk format, not supported.
- **OpenDocument formats** (`.odt`, `.odp`, `.ods`) — `officeparser` supports them internally but the URL scanner is scoped to the four Microsoft Office Open XML formats. Plausible v1.2 if there's demand.
- **Per-row / per-sheet XLSX search semantics** — current behavior treats each spreadsheet as one searchable document. Per-row would change the `IndexedDocument` shape (multiple rows per file), tracked for a future major.
- **`maxInflatedArchiveBytes` cap (inflate-bomb defense).** The existing `maxBytes` (32 MB input) + `maxExtractedTextChars` (5 MB output) caps bound the realistic exposure window. A proper ZIP-central-directory size check is tracked for v1.2.
- **In-document highlighting for Office formats.** The bundled Mozilla pdf.js viewer in the netlify-demo provides this for PDFs. No equivalent for Office documents — clicking a non-PDF result opens the file in the OS-level handler.

**Adapter packages updated to 1.1.0 in lockstep:**

- `@icjia/astro-pdf-search-index@1.1.0` — content-collection scanner picks up all four formats; emitted JSON includes `format` on every row.
- `@icjia/nuxt-pdf-search-index@1.1.0` — two new Nitro helpers (`extractDocumentsFromCmsBody`, `extractDocumentsFromContentDoc`); existing PDF-only helpers preserved.

**Netlify demo updated** to index 3 DOCX + 1 XLSX fixtures alongside the 10 PDFs (14 documents total). Each result row displays a per-format badge (color-coded: PDF red, DOCX blue, PPTX orange, XLSX green) and routes non-PDF results to the browser's native handler instead of the bundled pdf.js viewer.

Consumers running `^1.0.x` continue to work identically. The minor version bump (1.0.5 → 1.1.0) reflects the new public API surface (multi-format) without breaking the existing one.

## 1.0.5

### Patch Changes

Docs-and-hardening release. **Runtime behavior is byte-identical to 1.0.4** — no consumer-side behavior change. Consumers running `^1.0.3` (or `^1.0.4`) continue to work identically. This bump packages four things:

**1. Elevator-pitch reframe.** The top-of-README pitch (and per-package READMEs, plus `AGENTS.md`) now leads with **"Apache Solr for client-side apps — without Solr."** — framework-agnostic positioning (first-party Astro 5 + Nuxt 4 integrations; core slots cleanly into Next.js / SvelteKit / Remix / Eleventy / Vite-Vue / vanilla HTML via a `prebuild` script), Fuse-recommended-but-optional framing (alternatives named with links: MiniSearch, Orama, FlexSearch, Lunr, Pagefind, Typesense, MeiliSearch, Algolia), and a closing paragraph quantifying the overhead this package collapses (Solr's build-time Tika stage → a `pnpm build` hook).

**2. Security section restructure.** The previous counts-only summary read as if items remained outstanding. The new structure:

- Leads with **"Zero unaddressed exploitable issues against the documented usage envelope"** and the verification basis (regression tests + three independent audit passes).
- Per-finding tables (Critical / Important / Minor) with explicit columns for **What was found / What was specifically remediated / Verified by / Status** — including named-test references for every ✅ row.
- Deferred items integrated into the per-severity tables with their active mitigations spelled out (e.g., C2 SSRF → CI egress filter mitigation), instead of a separate "outstanding" list.
- "Verified" defined explicitly: (a) a regression test exercises the fix against the original attack input, AND (b) the fix is re-confirmed in source at v1.0.5 HEAD by the verification-pass audit.

Top-level `README.md`, all three package READMEs (`core`, `astro-pdf-search-index`, `nuxt-pdf-search-index`), and `AGENTS.md` updated with the new structure.

**3. Third independent adversarial red/blue audit pass (2026-05-16).** An opus-class LLM agent verified that **all 11 prior 1.0.2 fixes** (C1, C3, C4, C5, I1, I3, I4, I7, I8, M2, M3) are still in place at v1.0.5 source and exercised by their named regression tests. Adversarial probes ran at **5× the existing regression-test payload volumes** against the built `dist/` (e.g., C1 ReDoS probe → 50,000-iter `'[X](https://a'.repeat(N)` → completed in 1.41 ms). Single new finding (Informational): **V8 — `snippetHTMLFor`'s `separator` parameter is concatenated raw**, by design (so consumers can pass `'<br>'`/`'<hr>'`). Remediated by an explicit JSDoc security note on `SnippetOptions.separator` in `packages/core/src/snippet.ts` warning consumers to treat the parameter as developer-controlled input only. No code-behavior change — the function continues to concatenate `separator` raw. Audit transcript and findings table in the [top-level README's audit-history section](../../README.md#2026-05-16--v105-verification-pass).

**4. New M3 regression test.** The 1.0.2 control-character sanitization fix (`scrubControl` in `extractor.ts`) was previously exercised implicitly via the URL-scrubbing tests. Pinned with an explicit named test in `packages/core/test/security.test.ts`: `'M3 explicit: strips ASCII control chars from error messages before logging'` (injects `\x00\x01\x07\x08\r` into a fetch error message and verifies each one becomes `?` in the log output). **Test count: 114 → 115 across the monorepo.**

Net change in the published tarball: README content + the `SnippetOptions.separator` JSDoc note (which surfaces in `dist/snippet.d.ts`). Everything else (CHANGELOG, test additions) does not ship to consumers.

## 1.0.4

### Patch Changes

Docs-and-tests-only release — package runtime source is byte-identical to 1.0.3. This bump syncs the npmjs.com-rendered README + CHANGELOG with the post-1.0.3 doc polish, the second audit pass, and the new regression tests. Consumers running `^1.0.3` continue to work identically.

The full batch of changes that landed since the 1.0.3 publish:

- **Second adversarial red/blue team audit pass** (2026-05-16) scoped to the v1.0.3 deltas: the new `snippetHTMLFor` `maxSnippets`/`separator` options (multi-snippet greedy non-overlapping picker), the netlify-demo's `tokenizeAndSearch` wrapper, the demo's `distributeMatches` spatial-bucket picker, the bundled Mozilla pdf.js viewer in the netlify-demo (`public/pdfjs-viewer/`), the post-extraction `viewer.css` patch in `scripts/copy-pdfjs-viewer.mjs`, and the `fuse.js@7.4.0-beta.6` prerelease pin semantics. **No new Critical or Important findings against the v1.0.2 baseline.** 1 Minor finding (idempotency-marker substring mismatch in `copy-pdfjs-viewer.mjs`) shipped as a fix in the netlify-demo; 5 Informational findings documented in the top-level README's [Security considerations & audit history](../../README.md#security-considerations--audit-history). Full audit details there.
- **3 new regression tests** in `test/snippet.test.ts` pin the audit findings against `snippetHTMLFor`: HTML-escape correctness under multi-snippet output (V4), bounded output under 50,000 adversarial indices (V3), no-throw contract under malformed Fuse indices (V2 — reversed `[end, start]`, negative, `NaN`, `Infinity`, out-of-bounds). Test count: 100 → 103 in the core package; 111 → 114 across the monorepo.

## 1.0.3

### Patch Changes

Documentation + ecosystem release, plus one additive snippet feature.

- **`snippetHTMLFor` — `maxSnippets` option.** New option (default `1`) renders up to N highlighted spans per result, joined by a configurable `separator` (default `' … '`). The picker greedily takes the N longest non-overlapping spans (overlap = context windows intersect), then re-sorts by document position. Default behavior is byte-identical to 1.0.2 for callers who don't set `maxSnippets`; the netlify-demo passes `{ maxSnippets: 3 }` to surface multiple passages per PDF result. Additive — no migration needed.
- **Default Fuse threshold lowered to 0.2.** `DEFAULT_FUSE_OPTIONS.threshold` was `0.3` in 1.0.0–1.0.2; the new 0.2 default better suppresses surface-level-similar matches in long PDF bodies that users would otherwise call "wrong". Override per call via `fuseOptions: { threshold: 0.3 }` if you want the looser behavior.
- **Live demo wired into the docs.** The flagship Netlify deployment is live at <https://icjia-pdf-search.netlify.app/> — a dark-mode Astro 5 + Vue 3 site indexing seven ICJIA-public PDFs with snippet highlighting and a live Fuse.js options tuner (including the new Fuse 7.4 beta surface). The top-level README, AGENTS.md, and per-package READMEs all link to it prominently.
- **fuse.js pin moved to `7.4.0-beta.6`** across every workspace member (core devDep, every example). Core's `peerDependencies.fuse.js` is now `"^7.0.0 || >=7.4.0-beta.0"` so stable 7.x consumers and the 7.4 beta channel both resolve.
- **Prominent Security section.** The v1.0.2 red/blue team audit findings (5 Critical / 8 Important / 8 Minor) and what shipped vs deferred are now surfaced near the top of every README, not buried in a "considerations" footer. Migration notes for the new defaults (`maxBytes: 32 MB`, `maxExtractedTextChars: 5 MB`, scrubbed logs, jailed MCP cacheDir) are explicit.
- **Per-package READMEs expanded** into standalone integration guides (core 170 → 200+ lines, astro 220 → 250+ lines, nuxt 420 → 450+ lines). Strapi v3 / v4 / v5 recipes; authentication; troubleshooting; common pitfalls.
- **MCP launch always uses `@latest`** in the documented snippets so MCP-aware clients pick up security patches without manual version bumps.
- **`AGENTS.md`** at the repo root: an integration cheatsheet for AI coding agents (Cursor / Cline / Aider / Codex) pointed at this repo and asked to integrate the package into a new site.

## 1.0.2

### Patch Changes

Security release. Implements the audit's 1.0.x patch scope: 4 Critical + 5 Important + 2 Minor findings against 1.0.1.

**Critical fixes:**

- **C1 / ReDoS in URL scanner.** `extractPdfUrlsFromMarkdown` regex patterns were vulnerable to catastrophic-backtracking on adversarial markdown bodies — `'[X](https://a'.repeat(N)` would burn O(N²) CPU. The patterns now use bounded greedy quantifiers (`{1,2048}` URL / `{0,1024}` query) and the scan is skipped entirely for markdown bodies above 1 MB.
- **C3 / Body size limit applied after full buffer.** `fetchPdfBytes` materialized the entire response body before checking `maxBytes`. Now: declared `Content-Length` is checked first; if absent, the body is streamed via `getReader()` and the download is aborted once the running total exceeds `maxBytes`. Default `maxBytes` lowered from 100 MB to 32 MB; consumers that legitimately host larger PDFs can opt up.
- **C4 / MCP `cacheDir` attacker-controlled.** Every MCP tool that accepted `cacheDir` from the LLM client now routes it through `safeCacheDir()` which jails the path under `<os.tmpdir>/pdf-search-index-mcp/`. Out-of-jail paths throw before any fs operation. `clearCache` also gained a strict-allowlist filter — it only deletes files matching the exact `<16hex>.txt` / `<16hex>.meta.json` pattern.

**Important fixes:**

- **I1 / Internal URLs leaking into CI logs.** All `console.warn` calls that include a URL now route through a new `scrubUrl` helper that drops path, query, and fragment — only `protocol://host` is logged. Full URLs and full error messages are gated behind a new `debug: true` `ExtractOptions` flag.
- **I3 / Extracted text length cap.** New `maxExtractedTextChars` `ExtractOptions` field (default 5 MB). Defends against compression-bomb-style PDFs whose flate-compressed streams decompress to hundreds of megabytes of text.
- **I4 / JSON not safe for `<script>` embedding.** New top-level export: `safeJSONForHTML(obj, indent?)`. Escapes `<`, `-->`, and U+2028 / U+2029. Used internally by the CLI's `--out` writer and the Astro adapter's emit so PDF text containing `</script>` can't break out of inlined `<script type="application/json">...</script>` blocks.
- **I7 / Cache write TOCTOU + non-atomic write.** `writeCache` now writes both files to per-PID-and-random temp names, then renames into place atomically. The sidecar gained a `contentSha` field — `readCache` verifies the SHA-256 of the on-disk text matches the sidecar's hash, treating mismatches as a miss (defends against parallel-build interleavings and external corruption).
- **I8 / Encrypted PDF state leaks via error message.** pdf.js parse errors are now categorized (`'encrypted PDF'` / `'corrupt PDF structure'` / `'PDF font error'` / `'PDF parse error'`) before logging. Full message is suppressed unless `debug: true` is passed.

**Minor fixes:**

- **M2 / Cache file permissions.** `writeCache` writes files with mode `0o600` and creates the cache directory with mode `0o700`. POSIX-only; no-op on Windows.
- **M3 / Control char sanitization in logs.** URLs and error messages have ASCII control characters (`\x00-\x1f`, `\x7f`) replaced with `?` before being passed to `console.warn` — prevents terminal-escape smuggling via crafted CMS content.

**New public exports:**

- `safeJSONForHTML(obj, indent?)` — HTML-safe JSON serializer.
- `scrubUrl(url)` — origin-only URL redaction helper.

**New `ExtractOptions` fields:**

- `maxExtractedTextChars?: number` (default 5,000,000)
- `debug?: boolean` (default `false`)

**Changed defaults:**

- `maxBytes`: 100 MB → 32 MB.
- Parse-error logs: full message → categorized tag.
- Fetch-failure logs: full URL → origin only.

Consumers whose PDFs are larger than 32 MB, or whose corpora contain >5 MB of plain text per document, should opt up via the new options. See the top-level README's "Security considerations" section for the full migration notes.

## 1.0.1

### Patch Changes

- Documentation: the monorepo's top-level `README.md` gained a comprehensive "Where your PDFs can live" section covering four hosting patterns — alongside the site (`public/`), external CMS (Strapi 3/4/5, Sanity, Contentful, Drupal), external CDN (S3, Cloudflare R2), and local-only (`file://`). Strapi consumers get concrete v3/v4/v5 code samples plus the three common quirks (relative URLs, token-gated media, structured media relations).
- Repo tooling: added `publish.sh` for direct-to-main coordinated releases across all three packages.

## 1.0.0

### Major Changes

- First stable release. The 0.1.0 surface is preserved; this bump marks API stability.

### Minor Changes

- `extractPdfsFromBody` and `extractPdfUrlsFromMarkdown` now also match `file://` PDF URLs in markdown link bodies (previously only `https?://` URLs were scanned). Useful for tests, examples, and air-gapped builds that work against local PDF files.
- New `pdf-search-index-mcp` CLI bin alongside `pdf-search-index`. Run the MCP server with `npx -p @icjia/pdf-search-index pdf-search-index-mcp` instead of trying to invoke the `/mcp` export subpath directly (which never worked).

### Patch Changes

- README: corrected the documented return shape of the `get_pdf_index` MCP tool — it returns cache-metadata entries, not full `IndexedPdf[]` rows. `search_pdfs` is the tool that returns text-bearing rows.

## 0.1.0

### Minor Changes

- Initial 0.1.0 release.
  - `extractPdfText(url, options?)` — single-URL extraction with file cache
  - `indexPdfs(urls, options?)` — batch indexer with `p-limit(4)` concurrency
  - `extractPdfsFromBody(markdown, options?)` — scan markdown for linked PDFs and index them
  - `createFuseIndex` (`/fuse` entry) — build a Fuse instance over a list of PDFs
  - `snippetHTMLFor` (`/snippet` entry) — render a `<mark>`-highlighted snippet around a Fuse match
  - `pdf-search-index` CLI — index URLs, scan sitemaps, verify, search, manage cache
  - `/mcp` entry — MCP server exposing `extract_pdf`, `index_pdfs`, `get_pdf_index`, `search_pdfs`, `clear_cache`, `get_status`
