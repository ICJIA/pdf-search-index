# @icjia/nuxt-pdf-search-index

## 1.0.0

### Major Changes

- First stable release.
  - Nuxt 4 module: registers `extractPdfsFromCmsBody` and `extractPdfsFromContentDoc` as auto-imported server helpers.
  - Module options (`cacheDir`, `concurrency`) flow through to helpers via `runtimeConfig`; per-call options override.
  - Copy-paste Nitro server-route template at `runtime/server/route-template.ts` for mixed CMS + `@nuxt/content` sites.
