# @icjia/astro-pdf-search-index

Astro integration for [`@icjia/pdf-search-index`](../core). Walks configured content collections, extracts every linked PDF's text at build time, and emits a JSON index that your search UI can fetch.

## Install

```bash
npm install @icjia/pdf-search-index @icjia/astro-pdf-search-index
```

## Use

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import pdfSearch from '@icjia/astro-pdf-search-index';

export default defineConfig({
  integrations: [
    pdfSearch({
      collections: ['resources', 'news', 'pages'],
      endpoint: 'searchIndex.pdfs.json',
    }),
  ],
});
```

The build emits `public/searchIndex.pdfs.json` which is served at `/searchIndex.pdfs.json` in production. Merge it with your existing Fuse index in the browser:

```ts
const [pages, pdfs] = await Promise.all([
  fetch('/searchIndex.json').then((r) => r.json()),
  fetch('/searchIndex.pdfs.json').then((r) => r.json()),
]);
const fuse = new Fuse([...pages, ...pdfs], { keys: ['title', 'text'], includeMatches: true });
```

See [`@icjia/pdf-search-index`](../core) for the underlying library, the
`createFuseIndex` shortcut, and the `snippetHTMLFor` helper for highlighted
result snippets.

## Options

- `collections` — names of Astro content collections to scan (required)
- `endpoint` — output filename under `public/`. Default `searchIndex.pdfs.json`
- `cacheDir` — file cache for extracted text. Default `.astro/.pdf-cache`
- `concurrency` — parallel fetches. Default `4`
- `contentSourceDir` — directory under `srcDir` containing collections. Default `content`

## License

MIT
