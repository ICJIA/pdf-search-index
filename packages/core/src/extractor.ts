import { readCache, writeCache } from './cache.js';
import type { ExtractOptions } from './types.js';

const DEFAULT_CACHE_DIR = '.pdf-cache';
const DEFAULT_FETCH_TIMEOUT = 30_000;
// Lowered from 100 MB to 32 MB in v1.0.2 as a defense-in-depth measure
// against memory-exhaustion attacks. Consumers can opt up via
// `{ maxBytes: ... }` if they legitimately host larger PDFs.
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024; // 32 MB
// Cap on the extracted text length per PDF. Defends against
// "compression-bomb"-style PDFs (1 MB of flate-compressed repetitive
// streams that decompress to hundreds of MB of text). Consumers can opt
// up via `{ maxExtractedTextChars: ... }`.
const DEFAULT_MAX_EXTRACTED_TEXT_CHARS = 5_000_000; // 5 MB

export interface ExtractedMetadata {
  pages: number;
  infoTitle?: string;
}

interface ResolvedOptions {
  cacheDir: string;
  fetchTimeout: number;
  maxBytes: number;
  maxExtractedTextChars: number;
  fetch: typeof fetch;
  cache: 'use' | 'bypass' | 'refresh';
  mergePages: boolean;
  debug: boolean;
}

function resolveOptions(opts: ExtractOptions | undefined): ResolvedOptions {
  return {
    cacheDir: opts?.cacheDir ?? DEFAULT_CACHE_DIR,
    fetchTimeout: opts?.fetchTimeout ?? DEFAULT_FETCH_TIMEOUT,
    maxBytes: opts?.maxBytes ?? DEFAULT_MAX_BYTES,
    maxExtractedTextChars: opts?.maxExtractedTextChars ?? DEFAULT_MAX_EXTRACTED_TEXT_CHARS,
    fetch: opts?.fetch ?? fetch,
    cache: opts?.cache ?? 'use',
    mergePages: opts?.mergePages ?? true,
    debug: opts?.debug ?? false,
  };
}

/**
 * Return a redacted form of a URL safe for logging in CI: origin only,
 * path / query / fragment dropped. Internal infrastructure (path,
 * query-string secrets) doesn't leak into public CI logs.
 *
 * Control characters in the host are replaced with `?` so an attacker
 * can't smuggle terminal escapes / CRLF into log output.
 */
export function scrubUrl(url: string): string {
  try {
    const u = new URL(url);
    return scrubControl(`${u.protocol}//${u.host}`);
  } catch {
    return '[invalid-url]';
  }
}

function scrubControl(s: string): string {
  // Strip ASCII control chars (incl. CR, LF, tab) and the DEL byte. The
  // input is expected to be ASCII-clean (URL chars), so this is conservative.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f]/g, '?');
}

/**
 * Categorize a pdf.js parse error message into a short tag. The full
 * message is suppressed in CI logs because it can disclose details about
 * the PDF (e.g. PasswordException tells the attacker the URL is encrypted).
 */
export function categorizeParseError(msg: string): string {
  if (/password/i.test(msg)) return 'encrypted PDF';
  if (/xref|stream|trailer/i.test(msg)) return 'corrupt PDF structure';
  if (/font/i.test(msg)) return 'PDF font error';
  return 'PDF parse error';
}

async function fetchPdfBytes(url: string, o: ResolvedOptions): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.fetchTimeout);
  const scrubbed = scrubUrl(url);
  try {
    const res = await o.fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(
        o.debug
          ? `[pdf-search-index] fetch ${url} -> ${res.status}`
          : `[pdf-search-index] fetch ${scrubbed} -> ${res.status}`,
      );
      return null;
    }

    // Reject on declared Content-Length before reading the body. Cheap
    // upfront defense against attacker-controlled multi-GB responses.
    const declaredLen = parseContentLength(res.headers.get('content-length'));
    if (declaredLen !== null && declaredLen > o.maxBytes) {
      console.warn(
        o.debug
          ? `[pdf-search-index] ${url} content-length ${declaredLen} exceeds maxBytes ${o.maxBytes}`
          : `[pdf-search-index] ${scrubbed} content-length ${declaredLen} exceeds maxBytes ${o.maxBytes}`,
      );
      controller.abort();
      return null;
    }

    // Stream the body so an attacker can't OOM the build by serving a
    // multi-GB response with no Content-Length header (or a lie).
    const body = res.body;
    if (!body) {
      // Some fetch shims (older mocks) don't expose a stream. Fall back
      // to arrayBuffer with a size guard.
      const ab = await res.arrayBuffer();
      if (ab.byteLength > o.maxBytes) {
        console.warn(
          o.debug
            ? `[pdf-search-index] ${url} exceeds maxBytes (${ab.byteLength} > ${o.maxBytes})`
            : `[pdf-search-index] ${scrubbed} exceeds maxBytes (${ab.byteLength} > ${o.maxBytes})`,
        );
        return null;
      }
      return new Uint8Array(ab);
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    // We don't need a separate AbortController here — the existing one
    // already wraps the entire request. Cancelling the reader on overflow
    // makes the server stop streaming.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > o.maxBytes) {
        await reader.cancel().catch(() => {});
        controller.abort();
        console.warn(
          o.debug
            ? `[pdf-search-index] ${url} exceeds maxBytes (${total} > ${o.maxBytes})`
            : `[pdf-search-index] ${scrubbed} exceeds maxBytes (${total} > ${o.maxBytes})`,
        );
        return null;
      }
      chunks.push(value);
    }
    return concatChunks(chunks, total);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      o.debug
        ? `[pdf-search-index] fetch error ${url}: ${msg}`
        : `[pdf-search-index] fetch error ${scrubbed}: ${scrubControl(msg)}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseContentLength(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

interface ParsedPdf {
  text: string;
  pages: number;
  infoTitle?: string;
}

async function parsePdf(
  bytes: Uint8Array,
  o: ResolvedOptions,
  scrubbedUrl: string,
): Promise<ParsedPdf | null> {
  try {
    const { getDocumentProxy, extractText } = await import('unpdf');
    const pdf = await getDocumentProxy(bytes);
    // unpdf's extractText uses a discriminated overload on the `mergePages` literal,
    // so we branch on the boolean to pick the right overload.
    const result = o.mergePages
      ? await extractText(pdf, { mergePages: true })
      : await extractText(pdf, { mergePages: false });
    const { text, totalPages } = result;
    let textStr = Array.isArray(text) ? text.join('\n\n') : text;

    // Compression-bomb defense: cap the post-decompression text length.
    if (textStr.length > o.maxExtractedTextChars) {
      console.warn(
        `[pdf-search-index] ${scrubbedUrl} extracted text ${textStr.length} chars exceeds cap ${o.maxExtractedTextChars}; truncating`,
      );
      textStr = textStr.slice(0, o.maxExtractedTextChars);
    }

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
    if (o.debug) {
      // In debug mode, surface the full message for triage.
      console.warn(`[pdf-search-index] parse error ${scrubbedUrl}: ${scrubControl(msg)}`);
    } else {
      // Default: log only the category to avoid leaking whether a PDF is
      // encrypted, corrupt, etc.
      console.warn(`[pdf-search-index] parse error ${scrubbedUrl}: ${categorizeParseError(msg)}`);
    }
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
  const scrubbed = scrubUrl(url);

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

  const parsed = await parsePdf(bytes, o, scrubbed);
  if (!parsed) return { text: '', source: 'failed' };

  if (o.cache !== 'bypass') {
    try {
      await writeCache(o.cacheDir, url, parsed.text, { pages: parsed.pages });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        o.debug
          ? `[pdf-search-index] cache write failed for ${url}: ${msg}`
          : `[pdf-search-index] cache write failed for ${scrubbed}: ${scrubControl(msg)}`,
      );
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
  const scrubbed = scrubUrl(url);
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
  const parsed = await parsePdf(bytes, o, scrubbed);
  if (!parsed) return { pages: 0 };
  return {
    pages: parsed.pages,
    ...(parsed.infoTitle !== undefined ? { infoTitle: parsed.infoTitle } : {}),
  };
}
