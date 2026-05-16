import Fuse, { type IFuseOptions } from 'fuse.js';
import { indexPdfs } from './index.js';
import type { IndexPdfsOptions, IndexedPdf, UrlOrEntry } from './types.js';

export interface CreateFuseOptions extends IndexPdfsOptions {
  urls: UrlOrEntry[];
  fuseOptions?: IFuseOptions<IndexedPdf>;
}

// Exported so the CLI's `search` subcommand and the MCP `search_pdfs`
// tool can use the same canonical Fuse config. Don't drift these across
// call sites.
//
// Threshold: 0.2 (stricter than Fuse's stock 0.6 default and stricter than
// our own 1.0.0–1.0.2 default of 0.3). Long PDF body text amplifies fuzzy
// noise — 0.3 turned out to return surface-level-similar matches that a
// user reading the result set would call "wrong". 0.2 keeps typo tolerance
// without that. Override per-call via `fuseOptions: { threshold: 0.3 }`.
export const DEFAULT_FUSE_OPTIONS: IFuseOptions<IndexedPdf> = {
  keys: ['title', 'text'],
  threshold: 0.2,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
};

export async function createFuseIndex(opts: CreateFuseOptions): Promise<Fuse<IndexedPdf>> {
  const { urls, fuseOptions, ...indexOpts } = opts;
  const rows = await indexPdfs(urls, indexOpts);
  return new Fuse(rows, { ...DEFAULT_FUSE_OPTIONS, ...fuseOptions });
}
