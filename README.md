# @icjia/pdf-search-index

Full-text PDF search for static sites that already use Fuse.js.

Build-time PDF text extraction, no runtime servers, no native deps. Pure ESM, works on Vercel / Netlify / Cloudflare Pages.

## Packages

| Package                                                              | Description                       |
| -------------------------------------------------------------------- | --------------------------------- |
| [`@icjia/pdf-search-index`](./packages/core)                         | Core library, CLI, and MCP server |
| [`@icjia/astro-pdf-search-index`](./packages/astro-pdf-search-index) | Astro integration (Plan 2)        |
| [`@icjia/nuxt-pdf-search-index`](./packages/nuxt-pdf-search-index)   | Nuxt 4 module (Plan 2)            |

## Design

See [`docs/superpowers/specs/`](./docs/superpowers/specs/) for the v1.0 design spec, and [`docs/PDF_SEARCH_DESIGN.md`](./docs/PDF_SEARCH_DESIGN.md) for the original seed.

## License

MIT
