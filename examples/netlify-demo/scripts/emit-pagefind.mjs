// Post-build helper: emit one HTML page per indexed document into
// dist/pagefind-source/, then run the Pagefind CLI to produce the
// chunked search index at dist/_pagefind/.
//
// Ordering: this MUST run AFTER `astro build` has populated
// `dist/searchIndex.pdfs.json`. astro copies `public/` into `dist/`
// during build, so the rows file lands there. We read it from
// `dist/`, write HTML pages alongside, then point pagefind at
// `dist/`.
//
// At consumer runtime the demo loads Pagefind via the standard
// `/_pagefind/pagefind.js` script tag — no manual wiring needed.

import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { emitPagefindHTML } from '@icjia/pdf-search-index/pagefind';

const here = dirname(fileURLToPath(import.meta.url));
const demoRoot = resolve(here, '..');
const distDir = join(demoRoot, 'dist');
const rowsPath = join(distDir, 'searchIndex.pdfs.json');
const outDir = join(distDir, 'pagefind-source');

const raw = await readFile(rowsPath, 'utf-8');
const rows = JSON.parse(raw);

console.log(`Emitting ${rows.length} Pagefind-crawlable HTML pages → ${outDir}`);

const result = await emitPagefindHTML(rows, {
  outDir,
  // C5-style jail: Pagefind output must stay inside dist/.
  publicDirJail: distDir,
});

console.log(
  `Emitted ${result.pagesEmitted} HTML pages (${result.outDirAbs}); ` +
    `running pagefind CLI against ${distDir}...`,
);

// Pagefind CLI: crawl dist/, emit chunked index to dist/_pagefind/.
// The exit code propagates up; if pagefind fails, the build fails.
const code = await new Promise((resolveCode, reject) => {
  const child = spawn('npx', ['pagefind', '--site', distDir, '--output-subdir', '_pagefind'], {
    cwd: demoRoot,
    stdio: 'inherit',
  });
  child.on('error', reject);
  child.on('exit', (c) => resolveCode(c ?? 0));
});

if (code !== 0) {
  console.error(`pagefind CLI exited with code ${code}`);
  process.exit(code);
}

console.log(`Pagefind index built at dist/_pagefind/`);
