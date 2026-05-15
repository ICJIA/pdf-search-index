// Walks examples/_fixtures/ for every `.pdf` and writes one markdown
// page per PDF into src/content/docs/. The Astro integration then walks
// that collection, sees the file:// link inside each body, and extracts
// the PDF's text via the localFetch wired into astro.config.ts.
//
// Filename → slug: lowercase, replace any run of non-alphanumerics with
// a single hyphen, trim leading/trailing hyphens. This handles the real
// ICJIA filenames (which contain spaces, underscores, and timestamps).
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesAbs = resolve(here, '..', '..', '_fixtures');
const outDir = resolve(here, '..', 'src', 'content', 'docs');

await mkdir(outDir, { recursive: true });

const entries = (await readdir(fixturesAbs)).filter((e) => e.toLowerCase().endsWith('.pdf'));

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

for (const filename of entries) {
  const stem = parse(filename).name;
  const slug = slugify(stem);
  // Trim any 12+ digit timestamp suffix (e.g. -200203T22022729) so the
  // human-readable title isn't dominated by Drupal URL noise.
  const cleanStem = stem.replace(/-\d{6}T\d{8}$/, '').replace(/-\d{8,}$/, '');
  const title = humanize(cleanStem);
  const url = new URL(`file://${resolve(fixturesAbs, filename)}`).href;
  const md = `---
title: "${title.replace(/"/g, '\\"')}"
---

A random ICJIA-public sample document. The body below links the PDF; the integration walks this body, finds the link, and extracts the PDF's text into the search index.

[${title}](${url})
`;
  await writeFile(resolve(outDir, `${slug}.md`), md);
}
console.log(`Wrote ${entries.length} markdown files referencing ${fixturesAbs}`);
