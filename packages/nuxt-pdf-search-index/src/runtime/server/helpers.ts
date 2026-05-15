import { extractPdfsFromBody } from '@icjia/pdf-search-index';
import type { IndexedPdf, IndexPdfsOptions } from '@icjia/pdf-search-index';

export type { IndexedPdf, IndexPdfsOptions };

interface RuntimeConfigBag {
  pdfSearchIndex?: { cacheDir?: string; concurrency?: number };
}

/**
 * Reads `runtimeConfig.pdfSearchIndex` from Nuxt's #imports if available.
 * Returns `{}` when called outside a Nuxt server context (e.g., direct
 * unit tests), which is harmless because `extractPdfsFromBody` falls back
 * to its own defaults.
 *
 * Dynamic import keeps this module test-runnable outside Nuxt — vitest
 * tests of the helpers won't hit `#imports` resolution at all.
 */
async function getRuntimeDefaults(): Promise<{ cacheDir?: string; concurrency?: number }> {
  try {
    // The '#imports' alias resolves only inside a Nuxt project. In direct
    // unit tests, the import throws and we fall through to {}.
    const mod = (await import('#imports' as string)) as {
      useRuntimeConfig?: () => RuntimeConfigBag;
    };
    if (typeof mod.useRuntimeConfig !== 'function') return {};
    const cfg = mod.useRuntimeConfig();
    return cfg.pdfSearchIndex ?? {};
  } catch {
    return {};
  }
}

function mergeOptions(
  defaults: { cacheDir?: string; concurrency?: number },
  override: IndexPdfsOptions | undefined,
): IndexPdfsOptions {
  return {
    ...(defaults.cacheDir !== undefined ? { cacheDir: defaults.cacheDir } : {}),
    ...(defaults.concurrency !== undefined ? { concurrency: defaults.concurrency } : {}),
    ...override,
  };
}

/**
 * Extract PDFs linked from a CMS body string (Strapi-style markdown).
 * Honors `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from
 * `nuxt.config.ts` runtime config unless explicit `options` overrides.
 */
export async function extractPdfsFromCmsBody(
  body: string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  const defaults = await getRuntimeDefaults();
  return extractPdfsFromBody(body, mergeOptions(defaults, options));
}

/**
 * Extract PDFs from a `@nuxt/content` parsed document. Accepts `body`,
 * `_raw`, or `rawbody` field shapes, or a plain markdown string.
 *
 * Honors `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from
 * `nuxt.config.ts` runtime config unless explicit `options` overrides.
 */
export async function extractPdfsFromContentDoc(
  doc: { body?: string; _raw?: string; rawbody?: string } | string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  const defaults = await getRuntimeDefaults();
  if (typeof doc === 'string') {
    return extractPdfsFromBody(doc, mergeOptions(defaults, options));
  }
  const body = doc.body ?? doc._raw ?? doc.rawbody ?? '';
  return extractPdfsFromBody(body, mergeOptions(defaults, options));
}
