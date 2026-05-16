# netlify-demo — the polished, deployable example

**Live: <https://icjia-pdf-search.netlify.app/>**

This is the **flagship live demo** for the `@icjia/pdf-search-index` package: an Astro 5 site with a Vue 3 search island, the canonical `@icjia/astro-pdf-search-index` integration, a hand-designed dark-mode UI, and a `netlify.toml` so deploying it to Netlify is a one-click operation.

If you're skimming the repo trying to figure out what a real production-shaped consumer site looks like, **start here** — not in `examples/astro/`. That one is the minimal "does the integration work?" smoke test. This one is what you'd actually ship.

## What you'll see

- A dark-mode single-page site with a sticky search bar, three numbered "how it works" steps, a corpus listing of the indexed PDFs, and a live result list with `<mark>`-highlighted snippets.
- The full `@icjia/astro-pdf-search-index` integration flow: build-time PDF extraction via `pdf.js`, JSON output to `public/searchIndex.pdfs.json`, client-side fuzzy search via Fuse.js.
- A two-URL pattern (file:// at build time, `/pdfs/*` at runtime) — see the architecture note below.
- A live Fuse.js options tuner exposing all 13 v7.4-beta options (`threshold`, `distance`, `location`, `ignoreLocation`, `minMatchCharLength`, `isCaseSensitive`, `includeScore`, `shouldSort`, `findAllMatches`, `ignoreFieldNorm`, `fieldNormWeight`, `useExtendedSearch`, plus a custom `tokenSearch` toggle), with a live `new Fuse(...)` config preview that updates as you flip switches.
- A token-search wrapper (`tokenizeAndSearch` in `Search.vue`) — splits multi-word queries into whitespace tokens, runs `fuse.search()` per token, and merges hits by best score with a token-hit count tiebreaker. Improves recall for short queries like "drug testing" where either word alone is a useful hit. Default on; disabled when `useExtendedSearch` is selected (extended already has its own token operators).
- A multi-region snippet picker (`distributeMatches` in `Search.vue`) — buckets `matches[].indices` across document position so the multi-snippet output draws from intro / middle / end, not from the densest cluster. Combined with `snippetHTMLFor(..., { maxSnippets: 8 })` you get up to 8 highlighted passages spread across each result PDF.
- A match-count badge on result cards ("12 MATCHES") that reflects every body-text match span, not just the rendered ones.
- A "Needs OCR — title only" badge for image-only PDFs (the two image-only fixtures `Seniors.pdf` and `Female Criminality.pdf` always surface in this state).
- An expandable "Inspect the search index" block (`<details>`) showing the raw `IndexedPdf[]` JSON the page consumed.
- A bundled Mozilla pdf.js viewer at `public/pdfjs-viewer/` (~7 MB on disk after trimming, ~2 MB gzipped) so result clicks open the PDF with the search term pre-filled in the viewer's find bar — reliably across Chrome, Edge, Firefox, and Safari.

The indexed PDFs are randomly-clicked public samples from [icjia.illinois.gov](https://icjia.illinois.gov/) committed at [`examples/_fixtures/`](../_fixtures/) — they cover juvenile justice, public health, evaluation reports, and other ICJIA programmatic topics. Drop in your own PDFs and re-run; everything auto-discovers.

## Local quick-start

From the monorepo root:

```bash
pnpm install
pnpm --filter @icjia-examples/netlify-demo dev
```

Open <http://localhost:4322/>. The `predev` script:

1. Copies every `.pdf` from `examples/_fixtures/` into `public/pdfs/` so the served site can link to them at `/pdfs/<filename>`.
2. Writes one markdown file per PDF into `src/content/docs/` with a `file://` URL in the body. The Astro integration walks that content collection at build time, reads the PDFs through `local-fetch.mjs`, and emits the search-index JSON.

## Build for production

```bash
pnpm --filter @icjia-examples/netlify-demo build
pnpm --filter @icjia-examples/netlify-demo preview
```

The `build` command produces:

- `dist/index.html` — the static-rendered page.
- `dist/searchIndex.pdfs.json` — the search index, one row per PDF, ready for the Vue island to fetch on mount.
- `dist/pdfs/*.pdf` — one entry per indexed PDF, served verbatim at `/pdfs/<filename>` with long-lived `Cache-Control: immutable` headers.

## Deploy to Netlify — the long version

This site is designed to deploy to Netlify with no manual config beyond pointing Netlify at the repo. The included `netlify.toml` handles base directory, build command, publish directory, Node version, and asset headers.

**Steps:**

1. **Fork or clone** [`https://github.com/ICJIA/pdf-search-index`](https://github.com/ICJIA/pdf-search-index) so Netlify can read it.
2. **Sign in** at [https://app.netlify.com](https://app.netlify.com). The free tier is sufficient for this demo.
3. Click **"Add new site" → "Import from Git"** and authorize Netlify against your GitHub account.
4. Pick the `pdf-search-index` repository.
5. In the build-settings dialog, **leave most defaults**, but confirm:
   - **Base directory**: `examples/netlify-demo`
   - **Build command**: `pnpm install --frozen-lockfile=false && pnpm build` _(auto-detected from `netlify.toml`)_
   - **Publish directory**: `dist` _(auto-detected from `netlify.toml`)_
   - **Node version**: `22` _(auto-detected from `netlify.toml`'s `NODE_VERSION`)_
6. Click **Deploy site**. Netlify clones the repo, runs `pnpm install` then `pnpm build` from the `examples/netlify-demo` directory, and gives you a live URL like `https://YOUR-SITE-NAME.netlify.app` within ~2 minutes.

Subsequent pushes to `main` (or whichever branch you point Netlify at) trigger automatic redeploys. Pull requests get deploy previews automatically.

### After your first deploy

Update `astro.config.ts`'s `site:` field to match your Netlify subdomain so Astro's canonical URLs are correct in the rendered HTML:

```ts
export default defineConfig({
  site: 'https://YOUR-SITE-NAME.netlify.app',
  // ...
});
```

Commit that change and Netlify will pick it up on the next push.

### Troubleshooting deploys

**pnpm not found / wrong version.** Netlify reads `PNPM_VERSION` from `netlify.toml`. If your fork uses a different pnpm version, edit `[build.environment]`.

**Build times out.** The first build downloads + parses every PDF (no cache yet). Subsequent builds are O(1) per PDF until you change the corpus. If you have a large corpus and run into Netlify's 15-min build limit, persist `.pdf-cache/` between builds with a Netlify build cache plugin.

**Broken links to PDFs.** Check that `dist/pdfs/` is populated after a build; if it's empty, the `copy:pdfs` prebuild step failed. Run `pnpm --filter @icjia-examples/netlify-demo build` locally to reproduce.

## In-PDF highlighting via Mozilla pdf.js viewer

Clicking a result in the search list opens the PDF in a bundled copy of Mozilla's [pdf.js](https://github.com/mozilla/pdf.js) viewer with the search term pre-filled in the viewer's find bar and every occurrence highlighted in the rendered page.

**Why we bundle it.** The PDF viewer's `#search=<query>` URL fragment works reliably only in Firefox — Firefox's built-in PDF viewer _is_ pdf.js. Chrome and Edge (PDFium) silently ignore it. Safari is inconsistent. Bundling Mozilla's own viewer at `/pdfjs-viewer/web/viewer.html` gives the same fragment-driven highlight behaviour in every browser.

**How it works.** A prebuild script ([`scripts/copy-pdfjs-viewer.mjs`](./scripts/copy-pdfjs-viewer.mjs)) downloads the matching `pdfjs-<version>-dist.zip` from Mozilla's GitHub releases (the version is pinned by the [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) npm dep in `package.json`) and extracts it to `public/pdfjs-viewer/`. Result-card links in `Search.vue` transform `/pdfs/<file>.pdf` into `/pdfjs-viewer/web/viewer.html?file=/pdfs/<file>.pdf#search=<query>`. The viewer reads the fragment on load, opens its find bar with the query already typed, jumps to the first match, and highlights every other occurrence.

**Cost.** ~7 MB on disk after trimming source maps and non-English locales; closer to ~2 MB gzipped over the wire. Long-cached via the `[[headers]]` rule in `netlify.toml` (`Cache-Control: public, max-age=31536000, immutable`) — the assets are versioned by the `pdfjs-dist` version we install, so a bump rotates the URL space and invalidates the cache automatically.

**Same-origin requirement.** The viewer can only load PDFs from the same origin (or remote origins with CORS configured). Our `/pdfs/*` paths are same-origin so this works without ceremony; a real consumer site loading PDFs from a remote CMS would need CORS on the CMS.

**Fuse vs viewer find semantics — known limitation.** Fuse does fuzzy matching; the viewer's `#search=` triggers a literal case-insensitive substring search. A query like "applicent" can match Fuse's result for "applicant portal" but the viewer's find won't surface highlights — the PDF still opens, the user can correct the term in the find bar. This is expected.

**Disabling the viewer.** If you'd rather rely on the browser's native PDF viewer (and accept the lost cross-browser highlight behaviour):

1. In `src/components/Search.vue`, remove the `viewerUrl` helper and change `:href="viewerUrl(r)"` back to `:href="publicPdfUrl(r.item.url)"`.
2. Drop `"copy:pdfjs-viewer": "..."` from `package.json` and remove it from `prebuild` / `predev`.
3. Remove `pdfjs-dist` from `dependencies` and re-run `pnpm install`.
4. Drop the `[[headers]] for = "/pdfjs-viewer/*"` block in `netlify.toml`.

The viewer assets directory and the cached release zip live under `public/pdfjs-viewer/` and `.pdfjs-cache/` respectively — both are gitignored and rebuilt on every `pnpm dev` / `pnpm build`.

## Architecture — the two-URL pattern

The same PDF is referenced by two different URLs:

| URL form                      | When                                 | Why                                                                                                                                   |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `file:///abs/path/to/foo.pdf` | Build time (in `src/content/docs/*`) | The Astro integration walks markdown bodies for PDF links; `local-fetch.mjs` resolves `file://` to a local read.                      |
| `/pdfs/foo.pdf`               | Runtime (in the deployed page)       | The browser can't see `file://` URLs from a different origin. `scripts/copy-pdfs.mjs` copies the PDF into `public/pdfs/` for serving. |

The `publicPdfUrl(fileUrl)` helper in `Search.vue` does the mapping — it pulls the basename out of the index's `url` field and prepends `/pdfs/`.

In a real production site, you'd skip this entirely:

- Your CMS or static-files folder serves PDFs at real HTTPS URLs.
- You'd drop the `fetch: localFetch` option from `astro.config.ts`.
- The integration uses the global `fetch` against your live URLs, and the same URL works at runtime.

This demo uses the two-URL pattern only so the example is hermetic and deployable from a fresh clone with no external dependencies.

## File layout

```
examples/netlify-demo/
├── .gitignore
├── README.md                          # this file
├── astro.config.ts                    # @icjia/astro-pdf-search-index wiring
├── local-fetch.mjs                    # resolves file:// URLs at build time
├── netlify.toml                       # Netlify build config + asset headers
├── package.json
├── tsconfig.json
├── scripts/
│   ├── copy-pdfs.mjs                  # examples/_fixtures/*.pdf → public/pdfs/
│   ├── copy-pdfjs-viewer.mjs          # fetches & vendors Mozilla pdf.js viewer
│   └── generate-content.mjs           # writes src/content/docs/*.md with file:// URLs
├── public/
│   ├── pdfs/                          # populated by copy-pdfs.mjs at build
│   └── pdfjs-viewer/                  # populated by copy-pdfjs-viewer.mjs at build
└── src/
    ├── components/
    │   └── Search.vue                 # Vue 3 island — sticky search bar + results
    ├── content/
    │   ├── config.ts                  # Astro content-collection schema
    │   └── docs/                      # populated by generate-content.mjs at build
    └── pages/
        └── index.astro                # the front page
```

`public/pdfs/`, `public/pdfjs-viewer/`, and `src/content/docs/` are gitignored; all three are regenerated on every `dev`/`build`.

## Swap in your own PDFs

Replace any file in [`examples/_fixtures/`](../_fixtures/) with your own. Both prebuild scripts auto-discover every `.pdf` in that directory — no hard-coded filenames. Re-run `pnpm dev` or `pnpm build`.

## See also

- [Top-level README](../../README.md) — full project documentation.
- [`packages/astro-pdf-search-index/README.md`](../../packages/astro-pdf-search-index/README.md) — standalone integration guide for the Astro adapter.
- [`examples/astro/`](../astro/) — the minimal Astro example this demo is built on top of.
- [`AGENTS.md`](../../AGENTS.md) — guidance for AI coding agents integrating the package.
