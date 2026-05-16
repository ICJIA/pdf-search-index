import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';

export interface CacheEntry {
  url: string;
  length: number;
  pages?: number;
  extractedAt: string;
  /**
   * SHA-256 of the cached text contents. Written in v1.0.2 to detect
   * corruption / TOCTOU races between the `.txt` and `.meta.json` writes.
   * On read, a mismatched hash makes the cache treat the entry as a miss.
   * Older sidecars (v1.0.0 / v1.0.1) lack this field — those reads succeed
   * for backward compatibility.
   */
  contentSha?: string;
}

export interface CachePaths {
  text: string;
  meta: string;
}

// Cache files are scoped to a single user's build pipeline. Group/world
// readability would let other unprivileged users on the host read indexed
// PDF text — which can contain pre-publication content.
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

// Cache filenames are exactly `<16 hex chars>.txt` / `<16 hex chars>.meta.json`.
// `clearCache` validates against this pattern before unlinking, so a
// caller passing an attacker-controlled `cacheDir` can't trick us into
// deleting unrelated files.
const KEY_PATTERN = /^[0-9a-f]{16}$/;

export function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
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
    // If the sidecar carries a contentSha, verify it. A mismatch means a
    // concurrent write or external corruption — treat as a miss.
    if (typeof meta.contentSha === 'string' && contentHash(text) !== meta.contentSha) {
      return null;
    }
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
  await mkdir(cacheDir, { recursive: true, mode: DIR_MODE });
  const paths = cachePaths(cacheDir, url);
  // Build meta with `pages` only if defined -- exactOptionalPropertyTypes in
  // our tsconfig disallows assigning `undefined` to optional properties.
  const meta: CacheEntry = {
    url,
    length: text.length,
    extractedAt: new Date().toISOString(),
    contentSha: contentHash(text),
    ...(opts.pages !== undefined ? { pages: opts.pages } : {}),
  };
  // Atomic-rename pattern: parallel builds can both reach this code path
  // for the same cache key. With a plain `writeFile`, one build could
  // observe a half-written file from the other. Writing to a per-PID temp
  // file and renaming makes the swap atomic on POSIX filesystems.
  const tmpSuffix = `.tmp.${process.pid}.${Math.floor(Math.random() * 1_000_000)}`;
  const tmpText = `${paths.text}${tmpSuffix}`;
  const tmpMeta = `${paths.meta}${tmpSuffix}`;
  try {
    await Promise.all([
      writeFile(tmpText, text, { encoding: 'utf-8', mode: FILE_MODE }),
      writeFile(tmpMeta, JSON.stringify(meta, null, 2), {
        encoding: 'utf-8',
        mode: FILE_MODE,
      }),
    ]);
    // Rename meta last so a reader that races sees the .txt first; if it
    // sees neither file it falls through to miss path. The hash check on
    // read handles the rare interleaving where one was renamed and the
    // other not yet.
    await rename(tmpText, paths.text);
    await rename(tmpMeta, paths.meta);
  } catch (e) {
    // Best-effort cleanup of stale temp files. Swallow unlink errors.
    await Promise.allSettled([unlink(tmpText), unlink(tmpMeta)]);
    throw e;
  }
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

function isCacheFilename(name: string): boolean {
  // Matches only files this package itself writes: <key>.txt or <key>.meta.json
  // where <key> is exactly 16 hex chars. Anything else is left alone.
  if (name.endsWith('.txt')) {
    return KEY_PATTERN.test(name.slice(0, -4));
  }
  if (name.endsWith('.meta.json')) {
    return KEY_PATTERN.test(name.slice(0, -10));
  }
  return false;
}

export async function clearCache(cacheDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(cacheDir);
  } catch {
    return;
  }
  // Strict allowlist: only delete files that match the exact pattern this
  // package writes. Protects against a caller passing a `cacheDir` that
  // happens to point at an unrelated directory.
  const targets = entries.filter((f) => isCacheFilename(f));
  await Promise.allSettled(targets.map((f) => unlink(join(cacheDir, f))));
}
