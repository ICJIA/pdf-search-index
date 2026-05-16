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
      cacheDir: '.astro/.pdf-cache',
      fetch: localFetch,
    }),
  ],
});
