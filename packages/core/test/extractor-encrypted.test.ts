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
  it('returns empty text and logs only the categorized error tag by default', async () => {
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
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    // I8: full error message (which would disclose that the PDF is
    // encrypted) is suppressed in the default path. Only the categorized
    // tag is logged.
    expect(combined).toMatch(/encrypted PDF/);
    expect(combined).not.toMatch(/PasswordException/);
    // I1: the path component of the URL is scrubbed so internal infra
    // doesn't leak into public CI logs.
    expect(combined).not.toMatch(/locked\.pdf/);
  });

  it('reveals the full error and URL when `debug: true` is passed', async () => {
    vi.doMock('unpdf', () => ({
      getDocumentProxy: async () => {
        throw new Error('PasswordException: No password given');
      },
      extractText: async () => ({ text: '', totalPages: 0 }),
    }));

    const { extractPdfText } = await import('../src/extractor.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchOk = (async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]))) as unknown as typeof fetch;

    await extractPdfText('https://example.com/locked.pdf', {
      cacheDir,
      fetch: fetchOk,
      debug: true,
    });

    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/PasswordException/);
  });
});
