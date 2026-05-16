import { indexPdfs } from '@icjia/pdf-search-index';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localFetch } from './local-fetch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', '_fixtures');
const outPath = resolve(here, 'src', '_data', 'searchIndex.json');

const entries = await readdir(fixturesDir);
const urls = entries
  .filter((e) => e.toLowerCase().endsWith('.pdf'))
  .map((e) => new URL(`file://${join(fixturesDir, e)}`).href);

const rows = await indexPdfs(urls, {
  fetch: localFetch,
  cacheDir: resolve(here, '.pdf-cache'),
});

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(rows, null, 2));
console.log(`Wrote ${outPath} (${rows.length} rows)`);
