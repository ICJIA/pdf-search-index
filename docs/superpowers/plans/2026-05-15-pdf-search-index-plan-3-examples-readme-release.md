# PDF Search Index — Plan 3 (Examples + README + v1.0.0 Release) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship seven runnable framework examples, a comprehensive developer-targeted top-level `README.md`, and the coordinated `v1.0.0` release across all three packages (`@icjia/pdf-search-index`, `@icjia/astro-pdf-search-index`, `@icjia/nuxt-pdf-search-index`).

**Architecture:** Each example is a workspace member under `examples/*` that consumes the packages via `workspace:*` links and demonstrates exactly one integration story (programmatic API, CLI, framework adapter). PDF fixtures are committed once at `examples/_fixtures/` and referenced via `file://` URLs through a copy-pasted `local-fetch.mjs` helper. Adapter examples (Astro, Nuxt) pass the same helper into the integration via a `fetch` option. The release is a hand-edited `1.0.0` bump across all three packages followed by a manual `pnpm -r publish --access public` — changesets are bypassed for this one bump (their 0.x semver rules don't cleanly handle `0.x → 1.0`) and resume normal operation for future patches.

**Tech Stack:**

- Examples: `astro@^5`, `vue@^3` + `vite@^6`, `next@^15`, `@11ty/eleventy@^3`, `nuxt@^4` + `@nuxt/content@^3`, plus `fuse.js@^7` across all of them
- Build helpers: `tsx@^4` (already a dev dep at the workspace root)
- Shared: TypeScript ESM, the existing `pnpm@10` workspace, the pre-existing oxlint/prettier toolchain

**Prerequisites:**

- Plan 2 is complete at commit `70ddfa2` on branch `feat/v1-adapters` (which is `origin/feat/v1-adapters`).
- The user (`@cschweda`) has dropped **4 randomly-clicked sample PDFs from ICJIA's live website** into `examples/_fixtures/`. The actual files at plan-write time are:
  - `Drug Testing Lit Review-200203T22022729.pdf`
  - `JJ_Statewide_Snapshot_2014_final_09132016-191011T20090709.pdf`
  - `Overview_Methamphetamine_Trends-191011T20091574.pdf`
  - `Stigma PDF for posting-230627T13295515.pdf`
- These weren't curated. They're four random clicks from ICJIA's many public PDFs — useful both as demos _and_ as a counter to the "you cherry-picked these to make it work" objection. No PII, all public, all originally from [icjia.illinois.gov](https://icjia.illinois.gov/).
- The plan's example code is **directory-driven**: every example either auto-discovers all `.pdf` files in `examples/_fixtures/` or uses a content-generation script that reads the directory at build time. None of the example source hard-codes the four filenames above. Swap any fixture for any other PDF at any time — the examples adapt without code changes.

---

## Task 1: Branch, workspace prep, and fixture validation

Open `feat/v1-release` off `feat/v1-adapters`, verify the workspace already includes `examples/*`, scaffold the `examples/_fixtures/` directory, confirm the user's PDFs parse via the existing CLI, and commit the fixtures.

**Files:**

- Create: `examples/_fixtures/.gitkeep` (no-op — just makes the directory trackable even before PDFs land)
- Create: `examples/_fixtures/README.md`
- Modify: nothing else

- [ ] **Step 1: Branch off `feat/v1-adapters`**

```bash
git checkout feat/v1-adapters
git pull --ff-only
git checkout -b feat/v1-release
```

- [ ] **Step 2: Confirm the workspace already accepts `examples/*`**

Read `pnpm-workspace.yaml`. It should already contain:

```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

If `examples/*` is missing, add it. (Plan 1 set this up already, so the expected outcome is "no change required".)

- [ ] **Step 3: Confirm sample PDFs are present**

```bash
ls -la examples/_fixtures/*.pdf
```

Expected: at least 2 `.pdf` files, each between 1 KB and 10 MB. (At plan-write time there are 4 — the cryptically-named ICJIA-website samples.)

If the directory has zero `.pdf` files, **STOP** and ask the user to drop sample PDFs into `examples/_fixtures/`. The remaining tasks all reference these files; running them without fixtures will produce empty search indexes and break smoke tests.

- [ ] **Step 4: Verify every fixture parses via the locally-built core**

Discover every `.pdf` in the directory and confirm extraction works on each:

```bash
pnpm --filter @icjia/pdf-search-index build
node -e "
import { indexPdfs } from './packages/core/dist/index.js';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const localFetch = async (input) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url));
    return new Response(buf, { headers: { 'content-type': 'application/pdf' } });
  }
  return fetch(input);
};
const fixturesDir = resolve('./examples/_fixtures');
const entries = (await readdir(fixturesDir)).filter((e) => e.toLowerCase().endsWith('.pdf'));
const urls = entries.map((e) => new URL(\`file://\${join(fixturesDir, e)}\`).href);
const rows = await indexPdfs(urls, { fetch: localFetch, cacheDir: '.tmp-fixture-cache' });
for (const r of rows) console.log((r.title || '?').padEnd(50), 'pages=' + (r.pages ?? '?'), 'chars=' + r.text.length);
" --input-type=module
```

Expected: each fixture prints its derived title, page count > 0, and `chars` > 100. If any fixture shows `chars=0`, that PDF is image-only / scanned and won't search meaningfully — flag it to the user as a fixture worth replacing (but don't block on it; the other fixtures will still demo the search).

Then clean up the temp cache:

```bash
rm -rf .tmp-fixture-cache
```

- [ ] **Step 5: Write the fixtures README**

Create `examples/_fixtures/README.md`:

```markdown
# Example PDF fixtures

These PDFs are referenced by every example in `examples/*`. They're committed so the examples are hermetic: no network calls, no offsite hosting, reproducible search results across machines and CI runs.

## Provenance — these are random clicks, not curated samples

The PDFs here are **publicly available samples from ICJIA's website** ([icjia.illinois.gov](https://icjia.illinois.gov/)) — **randomly chosen** by clicking around ICJIA's many live PDFs. There's no rhyme or reason to _which_ PDFs ended up here: they're just four arbitrary samples from the live corpus.

We're calling that out explicitly because "look how well it searches these specific PDFs" is a fair skepticism — managers and reviewers are right to wonder whether the demo was cherry-picked. It wasn't. Drop in any other PDF from any other source and the examples work identically. The randomness is the point.

These PDFs were already publicly available, are included here as illustrative integration samples, and **contain no personally identifiable information (PII)**.

## Files (at commit time)

The four fixtures landed here on 2026-05-15:

- `Drug Testing Lit Review-200203T22022729.pdf`
- `JJ_Statewide_Snapshot_2014_final_09132016-191011T20090709.pdf`
- `Overview_Methamphetamine_Trends-191011T20091574.pdf`
- `Stigma PDF for posting-230627T13295515.pdf`

The cryptic timestamp suffixes are the original Drupal URL slugs from ICJIA's CMS — preserved as-is so the filenames mirror what you'd encounter on the live site.

## Using your own PDFs

Replace any file in this directory with your own. **Every example auto-discovers all `.pdf` files in this directory** at build time — none of them hard-codes specific filenames. Drop in a new PDF, re-run the example, and your PDF is in the search index.

## Why `file://` URLs

Examples reference these PDFs via `file://` URLs and a small `local-fetch.mjs` helper that intercepts `file://` reads. This keeps every example runnable offline. In production, your PDFs are at real `https://...` URLs and the helper isn't needed.
```

- [ ] **Step 6: Commit fixtures**

```bash
git add examples/_fixtures/
git commit -m "chore(examples): commit sample PDF fixtures + fixtures README"
```

---

## Task 2: `examples/plain-node` — programmatic API, no framework

The minimal viable example: a single Node script that imports `indexPdfs`, scans `examples/_fixtures/`, writes a JSON index, then runs a Fuse query against it and prints highlighted snippets. Demonstrates the package's lowest-level surface with zero framework overhead.

**Files:**

- Create: `examples/plain-node/package.json`
- Create: `examples/plain-node/local-fetch.mjs`
- Create: `examples/plain-node/index.mjs`
- Create: `examples/plain-node/README.md`

- [ ] **Step 1: Create the package**

Create `examples/plain-node/package.json`:

```json
{
  "name": "@icjia-examples/plain-node",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.mjs",
    "build": "node index.mjs --write dist/searchIndex.json",
    "clean": "rm -rf dist .pdf-cache"
  },
  "dependencies": {
    "@icjia/pdf-search-index": "workspace:*",
    "fuse.js": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create the `local-fetch.mjs` helper**

Create `examples/plain-node/local-fetch.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Drop-in `fetch` replacement that resolves `file://` URLs to local files,
 * delegating everything else to the global fetch. Lets examples index local
 * PDF fixtures without spinning up an HTTP server.
 */
export const localFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url));
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(buf.byteLength),
      },
    });
  }
  return fetch(input, init);
};
```

- [ ] **Step 3: Create the main script**

Create `examples/plain-node/index.mjs`:

```js
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
```

- [ ] **Step 4: Create the README**

Create `examples/plain-node/README.md`:

````markdown
# plain-node example

The lowest-level integration: a Node script that imports `indexPdfs` directly, walks `examples/_fixtures/`, writes a JSON index, and runs a Fuse query against it. No framework, no UI — just the package's programmatic API.

## What it demonstrates

- `indexPdfs(urls, options?)` — the core batch indexer
- `createFuseIndex({ urls, ... })` — the `/fuse` entry's one-shot helper
- `snippetHTMLFor(result)` — the `/snippet` entry's highlight helper
- The `fetch` option, used to resolve `file://` URLs to local fixtures

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @icjia-examples/plain-node start
```

Expected output:

```
Indexing 3 PDF(s) from /…/examples/_fixtures…
Indexed rows:
  Annual Report                  pages=12 chars=42180
  Faq                            pages=4  chars=8910
  Brochure                       pages=2  chars=2840

Query "applicant" → 2 match(es):
  • Annual Report
    …the <mark>applicant</mark> portal opened in March…
  • Faq
    …each <mark>applicant</mark> must register before…
```

## Try a different query

```bash
pnpm --filter @icjia-examples/plain-node start -- "grant"
```

(The `--` passes the rest of the args through pnpm to the script.)

## Write the index to a file

```bash
pnpm --filter @icjia-examples/plain-node build
```

This writes `examples/plain-node/dist/searchIndex.json` — the same shape a real consumer site would bundle and ship to the browser.

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm start` — the script picks them up automatically.

## What's next

This example uses the programmatic API directly. For a UI, see [`examples/html`](../html), [`examples/vue`](../vue), [`examples/nextjs`](../nextjs), or [`examples/eleventy`](../eleventy). For framework-integrated builds, see [`examples/astro`](../astro) and [`examples/nuxt-mixed`](../nuxt-mixed).
````

- [ ] **Step 5: Install workspace deps and run the example**

```bash
pnpm install
pnpm --filter @icjia-examples/plain-node start
```

Expected: the output matches the README's example output (with chars/pages counts that depend on your fixture PDFs).

- [ ] **Step 6: Verify the `--write` mode produces a JSON file**

```bash
pnpm --filter @icjia-examples/plain-node build
node -e "const fs=await import('fs'); const idx=JSON.parse(fs.readFileSync('examples/plain-node/dist/searchIndex.json')); console.log(idx.length, idx[0]?.title)" --input-type=module
```

Expected: prints the row count and first title. The row count should be ≥ 3 (one per fixture PDF).

- [ ] **Step 7: Commit**

```bash
git add examples/plain-node/ pnpm-lock.yaml
git commit -m "feat(examples): plain-node example (programmatic API + Fuse + snippet)"
```

---

## Task 3: `examples/html` — vanilla HTML + Fuse via CDN, CLI-built index

A "no build step" example for the runtime: an `index.html` file with inline JS that loads Fuse from a CDN and fetches a prebuilt `searchIndex.json`. The build step itself is still a tiny Node script (using the programmatic API, not the CLI subprocess, because that's strictly simpler and lets us keep the example offline-hermetic). The README documents how to swap to the CLI subprocess for users who prefer it.

**Files:**

- Create: `examples/html/package.json`
- Create: `examples/html/local-fetch.mjs`
- Create: `examples/html/build-index.mjs`
- Create: `examples/html/public/index.html`
- Create: `examples/html/README.md`

- [ ] **Step 1: Create the package**

Create `examples/html/package.json`:

```json
{
  "name": "@icjia-examples/html",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:index": "node build-index.mjs",
    "build": "pnpm build:index && cp -r public dist",
    "serve": "npx --yes serve@14 dist -l 4173",
    "dev": "pnpm build && pnpm serve",
    "clean": "rm -rf dist .pdf-cache public/searchIndex.json"
  },
  "dependencies": {
    "@icjia/pdf-search-index": "workspace:*"
  }
}
```

- [ ] **Step 2: Reuse the `local-fetch.mjs` helper**

Create `examples/html/local-fetch.mjs` with the **same** contents as `examples/plain-node/local-fetch.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const localFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url));
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(buf.byteLength),
      },
    });
  }
  return fetch(input, init);
};
```

- [ ] **Step 3: Create the build script**

Create `examples/html/build-index.mjs`:

```js
import { indexPdfs } from '@icjia/pdf-search-index';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localFetch } from './local-fetch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', '_fixtures');
const outPath = resolve(here, 'public', 'searchIndex.json');

const entries = await readdir(fixturesDir);
const urls = entries
  .filter((e) => e.toLowerCase().endsWith('.pdf'))
  .map((e) => new URL(`file://${join(fixturesDir, e)}`).href);

console.log(`Indexing ${urls.length} PDF(s)…`);
const rows = await indexPdfs(urls, {
  fetch: localFetch,
  cacheDir: resolve(here, '.pdf-cache'),
});

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(rows, null, 2));
console.log(`Wrote ${outPath} (${rows.length} rows)`);
```

- [ ] **Step 4: Create the HTML runtime**

Create `examples/html/public/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PDF Search — vanilla HTML example</title>
    <style>
      body {
        font:
          16px/1.5 system-ui,
          sans-serif;
        max-width: 720px;
        margin: 2rem auto;
        padding: 0 1rem;
        color: #222;
      }
      h1 {
        font-size: 1.5rem;
        margin-bottom: 0.25rem;
      }
      p.lede {
        color: #555;
        margin-top: 0;
      }
      input {
        width: 100%;
        padding: 0.6rem 0.75rem;
        font-size: 1rem;
        border: 2px solid #0d4474;
        border-radius: 4px;
      }
      .meta {
        color: #555;
        margin: 0.75rem 0;
      }
      ul {
        list-style: none;
        padding: 0;
      }
      li {
        margin: 0.5rem 0;
        padding: 0.75rem 1rem;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      li a {
        color: #0d4474;
        text-decoration: none;
        font-weight: 600;
      }
      .snippet {
        color: #555;
        font-size: 0.9rem;
        margin-top: 0.4rem;
      }
      mark {
        background: #fff59d;
        padding: 0 2px;
        border-radius: 2px;
      }
    </style>
  </head>
  <body>
    <h1>PDF Search — vanilla HTML example</h1>
    <p class="lede">
      Plain HTML page; <code>searchIndex.json</code> is built at npm time by
      <code>build-index.mjs</code>.
    </p>

    <input id="q" type="search" placeholder="Search the PDF corpus…" autocomplete="off" />
    <p id="meta" class="meta">Loading…</p>
    <ul id="results"></ul>

    <script type="module">
      import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.esm.js';

      const SNIPPET_CONTEXT = 80;

      function escapeHTML(s) {
        return s.replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
        );
      }

      function collapseWS(s) {
        return s.replace(/\s+/g, ' ');
      }

      function longestMatch(m) {
        if (!m.indices?.length) return null;
        return m.indices.reduce((b, c) => (c[1] - c[0] > b[1] - b[0] ? c : b), m.indices[0]);
      }

      function snippetHTMLFor(r) {
        const m = (r.matches ?? []).find((x) => x.key === 'text');
        if (!m) return '';
        const idx = longestMatch(m);
        if (!idx) return '';
        const [start, end] = idx;
        const text = r.item.text;
        const a = Math.max(0, start - SNIPPET_CONTEXT);
        const b = Math.min(text.length, end + 1 + SNIPPET_CONTEXT);
        const before = collapseWS(text.slice(a, start));
        const hit = collapseWS(text.slice(start, end + 1));
        const after = collapseWS(text.slice(end + 1, b));
        return (
          (a > 0 ? '…' : '') +
          escapeHTML(before) +
          `<mark>${escapeHTML(hit)}</mark>` +
          escapeHTML(after) +
          (b < text.length ? '…' : '')
        );
      }

      const q = document.getElementById('q');
      const meta = document.getElementById('meta');
      const list = document.getElementById('results');

      const rows = await fetch('./searchIndex.json').then((r) => r.json());
      const fuse = new Fuse(rows, {
        keys: ['title', 'text'],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true,
      });
      meta.textContent = `${rows.length} PDF(s) indexed. Try "applicant", "grant", "report".`;

      function render() {
        const value = q.value.trim();
        if (!value) {
          meta.textContent = `${rows.length} PDF(s) indexed. Try "applicant", "grant", "report".`;
          list.innerHTML = '';
          return;
        }
        const results = fuse.search(value).slice(0, 50);
        meta.textContent = `${results.length} match(es) for "${value}".`;
        list.innerHTML = results
          .map(
            (r) =>
              `<li><a href="${r.item.url}" target="_blank" rel="noopener">${escapeHTML(r.item.title)}</a><div class="snippet">${snippetHTMLFor(r)}</div></li>`,
          )
          .join('');
      }
      q.addEventListener('input', render);
    </script>
  </body>
</html>
```

- [ ] **Step 5: Create the README**

Create `examples/html/README.md`:

````markdown
# html example

A pure-HTML runtime — no Vite, no bundler, no framework. The build step is a single Node script (`build-index.mjs`) that produces `public/searchIndex.json`; the page loads it via `fetch`, hands it to Fuse.js (loaded from a CDN), and renders highlighted snippets in vanilla DOM.

## What it demonstrates

- The simplest deployable runtime — drop `dist/` on any static host
- `indexPdfs` used in a build-time Node script (no CLI subprocess)
- A hand-rolled snippet renderer that mirrors `snippetHTMLFor` exactly, for sites that want to avoid the `/snippet` dependency at runtime

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @icjia-examples/html build
pnpm --filter @icjia-examples/html serve
```

Then open <http://localhost:4173/>. Type into the search box — results render as you type, with the matching text wrapped in `<mark>`.

Or do build + serve in one step:

```bash
pnpm --filter @icjia-examples/html dev
```

## Expected build output

```
Indexing 3 PDF(s)…
Wrote /…/examples/html/public/searchIndex.json (3 rows)
```

## Use the CLI instead of the build script

The `build-index.mjs` uses the programmatic API. If you'd rather drive the CLI:

```bash
# from examples/html
npx @icjia/pdf-search-index https://example.com/foo.pdf https://example.com/bar.pdf --out public/searchIndex.json
```

(That requires real HTTPS URLs; the file-fixture demo only works through the programmatic API because the CLI doesn't accept a custom `fetch` function.)

## Try queries

Phrases that will match the included fixtures:

- `"applicant"` — typically appears in the annual report and the FAQ
- `"grant"` — typically appears across multiple fixtures
- A short distinctive word lifted from any fixture's body — searches are fuzzy by default (`threshold: 0.3`)

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm build`.
````

- [ ] **Step 6: Install, build, and verify**

```bash
pnpm install
pnpm --filter @icjia-examples/html build
node -e "const fs=await import('fs'); const idx=JSON.parse(fs.readFileSync('examples/html/dist/searchIndex.json')); console.log(idx.length, idx[0]?.title)" --input-type=module
```

Expected: row count ≥ 3, first title printed.

Then start the static server and confirm the page loads:

```bash
pnpm --filter @icjia-examples/html serve &
sleep 2
curl -sf http://localhost:4173/ | head -5
curl -sf http://localhost:4173/searchIndex.json | head -3
kill %1 2>/dev/null || true
```

Expected: HTML opens with `<!doctype html>`, JSON opens with `[`.

- [ ] **Step 7: Commit**

```bash
git add examples/html/ pnpm-lock.yaml
git commit -m "feat(examples): plain HTML + Fuse-via-CDN example"
```

---

## Task 4: `examples/vue` — Vite + Vue 3 + Fuse + the R3 Search.vue pattern

Adapts the proven `docs/Search.vue` reference component to use the packaged `snippetHTMLFor` helper instead of the inline copy. Vite builds the runtime; a pre-`build` step (`vite-plugin-static-copy` style or just a separate node script) emits the search index into `public/`.

**Files:**

- Create: `examples/vue/package.json`
- Create: `examples/vue/local-fetch.mjs`
- Create: `examples/vue/build-index.mjs`
- Create: `examples/vue/index.html`
- Create: `examples/vue/vite.config.ts`
- Create: `examples/vue/tsconfig.json`
- Create: `examples/vue/src/main.ts`
- Create: `examples/vue/src/App.vue`
- Create: `examples/vue/src/Search.vue`
- Create: `examples/vue/README.md`

- [ ] **Step 1: Create the package**

Create `examples/vue/package.json`:

```json
{
  "name": "@icjia-examples/vue",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:index": "node build-index.mjs",
    "predev": "pnpm build:index",
    "dev": "vite",
    "prebuild": "pnpm build:index",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist .pdf-cache public/searchIndex.json"
  },
  "dependencies": {
    "@icjia/pdf-search-index": "workspace:*",
    "fuse.js": "^7.0.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "vue-tsc": "^2.1.0"
  }
}
```

- [ ] **Step 2: Reuse the `local-fetch.mjs` helper**

Create `examples/vue/local-fetch.mjs` with the same body as in Task 2 Step 2. (Re-state, since the engineer may read tasks out of order:)

```js
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const localFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url));
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(buf.byteLength),
      },
    });
  }
  return fetch(input, init);
};
```

- [ ] **Step 3: Create the index build script**

Create `examples/vue/build-index.mjs`:

```js
import { indexPdfs } from '@icjia/pdf-search-index';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localFetch } from './local-fetch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', '_fixtures');
const outPath = resolve(here, 'public', 'searchIndex.json');

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
```

- [ ] **Step 4: Create the Vite config + TS config + entry HTML**

Create `examples/vue/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173 },
});
```

Create `examples/vue/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

Create `examples/vue/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PDF Search — Vue example</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create the Vue source files**

Create `examples/vue/src/main.ts`:

```ts
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

Create `examples/vue/src/App.vue`:

```vue
<template>
  <main>
    <h1>PDF Search — Vue example</h1>
    <p class="lede">
      A Vite + Vue 3 SPA wrapping a small Search island. The
      <code>/searchIndex.json</code> is generated at build time by <code>build-index.mjs</code>.
    </p>
    <Search />
  </main>
</template>

<script setup lang="ts">
import Search from './Search.vue';
</script>

<style>
body {
  font:
    16px/1.5 system-ui,
    sans-serif;
  margin: 0;
  background: #f7f7f7;
}
main {
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem;
  background: #fff;
  border-radius: 6px;
  padding: 1.5rem;
}
h1 {
  font-size: 1.5rem;
  margin: 0 0 0.25rem;
}
p.lede {
  color: #555;
  margin-top: 0;
}
</style>
```

Create `examples/vue/src/Search.vue`:

```vue
<template>
  <div class="search">
    <input
      v-model="query"
      type="search"
      placeholder="Search the PDF corpus…"
      autocomplete="off"
      class="search__input"
    />
    <p class="search__meta" aria-live="polite">
      <template v-if="!loaded">Loading search index…</template>
      <template v-else-if="!query.trim()">
        {{ rows.length }} PDF(s) indexed. Try "applicant", "grant", "report".
      </template>
      <template v-else-if="!results.length"> No matches for "{{ query }}". </template>
      <template v-else> {{ results.length }} match(es). </template>
    </p>
    <ul v-if="results.length" class="search__results">
      <li v-for="r in results.slice(0, 50)" :key="r.item.id">
        <a :href="r.item.url" target="_blank" rel="noopener noreferrer">
          <strong>{{ r.item.title }}</strong>
          <p v-if="snippet(r)" class="search__snippet" v-html="snippet(r)"></p>
        </a>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

const rows = ref<IndexedPdf[]>([]);
const fuse = ref<Fuse<IndexedPdf> | null>(null);
const query = ref('');
const loaded = ref(false);

const results = computed<FuseResult<IndexedPdf>[]>(() => {
  if (!fuse.value || !query.value.trim()) return [];
  return fuse.value.search(query.value);
});

function snippet(r: FuseResult<IndexedPdf>): string {
  return snippetHTMLFor(r, { contextChars: 80, matchKey: 'text' });
}

onMounted(async () => {
  const res = await fetch('/searchIndex.json');
  rows.value = (await res.json()) as IndexedPdf[];
  fuse.value = new Fuse(rows.value, {
    keys: ['title', 'text'],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
  loaded.value = true;
});
</script>

<style scoped>
.search__input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  border: 2px solid #0d4474;
  border-radius: 4px;
}
.search__meta {
  color: #555;
}
.search__results {
  list-style: none;
  padding: 0;
}
.search__results li {
  margin: 0.5rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.search__results a {
  color: #0d4474;
  text-decoration: none;
}
.search__snippet {
  color: #555;
  font-size: 0.9rem;
  margin-top: 0.4rem;
}
:deep(mark) {
  background: #fff59d;
  padding: 0 2px;
  border-radius: 2px;
}
</style>
```

- [ ] **Step 6: Create the README**

Create `examples/vue/README.md`:

````markdown
# vue example

A Vite + Vue 3 SPA. Mirrors the R3 reference `Search.vue` component, but uses the packaged `snippetHTMLFor` helper instead of an inline copy.

## What it demonstrates

- The R3 reference UI generalized to use `@icjia/pdf-search-index/snippet`
- `pre-build` hook pattern: `prebuild` in `package.json` runs `build-index.mjs` before `vite build`
- Type-safe consumption via `import type { IndexedPdf }`

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @icjia-examples/vue dev
```

Open <http://localhost:5173/>. The `predev` hook builds `public/searchIndex.json` before Vite starts, so the page can fetch it immediately.

## Build for production

```bash
pnpm --filter @icjia-examples/vue build
pnpm --filter @icjia-examples/vue preview
```

`pnpm build` runs `build-index.mjs` (via `prebuild`) then `vite build`. Static assets land in `examples/vue/dist/`.

## Try queries

- `"applicant"` — common across ICJIA documents
- `"grant"` — common across funding-related PDFs
- Any 4+ letter word lifted from any fixture's body

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm dev` (the `predev` hook rebuilds the index).
````

- [ ] **Step 7: Install, build, and verify**

```bash
pnpm install
pnpm --filter @icjia-examples/vue build
node -e "const fs=await import('fs'); const idx=JSON.parse(fs.readFileSync('examples/vue/dist/searchIndex.json')); console.log(idx.length, idx[0]?.title)" --input-type=module
ls -la examples/vue/dist/index.html examples/vue/dist/assets/ 2>/dev/null | head
```

Expected: row count ≥ 3, first title printed, `dist/index.html` exists, an `assets/` directory exists with bundled JS/CSS.

- [ ] **Step 8: Commit**

```bash
git add examples/vue/ pnpm-lock.yaml
git commit -m "feat(examples): Vite + Vue 3 example using packaged snippetHTMLFor"
```

---

## Task 5: `examples/astro` + tiny `@icjia/astro-pdf-search-index` fetch enhancement

This is the only task that touches a package. Before building the example, add a `fetch?: typeof fetch` option to `PdfSearchIntegrationOptions` so the example can pass `localFetch` for `file://` resolution. The change is three lines.

Then build a tiny Astro 5 fixture site with one content collection (`docs/`), one entry that links a PDF in its body, and a `Search.vue` island mounted on `/`.

**Files:**

- Modify: `packages/astro-pdf-search-index/src/index.ts`
- Modify: `packages/astro-pdf-search-index/test/integration.test.ts` (assert `fetch` is honored)
- Create: `examples/astro/package.json`
- Create: `examples/astro/local-fetch.mjs`
- Create: `examples/astro/astro.config.ts`
- Create: `examples/astro/tsconfig.json`
- Create: `examples/astro/src/content/config.ts`
- Create: `examples/astro/src/content/docs/annual-report.md`
- Create: `examples/astro/src/content/docs/faq.md`
- Create: `examples/astro/src/content/docs/brochure.md`
- Create: `examples/astro/src/pages/index.astro`
- Create: `examples/astro/src/components/Search.vue`
- Create: `examples/astro/README.md`

- [ ] **Step 1: Add `fetch` option to the Astro integration**

Modify `packages/astro-pdf-search-index/src/index.ts`. Add the option to the interface, accept it in the function, and thread it into `baseOpts`. Replace the `PdfSearchIntegrationOptions` interface and the top of `pdfSearchIntegration` to look like this:

```ts
export interface PdfSearchIntegrationOptions {
  /**
   * Names of Astro content collections to scan for PDF links in entry bodies.
   * Each `.md` / `.mdx` file under `src/<contentSourceDir>/<collection>/` is
   * read, frontmatter is stripped, and the body is passed to
   * `extractPdfsFromBody`.
   */
  collections: string[];

  /**
   * Output path relative to the project's public/ directory.
   * Default: `searchIndex.pdfs.json`.
   */
  endpoint?: string;

  /** Cache directory passed to extractPdfsFromBody. Default `.astro/.pdf-cache`. */
  cacheDir?: string;

  /** Concurrency passed to extractPdfsFromBody. Default 4. */
  concurrency?: number;

  /**
   * Where to look up source markdown for each entry, relative to `srcDir`.
   * Default `'content'` — Astro's conventional content-collection root.
   */
  contentSourceDir?: string;

  /**
   * Custom `fetch` implementation passed through to `extractPdfsFromBody`.
   * Useful for testing or for examples that need to resolve `file://` URLs
   * to local fixtures. Defaults to the global `fetch`.
   */
  fetch?: typeof fetch;
}

export default function pdfSearchIntegration(
  options: PdfSearchIntegrationOptions,
): AstroIntegration {
  const endpoint = options.endpoint ?? 'searchIndex.pdfs.json';
  const cacheDir = options.cacheDir ?? '.astro/.pdf-cache';
  const concurrency = options.concurrency ?? 4;
  const contentSourceDir = options.contentSourceDir ?? 'content';
  const fetchImpl = options.fetch;
```

Then, inside the `'astro:build:start'` hook, build `baseOpts` so it includes `fetch` only when the consumer supplied one (to keep `exactOptionalPropertyTypes` happy):

```ts
const baseOpts: IndexPdfsOptions = {
  cacheDir,
  concurrency,
  ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
};
```

- [ ] **Step 2: Test the new option**

Open `packages/astro-pdf-search-index/test/integration.test.ts`. Append a new test inside the existing top-level `describe` block:

```ts
it('threads a custom fetch option through to extractPdfsFromBody', async () => {
  const calls: string[] = [];
  const customFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    return new Response('', { status: 404 });
  };

  await runIntegration({
    collections: ['docs'],
    cacheDir: tempCacheDir,
    fetch: customFetch,
  });

  // The fixture's markdown should reference at least one .pdf URL; the
  // integration should have called our custom fetch for it.
  expect(calls.some((u) => u.endsWith('.pdf'))).toBe(true);
});
```

(Use the existing helpers in the test file — `runIntegration`, `tempCacheDir`. If the helper names differ, adapt accordingly. Read the existing test file first to align.)

- [ ] **Step 3: Build & test the adapter**

```bash
pnpm --filter @icjia/astro-pdf-search-index build
pnpm --filter @icjia/astro-pdf-search-index test
pnpm --filter @icjia/astro-pdf-search-index typecheck
```

Expected: build, test, typecheck all green. The new test should pass.

- [ ] **Step 4: Commit the adapter enhancement**

```bash
git add packages/astro-pdf-search-index/
git commit -m "feat(astro): expose fetch option on PdfSearchIntegrationOptions"
```

- [ ] **Step 5: Create the Astro example package**

Create `examples/astro/package.json`:

```json
{
  "name": "@icjia-examples/astro",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev --port 4321",
    "build": "astro build",
    "preview": "astro preview --port 4321",
    "clean": "rm -rf dist .astro .pdf-cache"
  },
  "dependencies": {
    "@astrojs/vue": "^5.0.0",
    "@icjia/astro-pdf-search-index": "workspace:*",
    "@icjia/pdf-search-index": "workspace:*",
    "astro": "^5.0.0",
    "fuse.js": "^7.0.0",
    "vue": "^3.5.0"
  }
}
```

- [ ] **Step 6: Reuse the `local-fetch.mjs` helper**

Create `examples/astro/local-fetch.mjs` with the same body as Task 2 Step 2 (full body re-stated for skim-readers):

```js
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const localFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url));
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(buf.byteLength),
      },
    });
  }
  return fetch(input, init);
};
```

- [ ] **Step 7: Create the Astro config**

Create `examples/astro/astro.config.ts`:

```ts
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import pdfSearch from '@icjia/astro-pdf-search-index';
import { localFetch } from './local-fetch.mjs';

export default defineConfig({
  integrations: [
    vue(),
    pdfSearch({
      collections: ['docs'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: '.astro/.pdf-cache',
      fetch: localFetch,
    }),
  ],
});
```

- [ ] **Step 8: Create the TS config and content collection**

Create `examples/astro/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": ["src/**/*", "astro.config.ts"]
}
```

Create `examples/astro/src/content/config.ts`:

```ts
import { defineCollection, z } from 'astro:content';

const docs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { docs };
```

- [ ] **Step 9: Create the markdown fixture pages**

Each markdown body links to the corresponding fixture via a `file://` URL computed from the repository's absolute path. To avoid hard-coding the absolute path, the example uses a helper inside `astro.config.ts` (the integration's `fetch` resolves them).

The markdown link URLs need to be the **same `file://` URL** the integration will pass to its custom fetch. Use the form `file:///<abs-path>/examples/_fixtures/<name>.pdf`.

Because that absolute path varies per machine, the markdown should use **a placeholder that the integration rewrites** — but the current integration doesn't do rewriting. Instead, generate the markdown at install time:

- [ ] **Step 9a: Write a one-shot script that generates the markdown files**

Create `examples/astro/scripts/generate-content.mjs`:

```js
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
  const url = `file://${resolve(fixturesAbs, filename)}`;
  const md = `---
title: "${title.replace(/"/g, '\\"')}"
---

A random ICJIA-public sample document. The body below links the PDF; the integration walks this body, finds the link, and extracts the PDF's text into the search index.

[Download the PDF](${url})
`;
  await writeFile(resolve(outDir, `${slug}.md`), md);
}
console.log(`Wrote ${entries.length} markdown files referencing ${fixturesAbs}`);
```

- [ ] **Step 9b: Wire the script to `prebuild` / `predev`**

Update `examples/astro/package.json` scripts:

```json
{
  "scripts": {
    "generate:content": "node scripts/generate-content.mjs",
    "predev": "pnpm generate:content",
    "dev": "astro dev --port 4321",
    "prebuild": "pnpm generate:content",
    "build": "astro build",
    "preview": "astro preview --port 4321",
    "clean": "rm -rf dist .astro .pdf-cache src/content/docs"
  }
}
```

(The `clean` script also wipes the generated content collection so a fresh `pnpm build` re-creates it.)

- [ ] **Step 10: Create the Search island + index page**

Create `examples/astro/src/components/Search.vue` — same body as `examples/vue/src/Search.vue` from Task 4 Step 5. (Re-state in full:)

```vue
<template>
  <div class="search">
    <input
      v-model="query"
      type="search"
      placeholder="Search the PDF corpus…"
      autocomplete="off"
      class="search__input"
    />
    <p class="search__meta" aria-live="polite">
      <template v-if="!loaded">Loading search index…</template>
      <template v-else-if="!query.trim()">
        {{ rows.length }} PDF(s) indexed. Try "applicant", "grant", "report".
      </template>
      <template v-else-if="!results.length"> No matches for "{{ query }}". </template>
      <template v-else> {{ results.length }} match(es). </template>
    </p>
    <ul v-if="results.length" class="search__results">
      <li v-for="r in results.slice(0, 50)" :key="r.item.id">
        <a :href="r.item.url" target="_blank" rel="noopener noreferrer">
          <strong>{{ r.item.title }}</strong>
          <p v-if="snippet(r)" class="search__snippet" v-html="snippet(r)"></p>
        </a>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

const rows = ref<IndexedPdf[]>([]);
const fuse = ref<Fuse<IndexedPdf> | null>(null);
const query = ref('');
const loaded = ref(false);

const results = computed<FuseResult<IndexedPdf>[]>(() => {
  if (!fuse.value || !query.value.trim()) return [];
  return fuse.value.search(query.value);
});

function snippet(r: FuseResult<IndexedPdf>): string {
  return snippetHTMLFor(r, { contextChars: 80, matchKey: 'text' });
}

onMounted(async () => {
  const res = await fetch('/searchIndex.pdfs.json');
  rows.value = (await res.json()) as IndexedPdf[];
  fuse.value = new Fuse(rows.value, {
    keys: ['title', 'text'],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
  loaded.value = true;
});
</script>

<style scoped>
.search__input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  border: 2px solid #0d4474;
  border-radius: 4px;
}
.search__meta {
  color: #555;
}
.search__results {
  list-style: none;
  padding: 0;
}
.search__results li {
  margin: 0.5rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.search__results a {
  color: #0d4474;
  text-decoration: none;
}
.search__snippet {
  color: #555;
  font-size: 0.9rem;
  margin-top: 0.4rem;
}
:deep(mark) {
  background: #fff59d;
  padding: 0 2px;
  border-radius: 2px;
}
</style>
```

Create `examples/astro/src/pages/index.astro`:

```astro
---
import Search from '../components/Search.vue';
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PDF Search — Astro example</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
      h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
      p.lede { color: #555; margin-top: 0; }
    </style>
  </head>
  <body>
    <h1>PDF Search — Astro example</h1>
    <p class="lede">
      Astro 5 + Vue 3 island. The integration <code>@icjia/astro-pdf-search-index</code>
      walks the <code>docs/</code> content collection at build time and emits
      <code>public/searchIndex.pdfs.json</code>.
    </p>
    <Search client:idle />
  </body>
</html>
```

- [ ] **Step 11: Create the README**

Create `examples/astro/README.md`:

````markdown
# astro example

An Astro 5 project consuming `@icjia/astro-pdf-search-index`. The integration walks the `docs/` content collection, extracts every linked PDF at build time, and emits `public/searchIndex.pdfs.json`. The page is a static-rendered Astro shell with a Vue 3 search island.

## What it demonstrates

- The full `@icjia/astro-pdf-search-index` integration flow
- The `fetch` option (added in this plan) used to resolve `file://` URLs
- A Vue island on an Astro page (`client:idle` directive)
- The `snippetHTMLFor` helper inside a framework component

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @icjia-examples/astro dev
```

Open <http://localhost:4321/>. The `predev` script generates content-collection markdown that points at the local `examples/_fixtures/*.pdf` files via `file://` URLs; Astro's integration extracts them at build time.

## Build for production

```bash
pnpm --filter @icjia-examples/astro build
pnpm --filter @icjia-examples/astro preview
```

`pnpm build` regenerates the content collection (`prebuild`), then runs `astro build`. Astro's integration emits `dist/searchIndex.pdfs.json`; static pages land in `dist/`.

## Try queries

Open the site, type into the search box:

- `"applicant"` — likely matches the annual report and the FAQ
- `"grant"` — likely matches multiple PDFs
- Any distinctive term from your fixtures

## Real-world deployment

This example uses a custom `fetch` option to resolve `file://` URLs. In production:

```ts
// astro.config.ts
import pdfSearch from '@icjia/astro-pdf-search-index';
export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: 'searchIndex.pdfs.json',
      // No custom fetch — your CMS-authored markdown links to real https URLs.
    }),
  ],
});
```

The integration uses the global `fetch` by default. The `fetch` option is for tests, examples, and air-gapped builds.

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/` (then add a corresponding entry to `scripts/generate-content.mjs` if you want a new markdown page wrapping it). Re-run `pnpm build`.
````

- [ ] **Step 12: Install, build, and verify**

```bash
pnpm install
pnpm --filter @icjia-examples/astro build
node -e "const fs=await import('fs'); const idx=JSON.parse(fs.readFileSync('examples/astro/dist/searchIndex.pdfs.json')); console.log(idx.length, idx[0]?.title)" --input-type=module
ls -la examples/astro/dist/index.html
```

Expected: at least one row (the integration deduplicates across markdown pages but the fixtures should all surface); `dist/index.html` exists.

- [ ] **Step 13: Commit**

```bash
git add examples/astro/ pnpm-lock.yaml
git commit -m "feat(examples): Astro 5 + integration + Vue search island"
```

---

## Task 6: `examples/nextjs` — App Router + Fuse

A Next.js 15 App-Router project with a client component that loads `searchIndex.json` and runs Fuse against it. The index is built by a `prebuild` Node script (same pattern as the Vite example) and copied into `public/` so it ships as a static asset.

**Files:**

- Create: `examples/nextjs/package.json`
- Create: `examples/nextjs/local-fetch.mjs`
- Create: `examples/nextjs/build-index.mjs`
- Create: `examples/nextjs/next.config.mjs`
- Create: `examples/nextjs/tsconfig.json`
- Create: `examples/nextjs/app/layout.tsx`
- Create: `examples/nextjs/app/page.tsx`
- Create: `examples/nextjs/app/Search.tsx`
- Create: `examples/nextjs/README.md`

- [ ] **Step 1: Create the package**

Create `examples/nextjs/package.json`:

```json
{
  "name": "@icjia-examples/nextjs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:index": "node build-index.mjs",
    "predev": "pnpm build:index",
    "dev": "next dev --port 3000",
    "prebuild": "pnpm build:index",
    "build": "next build",
    "start": "next start --port 3000",
    "clean": "rm -rf .next .pdf-cache public/searchIndex.json"
  },
  "dependencies": {
    "@icjia/pdf-search-index": "workspace:*",
    "fuse.js": "^7.0.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Reuse `local-fetch.mjs` and `build-index.mjs`**

Create `examples/nextjs/local-fetch.mjs` with the same body as Task 2 Step 2.

Create `examples/nextjs/build-index.mjs`:

```js
import { indexPdfs } from '@icjia/pdf-search-index';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localFetch } from './local-fetch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', '_fixtures');
const outPath = resolve(here, 'public', 'searchIndex.json');

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
```

- [ ] **Step 3: Create configs**

Create `examples/nextjs/next.config.mjs`:

```js
export default {
  reactStrictMode: true,
};
```

Create `examples/nextjs/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create the App-Router files**

Create `examples/nextjs/app/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

export const metadata = {
  title: 'PDF Search — Next.js example',
  description: 'Search PDFs at build time, surface them in a static React page.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          font: '16px/1.5 system-ui, sans-serif',
          maxWidth: 720,
          margin: '2rem auto',
          padding: '0 1rem',
        }}
      >
        {children}
      </body>
    </html>
  );
}
```

Create `examples/nextjs/app/page.tsx`:

```tsx
import Search from './Search';

export default function Page() {
  return (
    <main>
      <h1>PDF Search — Next.js example</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Next.js 15 (App Router) loading <code>/searchIndex.json</code> on the client and running
        Fuse over it.
      </p>
      <Search />
    </main>
  );
}
```

Create `examples/nextjs/app/Search.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default function Search() {
  const [rows, setRows] = useState<IndexedPdf[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/searchIndex.json')
      .then((r) => r.json())
      .then((j: IndexedPdf[]) => {
        setRows(j);
        setLoaded(true);
      });
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(rows, {
        keys: ['title', 'text'],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true,
      }),
    [rows],
  );

  const results: FuseResult<IndexedPdf>[] = useMemo(
    () => (query.trim() ? fuse.search(query) : []),
    [query, fuse],
  );

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the PDF corpus…"
        style={{
          width: '100%',
          padding: '0.6rem 0.75rem',
          fontSize: '1rem',
          border: '2px solid #0d4474',
          borderRadius: 4,
        }}
      />
      <p style={{ color: '#555' }}>
        {!loaded
          ? 'Loading…'
          : !query.trim()
            ? `${rows.length} PDF(s) indexed. Try "applicant", "grant", "report".`
            : results.length === 0
              ? `No matches for "${query}".`
              : `${results.length} match(es).`}
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.slice(0, 50).map((r) => (
          <li
            key={r.item.id}
            style={{
              margin: '0.5rem 0',
              padding: '0.75rem 1rem',
              border: '1px solid #ddd',
              borderRadius: 4,
            }}
          >
            <a
              href={r.item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#0d4474', textDecoration: 'none', fontWeight: 600 }}
            >
              {r.item.title}
            </a>
            <p
              style={{ color: '#555', fontSize: '0.9rem', marginTop: '0.4rem' }}
              dangerouslySetInnerHTML={{ __html: snippetHTMLFor(r) }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Create the README**

Create `examples/nextjs/README.md`:

````markdown
# nextjs example

Next.js 15 (App Router) consuming the package via a build-time `searchIndex.json` and a client-side Fuse search.

## What it demonstrates

- App Router with one client component (`Search`) using React hooks + Fuse
- `snippetHTMLFor` inside `dangerouslySetInnerHTML`
- The `prebuild` script pattern (same as the Vite + Astro examples)
- Type-safe consumption via `import type { IndexedPdf }`

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @icjia-examples/nextjs dev
```

Open <http://localhost:3000/>. The `predev` hook builds `public/searchIndex.json` before Next starts.

## Build for production

```bash
pnpm --filter @icjia-examples/nextjs build
pnpm --filter @icjia-examples/nextjs start
```

`pnpm build` runs `build-index.mjs` (via `prebuild`), then `next build`. Outputs land in `.next/`.

## Try queries

- `"applicant"` — likely matches the annual report and the FAQ
- `"grant"` — likely matches multiple PDFs
- Any distinctive term from your fixtures

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm dev`.
````

- [ ] **Step 6: Install, build, and verify**

```bash
pnpm install
pnpm --filter @icjia-examples/nextjs build
node -e "const fs=await import('fs'); const idx=JSON.parse(fs.readFileSync('examples/nextjs/public/searchIndex.json')); console.log(idx.length, idx[0]?.title)" --input-type=module
ls -la examples/nextjs/.next/ | head
```

Expected: row count ≥ 3, first title printed, `.next/` directory exists.

- [ ] **Step 7: Commit**

```bash
git add examples/nextjs/ pnpm-lock.yaml
git commit -m "feat(examples): Next.js 15 App Router example"
```

---

## Task 7: `examples/eleventy` — 11ty + Fuse via static include

An 11ty static-site example: an `_data/searchIndex.js` data file builds the index at compile time, the index is also written as a static asset under `_site/searchIndex.json`, and a `search.njk` template renders the page with inline JS that loads Fuse from a CDN.

**Files:**

- Create: `examples/eleventy/package.json`
- Create: `examples/eleventy/local-fetch.mjs`
- Create: `examples/eleventy/build-index.mjs`
- Create: `examples/eleventy/eleventy.config.cjs`
- Create: `examples/eleventy/src/index.njk`
- Create: `examples/eleventy/README.md`

- [ ] **Step 1: Create the package**

Create `examples/eleventy/package.json`:

```json
{
  "name": "@icjia-examples/eleventy",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:index": "node build-index.mjs",
    "predev": "pnpm build:index",
    "dev": "eleventy --serve --port=8080",
    "prebuild": "pnpm build:index",
    "build": "eleventy",
    "clean": "rm -rf _site .pdf-cache src/_data/searchIndex.json"
  },
  "dependencies": {
    "@11ty/eleventy": "^3.0.0",
    "@icjia/pdf-search-index": "workspace:*"
  }
}
```

- [ ] **Step 2: Reuse `local-fetch.mjs`**

Create `examples/eleventy/local-fetch.mjs` with the same body as Task 2 Step 2.

- [ ] **Step 3: Create the build script**

Create `examples/eleventy/build-index.mjs`:

```js
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
```

- [ ] **Step 4: Create the 11ty config**

Create `examples/eleventy/eleventy.config.cjs`:

```js
// 11ty config — 11ty 3.x still expects CommonJS for the config file even
// in an ESM package. The build-index.mjs above is ESM; this config is CJS.
module.exports = function (eleventyConfig) {
  // Pass through the JSON so it ends up at /_site/searchIndex.json too,
  // alongside the data-file copy that's available inside templates.
  eleventyConfig.addPassthroughCopy({ 'src/_data/searchIndex.json': 'searchIndex.json' });

  return {
    dir: { input: 'src', output: '_site' },
    templateFormats: ['njk', 'html'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
};
```

- [ ] **Step 5: Create the page template**

Create `examples/eleventy/src/index.njk`:

```html
---
title: PDF Search — Eleventy example
layout: false
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ title }}</title>
    <style>
      body {
        font:
          16px/1.5 system-ui,
          sans-serif;
        max-width: 720px;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      h1 {
        font-size: 1.5rem;
        margin-bottom: 0.25rem;
      }
      p.lede {
        color: #555;
        margin-top: 0;
      }
      input {
        width: 100%;
        padding: 0.6rem 0.75rem;
        font-size: 1rem;
        border: 2px solid #0d4474;
        border-radius: 4px;
      }
      ul {
        list-style: none;
        padding: 0;
      }
      li {
        margin: 0.5rem 0;
        padding: 0.75rem 1rem;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      li a {
        color: #0d4474;
        text-decoration: none;
        font-weight: 600;
      }
      .snippet {
        color: #555;
        font-size: 0.9rem;
        margin-top: 0.4rem;
      }
      mark {
        background: #fff59d;
        padding: 0 2px;
        border-radius: 2px;
      }
    </style>
  </head>
  <body>
    <h1>{{ title }}</h1>
    <p class="lede">
      Eleventy 3 + Fuse loaded from a CDN. The search index is built at compile time and rendered
      into the page as a JSON island.
    </p>

    <input id="q" type="search" placeholder="Search the PDF corpus…" autocomplete="off" />
    <p id="meta">{{ searchIndex.length }} PDF(s) indexed. Try "applicant", "grant", "report".</p>
    <ul id="results"></ul>

    <script id="rows" type="application/json">
      {{ searchIndex | dump | safe }}
    </script>
    <script type="module">
      import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.esm.js';
      const SNIPPET_CONTEXT = 80;
      const esc = (s) =>
        s.replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
        );
      const collapseWS = (s) => s.replace(/\s+/g, ' ');
      const rows = JSON.parse(document.getElementById('rows').textContent);
      const fuse = new Fuse(rows, {
        keys: ['title', 'text'],
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeMatches: true,
      });
      const q = document.getElementById('q');
      const meta = document.getElementById('meta');
      const list = document.getElementById('results');
      function snippet(r) {
        const m = (r.matches ?? []).find((x) => x.key === 'text');
        if (!m?.indices?.length) return '';
        const [start, end] = m.indices.reduce(
          (b, c) => (c[1] - c[0] > b[1] - b[0] ? c : b),
          m.indices[0],
        );
        const t = r.item.text;
        const a = Math.max(0, start - SNIPPET_CONTEXT);
        const b = Math.min(t.length, end + 1 + SNIPPET_CONTEXT);
        return (
          (a > 0 ? '…' : '') +
          esc(collapseWS(t.slice(a, start))) +
          `<mark>${esc(collapseWS(t.slice(start, end + 1)))}</mark>` +
          esc(collapseWS(t.slice(end + 1, b))) +
          (b < t.length ? '…' : '')
        );
      }
      q.addEventListener('input', () => {
        const v = q.value.trim();
        if (!v) {
          meta.textContent = `${rows.length} PDF(s) indexed. Try "applicant", "grant", "report".`;
          list.innerHTML = '';
          return;
        }
        const results = fuse.search(v).slice(0, 50);
        meta.textContent = `${results.length} match(es) for "${v}".`;
        list.innerHTML = results
          .map(
            (r) =>
              `<li><a href="${r.item.url}" target="_blank" rel="noopener">${esc(r.item.title)}</a><div class="snippet">${snippet(r)}</div></li>`,
          )
          .join('');
      });
    </script>
  </body>
</html>
```

- [ ] **Step 6: Create the README**

Create `examples/eleventy/README.md`:

````markdown
# eleventy example

11ty 3.x static-site example. The search index is built at compile time, written into `src/_data/searchIndex.json`, and injected into the page as an inline JSON island. Fuse loads from a CDN at runtime.

## What it demonstrates

- 11ty's `_data` directory consuming a JSON file produced by `build-index.mjs`
- Passthrough copy so the same JSON ships as `/_site/searchIndex.json` for sites that want to fetch it
- Inline JSON pattern (single round trip, no separate `searchIndex.json` request)

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @icjia-examples/eleventy dev
```

Open <http://localhost:8080/>. The `predev` hook builds `src/_data/searchIndex.json` before 11ty starts.

## Build for production

```bash
pnpm --filter @icjia-examples/eleventy build
```

Outputs land in `examples/eleventy/_site/`. Serve that directory from any static host.

## Try queries

- `"applicant"` — likely matches the annual report and the FAQ
- `"grant"` — likely matches multiple PDFs

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm dev` (or `pnpm build`).
````

- [ ] **Step 7: Install, build, and verify**

```bash
pnpm install
pnpm --filter @icjia-examples/eleventy build
node -e "const fs=await import('fs'); const idx=JSON.parse(fs.readFileSync('examples/eleventy/src/_data/searchIndex.json')); console.log(idx.length, idx[0]?.title)" --input-type=module
ls -la examples/eleventy/_site/index.html examples/eleventy/_site/searchIndex.json
```

Expected: row count ≥ 3, first title printed, both `_site/` artifacts present.

- [ ] **Step 8: Commit**

```bash
git add examples/eleventy/ pnpm-lock.yaml
git commit -m "feat(examples): 11ty 3 example with inline JSON island"
```

---

## Task 8: `examples/nuxt-mixed` — Nuxt 4 + `@nuxt/content` + mocked CMS

Validates `@icjia/nuxt-pdf-search-index` end-to-end. Two content sources: a mock in-process CMS array (representing Strapi-style content) and a couple of `@nuxt/content` markdown files. The server route calls both `extractPdfsFromCmsBody` and `extractPdfsFromContentDoc`, dedupes, and returns the merged result. The page fetches `/api/searchIndex` and runs Fuse client-side.

**Files:**

- Create: `examples/nuxt-mixed/package.json`
- Create: `examples/nuxt-mixed/local-fetch.mjs`
- Create: `examples/nuxt-mixed/nuxt.config.ts`
- Create: `examples/nuxt-mixed/tsconfig.json`
- Create: `examples/nuxt-mixed/content/annual-report.md`
- Create: `examples/nuxt-mixed/content/faq.md`
- Create: `examples/nuxt-mixed/server/api/searchIndex.get.ts`
- Create: `examples/nuxt-mixed/server/utils/mockCms.ts`
- Create: `examples/nuxt-mixed/server/utils/localFetch.ts`
- Create: `examples/nuxt-mixed/scripts/generate-content.mjs`
- Create: `examples/nuxt-mixed/app/pages/index.vue`
- Create: `examples/nuxt-mixed/README.md`

- [ ] **Step 1: Create the package**

Create `examples/nuxt-mixed/package.json`:

```json
{
  "name": "@icjia-examples/nuxt-mixed",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate:content": "node scripts/generate-content.mjs",
    "predev": "pnpm generate:content",
    "dev": "nuxt dev --port 3001",
    "prebuild": "pnpm generate:content",
    "build": "nuxt build",
    "preview": "nuxt preview --port 3001",
    "clean": "rm -rf .nuxt .output .pdf-cache content"
  },
  "dependencies": {
    "@icjia/nuxt-pdf-search-index": "workspace:*",
    "@icjia/pdf-search-index": "workspace:*",
    "@nuxt/content": "^3.0.0",
    "fuse.js": "^7.0.0",
    "nuxt": "^4.0.0"
  }
}
```

- [ ] **Step 2: Reuse `local-fetch.mjs`** (Node version for the `generate-content.mjs` script)

Create `examples/nuxt-mixed/local-fetch.mjs` with the same body as Task 2 Step 2.

- [ ] **Step 3: Create the Nuxt config**

Create `examples/nuxt-mixed/nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index', '@nuxt/content'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
  devtools: { enabled: false },
  compatibilityDate: '2026-05-15',
});
```

- [ ] **Step 4: Create the TS config**

Create `examples/nuxt-mixed/tsconfig.json`:

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

- [ ] **Step 5: Create the content-generation script**

Create `examples/nuxt-mixed/scripts/generate-content.mjs`:

```js
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
  const url = `file://${resolve(fixturesAbs, filename)}`;
  const md = `---
title: "${title.replace(/"/g, '\\"')}"
---

A random ICJIA-public sample document. This page lives in @nuxt/content; its body links the PDF, and the search route extracts the linked PDF's text.

[Download the PDF](${url})
`;
  await writeFile(resolve(outDir, `${slug}.md`), md);
}
console.log(`Wrote ${contentFixtures.length} content/*.md files (mock CMS owns the last fixture).`);
```

- [ ] **Step 6: Create the mock CMS and the server-side localFetch**

Create `examples/nuxt-mixed/server/utils/mockCms.ts`:

```ts
// Mock the kind of payload a Strapi-style CMS would return — id, title, body.
// To exercise the dedupe path realistically, the mock CMS owns exactly ONE
// of the fixtures (the last one alphabetically) — the rest are owned by the
// @nuxt/content source (see scripts/generate-content.mjs).
import { readdirSync } from 'node:fs';
import { resolve, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesAbs = resolve(here, '..', '..', '..', '_fixtures');

function humanize(stem: string): string {
  return stem
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getMockCmsPages(): { id: string; title: string; body: string }[] {
  const pdfs = readdirSync(fixturesAbs)
    .filter((e) => e.toLowerCase().endsWith('.pdf'))
    .sort();
  if (pdfs.length === 0) return [];
  const cmsOwned = pdfs[pdfs.length - 1]!;
  const stem = parse(cmsOwned).name;
  const cleanStem = stem.replace(/-\d{6}T\d{8}$/, '').replace(/-\d{8,}$/, '');
  const title = humanize(cleanStem);
  const url = `file://${resolve(fixturesAbs, cmsOwned)}`;
  return [
    {
      id:
        'cms-' +
        cmsOwned
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40),
      title,
      body: `A random ICJIA-public sample document, served via a mocked CMS: [Download](${url}).`,
    },
  ];
}
```

Create `examples/nuxt-mixed/server/utils/localFetch.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const localFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('file://')) {
    const buf = await readFile(fileURLToPath(url));
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(buf.byteLength),
      },
    });
  }
  return fetch(input, init);
};
```

- [ ] **Step 7: Create the Nitro server route**

Create `examples/nuxt-mixed/server/api/searchIndex.get.ts`:

```ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody, extractPdfsFromContentDoc } from '#imports';
import { queryCollection } from '@nuxt/content/server';
import { getMockCmsPages } from '../utils/mockCms';
import { localFetch } from '../utils/localFetch';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default defineEventHandler(async (event) => {
  // Source 1: mocked CMS rows.
  const cmsRows = getMockCmsPages();
  const cmsPdfs: IndexedPdf[] = [];
  for (const row of cmsRows) {
    cmsPdfs.push(...(await extractPdfsFromCmsBody(row.body, { fetch: localFetch })));
  }

  // Source 2: @nuxt/content markdown collection.
  const docs = await queryCollection(event, 'content').all();
  const contentPdfs: IndexedPdf[] = [];
  for (const doc of docs) {
    contentPdfs.push(...(await extractPdfsFromContentDoc(doc, { fetch: localFetch })));
  }

  // Dedupe by id (same PDF linked from multiple sources → one row).
  const allPdfs = [...new Map([...cmsPdfs, ...contentPdfs].map((p) => [p.id, p])).values()];

  return {
    cms: cmsRows.map((r) => ({ type: 'cms' as const, id: r.id, title: r.title })),
    content: docs.map((d) => ({ type: 'content' as const, id: d.id, title: d.title })),
    pdfs: allPdfs,
  };
});
```

> Note for the executor: `@nuxt/content@3` exposes `queryCollection`. If the installed major is 2.x (which uses `serverQueryContent`), adjust the import + call accordingly — but the recommended dependency in `package.json` is `^3.0.0`, so the above should work as written.

- [ ] **Step 8: Create the page**

Create `examples/nuxt-mixed/app/pages/index.vue`:

```vue
<template>
  <main>
    <h1>PDF Search — Nuxt 4 mixed-content example</h1>
    <p class="lede">
      Nuxt 4 + <code>@nuxt/content</code> + a mocked Strapi-style CMS. The server route at
      <code>/api/searchIndex</code> walks both sources and returns pages, content rows, and deduped
      PDF rows.
    </p>

    <input v-model="query" type="search" placeholder="Search the PDF corpus…" autocomplete="off" />
    <p class="meta" aria-live="polite">
      <template v-if="!loaded">Loading…</template>
      <template v-else-if="!query.trim()">
        {{ all.length }} row(s) indexed ({{ pdfs.length }} PDF(s)). Try "applicant", "grant".
      </template>
      <template v-else-if="!results.length">No matches for "{{ query }}".</template>
      <template v-else>{{ results.length }} match(es).</template>
    </p>
    <ul v-if="results.length" class="results">
      <li v-for="r in results.slice(0, 50)" :key="String(r.item.id)">
        <a
          v-if="(r.item as PdfLike).url"
          :href="(r.item as PdfLike).url"
          target="_blank"
          rel="noopener"
        >
          <strong>{{ r.item.title }}</strong>
        </a>
        <strong v-else>{{ r.item.title }}</strong>
        <p v-if="snippet(r)" class="snippet" v-html="snippet(r)"></p>
      </li>
    </ul>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

interface PdfLike extends IndexedPdf {
  url: string;
}
interface CmsRow {
  type: 'cms';
  id: string;
  title: string;
}
interface ContentRow {
  type: 'content';
  id: string;
  title?: string;
}
type Row = PdfLike | CmsRow | ContentRow;

const all = ref<Row[]>([]);
const pdfs = ref<PdfLike[]>([]);
const fuse = ref<Fuse<Row> | null>(null);
const query = ref('');
const loaded = ref(false);

const results = computed<FuseResult<Row>[]>(() => {
  if (!fuse.value || !query.value.trim()) return [];
  return fuse.value.search(query.value);
});

function snippet(r: FuseResult<Row>): string {
  return 'text' in r.item ? snippetHTMLFor(r as FuseResult<PdfLike>, { matchKey: 'text' }) : '';
}

onMounted(async () => {
  const res = await fetch('/api/searchIndex');
  const body = (await res.json()) as { cms: CmsRow[]; content: ContentRow[]; pdfs: PdfLike[] };
  pdfs.value = body.pdfs;
  all.value = [...body.cms, ...body.content, ...body.pdfs];
  fuse.value = new Fuse(all.value, {
    keys: ['title', 'text'],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
  loaded.value = true;
});
</script>

<style scoped>
main {
  font:
    16px/1.5 system-ui,
    sans-serif;
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem;
}
h1 {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}
p.lede {
  color: #555;
  margin-top: 0;
}
input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  border: 2px solid #0d4474;
  border-radius: 4px;
}
.meta {
  color: #555;
}
.results {
  list-style: none;
  padding: 0;
}
.results li {
  margin: 0.5rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.results a {
  color: #0d4474;
  text-decoration: none;
}
.snippet {
  color: #555;
  font-size: 0.9rem;
  margin-top: 0.4rem;
}
:deep(mark) {
  background: #fff59d;
  padding: 0 2px;
  border-radius: 2px;
}
</style>
```

- [ ] **Step 9: Create the README**

Create `examples/nuxt-mixed/README.md`:

````markdown
# nuxt-mixed example

A Nuxt 4 site that validates `@icjia/nuxt-pdf-search-index` end-to-end against the two content sources the module is designed for: a mocked Strapi-style CMS plus `@nuxt/content` markdown.

## What it demonstrates

- Module registration in `nuxt.config.ts`
- Auto-imported server helpers (`extractPdfsFromCmsBody`, `extractPdfsFromContentDoc`)
- A Nitro `server/api/searchIndex.get.ts` adapted from the package's route template
- The `fetch` option threaded through to resolve `file://` URLs to local fixtures
- Client-side Fuse search across the merged result

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @icjia-examples/nuxt-mixed dev
```

Open <http://localhost:3001/>. The page fetches `/api/searchIndex`, which extracts PDFs from both the mocked CMS array and the `@nuxt/content` markdown collection.

## Build for production

```bash
pnpm --filter @icjia-examples/nuxt-mixed build
pnpm --filter @icjia-examples/nuxt-mixed preview
```

`pnpm build` regenerates the content markdown (`prebuild`), then runs `nuxt build`.

## Try queries

- `"applicant"` — likely matches the annual report and the FAQ
- `"grant"` — likely matches multiple sources
- `"brochure"` — matches the mocked CMS row

## Inspect the API directly

```bash
curl -s http://localhost:3001/api/searchIndex | jq '.pdfs | length'
```

Expected: `3` (one per fixture PDF).

## Real-world deployment

The `localFetch` helper exists only so this example runs offline. In production, your CMS returns absolute https URLs and `@nuxt/content` markdown links to absolute URLs — no custom fetch is needed:

```ts
// server/api/searchIndex.get.ts (production)
const cmsRows = await $fetch('https://cms.example.com/api/pages');
const cmsPdfs = [];
for (const row of cmsRows.data) {
  cmsPdfs.push(...(await extractPdfsFromCmsBody(row.attributes.body)));
}
```

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. To surface a new fixture via the mocked CMS, add an entry to `server/utils/mockCms.ts`. To surface via `@nuxt/content`, add an entry to `scripts/generate-content.mjs`.
````

- [ ] **Step 10: Install, build, and verify**

```bash
pnpm install
pnpm --filter @icjia-examples/nuxt-mixed build
ls -la examples/nuxt-mixed/.output/server/ 2>/dev/null | head
```

Expected: `.output/` exists with a `server/` subdirectory (Nuxt's nitro bundle).

Then start preview and hit the API:

```bash
pnpm --filter @icjia-examples/nuxt-mixed preview &
sleep 4
curl -s http://localhost:3001/api/searchIndex | node -e "let c=''; process.stdin.on('data',d=>c+=d).on('end',()=>{const j=JSON.parse(c); console.log('cms='+j.cms.length, 'content='+j.content.length, 'pdfs='+j.pdfs.length)})"
kill %1 2>/dev/null || true
```

Expected: prints `cms=1 content=N pdfs=N+1` where N = (`.pdf` count − 1). With the four committed fixtures, that's `cms=1 content=3 pdfs=4`.

- [ ] **Step 11: Commit**

```bash
git add examples/nuxt-mixed/ pnpm-lock.yaml
git commit -m "feat(examples): Nuxt 4 mixed CMS + @nuxt/content example"
```

---

## Task 9: Detailed top-level `README.md`

Replace the placeholder root `README.md` with a comprehensive developer-targeted document. Sections: what & why, install, three-line quick start, all entry points, full CLI reference, MCP server reference, side-by-side example comparison, link to each example with its run command, troubleshooting, related projects, license.

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Replace `README.md` in full**

Write the full new contents (this is the entire file — overwrite). Save it as `/Volumes/satechi/webdev/pdf-search-index/README.md`:

````markdown
# @icjia/pdf-search-index

> Full-text PDF search for static sites that already use [Fuse.js](https://www.fusejs.io/). Build-time PDF text extraction, no runtime servers, no native deps.

PDFs become first-class search rows alongside your pages and posts. A query like `"applicant portal"` matches the body of the **linked PDF** — not just the prose that links to it — and returns the PDF as a result with a `<mark>`-highlighted snippet from the surrounding text.

```
                    ┌─────────────────────────────────────────┐
                    │       @icjia/pdf-search-index           │
                    │       (core, pure functions)            │
                    │                                         │
                    │   extractPdfText(url) → string          │
                    │   extractPdfsFromBody(md) → IndexedPdf[]│
                    │   indexPdfs([urls]) → IndexedPdf[]      │
                    │                                         │
                    │   /fuse → createFuseIndex(...)          │
                    │   /snippet → snippetHTMLFor(result)     │
                    │   /mcp → MCP server                     │
                    │   bin → pdf-search-index CLI            │
                    └────┬────────────────────┬───────────────┘
                         │                    │
              ┌──────────┴──────┐  ┌──────────┴──────────┐
              │ @icjia/astro-   │  │ @icjia/nuxt-        │
              │ pdf-search-     │  │ pdf-search-         │
              │ index           │  │ index (Nuxt 4)      │
              └─────────────────┘  └─────────────────────┘
```

| Package                                                              | Version  | Description                                 |
| -------------------------------------------------------------------- | -------- | ------------------------------------------- |
| [`@icjia/pdf-search-index`](./packages/core)                         | `^1.0.0` | Core library, CLI, MCP server, helpers      |
| [`@icjia/astro-pdf-search-index`](./packages/astro-pdf-search-index) | `^1.0.0` | Astro 5 integration                         |
| [`@icjia/nuxt-pdf-search-index`](./packages/nuxt-pdf-search-index)   | `^1.0.0` | Nuxt 4 module (mixed CMS + `@nuxt/content`) |

ESM only. MIT licensed. Node 20 LTS / 22 LTS.

---

## Why this exists

ICJIA sites publish many PDFs — annual reports, FAQs, technical documents, board materials — that are invisible to site search today. Most ICJIA sites use Fuse.js for client-side fuzzy search, which works for pages and news posts but only matches the **prose that links to a PDF**, never the PDF's content.

The fix: extract text from each PDF at build time, append it to the Fuse index as a normal row. Solr has done this for a decade via Tika, but Solr is a JVM-based search **server** — overkill for static sites. This package is the Tika-equivalent without Solr: extract text at build time, output JSON, let the existing client-side search engine handle the query.

The R3 site proved the approach works in ~210 lines of inline code across three files. v1 generalizes that pattern into a publishable package.

---

## The 30-second integration

You already have a static site with Fuse.js. Add PDF content search in three lines:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const pdfRows = await indexPdfs([
  'https://example.com/annual-report-2024.pdf',
  'https://example.com/faqs.pdf',
]);

const allRows = [...yourPageRows, ...pdfRows];
const fuse = new Fuse(allRows, { keys: ['title', 'text'], includeMatches: true });
```

For highlighted snippets in results:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

for (const r of results) {
  console.log(r.item.title, snippetHTMLFor(r));
  // → "Annual Report 2024" "…the <mark>applicant portal</mark> requires…"
}
```

That's the consumer-facing surface. Everything else is configuration.

---

## Install

```bash
npm install @icjia/pdf-search-index
# or
pnpm add @icjia/pdf-search-index
# or
yarn add @icjia/pdf-search-index
```

Optional peer dependencies (only needed if you import the listed entry points):

| Entry point | Peer dependency | Required when                                   |
| ----------- | --------------- | ----------------------------------------------- |
| `/fuse`     | `fuse.js@^7`    | You import `createFuseIndex`                    |
| `/snippet`  | `fuse.js@^7`    | You import `snippetHTMLFor` (uses Fuse's types) |
| `/mcp`      | none            | Always — MCP SDK is bundled                     |

The core `indexPdfs` / `extractPdfText` / `extractPdfsFromBody` functions don't require `fuse.js` at all.

---

## Core API

### `extractPdfText(url, options?) → Promise<string>`

Fetch a PDF and return its text. The lowest-level entry point.

```ts
import { extractPdfText } from '@icjia/pdf-search-index';

const text = await extractPdfText('https://example.com/foo.pdf');
console.log(text.slice(0, 200));
```

**Options** (`ExtractOptions`):

| Option         | Type                             | Default                      | Notes                                            |
| -------------- | -------------------------------- | ---------------------------- | ------------------------------------------------ |
| `cacheDir`     | `string`                         | `'.pdf-cache'`               | Where extracted text is cached on disk           |
| `fetchTimeout` | `number` (ms)                    | `30000`                      | Abort the fetch after this many ms               |
| `maxBytes`     | `number`                         | `100 * 1024 * 1024` (100 MB) | Reject PDFs larger than this                     |
| `fetch`        | `typeof fetch`                   | global `fetch`               | Inject your own (auth headers, `file://`, tests) |
| `cache`        | `'use' \| 'bypass' \| 'refresh'` | `'use'`                      | `bypass` skips read+write; `refresh` overwrites  |
| `mergePages`   | `boolean`                        | `true`                       | When `false`, returns one entry per page         |

### `indexPdfs(urls, options?) → Promise<IndexedPdf[]>`

Batch-index an array of PDF URLs.

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  'https://example.com/a.pdf',
  { url: 'https://example.com/b.pdf', title: 'Custom Title' },
  { url: 'https://example.com/c.pdf', title: 'C', id: 'my-id' },
]);
```

Each entry is either a bare URL string or `{ url, title?, id? }`. Duplicates by URL are deduped (first occurrence wins).

**Additional option** beyond `ExtractOptions`:

| Option        | Type     | Default | Notes                          |
| ------------- | -------- | ------- | ------------------------------ |
| `concurrency` | `number` | `4`     | Parallel fetches via `p-limit` |

### `extractPdfsFromBody(markdown, options?) → Promise<IndexedPdf[]>`

Scan a markdown body for PDF URLs (both `[Title](url.pdf)` markdown links and bare `https://...pdf` URLs), extract each, return rows.

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';

const rows = await extractPdfsFromBody(page.body);
```

Title resolution order: markdown link text > pdf.js info-dict `Title` > humanized filename.

### Indexed row shape

```ts
interface IndexedPdf {
  id: string; // 'pdf-' + first 12 hex chars of SHA-256(url)
  url: string;
  title: string; // see title resolution order
  text: string; // empty string on extraction failure
  pages?: number; // total pages (when known)
  extractedAt?: string; // ISO timestamp; OMITTED on cache hits
}
```

`pages` and `extractedAt` are optional. `extractedAt` is **omitted on cache hits** so the JSON is byte-stable across rebuilds — diffs stay reviewable and CDN caching works.

---

## Fuse helper (`/fuse` entry)

```ts
import { createFuseIndex } from '@icjia/pdf-search-index/fuse';

const fuse = await createFuseIndex({
  urls: ['https://example.com/a.pdf', 'https://example.com/b.pdf'],
  fuseOptions: { threshold: 0.3, includeMatches: true },
});

const results = fuse.search('applicant portal');
```

The defaults Fuse uses (when you pass `fuseOptions`, they're merged on top of):

```ts
{
  keys: ['title', 'text'],
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
}
```

The same defaults are used by the CLI's `search` subcommand and the MCP `search_pdfs` tool — keeping them DRY across surfaces means your CLI/MCP/in-browser results behave the same.

---

## Snippet helper (`/snippet` entry)

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const html = snippetHTMLFor(fuseResult, {
  contextChars: 80,
  matchKey: 'text',
  collapseWhitespace: true,
});
// → "…the <mark>applicant portal</mark> requires registration…"
```

Picks the longest match span in the matched key, slices ±N chars of context, collapses whitespace runs (PDF text reflow is noisy), HTML-escapes everything except the `<mark>` wrap, and adds ellipses where truncated. Safe to feed to `v-html` / `dangerouslySetInnerHTML`.

**Options:**

| Option               | Type      | Default  | Notes                                           |
| -------------------- | --------- | -------- | ----------------------------------------------- |
| `contextChars`       | `number`  | `80`     | Characters of context on each side of the match |
| `matchKey`           | `string`  | `'text'` | Which Fuse `matches` entry to use               |
| `collapseWhitespace` | `boolean` | `true`   | Collapse `\s+` to single space inside output    |

---

## CLI (`pdf-search-index` bin)

```bash
# One-shot: index URLs to JSON
npx @icjia/pdf-search-index https://...pdf https://...pdf

# From a file (one URL per line, # comments allowed)
npx @icjia/pdf-search-index --from urls.txt

# From a sitemap (scans pages for PDF links, indexes them)
npx @icjia/pdf-search-index --from-sitemap https://example.com/sitemap.xml

# Write to a file instead of stdout
npx @icjia/pdf-search-index --out public/searchIndex.json https://...pdf

# Force re-extraction (skip cache read, skip cache write)
npx @icjia/pdf-search-index --refresh https://...pdf
# Refetch but overwrite cache
npx @icjia/pdf-search-index --refresh-all https://...pdf

# Sanity check a single PDF (exit 1 on failure)
npx @icjia/pdf-search-index verify https://...pdf

# Search a previously built JSON
npx @icjia/pdf-search-index search index.json "applicant portal"

# Cache management
npx @icjia/pdf-search-index cache ls           # list cached entries with url, length, pages, extractedAt
npx @icjia/pdf-search-index cache rm <url>     # invalidate one
npx @icjia/pdf-search-index cache clear        # wipe the whole cache
```

**Output formats** (root command):

- Default: pretty JSON to stdout
- `--ndjson`: one row per line
- `--text`: concatenated extracted text, no metadata

**Exit codes:**

- `0` by default, **even on individual PDF failures** (the index stays valid; the failed row has `text: ''`)
- `1` when `--strict` is set and any PDF failed extraction

**Global options:**

| Option                 | Type   | Default      | Notes                                |
| ---------------------- | ------ | ------------ | ------------------------------------ |
| `--from <file>`        | path   | —            | Read URLs from a file (one per line) |
| `--from-sitemap <url>` | url    | —            | Scan a sitemap, index linked PDFs    |
| `--cache-dir <dir>`    | path   | `.pdf-cache` | Cache directory                      |
| `--concurrency <n>`    | number | `4`          | Parallel fetches                     |
| `--out <file>`         | path   | stdout       | Where to write the output            |
| `--strict`             | flag   | off          | Exit 1 if any PDF failed             |
| `--refresh`            | flag   | off          | Refetch (do not write cache)         |
| `--refresh-all`        | flag   | off          | Refetch and overwrite cache          |
| `--ndjson`             | flag   | off          | Emit newline-delimited JSON          |
| `--text`               | flag   | off          | Emit concatenated text only          |

---

## MCP server (`/mcp` entry)

For LLM workflows where the model needs to search inside PDFs during a conversation.

```bash
npx @icjia/pdf-search-index/mcp
```

Wire it into Claude Desktop / Cursor / any MCP-aware client:

```json
{
  "servers": {
    "pdf-search": {
      "command": "npx",
      "args": ["@icjia/pdf-search-index/mcp"]
    }
  }
}
```

**Tools:**

| Tool            | Purpose                                                     |
| --------------- | ----------------------------------------------------------- |
| `extract_pdf`   | Single URL → `{ text, pages }`                              |
| `index_pdfs`    | URL list (or sitemap URL) → `IndexedPdf[]`                  |
| `get_pdf_index` | Returns the cached/built index for the session              |
| `search_pdfs`   | URL list + query → ranked snippets (Fuse-powered, internal) |
| `clear_cache`   | Manual flush                                                |
| `get_status`    | Server / library / pdf.js versions, cache stats             |

All tools accept an optional `cacheDir` so a single-session conversation doesn't pollute the user's persistent cache.

**Auth in v1**: none — the server fetches public URLs only. Add a `fetchHeaders` option when a real consumer needs auth.

---

## Astro integration

```bash
npm install @icjia/pdf-search-index @icjia/astro-pdf-search-index
```

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: '.astro/.pdf-cache',
    }),
  ],
});
```

The integration:

1. Walks each configured content collection.
2. Reads every `.md` / `.mdx` file, strips frontmatter, and passes the body to `extractPdfsFromBody`.
3. Dedupes PDF rows across collections.
4. Writes JSON to `public/<endpoint>` so Astro's build pipeline ships it alongside other static assets.

**Options:**

| Option             | Type           | Default                   | Notes                                             |
| ------------------ | -------------- | ------------------------- | ------------------------------------------------- |
| `collections`      | `string[]`     | (required)                | Names of Astro content collections                |
| `endpoint`         | `string`       | `'searchIndex.pdfs.json'` | Output filename under `public/`                   |
| `cacheDir`         | `string`       | `'.astro/.pdf-cache'`     | Extraction cache                                  |
| `concurrency`      | `number`       | `4`                       | Parallel fetches                                  |
| `contentSourceDir` | `string`       | `'content'`               | Directory under `srcDir` containing collections   |
| `fetch`            | `typeof fetch` | global `fetch`            | Custom fetch (auth, `file://` for tests/examples) |

In production you don't need the `fetch` option — your CMS-authored markdown links to real https URLs.

---

## Nuxt 4 module

```bash
npm install @icjia/pdf-search-index @icjia/nuxt-pdf-search-index
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
});
```

The module auto-imports two helpers into server-side `#imports`:

- `extractPdfsFromCmsBody(body, options?)` — for Strapi-style CMS body strings
- `extractPdfsFromContentDoc(doc, options?)` — for `@nuxt/content` docs (accepts `{ body }`, `{ _raw }`, `{ rawbody }`, or a plain markdown string)

Both honor `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from `nuxt.config.ts` unless overridden by the per-call `options` arg. Both return `IndexedPdf[]`.

A copy-paste Nitro route template lives at [`packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts`](./packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts). Drop it at `server/api/searchIndex.get.ts` in your Nuxt project and adapt the CMS fetch + `@nuxt/content` query to your stack.

---

## Examples

The [`examples/`](./examples) directory has seven runnable example sites, each demonstrating one integration pattern. Every example consumes the packages via the pnpm workspace link and reads PDFs from the shared [`examples/_fixtures/`](./examples/_fixtures) directory via `file://` URLs + a tiny `local-fetch.mjs` helper (so they work offline).

The fixture PDFs in [`examples/_fixtures/`](./examples/_fixtures) are **randomly-clicked public samples from ICJIA's website** ([icjia.illinois.gov](https://icjia.illinois.gov/)). They were not curated to make the examples look good — they're four arbitrary PDFs from the live public corpus, preserved with their original CMS filenames. None of them contain PII. Replace them with any PDFs you like; every example auto-discovers `.pdf` files in that directory at build time. See [`examples/_fixtures/README.md`](./examples/_fixtures/README.md) for the full provenance note.

| Example                               | Stack                               | Adapter / API                                                   | Run                                              |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| [`plain-node`](./examples/plain-node) | Node 20+, no UI                     | Programmatic (`indexPdfs`, `createFuseIndex`, `snippetHTMLFor`) | `pnpm --filter @icjia-examples/plain-node start` |
| [`html`](./examples/html)             | Vanilla HTML + Fuse CDN             | Programmatic, build via Node script                             | `pnpm --filter @icjia-examples/html dev`         |
| [`vue`](./examples/vue)               | Vite + Vue 3 + Fuse                 | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/vue dev`          |
| [`astro`](./examples/astro)           | Astro 5 + Vue island + Fuse         | `@icjia/astro-pdf-search-index`                                 | `pnpm --filter @icjia-examples/astro dev`        |
| [`nextjs`](./examples/nextjs)         | Next.js 15 App Router + Fuse        | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/nextjs dev`       |
| [`eleventy`](./examples/eleventy)     | 11ty 3 + Fuse CDN                   | Programmatic, inline JSON island                                | `pnpm --filter @icjia-examples/eleventy dev`     |
| [`nuxt-mixed`](./examples/nuxt-mixed) | Nuxt 4 + `@nuxt/content` + mock CMS | `@icjia/nuxt-pdf-search-index` (both helpers)                   | `pnpm --filter @icjia-examples/nuxt-mixed dev`   |

### Running the examples (one-time setup)

```bash
git clone https://github.com/ICJIA/pdf-search-index.git
cd pdf-search-index
pnpm install
```

Then drop your own PDFs into `examples/_fixtures/` (or use the committed ones). Each example reads every `.pdf` in that directory and builds a searchable index over them.

For example, to run the Vue example:

```bash
pnpm --filter @icjia-examples/vue dev
# opens http://localhost:5173/
```

### Side-by-side integration code

The core "how does the integration look?" comparison across stacks:

**plain-node (programmatic)**

```js
import { indexPdfs } from '@icjia/pdf-search-index';
const rows = await indexPdfs(['https://example.com/foo.pdf']);
// rows is ready to merge into your Fuse data
```

**Astro (adapter)**

```ts
// astro.config.ts
import pdfSearch from '@icjia/astro-pdf-search-index';
export default defineConfig({
  integrations: [pdfSearch({ collections: ['docs'], endpoint: 'searchIndex.pdfs.json' })],
});
```

**Nuxt (adapter + server route)**

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['@icjia/nuxt-pdf-search-index'] });

// server/api/searchIndex.get.ts
import { extractPdfsFromCmsBody } from '#imports';
export default defineEventHandler(async () => {
  const rows = await $fetch('https://cms.example.com/api/pages');
  const pdfs = [];
  for (const r of rows.data) pdfs.push(...(await extractPdfsFromCmsBody(r.attributes.body)));
  return pdfs;
});
```

**Vite / Next.js / 11ty / vanilla HTML (build-script pattern)**

```js
// build-index.mjs (run as a `prebuild` script)
import { indexPdfs } from '@icjia/pdf-search-index';
import { writeFile } from 'node:fs/promises';
const rows = await indexPdfs([
  /* your PDF URLs */
]);
await writeFile('public/searchIndex.json', JSON.stringify(rows));
```

### What if I want to use my own PDFs?

Drop them into `examples/_fixtures/` and re-run the example. Each example detects every `.pdf` in that directory and indexes all of them.

If you'd rather wire up a totally different URL set, edit the example's `build-index.mjs` (or, for Astro / Nuxt examples, the `scripts/generate-content.mjs` content-generation step). Each example has a comment block explaining where to swap.

---

## Caching

URL-keyed file cache at `<cacheDir>/<hash>.txt` + `<cacheDir>/<hash>.meta.json` sidecar. Cache key = first 16 hex chars of SHA-256(url).

**Read-through, write-back flow:**

1. Look for `<cacheDir>/<key>.txt`. If found, return contents.
2. Fetch the PDF.
3. Run extraction via `unpdf`.
4. Write text + sidecar metadata.
5. Return text.

**No automatic invalidation in v1.** PDFs in most CMS systems are content-addressed at the storage layer (a new version gets a new URL). If a PDF mutates in place at the same URL, run `pdf-search-index --refresh <url>` or `pdf-search-index cache clear`.

ETag-based invalidation is on the post-v1 roadmap; it lands when in-place PDF mutation becomes a real consumer pain point.

---

## Error handling

All failures are **non-fatal by default**. The index stays valid; failed rows have `text: ''`; the build doesn't fail.

| Failure                               | Behavior                                            |
| ------------------------------------- | --------------------------------------------------- |
| Network error (DNS, timeout, refused) | Log warning, return `{ ..., text: '' }`             |
| HTTP non-2xx                          | Log warning with status, return `{ ..., text: '' }` |
| Body bigger than `maxBytes`           | Log warning, return `{ ..., text: '' }`             |
| pdf.js parse error (corrupt PDF)      | Log warning with error message, return empty text   |
| Encrypted PDF (no password)           | Log warning, return empty text                      |
| Image-only / scanned PDF              | Empty text returned silently (no text layer)        |
| Cache write error (disk full, EACCES) | Log warning, return text without caching            |

For CI where a broken upload pipeline should fail the build, run the CLI with `--strict` to flip to `exit 1`.

OCR for scanned PDFs is out of scope for v1 — it lands in a separate `@icjia/pdf-search-index-ocr` package when a real consumer needs it.

---

## Troubleshooting

**My index has rows but `text` is empty.**
The PDF is likely image-only / scanned. Open it in a viewer; if you can't select text, neither can `pdf.js`. OCR is on the post-v1 roadmap.

**`fetch error … TypeError: fetch failed`**
Some PDF hosts reject default Node user agents or require cookies. Pass a custom `fetch` (or `fetchHeaders` once that ships) with appropriate headers.

**`unpdf` errors on a real but old PDF.**
`unpdf` wraps `pdfjs-dist`. Very old (pre-1.4) PDFs occasionally fail to parse. Re-export the PDF from Acrobat to a current version, or fall back to `pdf-parse` by writing your own extractor function and passing it via a fork (no plugin slot in v1; `unpdf` covers ~99% of real PDFs).

**The CLI works but my framework integration emits an empty index.**
Check that the markdown bodies actually contain PDF URLs the regex picks up: `[Title](url.pdf)` markdown links or bare `https://...pdf` URLs. Relative paths (`/foo.pdf`) won't be fetched — the extractor needs an absolute URL. For build-time integration with relative paths, see [the `fetch` option](#core-api) — pass a custom `fetch` that resolves your site's URLs.

**My CI build is slow.**
First build is genuinely O(N PDFs) bytes-downloaded + parse-time. Subsequent builds hit the cache. Persist `.pdf-cache/` between CI runs (GitHub Actions: `actions/cache@v4` keyed on a stable cache key).

---

## Limits and non-goals

- **Not a search server.** No HTTP query endpoint, no inverted index, no live re-indexing. (For those, use Solr or Elasticsearch.)
- **Not OCR.** Image-only / scanned PDFs return empty text in v1.
- **Not multi-format.** `.docx`, `.xlsx`, `.pptx` are out of scope. Different format = different extractor; they belong in sibling packages.
- **Not a Fuse competitor.** We emit JSON. Consumers pick their search engine.
- **No automatic ETag-based cache invalidation in v1.**
- **Scale target: 10–1,000 PDFs per site.** Above that, look at server-side indexers.

---

## Development

```bash
git clone https://github.com/ICJIA/pdf-search-index.git
cd pdf-search-index
pnpm install

pnpm test           # run vitest across all packages
pnpm typecheck      # strict TS across all packages
pnpm lint           # oxlint
pnpm format:check   # prettier
pnpm build          # tsup / unbuild per package
```

Releases are published from `main` via the `release.yml` GitHub Actions workflow on a successful merge of a changesets-generated Release PR. The v1.0.0 release was hand-cut (see commit `chore: release v1.0.0`) because changesets' 0.x semver rules don't cleanly handle a `0.x → 1.0` bump — future patch / minor / major bumps use the standard changesets flow.

To add a changeset for your contribution:

```bash
pnpm changeset
```

Pick the packages your change touches; pick the severity (`patch` / `minor` / `major`); write a 1-line description.

---

## Design docs

- [v1.0 design spec](./docs/superpowers/specs/2026-05-15-pdf-search-index-design.md) — what was decided and why
- [Original design seed](./docs/PDF_SEARCH_DESIGN.md) — pre-brainstorm draft
- [R3 reference impl](./docs) — the inline scripts the package generalizes from (`pdfText.ts`, `searchIndex.json.ts`, `Search.vue`)
- [Implementation plans](./docs/superpowers/plans/) — Plan 1 (foundation), Plan 2 (cleanup + adapters), Plan 3 (examples + README + release)

---

## License

MIT — see [LICENSE](./LICENSE).
````

- [ ] **Step 2: Lint and format-check the new README**

```bash
pnpm format:check README.md || pnpm format -- README.md
pnpm lint
```

Expected: prettier formats the file in place if needed; oxlint has nothing to lint on a markdown file but the command should exit 0.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: detailed top-level README covering all packages, CLI, MCP, examples"
```

---

## Task 10: `v1.0.0` version bump + CHANGELOG entries

Hand-edit each package's `package.json` to `1.0.0` and write a v1.0.0 entry in each `CHANGELOG.md`. Refresh the lockfile, run the full check suite, and dry-run publish.

**Files:**

- Modify: `packages/core/package.json`
- Modify: `packages/core/CHANGELOG.md`
- Modify: `packages/astro-pdf-search-index/package.json`
- Modify: `packages/astro-pdf-search-index/CHANGELOG.md` (create if missing — Plan 2 only added the astro-side changelog if any changeset existed; verify presence)
- Modify: `packages/nuxt-pdf-search-index/package.json`
- Modify: `packages/nuxt-pdf-search-index/CHANGELOG.md` (create if missing)

- [ ] **Step 1: Bump `@icjia/pdf-search-index` to 1.0.0**

In `packages/core/package.json`, change `"version": "0.1.0"` to `"version": "1.0.0"`.

- [ ] **Step 2: Add a v1.0.0 entry to `packages/core/CHANGELOG.md`**

Open `packages/core/CHANGELOG.md`. Prepend the new entry **above** the existing `## 0.1.0` section (changesets convention is reverse-chronological), keeping the existing `## 0.1.0` intact below it:

```markdown
# @icjia/pdf-search-index

## 1.0.0

### Major Changes

- First stable release. The 0.1.0 surface is unchanged; this bump marks API stability.

### Minor Changes

- (No new features beyond 0.1.0.)

### Patch Changes

- (No fixes beyond 0.1.0.)

## 0.1.0

### Minor Changes

- Initial 0.1.0 release.
  - `extractPdfText(url, options?)` — single-URL extraction with file cache
  - `indexPdfs(urls, options?)` — batch indexer with `p-limit(4)` concurrency
  - `extractPdfsFromBody(markdown, options?)` — scan markdown for linked PDFs and index them
  - `createFuseIndex` (`/fuse` entry) — build a Fuse instance over a list of PDFs
  - `snippetHTMLFor` (`/snippet` entry) — render a `<mark>`-highlighted snippet around a Fuse match
  - `pdf-search-index` CLI — index URLs, scan sitemaps, verify, search, manage cache
  - `/mcp` entry — MCP server exposing `extract_pdf`, `index_pdfs`, `get_pdf_index`, `search_pdfs`, `clear_cache`, `get_status`
```

- [ ] **Step 3: Bump `@icjia/astro-pdf-search-index` to 1.0.0**

In `packages/astro-pdf-search-index/package.json`, change `"version": "0.0.0"` to `"version": "1.0.0"`.

- [ ] **Step 4: Create or update `packages/astro-pdf-search-index/CHANGELOG.md`**

If the file doesn't exist, create it with the following contents. If it exists (Plan 2 may have generated it), prepend the v1.0.0 entry above any existing entries:

```markdown
# @icjia/astro-pdf-search-index

## 1.0.0

### Major Changes

- First stable release.
  - Astro 5 integration: scans configured content collections at build time, extracts every linked PDF, emits `public/<endpoint>.json`.
  - `fetch` option for custom fetch implementations (auth, `file://` for tests/examples).
  - Re-exports `IndexedPdf` / `IndexPdfsOptions` types from `@icjia/pdf-search-index` so consumers only need this package for type annotations.
```

- [ ] **Step 5: Bump `@icjia/nuxt-pdf-search-index` to 1.0.0**

In `packages/nuxt-pdf-search-index/package.json`, change `"version": "0.0.0"` to `"version": "1.0.0"`.

- [ ] **Step 6: Create or update `packages/nuxt-pdf-search-index/CHANGELOG.md`**

If the file doesn't exist, create it with the following contents. If it exists, prepend the v1.0.0 entry above any existing entries:

```markdown
# @icjia/nuxt-pdf-search-index

## 1.0.0

### Major Changes

- First stable release.
  - Nuxt 4 module: registers `extractPdfsFromCmsBody` and `extractPdfsFromContentDoc` as auto-imported server helpers.
  - Module options (`cacheDir`, `concurrency`) flow through to helpers via `runtimeConfig`.
  - Copy-paste Nitro server-route template at `runtime/server/route-template.ts` for mixed CMS + `@nuxt/content` sites.
```

- [ ] **Step 7: Refresh the lockfile and run the full check suite**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Expected: every command exits 0. If `format:check` fails, run `pnpm format` to auto-fix, then re-run `format:check`.

- [ ] **Step 8: Dry-run publish each package**

```bash
pnpm --filter @icjia/pdf-search-index publish --dry-run --access public --no-git-checks
pnpm --filter @icjia/astro-pdf-search-index publish --dry-run --access public --no-git-checks
pnpm --filter @icjia/nuxt-pdf-search-index publish --dry-run --access public --no-git-checks
```

Expected each: prints the tarball contents (only `dist/`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`-equivalent files). Confirm no `src/` or `test/` leaked.

- [ ] **Step 9: Commit**

```bash
git add packages/core/package.json packages/core/CHANGELOG.md packages/astro-pdf-search-index/package.json packages/astro-pdf-search-index/CHANGELOG.md packages/nuxt-pdf-search-index/package.json packages/nuxt-pdf-search-index/CHANGELOG.md pnpm-lock.yaml
git commit -m "chore: release v1.0.0 across all three packages"
```

---

## Task 11: Final verification + tag + push + publish

Push the branch, open a PR to `main`, merge, tag each package's v1.0.0, push tags, and manually publish to npm. Then write a Plan 3 "Done" recap and update memory.

**Files:**

- Modify: `MEMORY.md` (the auto-memory index at `/Users/cschweda/.claude/projects/-Volumes-satechi-webdev-pdf-search-index/memory/MEMORY.md`)

- [ ] **Step 1: Push `feat/v1-release` to GitHub**

```bash
git push -u origin feat/v1-release
```

- [ ] **Step 2: Open a PR to `main`**

```bash
gh pr create --base main --head feat/v1-release \
  --title "v1.0.0: examples, detailed README, coordinated release" \
  --body "$(cat <<'EOF'
## Summary

- Adds seven runnable framework examples in \`examples/*\` (plain-node, html, vue, astro, nextjs, eleventy, nuxt-mixed) sharing a single PDF fixture set in \`examples/_fixtures/\`
- Adds a \`fetch\` option to \`@icjia/astro-pdf-search-index\` so consumers can pass a custom fetch (used by the example for \`file://\` URL resolution)
- Replaces the placeholder top-level README with a detailed developer-targeted document covering core API, CLI, MCP server, both adapters, all examples, troubleshooting
- Bumps all three packages to v1.0.0 with CHANGELOG entries

## Test plan

- [ ] CI green on Node 20 and Node 22
- [ ] \`pnpm install && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build\` clean locally
- [ ] Each example runs: \`pnpm --filter @icjia-examples/<name> dev\` opens correctly
- [ ] Dry-run publish shows clean tarball contents for all three packages
EOF
)"
```

- [ ] **Step 3: Wait for CI to go green on the PR**

```bash
gh pr checks --watch
```

Expected: all required checks pass (the test matrix on Node 20 + 22).

- [ ] **Step 4: Merge the PR**

```bash
gh pr merge --merge --delete-branch
```

(`--merge` for a merge commit; switch to `--squash` if the project convention preferred squash — Plan 2 used merge commits per the recent history pattern, so stick with merge.)

- [ ] **Step 5: Update `main` locally and tag**

```bash
git checkout main
git pull --ff-only
git tag @icjia/pdf-search-index@1.0.0
git tag @icjia/astro-pdf-search-index@1.0.0
git tag @icjia/nuxt-pdf-search-index@1.0.0
git tag v1.0.0
git push origin --tags
```

Expected: all four tags push successfully. The three scoped tags are npm-standard per-package tags; `v1.0.0` is a human-readable repo-wide tag.

- [ ] **Step 6: Publish to npm**

```bash
pnpm install
pnpm build
pnpm --filter @icjia/pdf-search-index publish --access public --no-git-checks
pnpm --filter @icjia/astro-pdf-search-index publish --access public --no-git-checks
pnpm --filter @icjia/nuxt-pdf-search-index publish --access public --no-git-checks
```

Expected: each publish prints `+ @icjia/<package>@1.0.0` and exits 0.

> **Note:** if the user prefers the `release.yml` workflow to handle publication on the next changesets-driven release instead, skip the manual publish here and confirm only the dry-run was successful. The first post-v1.0 changeset will then trigger a regular automated release.

- [ ] **Step 7: Verify on npm**

```bash
npm view @icjia/pdf-search-index version
npm view @icjia/astro-pdf-search-index version
npm view @icjia/nuxt-pdf-search-index version
```

Expected each: prints `1.0.0`.

- [ ] **Step 8: Smoke-test the published packages**

In a scratch directory away from this repo:

```bash
mkdir /tmp/pdf-search-smoke && cd /tmp/pdf-search-smoke
npm init -y
npm install @icjia/pdf-search-index@1.0.0
node -e "import('@icjia/pdf-search-index').then(m => console.log(Object.keys(m).sort()))"
```

Expected: prints an array including `extractPdfText`, `extractPdfsFromBody`, `indexPdfs`, plus the re-exported types. No import errors.

- [ ] **Step 9: Update the auto-memory index**

Edit `/Users/cschweda/.claude/projects/-Volumes-satechi-webdev-pdf-search-index/memory/plan-structure-and-progress.md` to mark Plan 3 done and v1.0.0 shipped. Then update `MEMORY.md` if the description for that entry needs a refresh.

The structure-and-progress memory should now read something like:

```markdown
---
name: plan-structure-and-progress
description: v1.0 shipped 2026-05-15. All three packages at 1.0.0 on npm. Future patches use standard changesets flow.
metadata:
  type: project
---

# v1.0 shipped

- Plan 1 (foundation) → 91c2260, tag @icjia/pdf-search-index@0.1.0
- Plan 2 (cleanup + adapters) → 70ddfa2 on feat/v1-adapters, merged to main
- Plan 3 (examples + README + release) → merged to main, tag v1.0.0
- All three packages published to npm at 1.0.0

**Why:** v1.0 marks the stable surface — `extractPdfText`, `extractPdfsFromBody`, `indexPdfs`, plus `/fuse` and `/snippet` and `/mcp` entries on core; `pdfSearchIntegration` on astro; `extractPdfsFromCmsBody` and `extractPdfsFromContentDoc` on nuxt.

**How to apply:** Future bumps go through changesets normally. Don't hand-edit versions again unless we hit another 0.x → 1.0-style transition (which is now impossible for these packages).
```

- [ ] **Step 10: Final commit (memory only — no repo changes)**

The repo state is final; no further commits to the project repo. The memory edit is local-only.

---

## Done

After Plan 3 lands, the v1.0 release is shipped:

| Surface                               | Where it lives                          | State     |
| ------------------------------------- | --------------------------------------- | --------- |
| `@icjia/pdf-search-index@1.0.0`       | npm + `packages/core`                   | Published |
| `@icjia/astro-pdf-search-index@1.0.0` | npm + `packages/astro-pdf-search-index` | Published |
| `@icjia/nuxt-pdf-search-index@1.0.0`  | npm + `packages/nuxt-pdf-search-index`  | Published |
| 7 framework examples                  | `examples/*`                            | Runnable  |
| Detailed top-level README             | `README.md`                             | Complete  |
| `examples/_fixtures/` (3-4 PDFs)      | repo                                    | Committed |
| Git tags                              | `@icjia/<pkg>@1.0.0` ×3 + `v1.0.0`      | Pushed    |

### What's deferred to post-v1

| Feature                                    | Plan                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| OCR for scanned PDFs                       | Separate package `@icjia/pdf-search-index-ocr` when a real consumer site needs it |
| ETag-based cache invalidation              | When in-place PDF mutation becomes a real pain point                              |
| Auth-protected PDF sources                 | When a consumer needs it; ships as `fetchHeaders` option                          |
| Multi-format siblings (docx/xlsx/pptx)     | Separate packages when prioritized                                                |
| PDF metadata index (author, subject, etc.) | Easy add later; not in v1 scope                                                   |
| Per-page snippet links (`...#page=N`)      | Requires `mergePages: false` adoption first                                       |

### Rollout order (per spec section 22)

1. **R3** — already has the inline reference; swap for the npm package. No behavior change; validates the API.
2. **Target Nuxt 4 site** — first real Nuxt 4 adapter integration. Validates the mixed CMS + `@nuxt/content` path.
3. **i2i and other Astro ICJIA sites** — proves drop-in works on peer Astro sites.
4. **DVFR (`dvfr.illinois.gov`)** — second Astro integration.
5. **Smaller / older ICJIA sites** — case-by-case.
