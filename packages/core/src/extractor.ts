import { createRequire } from 'node:module';
import { readCache, writeCache } from './cache.js';
import { scrubControl, scrubUrl } from './scrub.js';
import type { DocumentFormat, ExtractOptions } from './types.js';
import { inspectZipUncompressedSize } from './zip-inspector.js';

export { scrubControl, scrubUrl };

const DEFAULT_CACHE_DIR = '.pdf-cache';
const DEFAULT_FETCH_TIMEOUT = 30_000;
// Lowered from 100 MB to 32 MB in v1.0.2 as a defense-in-depth measure
// against memory-exhaustion attacks. Consumers can opt up via
// `{ maxBytes: ... }` if they legitimately host larger documents.
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024; // 32 MB
// Cap on the extracted text length per document. Defends against
// "compression-bomb"-style files (1 MB of flate-compressed repetitive
// streams that decompress to hundreds of MB of text). Consumers can opt
// up via `{ maxExtractedTextChars: ... }`.
const DEFAULT_MAX_EXTRACTED_TEXT_CHARS = 5_000_000; // 5 MB
// Cap on the declared total uncompressed size in a ZIP-based Office
// document's central directory. Closes the inflate-bomb window between
// `maxBytes` (compressed input) and `maxExtractedTextChars` (extracted
// text). Default sized to cover legitimate large decks/spreadsheets (a
// 30 MB PPTX can inflate to ~100 MB) while still bounding a
// flate-bomb attack. Consumers can opt up via
// `{ maxInflatedArchiveBytes: ... }` or `Infinity` to disable.
const DEFAULT_MAX_INFLATED_ARCHIVE_BYTES = 100 * 1024 * 1024; // 100 MB

// Magic-byte signatures used for format-mismatch detection. The URL
// extension declares an intended format; the byte stream's leading bytes
// confirm it. Mismatch → abort, defends against the "PDF URL serving
// DOCX bytes" attack class (and inverse).
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" (used by all Office formats)
const ZIP_MAGIC_EMPTY = new Uint8Array([0x50, 0x4b, 0x05, 0x06]); // empty archive
const ZIP_MAGIC_SPANNED = new Uint8Array([0x50, 0x4b, 0x07, 0x08]); // spanned archive

const OFFICE_FORMATS: ReadonlySet<DocumentFormat> = new Set(['docx', 'pptx', 'xlsx']);

export interface ExtractedMetadata {
  pages: number;
  format?: DocumentFormat;
  infoTitle?: string;
}

interface ResolvedOptions {
  cacheDir: string;
  fetchTimeout: number;
  maxBytes: number;
  maxExtractedTextChars: number;
  maxInflatedArchiveBytes: number;
  fetch: typeof fetch;
  cache: 'use' | 'bypass' | 'refresh';
  mergePages: boolean;
  debug: boolean;
  format: DocumentFormat | undefined;
}

function resolveOptions(opts: ExtractOptions | undefined): ResolvedOptions {
  return {
    cacheDir: opts?.cacheDir ?? DEFAULT_CACHE_DIR,
    fetchTimeout: opts?.fetchTimeout ?? DEFAULT_FETCH_TIMEOUT,
    maxBytes: opts?.maxBytes ?? DEFAULT_MAX_BYTES,
    maxExtractedTextChars: opts?.maxExtractedTextChars ?? DEFAULT_MAX_EXTRACTED_TEXT_CHARS,
    maxInflatedArchiveBytes: opts?.maxInflatedArchiveBytes ?? DEFAULT_MAX_INFLATED_ARCHIVE_BYTES,
    fetch: opts?.fetch ?? fetch,
    cache: opts?.cache ?? 'use',
    mergePages: opts?.mergePages ?? true,
    debug: opts?.debug ?? false,
    format: opts?.format,
  };
}

/**
 * Infer the document format from a URL by extension. Returns `null` if
 * the URL doesn't end in a recognized document extension. Case-insensitive.
 * Added in 1.1.
 */
export function detectFormatFromUrl(url: string): DocumentFormat | null {
  // Trim query string + fragment so `?v=2#page=3` doesn't break the suffix match.
  let path = url;
  const q = path.indexOf('?');
  if (q !== -1) path = path.slice(0, q);
  const h = path.indexOf('#');
  if (h !== -1) path = path.slice(0, h);
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return null;
}

function startsWith(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Detect the document family (PDF vs ZIP-based Office) from the leading
 * bytes. Returns `'pdf'`, `'office'`, or `null` if the bytes match neither
 * signature. Added in 1.1 as a defense against format-mismatch attacks
 * (e.g., a `.pdf` URL serving DOCX bytes).
 *
 * Note: this distinguishes PDF from Office but NOT between docx/pptx/xlsx
 * (all three share the ZIP magic). The URL extension is used to
 * discriminate within the Office family; `officeparser` itself will fail
 * if the ZIP contents don't match the declared sub-format.
 */
export function detectFormatFamilyFromBytes(bytes: Uint8Array): 'pdf' | 'office' | null {
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
  if (startsWith(bytes, ZIP_MAGIC)) return 'office';
  if (startsWith(bytes, ZIP_MAGIC_EMPTY)) return 'office';
  if (startsWith(bytes, ZIP_MAGIC_SPANNED)) return 'office';
  return null;
}

/**
 * Return a redacted form of a URL safe for logging in CI: origin only,
 * path / query / fragment dropped. Internal infrastructure (path,
 * query-string secrets) doesn't leak into public CI logs.
 *
 * Control characters in the host are replaced with `?` so an attacker
 * can't smuggle terminal escapes / CRLF into log output.
 */
// scrubUrl / scrubControl moved to ./scrub.ts in v1.4 so browser-facing
// entries (/flexsearch, /pagefind, /worker) can import them without
// dragging node:module / node:fs into the client bundle. Re-exported
// at the top of this file for back-compat.

/**
 * Categorize a parse error message into a short tag. The full message is
 * suppressed in CI logs because it can disclose details about the
 * document (e.g. PasswordException tells the attacker the URL is
 * encrypted).
 *
 * The `format` parameter (added in 1.1) selects format-appropriate
 * categories. Defaults to `'pdf'` for back-compat with 1.0.x callers.
 */
export function categorizeParseError(msg: string, format: DocumentFormat = 'pdf'): string {
  if (format === 'pdf') {
    if (/password/i.test(msg)) return 'encrypted PDF';
    if (/xref|stream|trailer/i.test(msg)) return 'corrupt PDF structure';
    if (/font/i.test(msg)) return 'PDF font error';
    return 'PDF parse error';
  }
  // Office formats (docx / pptx / xlsx) — categorize errors surfaced by
  // officeparser. Tags mirror the PDF set so consumers handling the
  // category strings can match across formats.
  const upper = format.toUpperCase();
  if (/password|encrypted/i.test(msg)) return `encrypted ${upper} document`;
  if (/zip|invalid|malformed|corrupt|truncated/i.test(msg)) return `corrupt ${upper} structure`;
  if (/unsupported|unknown format/i.test(msg)) return `${upper} format mismatch`;
  if (/inflate cap exceeded/i.test(msg)) return `oversized ${upper} archive`;
  return `${upper} parse error`;
}

async function fetchDocumentBytes(url: string, o: ResolvedOptions): Promise<Uint8Array | null> {
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

interface ParsedDocument {
  text: string;
  format: DocumentFormat;
  /** Page count (PDF), slide count (PPTX), sheet count (XLSX). Undefined for DOCX. */
  pages?: number;
  /** PDF info-dict Title, if present. Not extracted from Office formats. */
  infoTitle?: string;
}

async function parsePdf(
  bytes: Uint8Array,
  o: ResolvedOptions,
  scrubbedUrl: string,
): Promise<ParsedDocument | null> {
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
      format: 'pdf',
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
      console.warn(
        `[pdf-search-index] parse error ${scrubbedUrl}: ${categorizeParseError(msg, 'pdf')}`,
      );
    }
    return null;
  }
}

/**
 * Parse a DOCX, PPTX, or XLSX byte stream via the optional `officeparser`
 * peer dependency. Returns null on failure (logs a categorized error tag
 * to console.warn, or the full message if `debug` is set).
 *
 * `officeparser` covers all three Office Open XML formats with a single
 * `parseOfficeAsync(buffer)` call — `format` is informational, used to
 * pick error-categorization tags and to populate the returned `format`
 * field. The underlying parser auto-detects the format from the ZIP
 * contents.
 *
 * Pages/slides/sheets count is not surfaced by officeparser's text API.
 * The `pages` field is left undefined for Office formats; consumers can
 * read the file structure directly if they need it.
 *
 * Added in 1.1.
 */
async function parseOfficeDoc(
  bytes: Uint8Array,
  format: DocumentFormat,
  o: ResolvedOptions,
  scrubbedUrl: string,
): Promise<ParsedDocument | null> {
  // Inflate-bomb defense (1.2): inspect the ZIP central directory and
  // reject if the declared total uncompressed size exceeds the cap.
  // Conservative — null result (= "couldn't inspect") falls through to
  // officeparser, which will surface a proper parse error if the input
  // is genuinely malformed. Only fail-fast when we can confidently
  // measure the bomb up front.
  if (Number.isFinite(o.maxInflatedArchiveBytes)) {
    const inspection = inspectZipUncompressedSize(bytes);
    if (inspection !== null && inspection.totalUncompressedBytes > o.maxInflatedArchiveBytes) {
      console.warn(
        `[pdf-search-index] ${scrubbedUrl}: ${categorizeParseError('inflate cap exceeded', format)} ` +
          `(declared uncompressed ${inspection.totalUncompressedBytes} bytes across ${inspection.entryCount} entries ` +
          `> maxInflatedArchiveBytes ${o.maxInflatedArchiveBytes}). ` +
          `If this is a legitimate large ${format.toUpperCase()}, raise the cap.`,
      );
      return null;
    }
    // null inspection or pass — proceed to parse.
  }

  // v1.4: the officeparser source is **vendored** into
  // `src/vendor/officeparser/officeParser.cjs` (copied byte-identical
  // from officeparser@5.2.2). The CJS module is loaded synchronously
  // via `createRequire(import.meta.url)` so it works from any entry's
  // bundled output position — tsup emits dist/<entry>.js, import.meta.url
  // resolves to the entry file at runtime, and the relative path
  // `./vendor/officeparser/officeParser.cjs` lands on dist/vendor/...
  // which is copied by tsup's onSuccess hook.
  //
  // Why createRequire instead of dynamic `import()`: a dynamic import
  // of a `.cjs` file from inside an ESM module via `new Function` was
  // failing with "A dynamic import callback was not specified" in
  // Node 20+ — the Function-constructed callback has no module loader
  // hook attached. createRequire bypasses ESM entirely and uses Node's
  // standard CommonJS resolution against import.meta.url's directory.
  //
  // The vendored officeParser.cjs still requires four small transitive
  // deps at module load time (concat-stream, @xmldom/xmldom, file-type,
  // yauzl) — those remain as direct npm `dependencies` because each is
  // widely-used with multiple maintainers (lower takedown risk than the
  // single-maintainer officeparser itself). See src/vendor/README.md.
  let parseOfficeAsync: (buffer: Buffer) => Promise<string>;
  try {
    const requireFromHere = createRequire(import.meta.url);
    const mod = requireFromHere('./vendor/officeparser/officeParser.cjs') as {
      parseOfficeAsync: (b: Buffer) => Promise<string>;
    };
    parseOfficeAsync = mod.parseOfficeAsync;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[pdf-search-index] ${scrubbedUrl}: failed to load the vendored officeparser source. ` +
        `This is unexpected — officeparser is vendored into @icjia/pdf-search-index@1.4.0+. ` +
        `Underlying error: ${scrubControl(msg)}`,
    );
    return null;
  }

  try {
    // officeparser requires a Node Buffer, not a generic Uint8Array. The
    // wrapping is O(1) — Buffer.from with a Uint8Array shares the backing
    // ArrayBuffer rather than copying.
    const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let textStr = await parseOfficeAsync(buf);

    // Compression-bomb defense: same cap as PDFs (I3, 5 MB default).
    // Office formats are ZIP archives of XML, so they can inflate
    // similarly to flate-compressed PDFs.
    if (textStr.length > o.maxExtractedTextChars) {
      console.warn(
        `[pdf-search-index] ${scrubbedUrl} extracted text ${textStr.length} chars exceeds cap ${o.maxExtractedTextChars}; truncating`,
      );
      textStr = textStr.slice(0, o.maxExtractedTextChars);
    }

    return {
      text: textStr,
      format,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (o.debug) {
      console.warn(`[pdf-search-index] parse error ${scrubbedUrl}: ${scrubControl(msg)}`);
    } else {
      console.warn(
        `[pdf-search-index] parse error ${scrubbedUrl}: ${categorizeParseError(msg, format)}`,
      );
    }
    return null;
  }
}

/**
 * Dispatcher — picks the right extractor for the declared format and
 * runs it. Format-mismatch defense: confirms the byte stream's magic
 * bytes match the declared format (PDF magic for `'pdf'`; ZIP magic for
 * any of the Office formats). Mismatch returns null with a categorized
 * error tag.
 *
 * Added in 1.1.
 */
async function parseDocument(
  bytes: Uint8Array,
  format: DocumentFormat,
  o: ResolvedOptions,
  scrubbedUrl: string,
): Promise<ParsedDocument | null> {
  // Format-mismatch detection: an attacker (or a misconfigured CMS) might
  // serve DOCX bytes at a `.pdf` URL or vice versa. The URL extension is
  // the declared format; the magic bytes are the truth. Mismatch → abort.
  const declared = format === 'pdf' ? 'pdf' : 'office';
  const actual = detectFormatFamilyFromBytes(bytes);
  if (actual !== null && actual !== declared) {
    console.warn(
      `[pdf-search-index] parse error ${scrubbedUrl}: ${format.toUpperCase()} format mismatch ` +
        `(URL declares ${format} but bytes are ${actual === 'pdf' ? 'PDF' : 'Office/ZIP'})`,
    );
    return null;
  }

  if (format === 'pdf') {
    return parsePdf(bytes, o, scrubbedUrl);
  }
  if (OFFICE_FORMATS.has(format)) {
    return parseOfficeDoc(bytes, format, o, scrubbedUrl);
  }
  // Unreachable under TS, but defensive at runtime in case of stale JS callers.
  console.warn(`[pdf-search-index] parse error ${scrubbedUrl}: unsupported format "${format}"`);
  return null;
}

export interface ExtractResult {
  text: string;
  source: 'cache' | 'fresh' | 'failed';
  /** Document format. Added in 1.1; undefined for cache hits written by 1.0.x. */
  format?: DocumentFormat;
  pages?: number;
  infoTitle?: string;
}

/**
 * Internal core. Both `extractPdfTextWithSource` and
 * `extractDocumentTextWithSource` call this. The `format` parameter
 * controls dispatch:
 *   - `'pdf'` — hardcoded PDF parsing (back-compat path for the legacy
 *     PDF-only API; even non-PDF URLs are parsed as PDFs and fail).
 *   - `'auto'` — detect from URL extension, fall back to magic-byte sniff
 *     against the fetched bytes, fall back to PDF as last-resort
 *     (preserves 1.0.x behavior for unrecognized URLs).
 */
async function extractCore(
  url: string,
  options: ExtractOptions | undefined,
  formatMode: DocumentFormat | 'auto',
): Promise<ExtractResult> {
  const o = resolveOptions(options);
  const scrubbed = scrubUrl(url);

  // Resolve the format we'll dispatch to.
  let format: DocumentFormat;
  if (formatMode !== 'auto') {
    format = formatMode;
  } else if (o.format) {
    format = o.format;
  } else {
    format = detectFormatFromUrl(url) ?? 'pdf'; // last-resort fallback
  }

  if (o.cache === 'use') {
    const hit = await readCache(o.cacheDir, url);
    if (hit) {
      return {
        text: hit.text,
        source: 'cache',
        format,
        ...(hit.meta.pages !== undefined ? { pages: hit.meta.pages } : {}),
      };
    }
  }

  const bytes = await fetchDocumentBytes(url, o);
  if (!bytes) return { text: '', source: 'failed', format };

  const parsed = await parseDocument(bytes, format, o, scrubbed);
  if (!parsed) return { text: '', source: 'failed', format };

  if (o.cache !== 'bypass') {
    try {
      // Conditional spread so we don't pass `pages: undefined` when the
      // format doesn't have a native page concept (DOCX).
      await writeCache(o.cacheDir, url, parsed.text, {
        ...(parsed.pages !== undefined ? { pages: parsed.pages } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        o.debug
          ? `[pdf-search-index] cache write failed for ${url}: ${msg}`
          : `[pdf-search-index] cache write failed for ${scrubbed}: ${scrubControl(msg)}`,
      );
    }
  }

  return {
    text: parsed.text,
    source: 'fresh',
    format: parsed.format,
    ...(parsed.pages !== undefined ? { pages: parsed.pages } : {}),
    ...(parsed.infoTitle !== undefined ? { infoTitle: parsed.infoTitle } : {}),
  };
}

/**
 * Extract text from a PDF URL with cache-source attribution. Hardcoded
 * to the PDF extractor regardless of URL extension — preserves 1.0.x
 * behavior. Callers that want format-agnostic dispatch should use
 * `extractDocumentTextWithSource` (added in 1.1) instead.
 */
export async function extractPdfTextWithSource(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  return extractCore(url, options, 'pdf');
}

export async function extractPdfText(url: string, options?: ExtractOptions): Promise<string> {
  const r = await extractPdfTextWithSource(url, options);
  return r.text;
}

export async function extractPdfMetadata(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractedMetadata> {
  return extractDocumentMetadataCore(url, options, 'pdf');
}

/**
 * Extract text from a document URL with cache-source attribution.
 * Auto-detects the format from the URL extension (`.pdf`/`.docx`/
 * `.pptx`/`.xlsx`), with `options.format` as an override and a final
 * fallback to PDF for unrecognized URLs. Added in 1.1.
 */
export async function extractDocumentTextWithSource(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  return extractCore(url, options, 'auto');
}

/**
 * Extract text from a document URL (PDF / DOCX / PPTX / XLSX).
 * Auto-detects format. Added in 1.1.
 */
export async function extractDocumentText(url: string, options?: ExtractOptions): Promise<string> {
  const r = await extractDocumentTextWithSource(url, options);
  return r.text;
}

/**
 * Extract structural metadata (pages / slides / sheets, info-dict title
 * if PDF) without committing to a text payload. Auto-detects format.
 * Added in 1.1.
 */
export async function extractDocumentMetadata(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractedMetadata> {
  return extractDocumentMetadataCore(url, options, 'auto');
}

async function extractDocumentMetadataCore(
  url: string,
  options: ExtractOptions | undefined,
  formatMode: DocumentFormat | 'auto',
): Promise<ExtractedMetadata> {
  const o = resolveOptions(options);
  const scrubbed = scrubUrl(url);

  let format: DocumentFormat;
  if (formatMode !== 'auto') {
    format = formatMode;
  } else if (o.format) {
    format = o.format;
  } else {
    format = detectFormatFromUrl(url) ?? 'pdf';
  }

  if (o.cache === 'use') {
    const hit = await readCache(o.cacheDir, url);
    if (hit) {
      return hit.meta.pages !== undefined
        ? { pages: hit.meta.pages, format }
        : { pages: 0, format };
    }
  }
  const bytes = await fetchDocumentBytes(url, o);
  if (!bytes) return { pages: 0, format };
  const parsed = await parseDocument(bytes, format, o, scrubbed);
  if (!parsed) return { pages: 0, format };
  return {
    pages: parsed.pages ?? 0,
    format: parsed.format,
    ...(parsed.infoTitle !== undefined ? { infoTitle: parsed.infoTitle } : {}),
  };
}
