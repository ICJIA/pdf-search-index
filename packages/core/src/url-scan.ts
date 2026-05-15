import type { DiscoveredPdf } from './types.js';

// Markdown link with a PDF URL: `[Title](https://...pdf){target='_blank'}` etc.
// Matches `[text](url)` where url ends in `.pdf` (optionally followed by query/fragment).
// Supports https?:// and file:// schemes.
const PDF_LINK_PATTERN = /\[([^\]]+)\]\(((https?|file):\/\/[^\s)]+?\.pdf(?:\?[^\s)]*)?)\)/gi;

// Bare PDF URL not wrapped in a markdown link.
// Supports https?:// and file:// schemes.
const PDF_BARE_URL_PATTERN = /(https?|file):\/\/[^\s)\]]+?\.pdf(?:\?[^\s)\]]*)?/gi;

export function extractPdfUrlsFromMarkdown(body: string): DiscoveredPdf[] {
  if (!body) return [];

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
