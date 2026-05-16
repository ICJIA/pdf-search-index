# @icjia/pdf-search-index

> Full-text PDF search for static sites that already use [Fuse.js](https://www.fusejs.io/). Build-time PDF text extraction, no runtime servers, no native deps.

PDFs become first-class search rows alongside your pages and posts. A query like `"stigma"` matches the body of the **linked PDF** — not just the prose that links to it — and returns the PDF as a result with a `<mark>`-highlighted snippet from the surrounding text.

```
                    ┌─────────────────────────────────────────┐
                    │       @icjia/pdf-search-index           │
                    │       (core, pure functions)            │
                    │                                         │
                    │   extractPdfText(url) → string          │
                    │   extractPdfsFromBody(md) → IndexedPdf[]│
                    │   indexPdfs([urls]) → IndexedPdf[]      │
                    │                                         │
                    │   /fuse → createFuseIndex(...)          │
                    │   /snippet → snippetHTMLFor(result)     │
                    │   /mcp → MCP server                     │
                    │   bin → pdf-search-index CLI            │
                    └────┬────────────────────┬───────────────┘
                         │                    │
              ┌──────────┴──────┐  ┌──────────┴──────────┐
              │ @icjia/astro-   │  │ @icjia/nuxt-        │
              │ pdf-search-     │  │ pdf-search-         │
              │ index           │  │ index (Nuxt 4)      │
              └─────────────────┘  └─────────────────────┘
```

| Package                                                              | Version  | Description                                 |
| -------------------------------------------------------------------- | -------- | ------------------------------------------- |
| [`@icjia/pdf-search-index`](./packages/core)                         | `^1.0.0` | Core library, CLI, MCP server, helpers      |
| [`@icjia/astro-pdf-search-index`](./packages/astro-pdf-search-index) | `^1.0.0` | Astro 5 integration                         |
| [`@icjia/nuxt-pdf-search-index`](./packages/nuxt-pdf-search-index)   | `^1.0.0` | Nuxt 4 module (mixed CMS + `@nuxt/content`) |

ESM only. MIT licensed. Node 20 LTS / 22 LTS.

**Live demo:** **<https://icjia-pdf-search.netlify.app/>** — search across 7 ICJIA-public PDFs with live snippet highlighting and a Fuse.js options tuner. See [Examples](#examples) below for how it works and how to deploy your own.

---

## Table of contents

- [Security](#security) — audit findings, fixes shipped in 1.0.2
- [Why this exists](#why-this-exists)
- [The 30-second integration](#the-30-second-integration)
- [Install](#install)
- [Where your PDFs can live](#where-your-pdfs-can-live)
- [Using a search engine other than Fuse.js](#using-a-search-engine-other-than-fusejs)
- [Core API](#core-api)
- [Fuse helper (`/fuse` entry)](#fuse-helper-fuse-entry)
- [Snippet helper (`/snippet` entry)](#snippet-helper-snippet-entry)
- [CLI (`pdf-search-index` bin)](#cli-pdf-search-index-bin)
- [MCP server (`/mcp` entry)](#mcp-server-mcp-entry)
- [Astro integration](#astro-integration)
- [Nuxt 4 module](#nuxt-4-module)
- [Examples](#examples) — including the [live Netlify demo](#live-demo)
- [Caching](#caching)
- [Error handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Limits and non-goals](#limits-and-non-goals)
- [Security considerations & audit history](#security-considerations--audit-history)
- [Development](#development)
- [Design docs](#design-docs)
- [License](#license)

---

## Security

**Audited and patched in v1.0.2 (released 2026-05-16).** All three packages in this monorepo were put through an adversarial red/blue team security audit. 21 findings surfaced; 11 ship as fixes in v1.0.2. Run a recent `@icjia/pdf-search-index` and you get the hardened defaults out of the box.

| Severity      | Found | Shipped in 1.0.2 | Deferred                           |
| ------------- | ----- | ---------------- | ---------------------------------- |
| **Critical**  | 5     | 4                | 1 (C2 SSRF allowlist → v1.1)       |
| **Important** | 8     | 5                | 3 (I2, I5, I6 → v1.1 / v2.0)       |
| **Minor**     | 8     | 2                | 6 (defense-in-depth, future patch) |

**Critical fixes in v1.0.2:**

- **C1 — ReDoS in the URL scanner.** Bounded greedy quantifiers (`{1,2048}` URL / `{0,1024}` query); bodies > 1 MB are skipped with a warning. A 130 KB pathological body that used to stall a build for 50 seconds now scans in milliseconds.
- **C3 — Body size limit applied after full buffer.** `Content-Length` is now checked before the body is read; if absent, the body is streamed via `getReader()` and aborts the moment `maxBytes` is exceeded. The default `maxBytes` dropped from 100 MB to **32 MB**.
- **C4 — MCP `cacheDir` attacker-controlled.** Every MCP tool's `cacheDir` is now jailed under `<os.tmpdir>/pdf-search-index-mcp/`. A prompt-injected LLM can no longer write to `~/.ssh` or anywhere else outside the jail.
- **C5 — Astro `endpoint` path traversal.** The Astro adapter's `endpoint` is now path-jailed at build time — `endpoint: '../../etc/escape.json'` throws before any filesystem write.

**Important fixes in v1.0.2:**

- **I1 — Internal URLs leaking into CI logs.** Failure logs scrub URLs to `protocol://host` only. Full URLs available via `debug: true`.
- **I3 — Extracted-text length cap.** New `maxExtractedTextChars` option (default **5 MB**) defends against compression-bomb PDFs.
- **I4 — JSON not safe for `<script>` embedding.** New `safeJSONForHTML(obj, indent?)` export escapes `</script>`, `<!--`, U+2028 / U+2029. Used by the CLI `--out` writer and the Astro adapter's emit.
- **I7 — Cache write TOCTOU + non-atomic write.** Writes go to `.tmp.<pid>.<rand>` and rename atomically; sidecar carries a `contentSha` and `readCache` verifies it.
- **I8 — Encrypted-PDF state leaks via error message.** Parse errors are categorized (`'encrypted PDF'`, `'corrupt PDF structure'`, `'PDF font error'`, `'PDF parse error'`); full text gated behind `debug: true`.

**Deferred (with explicit target versions so existing consumers aren't broken):**

- **C2 — SSRF allowlist** (`allowPrivateHosts` opt-in flag → v1.1). Mitigation in the meantime: configure outbound network policy in your CI environment.
- **I2 — Cache-key URL normalization** (breaking change to cache keys → v2.0).
- **I5 — CLI `--from-sitemap` size + scheme hardening** → v1.1.
- **I6 — `maxUrls` cap in `indexPdfs`** → v1.1.

**New public API surface (1.0.2):**

- `safeJSONForHTML(obj, indent?)` — HTML-safe JSON serializer.
- `scrubUrl(url)` — origin-only URL redaction helper.
- `ExtractOptions.maxExtractedTextChars?: number` (default `5_000_000`).
- `ExtractOptions.debug?: boolean` (default `false`).

**Changed defaults (1.0.2):**

- `maxBytes`: 100 MB → 32 MB. If you legitimately host larger PDFs, opt up: `{ maxBytes: 100 * 1024 * 1024 }`.
- Parse-error logs: full message → categorized tag. Flip `debug: true` for triage.
- Fetch-failure logs: full URL → origin only. Flip `debug: true` for triage.

**Test coverage.** 26 new regression tests landed alongside the fixes (105 total, up from 79). Each Critical and Important fix has at least one regression test.

The full [Security considerations & audit history](#security-considerations--audit-history) section further down spells out the trust model, the migration notes, and the audit reference.

---

## Why this exists

ICJIA sites publish many PDFs — annual reports, FAQs, technical documents, board materials — that are invisible to site search today. Most ICJIA sites use Fuse.js for client-side fuzzy search, which works for pages and news posts but only matches the **prose that links to a PDF**, never the PDF's content.

The fix: extract text from each PDF at build time, append it to the Fuse index as a normal row. Solr has done this for a decade via Tika, but Solr is a JVM-based search **server** — overkill for static sites. This package is the Tika-equivalent without Solr: extract text at build time, output JSON, let the existing client-side search engine handle the query.

The R3 site proved the approach works in ~210 lines of inline code across three files. v1 generalizes that pattern into a publishable package.

---

## The 30-second integration

You already have a static site with Fuse.js. Add PDF content search in three lines:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const pdfRows = await indexPdfs([
  'https://example.com/annual-report-2024.pdf',
  'https://example.com/faqs.pdf',
]);

const allRows = [...yourPageRows, ...pdfRows];
const fuse = new Fuse(allRows, { keys: ['title', 'text'], includeMatches: true });
```

For highlighted snippets in results:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

for (const r of results) {
  console.log(r.item.title, snippetHTMLFor(r));
  // → "Stigma PDF For Posting" "…recovery from substance use disorder is hampered by <mark>stigma</mark>…"
}
```

That's the consumer-facing surface. Everything else is configuration.

---

## Install

```bash
npm install @icjia/pdf-search-index
# or
pnpm add @icjia/pdf-search-index
# or
yarn add @icjia/pdf-search-index
```

Optional peer dependencies (only needed if you import the listed entry points):

| Entry point | Peer dependency | Required when                                   |
| ----------- | --------------- | ----------------------------------------------- |
| `/fuse`     | `fuse.js@^7`    | You import `createFuseIndex`                    |
| `/snippet`  | `fuse.js@^7`    | You import `snippetHTMLFor` (uses Fuse's types) |
| `/mcp`      | none            | Always — MCP SDK is bundled                     |

The core `indexPdfs` / `extractPdfText` / `extractPdfsFromBody` functions don't require `fuse.js` at all.

---

## Where your PDFs can live

The package consumes URLs. Anything fetchable at build time becomes a searchable row — there's no required hosting model. The four patterns below cover everything we've seen in real deployments.

### Pattern 1 — Alongside the site (static / `public/`)

The simplest case. Drop PDFs into your framework's static-asset directory and let the build pipeline ship them with the rest of the site:

| Framework  | Drop PDFs in                   | Served at       |
| ---------- | ------------------------------ | --------------- |
| Astro      | `public/docs/`                 | `/docs/foo.pdf` |
| Vite / Vue | `public/docs/`                 | `/docs/foo.pdf` |
| Next.js    | `public/docs/`                 | `/docs/foo.pdf` |
| Nuxt       | `public/docs/`                 | `/docs/foo.pdf` |
| 11ty       | `src/docs/` (passthrough copy) | `/docs/foo.pdf` |

Reference them in markdown content or pass the URL list directly:

```ts
// scripts/build-index.mjs (run as a prebuild step)
import { indexPdfs } from '@icjia/pdf-search-index';

// The PDFs ship from public/docs/. During build, your dev server is up at
// the framework's port (Astro 4321, Vite 5173, Next 3000, Nuxt 3000) —
// fetch them through that.
const rows = await indexPdfs([
  'http://localhost:4321/docs/annual-report.pdf',
  'http://localhost:4321/docs/faq.pdf',
]);
```

For frameworks that don't run a dev server during build (or for hermetic CI), use a `file://` URL with a small `localFetch` helper (every example in [`examples/*`](./examples) demonstrates this pattern):

```ts
import { indexPdfs } from '@icjia/pdf-search-index';
import { localFetch } from './local-fetch.mjs';
import { resolve } from 'node:path';

const rows = await indexPdfs([`file://${resolve('public/docs/annual-report.pdf')}`], {
  fetch: localFetch,
});
```

**When to use this pattern:** small fixed corpus, slow-churn content, single team owns both content and code, no CMS in the stack.

### Pattern 2 — External CMS (Strapi, Sanity, Contentful, Drupal, etc.)

PDFs live in the CMS's media library; content authors upload them through the CMS UI; the markdown body references them via standard `[Title](url)` links. Your Nuxt / Astro / Next build fetches the body at build time, the package walks it, and the PDF text becomes searchable alongside the page text.

This is the canonical case for `@icjia/nuxt-pdf-search-index`. The module ships `extractPdfsFromCmsBody` for exactly this flow.

#### Strapi v5 (current as of 2025+)

v5 dropped the `attributes` wrapper — fields sit on the data object directly. Document IDs (string) replaced numeric `id`s as the stable identifier.

```ts
// server/api/searchIndex.get.ts
import { extractPdfsFromCmsBody } from '#imports';

interface StrapiV5Page {
  documentId: string;
  title: string;
  body: string;
}

export default defineEventHandler(async () => {
  const res = await $fetch<{ data: StrapiV5Page[] }>('https://cms.example.com/api/pages');

  const pdfs = [];
  for (const page of res.data) {
    pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
  }
  return pdfs;
});
```

#### Strapi v4

Wraps fields in `attributes`. Media relations need `populate=*` to be returned.

```ts
import { extractPdfsFromCmsBody } from '#imports';

interface StrapiV4Page {
  id: number;
  attributes: {
    title: string;
    body: string;
  };
}

const res = await $fetch<{ data: StrapiV4Page[] }>('https://cms.example.com/api/pages?populate=*');

const pdfs = [];
for (const page of res.data) {
  pdfs.push(...(await extractPdfsFromCmsBody(page.attributes.body)));
}
```

#### Strapi v3

Flat response shape (no `data` envelope, no `attributes`).

```ts
import { extractPdfsFromCmsBody } from '#imports';

interface StrapiV3Page {
  id: number;
  title: string;
  body: string;
}

const pages = await $fetch<StrapiV3Page[]>('https://cms.example.com/pages');

const pdfs = [];
for (const page of pages) {
  pdfs.push(...(await extractPdfsFromCmsBody(page.body)));
}
```

#### Strapi quirk: relative URLs

By default, Strapi 4/5 serves uploaded media at relative paths like `/uploads/annual-report-abc123.pdf`. The URL scanner only matches absolute `https?://` URLs, so you need to absolutize before scanning:

```ts
const CMS_BASE = process.env.CMS_BASE!; // e.g. 'https://cms.example.com'

const absolutized = page.body.replaceAll(/\]\((\/uploads\/[^)]+\.pdf)/g, `](${CMS_BASE}$1`);
pdfs.push(...(await extractPdfsFromCmsBody(absolutized)));
```

Or configure Strapi to serve absolute URLs (Strapi 4/5: set `url` in `config/server.ts` to your public CMS hostname; or use an upload provider like `aws-s3` that returns absolute CDN URLs).

#### Strapi quirk: token-gated uploads

If your Strapi instance requires a JWT or API token to download media (private media or `users-permissions` restrictions), pass a custom `fetch` with the auth header:

```ts
const authFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
    },
  });

pdfs.push(...(await extractPdfsFromCmsBody(body, { fetch: authFetch })));
```

The `fetch` option threads through to every PDF download. Same pattern works for Bearer / Basic / API-key / custom-header auth on any CMS.

#### Strapi quirk: PDFs as structured media relations (not in body markdown)

If your CMS schema stores PDFs as typed media fields (`attachments: Media[]`) rather than as markdown links inside `body`, the scanner won't find them. Skip `extractPdfsFromCmsBody` and call `indexPdfs` directly with the URL list:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const directRows = await indexPdfs(
  page.attachments.map((a) => ({
    url: CMS_BASE + a.url,
    title: a.name ?? a.alternativeText,
  })),
);
```

#### Other CMSes

The pattern generalizes — any CMS that returns markdown bodies with `[Title](https://...pdf)` links works with `extractPdfsFromCmsBody` or core's `extractPdfsFromBody`. Sanity (`portableTextToMarkdown` first), Contentful (rich-text rendered to markdown), Directus, Drupal — all use the same shape.

### Pattern 3 — External CDN (S3, Cloudflare R2, GitHub raw, etc.)

PDFs live on an object store at known HTTPS URLs. Pass the URL list directly to `indexPdfs`:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  'https://cdn.example.com/reports/2024-annual.pdf',
  'https://cdn.example.com/reports/2023-annual.pdf',
  { url: 'https://cdn.example.com/legal/policy.pdf', title: 'Privacy Policy' },
]);
```

Works with signed URLs (S3 presigned, Cloudflare signed URLs) — just refresh them in your build script. For private buckets requiring SDK auth, use a custom `fetch` that pulls from the SDK:

```ts
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: 'us-east-1' });
const signedFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('s3://')) {
    const [, , bucket, ...keyParts] = url.split('/');
    const signed = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: keyParts.join('/') }),
      { expiresIn: 60 },
    );
    return fetch(signed);
  }
  return fetch(input);
};

const rows = await indexPdfs(['s3://my-bucket/reports/2024.pdf'], { fetch: signedFetch });
```

### Pattern 4 — Local-only (build-time, tests / examples)

For hermetic builds where the PDFs ship in your repo and never get a public URL, use `file://` URLs + a `localFetch` helper that intercepts the `file://` scheme. Every example in [`examples/`](./examples) uses this pattern — see [`examples/plain-node/local-fetch.mjs`](./examples/plain-node/local-fetch.mjs) for the 15-line helper.

```ts
import { indexPdfs } from '@icjia/pdf-search-index';
import { localFetch } from './local-fetch.mjs';
import { resolve } from 'node:path';

const rows = await indexPdfs(
  [`file://${resolve('./fixtures/foo.pdf')}`, `file://${resolve('./fixtures/bar.pdf')}`],
  { fetch: localFetch },
);
```

**When to use this pattern:** offline / air-gapped builds, deterministic fixtures for tests, examples in this repo.

### What's configurable

Every pattern above goes through the same options object. The full list:

| Option                  | Type                             | Default                    | What it's for                                                                                     |
| ----------------------- | -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `cacheDir`              | `string`                         | `'.pdf-cache'`             | Where extracted text is cached on disk between builds                                             |
| `fetch`                 | `typeof fetch`                   | global `fetch`             | **The escape hatch** — auth headers, `file://` URLs, signed URLs, redirects                       |
| `fetchTimeout`          | `number` (ms)                    | `30000`                    | Abort the fetch after this many ms                                                                |
| `maxBytes`              | `number`                         | `32 * 1024 * 1024` (32 MB) | Reject PDFs larger than this (declared `Content-Length` first, then streaming cap)                |
| `maxExtractedTextChars` | `number`                         | `5_000_000`                | Cap on extracted text length per PDF (defends against compression-bomb PDFs)                      |
| `concurrency`           | `number`                         | `4`                        | Parallel downloads via `p-limit`                                                                  |
| `cache`                 | `'use' \| 'bypass' \| 'refresh'` | `'use'`                    | `bypass` skips read+write; `refresh` overwrites cache; `use` is read-through                      |
| `debug`                 | `boolean`                        | `false`                    | When `true`, failure logs include the full URL and underlying error message (default scrubs both) |

For the Astro and Nuxt adapters, these flow through too — see the [Astro integration](#astro-integration) and [Nuxt 4 module](#nuxt-4-module) sections for the adapter-specific option tables.

### Cache invalidation across hosting patterns

Cache keys are `SHA-256(url)` truncated to 16 hex chars. Implications by hosting model:

- **Static `/public/` PDFs** — URL stable for the life of a deploy. Cache works perfectly.
- **Strapi (and most CMSes)** — uploads usually get a hash suffix in the filename (`annual-report-abc123.pdf`), so a re-upload gets a new URL and the cache invalidates naturally. If your CMS overwrites at the same URL (rare; check your media provider config), run `pdf-search-index cache rm <url>` or just `pdf-search-index cache clear` in your build script before `indexPdfs`.
- **External CDN with content-addressed URLs (S3 + Cloudfront with versioning, R2 with hashes)** — same as Strapi-with-hashing. Naturally cache-friendly.
- **External CDN with stable URLs (no versioning)** — same caveat as Strapi-no-hashing. Use `--refresh` or clear the cache when you know the content changed.

---

## Using a search engine other than Fuse.js

**Short answer: Fuse.js is optional.** The core extraction API produces plain JSON. You can feed it to any client- or server-side search engine — MiniSearch, Orama, Lunr, FlexSearch, Pagefind, Typesense, MeiliSearch, Algolia. Fuse.js is only required if you specifically import the `/fuse` or `/snippet` helper subpaths.

### What's Fuse-coupled vs framework-agnostic

| Surface                                              | Fuse required? | Notes                                                                                    |
| ---------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `extractPdfText`, `indexPdfs`, `extractPdfsFromBody` | No             | Output is plain `IndexedPdf[]` JSON                                                      |
| `@icjia/astro-pdf-search-index` integration          | No             | Emits the same JSON to `public/<endpoint>.json`                                          |
| `@icjia/nuxt-pdf-search-index` helpers               | No             | Both helpers return `IndexedPdf[]` — feed to any engine                                  |
| `pdf-search-index` CLI (root, `cache`, `verify`)     | No             | The CLI's `search` subcommand uses Fuse internally, but it's bundled — not your peer dep |
| MCP `search_pdfs` tool                               | Internal       | Bundled with the MCP server; not a consumer concern                                      |
| `createFuseIndex` (`/fuse` entry)                    | **Yes**        | Helper specifically for building a Fuse instance                                         |
| `snippetHTMLFor` (`/snippet` entry)                  | **Yes**        | Types `FuseResult<T>` directly; tied to Fuse's match-indices shape                       |

If you're not using Fuse, don't install `fuse.js` and don't import the `/fuse` or `/snippet` subpaths. The core stays useful — you get the indexed JSON, you pick the search engine.

### The row shape every engine can consume

```ts
interface IndexedPdf {
  id: string; // 'pdf-' + first 12 hex chars of SHA-256(url) — stable across rebuilds
  url: string;
  title: string;
  text: string;
  pages?: number;
  extractedAt?: string;
}
```

### Recipes — minimum-working examples for each engine

All recipes assume you've already produced `rows: IndexedPdf[]` via `indexPdfs(...)` or one of the adapters. The result of each recipe is a queryable index — wire your UI to it as usual for that engine.

#### MiniSearch

```ts
import MiniSearch from 'minisearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const search = new MiniSearch({
  fields: ['title', 'text'],
  storeFields: ['id', 'url', 'title'],
  searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.2 },
});
search.addAll(rows);

const results = search.search('applicant portal'); // → [{ id, url, title, score, match, terms }]
```

#### Orama

```ts
import { create, insertMultiple, search } from '@orama/orama';
import { indexPdfs } from '@icjia/pdf-search-index';

const db = create({
  schema: { id: 'string', url: 'string', title: 'string', text: 'string' },
});
const rows = await indexPdfs([
  /* urls */
]);
await insertMultiple(db, rows);

const results = await search(db, { term: 'applicant portal' });
```

#### Lunr.js

```ts
import lunr from 'lunr';
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const idx = lunr(function () {
  this.ref('id');
  this.field('title', { boost: 10 });
  this.field('text');
  rows.forEach((r) => this.add(r));
});

const refs = idx.search('applicant portal').map((r) => r.ref);
const results = refs.map((id) => rows.find((r) => r.id === id)!);
```

#### FlexSearch

```ts
import FlexSearch from 'flexsearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const index = new FlexSearch.Document({
  document: { id: 'id', index: ['title', 'text'], store: ['url', 'title'] },
});
rows.forEach((r) => index.add(r));

const results = index.search('applicant portal'); // → results per field
```

#### Pagefind (static-site search bundler)

Pagefind crawls HTML rather than ingesting JSON, so the bridge is to emit one HTML stub per PDF that Pagefind then indexes:

```ts
import { indexPdfs } from '@icjia/pdf-search-index';
import { mkdir, writeFile } from 'node:fs/promises';

const rows = await indexPdfs([
  /* urls */
]);
await mkdir('dist/pdf-stubs', { recursive: true });
for (const r of rows) {
  await writeFile(
    `dist/pdf-stubs/${r.id}.html`,
    `<!doctype html>
<html data-pagefind-body>
<head><title>${r.title}</title></head>
<body>
  <h1 data-pagefind-meta="title">${r.title}</h1>
  <a data-pagefind-meta="url" href="${r.url}">${r.url}</a>
  <pre>${r.text.replace(/</g, '&lt;')}</pre>
</body>
</html>`,
  );
}
// then: npx pagefind --site dist
```

#### Typesense

```ts
import Typesense from 'typesense';
import { indexPdfs } from '@icjia/pdf-search-index';

const client = new Typesense.Client({
  nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
  apiKey: process.env.TYPESENSE_API_KEY!,
});

const rows = await indexPdfs([
  /* urls */
]);
await client.collections('pdfs').documents().import(rows, { action: 'upsert' });
```

#### MeiliSearch

```ts
import { MeiliSearch } from 'meilisearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const client = new MeiliSearch({
  host: 'http://localhost:7700',
  apiKey: process.env.MEILI_KEY,
});
const rows = await indexPdfs([
  /* urls */
]);
await client.index('pdfs').addDocuments(rows);
```

#### Algolia

```ts
import { algoliasearch } from 'algoliasearch';
import { indexPdfs } from '@icjia/pdf-search-index';

const client = algoliasearch('YOUR_APP_ID', process.env.ALGOLIA_WRITE_KEY!);
const rows = await indexPdfs([
  /* urls */
]);
await client.saveObjects({
  indexName: 'pdfs',
  objects: rows.map((r) => ({ objectID: r.id, ...r })),
});
```

### Snippet rendering without `snippetHTMLFor`

The packaged `snippetHTMLFor` consumes Fuse's `matches[].indices` shape — `[[start, end], ...]` character offsets. Other engines either:

- Return character-level match offsets in a different shape (Orama's `position[]`, MiniSearch's `match` object)
- Return term-level matches without offsets (Lunr's `metadata`, Pagefind's excerpts)
- Don't expose match offsets at all (FlexSearch returns just document IDs)

For engines that **don't** return character offsets, the simplest snippet path is to do your own substring search for the query terms inside `r.text` and slice ±N chars around the first hit. The vanilla-HTML example does this in ~30 inline lines: see [`examples/html/public/index.html`](./examples/html/public/index.html) — search for `snippetHTMLFor`. Copy-paste, adapt the result shape to whatever your engine returns.

For engines that **do** return character offsets (Orama, MiniSearch), you can write a thin adapter that maps their offset shape to Fuse's `indices` shape and re-use the package's `snippetHTMLFor`:

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

// Example: Orama position[] → Fuse-shaped result
function asFuseResult(oramaHit) {
  return {
    item: oramaHit.document,
    matches: [
      {
        key: 'text',
        value: oramaHit.document.text,
        indices: oramaHit.positions.text.map((p) => [p.start, p.start + p.length - 1]),
      },
    ],
  };
}

const html = snippetHTMLFor(asFuseResult(hit));
```

This works because `snippetHTMLFor` only looks at `r.item[matchKey]` and the longest entry in `r.matches[*].indices`. As long as your adapter populates those two fields correctly, the helper produces correct output.

### Will the CLI / MCP / Astro / Nuxt surfaces work with my engine?

Yes — the index emitted by each is plain JSON, decoupled from any search engine:

- **CLI**: `pdf-search-index --out dist/searchIndex.json https://...` writes pure JSON
- **MCP `index_pdfs` / `get_pdf_index`**: returns rows; you do what you want with them
- **Astro integration**: writes `public/<endpoint>.json`
- **Nuxt helpers**: return `IndexedPdf[]`

Only the `/fuse` helper, `/snippet` helper, CLI's `search` subcommand, and MCP's `search_pdfs` tool are Fuse-internal — and the last two bundle Fuse themselves, so they don't require you to install it.

---

## Core API

### `extractPdfText(url, options?) → Promise<string>`

Fetch a PDF and return its text. The lowest-level entry point.

```ts
import { extractPdfText } from '@icjia/pdf-search-index';

const text = await extractPdfText('https://example.com/foo.pdf');
console.log(text.slice(0, 200));
```

**Options** (`ExtractOptions`):

| Option                  | Type                             | Default                    | Notes                                                                                                       |
| ----------------------- | -------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `cacheDir`              | `string`                         | `'.pdf-cache'`             | Where extracted text is cached on disk                                                                      |
| `fetchTimeout`          | `number` (ms)                    | `30000`                    | Abort the fetch after this many ms                                                                          |
| `maxBytes`              | `number`                         | `32 * 1024 * 1024` (32 MB) | Reject PDFs larger than this. Lowered from 100 MB in 1.0.2 — opt up via this option if you host larger PDFs |
| `maxExtractedTextChars` | `number`                         | `5_000_000` (5 MB)         | Truncate extracted text above this length. Defends against compression-bomb-style PDFs                      |
| `fetch`                 | `typeof fetch`                   | global `fetch`             | Inject your own (auth headers, `file://`, tests)                                                            |
| `cache`                 | `'use' \| 'bypass' \| 'refresh'` | `'use'`                    | `bypass` skips read+write; `refresh` overwrites                                                             |
| `mergePages`            | `boolean`                        | `true`                     | When `false`, returns one entry per page                                                                    |
| `debug`                 | `boolean`                        | `false`                    | When `true`, failure logs include the full URL and underlying error message (default scrubs both)           |

### `indexPdfs(urls, options?) → Promise<IndexedPdf[]>`

Batch-index an array of PDF URLs.

```ts
import { indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  'https://example.com/a.pdf',
  { url: 'https://example.com/b.pdf', title: 'Custom Title' },
  { url: 'https://example.com/c.pdf', title: 'C', id: 'my-id' },
]);
```

Each entry is either a bare URL string or `{ url, title?, id? }`. Duplicates by URL are deduped (first occurrence wins).

**Additional option** beyond `ExtractOptions`:

| Option        | Type     | Default | Notes                          |
| ------------- | -------- | ------- | ------------------------------ |
| `concurrency` | `number` | `4`     | Parallel fetches via `p-limit` |

### `extractPdfsFromBody(markdown, options?) → Promise<IndexedPdf[]>`

Scan a markdown body for PDF URLs (both `[Title](url.pdf)` markdown links and bare `https://...pdf` URLs), extract each, return rows.

```ts
import { extractPdfsFromBody } from '@icjia/pdf-search-index';

const rows = await extractPdfsFromBody(page.body);
```

Title resolution order: markdown link text > pdf.js info-dict `Title` > humanized filename.

### Indexed row shape

```ts
interface IndexedPdf {
  id: string; // 'pdf-' + first 12 hex chars of SHA-256(url)
  url: string;
  title: string; // see title resolution order
  text: string; // empty string on extraction failure
  pages?: number; // total pages (when known)
  extractedAt?: string; // ISO timestamp; OMITTED on cache hits
}
```

`pages` and `extractedAt` are optional. `extractedAt` is **omitted on cache hits** so the JSON is byte-stable across rebuilds — diffs stay reviewable and CDN caching works.

---

## Fuse helper (`/fuse` entry)

```ts
import { createFuseIndex } from '@icjia/pdf-search-index/fuse';

const fuse = await createFuseIndex({
  urls: ['https://example.com/a.pdf', 'https://example.com/b.pdf'],
  fuseOptions: { threshold: 0.2, includeMatches: true },
});

const results = fuse.search('methamphetamine');
```

The defaults Fuse uses (when you pass `fuseOptions`, they're merged on top of):

```ts
{
  keys: ['title', 'text'],
  threshold: 0.2,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
}
```

The same defaults are used by the CLI's `search` subcommand and the MCP `search_pdfs` tool — keeping them DRY across surfaces means your CLI/MCP/in-browser results behave the same.

**Note:** `createFuseIndex` accepts all `IndexPdfsOptions` fields (`cacheDir`, `concurrency`, `fetch`, etc.) — they're passed through to the internal `indexPdfs` call.

---

## Snippet helper (`/snippet` entry)

```ts
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const html = snippetHTMLFor(fuseResult, {
  contextChars: 80,
  matchKey: 'text',
  collapseWhitespace: true,
});
// → "…recovery from substance use disorder is hampered by <mark>stigma</mark>…"
```

Picks the longest match span in the matched key, slices ±N chars of context, collapses whitespace runs (PDF text reflow is noisy), HTML-escapes everything except the `<mark>` wrap, and adds ellipses where truncated. Output is HTML-escaped except the `<mark>` wrap — safe to pass to `v-html` / `dangerouslySetInnerHTML` when the input comes from your own indexed PDFs.

**Options:**

| Option               | Type      | Default  | Notes                                                                                                                                |
| -------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `contextChars`       | `number`  | `80`     | Characters of context on each side of the match                                                                                      |
| `matchKey`           | `string`  | `'text'` | Which Fuse `matches` entry to use                                                                                                    |
| `collapseWhitespace` | `boolean` | `true`   | Collapse `\s+` to single space inside output                                                                                         |
| `maxSnippets`        | `number`  | `1`      | (1.0.3+) Render up to N non-overlapping snippets per result, ordered by document position. Default `1` is byte-identical to ≤ 1.0.2. |
| `separator`          | `string`  | `' … '`  | (1.0.3+) Joins snippets when `maxSnippets > 1`. Default is space + horizontal ellipsis + space.                                      |

**Multi-snippet example:**

```ts
const html = snippetHTMLFor(fuseResult, { maxSnippets: 3, contextChars: 100 });
// → "…drug <mark>testing</mark> required for… … evidence-based <mark>testing</mark> protocols… …<mark>testing</mark> programs are…"
```

The picker greedily takes the N **longest** non-overlapping spans (overlap = context windows intersect), then re-sorts them by start position so snippets appear in document order. Clustered hits collapse into one window; widely-spread hits surface as distinct passages.

---

## CLI (`pdf-search-index` bin)

```bash
# One-shot: index URLs to JSON
npx @icjia/pdf-search-index https://...pdf https://...pdf

# From a file (one URL per line, # comments allowed)
npx @icjia/pdf-search-index --from urls.txt

# From a sitemap (scans pages for PDF links, indexes them)
npx @icjia/pdf-search-index --from-sitemap https://example.com/sitemap.xml

# Write to a file instead of stdout
npx @icjia/pdf-search-index --out public/searchIndex.json https://...pdf

# Force re-extraction (skip cache read, skip cache write)
npx @icjia/pdf-search-index --refresh https://...pdf
# Refetch but overwrite cache
npx @icjia/pdf-search-index --refresh-all https://...pdf

# Sanity check a single PDF (exit 1 on failure)
npx @icjia/pdf-search-index verify https://...pdf

# Search a previously built JSON
npx @icjia/pdf-search-index search index.json "drug testing"

# Cache management
npx @icjia/pdf-search-index cache ls           # list cached entries with url, length, pages, extractedAt
npx @icjia/pdf-search-index cache rm <url>     # invalidate one
npx @icjia/pdf-search-index cache clear        # wipe the whole cache
```

**Output formats** (root command):

- Default: pretty JSON to stdout
- `--ndjson`: one row per line
- `--text`: concatenated extracted text, no metadata

**Exit codes:**

- `0` by default, **even on individual PDF failures** (the index stays valid; the failed row has `text: ''`)
- `1` when `--strict` is set and any PDF failed extraction

**Global options:**

| Option                 | Type   | Default      | Notes                                           |
| ---------------------- | ------ | ------------ | ----------------------------------------------- |
| `--from <file>`        | path   | —            | Read URLs from a file (one per line)            |
| `--from-sitemap <url>` | url    | —            | Scan a sitemap, index linked PDFs               |
| `--cache-dir <dir>`    | path   | `.pdf-cache` | Cache directory                                 |
| `--concurrency <n>`    | number | `4`          | Parallel fetches                                |
| `--out <file>`         | path   | stdout       | Where to write the output                       |
| `--strict`             | flag   | off          | Exit 1 if any PDF failed                        |
| `--refresh`            | flag   | off          | Re-extract this URL only, skip cache read+write |
| `--refresh-all`        | flag   | off          | Re-extract all URLs and overwrite cache entries |
| `--ndjson`             | flag   | off          | Emit newline-delimited JSON                     |
| `--text`               | flag   | off          | Emit concatenated text only                     |

---

## MCP server (`/mcp` entry)

For LLM workflows where the model needs to search inside PDFs during a conversation.

```bash
npx -p @icjia/pdf-search-index@latest pdf-search-index-mcp
```

Wire it into Claude Desktop / Cursor / any MCP-aware client. **Always use `@latest`** so the client picks up the most recent security and bug fixes — pinning to a specific version means missing patches:

```json
{
  "servers": {
    "pdf-search": {
      "command": "npx",
      "args": ["-p", "@icjia/pdf-search-index@latest", "pdf-search-index-mcp"]
    }
  }
}
```

**Tools:**

| Tool            | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `extract_pdf`   | Single URL → `{ text, pages }`                                      |
| `index_pdfs`    | URL list (or sitemap URL) → `IndexedPdf[]`                          |
| `get_pdf_index` | List cached entries with metadata (url, length, pages, extractedAt) |
| `search_pdfs`   | URL list + query → ranked snippets (Fuse-powered, internal)         |
| `clear_cache`   | Manual flush                                                        |
| `get_status`    | Server / library / pdf.js versions, cache stats                     |

All tools accept an optional `cacheDir` so a single-session conversation doesn't pollute the user's persistent cache.

**Auth in v1**: none — the server fetches public URLs only. Add a `fetchHeaders` option when a real consumer needs auth.

---

## Astro integration

```bash
npm install @icjia/pdf-search-index @icjia/astro-pdf-search-index
```

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: 'searchIndex.pdfs.json',
      cacheDir: '.astro/.pdf-cache',
    }),
  ],
});
```

The integration:

1. Walks each configured content collection.
2. Reads every `.md` / `.mdx` file, strips frontmatter, and passes the body to `extractPdfsFromBody`.
3. Dedupes PDF rows across collections.
4. Writes JSON to `public/<endpoint>` so Astro's build pipeline ships it alongside other static assets.

**Options:**

| Option             | Type           | Default                   | Notes                                             |
| ------------------ | -------------- | ------------------------- | ------------------------------------------------- |
| `collections`      | `string[]`     | (required)                | Names of Astro content collections                |
| `endpoint`         | `string`       | `'searchIndex.pdfs.json'` | Output filename under `public/`                   |
| `cacheDir`         | `string`       | `'.astro/.pdf-cache'`     | Extraction cache                                  |
| `concurrency`      | `number`       | `4`                       | Parallel fetches                                  |
| `contentSourceDir` | `string`       | `'content'`               | Directory under `srcDir` containing collections   |
| `fetch`            | `typeof fetch` | global `fetch`            | Custom fetch (auth, `file://` for tests/examples) |

In production you don't need the `fetch` option — your CMS-authored markdown links to real https URLs.

---

## Nuxt 4 module

```bash
npm install @icjia/pdf-search-index @icjia/nuxt-pdf-search-index
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
});
```

**Module options:**

| Option        | Type     | Default              | Notes                         |
| ------------- | -------- | -------------------- | ----------------------------- |
| `cacheDir`    | `string` | `'.nuxt/.pdf-cache'` | File cache for extracted text |
| `concurrency` | `number` | `4`                  | Parallel fetches              |

**Per-call options** (passed to either helper):

The helpers accept `IndexPdfsOptions` directly — `fetch`, `fetchTimeout`, `maxBytes`, `cache`, `mergePages`, `concurrency` — overriding the module defaults per call.

The module auto-imports two helpers into server-side `#imports`:

- `extractPdfsFromCmsBody(body, options?)` — for Strapi-style CMS body strings
- `extractPdfsFromContentDoc(doc, options?)` — for `@nuxt/content` docs (accepts `{ body }`, `{ _raw }`, `{ rawbody }`, or a plain markdown string)

Both honor `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from `nuxt.config.ts` unless overridden by the per-call `options` arg. Both return `IndexedPdf[]`.

A copy-paste Nitro route template lives at [`packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts`](./packages/nuxt-pdf-search-index/src/runtime/server/route-template.ts). Drop it at `server/api/searchIndex.get.ts` in your Nuxt project and adapt the CMS fetch + `@nuxt/content` query to your stack.

---

## Examples

### Live demo

The flagship live demo lives in [`examples/netlify-demo/`](./examples/netlify-demo) — an Astro 5 site with a Vue 3 search island, a hand-designed dark-mode UI, and a `netlify.toml` so deploying it to Netlify is one click. Once deployed it shows the indexed corpus, a sticky search bar, and live highlighted snippets across every committed PDF in `examples/_fixtures/`.

> Screenshot (when deployed): dark-mode search interface, ICJIA PDFs listed with title/page count/file size, sticky search bar at top, live-highlighted snippets in result cards.

The reference deployment lives at **<https://icjia-pdf-search.netlify.app/>** — click through to try it. To deploy your own copy under your own subdomain, see "Deploying the live demo to Netlify" below.

The [`examples/`](./examples) directory has eight runnable example sites in total, each demonstrating one integration pattern. Every example consumes the packages via the pnpm workspace link and reads PDFs from the shared [`examples/_fixtures/`](./examples/_fixtures) directory via `file://` URLs + a tiny `local-fetch.mjs` helper (so they work offline).

The fixture PDFs in [`examples/_fixtures/`](./examples/_fixtures) are **randomly-clicked public samples from ICJIA's website** ([icjia.illinois.gov](https://icjia.illinois.gov/)) covering juvenile justice, public health, evaluation reports, and other ICJIA programmatic topics. They were not curated to make the examples look good — they're arbitrary PDFs from the live public corpus, preserved with their original CMS filenames. None of them contain PII. Replace them with any PDFs you like; every example auto-discovers `.pdf` files in that directory at build time. See [`examples/_fixtures/README.md`](./examples/_fixtures/README.md) for the full provenance note.

| Example                                   | Stack                               | Adapter / API                                                   | Run                                              |
| ----------------------------------------- | ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| [`netlify-demo`](./examples/netlify-demo) | Astro 5 + Vue + dark-mode UI        | `@icjia/astro-pdf-search-index` — **polished, deployable**      | `pnpm --filter @icjia-examples/netlify-demo dev` |
| [`plain-node`](./examples/plain-node)     | Node 20+, no UI                     | Programmatic (`indexPdfs`, `createFuseIndex`, `snippetHTMLFor`) | `pnpm --filter @icjia-examples/plain-node start` |
| [`html`](./examples/html)                 | Vanilla HTML + Fuse CDN             | Programmatic, build via Node script                             | `pnpm --filter @icjia-examples/html dev`         |
| [`vue`](./examples/vue)                   | Vite + Vue 3 + Fuse                 | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/vue dev`          |
| [`astro`](./examples/astro)               | Astro 5 + Vue island + Fuse         | `@icjia/astro-pdf-search-index` — minimal smoke test            | `pnpm --filter @icjia-examples/astro dev`        |
| [`nextjs`](./examples/nextjs)             | Next.js 15 App Router + Fuse        | Programmatic + `snippetHTMLFor`                                 | `pnpm --filter @icjia-examples/nextjs dev`       |
| [`eleventy`](./examples/eleventy)         | 11ty 3 + Fuse CDN                   | Programmatic, inline JSON island                                | `pnpm --filter @icjia-examples/eleventy dev`     |
| [`nuxt-mixed`](./examples/nuxt-mixed)     | Nuxt 4 + `@nuxt/content` + mock CMS | `@icjia/nuxt-pdf-search-index` (both helpers)                   | `pnpm --filter @icjia-examples/nuxt-mixed dev`   |

### Examples — step-by-step

1. **Clone and install:**

   ```bash
   git clone https://github.com/ICJIA/pdf-search-index.git
   cd pdf-search-index
   pnpm install
   ```

2. **Confirm fixtures are in place:**

   ```bash
   ls examples/_fixtures/*.pdf
   ```

   You should see several PDFs — they're randomly-clicked public samples
   from [icjia.illinois.gov](https://icjia.illinois.gov/) (see
   [`examples/_fixtures/README.md`](./examples/_fixtures/README.md) for
   provenance). No PII.

3. **Pick an example and run its dev script.** Start with `netlify-demo`
   if you want to see the package in a polished, ship-ready site:

   ```bash
   # Polished, deployable Astro 5 site — see "Deploying the live demo
   # to Netlify" below. (RECOMMENDED — this is the flagship demo.)
   pnpm --filter @icjia-examples/netlify-demo dev   # http://localhost:4322/

   # Programmatic API, no UI
   pnpm --filter @icjia-examples/plain-node start

   # Vanilla HTML + Fuse via CDN
   pnpm --filter @icjia-examples/html dev           # http://localhost:4173/

   # Vite + Vue 3
   pnpm --filter @icjia-examples/vue dev            # http://localhost:5173/

   # Minimal Astro 5 + Vue island (integration smoke test)
   pnpm --filter @icjia-examples/astro dev          # http://localhost:4321/

   # Next.js 15 App Router
   pnpm --filter @icjia-examples/nextjs dev         # http://localhost:3000/

   # 11ty 3 + inline JSON island
   pnpm --filter @icjia-examples/eleventy dev       # http://localhost:8080/

   # Nuxt 4 + @nuxt/content + mocked CMS
   pnpm --filter @icjia-examples/nuxt-mixed dev     # http://localhost:3001/
   ```

4. **Try a query that matches the committed fixtures.** The committed
   samples cover juvenile justice, public health, evaluation reports,
   substance-use stigma, methamphetamine trends, and other ICJIA
   programmatic topics — so search terms that work out of the box include:
   - `"stigma"` — matches the Stigma PDF
   - `"methamphetamine"` — matches the meth-trends overview
   - `"juvenile"` or `"snapshot"` — matches the JJ statewide snapshot
   - `"drug testing"` — matches the drug-testing lit review

5. **Build for production:**

   ```bash
   pnpm --filter @icjia-examples/<name> build
   pnpm --filter @icjia-examples/<name> preview    # or `serve`, or `start`
   ```

   Each example documents its build output and serve command in its own
   README — see the table above. For the Netlify-deployable variant, see
   "Deploying the live demo to Netlify" below.

### Deploying the live demo to Netlify

The [`examples/netlify-demo/`](./examples/netlify-demo) example is built around an **Astro 5** site that deploys to Netlify with zero manual config beyond pointing Netlify at the repo. The included [`examples/netlify-demo/netlify.toml`](./examples/netlify-demo/netlify.toml) handles Node version, build command, publish directory, and long-lived asset headers for the served PDFs.

To deploy your own copy:

1. **Fork or clone** [`https://github.com/ICJIA/pdf-search-index`](https://github.com/ICJIA/pdf-search-index) so Netlify can read it.
2. **Sign in** at [https://app.netlify.com](https://app.netlify.com). The free tier is sufficient.
3. **"Add new site" → "Import from Git"** → connect your GitHub account → pick the `pdf-search-index` repo.
4. In the build-settings dialog, leave most defaults but confirm:
   - **Base directory**: `examples/netlify-demo`
   - **Build command**: `pnpm install --frozen-lockfile=false && pnpm build` _(auto-detected from `netlify.toml`)_
   - **Publish directory**: `dist` _(auto-detected from `netlify.toml`)_
   - **Node version**: `22` _(auto-detected from `netlify.toml`'s `NODE_VERSION`)_
5. Click **Deploy**. Netlify clones the repo, runs the build from `examples/netlify-demo`, and gives you a live URL like `https://YOUR-SITE-NAME.netlify.app` within ~2 minutes.

Subsequent pushes to `main` (or whichever branch you've pointed Netlify at) trigger automatic redeploys. Pull requests get deploy previews automatically.

After your first deploy, update [`examples/netlify-demo/astro.config.ts`](./examples/netlify-demo/astro.config.ts)'s `site:` field to match your Netlify subdomain so Astro's canonical URLs are correct in the rendered HTML.

The full long-form deployment guide — including troubleshooting and the two-URL build-vs-runtime pattern — lives in [`examples/netlify-demo/README.md`](./examples/netlify-demo/README.md).

### Side-by-side integration code

The core "how does the integration look?" comparison across stacks:

**plain-node (programmatic)**

```js
import { indexPdfs } from '@icjia/pdf-search-index';
const rows = await indexPdfs(['https://example.com/foo.pdf']);
// rows is ready to merge into your Fuse data
```

**Astro (adapter)**

```ts
// astro.config.ts
import pdfSearch from '@icjia/astro-pdf-search-index';
export default defineConfig({
  integrations: [pdfSearch({ collections: ['docs'], endpoint: 'searchIndex.pdfs.json' })],
});
```

**Nuxt (adapter + server route)**

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['@icjia/nuxt-pdf-search-index'] });

// server/api/searchIndex.get.ts
import { extractPdfsFromCmsBody } from '#imports';
export default defineEventHandler(async () => {
  const rows = await $fetch('https://cms.example.com/api/pages');
  const pdfs = [];
  for (const r of rows.data) pdfs.push(...(await extractPdfsFromCmsBody(r.attributes.body)));
  return pdfs;
});
```

**Vite / Next.js / 11ty / vanilla HTML (build-script pattern)**

```js
// build-index.mjs (run as a `prebuild` script)
import { indexPdfs } from '@icjia/pdf-search-index';
import { writeFile } from 'node:fs/promises';
const rows = await indexPdfs([
  /* your PDF URLs */
]);
await writeFile('public/searchIndex.json', JSON.stringify(rows));
```

### What if I want to use my own PDFs?

Drop them into `examples/_fixtures/` and re-run the example. Each example detects every `.pdf` in that directory and indexes all of them.

If you'd rather wire up a totally different URL set, edit the example's `build-index.mjs` (or, for Astro / Nuxt examples, the `scripts/generate-content.mjs` content-generation step). Each example has a comment block explaining where to swap.

---

## Caching

URL-keyed file cache at `<cacheDir>/<hash>.txt` + `<cacheDir>/<hash>.meta.json` sidecar. Cache key = first 16 hex chars of SHA-256(url).

**Read-through, write-back flow:**

1. Look for `<cacheDir>/<key>.txt`. If found, return contents.
2. Fetch the PDF.
3. Run extraction via `unpdf`.
4. Write text + sidecar metadata.
5. Return text.

**No automatic invalidation in v1.** PDFs in most CMS systems are content-addressed at the storage layer (a new version gets a new URL). If a PDF mutates in place at the same URL, run `pdf-search-index --refresh <url>` or `pdf-search-index cache clear`.

ETag-based invalidation is on the post-v1 roadmap; it lands when in-place PDF mutation becomes a real consumer pain point.

---

## Error handling

All failures are **non-fatal by default**. The index stays valid; failed rows have `text: ''`; the build doesn't fail.

| Failure                               | Behavior                                            |
| ------------------------------------- | --------------------------------------------------- |
| Network error (DNS, timeout, refused) | Log warning, return `{ ..., text: '' }`             |
| HTTP non-2xx                          | Log warning with status, return `{ ..., text: '' }` |
| Body bigger than `maxBytes`           | Log warning, return `{ ..., text: '' }`             |
| pdf.js parse error (corrupt PDF)      | Log warning with error message, return empty text   |
| Encrypted PDF (no password)           | Log warning, return empty text                      |
| Image-only / scanned PDF              | Empty text returned silently (no text layer)        |
| Cache write error (disk full, EACCES) | Log warning, return text without caching            |

For CI where a broken upload pipeline should fail the build, run the CLI with `--strict` to flip to `exit 1`.

OCR for scanned PDFs is out of scope for v1 — it lands in a separate `@icjia/pdf-search-index-ocr` package when a real consumer needs it.

---

## Troubleshooting

**My index has rows but `text` is empty.**
The PDF is likely image-only / scanned. Open it in a viewer; if you can't select text, neither can `pdf.js`. OCR is on the post-v1 roadmap.

**`fetch error … TypeError: fetch failed`**
Some PDF hosts reject default Node user agents or require cookies. Pass a custom `fetch` (or `fetchHeaders` once that ships) with appropriate headers.

**`unpdf` errors on a real but old PDF.**
`unpdf` wraps `pdfjs-dist`. Very old (pre-1.4) PDFs occasionally fail to parse. Re-export the PDF from Acrobat to a current version, or fall back to `pdf-parse` by writing your own extractor function and passing it via a fork (no plugin slot in v1; `unpdf` covers ~99% of real PDFs).

**The CLI works but my framework integration emits an empty index.**
Check that the markdown bodies actually contain PDF URLs the regex picks up: `[Title](url.pdf)` markdown links or bare `https://...pdf` URLs. Relative paths (`/foo.pdf`) won't be fetched — the extractor needs an absolute URL. For build-time integration with relative paths, see [the `fetch` option](#core-api) — pass a custom `fetch` that resolves your site's URLs.

**`astro dev` doesn't produce my searchIndex.pdfs.json.**
The integration hooks into `astro:build:start`, which only fires during `astro build`. For dev mode, run `astro build` once first (or use the example pattern: a separate `predev` build script). The integration prioritizes byte-stable static output; dev-mode HMR was deferred to a future minor.

**My CI build is slow.**
First build is genuinely O(N PDFs) bytes-downloaded + parse-time. Subsequent builds hit the cache. Persist `.pdf-cache/` between CI runs (GitHub Actions: `actions/cache@v4` keyed on a stable cache key).

---

## Limits and non-goals

- **Not a search server.** No HTTP query endpoint, no inverted index, no live re-indexing. (For those, use Solr or Elasticsearch.)
- **Not OCR.** Image-only / scanned PDFs return empty text in v1.
- **Not multi-format.** `.docx`, `.xlsx`, `.pptx` are out of scope. Different format = different extractor; they belong in sibling packages.
- **Not a Fuse competitor.** We emit JSON. Consumers pick their search engine.
- **No automatic ETag-based cache invalidation in v1.**
- **Scale target: 10–1,000 PDFs per site.** Above that, look at server-side indexers.

---

## Security considerations & audit history

<a id="security-considerations"></a>

This package is **build-time tooling**. It runs against URL lists you (or your CMS authors) explicitly supplied, on the developer's or CI machine, never against user-submitted input at request time. The threat model and the defenses below reflect that scope. The [top-of-README Security callout](#security) names the v1.0.2 fixes in summary; this section spells out the trust model, the migration notes, and the full audit reference.

### Trust model

| Input source                                                  | Trust level                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URLs you pass directly to `indexPdfs([...])`                  | **Trusted** as developer input — they're code.                                                                                                                                                                          |
| Markdown bodies fed to `extractPdfsFromBody(body)` / adapters | **Trusted as developer-author**, but the _content_ may be authored by CMS editors. Malicious-author scenarios (compromised CMS, hostile content) are partially defended against (see below).                            |
| PDF byte streams downloaded from those URLs                   | **Untrusted** — the bytes are parsed by `unpdf` / `pdfjs-dist`. We add belt-and-suspenders caps on size and extracted-text length.                                                                                      |
| LLM-supplied tool arguments via the MCP server                | **Untrusted** — the LLM may have been prompt-injected via PDF content it just summarized. The MCP `cacheDir` argument is jailed to a per-process safe base; you can't redirect cache I/O to arbitrary filesystem paths. |

What this package does **not** defend against (out of scope for build-time tooling):

- A compromised dependency in your build pipeline.
- A malicious developer pushing a URL list that points at internal-network targets (no SSRF allowlist in 1.0.x — on the 1.1 roadmap).
- A hostile PDF parser exploit in `pdfjs-dist` (track upstream advisories).

### Defenses added in 1.0.2

| Defense                               | Default                           | Knob                                       |
| ------------------------------------- | --------------------------------- | ------------------------------------------ |
| Bounded URL-scanner regex             | `{1,2048}` URL / `{0,1024}` query | none (regex is internal)                   |
| Markdown-body length cap before scan  | 1 MB                              | none — scan skipped above this size        |
| `Content-Length` pre-check on fetch   | enforced                          | `maxBytes` option                          |
| Streaming `maxBytes` enforcement      | 32 MB                             | `maxBytes` option                          |
| Extracted-text length cap             | 5 MB chars                        | `maxExtractedTextChars` option             |
| Scrubbed failure logs (origin only)   | enabled                           | `debug: true` to opt out                   |
| Categorized parse-error tags          | enabled                           | `debug: true` for full message             |
| Atomic cache writes + content hash    | enabled                           | none — sidecar gains `contentSha` field    |
| Restrictive cache file modes          | `0o600` / dir `0o700`             | none — POSIX-only, ignored on Windows      |
| MCP `cacheDir` jail                   | enabled                           | throws on out-of-jail paths                |
| Astro `endpoint` path-traversal guard | enabled                           | throws on out-of-publicDir paths           |
| HTML-safe JSON serializer             | exported as `safeJSONForHTML`     | used by CLI `--out` and Astro adapter emit |

### Embedding the index into HTML

If you inline the emitted JSON into a `<script type="application/json">` block on your page, **use `safeJSONForHTML` rather than `JSON.stringify`**. PDF text containing `</script>` (literally — copy-pasted from a PDF) would otherwise let an attacker break out of the embedding:

```ts
import { safeJSONForHTML, indexPdfs } from '@icjia/pdf-search-index';

const rows = await indexPdfs([
  /* urls */
]);
const html = `<script id="pdf-index" type="application/json">${safeJSONForHTML(rows)}</script>`;
```

`safeJSONForHTML` also escapes U+2028 / U+2029, which older JS engines treat as line terminators inside string literals.

The CLI's `--out` writer and the Astro adapter's emit both use `safeJSONForHTML` by default. You only need to call it yourself if you're serializing rows manually inside a build script that inlines them into HTML.

### Migration notes from 1.0.1

<a id="migration-notes-from-101"></a>

- **Default `maxBytes` lowered from 100 MB to 32 MB.** If you legitimately host PDFs larger than 32 MB, pass `{ maxBytes: 100 * 1024 * 1024 }` (or whatever cap fits your dataset). The library logs a warning when a PDF is rejected on size grounds.
- **Extracted text capped at 5 MB chars by default.** If a real PDF in your corpus exceeds 5 MB of plain text, raise `maxExtractedTextChars` accordingly.
- **Failure logs are now scrubbed by default** — full URLs and underlying error messages are gated behind `debug: true`. For CI triage, flip the flag.
- **MCP `cacheDir` is now jailed under `<os.tmpdir>/pdf-search-index-mcp/...`.** If your LLM client was passing absolute paths, switch to relative subdirectory names.
- **Astro `endpoint` is validated** — it must resolve inside `publicDir`. Existing valid configurations (relative paths inside `public/`) keep working.

### Audit reference

<a id="audit-reference"></a>

The 1.0.2 changes implement the Critical and Important fixes from a full adversarial red/blue team audit run against 1.0.1 on **2026-05-16**. A separate opus-class LLM agent ran proof-of-concept attack scripts in `/tmp/` against each finding before reporting, so every finding is reproducible from the audit transcript.

**Shipped in 1.0.2:**

| ID  | Severity  | What it was                                                                                     | What we did                                                                                                                              |
| --- | --------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Critical  | ReDoS in the URL scanner (O(N²) on `'[X](https://a'.repeat(N)`)                                 | Bounded quantifiers `{1,2048}` URL / `{0,1024}` query; bodies > 1 MB are skipped with a warning                                          |
| C3  | Critical  | `res.arrayBuffer()` buffered multi-GB streams before the `maxBytes` check (OOM)                 | `Content-Length` pre-check → streaming `getReader()` cap → abort the moment the cap is exceeded. Default 32 MB                           |
| C4  | Critical  | MCP `cacheDir` attacker-controlled — prompt-injected LLM could `mkdir` anywhere                 | All MCP tool `cacheDir` args jailed under `<os.tmpdir>/pdf-search-index-mcp/`; throws on out-of-jail paths                               |
| C5  | Critical  | Astro `endpoint: '../../etc/escape.json'` would write outside `publicDir`                       | Path-jailed at build time                                                                                                                |
| I1  | Important | Full URLs (`https://example.com/admin/secret.pdf`) leaked into CI failure logs                  | Logs scrub URLs to `protocol://host` only. Full URL gated behind `debug: true`                                                           |
| I3  | Important | Compression-bomb PDFs could decompress to hundreds of MB of text                                | New `maxExtractedTextChars` option (default 5 MB) caps per-PDF extraction                                                                |
| I4  | Important | PDF text containing literal `</script>` broke out of `<script type="application/json">` islands | New top-level `safeJSONForHTML(obj, indent?)` export used by CLI `--out` and Astro emit                                                  |
| I7  | Important | Parallel builds could corrupt cache (TOCTOU + non-atomic write)                                 | `.tmp.<pid>.<rand>` rename-atomic writes; sidecar `contentSha`; `readCache` verifies                                                     |
| I8  | Important | pdf.js `PasswordException` logged verbatim → encrypted-PDF state leak                           | Categorized tags (`'encrypted PDF'`, `'corrupt PDF structure'`, `'PDF font error'`, `'PDF parse error'`); full text behind `debug: true` |
| M2  | Minor     | Cache files world-readable                                                                      | Cache files `0o600` / cache dir `0o700` (POSIX; ignored on Windows)                                                                      |
| M3  | Minor     | Control characters could survive into log output                                                | Control-char sanitization in all warning paths                                                                                           |

**Deferred (with target versions):**

| ID                     | Severity  | What it is                                                         | Target         | Why deferred                                                                      |
| ---------------------- | --------- | ------------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| C2                     | Critical  | SSRF allowlist — `file://`, internal IPs, cloud metadata endpoints | v1.1           | Needs an `allowPrivateHosts: boolean` opt-in to avoid breaking existing consumers |
| I2                     | Important | Full SHA + URL normalization for cache keys                        | v2.0           | Breaking change to cache keys — bundled with the next major bump                  |
| I5                     | Important | CLI `--from-sitemap` size + scheme hardening                       | v1.1           | Opt-in flags needed; postpone for v1.1 design pass                                |
| I6                     | Important | `maxUrls` cap in `indexPdfs`                                       | v1.1           | New option, default needs a deliberate choice                                     |
| M1, M4, M5, M6, M7, M8 | Minor     | Defense-in-depth hardening                                         | future patches | Spread across the next few patch releases as they're independently shippable      |

**C2 mitigation in the meantime.** Until the allowlist lands in v1.1, configure outbound network policy in your CI environment so the build step can only reach the hosts you expect (your CMS, your CDN). Most CI runners (GitHub Actions, GitLab CI, Netlify, Vercel) support egress filtering at the worker level. This is belt-and-suspenders even after v1.1 ships.

**Migration map for consumers upgrading 1.0.1 → 1.0.2:** see the [Migration notes from 1.0.1](#migration-notes-from-101) subsection above.

**Test coverage of the audit fixes:** 26 new regression tests landed alongside the v1.0.2 fixes (105 total, up from 79). Each Critical / Important fix has at least one named test in `packages/core/test/security/` and the per-adapter test files. Run `pnpm test` to see them.

---

## Development

```bash
git clone https://github.com/ICJIA/pdf-search-index.git
cd pdf-search-index
pnpm install

pnpm test           # run vitest across all packages
pnpm typecheck      # strict TS across all packages
pnpm lint           # oxlint
pnpm format:check   # prettier
pnpm build          # tsup / unbuild per package
```

Releases are published from `main` via the `release.yml` GitHub Actions workflow on a successful merge of a changesets-generated Release PR. The v1.0.0 release was hand-cut (see commit `chore: release v1.0.0`) because changesets' 0.x semver rules don't cleanly handle a `0.x → 1.0` bump — future patch / minor / major bumps use the standard changesets flow.

To add a changeset for your contribution:

```bash
pnpm changeset
```

Pick the packages your change touches; pick the severity (`patch` / `minor` / `major`); write a 1-line description.

---

## Design docs

- [v1.0 design spec](./docs/superpowers/specs/2026-05-15-pdf-search-index-design.md) — what was decided and why
- [Original design seed](./docs/PDF_SEARCH_DESIGN.md) — pre-brainstorm draft
- [R3 reference impl](./docs) — the inline scripts the package generalizes from (`pdfText.ts`, `searchIndex.json.ts`, `Search.vue`)
- [Implementation plans](./docs/superpowers/plans/) — Plan 1 (foundation), Plan 2 (cleanup + adapters), Plan 3 (examples + README + release)

---

## License

MIT — see [LICENSE](./LICENSE).
