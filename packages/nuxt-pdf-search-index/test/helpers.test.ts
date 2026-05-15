import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  extractPdfsFromCmsBody,
  extractPdfsFromContentDoc,
} from '../src/runtime/server/helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const corePdfFixtures = resolve(here, '../../core/test/fixtures');

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `nuxt-pdf-search-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function fixtureFetch(map: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const filename = map[url];
    if (!filename) return new Response('', { status: 404 });
    const buf = await readFile(join(corePdfFixtures, filename));
    return new Response(buf, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('extractPdfsFromCmsBody', () => {
  it('finds PDF URLs in a markdown body string', async () => {
    const body = `[Doc](https://example.com/x.pdf) and prose.`;
    const rows = await extractPdfsFromCmsBody(body, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Doc');
  });
});

describe('extractPdfsFromContentDoc', () => {
  it('accepts a doc with `body` field', async () => {
    const doc = { body: `[Doc](https://example.com/x.pdf)` };
    const rows = await extractPdfsFromContentDoc(doc, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
  });

  it('accepts a doc with `_raw` field (some @nuxt/content shapes)', async () => {
    const doc = { _raw: `https://example.com/x.pdf` };
    const rows = await extractPdfsFromContentDoc(doc, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
  });

  it('accepts a raw markdown string directly', async () => {
    const rows = await extractPdfsFromContentDoc(`[Doc](https://example.com/x.pdf)`, {
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/x.pdf': 'small-text.pdf' }),
    });
    expect(rows).toHaveLength(1);
  });

  it('returns empty array when no body field is present', async () => {
    const rows = await extractPdfsFromContentDoc({});
    expect(rows).toEqual([]);
  });
});
