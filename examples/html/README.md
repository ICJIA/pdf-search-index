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
Indexing 4 PDF(s)…
Wrote /…/examples/html/public/searchIndex.json (4 rows)
```

## Use the CLI instead of the build script

The `build-index.mjs` uses the programmatic API. If you'd rather drive the CLI:

```bash
# from examples/html
npx @icjia/pdf-search-index https://example.com/foo.pdf https://example.com/bar.pdf --out public/searchIndex.json
```

(That requires real HTTPS URLs; the file-fixture demo only works through the programmatic API because the CLI doesn't accept a custom `fetch` function.)

## Try queries

Phrases that match the committed ICJIA-public fixtures (see `examples/_fixtures/README.md` for provenance — they're randomly chosen, not curated):

- `"stigma"` — matches "Stigma PDF for posting"
- `"methamphetamine"` — matches the meth-trends overview
- `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot
- Any 4+ letter word lifted from any fixture's body — searches are fuzzy by default (`threshold: 0.3`)

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm build`.
