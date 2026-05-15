// astro/src/lib/pdfText.ts
//
// Build-time PDF text extraction. Scans a Strapi markdown body for PDF
// links, downloads each one, runs pdf.js (via `unpdf`) to extract the text
// layer, and returns an array of { id, url, title, text } entries so each
// PDF can be its own searchable row in /searchIndex.json — separate from
// the page that hosts it. Search results for a PDF link directly at the
// PDF URL.
//
// Title is the markdown link text when the body wraps the URL in a real
// markdown link `[Title](url)`; falls back to a humanized version of the
// PDF filename otherwise (e.g. `r3-faq-2024.pdf` → "R3 Faq 2024").
//
// Extracted text is cached to `.astro/.pdf-cache/<sha256>.txt` (key:
// first 16 hex chars of SHA-256 of the URL). Subsequent runs reuse the
// cache. To force a re-extract, delete that directory.
//
// Image-only / scanned PDFs return empty text (pdf.js has no OCR layer).
// Fetch and parse failures are logged and dropped — search degrades
// gracefully instead of failing the build.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = '.astro/.pdf-cache';

// Markdown link with a PDF URL: `[Title](https://...pdf){target='_blank'}` etc.
const PDF_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)\]]+\.pdf)\b[^)]*\)/gi;

// Bare PDF URL (no surrounding markdown link).
const PDF_BARE_URL_PATTERN = /https?:\/\/[^\s)\]]+\.pdf\b/gi;

export interface ExtractedPdf {
  id: string;
  url: string;
  title: string;
  text: string;
}

/**
 * Find every PDF URL in a markdown body, extract each PDF's text layer,
 * and return one entry per PDF. Linked-text titles win over filename-
 * derived titles when both are available.
 */
export async function extractPdfsFromBody(body: string): Promise<ExtractedPdf[]> {
  if (!body) return [];

  // Pass 1: PDF URLs that ARE wrapped in markdown links — keep the link text.
  const linked = new Map<string, string>();
  for (const m of body.matchAll(PDF_LINK_PATTERN)) {
    const title = m[1].trim();
    const url = m[2];
    if (!linked.has(url) && title) linked.set(url, title);
  }

  // Pass 2: remaining bare URLs (not already captured as linked).
  const bareUrls: string[] = [];
  for (const m of body.matchAll(PDF_BARE_URL_PATTERN)) {
    const url = m[0];
    if (!linked.has(url) && !bareUrls.includes(url)) bareUrls.push(url);
  }

  const entries: { url: string; title: string }[] = [
    ...[...linked.entries()].map(([url, title]) => ({ url, title })),
    ...bareUrls.map((url) => ({ url, title: titleFromUrl(url) })),
  ];

  const extracted = await Promise.all(
    entries.map(async ({ url, title }) => {
      const text = await extractPdfText(url);
      if (!text) return null;
      return {
        id: `pdf-${hashUrl(url, 12)}`,
        url,
        title,
        text,
      };
    }),
  );

  return extracted.filter((e): e is ExtractedPdf => e !== null);
}

function hashUrl(url: string, len: number): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, len);
}

function titleFromUrl(url: string): string {
  const filename = url.split('/').pop() ?? 'PDF';
  return (
    decodeURIComponent(filename)
      .replace(/\.pdf$/i, '')
      .replace(/[-_]+/g, ' ')
      // Title-case each word.
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  );
}

async function extractPdfText(url: string): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${hashUrl(url, 16)}.txt`);

  try {
    return await fs.promises.readFile(cachePath, 'utf-8');
  } catch {
    // cache miss
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[pdfText] fetch ${url} → ${res.status}`);
      return '';
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(buf);
    // `mergePages: true` returns `{ totalPages, text: string }` — one
    // concatenated string is exactly what Fuse.js wants.
    const { text } = await extractText(pdf, { mergePages: true });

    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    await fs.promises.writeFile(cachePath, text, 'utf-8');

    console.log(`[pdfText] indexed ${url} (${text.length} chars)`);
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[pdfText] extract failed for ${url}: ${msg}`);
    return '';
  }
}
