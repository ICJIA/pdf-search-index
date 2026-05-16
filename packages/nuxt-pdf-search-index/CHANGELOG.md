# @icjia/nuxt-pdf-search-index

## 1.0.1

### Patch Changes

- Lockstep release; package source is unchanged from 1.0.0. The monorepo's top-level README gained a comprehensive "Where your PDFs can live" section with concrete Strapi v3 / v4 / v5 code samples for the canonical Nuxt + remote-CMS deployment pattern, plus the three Strapi quirks (relative URLs, token-gated media, structured media relations). See the [README](https://github.com/ICJIA/pdf-search-index#where-your-pdfs-can-live) for the full guidance.

## 1.0.0

### Major Changes

- First stable release.
  - Nuxt 4 module: registers `extractPdfsFromCmsBody` and `extractPdfsFromContentDoc` as auto-imported server helpers.
  - Module options (`cacheDir`, `concurrency`) flow through to helpers via `runtimeConfig`; per-call options override.
  - Copy-paste Nitro server-route template at `runtime/server/route-template.ts` for mixed CMS + `@nuxt/content` sites.
