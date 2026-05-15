import { describe, it, expect } from 'vitest';
import { extractPdfUrlsFromMarkdown } from '../src/url-scan.js';

describe('extractPdfUrlsFromMarkdown', () => {
  it('returns empty array for empty body', () => {
    expect(extractPdfUrlsFromMarkdown('')).toEqual([]);
  });

  it('finds a single markdown link with a PDF', () => {
    const body = `See [Annual Report](https://example.com/report.pdf) for details.`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/report.pdf', title: 'Annual Report' },
    ]);
  });

  it('finds bare PDF URLs (title left blank for buildRow info-dict fallback)', () => {
    const body = `https://example.com/r3-faq-2024.pdf is available.`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/r3-faq-2024.pdf', title: '' },
    ]);
  });

  it('prefers the linked-text title when a URL appears both linked and bare', () => {
    const body = `[Report](https://example.com/x.pdf) and also https://example.com/x.pdf`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/x.pdf', title: 'Report' },
    ]);
  });

  it('dedupes the same URL appearing multiple times', () => {
    const body = `[A](https://example.com/x.pdf) and [B](https://example.com/x.pdf)`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/x.pdf', title: 'A' },
    ]);
  });

  it('handles links with trailing attributes like {target=_blank}', () => {
    const body = `[FAQ](https://example.com/faq.pdf){target=_blank}`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/faq.pdf', title: 'FAQ' },
    ]);
  });

  it('handles URLs with query strings', () => {
    const body = `[Doc](https://example.com/doc.pdf?v=2)`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/doc.pdf?v=2', title: 'Doc' },
    ]);
  });
});
