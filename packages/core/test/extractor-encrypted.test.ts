import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `pdf-search-encrypted-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('encrypted PDF handling', () => {
  it('returns empty text and logs a warning when unpdf throws a PasswordException-like error', async () => {
    // Mock unpdf to simulate a password-protected PDF parse failure.
    vi.doMock('unpdf', () => ({
      getDocumentProxy: async () => {
        throw new Error('PasswordException: No password given');
      },
      extractText: async () => ({ text: '', totalPages: 0 }),
    }));

    // Dynamic import AFTER the mock is installed so the module picks up the stub.
    const { extractPdfText } = await import('../src/extractor.js');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchOk = (async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]))) as unknown as typeof fetch;

    const text = await extractPdfText('https://example.com/locked.pdf', {
      cacheDir,
      fetch: fetchOk,
    });

    expect(text).toBe('');
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/PasswordException/);
  });
});
