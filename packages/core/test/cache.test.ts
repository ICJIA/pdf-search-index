import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  cacheKey,
  cachePaths,
  readCache,
  writeCache,
  listCache,
  removeCache,
  clearCache,
  type CacheEntry,
} from '../src/cache.js';

let dir: string;

beforeEach(async () => {
  dir = join(tmpdir(), `pdf-search-cache-${Date.now()}-${Math.random()}`);
  await mkdir(dir, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('cacheKey', () => {
  it('returns 16 hex chars from SHA-256(url)', () => {
    const key = cacheKey('https://example.com/foo.pdf');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same URL', () => {
    expect(cacheKey('https://x.pdf')).toBe(cacheKey('https://x.pdf'));
  });

  it('differs for different URLs', () => {
    expect(cacheKey('https://a.pdf')).not.toBe(cacheKey('https://b.pdf'));
  });
});

describe('cachePaths', () => {
  it('returns .txt and .meta.json paths in the cacheDir', () => {
    const paths = cachePaths(dir, 'https://example.com/foo.pdf');
    expect(paths.text.startsWith(dir)).toBe(true);
    expect(paths.meta.startsWith(dir)).toBe(true);
    expect(paths.text.endsWith('.txt')).toBe(true);
    expect(paths.meta.endsWith('.meta.json')).toBe(true);
  });
});

describe('readCache', () => {
  it('returns null when cache miss', async () => {
    expect(await readCache(dir, 'https://miss.pdf')).toBeNull();
  });

  it('returns text + meta on hit', async () => {
    const url = 'https://hit.pdf';
    const entry: CacheEntry = {
      url,
      length: 5,
      pages: 1,
      extractedAt: '2026-05-15T00:00:00.000Z',
    };
    const paths = cachePaths(dir, url);
    await writeFile(paths.text, 'hello', 'utf-8');
    await writeFile(paths.meta, JSON.stringify(entry), 'utf-8');

    const got = await readCache(dir, url);
    expect(got).toEqual({ text: 'hello', meta: entry });
  });

  it('returns null when only text exists (meta missing)', async () => {
    const url = 'https://partial.pdf';
    const paths = cachePaths(dir, url);
    await writeFile(paths.text, 'hello', 'utf-8');
    expect(await readCache(dir, url)).toBeNull();
  });
});

describe('writeCache', () => {
  it('creates directory and writes both files', async () => {
    const url = 'https://write.pdf';
    await writeCache(dir, url, 'body text', { pages: 2 });
    const paths = cachePaths(dir, url);
    expect(existsSync(paths.text)).toBe(true);
    expect(existsSync(paths.meta)).toBe(true);
    expect(await readFile(paths.text, 'utf-8')).toBe('body text');
    const meta = JSON.parse(await readFile(paths.meta, 'utf-8')) as CacheEntry;
    expect(meta.url).toBe(url);
    expect(meta.length).toBe('body text'.length);
    expect(meta.pages).toBe(2);
    expect(typeof meta.extractedAt).toBe('string');
  });
});

describe('listCache', () => {
  it('returns empty array for empty cache', async () => {
    expect(await listCache(dir)).toEqual([]);
  });

  it('returns one entry per cached PDF', async () => {
    await writeCache(dir, 'https://a.pdf', 'a', { pages: 1 });
    await writeCache(dir, 'https://b.pdf', 'bb', { pages: 2 });
    const list = await listCache(dir);
    expect(list).toHaveLength(2);
    const urls = list.map((e) => e.url).sort();
    expect(urls).toEqual(['https://a.pdf', 'https://b.pdf']);
  });
});

describe('removeCache', () => {
  it('removes both files for a URL', async () => {
    const url = 'https://remove.pdf';
    await writeCache(dir, url, 'x', { pages: 1 });
    await removeCache(dir, url);
    const paths = cachePaths(dir, url);
    expect(existsSync(paths.text)).toBe(false);
    expect(existsSync(paths.meta)).toBe(false);
  });

  it('does not throw on a URL that was never cached', async () => {
    await expect(removeCache(dir, 'https://nothing.pdf')).resolves.toBeUndefined();
  });
});

describe('clearCache', () => {
  it('removes all .txt and .meta.json files', async () => {
    await writeCache(dir, 'https://a.pdf', 'a', { pages: 1 });
    await writeCache(dir, 'https://b.pdf', 'b', { pages: 1 });
    await clearCache(dir);
    expect(await listCache(dir)).toEqual([]);
  });
});
