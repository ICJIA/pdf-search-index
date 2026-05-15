import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  modules: ['@icjia/nuxt-pdf-search-index', '@nuxt/content'],
  pdfSearchIndex: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
  runtimeConfig: {
    // Absolute path to fixtures — embedded at build time so server routes
    // don't depend on process.cwd() (which varies between dev, build, preview).
    fixturesDir: resolve(here, '..', '_fixtures'),
  },
  devtools: { enabled: false },
  compatibilityDate: '2026-05-15',
});
