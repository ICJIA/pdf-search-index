/**
 * Nitro server-route template for a mixed CMS + @nuxt/content site.
 *
 * Copy this file into your Nuxt project at `server/api/searchIndex.get.ts`,
 * then customize the CMS fetch logic and content query to match your stack.
 *
 * The helpers read `pdfSearchIndex.cacheDir` / `pdfSearchIndex.concurrency`
 * from your `nuxt.config.ts` automatically — you don't need to pass them.
 *
 * After customization, fetch `/api/searchIndex` from the client to load
 * the combined search index (pages + CMS rows + extracted PDF rows).
 */
import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody, extractPdfsFromContentDoc } from '#imports';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default defineEventHandler(async () => {
  // === REPLACE WITH YOUR CMS FETCH ===
  // Example for Strapi:
  //   const cmsPages = await $fetch('https://cms.example.com/api/pages');
  //   const cmsRows = cmsPages.data.map((p) => ({
  //     type: 'cms', id: p.id, title: p.attributes.title, body: p.attributes.body,
  //   }));
  const cmsRows: Array<{ id: string; title: string; body: string }> = [];

  // === REPLACE WITH YOUR @nuxt/content QUERY ===
  // Example using serverQueryContent (Nuxt 3 era) or queryCollection (Nuxt 4):
  //   const docs = await queryCollection(event, 'content').all();
  const contentDocs: Array<{ _path?: string; title?: string; body?: string }> = [];

  // Extract PDFs from each source's body strings.
  const cmsPdfs: IndexedPdf[] = [];
  for (const row of cmsRows) {
    cmsPdfs.push(...(await extractPdfsFromCmsBody(row.body)));
  }

  const contentPdfs: IndexedPdf[] = [];
  for (const doc of contentDocs) {
    contentPdfs.push(...(await extractPdfsFromContentDoc(doc)));
  }

  // Dedupe by id (same PDF linked from multiple pages → one row).
  const allPdfs = [...new Map([...cmsPdfs, ...contentPdfs].map((p) => [p.id, p])).values()];

  return {
    cms: cmsRows.map((r) => ({ type: 'cms', id: r.id, title: r.title })),
    content: contentDocs.map((d) => ({ type: 'content', path: d._path, title: d.title })),
    pdfs: allPdfs,
  };
});
