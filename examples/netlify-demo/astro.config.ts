import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import pdfSearch from '@icjia/astro-pdf-search-index';
import { localFetch } from './local-fetch.mjs';

// The `site` URL is used by Astro for canonical/SEO output. Update this
// after your first Netlify deploy with your real *.netlify.app subdomain
// (or your custom domain).
export default defineConfig({
  site: 'https://icjia-pdf-search.netlify.app',
  integrations: [
    vue(),
    pdfSearch({
      collections: ['docs'],
      endpoint: 'searchIndex.pdfs.json',
      // 1.2: emit a prebuilt Fuse index alongside the rows. Consumers
      // load both at runtime and pass the index to Fuse.parseIndex,
      // skipping the in-browser build step. At our 14-doc corpus the
      // delta is invisible; we enable it here to demonstrate the
      // production pattern for ~2K-row deployments (icjia.illinois.gov
      // is the canonical target).
      prebuildIndex: 'searchIndex.fuse-index.json',
      cacheDir: '.astro/.pdf-cache',
      fetch: localFetch,
    }),
  ],
});
