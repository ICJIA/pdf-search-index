# @icjia/astro-pdf-search-index

## 1.3.0

### Minor Changes

Lockstep release. No adapter-source changes — Astro consumers gain access to `/flexsearch` and `/pagefind` entries via the upstream `@icjia/pdf-search-index@1.3.0`. Typical usage:

```ts
// astro.config.ts — unchanged
pdfSearch({ collections: ['docs'], endpoint: 'searchIndex.pdfs.json' });

// Astro page script (server or client) — pick the engine
import { createFlexSearchIndex } from '@icjia/pdf-search-index/flexsearch';
// or
import { emitPagefindHTML } from '@icjia/pdf-search-index/pagefind';
```

The adapter continues to emit `IndexedDocument[]` JSON to `public/<endpoint>` and (when `prebuildIndex` is set) the prebuilt Fuse index. Consumers can layer FlexSearch or Pagefind on top by calling the new entries with the emitted rows as input.

See the [core CHANGELOG entry for 1.3.0](../core/CHANGELOG.md#130) for the full summary.

## 1.2.1

### Patch Changes

Lockstep docs-and-demo-only patch. Package source is byte-identical to 1.2.0. README updated to mention the netlify-demo's new corpus browser (with per-format chips) and prebuilt-Fuse-index inspector dropdown. See the [core CHANGELOG entry for 1.2.1](../core/CHANGELOG.md#121) for the full summary.

## 1.2.0

### Minor Changes

**New `prebuildIndex` option** — emits a prebuilt Fuse index to `public/<prebuildIndex>` alongside the main rows JSON. Consumers fetch both files and pass the index to `Fuse.parseIndex` at runtime, skipping the in-browser build step.

```ts
pdfSearch({
  collections: ['docs'],
  endpoint: 'searchIndex.documents.json',
  prebuildIndex: 'searchIndex.fuse-index.json',
});
```

At ~2K rows this cuts first-paint Fuse setup from ~5–10 s to ~200 ms parse. Below ~1K rows the delta is barely visible — leave it unset for small corpora. The same path-jail guard that protects `endpoint` (C5 from the 1.0.2 audit) also applies to `prebuildIndex` — `'../../etc/escape.json'` throws at build time. **Verified by the v1.2 audit (2026-05-17).**

The flagship `examples/netlify-demo/` updates to use this pattern as a worked example for ~2K-row deployments.

See the [core CHANGELOG entry for 1.2.0](../core/CHANGELOG.md#120) for the full v1.2 surface summary.

## 1.1.0

### Minor Changes

**Multi-format content-collection scanning.** The Astro integration's content-collection walker now picks up DOCX, PPTX, and XLSX links alongside PDFs. Each emitted row carries a `format` discriminator (`'pdf'` / `'docx'` / `'pptx'` / `'xlsx'`) so consumer UIs can render per-format badges or route to different viewers.

- Internal: switched from `extractPdfsFromBody` to `extractDocumentsFromBody` (the multi-format function added in `@icjia/pdf-search-index@1.1.0`).
- New type re-exports: `IndexedDocument`, `IndexDocumentsOptions`, `DocumentFormat`. The existing `IndexedPdf` / `IndexPdfsOptions` exports are preserved as type aliases.
- Path-jail (C5) and HTML-safe emit (I4) defenses from 1.0.2 continue to apply automatically to all four formats.
- The default `endpoint` filename stays `searchIndex.pdfs.json` for back-compat with existing consumers; the contents now include all detected document formats, not just PDFs.

**Install the optional `officeparser` peer dep** (alongside `@icjia/pdf-search-index@^1.1.0`) to unlock DOCX/PPTX/XLSX. PDF-only sites don't need it.

See the [core CHANGELOG entry for 1.1.0](../core/CHANGELOG.md#110) for the full surface summary.

## 1.0.5

### Patch Changes

Lockstep docs-and-hardening release. Package source is byte-identical to 1.0.4 (and 1.0.3). This bump syncs the npmjs.com-rendered README with three updates:

1. **New "Apache Solr for Astro — without Solr." elevator pitch** + explicit Fuse-is-optional framing (alternatives: MiniSearch, FlexSearch, Lunr, Pagefind, custom).
2. **Restructured Security section** — per-finding tables with explicit Found / Remediated / Verified-by / Status columns; "Zero unaddressed exploitable issues" status statement; deferred items integrated with active mitigations.
3. **Third audit pass landed at the monorepo level** — verified the adapter-specific C5 (`endpoint` path-jail) and I4 (HTML-safe emit via `safeJSONForHTML`) fixes are still in place. No new findings against the Astro surface.

See the [core CHANGELOG entry for 1.0.5](../core/CHANGELOG.md#105) for the full summary including the audit transcript reference.

## 1.0.4

### Patch Changes

Lockstep docs-only release — package source is byte-identical to 1.0.3. Bump exists so the npmjs.com-rendered README matches the post-1.0.3 doc polish on GitHub. See the [core CHANGELOG entry for 1.0.4](../core/CHANGELOG.md#104) for the full summary.

## 1.0.3

### Patch Changes

Lockstep documentation release. No package source changes from 1.0.2; this bump exists so the expanded standalone integration guide ships to consumers reading the README on npmjs.com.

- Standalone integration guide: registration, options, three full integration patterns, authentication, troubleshooting, security notes.
- Cross-references to the live demo at <https://icjia-pdf-search.netlify.app/> (source: `examples/netlify-demo/`) — a polished, dark-mode reference deployment of this integration.
- The v1.0.2 security audit findings are now prominent in every README. See the [core CHANGELOG entry for 1.0.2](../core/CHANGELOG.md#102) for the full list.

## 1.0.2

### Patch Changes

Security release. Two adapter-level fixes plus the indirect benefits of the core library's `^1.0.2` upgrade.

- **C5 / `endpoint` path traversal.** `pdfSearchIntegration({ endpoint: '../../etc/escape.json' })` would otherwise resolve outside `publicDir` and the build would write the index there. The integration now validates that the resolved output path stays inside the resolved `publicDir` and throws a clear error at build time otherwise.
- **I4 / HTML-safe emit.** The integration now uses `safeJSONForHTML` from `@icjia/pdf-search-index` rather than `JSON.stringify` when writing `public/<endpoint>`. PDF text containing the literal `</script>` (extracted from a real PDF) can no longer break out of a surrounding `<script type="application/json">...</script>` embedding on the consumer page.

The integration's full surface is also covered by the upstream `@icjia/pdf-search-index@^1.0.2` changes (bounded URL regex, streaming `maxBytes`, scrubbed failure logs, jailed MCP cache dir). See the [core CHANGELOG](../core/CHANGELOG.md#102) for the full list.

## 1.0.1

### Patch Changes

- Lockstep release; package source is unchanged from 1.0.0. The monorepo's top-level README gained a comprehensive "Where your PDFs can live" section that covers Astro consumers picking up this integration — see the [README](https://github.com/ICJIA/pdf-search-index#where-your-pdfs-can-live) for the full hosting matrix (static `public/`, external CMS including Strapi v3/v4/v5, external CDN, local `file://`).

## 1.0.0

### Major Changes

- First stable release.
  - Astro 5 integration: scans configured content collections at build time, extracts every linked PDF, emits `public/<endpoint>.json`.
  - `fetch` option on `PdfSearchIntegrationOptions` for custom fetch implementations (auth headers, `file://` URLs for tests/examples).
  - Re-exports `IndexedPdf` / `IndexPdfsOptions` types from `@icjia/pdf-search-index` so consumers only need this package for type annotations.
