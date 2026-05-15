import { readCache, writeCache } from './cache.js';
import type { ExtractOptions } from './types.js';

const DEFAULT_CACHE_DIR = '.pdf-cache';
const DEFAULT_FETCH_TIMEOUT = 30_000;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

export interface ExtractedMetadata {
  pages: number;
  infoTitle?: string;
}

interface ResolvedOptions {
  cacheDir: string;
  fetchTimeout: number;
  maxBytes: number;
  fetch: typeof fetch;
  cache: 'use' | 'bypass' | 'refresh';
  mergePages: boolean;
}

function resolveOptions(opts: ExtractOptions | undefined): ResolvedOptions {
  return {
    cacheDir: opts?.cacheDir ?? DEFAULT_CACHE_DIR,
    fetchTimeout: opts?.fetchTimeout ?? DEFAULT_FETCH_TIMEOUT,
    maxBytes: opts?.maxBytes ?? DEFAULT_MAX_BYTES,
    fetch: opts?.fetch ?? fetch,
    cache: opts?.cache ?? 'use',
    mergePages: opts?.mergePages ?? true,
  };
}

async function fetchPdfBytes(url: string, o: ResolvedOptions): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.fetchTimeout);
  try {
    const res = await o.fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[pdf-search-index] fetch ${url} -> ${res.status}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > o.maxBytes) {
      console.warn(`[pdf-search-index] ${url} exceeds maxBytes (${ab.byteLength} > ${o.maxBytes})`);
      return null;
    }
    return new Uint8Array(ab);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[pdf-search-index] fetch error ${url}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ParsedPdf {
  text: string;
  pages: number;
  infoTitle?: string;
}

async function parsePdf(bytes: Uint8Array, mergePages: boolean): Promise<ParsedPdf | null> {
  try {
    const { getDocumentProxy, extractText } = await import('unpdf');
    const pdf = await getDocumentProxy(bytes);
    // unpdf's extractText uses a discriminated overload on the `mergePages` literal,
    // so we branch on the boolean to pick the right overload.
    const result = mergePages
      ? await extractText(pdf, { mergePages: true })
      : await extractText(pdf, { mergePages: false });
    const { text, totalPages } = result;
    const textStr = Array.isArray(text) ? text.join('\n\n') : text;

    // pdf.getMetadata() comes from pdfjs's PDFDocumentProxy — portable across unpdf versions.
    let infoTitle: string | undefined;
    try {
      type WithMetadata = { getMetadata: () => Promise<{ info?: Record<string, unknown> }> };
      const metadata = await (pdf as unknown as WithMetadata).getMetadata();
      const t = metadata.info?.Title;
      if (typeof t === 'string' && t.trim()) infoTitle = t.trim();
    } catch {
      // info dict may not be present; ignore
    }

    // Conditional spread to satisfy exactOptionalPropertyTypes (no assigning undefined to optional)
    return {
      text: textStr,
      pages: totalPages,
      ...(infoTitle !== undefined ? { infoTitle } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[pdf-search-index] parse error: ${msg}`);
    return null;
  }
}

export interface ExtractResult {
  text: string;
  source: 'cache' | 'fresh' | 'failed';
  pages?: number;
  infoTitle?: string;
}

export async function extractPdfTextWithSource(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const o = resolveOptions(options);

  if (o.cache === 'use') {
    const hit = await readCache(o.cacheDir, url);
    if (hit) {
      // Conditional spread for `pages` to satisfy exactOptionalPropertyTypes
      return {
        text: hit.text,
        source: 'cache',
        ...(hit.meta.pages !== undefined ? { pages: hit.meta.pages } : {}),
      };
    }
  }

  const bytes = await fetchPdfBytes(url, o);
  if (!bytes) return { text: '', source: 'failed' };

  const parsed = await parsePdf(bytes, o.mergePages);
  if (!parsed) return { text: '', source: 'failed' };

  if (o.cache !== 'bypass') {
    try {
      await writeCache(o.cacheDir, url, parsed.text, { pages: parsed.pages });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[pdf-search-index] cache write failed for ${url}: ${msg}`);
    }
  }

  // Conditional spreads for both optional fields
  return {
    text: parsed.text,
    source: 'fresh',
    pages: parsed.pages,
    ...(parsed.infoTitle !== undefined ? { infoTitle: parsed.infoTitle } : {}),
  };
}

export async function extractPdfText(url: string, options?: ExtractOptions): Promise<string> {
  const r = await extractPdfTextWithSource(url, options);
  return r.text;
}

export async function extractPdfMetadata(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractedMetadata> {
  const o = resolveOptions(options);
  // Cache hit: derive what we can from the sidecar without re-fetching.
  // (info-dict title isn't in the sidecar, so it returns undefined here.
  // Callers that need info-dict title should use extractPdfTextWithSource
  // which always parses fresh on a miss.)
  if (o.cache === 'use') {
    const hit = await readCache(o.cacheDir, url);
    if (hit) {
      return hit.meta.pages !== undefined ? { pages: hit.meta.pages } : { pages: 0 };
    }
  }
  const bytes = await fetchPdfBytes(url, o);
  if (!bytes) return { pages: 0 };
  const parsed = await parsePdf(bytes, o.mergePages);
  if (!parsed) return { pages: 0 };
  return {
    pages: parsed.pages,
    ...(parsed.infoTitle !== undefined ? { infoTitle: parsed.infoTitle } : {}),
  };
}
