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
  maxBytes?: number;
  fetch?: typeof fetch;
  cache?: 'use' | 'bypass' | 'refresh';
  mergePages?: boolean;
}

export interface IndexPdfsOptions extends ExtractOptions {
  concurrency?: number;
}

export type UrlOrEntry = string | { url: string; title?: string; id?: string };

export interface DiscoveredPdf {
  url: string;
  title: string;
}
