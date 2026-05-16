import { createHash } from 'node:crypto';
import { extractPdfText, extractPdfMetadata, extractPdfTextWithSource } from './extractor.js';
import { extractPdfUrlsFromMarkdown, titleFromUrl } from './url-scan.js';
import { createLimiter } from './concurrency.js';
import type { ExtractOptions, IndexPdfsOptions, IndexedPdf, UrlOrEntry } from './types.js';

export type { IndexedPdf, ExtractOptions, IndexPdfsOptions, UrlOrEntry } from './types.js';
export { extractPdfText, extractPdfMetadata } from './extractor.js';
export { extractPdfUrlsFromMarkdown } from './url-scan.js';

function shortHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
}

function defaultId(url: string): string {
  return `pdf-${shortHash(url)}`;
}

function normalizeEntry(entry: UrlOrEntry): { url: string; title?: string; id?: string } {
  if (typeof entry === 'string') return { url: entry };
  return entry;
}

async function buildRow(
  entry: { url: string; title?: string; id?: string },
  options: ExtractOptions,
): Promise<IndexedPdf> {
  const { url } = entry;

  const result = await extractPdfTextWithSource(url, options);

  // Title fallback: explicit > info-dict > humanized filename
  const title = entry.title ?? result.infoTitle ?? titleFromUrl(url);
  const id = entry.id ?? defaultId(url);

  // Build row with conditional spread for optional pages/extractedAt
  // (exactOptionalPropertyTypes — assignment after construction is also fine,
  // but spread keeps it in one expression.)
  const row: IndexedPdf = {
    id,
    url,
    title,
    text: result.text,
    ...(result.pages !== undefined ? { pages: result.pages } : {}),
    ...(result.source === 'fresh' ? { extractedAt: new Date().toISOString() } : {}),
  };
  return row;
}

export async function indexPdfs(
  urls: UrlOrEntry[],
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  const concurrency = options?.concurrency ?? 4;
  const limit = createLimiter(concurrency);

  // Dedupe by URL (preserve input order; first occurrence wins on title/id collision).
  const seen = new Set<string>();
  const entries = urls.map(normalizeEntry).filter((e) => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });

  return Promise.all(entries.map((e) => limit(() => buildRow(e, options ?? {}))));
}

export async function extractPdfsFromBody(
  body: string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  if (!body) return [];
  const discovered = extractPdfUrlsFromMarkdown(body);
  return indexPdfs(
    discovered.map((d) => (d.title ? { url: d.url, title: d.title } : { url: d.url })),
    options,
  );
}
