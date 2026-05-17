// Copies every supported document (PDF, DOCX, PPTX, XLSX) from
// examples/_fixtures/ into public/pdfs/ so the deployed site can serve
// them at `/pdfs/<filename>`. Directory name kept as `pdfs/` for back-
// compat with the existing publicPdfUrl() in Search.vue; in v1.1 it
// holds all four formats. Filenames are kept as-is (the live site will
// URL-encode them automatically when linked).
//
// This runs before the Astro build (and dev). The Astro integration
// reads from `file://` URLs via local-fetch.mjs at build time — that's
// a different read path than the public/ copy that ships to the browser.
//
// Why two URLs for the same document? Build time we need to read from
// disk (file://). Runtime the browser needs a real HTTPS URL
// (/pdfs/...). The filename is the bridge — see `publicPdfUrl()` in
// Search.vue.
import { mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesAbs = resolve(here, '..', '..', '_fixtures');
const outDir = resolve(here, '..', 'public', 'pdfs');

await mkdir(outDir, { recursive: true });

const SUPPORTED = /\.(pdf|docx|pptx|xlsx)$/i;
const entries = (await readdir(fixturesAbs)).filter((e) => SUPPORTED.test(e));

let totalBytes = 0;
const byFormat = new Map();
for (const filename of entries) {
  const src = resolve(fixturesAbs, filename);
  const dst = resolve(outDir, filename);
  await copyFile(src, dst);
  const st = await stat(dst);
  totalBytes += st.size;
  const ext = filename.toLowerCase().match(SUPPORTED)?.[1] ?? '?';
  byFormat.set(ext, (byFormat.get(ext) ?? 0) + 1);
}
const breakdown = [...byFormat.entries()]
  .sort()
  .map(([fmt, n]) => `${n} ${fmt.toUpperCase()}`)
  .join(', ');
console.log(
  `Copied ${entries.length} document(s) into public/pdfs/ (${breakdown}; ${(totalBytes / 1024 / 1024).toFixed(2)} MB total)`,
);
