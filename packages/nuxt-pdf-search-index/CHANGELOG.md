# @icjia/nuxt-pdf-search-index

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
