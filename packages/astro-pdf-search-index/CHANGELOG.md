# @icjia/astro-pdf-search-index

## 1.0.0

### Major Changes

- First stable release.
  - Astro 5 integration: scans configured content collections at build time, extracts every linked PDF, emits `public/<endpoint>.json`.
  - `fetch` option on `PdfSearchIntegrationOptions` for custom fetch implementations (auth headers, `file://` URLs for tests/examples).
  - Re-exports `IndexedPdf` / `IndexPdfsOptions` types from `@icjia/pdf-search-index` so consumers only need this package for type annotations.
