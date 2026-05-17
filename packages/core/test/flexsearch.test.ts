import { describe, it, expect } from 'vitest';
import {
  createFlexSearchIndex,
  snippetHTMLForFlexMatch,
  flattenFlexResults,
} from '../src/flexsearch.js';
import type { IndexedDocument } from '../src/types.js';

const rows: IndexedDocument[] = [
  {
    id: 'pdf-aaa',
    url: 'file:///a/report.pdf',
    title: 'Annual Report 2024',
    format: 'pdf',
    text: 'Recidivism rates dropped 12% statewide following the 2022 reform.',
    pages: 38,
  },
  {
    id: 'docx-bbb',
    url: 'file:///a/agenda.docx',
    title: 'Meeting Agenda — January',
    format: 'docx',
    text: 'Roll call. Approval of minutes. Public comment. Treasurer report on stigma reduction grants.',
  },
  {
    id: 'pptx-ccc',
    url: 'file:///a/deck.pptx',
    title: 'Board Deck — March',
    format: 'pptx',
    text: 'Slide 1: agenda. Slide 2: research priorities. Slide 3: budget allocation.',
    pages: 3,
  },
];

describe('/flexsearch entry', () => {
  it('builds a FlexSearch Document index from IndexedDocument rows', async () => {
    const index = await createFlexSearchIndex(rows);
    expect(index).toBeDefined();
    // FlexSearch's `search()` returns a per-field grouped result.
    const results = await index.search('recidivism', { enrich: true });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('flattenFlexResults dedupes across fields and returns rows in order', async () => {
    const index = await createFlexSearchIndex(rows);
    // "agenda" appears in both DOCX title AND PPTX text — without
    // dedup we'd see it twice. flattenFlexResults dedupes by id.
    const results = await index.search('agenda', { enrich: true });
    const flat = flattenFlexResults<IndexedDocument>(results);
    const ids = flat.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no dupes
    expect(flat.length).toBeGreaterThan(0);
  });

  it('snippetHTMLForFlexMatch returns a marked snippet around the first match', () => {
    const row = rows[0]!;
    const html = snippetHTMLForFlexMatch(row, 'recidivism');
    expect(html).toContain('<mark>');
    expect(html.toLowerCase()).toContain('recidivism');
    // HTML should not contain raw < > beyond the <mark> wrapper.
    expect(html).not.toMatch(/<(?!\/?mark\b)/);
  });

  it('snippetHTMLForFlexMatch escapes adversarial source text', () => {
    const adversarialRow: IndexedDocument = {
      id: 'x',
      url: 'file:///a',
      title: 'X',
      format: 'pdf',
      text: 'before </script><script>alert(1)</script> stigma after',
    };
    const html = snippetHTMLForFlexMatch(adversarialRow, 'stigma');
    expect(html).toContain('<mark>');
    expect(html).not.toContain('</script>');
    expect(html).toContain('&lt;/script&gt;');
  });

  it('snippetHTMLForFlexMatch falls back to leading text when query not found verbatim', () => {
    const row = rows[0]!;
    const html = snippetHTMLForFlexMatch(row, 'thisdoesnotappear');
    // No <mark> because no literal substring match, but we still return
    // *some* context so the result row isn't empty.
    expect(html).not.toContain('<mark>');
    expect(html.length).toBeGreaterThan(0);
  });

  it('honors options.matchKey for title-only highlight', () => {
    const row = rows[1]!;
    const html = snippetHTMLForFlexMatch(row, 'meeting', { matchKey: 'title' });
    expect(html.toLowerCase()).toContain('meeting');
    expect(html).toContain('<mark>');
  });
});
