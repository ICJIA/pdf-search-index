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

Phrases that match the committed ICJIA-public fixtures (randomly chosen — see `examples/_fixtures/README.md`):

- `"stigma"` — matches "Stigma PDF for posting"
- `"methamphetamine"` — matches the meth-trends overview
- `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot

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

Drop new `.pdf` files into `examples/_fixtures/`. The `predev`/`prebuild` script auto-discovers them and generates one markdown page per PDF in `src/content/docs/`. Re-run `pnpm dev` or `pnpm build`.
