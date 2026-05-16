import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export interface CacheEntry {
  url: string;
  length: number;
  pages?: number;
  extractedAt: string;
}

export interface CachePaths {
  text: string;
  meta: string;
}

export function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function cachePaths(cacheDir: string, url: string): CachePaths {
  const key = cacheKey(url);
  return {
    text: join(cacheDir, `${key}.txt`),
    meta: join(cacheDir, `${key}.meta.json`),
  };
}

export interface CacheHit {
  text: string;
  meta: CacheEntry;
}

export async function readCache(cacheDir: string, url: string): Promise<CacheHit | null> {
  const paths = cachePaths(cacheDir, url);
  try {
    const [text, metaRaw] = await Promise.all([
      readFile(paths.text, 'utf-8'),
      readFile(paths.meta, 'utf-8'),
    ]);
    const meta = JSON.parse(metaRaw) as CacheEntry;
    return { text, meta };
  } catch {
    return null;
  }
}

export interface WriteCacheOpts {
  pages?: number;
}

export async function writeCache(
  cacheDir: string,
  url: string,
  text: string,
  opts: WriteCacheOpts = {},
): Promise<CacheEntry> {
  await mkdir(cacheDir, { recursive: true });
  const paths = cachePaths(cacheDir, url);
  // Build meta with `pages` only if defined — exactOptionalPropertyTypes in
  // our tsconfig disallows assigning `undefined` to optional properties.
  const meta: CacheEntry = {
    url,
    length: text.length,
    extractedAt: new Date().toISOString(),
    ...(opts.pages !== undefined ? { pages: opts.pages } : {}),
  };
  await Promise.all([
    writeFile(paths.text, text, 'utf-8'),
    writeFile(paths.meta, JSON.stringify(meta, null, 2), 'utf-8'),
  ]);
  return meta;
}

export async function listCache(cacheDir: string): Promise<CacheEntry[]> {
  let entries: string[];
  try {
    entries = await readdir(cacheDir);
  } catch {
    return [];
  }
  const metaFiles = entries.filter((f) => f.endsWith('.meta.json'));
  const results: CacheEntry[] = [];
  for (const f of metaFiles) {
    try {
      const raw = await readFile(join(cacheDir, f), 'utf-8');
      results.push(JSON.parse(raw) as CacheEntry);
    } catch {
      // skip corrupt sidecar
    }
  }
  return results;
}

export async function removeCache(cacheDir: string, url: string): Promise<void> {
  const paths = cachePaths(cacheDir, url);
  await Promise.allSettled([unlink(paths.text), unlink(paths.meta)]);
}

export async function clearCache(cacheDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(cacheDir);
  } catch {
    return;
  }
  const targets = entries.filter((f) => f.endsWith('.txt') || f.endsWith('.meta.json'));
  await Promise.allSettled(targets.map((f) => unlink(join(cacheDir, f))));
}
