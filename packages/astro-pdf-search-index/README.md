# @icjia/astro-pdf-search-index

> Astro 5 integration for [`@icjia/pdf-search-index`](../core). Walks configured content collections, extracts every linked PDF's text at build time, and emits a JSON index your search UI can fetch.

Adds PDFs as first-class search rows in an Astro site already using Fuse.js (or any other client-side search engine that consumes JSON rows). The integration hooks into `astro:build:start` so the emitted index ships in your `dist/` output alongside other static assets.

## Install

```bash
npm install @icjia/pdf-search-index @icjia/astro-pdf-search-index
```

Peer dependency: `astro@^5.0.0`. ESM only. Node 20 LTS / 22 LTS.

## Security

**Audited and hardened in v1.0.2 (released 2026-05-16).** The adapter went through an adversarial red/blue team review alongside the core package; v1.0.2 ships the Astro-specific fixes plus all the core hardening that flows through. Most-relevant items for the Astro surface:

- **C5 — Path-jailed `endpoint`.** The adapter's `endpoint` option must now resolve inside Astro's `publicDir`. `endpoint: '../../etc/escape.json'` throws before any filesystem write. Existing valid configurations (relative paths inside `public/`) keep working without changes.
- **I4 — HTML-safe JSON emit.** The adapter writes the index via `safeJSONForHTML`, so PDF text containing literal `</script>` can't break out of a `<script type="application/json">` embedding in your pages. No consumer code change required — the adapter uses it on every emit.
- **C3 + I3 (core, flow-through).** The default `maxBytes` is now **32 MB** (down from 100 MB); extracted text is capped at **5 MB** per PDF via the new `maxExtractedTextChars` option. If your CMS hosts PDFs above either threshold, raise the cap via the standard core options — see the [top-level README's Migration notes](../../README.md#migration-notes-from-101).
- **I1, I7, I8 (core, flow-through).** URL scrubbing in failure logs, atomic cache writes with `contentSha` verification, and categorized parse-error tags all apply to the Astro emit path automatically.

The core deferred items (**C2** SSRF allowlist, **I2** cache-key normalization, **I5** sitemap hardening, **I6** `maxUrls` cap) are tracked for v1.1 / v2.0. Configure outbound network policy in your CI environment as a mitigation for C2 until the allowlist lands.

Read the full audit findings, deferred-item targets, and migration notes in the [top-level README's Security section](../../README.md#security) and the [Security considerations & audit history](../../README.md#security-considerations--audit-history) section further down.

## Configure in `astro.config.ts`

```ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: '.astro/.pdf-cache',
      concurrency: 4,
    }),
  ],
});
```

That's the whole setup. Run `astro build` and the integration will:

1. Walk each named content collection (`src/content/<name>/`).
2. Read every `.md` / `.mdx` file, strip frontmatter, scan the body for PDF URLs.
3. Fetch each PDF, extract text via `unpdf` / `pdfjs-dist`, write to the file cache.
4. Dedupe rows across collections by `id`.
5. Write the emitted JSON to `public/<endpoint>` (HTML-safe serialized).

Astro's build pipeline then copies it into `dist/<endpoint>` as a normal static asset.

## How it works

The integration registers two Astro hooks:

- **`astro:config:done`** — captures the resolved `srcDir` and `publicDir` URLs.
- **`astro:build:start`** — runs the scan + extract + emit pipeline once per build.

This means the JSON regenerates on every `astro build`, not on dev-server restart. See [Troubleshooting](#troubleshooting) for the `astro dev` workaround.

## Options

| Option             | Type           | Default                   | Notes                                                             |
| ------------------ | -------------- | ------------------------- | ----------------------------------------------------------------- |
| `collections`      | `string[]`     | (required)                | Names of Astro content collections to scan                        |
| `endpoint`         | `string`       | `'searchIndex.pdfs.json'` | Output filename relative to `publicDir`. Path-jailed since v1.0.2 |
| `cacheDir`         | `string`       | `'.astro/.pdf-cache'`     | File cache for extracted text                                     |
| `concurrency`      | `number`       | `4`                       | Parallel PDF fetches via `p-limit`                                |
| `contentSourceDir` | `string`       | `'content'`               | Directory under `srcDir` containing collections                   |
| `fetch`            | `typeof fetch` | global `fetch`            | Custom fetch (auth, `file://` for tests/examples)                 |

In production you don't need the `fetch` option — your CMS-authored markdown links to real `https://` URLs.

## Common patterns

### Single content collection

```ts
pdfSearch({
  collections: ['docs'],
  endpoint: 'searchIndex.pdfs.json',
});
```

### Multiple content collections with dedupe

Cross-collection deduplication is automatic — a PDF linked from `resources/foo.md` AND `news/bar.md` appears once in the emitted JSON (the first occurrence wins on `title`).

```ts
pdfSearch({
  collections: ['resources', 'news', 'pages', 'reports'],
  endpoint: 'searchIndex.pdfs.json',
});
```

### Coexisting with Pagefind / other search

The emitted JSON is independent of Astro's other static assets. You can wire Pagefind for prose search and use this package's output for PDF search, merging the result sets in the UI — or feed both row sets into a single Fuse instance.

## Authentication (custom fetch)

If your PDFs live behind a CMS that token-gates media, pass a custom `fetch`:

```ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

const authFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
    },
  });

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['docs'],
      endpoint: 'searchIndex.pdfs.json',
      fetch: authFetch,
    }),
  ],
});
```

The `fetch` option threads through to every PDF download. Same pattern works for Bearer / Basic / API-key / custom-header auth on any CMS.

## Using the emitted index in a Vue / React / Svelte island

The emitted JSON is served at `/<endpoint>` (e.g. `/searchIndex.pdfs.json`). A typical Vue island that merges PDF rows with the site's existing page index and runs a Fuse search:

```vue
<!-- src/components/Search.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Fuse from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const query = ref('');
const results = ref<Array<{ title: string; url: string; snippet: string }>>([]);
let fuse: Fuse<{ id: string; url: string; title: string; text: string }> | null = null;

onMounted(async () => {
  const [pages, pdfs] = await Promise.all([
    fetch('/searchIndex.json').then((r) => r.json()),
    fetch('/searchIndex.pdfs.json').then((r) => r.json()),
  ]);
  fuse = new Fuse([...pages, ...pdfs], {
    keys: ['title', 'text'],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
});

function onSearch() {
  if (!fuse || !query.value.trim()) {
    results.value = [];
    return;
  }
  results.value = fuse
    .search(query.value)
    .slice(0, 20)
    .map((r) => ({
      title: r.item.title,
      url: r.item.url,
      snippet: snippetHTMLFor(r),
    }));
}
</script>

<template>
  <input v-model="query" @input="onSearch" placeholder="Search..." />
  <ul>
    <li v-for="r in results" :key="r.url">
      <a :href="r.url">{{ r.title }}</a>
      <p v-html="r.snippet" />
    </li>
  </ul>
</template>
```

The same shape works for React (`useState` + `useEffect`) or Svelte (`onMount` + reactive statements) — see [`examples/astro/`](../../examples/astro/) for a working Vue island.

## Troubleshooting

**`astro dev` doesn't produce my `searchIndex.pdfs.json`.**
The integration hooks into `astro:build:start`, which only fires during `astro build`. For dev mode, run `astro build` once first (or use the example pattern: a separate `predev` build script). The integration prioritizes byte-stable static output; dev-mode HMR was deferred to a future minor. See the [top-level README](../../README.md#troubleshooting).

**The emitted index has rows but `text` is empty.**
The PDF is likely image-only / scanned (no text layer). Open it in a viewer; if you can't select text, neither can `pdf.js`. OCR is out of scope for v1.

**My collection has PDF links but the index is empty.**
The URL scanner only matches absolute `https?://...pdf` (and `file://` for tests). If your markdown uses relative paths (`[Title](/uploads/foo.pdf)`), pre-process the body to absolutize before Astro reads it, or use Astro's `defineCollection` `transform` to rewrite. The [top-level README's Strapi section](../../README.md#strapi-quirk-relative-urls) shows the 4-line regex.

**My CI build is slow on the first run.**
Expected — first run hits every PDF over the network. Persist `.astro/.pdf-cache/` between CI runs (GitHub Actions: `actions/cache@v4`). Subsequent builds hit the cache and are near-instant.

**`endpoint: '../../etc/escape.json'` throws.**
Path-traversal guard added in v1.0.2 — `endpoint` must resolve inside `publicDir`. Use a relative path that stays inside `public/`.

## Security defenses inherited from core

In addition to the Astro-specific path-jail and HTML-safe emit covered in the [Security](#security) section above, the URL-scanner ReDoS bound, body-size cap (`maxBytes`), extracted-text cap (`maxExtractedTextChars`), scrubbed failure logs, atomic cache writes with `contentSha` verification, and restrictive cache file modes all flow through from the core package. Preserve the defaults unless you have a specific reason to relax them; see the [top-level README's Security considerations & audit history](../../README.md#security-considerations--audit-history) for the full list.

## Canonical examples

Two flavors, same integration:

- [`examples/astro/`](../../examples/astro/) — the **minimal smoke test**. Astro 5 + Vue island + `local-fetch.mjs` for offline fixtures. Read this first if you want to see the integration in isolation.
- [`examples/netlify-demo/`](../../examples/netlify-demo/) — the **polished, deployable variant**. Same integration, dressed up: hand-designed dark-mode UI, corpus listing on the page, a `netlify.toml` so deploying to Netlify is one click. Use this as the starting point for a real consumer site.

Run either with:

```bash
pnpm --filter @icjia-examples/astro dev          # http://localhost:4321/
pnpm --filter @icjia-examples/astro build        # produces dist/

pnpm --filter @icjia-examples/netlify-demo dev   # http://localhost:4322/
pnpm --filter @icjia-examples/netlify-demo build # produces dist/ + dist/pdfs/
```

## Versioning

Currently at **1.0.2** (lockstep with `@icjia/pdf-search-index`). See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## License

[MIT](../../LICENSE)
