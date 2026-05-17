import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emitPagefindHTML } from '../src/pagefind.js';
import type { IndexedDocument } from '../src/types.js';

const rows: IndexedDocument[] = [
  {
    id: 'pdf-aaa',
    url: 'https://example.com/report.pdf',
    title: 'Annual Report 2024',
    format: 'pdf',
    text: 'Recidivism rates dropped 12% statewide following the 2022 reform.',
    pages: 38,
  },
  {
    id: 'docx-bbb',
    url: 'https://example.com/agenda.docx',
    title: 'Meeting Agenda — January',
    format: 'docx',
    text: 'Roll call. Approval of minutes. Public comment.',
  },
];

let outDir: string;

beforeEach(async () => {
  outDir = join(tmpdir(), `pagefind-emit-${Date.now()}-${Math.random()}`);
  await mkdir(outDir, { recursive: true });
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('emitPagefindHTML', () => {
  it('writes one HTML page per row', async () => {
    const result = await emitPagefindHTML(rows, { outDir });
    expect(result.pagesEmitted).toBe(2);
    expect(result.filenames.sort()).toEqual(['docx-bbb.html', 'pdf-aaa.html']);
    const written = (await readdir(outDir)).sort();
    expect(written).toEqual(['docx-bbb.html', 'pdf-aaa.html']);
  });

  it('emitted pages contain Pagefind-specific markup', async () => {
    await emitPagefindHTML(rows, { outDir });
    const html = await readFile(join(outDir, 'pdf-aaa.html'), 'utf-8');
    // data-pagefind-body attribute tells Pagefind which subtree to crawl
    expect(html).toContain('data-pagefind-body');
    // data-pagefind-filter for the format facet
    expect(html).toContain('data-pagefind-filter="format"');
    // The actual row content
    expect(html).toContain('Annual Report 2024');
    expect(html).toContain('Recidivism');
    expect(html).toContain('PDF');
  });

  it('HTML-escapes adversarial content in title and text', async () => {
    const adversarial: IndexedDocument[] = [
      {
        id: 'pdf-xxx',
        url: 'https://example.com/x.pdf',
        title: '<script>alert(1)</script>',
        format: 'pdf',
        text: 'before </script><script>alert(2)</script> after',
      },
    ];
    await emitPagefindHTML(adversarial, { outDir });
    const html = await readFile(join(outDir, 'pdf-xxx.html'), 'utf-8');
    expect(html).not.toContain('<script>alert(');
    expect(html).toContain('&lt;script&gt;');
  });

  it('enforces publicDirJail when configured', async () => {
    const jail = join(tmpdir(), `jail-${Date.now()}-${Math.random()}`);
    await mkdir(jail, { recursive: true });
    const evilOut = join(tmpdir(), `escape-${Date.now()}-${Math.random()}`);
    await expect(emitPagefindHTML(rows, { outDir: evilOut, publicDirJail: jail })).rejects.toThrow(
      /outside publicDirJail/,
    );
    await rm(jail, { recursive: true, force: true });
  });

  it('allows outDir inside the publicDirJail', async () => {
    const jail = join(tmpdir(), `jail-${Date.now()}-${Math.random()}`);
    const innerOut = join(jail, 'pagefind-source');
    await mkdir(jail, { recursive: true });
    const result = await emitPagefindHTML(rows, {
      outDir: innerOut,
      publicDirJail: jail,
    });
    expect(result.pagesEmitted).toBe(2);
    await rm(jail, { recursive: true, force: true });
  });

  it('returns absolute outDirAbs', async () => {
    const result = await emitPagefindHTML(rows, { outDir });
    expect(result.outDirAbs.startsWith('/')).toBe(true);
  });

  // 6th-audit V13-1: symlink-based jail bypass closure
  it('rejects symlink-based jail escape (V13-1 closure)', async () => {
    const { symlink, mkdir } = await import('node:fs/promises');
    const jail = join(tmpdir(), `jail-${Date.now()}-${Math.random()}`);
    const outside = join(tmpdir(), `outside-${Date.now()}-${Math.random()}`);
    await mkdir(jail, { recursive: true });
    await mkdir(outside, { recursive: true });
    const escapeLink = join(jail, 'escape-link');
    await symlink(outside, escapeLink);
    // outDir is "inside" the jail by string prefix, but the symlink
    // resolves outside. The realpath check (V13-1 fix) should catch
    // this.
    await expect(
      emitPagefindHTML(rows, { outDir: escapeLink, publicDirJail: jail }),
    ).rejects.toThrow(/symlink|outside publicDirJail/);
    await rm(jail, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  // 6th-audit V13-3: format-injection via custom toUpperCase
  it('escapes adversarial row.format that returns HTML (V13-3 closure)', async () => {
    const malicious: IndexedDocument[] = [
      {
        id: 'pdf-zzz',
        url: 'https://example.com/x.pdf',
        title: 'Test',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        format: { toUpperCase: () => 'PDF"><script>alert(1)</script><meta x="' } as any,
        text: 'body',
      },
    ];
    await emitPagefindHTML(malicious, { outDir });
    const html = await readFile(join(outDir, 'pdf-zzz.html'), 'utf-8');
    // The non-string format falls back to 'pdf' → 'PDF' (the runtime
    // type-check defeats the custom toUpperCase). Confirm no
    // script-injection artifact survived.
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toMatch(/<meta x=/);
  });

  // 6th-audit V13-2: baseUrl HTML-escape
  it('escapes adversarial baseUrl (V13-2 closure)', async () => {
    const baseUrl = 'http://x"><script>alert(2)</script><a href="';
    await emitPagefindHTML(rows, { outDir, baseUrl });
    const html = await readFile(join(outDir, 'pdf-aaa.html'), 'utf-8');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;script&gt;');
  });
});
