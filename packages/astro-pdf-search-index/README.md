# @icjia/astro-pdf-search-index

> **Apache Solr for Astro — without Solr.** Astro 5 integration for [`@icjia/pdf-search-index`](../core) that walks your content collections, extracts every linked **PDF / DOCX / PPTX / XLSX** at build time, and emits a JSON index your search UI fetches at runtime. No JVM, no Tika service, no search server — `astro build` does the extraction; the browser does the search.

**Multi-format added in 1.1.** PDF support is bundled; DOCX/PPTX/XLSX unlock when you install the optional `officeparser` peer dep. The emitted JSON includes a `format` discriminator (`'pdf'` / `'docx'` / `'pptx'` / `'xlsx'`) on every row so your UI can show per-format badges, route to different viewers, or filter results.

Adds documents as first-class search rows in an Astro site, then lets whatever client-side search engine you already use query them. **Fuse.js is recommended but optional** — the emitted JSON is plain `IndexedDocument[]` rows that work equally well with [MiniSearch](https://lucaong.github.io/minisearch/), [FlexSearch](https://github.com/nextapps-de/flexsearch), Lunr, [Pagefind](https://pagefind.app/), or your own index. The integration hooks into `astro:build:start` so the emitted JSON ships in your `dist/` output alongside other static assets.

## Install

```bash
npm install @icjia/pdf-search-index @icjia/astro-pdf-search-index
```

Peer dependency: `astro@^5.0.0`. ESM only. Node 20 LTS / 22 LTS.

## Table of contents

- [Install](#install)
- [Security](#security)
- [Configure in `astro.config.ts`](#configure-in-astroconfigts)
- [How it works](#how-it-works)
- [Options](#options)
- [Common patterns](#common-patterns)
- [Authentication (custom fetch)](#authentication-custom-fetch)
- [Using the emitted index in a Vue / React / Svelte island](#using-the-emitted-index-in-a-vue--react--svelte-island)
- [Troubleshooting](#troubleshooting)
- [Security defenses inherited from core](#security-defenses-inherited-from-core)
- [Canonical examples](#canonical-examples)
- [Versioning](#versioning)
- [License](#license)

## Security

**Status as of v1.2.0 (last audited 2026-05-17):** Every Critical and Important finding against the Astro adapter surface is **remediated and verified in 1.0.2**. The one adapter-specific Critical (**C5**) plus the core flow-through fixes (C1, C3, I1, I3, I4, I7, I8) all have named regression tests and were re-verified at v1.1.0 and v1.2.0. **Zero unaddressed exploitable issues** in the documented usage envelope. The 1.2 release adds an optional **prebuilt-Fuse-index** emission (`prebuildIndex` option) — the same path-jail guard that protects `endpoint` (C5 fix) also applies to the prebuilt-index path, verified by the v1.2 audit.

### Adapter-specific remediation detail

| ID     | What was found                                                                                                                          | What was specifically remediated                                                                                                                                                                                       | Verified by                                                                                                                                                                      | Status                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **C5** | Astro `endpoint: '../../etc/escape.json'` would resolve outside `publicDir` and the build would write the index there (path traversal). | The integration resolves the output path against `publicDir` at build time and throws a clear error if it doesn't stay inside. Existing valid configurations (relative paths inside `public/`) keep working unchanged. | `test/integration.test.ts` → `"rejects an endpoint that resolves outside publicDir (C5: path traversal)"`.                                                                       | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I4** | PDF text containing literal `</script>` broke out of `<script type="application/json">` islands when the JSON was inlined into HTML.    | The adapter writes the index via `safeJSONForHTML` from core (escapes `<`, `<!--`, U+2028, U+2029) rather than `JSON.stringify`. No consumer code change required — the adapter uses it on every emit.                 | `test/integration.test.ts` → `"escapes `</script>` in the emitted JSON (I4: HTML-safe encoding)"`. Plus the core export's own coverage in `packages/core/test/security.test.ts`. | ✅ **Fixed in 1.0.2; verified at 1.0.5** |

### Core flow-through fixes (apply automatically to the Astro emit path)

| ID     | Defense it adds to your Astro build                                                                                                                                                                                                                       | Status                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **C1** | URL-scanner ReDoS guard. Adversarial markdown content from a CMS-author body can't stall the build.                                                                                                                                                       | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C3** | Streaming body-size cap on every PDF fetch the integration performs. Default `maxBytes` 32 MB (down from 100 MB). Raise via `{ maxBytes: 100 * 1024 * 1024 }` if your CMS hosts larger PDFs.                                                              | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I1** | Failure logs scrub URLs to `protocol://host` only. A failed fetch on `https://cms.example.com/admin/secret.pdf` logs as `https://cms.example.com` — the path stays out of CI logs. Pass `debug: true` per call when you need the full URL for triage.     | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I3** | Per-PDF extracted-text cap at 5 MB chars (default). Defends against compression-bomb PDFs. Raise via `{ maxExtractedTextChars: 10_000_000 }` if a real PDF in your corpus has more text. See [Migration notes](../../README.md#migration-notes-from-101). | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I7** | Atomic cache writes with `contentSha` verification. Parallel `astro build` invocations won't corrupt the cache.                                                                                                                                           | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I8** | Categorized parse-error tags. Encrypted / corrupt / font-error PDFs surface as categorized warnings instead of leaking the underlying `pdfjs-dist` exception text.                                                                                        | ✅ **Fixed in 1.0.2; verified at 1.0.5** |

### Deferred items relevant to the Astro adapter

| ID     | Status                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C2** | SSRF allowlist deferred to v1.1. **Active mitigation:** configure outbound network policy in your CI environment so the `astro build` step can only reach the hosts you expect (your CMS, your CDN). Most CI runners (GitHub Actions, Netlify, Vercel) support egress filtering at the worker level. The attack surface is build-time only; the typical CI runner is isolated. |

For the complete cross-package picture (including the I2 / I5 / I6 deferred items relevant to the core surface), read the [top-level README's Security section](../../README.md#security) and the [Security considerations & audit history](../../README.md#security-considerations--audit-history).

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
    threshold: 0.2,
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
      // Pass `{ maxSnippets: 3 }` for multiple highlighted spans per result —
      // the picker takes the longest non-overlapping matches and renders them
      // in document order, joined by ` … `. Default `maxSnippets: 1` is
      // backward-compatible.
      snippet: snippetHTMLFor(r, { maxSnippets: 3 }),
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
- [`examples/netlify-demo/`](../../examples/netlify-demo/) — the **polished, deployable variant**. Same integration, dressed up: hand-designed dark-mode UI, corpus listing on the page, live Fuse.js options tuner, token-search wrapper for short queries, multi-region snippet picker (`maxSnippets: 8` with custom distribution across document buckets), match-count badge per result, image-only "Needs OCR — title only" badge, bundled Mozilla pdf.js viewer for cross-browser in-PDF find-and-highlight, and a `netlify.toml` so deploying to Netlify is one click. Use this as the starting point for a real consumer site.

Run either with:

```bash
pnpm --filter @icjia-examples/astro dev          # http://localhost:4321/
pnpm --filter @icjia-examples/astro build        # produces dist/

pnpm --filter @icjia-examples/netlify-demo dev   # http://localhost:4322/
pnpm --filter @icjia-examples/netlify-demo build # produces dist/ + dist/pdfs/
```

## Versioning

Currently at **1.0.3** (lockstep with `@icjia/pdf-search-index`). See [CHANGELOG.md](./CHANGELOG.md) for release notes. A second, scope-limited adversarial red/blue team audit pass ran against the v1.0.3 deltas on **2026-05-16**; the Astro adapter surface was unchanged from v1.0.2, so no Astro-specific findings — see the [top-level audit history](../../README.md#security-considerations--audit-history).

## License

[MIT](../../LICENSE)
