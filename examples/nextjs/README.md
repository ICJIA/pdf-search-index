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

Phrases that match the committed ICJIA-public fixtures (randomly chosen — see `examples/_fixtures/README.md`):

- `"stigma"` — matches "Stigma PDF for posting"
- `"methamphetamine"` — matches the meth-trends overview
- `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm dev`.
