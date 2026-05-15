import { indexPdfs } from '@icjia/pdf-search-index';
import { createFuseIndex } from '@icjia/pdf-search-index/fuse';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localFetch } from './local-fetch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', '_fixtures');

// Collect every .pdf in the fixtures directory and convert to file:// URLs.
async function collectFixtures() {
  const entries = await readdir(fixturesDir);
  return entries
    .filter((e) => e.toLowerCase().endsWith('.pdf'))
    .map((e) => new URL(`file://${join(fixturesDir, e)}`).href);
}

async function main() {
  const writeFlagIdx = process.argv.indexOf('--write');
  const writeTarget = writeFlagIdx !== -1 ? process.argv[writeFlagIdx + 1] : null;

  const urls = await collectFixtures();
  console.log(`Indexing ${urls.length} PDF(s) from ${fixturesDir}…`);

  const rows = await indexPdfs(urls, {
    fetch: localFetch,
    cacheDir: resolve(here, '.pdf-cache'),
  });

  console.log('Indexed rows:');
  for (const r of rows) {
    console.log(`  ${r.title.padEnd(30)} pages=${r.pages ?? '?'} chars=${r.text.length}`);
  }

  if (writeTarget) {
    await mkdir(dirname(resolve(here, writeTarget)), { recursive: true });
    await writeFile(resolve(here, writeTarget), JSON.stringify(rows, null, 2));
    console.log(`\nWrote ${writeTarget}`);
  }

  // Demo a Fuse search using the same rows.
  const fuse = await createFuseIndex({
    urls,
    fetch: localFetch,
    cacheDir: resolve(here, '.pdf-cache'),
  });
  const query =
    process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'applicant';
  const results = fuse.search(query);
  console.log(`\nQuery "${query}" → ${results.length} match(es):`);
  for (const r of results.slice(0, 5)) {
    console.log(`  • ${r.item.title}`);
    console.log(`    ${snippetHTMLFor(r)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
