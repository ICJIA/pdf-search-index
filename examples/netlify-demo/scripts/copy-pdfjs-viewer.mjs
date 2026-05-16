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
// Mozilla's default highlight colors are muted magenta (~rgba(180, 0, 170, 0.25))
// for regular matches and a desaturated green for the currently-focused match.
// On a dark-mode demo with lime accents elsewhere, those defaults read as a
// dim purple smudge — users have a hard time seeing which words in the PDF
// the viewer actually matched. We override to high-contrast lime (for all
// matches) + amber (for the currently-focused match, so the user can navigate
// matches via the viewer's find-bar next/prev and clearly see where they are).
//
// pdf.js 5.x exposes these via CSS custom properties; older selectors are
// added as a defensive fallback. The !important on the legacy selectors is
// required because pdf.js's own viewer.css applies them with normal
// specificity and our additions need to win.
// Marker string used by the idempotency check below. Must appear verbatim
// inside the appended overrides block — duplicate the literal in both places
// (or the check silently re-applies the patch on every build).
const PATCH_MARKER = '@icjia/pdf-search-index demo overrides';
const viewerCssPath = resolve(outDir, 'web', 'viewer.css');
try {
  const existing = await readFile(viewerCssPath, 'utf8');
  if (!existing.includes(PATCH_MARKER)) {
    const overrides = `

/* === ${PATCH_MARKER} — high-contrast find highlights === */
:root,
.viewer {
  /* Regular matches: lime, ~50% alpha so text underneath stays legible */
  --highlight-bg-color: rgba(163, 230, 53, 0.55);
  /* Currently-focused match: amber, slightly hotter so navigation is obvious */
  --highlight-selected-bg-color: rgba(250, 204, 21, 0.75);
  /* High-contrast-mode variants */
  --hcm-highlight-bg-color: rgba(163, 230, 53, 0.7);
  --hcm-highlight-selected-bg-color: rgba(250, 204, 21, 0.9);
}

/* Defensive fallbacks for selectors used before the CSS-variable refactor */
.textLayer .highlight {
  background-color: rgba(163, 230, 53, 0.55) !important;
}
.textLayer .highlight.selected {
  background-color: rgba(250, 204, 21, 0.75) !important;
}
.textLayer .highlight.appended {
  background-color: rgba(163, 230, 53, 0.55) !important;
}
`;
    await writeFile(viewerCssPath, existing + overrides);
    console.log('  Patched viewer.css with high-contrast lime/amber find highlights');
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
