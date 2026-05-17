import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectFormatFromUrl,
  detectFormatFamilyFromBytes,
  extractDocumentText,
  extractDocumentTextWithSource,
  extractDocumentMetadata,
  categorizeParseError,
} from '../src/extractor.js';
import { indexDocuments, extractDocumentsFromBody } from '../src/index.js';
import { extractDocumentUrlsFromMarkdown } from '../src/url-scan.js';

const FIXTURES = '/Volumes/satechi/webdev/pdf-search-index/examples/_fixtures';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = join(tmpdir(), `multi-format-${Date.now()}-${Math.random()}`);
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Helper: fetch impl that resolves file:// URLs against the real
// ICJIA-public fixture set. Mirrors the netlify-demo's localFetch.
const fixtureFetch: typeof fetch = (async (input: Parameters<typeof fetch>[0]) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const path = url.replace(/^file:\/\//, '');
    const buf = await readFile(path);
    return new Response(buf, {
      status: 200,
      headers: { 'content-length': String(buf.length) },
    });
  }
  throw new Error(`fixtureFetch: unexpected URL ${url}`);
}) as unknown as typeof fetch;

// ---------------------------------------------------------------------
// Format detection (URL extension + magic-byte sniff)
// ---------------------------------------------------------------------

describe('detectFormatFromUrl', () => {
  it('detects every supported format from extension', () => {
    expect(detectFormatFromUrl('https://example.com/report.pdf')).toBe('pdf');
    expect(detectFormatFromUrl('https://example.com/policy.docx')).toBe('docx');
    expect(detectFormatFromUrl('https://example.com/deck.pptx')).toBe('pptx');
    expect(detectFormatFromUrl('https://example.com/budget.xlsx')).toBe('xlsx');
  });

  it('is case-insensitive', () => {
    expect(detectFormatFromUrl('https://example.com/REPORT.PDF')).toBe('pdf');
    expect(detectFormatFromUrl('https://example.com/Policy.DocX')).toBe('docx');
  });

  it('strips query and fragment before matching', () => {
    expect(detectFormatFromUrl('https://example.com/r.pdf?v=2#page=3')).toBe('pdf');
    expect(detectFormatFromUrl('https://example.com/r.docx?download=1')).toBe('docx');
  });

  it('returns null for unrecognized extensions', () => {
    expect(detectFormatFromUrl('https://example.com/page.html')).toBeNull();
    expect(detectFormatFromUrl('https://example.com/no-extension')).toBeNull();
    expect(detectFormatFromUrl('https://example.com/file.txt')).toBeNull();
  });
});

describe('detectFormatFamilyFromBytes', () => {
  it('recognizes PDF magic bytes', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(detectFormatFamilyFromBytes(pdf)).toBe('pdf');
  });

  it('recognizes ZIP magic bytes (Office formats)', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(detectFormatFamilyFromBytes(zip)).toBe('office');
    // Empty-archive variant
    expect(detectFormatFamilyFromBytes(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe('office');
  });

  it('returns null for unrecognized bytes', () => {
    expect(detectFormatFamilyFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull(); // JPEG
    expect(detectFormatFamilyFromBytes(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBeNull();
    expect(detectFormatFamilyFromBytes(new Uint8Array([]))).toBeNull();
  });
});

// ---------------------------------------------------------------------
// End-to-end multi-format extraction against real ICJIA fixtures
// ---------------------------------------------------------------------

describe('extractDocumentText (auto-detect format)', () => {
  it('extracts text from a DOCX fixture (DVFRC Agenda)', async () => {
    const text = await extractDocumentText(`file://${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`, {
      cacheDir,
      fetch: fixtureFetch,
    });
    expect(text.length).toBeGreaterThan(500);
    expect(text).toMatch(/Illinois Domestic Violence Fatality Review Committee/i);
  });

  it('extracts text from a DOCX fixture (Community-Based Corrections)', async () => {
    const text = await extractDocumentText(
      `file://${FIXTURES}/Community-Based Corrections Task Force 4-22 Agenda.docx`,
      { cacheDir, fetch: fixtureFetch },
    );
    expect(text.length).toBeGreaterThan(500);
    expect(text).toMatch(/Community-Based Corrections Task Force/i);
  });

  it('extracts text from an XLSX fixture (1000-row spreadsheet)', async () => {
    const text = await extractDocumentText(`file://${FIXTURES}/file_example_XLSX_1000.xlsx`, {
      cacheDir,
      fetch: fixtureFetch,
    });
    expect(text.length).toBeGreaterThan(10_000);
    // Spreadsheet has known column headers; verify at least one of them
    // survived the extraction.
    expect(text).toMatch(/First Name/i);
  });

  it('extracts text from a PDF fixture (back-compat path)', async () => {
    const text = await extractDocumentText(
      `file://${FIXTURES}/Drug Testing Lit Review-200203T22022729.pdf`,
      { cacheDir, fetch: fixtureFetch },
    );
    expect(text.length).toBeGreaterThan(5_000);
    expect(text).toMatch(/drug testing/i);
  });
});

describe('extractDocumentTextWithSource (returns format)', () => {
  it('populates format on every result', async () => {
    const docx = await extractDocumentTextWithSource(
      `file://${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`,
      { cacheDir, fetch: fixtureFetch },
    );
    expect(docx.format).toBe('docx');
    expect(docx.source).toBe('fresh');

    const xlsx = await extractDocumentTextWithSource(
      `file://${FIXTURES}/file_example_XLSX_1000.xlsx`,
      { cacheDir, fetch: fixtureFetch },
    );
    expect(xlsx.format).toBe('xlsx');
  });

  it('honors options.format override for extensionless URLs', async () => {
    // Pretend a CMS attachment URL has no .docx suffix.
    const customUrl = `file://${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`;
    const r = await extractDocumentTextWithSource(customUrl, {
      cacheDir,
      fetch: fixtureFetch,
      format: 'docx',
    });
    expect(r.format).toBe('docx');
    expect(r.text.length).toBeGreaterThan(500);
  });
});

describe('extractDocumentMetadata', () => {
  it('returns format for non-PDF documents', async () => {
    const meta = await extractDocumentMetadata(`file://${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`, {
      cacheDir,
      fetch: fixtureFetch,
    });
    expect(meta.format).toBe('docx');
    // DOCX has no native page concept
    expect(meta.pages).toBe(0);
  });

  it('returns format=pdf and page count for PDFs', async () => {
    const meta = await extractDocumentMetadata(
      `file://${FIXTURES}/Drug Testing Lit Review-200203T22022729.pdf`,
      { cacheDir, fetch: fixtureFetch },
    );
    expect(meta.format).toBe('pdf');
    expect(meta.pages).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
// indexDocuments — mixed-format URL list (the headline 1.1 feature)
// ---------------------------------------------------------------------

describe('indexDocuments (mixed-format URL list)', () => {
  it('indexes PDF + DOCX + XLSX in a single call, populates format discriminator', async () => {
    const rows = await indexDocuments(
      [
        `file://${FIXTURES}/Drug Testing Lit Review-200203T22022729.pdf`,
        `file://${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`,
        `file://${FIXTURES}/Community-Based Corrections Task Force 4-22 Agenda.docx`,
        `file://${FIXTURES}/file_example_XLSX_1000.xlsx`,
      ],
      { cacheDir, fetch: fixtureFetch },
    );
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.format).sort()).toEqual(['docx', 'docx', 'pdf', 'xlsx']);
    // Every row has non-empty text.
    for (const r of rows) {
      expect(r.text.length).toBeGreaterThan(100);
    }
    // IDs use the format prefix.
    expect(rows.find((r) => r.format === 'pdf')?.id).toMatch(/^pdf-/);
    expect(rows.find((r) => r.format === 'docx')?.id).toMatch(/^docx-/);
    expect(rows.find((r) => r.format === 'xlsx')?.id).toMatch(/^xlsx-/);
  });

  it('dedupes by URL across mixed formats', async () => {
    const u = `file://${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`;
    const rows = await indexDocuments([u, u, u], { cacheDir, fetch: fixtureFetch });
    expect(rows).toHaveLength(1);
  });
});

describe('extractDocumentsFromBody', () => {
  it('picks up PDF + DOCX + PPTX + XLSX URLs from markdown', async () => {
    const body = `
# Agenda

See [the report](https://example.com/report.pdf) and
[the policy](https://example.com/policy.docx).

Also: https://example.com/deck.pptx

| File | Link |
|------|------|
| Budget | https://example.com/budget.xlsx |
`;
    const discovered = extractDocumentUrlsFromMarkdown(body);
    expect(discovered).toHaveLength(4);
    const byFormat = new Map(discovered.map((d) => [d.format, d.url]));
    expect(byFormat.get('pdf')).toBe('https://example.com/report.pdf');
    expect(byFormat.get('docx')).toBe('https://example.com/policy.docx');
    expect(byFormat.get('pptx')).toBe('https://example.com/deck.pptx');
    expect(byFormat.get('xlsx')).toBe('https://example.com/budget.xlsx');
  });

  it('end-to-end: scans markdown, fetches mixed-format docs, returns IndexedDocument[]', async () => {
    // URL-encode fixture filenames that contain spaces. Markdown URL
    // regex excludes whitespace from the URL run.
    const docxUrl = `file://${FIXTURES}/DVFRC%20Agenda%20-%205.12.2026.docx`;
    const pdfUrl = `file://${FIXTURES}/Drug%20Testing%20Lit%20Review-200203T22022729.pdf`;
    const body = `
See [agenda](${docxUrl}) and
[the literature review](${pdfUrl}).
`;
    // Custom fetch unwraps the percent-encoding before reading from disk.
    const encodedFetch: typeof fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input.toString();
      const decoded = decodeURIComponent(url.replace(/^file:\/\//, ''));
      const buf = await readFile(decoded);
      return new Response(buf, { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await extractDocumentsFromBody(body, { cacheDir, fetch: encodedFetch });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.format).sort()).toEqual(['docx', 'pdf']);
  });
});

// ---------------------------------------------------------------------
// New security defenses: format-mismatch + Office error categorization
// ---------------------------------------------------------------------

describe('format-mismatch defense', () => {
  it('rejects PDF magic bytes served at a .docx URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Fetch impl serves PDF bytes for a .docx URL — the attack scenario.
    const fakePdfForDocx: typeof fetch = (async () => {
      const pdfBytes = await readFile(`${FIXTURES}/Drug Testing Lit Review-200203T22022729.pdf`);
      return new Response(pdfBytes, { status: 200 });
    }) as unknown as typeof fetch;
    const result = await extractDocumentTextWithSource('https://attacker.example.com/poison.docx', {
      cacheDir,
      fetch: fakePdfForDocx,
    });
    expect(result.source).toBe('failed');
    expect(result.text).toBe('');
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/DOCX format mismatch/);
    expect(combined).toMatch(/bytes are PDF/);
  });

  it('rejects ZIP/Office magic bytes served at a .pdf URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeOfficeForPdf: typeof fetch = (async () => {
      const docxBytes = await readFile(`${FIXTURES}/DVFRC Agenda - 5.12.2026.docx`);
      return new Response(docxBytes, { status: 200 });
    }) as unknown as typeof fetch;
    const result = await extractDocumentTextWithSource('https://attacker.example.com/poison.pdf', {
      cacheDir,
      fetch: fakeOfficeForPdf,
    });
    expect(result.source).toBe('failed');
    const combined = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(combined).toMatch(/PDF format mismatch/);
    expect(combined).toMatch(/bytes are Office/);
  });
});

describe('categorizeParseError (multi-format)', () => {
  it('keeps the PDF defaults for back-compat (format param defaults to "pdf")', () => {
    expect(categorizeParseError('password required')).toBe('encrypted PDF');
    expect(categorizeParseError('xref offset')).toBe('corrupt PDF structure');
    expect(categorizeParseError('font glyph error')).toBe('PDF font error');
    expect(categorizeParseError('something else')).toBe('PDF parse error');
  });

  it('categorizes DOCX / PPTX / XLSX errors per format', () => {
    expect(categorizeParseError('password protected', 'docx')).toBe('encrypted DOCX document');
    expect(categorizeParseError('zip entry truncated', 'pptx')).toBe('corrupt PPTX structure');
    expect(categorizeParseError('malformed entry', 'xlsx')).toBe('corrupt XLSX structure');
    expect(categorizeParseError('unsupported format', 'docx')).toBe('DOCX format mismatch');
    expect(categorizeParseError('something else', 'docx')).toBe('DOCX parse error');
  });
});
