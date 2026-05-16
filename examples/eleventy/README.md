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

Phrases that match the committed ICJIA-public fixtures (randomly chosen — see `examples/_fixtures/README.md`):

- `"stigma"` — matches "Stigma PDF for posting"
- `"methamphetamine"` — matches the meth-trends overview
- `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot

## Swap in your own PDFs

Drop new `.pdf` files into `examples/_fixtures/`. Re-run `pnpm dev` (or `pnpm build`).
