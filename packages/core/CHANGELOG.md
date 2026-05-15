# @icjia/pdf-search-index

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
