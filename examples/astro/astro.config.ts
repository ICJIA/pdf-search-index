import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import pdfSearch from '@icjia/astro-pdf-search-index';
import { localFetch } from './local-fetch.mjs';

export default defineConfig({
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
