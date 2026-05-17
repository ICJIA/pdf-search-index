import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractDocumentText, extractDocumentTextWithSource } from '../src/extractor.js';
import { inspectZipUncompressedSize } from '../src/zip-inspector.js';

const FIXTURES = '/Volumes/satechi/webdev/pdf-search-index/examples/_fixtures';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `inflate-bomb-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Build a minimal but valid ZIP archive declaring the given uncompressed
// size in its central directory. The file content is irrelevant for the
// inspector — only the declared size in the CD entry matters. We don't
// need an actually-inflatable archive; we just need the CD bytes to lie
// about the uncompressed size.
//
// ZIP layout we emit:
//   - 1 local file header (PK\x03\x04) + 1 empty stored-method "file"
//   - 1 central directory entry (PK\x01\x02) declaring `uncompSize`
//   - 1 end-of-central-directory record (PK\x05\x06)
function craftedZip(declaredUncompSize: number): Uint8Array {
  const filename = new TextEncoder().encode('a.xml');
  const fnLen = filename.length;

  // Local file header (30 + fnLen bytes). We emit 0 actual data bytes so
  // the body is just the LFH; the CD lies about the uncompressed size.
  const lfh = new Uint8Array(30 + fnLen);
  const lfhView = new DataView(lfh.buffer);
  lfhView.setUint32(0, 0x04034b50, true); // signature
  lfhView.setUint16(4, 20, true); // version needed
  lfhView.setUint16(6, 0, true); // flags
  lfhView.setUint16(8, 0, true); // method = stored
  lfhView.setUint16(10, 0, true); // mod time
  lfhView.setUint16(12, 0, true); // mod date
  lfhView.setUint32(14, 0, true); // CRC32 (zero — invalid but inspector doesn't care)
  lfhView.setUint32(18, 0, true); // compressed size = 0
  lfhView.setUint32(22, 0, true); // uncompressed size = 0 (LFH; CD overrides)
  lfhView.setUint16(26, fnLen, true);
  lfhView.setUint16(28, 0, true); // extra-field length
  lfh.set(filename, 30);

  // Central directory entry (46 + fnLen bytes).
  const cd = new Uint8Array(46 + fnLen);
  const cdView = new DataView(cd.buffer);
  cdView.setUint32(0, 0x02014b50, true); // signature
  cdView.setUint16(4, 20, true);
  cdView.setUint16(6, 20, true);
  cdView.setUint16(8, 0, true);
  cdView.setUint16(10, 0, true);
  cdView.setUint16(12, 0, true);
  cdView.setUint16(14, 0, true);
  cdView.setUint32(16, 0, true); // CRC32
  cdView.setUint32(20, 0, true); // compressed size
  cdView.setUint32(24, declaredUncompSize, true); // **declared uncompressed size** — the attacker-controlled value we're testing
  cdView.setUint16(28, fnLen, true);
  cdView.setUint16(30, 0, true); // extra-field length
  cdView.setUint16(32, 0, true); // comment length
  cdView.setUint16(34, 0, true);
  cdView.setUint16(36, 0, true);
  cdView.setUint32(38, 0, true);
  cdView.setUint32(42, 0, true); // local-header offset
  cd.set(filename, 46);

  // End of central directory (22 bytes, no comment).
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, 1, true); // entries on this disk
  eocdView.setUint16(10, 1, true); // total entries
  eocdView.setUint32(12, cd.length, true); // CD size
  eocdView.setUint32(16, lfh.length, true); // CD offset
  eocdView.setUint16(20, 0, true); // comment length

  // Concatenate.
  const out = new Uint8Array(lfh.length + cd.length + eocd.length);
  out.set(lfh, 0);
  out.set(cd, lfh.length);
  out.set(eocd, lfh.length + cd.length);
  return out;
}

describe('inspectZipUncompressedSize (1.2 inflate-bomb defense)', () => {
  it('returns null for non-ZIP input', () => {
    expect(inspectZipUncompressedSize(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(inspectZipUncompressedSize(new Uint8Array([]))).toBeNull();
    expect(inspectZipUncompressedSize(new Uint8Array([0xff, 0xff, 0xff]))).toBeNull();
  });

  it('reads the declared uncompressed size from a crafted ZIP', () => {
    const bytes = craftedZip(1_500_000_000); // 1.5 GB
    const result = inspectZipUncompressedSize(bytes);
    expect(result).not.toBeNull();
    expect(result?.totalUncompressedBytes).toBe(1_500_000_000);
    expect(result?.entryCount).toBe(1);
  });

  it('returns null on ZIP64 sentinel (conservative pass-through)', () => {
    const bytes = craftedZip(0xffffffff); // ZIP64 sentinel in uncompressed-size field
    expect(inspectZipUncompressedSize(bytes)).toBeNull();
  });

  it('correctly reads the central directory from a real DOCX', async () => {
    const docx = await readFile(`${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`);
    const result = inspectZipUncompressedSize(new Uint8Array(docx));
    expect(result).not.toBeNull();
    // Reasonable real-world bounds for a small agenda document.
    expect(result!.totalUncompressedBytes).toBeGreaterThan(1000);
    expect(result!.totalUncompressedBytes).toBeLessThan(10_000_000);
    expect(result!.entryCount).toBeGreaterThan(0);
  });

  it('correctly reads the central directory from a real XLSX', async () => {
    const xlsx = await readFile(`${FIXTURES}/file_example_XLSX_1000.xlsx`);
    const result = inspectZipUncompressedSize(new Uint8Array(xlsx));
    expect(result).not.toBeNull();
    expect(result!.totalUncompressedBytes).toBeGreaterThan(10_000);
    expect(result!.entryCount).toBeGreaterThan(0);
  });
});

describe('maxInflatedArchiveBytes cap — end-to-end through extractDocumentText', () => {
  // fetch impl that serves a crafted ZIP declaring a huge uncompressed size.
  function fetchCraftedZip(declaredUncompSize: number): typeof fetch {
    return (async () => {
      const bytes = craftedZip(declaredUncompSize);
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch;
  }

  it('rejects an Office archive whose declared uncompressed size exceeds the cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await extractDocumentTextWithSource('https://attacker.example/bomb.docx', {
      cacheDir,
      fetch: fetchCraftedZip(500 * 1024 * 1024), // 500 MB > 100 MB default
    });
    expect(r.source).toBe('failed');
    expect(r.text).toBe('');
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/oversized DOCX archive/);
    expect(combined).toMatch(/maxInflatedArchiveBytes/);
  });

  it('honors a custom maxInflatedArchiveBytes value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await extractDocumentTextWithSource('https://attacker.example/bomb.docx', {
      cacheDir,
      fetch: fetchCraftedZip(20 * 1024 * 1024), // 20 MB exceeds custom 10 MB cap
      maxInflatedArchiveBytes: 10 * 1024 * 1024,
    });
    expect(r.source).toBe('failed');
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/oversized DOCX archive/);
  });

  it('Infinity disables the cap (falls through to officeparser)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await extractDocumentTextWithSource('https://attacker.example/bomb.docx', {
      cacheDir,
      fetch: fetchCraftedZip(500 * 1024 * 1024),
      maxInflatedArchiveBytes: Infinity,
    });
    // Our crafted ZIP isn't actually inflatable (empty body), so officeparser
    // will reject it as malformed — but NOT via our inflate-cap path.
    expect(r.source).toBe('failed');
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).not.toMatch(/oversized DOCX archive/);
  });

  it('real DOCX fixtures continue to extract under the default cap', async () => {
    // Confirms the defense doesn't false-positive on legitimate Office docs.
    const fetchReal: typeof fetch = (async () => {
      const buf = await readFile(`${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`);
      return new Response(buf, { status: 200 });
    }) as unknown as typeof fetch;
    const text = await extractDocumentText(`file://${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`, {
      cacheDir,
      fetch: fetchReal,
    });
    expect(text.length).toBeGreaterThan(500);
  });
});
