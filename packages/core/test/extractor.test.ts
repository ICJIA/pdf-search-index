import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractPdfText, extractPdfMetadata } from '../src/extractor.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `pdf-search-extractor-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Helper: create a `fetch` that returns the bytes of a local fixture PDF.
function fixtureFetch(filename: string): typeof fetch {
  return (async () => {
    const buf = await readFile(join(fixturesDir, filename));
    return new Response(buf, { status: 200, headers: { 'content-type': 'application/pdf' } });
  }) as unknown as typeof fetch;
}

describe('extractPdfText', () => {
  it('extracts text from a small text PDF', async () => {
    const text = await extractPdfText('https://example.com/small.pdf', {
      cacheDir,
      fetch: fixtureFetch('small-text.pdf'),
    });
    expect(text.toLowerCase()).toContain('applicant portal');
  });

  it('returns empty string on HTTP non-2xx', async () => {
    const text = await extractPdfText('https://example.com/missing.pdf', {
      cacheDir,
      fetch: (async () => new Response('', { status: 404 })) as unknown as typeof fetch,
    });
    expect(text).toBe('');
  });

  it('returns empty string on fetch network error', async () => {
    const text = await extractPdfText('https://example.com/oops.pdf', {
      cacheDir,
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(text).toBe('');
  });

  it('caches: second call reads from disk without re-fetching', async () => {
    const url = 'https://example.com/cached.pdf';
    let calls = 0;
    const mockFetch = (async () => {
      calls++;
      const buf = await readFile(join(fixturesDir, 'small-text.pdf'));
      return new Response(buf, { status: 200 });
    }) as unknown as typeof fetch;

    await extractPdfText(url, { cacheDir, fetch: mockFetch });
    await extractPdfText(url, { cacheDir, fetch: mockFetch });
    expect(calls).toBe(1);
  });

  it('respects cache: "bypass" (refetch but do not write)', async () => {
    const url = 'https://example.com/bypass.pdf';
    let calls = 0;
    const mockFetch = (async () => {
      calls++;
      const buf = await readFile(join(fixturesDir, 'small-text.pdf'));
      return new Response(buf, { status: 200 });
    }) as unknown as typeof fetch;

    await extractPdfText(url, { cacheDir, fetch: mockFetch });
    await extractPdfText(url, { cacheDir, fetch: mockFetch, cache: 'bypass' });
    expect(calls).toBe(2);
  });

  it('respects cache: "refresh" (refetch and overwrite cache)', async () => {
    const url = 'https://example.com/refresh.pdf';
    let calls = 0;
    const mockFetch = (async () => {
      calls++;
      const buf = await readFile(join(fixturesDir, 'small-text.pdf'));
      return new Response(buf, { status: 200 });
    }) as unknown as typeof fetch;

    await extractPdfText(url, { cacheDir, fetch: mockFetch });
    await extractPdfText(url, { cacheDir, fetch: mockFetch, cache: 'refresh' });
    expect(calls).toBe(2);
  });

  it('returns empty text for an image-only PDF', async () => {
    const text = await extractPdfText('https://example.com/image.pdf', {
      cacheDir,
      fetch: fixtureFetch('image-only.pdf'),
    });
    expect(text.trim()).toBe('');
  });

  it('returns empty text when body exceeds maxBytes', async () => {
    const text = await extractPdfText('https://example.com/huge.pdf', {
      cacheDir,
      maxBytes: 100,
      fetch: fixtureFetch('multi-page.pdf'),
    });
    expect(text).toBe('');
  });
});

describe('extractPdfMetadata', () => {
  it('returns page count for a small PDF', async () => {
    const meta = await extractPdfMetadata('https://example.com/small.pdf', {
      cacheDir,
      fetch: fixtureFetch('small-text.pdf'),
    });
    expect(meta.pages).toBe(1);
  });

  it('returns 3 pages for the multi-page fixture', async () => {
    const meta = await extractPdfMetadata('https://example.com/multi.pdf', {
      cacheDir,
      fetch: fixtureFetch('multi-page.pdf'),
    });
    expect(meta.pages).toBe(3);
  });
});
