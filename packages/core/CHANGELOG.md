# @icjia/pdf-search-index

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
