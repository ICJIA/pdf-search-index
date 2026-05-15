import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import pdfSearchIntegration from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureProjectSrc = join(here, 'fixture-project');
const corePdfFixtures = resolve(here, '../../core/test/fixtures');

let workDir: string;
let pdfServer: Server;
let baseUrl: string;

beforeEach(async () => {
  workDir = join(tmpdir(), `astro-pdf-search-${Date.now()}-${Math.random()}`);
  await mkdir(workDir, { recursive: true });
  await cp(fixtureProjectSrc, workDir, { recursive: true });

  pdfServer = createServer(async (req, res) => {
    const filename = (req.url ?? '/').replace('/', '');
    try {
      const buf = await readFile(join(corePdfFixtures, filename));
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(buf);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => pdfServer.listen(0, () => r()));
  const addr = pdfServer.address();
  if (!addr || typeof addr === 'string') throw new Error('bad addr');
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Substitute the placeholder PDF URL in the fixture markdown.
  const mdPath = join(workDir, 'src/content/resources/example.md');
  const md = await readFile(mdPath, 'utf-8');
  await writeFile(mdPath, md.replace('TEST_PDF_URL', `${baseUrl}/small-text.pdf`));

  // Ensure public/ exists (the integration writes into it).
  await mkdir(join(workDir, 'public'), { recursive: true });
});

afterEach(async () => {
  await new Promise<void>((r) => pdfServer.close(() => r()));
  await rm(workDir, { recursive: true, force: true });
});

describe('astro integration: build hook', () => {
  it('walks configured collections and emits a JSON index to public/', async () => {
    const integration = pdfSearchIntegration({
      collections: ['resources'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: join(workDir, '.astro/.pdf-cache'),
    });

    await integration.hooks['astro:build:setup']!({
      config: {
        srcDir: { pathname: join(workDir, 'src/') },
        publicDir: { pathname: join(workDir, 'public/') },
      },
    });

    const raw = await readFile(join(workDir, 'public/searchIndex.pdfs.json'), 'utf-8');
    const rows = JSON.parse(raw) as Array<{ url: string; title: string; text: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Annual Report');
    expect(rows[0]!.text.toLowerCase()).toContain('applicant portal');
    expect(rows[0]!.url).toBe(`${baseUrl}/small-text.pdf`);
  });

  it('dedupes across multiple entries linking the same PDF', async () => {
    const secondMd = `---
title: Duplicate Link
---

Same PDF: [Annual Report Again](${baseUrl}/small-text.pdf)`;
    await writeFile(join(workDir, 'src/content/resources/dupe.md'), secondMd);

    const integration = pdfSearchIntegration({
      collections: ['resources'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: join(workDir, '.astro/.pdf-cache'),
    });

    await integration.hooks['astro:build:setup']!({
      config: {
        srcDir: { pathname: join(workDir, 'src/') },
        publicDir: { pathname: join(workDir, 'public/') },
      },
    });

    const raw = await readFile(join(workDir, 'public/searchIndex.pdfs.json'), 'utf-8');
    const rows = JSON.parse(raw) as Array<unknown>;
    expect(rows).toHaveLength(1);
  });
});
