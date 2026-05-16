# @icjia/astro-pdf-search-index

## 1.0.1

### Patch Changes

- Lockstep release; package source is unchanged from 1.0.0. The monorepo's top-level README gained a comprehensive "Where your PDFs can live" section that covers Astro consumers picking up this integration — see the [README](https://github.com/ICJIA/pdf-search-index#where-your-pdfs-can-live) for the full hosting matrix (static `public/`, external CMS including Strapi v3/v4/v5, external CDN, local `file://`).

## 1.0.0

### Major Changes

- First stable release.
  - Astro 5 integration: scans configured content collections at build time, extracts every linked PDF, emits `public/<endpoint>.json`.
  - `fetch` option on `PdfSearchIntegrationOptions` for custom fetch implementations (auth headers, `file://` URLs for tests/examples).
  - Re-exports `IndexedPdf` / `IndexPdfsOptions` types from `@icjia/pdf-search-index` so consumers only need this package for type annotations.
