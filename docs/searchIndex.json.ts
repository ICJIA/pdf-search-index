// astro/src/pages/searchIndex.json.ts
//
// Build-time JSON endpoint at /searchIndex.json. Walks the four content
// collections that have searchable rows AND emits each PDF linked from a
// body as its own row (type=`pdf`, path=PDF URL). The /search/ page fetches
// this and feeds it to fuse.js client-side.
//
// PDF rows let a query like "applicant portal" match the body of the
// linked PDF — not just the prose that links to it — and return a result
// that links directly to the PDF for the user to open.
//
// The `faqs` (weeklyFaqs) collection was removed: live discovery confirmed
// it always returns 0 rows on R3's Strapi. Real FAQ content lives in
// `pages` with slug=`faqs` and is indexed under the Pages type; the FAQ
// document itself, if linked from that page body as a .pdf, surfaces as a
// `pdf` row.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { extractPdfsFromBody, type ExtractedPdf } from '~/lib/pdfText';

interface IndexedRow {
  type: 'pages' | 'news' | 'resources' | 'hubArticles' | 'pdf';
  id: string;
  title: string;
  path: string;
  rawText: string;
  postDate?: string;
}

function pdfRows(pdfs: ExtractedPdf[]): IndexedRow[] {
  return pdfs.map((p) => ({
    type: 'pdf' as const,
    id: p.id,
    title: p.title,
    path: p.url,
    rawText: p.text,
  }));
}

export const GET: APIRoute = async () => {
  const [pages, news, resources, hub] = await Promise.all([
    getCollection('pages'),
    getCollection('news'),
    getCollection('resources'),
    getCollection('hubArticles'),
  ]);

  // For each collection that may have PDF links, emit (a) the entry's own
  // row carrying its prose, then (b) one row per PDF linked from the body.
  // PDFs are de-duped across the WHOLE index: if /faqs/ and /resources/foo/
  // both link the same PDF, it appears once (the first emit wins).
  const seenPdfIds = new Set<string>();
  const dedupePdfs = (pdfs: ExtractedPdf[]): IndexedRow[] =>
    pdfRows(pdfs).filter((r) => {
      if (seenPdfIds.has(r.id)) return false;
      seenPdfIds.add(r.id);
      return true;
    });

  const pageRows = await Promise.all(
    pages.map(async (e) => {
      const pdfs = await extractPdfsFromBody(e.data.body ?? '');
      const parent: IndexedRow = {
        type: 'pages',
        id: e.id,
        title: e.data.title,
        path: e.data.path,
        rawText: e.data.rawText ?? '',
      };
      return [parent, ...dedupePdfs(pdfs)];
    }),
  );

  const newsRows = await Promise.all(
    news.map(async (e) => {
      const pdfs = await extractPdfsFromBody(e.data.body ?? '');
      const parent: IndexedRow = {
        type: 'news',
        id: e.id,
        title: e.data.title,
        path: e.data.path,
        rawText: e.data.rawText ?? '',
        postDate: e.data.postDate,
      };
      return [parent, ...dedupePdfs(pdfs)];
    }),
  );

  const resourceRows = await Promise.all(
    resources.map(async (e) => {
      const pdfs = await extractPdfsFromBody(e.data.body ?? '');
      const parent: IndexedRow = {
        type: 'resources',
        id: e.id,
        title: e.data.title,
        path: e.data.path,
        rawText: e.data.rawText ?? '',
      };
      return [parent, ...dedupePdfs(pdfs)];
    }),
  );

  // Hub articles only carry an abstract (no full body, no PDF links at this
  // layer), so no PDF extraction needed — pass rawText through.
  const hubRows: IndexedRow[] = hub.map((e) => ({
    type: 'hubArticles',
    id: e.id,
    title: e.data.title,
    path: e.data.path,
    rawText: e.data.rawText ?? '',
  }));

  const rows: IndexedRow[] = [
    ...pageRows.flat(),
    ...newsRows.flat(),
    ...resourceRows.flat(),
    ...hubRows,
  ];

  return new Response(JSON.stringify(rows), {
    headers: { 'content-type': 'application/json' },
  });
};
