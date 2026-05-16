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

Expected output (the count, titles, and stats vary with whatever `.pdf`
files are in `examples/_fixtures/` at the time you run this):

```
Indexing N PDF(s) from /…/examples/_fixtures…
Indexed rows:
  Drug Testing Lit Review …      pages=11 chars=28896
  JJ Statewide Snapshot 2014 …   pages=47 chars=51792
  Stigma PDF for posting …       pages=23 chars=68557
  …                                          …

Query "applicant" → 1 match(es):
  • JJ Statewide Snapshot 2014 …
    …the <mark>applicant</mark> portal opened in March…
```

(Exact numbers depend on your fixtures. The committed fixtures are
randomly-clicked ICJIA-public samples — see `examples/_fixtures/README.md`
for provenance.)

## Try a different query

```bash
pnpm --filter @icjia-examples/plain-node start -- "stigma"
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
