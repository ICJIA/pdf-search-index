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
export const DEFAULT_FUSE_OPTIONS: IFuseOptions<IndexedPdf> = {
  keys: ['title', 'text'],
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
};

export async function createFuseIndex(opts: CreateFuseOptions): Promise<Fuse<IndexedPdf>> {
  const { urls, fuseOptions, ...indexOpts } = opts;
  const rows = await indexPdfs(urls, indexOpts);
  return new Fuse(rows, { ...DEFAULT_FUSE_OPTIONS, ...fuseOptions });
}
