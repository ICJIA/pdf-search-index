# @icjia/nuxt-pdf-search-index

## 1.2.0

### Minor Changes

**Lockstep release — no module-source changes.** The Nuxt module's helpers are thin wrappers around the core package, so the v1.2 features (`maxUrls` cap, inflate-bomb defense, prebuilt Fuse index, `/worker` entry) flow through automatically without any new helper signatures.

- **Nitro-route consumers** that already use `extractDocumentsFromCmsBody` / `extractDocumentsFromContentDoc` get the new `maxUrls` / `maxInflatedArchiveBytes` per-call options for free — both are forwarded through `IndexDocumentsOptions`.
- **For prebuilt Fuse index emission**, import `serializeFuseIndex` from `@icjia/pdf-search-index/fuse` inside your Nitro route after producing rows: `return { rows, indexJson: serializeFuseIndex(rows) }`. The client fetches both and constructs Fuse with the prebuilt index.
- **For FuseWorker**, import directly from `@icjia/pdf-search-index/worker` on the client. The server side is unchanged.

See the [core CHANGELOG entry for 1.2.0](../core/CHANGELOG.md#120) for the full v1.2 surface summary.

## 1.1.0

### Minor Changes

**Multi-format helpers for CMS bodies and `@nuxt/content` docs.** Two new Nitro-auto-imported helpers — `extractDocumentsFromCmsBody` and `extractDocumentsFromContentDoc` — pick up DOCX, PPTX, and XLSX links in addition to PDFs. The existing PDF-only helpers (`extractPdfsFromCmsBody`, `extractPdfsFromContentDoc`) are preserved unchanged for back-compat.

- New type re-exports: `IndexedDocument`, `IndexDocumentsOptions`, `DocumentFormat`. Existing `IndexedPdf` / `IndexPdfsOptions` exports preserved as type aliases.
- All four helpers honor `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` runtime-config defaults identically.
- Each returned row carries a `format` discriminator (`'pdf'` / `'docx'` / `'pptx'` / `'xlsx'`).

**Recommended migration:**

```ts
// server/api/searchIndex.get.ts
import { extractDocumentsFromCmsBody, extractDocumentsFromContentDoc } from '#imports';

export default defineEventHandler(async () => {
  const cmsRows = await extractDocumentsFromCmsBody(cmsBody);
  const contentRows = await extractDocumentsFromContentDoc(contentDoc);
  return [...cmsRows, ...contentRows]; // each has .format set
});
```

**Install the optional `officeparser` peer dep** (alongside `@icjia/pdf-search-index@^1.1.0`) to unlock DOCX/PPTX/XLSX. PDF-only sites don't need it.

See the [core CHANGELOG entry for 1.1.0](../core/CHANGELOG.md#110) for the full surface summary.

## 1.0.5

### Patch Changes

Lockstep docs-and-hardening release. Package source is byte-identical to 1.0.4 (and 1.0.3). This bump syncs the npmjs.com-rendered README with three updates:

1. **New "Apache Solr for Nuxt — without Solr." elevator pitch** (Nitro framed as the Tika stage) + explicit Fuse-is-optional framing (alternatives: MiniSearch, FlexSearch, Lunr, Pagefind, custom).
2. **Restructured Security section** — per-finding tables for the core flow-through fixes (C1, C3, I1, I3, I4, I7, I8) that apply automatically to `extractPdfsFromCmsBody` / `extractPdfsFromContentDoc`; "Zero unaddressed exploitable issues" status statement; deferred items integrated with active mitigations including the helpers' threat-surface guidance.
3. **Third audit pass landed at the monorepo level** — verified all core flow-through fixes are still in place. No new findings against the Nuxt module surface.

See the [core CHANGELOG entry for 1.0.5](../core/CHANGELOG.md#105) for the full summary including the audit transcript reference.

## 1.0.4

### Patch Changes

Lockstep docs-only release — package source is byte-identical to 1.0.3. Bump exists so the npmjs.com-rendered README matches the post-1.0.3 doc polish on GitHub. See the [core CHANGELOG entry for 1.0.4](../core/CHANGELOG.md#104) for the full summary.

## 1.0.3

### Patch Changes

Lockstep documentation release. No package source changes from 1.0.2.

- Expanded standalone integration guide focused on the Nuxt 4 + Strapi workflow: three full server-route recipes (Strapi v3, v4, v5), the v3/v4/v5 response-shape differences, the three common Strapi quirks (relative URLs, token-gated media, structured media relations), authentication, client-side wiring.
- The v1.0.2 security audit findings are now prominent in every README. See the [core CHANGELOG entry for 1.0.2](../core/CHANGELOG.md#102) for the full list.

## 1.0.2

### Patch Changes

Lockstep security release. Package source is unchanged from 1.0.1; the version bump exists so consumers picking up `@icjia/nuxt-pdf-search-index@^1.0.2` get the security-hardened `@icjia/pdf-search-index@^1.0.2` transitively.

The module's `extractPdfsFromCmsBody` / `extractPdfsFromContentDoc` helpers — both backed by the core library — inherit:

- Bounded URL-scanner regex (ReDoS fix).
- Streaming body size enforcement (default `maxBytes` lowered from 100 MB to 32 MB).
- Extracted-text length cap (default `maxExtractedTextChars` 5 MB).
- Scrubbed failure logs (origin-only URLs, categorized parse-error tags).
- Atomic cache writes with content-hash verification.
- Restrictive cache file modes (`0o600`).

See the [core CHANGELOG](../core/CHANGELOG.md#102) for the full security-fix list and migration notes. Consumers hitting the new `maxBytes` / `maxExtractedTextChars` caps can opt up via the helpers' per-call options arg — no module-level configuration is needed.

## 1.0.1

### Patch Changes

- Lockstep release; package source is unchanged from 1.0.0. The monorepo's top-level README gained a comprehensive "Where your PDFs can live" section with concrete Strapi v3 / v4 / v5 code samples for the canonical Nuxt + remote-CMS deployment pattern, plus the three Strapi quirks (relative URLs, token-gated media, structured media relations). See the [README](https://github.com/ICJIA/pdf-search-index#where-your-pdfs-can-live) for the full guidance.

## 1.0.0

### Major Changes

- First stable release.
  - Nuxt 4 module: registers `extractPdfsFromCmsBody` and `extractPdfsFromContentDoc` as auto-imported server helpers.
  - Module options (`cacheDir`, `concurrency`) flow through to helpers via `runtimeConfig`; per-call options override.
  - Copy-paste Nitro server-route template at `runtime/server/route-template.ts` for mixed CMS + `@nuxt/content` sites.
