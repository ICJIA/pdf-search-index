import { extractPdfsFromBody, extractDocumentsFromBody } from '@icjia/pdf-search-index';
import type {
  IndexDocumentsOptions,
  IndexedDocument,
  IndexedPdf,
  IndexPdfsOptions,
} from '@icjia/pdf-search-index';

export type { IndexedDocument, IndexDocumentsOptions, IndexedPdf, IndexPdfsOptions };

interface RuntimeConfigBag {
  pdfSearchIndex?: { cacheDir?: string; concurrency?: number };
}

/**
 * Reads `runtimeConfig.pdfSearchIndex` from Nuxt's #imports if available.
 * Returns `{}` when called outside a Nuxt server context (e.g., direct
 * unit tests), which is harmless because the underlying extractors fall
 * back to their own defaults.
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

function mergeOptions<O extends IndexPdfsOptions | IndexDocumentsOptions>(
  defaults: { cacheDir?: string; concurrency?: number },
  override: O | undefined,
): O {
  return {
    ...(defaults.cacheDir !== undefined ? { cacheDir: defaults.cacheDir } : {}),
    ...(defaults.concurrency !== undefined ? { concurrency: defaults.concurrency } : {}),
    ...override,
  } as O;
}

/**
 * Extract PDFs linked from a CMS body string (Strapi-style markdown).
 * Honors `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency` from
 * `nuxt.config.ts` runtime config unless explicit `options` overrides.
 *
 * PDF-only. For mixed-format CMS bodies (PDF / DOCX / PPTX / XLSX), use
 * `extractDocumentsFromCmsBody` (added in 1.1).
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
 *
 * PDF-only. For mixed-format content (PDF / DOCX / PPTX / XLSX), use
 * `extractDocumentsFromContentDoc` (added in 1.1).
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

/**
 * Extract documents (PDF / DOCX / PPTX / XLSX) linked from a CMS body
 * string. Auto-detects each format from its URL extension. Honors the
 * same runtime-config defaults as `extractPdfsFromCmsBody`. Added in 1.1.
 */
export async function extractDocumentsFromCmsBody(
  body: string,
  options?: IndexDocumentsOptions,
): Promise<IndexedDocument[]> {
  const defaults = await getRuntimeDefaults();
  return extractDocumentsFromBody(body, mergeOptions(defaults, options));
}

/**
 * Extract documents (PDF / DOCX / PPTX / XLSX) from a `@nuxt/content`
 * parsed document. Accepts `body`, `_raw`, or `rawbody` field shapes,
 * or a plain markdown string. Auto-detects each format. Added in 1.1.
 */
export async function extractDocumentsFromContentDoc(
  doc: { body?: string; _raw?: string; rawbody?: string } | string,
  options?: IndexDocumentsOptions,
): Promise<IndexedDocument[]> {
  const defaults = await getRuntimeDefaults();
  if (typeof doc === 'string') {
    return extractDocumentsFromBody(doc, mergeOptions(defaults, options));
  }
  const body = doc.body ?? doc._raw ?? doc.rawbody ?? '';
  return extractDocumentsFromBody(body, mergeOptions(defaults, options));
}
