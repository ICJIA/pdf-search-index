import { describe, it, expect } from 'vitest';
import type { FuseResult, FuseResultMatch } from 'fuse.js';
import { snippetHTMLFor, escapeHTML } from '../src/snippet.js';

function mkResult(text: string, indices: [number, number][]): FuseResult<{ text: string }> {
  const m: FuseResultMatch = {
    indices,
    key: 'text',
    value: text,
  };
  return {
    item: { text },
    refIndex: 0,
    matches: [m],
  };
}

describe('escapeHTML', () => {
  it('escapes ampersand, brackets, and quotes', () => {
    expect(escapeHTML(`A & B <c> "d" 'e'`)).toBe('A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;');
  });
});

describe('snippetHTMLFor', () => {
  it('returns marked HTML around the longest match span', () => {
    const text = 'one applicant portal two';
    const start = text.indexOf('applicant portal');
    const end = start + 'applicant portal'.length - 1;
    const html = snippetHTMLFor(mkResult(text, [[start, end]]));
    expect(html).toBe('one <mark>applicant portal</mark> two');
  });

  it('adds leading ellipsis when snippet starts past index 0', () => {
    const long = 'x'.repeat(200) + ' applicant portal ' + 'y'.repeat(200);
    const start = long.indexOf('applicant portal');
    const end = start + 'applicant portal'.length - 1;
    const html = snippetHTMLFor(mkResult(long, [[start, end]]), { contextChars: 10 });
    expect(html.startsWith('…')).toBe(true);
    expect(html.endsWith('…')).toBe(true);
    expect(html).toContain('<mark>applicant portal</mark>');
  });

  it('escapes HTML-unsafe characters in surrounding text', () => {
    const text = `<b>bold</b> applicant portal end`;
    const start = text.indexOf('applicant portal');
    const end = start + 'applicant portal'.length - 1;
    const html = snippetHTMLFor(mkResult(text, [[start, end]]));
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('<mark>applicant portal</mark>');
  });

  it('returns empty string when there is no matching key', () => {
    const r: FuseResult<{ text: string }> = {
      item: { text: 'foo' },
      refIndex: 0,
      matches: [],
    };
    expect(snippetHTMLFor(r)).toBe('');
  });

  it('picks the longest match span when multiple are present', () => {
    const text = 'aaa portal bbb the applicant portal ccc';
    const idx1: [number, number] = [text.indexOf('portal'), text.indexOf('portal') + 5];
    const idx2: [number, number] = [
      text.indexOf('applicant portal'),
      text.indexOf('applicant portal') + 'applicant portal'.length - 1,
    ];
    const html = snippetHTMLFor(mkResult(text, [idx1, idx2]));
    expect(html).toContain('<mark>applicant portal</mark>');
  });

  it('collapses runs of whitespace inside the snippet', () => {
    const text = 'pre   stuff\n\n\napplicant\tportal\n\nstuff   post';
    const start = text.indexOf('applicant');
    const end = text.indexOf('portal') + 5;
    const html = snippetHTMLFor(mkResult(text, [[start, end]]));
    expect(html).not.toMatch(/\s{2,}/);
  });
});
