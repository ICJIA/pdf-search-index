# @icjia/nuxt-pdf-search-index

Nuxt 4 module for [`@icjia/pdf-search-index`](../core). Built for mixed sites that combine a remote CMS (Strapi, Sanity, etc.) with `@nuxt/content` markdown.

## Install

```bash
npm install @icjia/pdf-search-index @icjia/nuxt-pdf-search-index
```

## Register

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

## Use in a server route

Copy [`route-template.ts`](./src/runtime/server/route-template.ts) into your project at `server/api/searchIndex.get.ts` and adapt the CMS fetch + content query to match your stack.

The module auto-imports two helpers into server-side `#imports`:

- `extractPdfsFromCmsBody(body, options?)` — for Strapi-style CMS body strings
- `extractPdfsFromContentDoc(doc, options?)` — for `@nuxt/content` parsed docs (accepts `body`, `_raw`, `rawbody` fields, or a plain markdown string)

Both return `IndexedPdf[]` from `@icjia/pdf-search-index`.

## Options

- `cacheDir` — file cache for extracted text. Default `.nuxt/.pdf-cache`
- `concurrency` — parallel fetches. Default `4`

## License

MIT
