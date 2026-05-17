import Fuse, { type IFuseOptions } from 'fuse.js';
import { indexDocuments, indexPdfs } from './index.js';
import { safeJSONForHTML } from './json-safe.js';
import type { IndexDocumentsOptions, IndexedDocument, IndexedPdf, UrlOrEntry } from './types.js';

export interface CreateFuseOptions extends IndexDocumentsOptions {
  urls: UrlOrEntry[];
  fuseOptions?: IFuseOptions<IndexedDocument>;
}

// Exported so the CLI's `search` subcommand and the MCP `search_documents`
// tool can use the same canonical Fuse config. Don't drift these across
// call sites.
//
// Threshold: 0.2 (stricter than Fuse's stock 0.6 default and stricter than
// our own 1.0.0–1.0.2 default of 0.3). Long PDF body text amplifies fuzzy
// noise — 0.3 turned out to return surface-level-similar matches that a
// user reading the result set would call "wrong". 0.2 keeps typo tolerance
// without that. Override per-call via `fuseOptions: { threshold: 0.3 }`.
export const DEFAULT_FUSE_OPTIONS: IFuseOptions<IndexedDocument> = {
  keys: ['title', 'text'],
  threshold: 0.2,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
};

/**
 * Index a URL list and build a Fuse instance over the results. Mostly
 * useful from a Node prebuild script; in the browser, prefer constructing
 * Fuse directly from a fetched JSON index.
 *
 * Now multi-format (1.1+) — auto-detects PDF/DOCX/PPTX/XLSX from URL
 * extension. To preserve the 1.0.x PDF-only behavior, pass
 * `{ pdfOnly: true }` or use `createFusePdfIndex` (alias).
 */
export async function createFuseIndex(opts: CreateFuseOptions): Promise<Fuse<IndexedDocument>> {
  const { urls, fuseOptions, ...indexOpts } = opts;
  const rows = await indexDocuments(urls, indexOpts);
  return new Fuse(rows, { ...DEFAULT_FUSE_OPTIONS, ...fuseOptions });
}

/** Back-compat: 1.0.x callers expecting PDF-only dispatch. */
export async function createFusePdfIndex(opts: CreateFuseOptions): Promise<Fuse<IndexedPdf>> {
  const { urls, fuseOptions, ...indexOpts } = opts;
  const rows = await indexPdfs(urls, indexOpts);
  return new Fuse(rows, { ...DEFAULT_FUSE_OPTIONS, ...fuseOptions });
}

/**
 * Build a Fuse instance AND serialize its internal index for runtime
 * pre-parse. Returns both the index instance (for build-time queries if
 * needed) and the serialized index JSON (write this to disk alongside
 * your rows JSON; consumers load it via `Fuse.parseIndex` at runtime to
 * skip the in-browser build cost).
 *
 * Workflow:
 *
 *   // Build time (Node)
 *   const { rows, indexJson } = await prebuildFuseIndex(urls, fuseOptions);
 *   writeFileSync('public/searchIndex.documents.json', JSON.stringify(rows));
 *   writeFileSync('public/searchIndex.fuse-index.json', indexJson);
 *
 *   // Runtime (browser)
 *   const [rows, indexJson] = await Promise.all([
 *     fetch('/searchIndex.documents.json').then(r => r.json()),
 *     fetch('/searchIndex.fuse-index.json').then(r => r.json()),
 *   ]);
 *   const fuseIndex = Fuse.parseIndex(indexJson);
 *   const fuse = new Fuse(rows, fuseOptions, fuseIndex);
 *
 * Cuts in-browser first-paint Fuse build time from ~10s (at 2K rows) to
 * ~200ms parse. For corpora < 1K rows the difference is barely visible;
 * for corpora > 1K rows it's a meaningful UX improvement.
 *
 * Added in 1.2.
 */
export async function prebuildFuseIndex(
  urls: UrlOrEntry[],
  options?: IndexDocumentsOptions & { fuseOptions?: IFuseOptions<IndexedDocument> },
): Promise<{ rows: IndexedDocument[]; indexJson: string }> {
  const { fuseOptions, ...indexOpts } = options ?? {};
  const rows = await indexDocuments(urls, indexOpts);
  return {
    rows,
    indexJson: serializeFuseIndex(rows, fuseOptions),
  };
}

/**
 * Build the prebuilt Fuse index from already-extracted rows. Use this
 * when you've already produced `IndexedDocument[]` via `indexDocuments`
 * or an adapter and just want the serialized index.
 *
 * Added in 1.2.
 */
export function serializeFuseIndex(
  rows: IndexedDocument[],
  fuseOptions?: IFuseOptions<IndexedDocument>,
): string {
  const merged = { ...DEFAULT_FUSE_OPTIONS, ...fuseOptions };
  const index = Fuse.createIndex<IndexedDocument>(merged.keys ?? ['title', 'text'], rows);
  // F2 from v1.2 audit: route through safeJSONForHTML so the emitted
  // index file is symmetric with the rows JSON (which has been HTML-safe
  // since 1.0.2 / I4). The prebuilt index records contain the full
  // document text — same XSS-via-`</script>` exposure as the rows JSON
  // if a consumer ever inlines it into HTML. `Fuse.parseIndex(JSON.parse(text))`
  // still works because the `<` escapes are valid JSON.
  return safeJSONForHTML(index.toJSON());
}
