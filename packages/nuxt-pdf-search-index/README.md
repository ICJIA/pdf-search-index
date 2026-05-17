# @icjia/nuxt-pdf-search-index

> **Apache Solr for Nuxt — without Solr.** Nuxt 4 module for [`@icjia/pdf-search-index`](../core) that extracts text from **PDF, DOCX, PPTX, and XLSX** linked in your CMS bodies and `@nuxt/content` docs, caches the rows on disk, and returns them as plain JSON from a Nitro server route. No JVM, no Tika service, no search server — Nitro does the extraction; the browser does the search.

**Multi-format added in 1.1.** Two new helpers — `extractDocumentsFromCmsBody` and `extractDocumentsFromContentDoc` — auto-detect each linked document's format. The existing PDF-only helpers (`extractPdfsFromCmsBody`, `extractPdfsFromContentDoc`) are preserved unchanged for back-compat. Install the optional `officeparser` peer dep to unlock DOCX/PPTX/XLSX.

Built for mixed sites that combine a remote CMS (Strapi v3/v4/v5, Sanity, Contentful, Drupal) with `@nuxt/content` markdown. The module registers four server helpers in Nitro's auto-import scope so your `server/api/searchIndex.get.ts` route can scan CMS bodies and content docs for linked documents, extract their text at request time (cached on disk between runs), and return the rows as JSON. The client merges those rows with the page index, feeds the union into whatever client-side search engine you already use, and queries normally — **Fuse.js is the documented default and what every recipe below assumes, but any engine that consumes JSON rows works equally well** ([MiniSearch](https://lucaong.github.io/minisearch/), [FlexSearch](https://github.com/nextapps-de/flexsearch), Lunr, [Pagefind](https://pagefind.app/), or your own).

## Install

```bash
npm install @icjia/pdf-search-index @icjia/nuxt-pdf-search-index
```

Peer dependency: `nuxt@^4.0.0`. ESM only. Node 20 LTS / 22 LTS.

## Table of contents

- [Install](#install)
- [Security](#security)
- [Register in `nuxt.config.ts`](#register-in-nuxtconfigts)
- [The two server helpers](#the-two-server-helpers)
- [The Nitro server-route template](#the-nitro-server-route-template)
- [Recipe A — Strapi v5-only](#recipe-a--strapi-v5-only)
- [Recipe B — `@nuxt/content`-only](#recipe-b--nuxtcontent-only)
- [Recipe C — Mixed CMS + `@nuxt/content` (the design target)](#recipe-c--mixed-cms--nuxtcontent-the-design-target)
- [Strapi quirks](#strapi-quirks)
- [Module options](#module-options)
- [Per-call options](#per-call-options)
- [Authentication](#authentication)
- [Client-side: fetching `/api/searchIndex` and wiring to Fuse](#client-side-fetching-apisearchindex-and-wiring-to-fuse)
- [Troubleshooting](#troubleshooting)
- [Operational notes on security](#operational-notes-on-security)
- [Canonical example](#canonical-example)
- [Versioning](#versioning)
- [License](#license)

## Security

**Status as of v1.2.0 (last audited 2026-05-17):** Every Critical and Important finding that touches the Nuxt module's helper surface is **remediated and verified in 1.0.2** — every fix flows through `extractPdfsFromCmsBody` / `extractPdfsFromContentDoc` (and the 1.1 multi-format helpers `extractDocumentsFromCmsBody` / `extractDocumentsFromContentDoc`) automatically. Five audit passes (initial 1.0.1, 1.0.3 delta, 1.0.5 verification, 1.1.0 multi-format, 1.2.0 perf/security-extension) confirm the fixes are still in place. **Zero unaddressed exploitable issues** in the documented usage envelope.

### Core flow-through fixes (apply to every helper call)

| ID     | What was found                                                                                                             | What was specifically remediated                                                                                                                                                                                                                  | Verified by                                                                                                                                                       | Status                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **C1** | ReDoS in `extractPdfUrlsFromMarkdown` (called by both helpers when scanning CMS body / `@nuxt/content` doc for PDF links). | Bounded greedy quantifiers `{1,2048}` URL / `{0,1024}` query; bodies > 1 MB skipped with a warning before scan.                                                                                                                                   | `packages/core/test/security.test.ts` → `"C1: ReDoS — handles a long hostile payload in under 200ms"`.                                                            | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **C3** | Multi-GB PDF response would OOM Nitro before the size cap fired. Default `maxBytes` now 32 MB (down from 100 MB).          | `Content-Length` pre-check + streaming `getReader()` cap. Aborts the moment running total > `maxBytes`. Raise per call: `extractPdfsFromCmsBody(body, { maxBytes: 100 * 1024 * 1024 })` if your CMS legitimately serves larger PDFs.              | `packages/core/test/security.test.ts` → `"C3: aborts streaming download once running total exceeds maxBytes"` + `"default maxBytes is 32 MB"`.                    | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I1** | Internal URLs leaked into Nitro request logs / CI logs (`https://cms.example.com/admin/private.pdf` paths).                | All helper warnings route URLs through `scrubUrl()` — only `protocol://host` reaches the log. Pass `debug: true` per call when you need the full URL for triage.                                                                                  | `packages/core/test/security.test.ts` → `"I1 / M3: scrubUrl ... returns origin only for a normal URL"` + `"omits the path from failure logs by default"`.         | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I3** | Compression-bomb PDFs decompressing to hundreds of MB of plain text — would balloon Nitro response payloads.               | New `maxExtractedTextChars` per-call option (default 5,000,000). Truncates above the cap and logs a warning. Raise via `{ maxExtractedTextChars: 10_000_000 }` if your corpus has legitimate outliers. See [per-call options](#per-call-options). | `packages/core/test/security.test.ts` → `"I3: maxExtractedTextChars cap — truncates extracted text above the cap and logs a warning"`.                            | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I4** | PDF text containing literal `</script>` could break out of `<script type="application/json">` islands if you inline rows.  | `safeJSONForHTML` re-exported from `@icjia/pdf-search-index`. Use it instead of `JSON.stringify` when you embed helper output into HTML — the helpers themselves return objects, so this only applies to consumer-side serialization.             | `packages/core/test/security.test.ts` → `"I4: safeJSONForHTML — escapes `<`so`</script>` cannot break out of a <script> embedding"`.                              | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I7** | Parallel `/api/searchIndex` requests could race and corrupt the cache. External corruption went undetected.                | The `.nuxt/.pdf-cache/` directory (or your configured `cacheDir`) uses `.tmp.<pid>.<rand>` rename-atomic writes; sidecar carries a `contentSha`; `readCache` verifies the hash on read.                                                           | `packages/core/test/security.test.ts` → `"I7: cache writes are atomic and content-hashed"` (4 tests including `"never returns a corrupt (mismatched-hash) hit"`). | ✅ **Fixed in 1.0.2; verified at 1.0.5** |
| **I8** | pdf.js `PasswordException` and other parse errors logged verbatim → leaked encrypted-PDF state.                            | Parse errors categorized into `'encrypted PDF'` / `'corrupt PDF structure'` / `'PDF font error'` / `'PDF parse error'`. Full message gated behind `debug: true`.                                                                                  | `packages/core/test/security.test.ts` → `"I8: categorized parse-error logging — categorizes xref/structure errors as 'corrupt PDF structure'"`.                   | ✅ **Fixed in 1.0.2; verified at 1.0.5** |

### Helpers' threat-surface note (operational)

This module exposes server-side helpers consumed by a developer-authored Nitro route. **Don't wire `extractPdfsFromCmsBody` or `extractPdfsFromContentDoc` behind a public endpoint that accepts arbitrary URL lists from clients** — the SSRF allowlist (C2) is deferred to v1.1. CMS-author content is treated as trusted-as-developer-author input; the helpers are designed for the canonical pattern of "Nitro route reads CMS bodies _you_ fetched and produces an index _your_ page fetches."

### Deferred items relevant to the Nuxt module

| ID     | Status                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C2** | SSRF allowlist deferred to v1.1. **Active mitigation:** keep the helpers behind a route that ingests URLs only from CMS bodies (trusted developer input), never from end-user query parameters. Configure outbound network policy at the Nitro server level if your deployment runs in an environment that allows it (Vercel / Cloudflare Workers / Netlify Functions all support egress controls). |

For the complete cross-package picture (including I2 / I5 / I6 deferred items relevant to the core surface), read the [top-level README's Security section](../../README.md#security) and the [Security considerations & audit history](../../README.md#security-considerations--audit-history).

## Register in `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
});
```

That's the entire module config. The two server helpers are then available in `server/api/*.ts` via `#imports` without explicit imports — Nuxt's auto-import resolves them.

## The two server helpers

| Helper                                     | When to use                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `extractPdfsFromCmsBody(body, options?)`   | Body string from a remote CMS (Strapi-style markdown). Pass the raw markdown body.                 |
| `extractPdfsFromContentDoc(doc, options?)` | `@nuxt/content` parsed document. Accepts `{ body }`, `{ _raw }`, `{ rawbody }`, or a plain string. |

Both helpers:

- Scan the body for absolute `https?://...pdf` URLs (and `file://` URLs for tests/examples).
- Fetch each PDF (concurrent, p-limited).
- Extract text via `unpdf` / `pdfjs-dist`.
- Cache the result to `.nuxt/.pdf-cache/` (or your configured `cacheDir`).
- Return `IndexedPdf[]`.

Both honor `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from `nuxt.config.ts` unless overridden by the per-call `options` arg.

## The Nitro server-route template

A copy-pasteable route template ships at [`src/runtime/server/route-template.ts`](./src/runtime/server/route-template.ts). Drop it at `server/api/searchIndex.get.ts` in your Nuxt project and adapt the two marked sections (CMS fetch + `@nuxt/content` query) to match your stack. The recipes below show the three most common shapes.

## Recipe A — Strapi v5-only

Strapi v5 dropped the `attributes` wrapper. Fields sit on the data object directly; `documentId` (string) replaced numeric `id` as the stable identifier.

```ts
// server/api/searchIndex.get.ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody } from '#imports';
import type { IndexedPdf } from '@icjia/pdf-search-index';

interface StrapiV5Page {
  documentId: string;
  title: string;
  slug: string;
  body: string;
}

export default defineEventHandler(async () => {
  const res = await $fetch<{ data: StrapiV5Page[] }>(
    `${process.env.CMS_BASE}/api/pages?pagination[pageSize]=1000`,
  );

  const pdfs: IndexedPdf[] = [];
  for (const page of res.data) {
    pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
  }

  return {
    pages: res.data.map((p) => ({
      type: 'page',
      id: p.documentId,
      title: p.title,
      url: `/${p.slug}`,
    })),
    pdfs,
  };
});
```

## Recipe B — `@nuxt/content`-only

`@nuxt/content` v3 returns the parsed body as an AST, not a markdown string. To get the raw markdown back (so the URL scanner can find PDF links in it), extend the content schema with a `rawbody: z.string()` field.

```ts
// content.config.ts
import { defineCollection, defineContentConfig, z } from '@nuxt/content';

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      schema: z.object({
        rawbody: z.string().optional(), // populated automatically; surfaced for our use
      }),
    }),
  },
});
```

```ts
// server/api/searchIndex.get.ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromContentDoc } from '#imports';
import { queryCollection } from '@nuxt/content/server';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default defineEventHandler(async (event) => {
  const docs = await queryCollection(event, 'content').all();

  const pdfs: IndexedPdf[] = [];
  for (const doc of docs) {
    const raw = typeof doc.rawbody === 'string' ? doc.rawbody : '';
    pdfs.push(...(await extractPdfsFromContentDoc(raw)));
  }

  return {
    docs: docs.map((d) => ({
      type: 'content',
      id: d.id,
      title: d.title,
      url: d.path,
    })),
    pdfs,
  };
});
```

## Recipe C — Mixed CMS + `@nuxt/content` (the design target)

The canonical case this module was built for: a site that pulls content from a remote CMS for editor-driven pages and from `@nuxt/content` for code-managed markdown (release notes, design docs, etc.). PDFs may be referenced from either source and need to be deduplicated when both link to the same file.

```ts
// server/api/searchIndex.get.ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody, extractPdfsFromContentDoc } from '#imports';
import { queryCollection } from '@nuxt/content/server';
import type { IndexedPdf } from '@icjia/pdf-search-index';

interface StrapiV5Page {
  documentId: string;
  title: string;
  slug: string;
  body: string;
}

export default defineEventHandler(async (event) => {
  // Source 1: external CMS.
  const cmsRes = await $fetch<{ data: StrapiV5Page[] }>(
    `${process.env.CMS_BASE}/api/pages?pagination[pageSize]=1000`,
  );
  const cmsRows = cmsRes.data;
  const cmsPdfs: IndexedPdf[] = [];
  for (const row of cmsRows) {
    cmsPdfs.push(...(await extractPdfsFromCmsBody(row.body)));
  }

  // Source 2: @nuxt/content markdown collection.
  const docs = await queryCollection(event, 'content').all();
  const contentPdfs: IndexedPdf[] = [];
  for (const doc of docs) {
    const raw = typeof doc.rawbody === 'string' ? doc.rawbody : '';
    contentPdfs.push(...(await extractPdfsFromContentDoc(raw)));
  }

  // Dedupe by id — same PDF linked from both sources → one row.
  const allPdfs = [...new Map([...cmsPdfs, ...contentPdfs].map((p) => [p.id, p])).values()];

  return {
    cms: cmsRows.map((r) => ({ type: 'cms', id: r.documentId, title: r.title, url: `/${r.slug}` })),
    content: docs.map((d) => ({ type: 'content', id: d.id, title: d.title, url: d.path })),
    pdfs: allPdfs,
  };
});
```

The full working version of this route — including a mocked CMS fixture, a `localFetch` helper that intercepts `file://` URLs, and the `rawbody` schema declaration — lives at [`examples/nuxt-mixed/`](../../examples/nuxt-mixed/).

## Strapi quirks

### v3 → v4 → v5 response shape differences

Strapi reshaped its response envelope twice across major versions. Match the recipe to your version:

**Strapi v5 (current as of 2025+)** — flat fields, `documentId` string identifier:

```ts
const res = await $fetch<{ data: Array<{ documentId: string; title: string; body: string }> }>(
  'https://cms.example.com/api/pages',
);
for (const page of res.data) {
  pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
}
```

**Strapi v4** — fields wrapped in `attributes`. Media relations need `populate=*` to be returned:

```ts
const res = await $fetch<{
  data: Array<{ id: number; attributes: { title: string; body: string } }>;
}>('https://cms.example.com/api/pages?populate=*');
for (const page of res.data) {
  pdfs.push(...(await extractPdfsFromCmsBody(page.attributes.body)));
}
```

**Strapi v3** — flat response, no `data` envelope:

```ts
const pages = await $fetch<Array<{ id: number; title: string; body: string }>>(
  'https://cms.example.com/pages',
);
for (const page of pages) {
  pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
}
```

### Relative URLs in CMS uploads

By default, Strapi 4/5 serves uploaded media at relative paths like `/uploads/annual-report-abc123.pdf`. The URL scanner only matches absolute `https?://` URLs, so you need to absolutize before scanning:

```ts
const CMS_BASE = process.env.CMS_BASE!; // 'https://cms.example.com'
const absolutized = page.body.replaceAll(/\]\((\/uploads\/[^)]+\.pdf)/g, `](${CMS_BASE}$1`);
pdfs.push(...(await extractPdfsFromCmsBody(absolutized)));
```

Or configure Strapi to emit absolute URLs (set `url` in `config/server.ts` to your public CMS hostname, or use an upload provider like `aws-s3` that returns absolute CDN URLs).

### Token-gated uploads

If your Strapi instance requires a JWT or API token to download media (private media or `users-permissions` restrictions), pass a custom `fetch` with the auth header — see [Authentication](#authentication) below.

### PDFs as structured media relations (not in body markdown)

If your CMS schema stores PDFs as typed media fields (`attachments: Media[]`) rather than as markdown links inside `body`, the URL scanner won't find them. Skip `extractPdfsFromCmsBody` and call `indexPdfs` directly:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const directRows = await indexPdfs(
  page.attachments.map((a) => ({
    url: process.env.CMS_BASE + a.url,
    title: a.name ?? a.alternativeText,
  })),
);
```

## Module options

| Option        | Type     | Default              | Notes                                                                |
| ------------- | -------- | -------------------- | -------------------------------------------------------------------- |
| `cacheDir`    | `string` | `'.nuxt/.pdf-cache'` | File cache for extracted text. Survives across runs and across calls |
| `concurrency` | `number` | `4`                  | Parallel PDF fetches via `p-limit`                                   |

## Per-call options

Both helpers accept the full `IndexPdfsOptions` shape as an optional second argument — these override the module defaults on a per-call basis:

| Option                  | Type                             | Default                    | Notes                                                                     |
| ----------------------- | -------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `cacheDir`              | `string`                         | from module config         | Override the file cache directory for this call                           |
| `concurrency`           | `number`                         | from module config         | Override parallelism for this call                                        |
| `fetch`                 | `typeof fetch`                   | global `fetch`             | Custom fetch — auth headers, `file://`, signed URLs                       |
| `fetchTimeout`          | `number` (ms)                    | `30000`                    | Abort each PDF download after this many ms                                |
| `maxBytes`              | `number`                         | `32 * 1024 * 1024` (32 MB) | Reject PDFs larger than this. Lowered from 100 MB in 1.0.2                |
| `maxExtractedTextChars` | `number`                         | `5_000_000` (5 MB)         | Truncate extracted text above this length (compression-bomb defense)      |
| `cache`                 | `'use' \| 'bypass' \| 'refresh'` | `'use'`                    | `bypass` skips read+write; `refresh` overwrites                           |
| `debug`                 | `boolean`                        | `false`                    | When `true`, failure logs include full URLs and underlying error messages |

## Authentication

If your Strapi (or other CMS) requires a token to download uploaded media, pass a custom `fetch` with the `Authorization` header:

```ts
// server/api/searchIndex.get.ts
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody } from '#imports';
import type { IndexedPdf } from '@icjia/pdf-search-index';

const authFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
    },
  });

export default defineEventHandler(async () => {
  const res = await $fetch<{ data: Array<{ documentId: string; title: string; body: string }> }>(
    `${process.env.CMS_BASE}/api/pages`,
    { headers: { Authorization: `Bearer ${process.env.STRAPI_TOKEN}` } },
  );

  const pdfs: IndexedPdf[] = [];
  for (const page of res.data) {
    pdfs.push(...(await extractPdfsFromCmsBody(page.body, { fetch: authFetch })));
  }
  return { pages: res.data.map((p) => ({ id: p.documentId, title: p.title })), pdfs };
});
```

The `fetch` option threads through to every PDF download. Same pattern works for Bearer / Basic / API-key / custom-header auth on any CMS.

## Client-side: fetching `/api/searchIndex` and wiring to Fuse

Once the server route returns the JSON shape, the client merges it into a Fuse index:

```vue
<!-- app/pages/search.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Fuse from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const query = ref('');
const results = ref<Array<{ title: string; url: string; snippet: string }>>([]);
let fuse: Fuse<{ id: string; url?: string; title: string; text?: string }> | null = null;

onMounted(async () => {
  const data = await $fetch<{
    cms: Array<{ id: string; title: string; url: string }>;
    content: Array<{ id: string; title: string; url: string }>;
    pdfs: Array<{ id: string; url: string; title: string; text: string }>;
  }>('/api/searchIndex');

  const all = [
    ...data.cms.map((r) => ({ ...r, text: r.title })),
    ...data.content.map((r) => ({ ...r, text: r.title })),
    ...data.pdfs,
  ];

  fuse = new Fuse(all, {
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
      url: r.item.url ?? '#',
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

## Troubleshooting

**`@nuxt/content` v3 returns the body as an AST, not a string.**
Extend the content schema with `rawbody: z.string()` so the raw markdown is preserved — see [Recipe B](#recipe-b--nuxtcontent-only) above. Then pass `doc.rawbody` to `extractPdfsFromContentDoc`.

**The index has rows but `text` is empty.**
The PDF is likely image-only / scanned (no text layer). Open it in a viewer; if you can't select text, neither can `pdf.js`. OCR is out of scope for v1.

**The CMS returns relative `/uploads/...pdf` URLs and the index is empty.**
The URL scanner only matches absolute URLs. See [Relative URLs in CMS uploads](#relative-urls-in-cms-uploads) for the 4-line regex fix.

**The first request to `/api/searchIndex` is slow.**
Expected — first run hits every PDF over the network. The file cache at `.nuxt/.pdf-cache/` makes subsequent calls near-instant. Persist that directory between CI / deploy runs.

**Cache invalidation question.**
Cache keys are `SHA-256(url)` truncated to 16 hex chars. Strapi-uploaded PDFs usually get a hash suffix in the filename, so a re-upload gets a new URL and the cache invalidates naturally. If your CMS overwrites at the same URL, run `pdf-search-index cache rm <url>` or `pdf-search-index cache clear` in your deploy script before the route runs.

## Operational notes on security

In addition to the v1.0.2 audit fixes covered in the [Security](#security) section above, two operational notes:

- If your route exposes any cache management (e.g. forcing `cache: 'refresh'` on a query param), gate that behind admin auth. The helpers don't enforce request-time authorization themselves.
- The URL-scanner ReDoS bound, body-size cap, extracted-text cap, scrubbed failure logs, atomic cache writes, and restrictive cache file modes all flow through from the core package — preserve the defaults unless you have a specific reason to relax them. See the [top-level README's Security considerations & audit history](../../README.md#security-considerations--audit-history) for the full list.

## Canonical example

[`examples/nuxt-mixed/`](../../examples/nuxt-mixed/) — Nuxt 4 + `@nuxt/content` + mocked CMS + `localFetch`. Run with:

```bash
pnpm --filter @icjia-examples/nuxt-mixed dev      # http://localhost:3001/
pnpm --filter @icjia-examples/nuxt-mixed build
```

The example covers all three recipes' patterns (CMS body extraction, `@nuxt/content` doc extraction, mixed dedupe) in a single working route at [`examples/nuxt-mixed/server/api/searchIndex.get.ts`](../../examples/nuxt-mixed/server/api/searchIndex.get.ts).

## Versioning

Currently at **1.0.3** (lockstep with `@icjia/pdf-search-index`). See [CHANGELOG.md](./CHANGELOG.md) for release notes. A second, scope-limited adversarial red/blue team audit pass ran against the v1.0.3 deltas on **2026-05-16**; the Nuxt module surface was unchanged from v1.0.2, so no Nuxt-specific findings — see the [top-level audit history](../../README.md#security-considerations--audit-history).

## License

[MIT](../../LICENSE)
