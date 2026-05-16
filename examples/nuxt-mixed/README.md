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

Phrases that match the committed ICJIA-public fixtures (randomly chosen — see `examples/_fixtures/README.md`):

- `"stigma"` — matches the Stigma PDF (CMS-owned)
- `"methamphetamine"` — matches the meth-trends overview
- `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot

## Inspect the API directly

```bash
curl -s http://localhost:3001/api/searchIndex | jq '.pdfs | length'
```

Expected: `4` (one per fixture PDF — the CMS owns one, @nuxt/content owns three).

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

Drop new `.pdf` files into `examples/_fixtures/`. To surface a new fixture via the mocked CMS, add an entry to `server/utils/mockCms.ts`. To surface via `@nuxt/content`, add an entry to `scripts/generate-content.mjs` (or run `pnpm generate:content`).
