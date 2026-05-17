/**
 * Document formats this package can extract text from. Added in 1.1:
 * `docx`, `pptx`, `xlsx` join the original `pdf`. All Office formats
 * are handled via the optional `officeparser` peer dependency.
 */
export type DocumentFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx';

export interface IndexedDocument {
  id: string;
  url: string;
  title: string;
  text: string;
  /**
   * Source document format. For PDF this is `'pdf'`; for the Office
   * formats added in 1.1 it's `'docx'`, `'pptx'`, or `'xlsx'`. Optional
   * for back-compat with rows produced by 1.0.x (which were all PDF and
   * didn't carry a format field).
   */
  format?: DocumentFormat;
  /**
   * For PDFs: page count (populated). For DOCX/PPTX/XLSX: not surfaced
   * by `officeparser`'s text API, so `pages` is undefined for all
   * Office formats. (A future patch could re-read the ZIP to count
   * slides / sheets, but the cost is rarely worth it — consumers
   * who need it can call the ZIP inspector directly.)
   */
  pages?: number;
  extractedAt?: string;
}

/**
 * Back-compat alias. v1.0.x exported `IndexedPdf`; 1.1+ uses the
 * format-agnostic `IndexedDocument` name. The shape is identical.
 */
export type IndexedPdf = IndexedDocument;

export interface ExtractOptions {
  cacheDir?: string;
  fetchTimeout?: number;
  /**
   * Maximum number of bytes accepted from the document download. Defaults
   * to 32 MB. Responses with a declared `Content-Length` larger than this
   * are rejected before reading the body. For streaming responses without
   * a `Content-Length`, the read is aborted once the cap is exceeded.
   *
   * Applies to all formats (PDF, DOCX, PPTX, XLSX).
   */
  maxBytes?: number;
  /**
   * Maximum number of characters retained from the parsed document text.
   * Defaults to 5,000,000 (5 MB). Defends against compression-bomb-style
   * documents whose flate streams decompress to hundreds of megabytes.
   * Anything beyond the cap is truncated and a warning is logged.
   */
  maxExtractedTextChars?: number;
  /**
   * For Office formats (DOCX, PPTX, XLSX), the maximum total uncompressed
   * archive size accepted from the input. Defaults to 100 MB.
   *
   * The Office formats are ZIP archives of XML. A few-KB malicious input
   * can inflate to multi-GB on extraction, sitting between the existing
   * `maxBytes` (compressed input cap) and `maxExtractedTextChars`
   * (post-extraction text cap) — `officeparser` materializes the
   * inflated XML in memory before we see the text. This option closes
   * that window: the ZIP central directory is inspected up-front; if the
   * declared total uncompressed size exceeds the cap, the document is
   * rejected without invoking the parser.
   *
   * Set to `Infinity` to disable. Has no effect on PDFs (their
   * compression bound is `maxExtractedTextChars`).
   *
   * Added in 1.2. Closes the deferral from the 2026-05-17 v1.1 audit.
   */
  maxInflatedArchiveBytes?: number;
  fetch?: typeof fetch;
  cache?: 'use' | 'bypass' | 'refresh';
  mergePages?: boolean;
  /**
   * When `true`, parse and fetch errors include the full underlying error
   * message and the unscrubbed URL is printed in logs. When `false`
   * (default), only the URL origin and a categorized error tag are logged
   * — protecting internal URLs and document state from CI log enumeration.
   */
  debug?: boolean;
  /**
   * Override format detection (URL-extension + magic-byte sniff). When set,
   * the byte stream is parsed with the named extractor regardless of the
   * URL extension. Useful for URLs without a recognizable extension (e.g.
   * a CMS attachment URL like `/api/files/abc123`) when the caller knows
   * the format from out-of-band context.
   *
   * Added in 1.1.
   */
  format?: DocumentFormat;
}

export interface IndexPdfsOptions extends ExtractOptions {
  concurrency?: number;
  /**
   * Maximum number of URLs accepted by a single `indexPdfs` /
   * `indexDocuments` call. Defaults to 5,000. Anything above the cap is
   * truncated and a warning is logged. Defends against a misconfigured
   * or malicious sitemap enqueueing millions of fetch requests.
   *
   * Set to `Infinity` to disable the cap. Most ICJIA-style sites
   * (research-heavy government CMS) fit well under 5,000.
   *
   * Added in 1.2 (closes I6 from the 1.0.2 audit).
   */
  maxUrls?: number;
}

/** Back-compat alias for `IndexPdfsOptions`. */
export type IndexDocumentsOptions = IndexPdfsOptions;

export type UrlOrEntry = string | { url: string; title?: string; id?: string };

export interface DiscoveredDocument {
  url: string;
  title: string;
  format?: DocumentFormat;
}

/** Back-compat alias for `DiscoveredDocument`. */
export type DiscoveredPdf = DiscoveredDocument;
