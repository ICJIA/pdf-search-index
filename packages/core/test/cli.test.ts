import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');
const cliBin = resolve(here, '../dist/cli.js');

let tmp: string;
let server: Server;
let baseUrl: string;

async function runCli(
  args: string[],
  cwd: string,
): Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
}> {
  return new Promise((resolveProm) => {
    const child = spawn(process.execPath, [cliBin, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('close', (code) => resolveProm({ stdout, stderr, code }));
  });
}

beforeAll(() => {
  // Build before running CLI tests so dist/cli.js exists.
  execFileSync('pnpm', ['build'], { cwd: resolve(here, '..') });
});

beforeEach(async () => {
  tmp = join(tmpdir(), `pdf-search-cli-${Date.now()}-${Math.random()}`);
  await mkdir(tmp, { recursive: true });

  server = createServer(async (req, res) => {
    const url = req.url ?? '/';

    if (url === '/sitemap.xml') {
      const addr = server.address() as { port: number };
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://127.0.0.1:${addr.port}/small-text.pdf</loc></url>
  <url><loc>http://127.0.0.1:${addr.port}/page-with-pdf</loc></url>
</urlset>`,
      );
      return;
    }

    if (url === '/page-with-pdf') {
      const addr = server.address() as { port: number };
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        `<html><body>See http://127.0.0.1:${addr.port}/multi-page.pdf for details.</body></html>`,
      );
      return;
    }

    const filename = url.replace('/', '');
    try {
      const buf = await readFile(join(fixturesDir, filename));
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(buf);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, () => r()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('bad server addr');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(tmp, { recursive: true, force: true });
});

describe('CLI: positional URLs to JSON', () => {
  it('emits an index JSON for one URL', async () => {
    const { stdout, code } = await runCli([`${baseUrl}/small-text.pdf`], tmp);
    expect(code).toBe(0);
    const rows = JSON.parse(stdout) as Array<{ id: string; url: string; text: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text.toLowerCase()).toContain('applicant portal');
  });
});

describe('CLI: --from <file>', () => {
  it('reads URLs from a newline file', async () => {
    const list = join(tmp, 'urls.txt');
    await writeFile(list, `${baseUrl}/small-text.pdf\n${baseUrl}/multi-page.pdf\n`);
    const { stdout, code } = await runCli(['--from', list], tmp);
    expect(code).toBe(0);
    const rows = JSON.parse(stdout) as Array<unknown>;
    expect(rows).toHaveLength(2);
  });
});

describe('CLI: verify', () => {
  it('exits 0 on a parseable PDF', async () => {
    const { code } = await runCli(['verify', `${baseUrl}/small-text.pdf`], tmp);
    expect(code).toBe(0);
  });

  it('exits 1 on a 404', async () => {
    const { code } = await runCli(['verify', `${baseUrl}/missing.pdf`], tmp);
    expect(code).toBe(1);
  });
});

describe('CLI: --strict', () => {
  it('exits 1 when any URL fails under strict mode', async () => {
    const { code } = await runCli(['--strict', `${baseUrl}/missing.pdf`], tmp);
    expect(code).toBe(1);
  });

  it('exits 0 by default on failure (graceful)', async () => {
    const { code } = await runCli([`${baseUrl}/missing.pdf`], tmp);
    expect(code).toBe(0);
  });
});

describe('CLI: search', () => {
  it('finds a hit in a previously-built index', async () => {
    const out = await runCli([`${baseUrl}/small-text.pdf`], tmp);
    const indexPath = join(tmp, 'index.json');
    await writeFile(indexPath, out.stdout);
    const { stdout, code } = await runCli(['search', indexPath, 'applicant'], tmp);
    expect(code).toBe(0);
    expect(stdout.toLowerCase()).toContain('applicant');
  });
});

describe('CLI: --from-sitemap', () => {
  it('extracts PDFs from a sitemap and its linked pages', async () => {
    const { stdout, code } = await runCli(['--from-sitemap', `${baseUrl}/sitemap.xml`], tmp);
    expect(code).toBe(0);
    const rows = JSON.parse(stdout) as Array<{ url: string }>;
    // small-text.pdf (direct loc) + multi-page.pdf (from page-with-pdf body)
    const urls = rows.map((r) => r.url).sort();
    expect(urls).toEqual([`${baseUrl}/multi-page.pdf`, `${baseUrl}/small-text.pdf`]);
  });
});

describe('CLI: --out <file>', () => {
  it('writes JSON to the file instead of stdout', async () => {
    const outFile = join(tmp, 'index.json');
    const { stdout, code } = await runCli([`${baseUrl}/small-text.pdf`, '--out', outFile], tmp);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('');
    const written = await readFile(outFile, 'utf-8');
    const rows = JSON.parse(written) as Array<{ url: string }>;
    expect(rows).toHaveLength(1);
  });
});

describe('CLI: --ndjson', () => {
  it('emits one JSON object per line', async () => {
    const { stdout, code } = await runCli(
      [`${baseUrl}/small-text.pdf`, `${baseUrl}/multi-page.pdf`, '--ndjson'],
      tmp,
    );
    expect(code).toBe(0);
    const lines = stdout.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('CLI: --text', () => {
  it('emits plain text bodies', async () => {
    const { stdout, code } = await runCli([`${baseUrl}/small-text.pdf`, '--text'], tmp);
    expect(code).toBe(0);
    expect(stdout.toLowerCase()).toContain('applicant portal');
    expect(() => JSON.parse(stdout)).toThrow();
  });
});

describe('CLI: --refresh', () => {
  it('--refresh fetches the PDF even when a cache entry exists', async () => {
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    const { code, stdout } = await runCli(
      [`${baseUrl}/small-text.pdf`, '--cache-dir', tmp, '--refresh'],
      tmp,
    );
    expect(code).toBe(0);
    const rows = JSON.parse(stdout) as Array<{ url: string }>;
    expect(rows).toHaveLength(1);
  });
});

describe('CLI: cache subcommands', () => {
  it('cache ls returns a line for each cached entry', async () => {
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    const { stdout, code } = await runCli(['cache', 'ls', '--cache-dir', tmp], tmp);
    expect(code).toBe(0);
    expect(stdout).toContain(`${baseUrl}/small-text.pdf`);
  });

  it('cache rm removes a single URL', async () => {
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    const remove = await runCli(
      ['cache', 'rm', `${baseUrl}/small-text.pdf`, '--cache-dir', tmp],
      tmp,
    );
    expect(remove.code).toBe(0);
    const ls = await runCli(['cache', 'ls', '--cache-dir', tmp], tmp);
    expect(ls.stdout.trim()).toBe('');
  });

  it('cache clear empties everything', async () => {
    await runCli([`${baseUrl}/small-text.pdf`, '--cache-dir', tmp], tmp);
    await runCli([`${baseUrl}/multi-page.pdf`, '--cache-dir', tmp], tmp);
    const clear = await runCli(['cache', 'clear', '--cache-dir', tmp], tmp);
    expect(clear.code).toBe(0);
    const ls = await runCli(['cache', 'ls', '--cache-dir', tmp], tmp);
    expect(ls.stdout.trim()).toBe('');
  });
});
