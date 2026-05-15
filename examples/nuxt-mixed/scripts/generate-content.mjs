// Generates Nuxt content markdown that links to the local PDF fixtures.
// Walks examples/_fixtures/ for every .pdf and writes one content/*.md file
// per PDF. The CMS-side mock (server/utils/mockCms.ts) intentionally pulls
// the LAST .pdf alphabetically so the two sources cover different fixtures
// and the dedupe path exercises real overlap if the user adds collisions
// later.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesAbs = resolve(here, '..', '..', '_fixtures');
const outDir = resolve(here, '..', 'content');
await mkdir(outDir, { recursive: true });

const entries = (await readdir(fixturesAbs)).filter((e) => e.toLowerCase().endsWith('.pdf')).sort();

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanize(stem) {
  return stem
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Skip the last fixture — the mock CMS owns it (see server/utils/mockCms.ts).
const contentFixtures = entries.slice(0, -1);

for (const filename of contentFixtures) {
  const stem = parse(filename).name;
  const slug = slugify(stem);
  const cleanStem = stem.replace(/-\d{6}T\d{8}$/, '').replace(/-\d{8,}$/, '');
  const title = humanize(cleanStem);
  const url = new URL(`file://${resolve(fixturesAbs, filename)}`).href;
  const md = `---
title: "${title.replace(/"/g, '\\"')}"
---

A random ICJIA-public sample document. This page lives in @nuxt/content; its body links the PDF, and the search route extracts the linked PDF's text.

[${title}](${url})
`;
  await writeFile(resolve(outDir, `${slug}.md`), md);
}
console.log(`Wrote ${contentFixtures.length} content/*.md files (mock CMS owns the last fixture).`);
