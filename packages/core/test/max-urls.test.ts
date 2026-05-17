import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { indexDocuments, indexPdfs } from '../src/index.js';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `max-urls-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// fetchImpl that returns an empty 200 response without ever doing real I/O.
// We don't care about the parsed text for these tests — only that the cap
// truncates BEFORE we hit the network for the over-cap URLs.
const noopFetch: typeof fetch = (async () =>
  new Response('', { status: 200 })) as unknown as typeof fetch;

describe('maxUrls cap (I6)', () => {
  it('truncates input above the default cap of 5,000', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const urls = Array.from({ length: 5_005 }, (_, i) => `https://example.com/doc-${i}.pdf`);
    const rows = await indexDocuments(urls, { cacheDir, fetch: noopFetch });
    expect(rows).toHaveLength(5_000);
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/exceeds maxUrls cap of 5000; truncating/);
  });

  it('honors a custom maxUrls value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/doc-${i}.pdf`);
    const rows = await indexDocuments(urls, { cacheDir, fetch: noopFetch, maxUrls: 10 });
    expect(rows).toHaveLength(10);
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/exceeds maxUrls cap of 10; truncating/);
  });

  it('does NOT truncate when input is at or below the cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const urls = Array.from({ length: 50 }, (_, i) => `https://example.com/doc-${i}.pdf`);
    const rows = await indexDocuments(urls, { cacheDir, fetch: noopFetch, maxUrls: 100 });
    expect(rows).toHaveLength(50);
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).not.toMatch(/maxUrls cap/);
  });

  it('Infinity disables the cap entirely', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 6,000 > the default 5,000 — would normally truncate.
    const urls = Array.from({ length: 6_000 }, (_, i) => `https://example.com/doc-${i}.pdf`);
    const rows = await indexDocuments(urls, {
      cacheDir,
      fetch: noopFetch,
      maxUrls: Infinity,
    });
    expect(rows).toHaveLength(6_000);
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).not.toMatch(/maxUrls cap/);
  });

  it('applies the cap AFTER URL dedup', async () => {
    // Caller passes 5,500 URLs but 1,000 of them are duplicates → 4,500
    // unique URLs → under the 5,000 cap → no truncation.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dups = Array.from({ length: 1_000 }, () => `https://example.com/dup.pdf`);
    const uniques = Array.from({ length: 4_500 }, (_, i) => `https://example.com/u-${i}.pdf`);
    const rows = await indexDocuments([...dups, ...uniques], { cacheDir, fetch: noopFetch });
    expect(rows).toHaveLength(4_501); // 1 deduped + 4,500 uniques
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).not.toMatch(/maxUrls cap/);
  });

  it('applies the cap to legacy indexPdfs (1.0.x back-compat path) too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/doc-${i}.pdf`);
    const rows = await indexPdfs(urls, { cacheDir, fetch: noopFetch, maxUrls: 5 });
    expect(rows).toHaveLength(5);
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/exceeds maxUrls cap of 5; truncating/);
  });

  // F1 from the v1.2 audit (2026-05-17): pre-1.2.1 the cap silently
  // became no-op when given NaN, a string, a float, or a negative
  // number. With the normalize-at-boundary fix, anything that isn't a
  // real finite non-negative number falls back to the default 5,000.
  describe('F1 — normalizes non-finite / non-numeric maxUrls to the default', () => {
    it('NaN falls back to default 5,000', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const urls = Array.from({ length: 5_010 }, (_, i) => `https://example.com/doc-${i}.pdf`);
      const rows = await indexDocuments(urls, {
        cacheDir,
        fetch: noopFetch,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        maxUrls: NaN as any,
      });
      expect(rows).toHaveLength(5_000);
      const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(combined).toMatch(/exceeds maxUrls cap of 5000; truncating/);
    });

    it('string value falls back to default 5,000', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const urls = Array.from({ length: 5_010 }, (_, i) => `https://example.com/doc-${i}.pdf`);
      const rows = await indexDocuments(urls, {
        cacheDir,
        fetch: noopFetch,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        maxUrls: '10' as any,
      });
      // '10' would have set the cap to 10 (or silently disabled it,
      // depending on coercion) under the pre-1.2.1 bug. Normalized form
      // ignores the non-number and uses 5000.
      expect(rows).toHaveLength(5_000);
      const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(combined).toMatch(/exceeds maxUrls cap of 5000; truncating/);
    });

    it('negative value falls back to default 5,000', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const urls = Array.from({ length: 5_010 }, (_, i) => `https://example.com/doc-${i}.pdf`);
      const rows = await indexDocuments(urls, {
        cacheDir,
        fetch: noopFetch,
        maxUrls: -5,
      });
      // -5 would have used slice(0, -5) under the bug = drop last 5.
      // Normalized falls back to 5000.
      expect(rows).toHaveLength(5_000);
      const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(combined).toMatch(/exceeds maxUrls cap of 5000; truncating/);
    });

    it('floats are floored', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/doc-${i}.pdf`);
      const rows = await indexDocuments(urls, {
        cacheDir,
        fetch: noopFetch,
        maxUrls: 7.9,
      });
      expect(rows).toHaveLength(7); // Math.floor(7.9) = 7
      const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(combined).toMatch(/exceeds maxUrls cap of 7; truncating/);
    });
  });
});
