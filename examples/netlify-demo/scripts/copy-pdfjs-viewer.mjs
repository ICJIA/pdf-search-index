// Vendors Mozilla's pdf.js viewer into `public/pdfjs-viewer/` so the deployed
// site can route result clicks through it. The point: cross-browser, reliable
// in-PDF highlighting via the viewer's `#search=<query>` URL fragment.
//
// Chrome/Edge (PDFium) silently ignore `#search=` in the browser-native PDF
// viewer; Firefox honors it (its built-in viewer *is* pdf.js); Safari is
// inconsistent. Bundling Mozilla's viewer ourselves gives uniform behaviour.
//
// Why fetch from a GitHub Release rather than read out of pdfjs-dist:
// pdfjs-dist on npm v4+ ships only `pdf_viewer.mjs` (the *embed* component
// for custom integrations) — it does NOT include the full standalone viewer
// (`viewer.html` + its assets). That UI ships separately as the
// `pdfjs-<version>-dist.zip` release artifact at github.com/mozilla/pdf.js.
// We use the version pinned by pdfjs-dist's package.json so the worker/
// runtime that the viewer imports matches the npm dep, and so a bump of
// pdfjs-dist in package.json automatically picks up a matching viewer.
//
// Layout produced (mirrors the GitHub release zip):
//   public/pdfjs-viewer/
//   ├── build/
//   │   ├── pdf.mjs                    (runtime)
//   │   ├── pdf.worker.mjs             (worker)
//   │   └── pdf.sandbox.mjs            (PDF-JS sandbox for form scripts)
//   └── web/
//       ├── viewer.html                (the page Search.vue links to)
//       ├── viewer.mjs                 (viewer UI bundle)
//       ├── viewer.css
//       ├── images/                    (icons)
//       ├── locale/en-US/              (others trimmed to save ~2.6 MB)
//       ├── cmaps/                     (CJK font maps)
//       ├── standard_fonts/            (PDF spec fonts)
//       ├── iccs/                      (ICC colour profiles)
//       └── wasm/                      (JBIG2 / JPEG-2000 decoders)
//
// Source maps and the bundled tracemonkey sample PDF are dropped — they add
// ~12 MB on disk with zero runtime value for us. Result: ~6-7 MB on disk.
//
// Idempotent — wipes the output dir first, then fetches + extracts fresh.
// Wired into `prebuild` / `predev`. Cached locally under .pdfjs-cache/ so
// repeat runs don't re-download.

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const demoRoot = resolve(here, '..');

// --- 1. Discover the pinned pdfjs-dist version so the viewer matches.
async function readPdfjsDistVersion() {
  const candidates = [
    resolve(demoRoot, 'node_modules', 'pdfjs-dist', 'package.json'),
    resolve(demoRoot, '..', '..', 'node_modules', 'pdfjs-dist', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.version) return String(parsed.version);
    } catch {
      // try next
    }
  }
  throw new Error(
    `Could not read pdfjs-dist version from node_modules.\n` +
      `Run \`pnpm install\` first so pdfjs-dist is present.`,
  );
}

const pdfjsVersion = await readPdfjsDistVersion();
const releaseUrl = `https://github.com/mozilla/pdf.js/releases/download/v${pdfjsVersion}/pdfjs-${pdfjsVersion}-dist.zip`;

const outDir = resolve(demoRoot, 'public', 'pdfjs-viewer');
const cacheRoot = resolve(demoRoot, '.pdfjs-cache');
const cachedZip = resolve(cacheRoot, `pdfjs-${pdfjsVersion}-dist.zip`);

// --- 2. Download the release artifact (cached).
async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

await mkdir(cacheRoot, { recursive: true });

if (!(await fileExists(cachedZip))) {
  console.log(`Downloading Mozilla pdf.js viewer v${pdfjsVersion}…`);
  const res = await fetch(releaseUrl, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(
      `Failed to fetch ${releaseUrl}: ${res.status} ${res.statusText}.\n` +
        `Check that pdfjs-dist@${pdfjsVersion} has a matching GitHub release published.`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(cachedZip, buf);
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  console.log(`  Downloaded ${(buf.length / 1024 / 1024).toFixed(2)} MB (sha256: ${sha}…)`);
} else {
  console.log(`Using cached pdf.js viewer v${pdfjsVersion} from .pdfjs-cache/`);
}

// --- 3. Wipe + recreate the public/pdfjs-viewer/ tree, then unzip.
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// Use the system `unzip` — present on macOS, Linux, and Netlify build images.
// Pulling in a JS unzip dep (yauzl/adm-zip) would bloat node_modules for a
// build-time script that runs once. If `unzip` is missing on Netlify, this
// throws with a clear message and the consumer can add an install step.
async function runUnzip(zipPath, destDir) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('unzip', ['-q', '-o', zipPath, '-d', destDir], { stdio: 'inherit' });
    proc.on('error', rejectP);
    proc.on('exit', (code) => {
      if (code === 0) resolveP(undefined);
      else rejectP(new Error(`unzip exited with code ${code}`));
    });
  });
}

await runUnzip(cachedZip, outDir);

// --- 4. Trim:
//  - source maps (~12 MB, no runtime value)
//  - bundled sample PDF (1 MB, only useful in Mozilla's hosted demo)
//  - debugger.{css,mjs} (debug-only)
//  - LICENSE (kept at top of demo repo already; viewer assets reference it)
//  - all locales except en-US (saves ~2.6 MB)
//
// Each trim is wrapped so a missing file doesn't abort — pdfjs releases
// occasionally shuffle file names.
const TRIM_FILES = [
  'build/pdf.mjs.map',
  'build/pdf.worker.mjs.map',
  'build/pdf.sandbox.mjs.map',
  'web/viewer.mjs.map',
  'web/compressed.tracemonkey-pldi-09.pdf',
  'web/debugger.css',
  'web/debugger.mjs',
  'LICENSE',
];

for (const rel of TRIM_FILES) {
  await rm(resolve(outDir, rel), { force: true });
}

const localeDir = resolve(outDir, 'web', 'locale');
try {
  const entries = await readdir(localeDir, { withFileTypes: true });
  const keep = new Set(['en-US', 'locale.json']);
  for (const entry of entries) {
    if (keep.has(entry.name)) continue;
    await rm(resolve(localeDir, entry.name), { recursive: true, force: true });
  }
} catch (err) {
  if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
}

// --- 5. Patch viewer.css to override find-highlight colors.
//
// Mozilla's defaults are muted magenta (~rgb(180 0 170 / 0.25)) for regular
// matches and dark green (~rgb(0 100 0 / 0.25)) for the focused match. On a
// dark-mode demo with lime accents elsewhere, those colors are hard to spot.
//
// IMPORTANT subtlety: pdf.js v5 declares `--highlight-bg-color` and
// `--highlight-selected-bg-color` ON `.textLayer .highlight` itself, not on
// `:root`. CSS variable resolution looks up FROM the element, so a `:root`
// override never gets reached — the element-local declaration wins. Earlier
// versions of this patch overrode at `:root` and `.viewer` and the colors
// silently didn't apply. The fix: set the variables on the same selector
// pdf.js uses, with `!important`, AND apply direct `background-color`
// fallbacks that cover every compound-class variant pdf.js emits
// (`.selected`, `.appended`, `.begin`, `.end`, `.middle` — used when a
// match spans multiple text-layer chunks like across a line break).
//
// User preference: single high-contrast lime color for ALL matches (regular
// and focused alike). No amber on the focused one — the focused match still
// gets visual emphasis from scroll-into-view + find-bar next/prev controls.
//
// Color: rgba(132, 204, 22, 0.75) — Tailwind lime-500 at 75% alpha. High
// saturation, ~14:1 contrast against the typical white PDF page background.
const PATCH_MARKER = '@icjia/pdf-search-index demo overrides';
const HIGHLIGHT_COLOR = 'rgba(132, 204, 22, 0.75)';
const HCM_HIGHLIGHT_COLOR = 'rgba(132, 204, 22, 0.9)';

const viewerCssPath = resolve(outDir, 'web', 'viewer.css');
try {
  const existing = await readFile(viewerCssPath, 'utf8');
  if (!existing.includes(PATCH_MARKER)) {
    const overrides = `

/* === ${PATCH_MARKER} — high-contrast find highlights === */

/*
 * 1) Override the CSS variables AT the same selector pdf.js declares them on
 *    (line ~945 of unpatched viewer.css). A :root override would be shadowed
 *    by the local declaration on .textLayer .highlight — variable resolution
 *    looks UP from the element, finds the local definition first, and stops.
 *    !important ensures we win on cascade order regardless of source position.
 */
.textLayer .highlight {
  --highlight-bg-color: ${HIGHLIGHT_COLOR} !important;
  --highlight-selected-bg-color: ${HIGHLIGHT_COLOR} !important;
  --hcm-highlight-bg-color: ${HCM_HIGHLIGHT_COLOR} !important;
  --hcm-highlight-selected-bg-color: ${HCM_HIGHLIGHT_COLOR} !important;
}

/*
 * 2) Direct background-color fallbacks for every compound-class variant
 *    pdf.js emits. Cover .selected (the focused match), .appended (highlights
 *    added after initial render), and .begin/.middle/.end (used when a match
 *    crosses text-layer span boundaries — e.g., across a line break).
 *    All set to the same lime so the user sees uniform high-contrast
 *    highlighting across every kind of match.
 */
.textLayer .highlight,
.selected:is(.textLayer .highlight),
.appended:is(.textLayer .highlight),
.begin:is(.textLayer .highlight),
.middle:is(.textLayer .highlight),
.end:is(.textLayer .highlight) {
  background-color: ${HIGHLIGHT_COLOR} !important;
}

/*
 * 3) Legacy selectors without :is() — for any pdf.js build that ships
 *    pre-:is() CSS. Defensive belt-and-suspenders; harmless on v5+.
 */
.textLayer .highlight.selected,
.textLayer .highlight.appended,
.textLayer .highlight.begin,
.textLayer .highlight.middle,
.textLayer .highlight.end {
  background-color: ${HIGHLIGHT_COLOR} !important;
}
`;
    await writeFile(viewerCssPath, existing + overrides);
    console.log(
      `  Patched viewer.css with high-contrast lime find highlights (${HIGHLIGHT_COLOR})`,
    );
  }
} catch (err) {
  if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
  console.warn('  viewer.css not found at expected path; skipping highlight-color patch');
}

// --- 6. Summarise size so the prebuild log makes the cost visible.
async function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = await readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const p = resolve(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(p);
      } else {
        const st = await stat(p);
        total += st.size;
      }
    }
  }
  return total;
}

const totalBytes = await dirSize(outDir);
console.log(
  `Vendored pdf.js viewer v${pdfjsVersion} into public/pdfjs-viewer/ (${(totalBytes / 1024 / 1024).toFixed(2)} MB on disk)`,
);
