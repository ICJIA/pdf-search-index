import { createHash } from 'node:crypto';
import {
  extractDocumentTextWithSource,
  extractPdfTextWithSource,
  detectFormatFromUrl,
} from './extractor.js';
import { extractDocumentUrlsFromMarkdown, titleFromUrl } from './url-scan.js';
import { createLimiter } from './concurrency.js';
import type {
  DocumentFormat,
  ExtractOptions,
  IndexDocumentsOptions,
  IndexPdfsOptions,
  IndexedDocument,
  IndexedPdf,
  UrlOrEntry,
} from './types.js';

// Type re-exports — both the new format-agnostic names and the
// back-compat PDF-named aliases.
export type {
  DocumentFormat,
  DiscoveredDocument,
  DiscoveredPdf,
  ExtractOptions,
  IndexDocumentsOptions,
  IndexPdfsOptions,
  IndexedDocument,
  IndexedPdf,
  UrlOrEntry,
} from './types.js';

// Value re-exports — extractor surface.
export {
  // PDF-only (back-compat).
  extractPdfText,
  extractPdfMetadata,
  // Format-agnostic (added in 1.1).
  extractDocumentText,
  extractDocumentMetadata,
  extractDocumentTextWithSource,
  // Helpers.
  scrubUrl,
  detectFormatFromUrl,
  detectFormatFamilyFromBytes,
  categorizeParseError,
} from './extractor.js';

// URL-scanner surface.
export {
  extractPdfUrlsFromMarkdown,
  extractDocumentUrlsFromMarkdown,
  titleFromUrl,
} from './url-scan.js';

// HTML-safe JSON serializer.
export { safeJSONForHTML } from './json-safe.js';

function shortHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
}

function defaultId(url: string, format: DocumentFormat | undefined): string {
  // Keep the existing `pdf-<hash>` shape for PDFs (1.0.x consumers may
  // rely on it). Use the format as a prefix for the new Office formats so
  // an ID collision between a `.pdf` and a `.docx` at the same URL stem
  // can't occur. (URL-hash collision is the actual uniqueness driver;
  // the prefix is human-readable scaffolding.)
  return `${format ?? 'pdf'}-${shortHash(url)}`;
}

function normalizeEntry(entry: UrlOrEntry): { url: string; title?: string; id?: string } {
  if (typeof entry === 'string') return { url: entry };
  return entry;
}

async function buildRow(
  entry: { url: string; title?: string; id?: string },
  options: ExtractOptions,
  legacyPdfMode: boolean,
): Promise<IndexedDocument> {
  const { url } = entry;

  // Legacy `indexPdfs` callers get PDF-hardcoded extraction (the old
  // 1.0.x behavior). New `indexDocuments` callers get format-agnostic
  // dispatch with extension + magic-byte detection.
  const result = legacyPdfMode
    ? await extractPdfTextWithSource(url, options)
    : await extractDocumentTextWithSource(url, options);

  // Title fallback: explicit > info-dict (PDF only) > humanized filename
  const title = entry.title ?? result.infoTitle ?? titleFromUrl(url);
  const format = result.format ?? detectFormatFromUrl(url) ?? 'pdf';
  const id = entry.id ?? defaultId(url, format);

  const row: IndexedDocument = {
    id,
    url,
    title,
    text: result.text,
    format,
    ...(result.pages !== undefined ? { pages: result.pages } : {}),
    ...(result.source === 'fresh' ? { extractedAt: new Date().toISOString() } : {}),
  };
  return row;
}

/**
 * Index a list of PDF URLs into searchable rows. Hardcoded to PDF
 * parsing regardless of URL extension — preserves 1.0.x behavior. For
 * mixed-format URL lists (PDF + DOCX + PPTX + XLSX), use
 * `indexDocuments` (added in 1.1) instead.
 */
export async function indexPdfs(
  urls: UrlOrEntry[],
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  return indexInternal(urls, options, /*legacyPdfMode=*/ true);
}

/**
 * Index a list of document URLs (PDF, DOCX, PPTX, XLSX) into searchable
 * rows. Auto-detects each URL's format from its extension and routes to
 * the appropriate extractor. Added in 1.1.
 *
 * URLs without a recognizable extension fall back to PDF parsing for
 * back-compat with 1.0.x. Pass `options.format` to override per-call.
 */
export async function indexDocuments(
  urls: UrlOrEntry[],
  options?: IndexDocumentsOptions,
): Promise<IndexedDocument[]> {
  return indexInternal(urls, options, /*legacyPdfMode=*/ false);
}

// I6 from the 1.0.2 audit: cap on the number of URLs accepted by a single
// indexing call. Default 5,000 matches the audit's recommendation. Sized
// to comfortably cover typical research/government CMS deployments
// (ICJIA's icjia.illinois.gov, for example, is in the 2K-2.5K range)
// while still bounding an attacker-controlled sitemap enqueue.
const DEFAULT_MAX_URLS = 5_000;

/**
 * Normalize the `maxUrls` option to a non-negative integer or `Infinity`.
 *
 * Closes F1 from the v1.2 audit: TypeScript-typed callers can't easily
 * pass a non-numeric value, but JS/MCP callers can. Pre-1.2.1 the cap
 * silently became no-op when given `NaN`, a string, or a float. With
 * this normalization, anything that isn't a real finite non-negative
 * number falls back to the default.
 */
function normalizeMaxUrls(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_MAX_URLS;
  if (raw === Infinity) return Infinity;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return DEFAULT_MAX_URLS;
  }
  return Math.floor(raw);
}

async function indexInternal(
  urls: UrlOrEntry[],
  options: IndexPdfsOptions | undefined,
  legacyPdfMode: boolean,
): Promise<IndexedDocument[]> {
  const concurrency = options?.concurrency ?? 4;
  const limit = createLimiter(concurrency);
  const maxUrls = normalizeMaxUrls(options?.maxUrls);

  // Dedupe by URL (preserve input order; first occurrence wins on title/id collision).
  const seen = new Set<string>();
  let entries = urls.map(normalizeEntry).filter((e) => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });

  // I6 / maxUrls cap: enforce after dedup (duplicates are free) but before
  // any network fetch fires. Truncates with a single console.warn so the
  // operator sees the truncation in CI logs. `normalizeMaxUrls` above
  // guarantees `maxUrls` is either a finite non-negative integer or
  // Infinity, so the Number.isFinite check is now strictly belt-and-
  // suspenders rather than a primary guard (F1 closure).
  if (Number.isFinite(maxUrls) && entries.length > maxUrls) {
    console.warn(
      `[pdf-search-index] indexing ${entries.length} URLs exceeds maxUrls cap of ${maxUrls}; truncating. ` +
        `Raise via { maxUrls: ${entries.length} } or set Infinity to disable.`,
    );
    entries = entries.slice(0, maxUrls);
  }

  return Promise.all(entries.map((e) => limit(() => buildRow(e, options ?? {}, legacyPdfMode))));
}

/**
 * Scan a markdown body for PDF URLs and index each. Hardcoded to PDF
 * parsing — preserves 1.0.x behavior. For multi-format scanning, use
 * `extractDocumentsFromBody` (added in 1.1).
 */
export async function extractPdfsFromBody(
  body: string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  if (!body) return [];
  // Reuse the multi-format scanner but filter the discovered set down to
  // only `.pdf` URLs so the legacy PDF-only contract still holds.
  const discovered = extractDocumentUrlsFromMarkdown(body).filter((d) => d.format === 'pdf');
  return indexPdfs(
    discovered.map((d) => (d.title ? { url: d.url, title: d.title } : { url: d.url })),
    options,
  );
}

/**
 * Scan a markdown body for document URLs (PDF, DOCX, PPTX, XLSX) and
 * index each. Linked URLs use the link text as the title; bare URLs use
 * the info-dict (PDF) or a humanized filename. Added in 1.1.
 */
export async function extractDocumentsFromBody(
  body: string,
  options?: IndexDocumentsOptions,
): Promise<IndexedDocument[]> {
  if (!body) return [];
  const discovered = extractDocumentUrlsFromMarkdown(body);
  return indexDocuments(
    discovered.map((d) => (d.title ? { url: d.url, title: d.title } : { url: d.url })),
    options,
  );
}
