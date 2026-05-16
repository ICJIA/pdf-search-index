# @icjia/pdf-search-index

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
