import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

  const mdPath = join(workDir, 'src/content/resources/example.md');
  const md = await readFile(mdPath, 'utf-8');
  await writeFile(mdPath, md.replace('TEST_PDF_URL', `${baseUrl}/small-text.pdf`));

  await mkdir(join(workDir, 'public'), { recursive: true });
});

afterEach(async () => {
  await new Promise<void>((r) => pdfServer.close(() => r()));
  await rm(workDir, { recursive: true, force: true });
});

/**
 * Helper: invoke the two real Astro hooks in order. Mimics what astro:build
 * would do but doesn't require running a full Astro build.
 */
async function runIntegration(
  integration: ReturnType<typeof pdfSearchIntegration>,
  workDir: string,
): Promise<void> {
  // astro:config:done is called by Astro with the fully-resolved AstroConfig.
  // We only need srcDir and publicDir as URL objects.
  const config = {
    srcDir: pathToFileURL(join(workDir, 'src/')),
    publicDir: pathToFileURL(join(workDir, 'public/')),
    // Astro's AstroConfig is huge; the test only uses what the integration
    // touches. Cast to `never` to bypass strict typing here.
  } as never;
  const onConfigDone = integration.hooks['astro:config:done'];
  if (onConfigDone) await onConfigDone({ config } as never);

  const onBuildStart = integration.hooks['astro:build:start'];
  if (onBuildStart) await onBuildStart({ logger: console } as never);
}

describe('astro integration: real-hook contract', () => {
  it('walks configured collections and emits a JSON index to public/', async () => {
    const integration = pdfSearchIntegration({
      collections: ['resources'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: join(workDir, '.astro/.pdf-cache'),
    });

    await runIntegration(integration, workDir);

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

    await runIntegration(integration, workDir);

    const raw = await readFile(join(workDir, 'public/searchIndex.pdfs.json'), 'utf-8');
    const rows = JSON.parse(raw) as Array<unknown>;
    expect(rows).toHaveLength(1);
  });

  it('returns the AstroIntegration shape (has name and hooks)', () => {
    const integration = pdfSearchIntegration({ collections: [] });
    expect(integration.name).toBe('@icjia/astro-pdf-search-index');
    expect(typeof integration.hooks).toBe('object');
    expect(typeof integration.hooks['astro:config:done']).toBe('function');
    expect(typeof integration.hooks['astro:build:start']).toBe('function');
  });

  it('threads a custom fetch option through to extractPdfsFromBody', async () => {
    const calls: string[] = [];
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      // Delegate to the real fetch so the integration can actually read the PDF.
      return fetch(input, init);
    };

    const integration = pdfSearchIntegration({
      collections: ['resources'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: join(workDir, '.astro/.pdf-cache'),
      fetch: customFetch,
    });

    await runIntegration(integration, workDir);

    expect(calls.some((u) => u.endsWith('.pdf'))).toBe(true);
  });
});
