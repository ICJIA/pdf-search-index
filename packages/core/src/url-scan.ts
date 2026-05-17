import { detectFormatFromUrl } from './extractor.js';
import type { DiscoveredDocument, DiscoveredPdf, DocumentFormat } from './types.js';

// Markdown link with a document URL: `[Title](https://...pdf){target='_blank'}` etc.
// Matches `[text](url)` where url ends in one of the supported document
// extensions (.pdf / .docx / .pptx / .xlsx, optionally followed by query).
// Supports https?:// and file:// schemes.
//
// Security note (C1, 1.0.2): the path and query parts use bounded greedy
// quantifiers (`{1,2048}` / `{0,1024}`) and exclude `<>"' \t\n)\]` to
// avoid the catastrophic-backtracking ReDoS vulnerability that the
// unbounded non-greedy `[^\s)]+?` had on payloads like
// `'[X](https://a'.repeat(N)`. Adding new extensions doesn't widen the
// regex's worst-case complexity — only the alternation in the extension
// group, which is bounded by definition.
const DOC_LINK_PATTERN =
  /\[([^\]]{1,512})\]\(((?:https?|file):\/\/[^\s)\]<>"']{1,2048}\.(?:pdf|docx|pptx|xlsx)(?:\?[^\s)\]<>"']{0,1024})?)\)/gi;

// Bare document URL not wrapped in a markdown link.
// Supports https?:// and file:// schemes. Bounded for the same reason.
const DOC_BARE_URL_PATTERN =
  /(?:https?|file):\/\/[^\s)\]<>"']{1,2048}\.(?:pdf|docx|pptx|xlsx)(?:\?[^\s)\]<>"']{0,1024})?/gi;

// Back-compat aliases for the PDF-only patterns. Kept as exported names
// so any consumer that imported them directly continues to work; the
// runtime behavior is now multi-format. The names will be deprecated in
// a future major.
export const PDF_LINK_PATTERN = DOC_LINK_PATTERN;
export const PDF_BARE_URL_PATTERN = DOC_BARE_URL_PATTERN;

// Belt-and-suspenders: skip extremely large markdown bodies entirely. The
// bounded quantifiers above already neutralize the ReDoS, but a 100+ MB
// body still wastes CPU on a regex scan even when it can't backtrack.
const MAX_SCAN_BODY_LENGTH = 1_000_000;

/**
 * Scan a markdown body for PDF URLs (1.0.x-compatible). Returns
 * `{ url, title }` entries only — no `format` field — exactly as 1.0.x
 * did. Filters out non-PDF discoveries that the underlying multi-format
 * scanner picks up. For new code that wants all document formats,
 * prefer `extractDocumentUrlsFromMarkdown`.
 */
export function extractPdfUrlsFromMarkdown(body: string): DiscoveredPdf[] {
  return extractDocumentUrlsFromMarkdown(body)
    .filter((d) => d.format === 'pdf')
    .map((d) => ({ url: d.url, title: d.title }));
}

/**
 * Scan a markdown body for document URLs (PDF, DOCX, PPTX, XLSX). Each
 * discovered URL is returned with its inferred format set on the
 * `format` field. Added in 1.1.
 */
export function extractDocumentUrlsFromMarkdown(body: string): DiscoveredDocument[] {
  if (!body) return [];
  if (body.length > MAX_SCAN_BODY_LENGTH) {
    console.warn(
      `[pdf-search-index] skipping URL scan: body length ${body.length} exceeds ${MAX_SCAN_BODY_LENGTH} char cap`,
    );
    return [];
  }

  // Pass 1: linked documents win; capture the link text as title.
  const linked = new Map<string, string>();
  for (const m of body.matchAll(DOC_LINK_PATTERN)) {
    const title = (m[1] ?? '').trim();
    const url = m[2];
    if (url && title && !linked.has(url)) {
      linked.set(url, title);
    }
  }

  // Pass 2: bare URLs not already captured. Leave title empty so
  // `buildRow` consults the pdf.js info-dict (for PDFs) or falls back to
  // the humanized filename.
  const bare = new Set<string>();
  for (const m of body.matchAll(DOC_BARE_URL_PATTERN)) {
    const url = m[0];
    if (!linked.has(url)) bare.add(url);
  }

  const linkedEntries: DiscoveredDocument[] = [...linked.entries()].map(([url, title]) => {
    const fmt = detectFormatFromUrl(url);
    return {
      url,
      title,
      ...(fmt !== null ? { format: fmt } : {}),
    };
  });

  const bareEntries: DiscoveredDocument[] = [...bare].map((url) => {
    const fmt = detectFormatFromUrl(url);
    return {
      url,
      title: '', // intentional: triggers info-dict / filename fallback
      ...(fmt !== null ? { format: fmt } : {}),
    };
  });

  return [...linkedEntries, ...bareEntries];
}

/**
 * Derive a human-readable title from a document URL by stripping the
 * extension, converting separators to spaces, and title-casing. Works
 * for PDF, DOCX, PPTX, XLSX URLs.
 *
 * Examples:
 *   `https://example.com/annual-report-2024.pdf` → `Annual Report 2024`
 *   `https://example.com/meeting-agenda.docx`    → `Meeting Agenda`
 */
export function titleFromUrl(url: string): string {
  const path = url.split('?')[0] ?? url;
  const filename = path.split('/').pop() ?? 'Document';
  return decodeURIComponent(filename)
    .replace(/\.(pdf|docx|pptx|xlsx)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Re-export the format detector so callers that want to discriminate
// formats post-discovery don't need to import from extractor.
export { detectFormatFromUrl };
export type { DocumentFormat };
