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

Phrases that match the committed ICJIA-public fixtures (randomly chosen, not curated — see `examples/_fixtures/README.md`):

- `"stigma"` — matches "Stigma PDF for posting"
- `"methamphetamine"` — matches the meth-trends overview
- `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm dev` (the `predev` hook rebuilds the index).
