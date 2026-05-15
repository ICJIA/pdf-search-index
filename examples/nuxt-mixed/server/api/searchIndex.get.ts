import { defineEventHandler } from 'h3';
import { extractPdfsFromCmsBody, extractPdfsFromContentDoc } from '#imports';
import { queryCollection } from '@nuxt/content/server';
import { getMockCmsPages } from '../utils/mockCms';
import { localFetch } from '../utils/localFetch';
import type { IndexedPdf } from '@icjia/pdf-search-index';

export default defineEventHandler(async (event) => {
  // Source 1: mocked CMS rows.
  const cmsRows = getMockCmsPages();
  const cmsPdfs: IndexedPdf[] = [];
  for (const row of cmsRows) {
    cmsPdfs.push(...(await extractPdfsFromCmsBody(row.body, { fetch: localFetch })));
  }

  // Source 2: @nuxt/content markdown collection.
  // `rawbody` is a string because content.config.ts extends the page schema
  // with `rawbody: z.string()`. We pass it explicitly to `extractPdfsFromContentDoc`
  // so the helper gets the raw markdown rather than the parsed AST in `body`.
  const docs = await queryCollection(event, 'content').all();
  const contentPdfs: IndexedPdf[] = [];
  for (const doc of docs) {
    // Pass rawbody as the doc body so the helper sees raw markdown (not the AST).
    const raw = typeof doc.rawbody === 'string' ? doc.rawbody : '';
    contentPdfs.push(...(await extractPdfsFromContentDoc(raw, { fetch: localFetch })));
  }

  // Dedupe by id (same PDF linked from multiple sources → one row).
  const allPdfs = [...new Map([...cmsPdfs, ...contentPdfs].map((p) => [p.id, p])).values()];

  return {
    cms: cmsRows.map((r) => ({ type: 'cms' as const, id: r.id, title: r.title })),
    content: docs.map((d) => ({ type: 'content' as const, id: d.id, title: d.title })),
    pdfs: allPdfs,
  };
});
