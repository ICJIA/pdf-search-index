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
   * For PDFs: page count. For PPTX: slide count. For XLSX: sheet count.
   * For DOCX: undefined (no native page concept until rendered).
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
