import type { DiscoveredPdf } from './types.js';

// Markdown link with a PDF URL: `[Title](https://...pdf){target='_blank'}` etc.
// Matches `[text](url)` where url ends in `.pdf` (optionally followed by query).
// Supports https?:// and file:// schemes.
//
// Security note: the path and query parts use bounded greedy quantifiers
// (`{1,2048}` / `{0,1024}`) and exclude `<>"' \t\n)\]` to avoid the
// catastrophic-backtracking ReDoS vulnerability that the unbounded
// non-greedy `[^\s)]+?` had on payloads like `'[X](https://a'.repeat(N)`.
const PDF_LINK_PATTERN =
  /\[([^\]]{1,512})\]\(((?:https?|file):\/\/[^\s)\]<>"']{1,2048}\.pdf(?:\?[^\s)\]<>"']{0,1024})?)\)/gi;

// Bare PDF URL not wrapped in a markdown link.
// Supports https?:// and file:// schemes. Bounded for the same reason.
const PDF_BARE_URL_PATTERN =
  /(?:https?|file):\/\/[^\s)\]<>"']{1,2048}\.pdf(?:\?[^\s)\]<>"']{0,1024})?/gi;

// Belt-and-suspenders: skip extremely large markdown bodies entirely. The
// bounded quantifiers above already neutralize the ReDoS, but a 100+ MB
// body still wastes CPU on a regex scan even when it can't backtrack.
const MAX_SCAN_BODY_LENGTH = 1_000_000;

export function extractPdfUrlsFromMarkdown(body: string): DiscoveredPdf[] {
  if (!body) return [];
  if (body.length > MAX_SCAN_BODY_LENGTH) {
    console.warn(
      `[pdf-search-index] skipping URL scan: body length ${body.length} exceeds ${MAX_SCAN_BODY_LENGTH} char cap`,
    );
    return [];
  }

  // Pass 1: linked PDFs win; capture the link text as title.
  const linked = new Map<string, string>();
  for (const m of body.matchAll(PDF_LINK_PATTERN)) {
    const title = (m[1] ?? '').trim();
    const url = m[2];
    if (url && title && !linked.has(url)) {
      linked.set(url, title);
    }
  }

  // Pass 2: bare URLs not already captured. Leave title empty so
  // `buildRow` consults the pdf.js info-dict before falling back to the
  // humanized filename.
  const bare = new Set<string>();
  for (const m of body.matchAll(PDF_BARE_URL_PATTERN)) {
    const url = m[0];
    if (!linked.has(url)) bare.add(url);
  }

  const linkedEntries: DiscoveredPdf[] = [...linked.entries()].map(([url, title]) => ({
    url,
    title,
  }));

  const bareEntries: DiscoveredPdf[] = [...bare].map((url) => ({
    url,
    title: '', // intentional: triggers info-dict fallback in buildRow
  }));

  return [...linkedEntries, ...bareEntries];
}

export function titleFromUrl(url: string): string {
  const path = url.split('?')[0] ?? url;
  const filename = path.split('/').pop() ?? 'PDF';
  return decodeURIComponent(filename)
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
