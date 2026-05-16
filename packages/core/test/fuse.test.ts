import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createFuseIndex } from '../src/fuse.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `pdf-search-fuse-${Date.now()}-${Math.random()}`);
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

describe('createFuseIndex', () => {
  it('returns a Fuse instance that can search PDF content', async () => {
    const fuse = await createFuseIndex({
      urls: ['https://example.com/small.pdf'],
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/small.pdf': 'small-text.pdf' }),
    });
    const results = fuse.search('applicant portal');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.item.title).toBeDefined();
  });

  it('honors fuseOptions overrides (e.g., threshold)', async () => {
    const fuse = await createFuseIndex({
      urls: ['https://example.com/small.pdf'],
      cacheDir,
      fetch: fixtureFetch({ 'https://example.com/small.pdf': 'small-text.pdf' }),
      fuseOptions: { threshold: 0.0 },
    });
    // threshold 0 = exact-ish; a misspelled query should not match.
    const results = fuse.search('applicannnnnt');
    expect(results).toHaveLength(0);
  });
});
