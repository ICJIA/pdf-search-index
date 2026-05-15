import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { indexPdfs, extractPdfsFromBody } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `pdf-search-index-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function fixtureFetch(map: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const filename = map[url];
    if (!filename) return new Response('', { status: 404 });
    const buf = await readFile(join(fixturesDir, filename));
    return new Response(buf, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('indexPdfs', () => {
  it('produces one IndexedPdf per URL', async () => {
    const rows = await indexPdfs(
      ['https://example.com/small.pdf', 'https://example.com/multi.pdf'],
      {
        cacheDir,
        fetch: fixtureFetch({
          'https://example.com/small.pdf': 'small-text.pdf',
          'https://example.com/multi.pdf': 'multi-page.pdf',
        }),
      },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toMatch(/^pdf-[0-9a-f]{12}$/);
    expect(rows[0]!.url).toBe('https://example.com/small.pdf');
    expect(rows[0]!.text.toLowerCase()).toContain('applicant portal');
    expect(rows[0]!.pages).toBe(1);
    expect(rows[1]!.pages).toBe(3);
  });

  it('honors per-entry explicit title and id', async () => {
    const rows = await indexPdfs(
      [{ url: 'https://example.com/x.pdf', title: 'Custom', id: 'my-id' }],
      {
        cacheDir,
        fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
      },
    );
    expect(rows[0]!.id).toBe('my-id');
    expect(rows[0]!.title).toBe('Custom');
  });

  it('derives title from URL filename when not provided', async () => {
    const rows = await indexPdfs(['https://example.com/r3-faq-2024.pdf'], {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/r3-faq-2024.pdf': 'small-text.pdf' }),
    });
    expect(rows[0]!.title).toBe('R3 Faq 2024');
  });

  it('includes extractedAt on fresh extraction, omits it on cache hit', async () => {
    const url = 'https://example.com/cached.pdf';
    const opts = {
      cacheDir,
      fetch: fixtureFetch({ [url]: 'small-text.pdf' }),
    };
    const first = await indexPdfs([url], opts);
    expect(first[0]!.extractedAt).toBeDefined();

    const second = await indexPdfs([url], opts);
    expect(second[0]!.extractedAt).toBeUndefined();
  });
});

describe('extractPdfsFromBody', () => {
  it('finds linked PDFs in a markdown body and indexes them', async () => {
    const body = `
      # Resources
      - [Annual Report 2024](https://example.com/r3-2024.pdf)
      - [FAQ](https://example.com/faq.pdf)
    `;
    const rows = await extractPdfsFromBody(body, {
      cacheDir,
      fetch: fixtureFetch({
        'https://example.com/r3-2024.pdf': 'small-text.pdf',
        'https://example.com/faq.pdf': 'multi-page.pdf',
      }),
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.title === 'Annual Report 2024')).toBeDefined();
    expect(rows.find((r) => r.title === 'FAQ')).toBeDefined();
  });

  it('returns empty array for a body with no PDF links', async () => {
    expect(await extractPdfsFromBody('Just some prose, no PDFs.')).toEqual([]);
  });
});
