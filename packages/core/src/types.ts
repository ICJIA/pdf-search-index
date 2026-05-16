export interface IndexedPdf {
  id: string;
  url: string;
  title: string;
  text: string;
  pages?: number;
  extractedAt?: string;
}

export interface ExtractOptions {
  cacheDir?: string;
  fetchTimeout?: number;
  /**
   * Maximum number of bytes accepted from the PDF download. Defaults to
   * 32 MB. Responses with a declared `Content-Length` larger than this are
   * rejected before reading the body. For streaming responses without a
   * `Content-Length`, the read is aborted once the cap is exceeded.
   */
  maxBytes?: number;
  /**
   * Maximum number of characters retained from the parsed PDF text. Defaults
   * to 5,000,000 (5 MB). Defends against compression-bomb-style PDFs whose
   * flate streams decompress to hundreds of megabytes. Anything beyond the
   * cap is truncated and a warning is logged.
   */
  maxExtractedTextChars?: number;
  fetch?: typeof fetch;
  cache?: 'use' | 'bypass' | 'refresh';
  mergePages?: boolean;
  /**
   * When `true`, parse and fetch errors include the full underlying error
   * message and the unscrubbed URL is printed in logs. When `false`
   * (default), only the URL origin and a categorized error tag are logged
   * — protecting internal URLs and PDF state from CI log enumeration.
   */
  debug?: boolean;
}

export interface IndexPdfsOptions extends ExtractOptions {
  concurrency?: number;
}

export type UrlOrEntry = string | { url: string; title?: string; id?: string };

export interface DiscoveredPdf {
  url: string;
  title: string;
}
