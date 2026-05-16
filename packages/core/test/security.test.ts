import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractPdfText, scrubUrl, safeJSONForHTML } from '../src/index.js';
import { extractPdfUrlsFromMarkdown } from '../src/url-scan.js';
import { writeCache, readCache, clearCache, cachePaths } from '../src/cache.js';
import { safeCacheDir } from '../src/mcp.js';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `pdf-search-security-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  // vi.doMock leaves a module-level mock registration that survives
  // vi.resetModules; clear it explicitly so later tests in this file
  // import the real unpdf.
  vi.doUnmock('unpdf');
  vi.resetModules();
});

// ----- C1 ----------------------------------------------------------------
// ReDoS in url-scan regex. The pre-1.0.2 patterns used `[^\s)]+?` which
// backtracked quadratically on `'[X](https://a'.repeat(N)`. The bounded
// greedy replacement should complete in linear time.

describe('C1: ReDoS in extractPdfUrlsFromMarkdown', () => {
  it('handles a long hostile payload in under 200ms', () => {
    // 20_000 repetitions = ~260KB of `[X](https://a...`. Pre-fix this
    // burned ~10s+; the bounded regex makes it linear.
    const hostile = '[X](https://a'.repeat(20_000);
    const t0 = performance.now();
    const out = extractPdfUrlsFromMarkdown(hostile);
    const elapsed = performance.now() - t0;
    expect(out).toEqual([]);
    expect(elapsed).toBeLessThan(200);
  });

  it('skips bodies above the 1 MB scan cap with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 1_000_001 chars triggers the body-length guard.
    const oversize = 'a'.repeat(1_000_001);
    const out = extractPdfUrlsFromMarkdown(oversize);
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/body length/);
  });

  it('still matches valid PDF links after the bounded-regex change', () => {
    const body = `Click [Annual Report](https://example.com/r3-2024.pdf?v=2) for details.`;
    expect(extractPdfUrlsFromMarkdown(body)).toEqual([
      { url: 'https://example.com/r3-2024.pdf?v=2', title: 'Annual Report' },
    ]);
  });
});

// ----- C3 ----------------------------------------------------------------
// Body size limit was applied after the entire buffer was read. The fix
// (a) rejects on declared Content-Length, (b) streams the body and aborts
// when the running total exceeds maxBytes.

describe('C3: streaming body size enforcement', () => {
  it('rejects responses whose Content-Length exceeds maxBytes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Buffered response (no stream). The body is a small array but the
    // declared Content-Length lies about a much larger size — the
    // implementation should bail on the declared length and never even
    // dispatch a parse.
    const tinyBody = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    let parseAttempts = 0;
    vi.doMock('unpdf', () => ({
      getDocumentProxy: async () => {
        parseAttempts++;
        return { getMetadata: async () => ({ info: {} }) };
      },
      extractText: async () => ({ text: 'should not get here', totalPages: 1 }),
    }));
    const { extractPdfText: rebound } = await import('../src/extractor.js');

    const fetchImpl: typeof fetch = (async () =>
      new Response(tinyBody, {
        status: 200,
        headers: { 'content-length': '999999999' },
      })) as unknown as typeof fetch;

    const text = await rebound('https://example.com/huge.pdf', {
      cacheDir,
      fetch: fetchImpl,
      maxBytes: 1024,
    });
    expect(text).toBe('');
    expect(parseAttempts).toBe(0);
    expect(warn).toHaveBeenCalled();
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/content-length .* exceeds maxBytes/);
  });

  it('aborts streaming download once running total exceeds maxBytes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Stream that emits 1 MB chunks forever. With maxBytes = 2 MB we
    // should abort by the 3rd chunk.
    let chunks = 0;
    const fetchImpl: typeof fetch = (async () => {
      const stream = new ReadableStream({
        pull(controller) {
          chunks++;
          if (chunks > 10) {
            // Defensive: tests should never reach here. If they do,
            // close the stream so the test can fail cleanly.
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(1_000_000));
        },
      });
      // No Content-Length header so the stream path runs.
      return new Response(stream, { status: 200 });
    }) as unknown as typeof fetch;

    const text = await extractPdfText('https://example.com/stream.pdf', {
      cacheDir,
      fetch: fetchImpl,
      maxBytes: 2_000_000,
    });
    expect(text).toBe('');
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/exceeds maxBytes/);
    // We should have stopped pulling around 3 chunks, well below the
    // defensive cap.
    expect(chunks).toBeLessThanOrEqual(4);
  });

  it('default maxBytes is 32 MB (lowered from 100 MB in 1.0.2)', async () => {
    // Streams a 33 MB body with no Content-Length so the streaming path
    // runs. With the new 32 MB default, this should fail.
    let chunks = 0;
    const fetchImpl: typeof fetch = (async () => {
      const stream = new ReadableStream({
        pull(controller) {
          chunks++;
          if (chunks > 33) {
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(1_000_000));
        },
      });
      return new Response(stream, { status: 200 });
    }) as unknown as typeof fetch;

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = await extractPdfText('https://example.com/big.pdf', {
      cacheDir,
      fetch: fetchImpl,
      // maxBytes intentionally omitted -> default 32 MB applies
    });
    expect(text).toBe('');
    expect(warn).toHaveBeenCalled();
  });
});

// ----- I3 ----------------------------------------------------------------
// Extracted text length cap (compression-bomb defense).

describe('I3: maxExtractedTextChars cap', () => {
  it('truncates extracted text above the cap and logs a warning', async () => {
    // Mock unpdf to return a giant text body without needing a real
    // compression-bomb PDF fixture.
    const bombText = 'a'.repeat(10_000_000); // 10 MB
    vi.doMock('unpdf', () => ({
      getDocumentProxy: async () => ({
        getMetadata: async () => ({ info: {} }),
      }),
      extractText: async () => ({ text: bombText, totalPages: 1 }),
    }));

    const { extractPdfText } = await import('../src/extractor.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchOk = (async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]))) as unknown as typeof fetch;

    const text = await extractPdfText('https://example.com/bomb.pdf', {
      cacheDir,
      fetch: fetchOk,
      maxExtractedTextChars: 5_000_000,
    });

    expect(text.length).toBe(5_000_000);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/exceeds cap/);
  });
});

// ----- I1 / M3 -----------------------------------------------------------
// URL log scrubbing + control-character sanitization.

describe('I1 / M3: scrubUrl drops path/query and strips control chars', () => {
  it('returns origin only for a normal URL', () => {
    expect(scrubUrl('https://internal.example.com/secret/path?token=abc#x')).toBe(
      'https://internal.example.com',
    );
  });

  it('returns [invalid-url] for unparseable input', () => {
    expect(scrubUrl('not a url')).toBe('[invalid-url]');
  });

  it('omits the path from failure logs by default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl: typeof fetch = (async () =>
      new Response('', { status: 404 })) as unknown as typeof fetch;
    await extractPdfText('https://example.com/internal/secret-document.pdf', {
      cacheDir,
      fetch: fetchImpl,
    });
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/https:\/\/example\.com/);
    expect(combined).not.toMatch(/secret-document\.pdf/);
    expect(combined).not.toMatch(/internal\/secret/);
  });

  it('M3 explicit: strips ASCII control chars from error messages before logging', async () => {
    // Defense: ANSI red sequence + bell + NUL in an error message would
    // otherwise survive into terminal output and (a) repaint the operator's
    // terminal, (b) inject CRLF into log-parsing pipelines, or (c) hide
    // characters behind backspace bytes (\x08).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Five raw control bytes between two readable runs. Each one should
    // emerge as a literal `?` in the log — letters around them survive.
    const hostile = 'connection failed\x00\x01\x07\x08\rsensitive-data';
    const fetchImpl: typeof fetch = (async () => {
      throw new Error(hostile);
    }) as unknown as typeof fetch;
    await extractPdfText('https://example.com/some.pdf', {
      cacheDir,
      fetch: fetchImpl,
    });
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    // The warning fired (fetch threw, so we should see a fetch-error log).
    expect(combined).toMatch(/fetch error/);
    // The control bytes were replaced with `?` — no \x00-\x1f or \x7f survive.
    expect(combined).not.toMatch(/[\x00-\x1f\x7f]/);
    // Sanity: the surrounding non-control text DID make it through (proves
    // we're not just dropping the whole message), and each of the 5 control
    // bytes became exactly one `?`.
    expect(combined).toMatch(/connection failed\?{5}sensitive-data/);
  });
});

// ----- I4 ----------------------------------------------------------------
// safeJSONForHTML — defangs `</script>` and U+2028/U+2029 for safe HTML
// inline embedding.

describe('I4: safeJSONForHTML', () => {
  it('escapes `<` so `</script>` cannot break out of a <script> embedding', () => {
    const out = safeJSONForHTML({ text: 'before </script><script>alert(1)</script> after' });
    expect(out).not.toMatch(/<\/script>/i);
    expect(out).toContain('\\u003c');
  });

  it('escapes U+2028 and U+2029 line separators', () => {
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    const out = safeJSONForHTML({ text: `LS${LS} PS${PS} end` });
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('round-trips back to the original via JSON.parse', () => {
    const original = { url: 'https://x', text: '</script>\n' + String.fromCharCode(0x2028) };
    const out = safeJSONForHTML(original);
    expect(JSON.parse(out)).toEqual(original);
  });
});

// ----- I7 + M2 -----------------------------------------------------------
// Atomic cache write + contentSha + restrictive file modes.

describe('I7: cache writes are atomic and content-hashed', () => {
  it('writes both files with mode 0o600', async () => {
    await writeCache(cacheDir, 'https://example.com/a.pdf', 'hello world', { pages: 1 });
    const paths = cachePaths(cacheDir, 'https://example.com/a.pdf');
    const textStat = await stat(paths.text);
    const metaStat = await stat(paths.meta);
    // mode & 0o077 should be zero -- no group/other access
    expect(textStat.mode & 0o077).toBe(0);
    expect(metaStat.mode & 0o077).toBe(0);
  });

  it('records contentSha on write', async () => {
    await writeCache(cacheDir, 'https://example.com/b.pdf', 'some text', { pages: 1 });
    const paths = cachePaths(cacheDir, 'https://example.com/b.pdf');
    const meta = JSON.parse(await readFile(paths.meta, 'utf-8')) as {
      contentSha?: string;
    };
    expect(meta.contentSha).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats a sidecar/text mismatch as a cache miss', async () => {
    const url = 'https://example.com/c.pdf';
    await writeCache(cacheDir, url, 'original text', { pages: 1 });
    const paths = cachePaths(cacheDir, url);
    // Corrupt the text file without updating the sidecar's hash.
    await writeFile(paths.text, 'tampered text', 'utf-8');
    const hit = await readCache(cacheDir, url);
    expect(hit).toBeNull();
  });

  it('never returns a corrupt (mismatched-hash) hit under concurrent writes', async () => {
    const url = 'https://example.com/race.pdf';
    // 10 racing writers. The post-state is non-deterministic: it can be
    // (a) any one writer's exact (text, meta) pair on disk, or (b) an
    // interleaved pair where the on-disk text doesn't match the sidecar's
    // hash. In case (b) the contentSha check turns the read into a miss
    // rather than returning corrupt data to the caller.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        writeCache(cacheDir, url, `body-${i}-` + 'x'.repeat(1000), { pages: i }),
      ),
    );
    const hit = await readCache(cacheDir, url);
    // A null hit (mismatched state recovered as miss) is acceptable. A
    // non-null hit must be one of the 10 valid bodies, not a mix.
    if (hit !== null) {
      expect(hit.text).toMatch(/^body-\d-x+$/);
    }
  });
});

// ----- C4 ----------------------------------------------------------------
// MCP `cacheDir` jail.

describe('C4: safeCacheDir jail', () => {
  it('rejects an absolute path outside the safe base', () => {
    expect(() => safeCacheDir('/etc/passwd')).toThrow(/cacheDir must stay within/);
  });

  it('rejects a relative path that escapes the safe base', () => {
    expect(() => safeCacheDir('../../../tmp/escape')).toThrow(/cacheDir must stay within/);
  });

  it('accepts a relative subdir under the safe base', () => {
    const out = safeCacheDir('session-123');
    expect(out.endsWith('/pdf-search-index-mcp/session-123')).toBe(true);
  });

  it('returns the safe base for empty / non-string input', () => {
    const base = safeCacheDir(undefined);
    expect(base).toMatch(/pdf-search-index-mcp$/);
    expect(safeCacheDir('')).toBe(base);
    expect(safeCacheDir(42)).toBe(base);
  });
});

describe('clearCache: allowlist only deletes cache-pattern filenames', () => {
  it('leaves unrelated files alone', async () => {
    // Write a real cache entry, then a non-cache file in the same dir.
    await writeCache(cacheDir, 'https://x.pdf', 'hi', { pages: 1 });
    const decoyPath = join(cacheDir, 'important-user-data.txt');
    await writeFile(decoyPath, 'do not delete', 'utf-8');
    await clearCache(cacheDir);
    // Cache file gone; decoy preserved.
    expect(existsSync(decoyPath)).toBe(true);
    expect(await readFile(decoyPath, 'utf-8')).toBe('do not delete');
  });
});

// ----- I8 ----------------------------------------------------------------
// Categorized parse-error logging is covered in
// `extractor-encrypted.test.ts`. We add a corruption-categorization
// check here.

describe('I8: categorized parse-error logging', () => {
  it('categorizes xref/structure errors as "corrupt PDF structure"', async () => {
    vi.doMock('unpdf', () => ({
      getDocumentProxy: async () => {
        throw new Error('Bad xref entry at offset 0');
      },
      extractText: async () => ({ text: '', totalPages: 0 }),
    }));

    const { extractPdfText } = await import('../src/extractor.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchOk = (async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]))) as unknown as typeof fetch;

    await extractPdfText('https://example.com/corrupt.pdf', {
      cacheDir,
      fetch: fetchOk,
    });
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/corrupt PDF structure/);
    expect(combined).not.toMatch(/xref/);
  });
});
