import { defineNuxtModule, addServerImports, createResolver } from '@nuxt/kit';

export interface ModuleOptions {
  /** File cache for extracted PDF text. Default `.nuxt/.pdf-cache`. */
  cacheDir?: string;
  /** Concurrent fetches. Default 4. */
  concurrency?: number;
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@icjia/nuxt-pdf-search-index',
    configKey: 'pdfSearchIndex',
    compatibility: {
      nuxt: '^4.0.0',
    },
  },
  defaults: {
    cacheDir: '.nuxt/.pdf-cache',
    concurrency: 4,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // Expose helpers in server-side #imports so Nitro routes can use them
    // without manually importing.
    addServerImports([
      {
        name: 'extractPdfsFromCmsBody',
        from: resolver.resolve('./runtime/server/helpers'),
      },
      {
        name: 'extractPdfsFromContentDoc',
        from: resolver.resolve('./runtime/server/helpers'),
      },
    ]);

    // Surface user options via runtimeConfig so the helpers (or a future
    // auto-registered route) can read them.
    nuxt.options.runtimeConfig = nuxt.options.runtimeConfig || {};
    const rc = nuxt.options.runtimeConfig as Record<string, unknown>;
    rc.pdfSearchIndex = {
      cacheDir: options.cacheDir,
      concurrency: options.concurrency,
    };
  },
});
