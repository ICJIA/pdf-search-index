# @icjia/astro-pdf-search-index

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
