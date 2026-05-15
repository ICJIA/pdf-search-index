import { extractPdfsFromBody } from '@icjia/pdf-search-index';
import type { IndexedPdf, IndexPdfsOptions } from '@icjia/pdf-search-index';

export type { IndexedPdf, IndexPdfsOptions };

/**
 * Extract PDFs linked from a CMS body string (Strapi-style markdown).
 * Identical contract to `extractPdfsFromBody` from the core package; re-
 * exported under a Nuxt-friendly name.
 */
export async function extractPdfsFromCmsBody(
  body: string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  return extractPdfsFromBody(body, options);
}

/**
 * Extract PDFs from a `@nuxt/content` parsed document. The doc is expected
 * to have a `body` field containing the original markdown source, OR a
 * `_raw` / `rawbody` field with the same content. We accept any of these
 * to tolerate the different shapes consumers may have.
 */
export async function extractPdfsFromContentDoc(
  doc: { body?: string; _raw?: string; rawbody?: string } | string,
  options?: IndexPdfsOptions,
): Promise<IndexedPdf[]> {
  if (typeof doc === 'string') {
    return extractPdfsFromBody(doc, options);
  }
  const body = doc.body ?? doc._raw ?? doc.rawbody ?? '';
  return extractPdfsFromBody(body, options);
}
