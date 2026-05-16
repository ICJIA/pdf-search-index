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

describe('snippetHTMLFor — maxSnippets', () => {
  function range(text: string, needle: string, occurrence = 0): [number, number] {
    let pos = -1;
    for (let i = 0; i <= occurrence; i++) {
      pos = text.indexOf(needle, pos + 1);
      if (pos === -1) throw new Error(`occurrence ${i} of "${needle}" not found`);
    }
    return [pos, pos + needle.length - 1];
  }

  it('maxSnippets: 1 (default) — current behavior unchanged', () => {
    const filler = 'x'.repeat(300);
    const text = `${filler} alpha ${filler} alpha-beta ${filler}`;
    const idx1 = range(text, 'alpha');
    const idx2 = range(text, 'alpha-beta');
    const html = snippetHTMLFor(mkResult(text, [idx1, idx2]), {
      contextChars: 20,
    });
    const htmlExplicit = snippetHTMLFor(mkResult(text, [idx1, idx2]), {
      contextChars: 20,
      maxSnippets: 1,
    });
    // Defaulting to 1 must produce identical output to setting it explicitly.
    expect(html).toBe(htmlExplicit);
    // And it must surface only ONE highlighted span.
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(1);
    // The longest span ("alpha-beta") must win.
    expect(html).toContain('<mark>alpha-beta</mark>');
  });

  it('maxSnippets: 3 with 5 well-separated matches → exactly 3 non-overlapping snippets', () => {
    const filler = 'x'.repeat(300); // big enough that snippet windows can't overlap
    // 5 matches, each separated by a 300-char filler block.
    const text = [
      filler,
      'lorem-aaa',
      filler,
      'lorem-bb',
      filler,
      'lorem-cccc', // longest
      filler,
      'lorem-d',
      filler,
      'lorem-ee',
      filler,
    ].join(' ');
    const indices: [number, number][] = [
      range(text, 'lorem-aaa'),
      range(text, 'lorem-bb'),
      range(text, 'lorem-cccc'),
      range(text, 'lorem-d'),
      range(text, 'lorem-ee'),
    ];
    const html = snippetHTMLFor(mkResult(text, indices), {
      contextChars: 20,
      maxSnippets: 3,
      separator: ' === ',
    });
    // Exactly 3 highlighted spans.
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(3);
    // The longest match must be among the chosen.
    expect(html).toContain('<mark>lorem-cccc</mark>');
    // The separator must appear between snippets (joining 3 → 2 separators).
    expect(html.split(' === ').length).toBe(3);
  });

  it('maxSnippets: 3 with overlapping nearby matches → merges to 1 snippet', () => {
    // Two matches close enough that their context windows (contextChars: 50)
    // intersect — the longest wins, the second is dropped.
    const text = 'pre ' + 'x'.repeat(100) + ' alpha beta gamma ' + 'y'.repeat(100) + ' post';
    const idxBeta = range(text, 'beta');
    const idxAlpha = range(text, 'alpha');
    const html = snippetHTMLFor(mkResult(text, [idxAlpha, idxBeta]), {
      contextChars: 50,
      maxSnippets: 3,
    });
    // Only ONE highlight — the longest non-overlapping pick.
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(1);
    // It should be the longer of the two ("alpha").
    expect(html).toContain('<mark>alpha</mark>');
  });

  it('maxSnippets larger than non-overlapping match count → returns all available', () => {
    const filler = 'x'.repeat(300);
    const text = [filler, 'pebble', filler, 'cobblestone', filler].join(' ');
    const indices: [number, number][] = [range(text, 'pebble'), range(text, 'cobblestone')];
    const html = snippetHTMLFor(mkResult(text, indices), {
      contextChars: 20,
      maxSnippets: 10,
    });
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(2);
    expect(html).toContain('<mark>pebble</mark>');
    expect(html).toContain('<mark>cobblestone</mark>');
  });

  it('multi-snippet output orders spans by document position, not by length', () => {
    const filler = 'x'.repeat(300);
    // Long match comes SECOND in the document — but it's the longest, so a
    // length-sort would put it first. We expect document order, not length
    // order, in the final output.
    const text = [filler, 'short', filler, 'much-longer-match', filler].join(' ');
    const indices: [number, number][] = [range(text, 'short'), range(text, 'much-longer-match')];
    const html = snippetHTMLFor(mkResult(text, indices), {
      contextChars: 20,
      maxSnippets: 2,
      separator: '|||',
    });
    const parts = html.split('|||');
    expect(parts.length).toBe(2);
    // First part contains the earlier match.
    expect(parts[0]).toContain('<mark>short</mark>');
    // Second part contains the later match.
    expect(parts[1]).toContain('<mark>much-longer-match</mark>');
  });

  it('uses the default " … " separator when none is supplied', () => {
    const filler = 'x'.repeat(300);
    const text = [filler, 'aaa', filler, 'bbb', filler].join(' ');
    const indices: [number, number][] = [range(text, 'aaa'), range(text, 'bbb')];
    const html = snippetHTMLFor(mkResult(text, indices), {
      contextChars: 20,
      maxSnippets: 2,
    });
    expect(html).toContain(' … ');
  });

  it('escapes `</script>` across every snippet in multi-snippet mode', () => {
    // Adversarial PDF: contains a literal `</script>` near each match. The
    // single-snippet path escaped it correctly pre-1.0.3; this regression
    // test pins the same behavior under `maxSnippets > 1` so a future
    // refactor of the multi-snippet picker can't silently un-escape one
    // of the rendered spans.
    const filler = 'x'.repeat(300);
    const evil = '</script>';
    const text = [filler, `A${evil}B`, filler, `C${evil}D`, filler, `E${evil}F`, filler].join(' ');
    const indices: [number, number][] = [
      range(text, `A${evil}B`),
      range(text, `C${evil}D`),
      range(text, `E${evil}F`),
    ];
    const html = snippetHTMLFor(mkResult(text, indices), {
      contextChars: 20,
      maxSnippets: 3,
    });
    // 3 marked spans, none containing the literal `</script>` byte sequence.
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(3);
    expect(html).not.toMatch(/<\/script>/i);
    // The literal must have been HTML-entity-escaped.
    expect(html).toContain('&lt;/script&gt;');
  });

  it('renders bounded output even when given thousands of indices', () => {
    // Audit regression: a malicious/buggy upstream Fuse build could surface
    // an exploding `matches[].indices` list (Fuse 7 itself respects
    // `minMatchCharLength` so 100k indices is unrealistic in real flows; the
    // demo's `distributeMatches` wrapper bounds it further). We pin that the
    // picker is linear in `indices.length` and bounded in output length, so a
    // crafted input can't melt a browser tab.
    const text = 'a'.repeat(100_000);
    const indices: [number, number][] = [];
    for (let i = 0; i < 50_000; i++) {
      const s = i * 2;
      indices.push([s, s]);
    }
    const t0 = performance.now();
    const html = snippetHTMLFor(mkResult(text, indices), {
      contextChars: 20,
      maxSnippets: 8,
    });
    const elapsed = performance.now() - t0;
    // 50k indices, maxSnippets=8 — should produce <=8 mark tags.
    expect(html.match(/<mark>/g)?.length ?? 0).toBeLessThanOrEqual(8);
    // Hard bound: pickers are O(N) in indices and O(maxSnippets^2) in the
    // overlap check; 50k * 8 = 400k comparisons. Should finish well under
    // 500ms on any plausible CI runner.
    expect(elapsed).toBeLessThan(500);
  });

  it('does not crash on malformed indices (reversed / out-of-bounds / NaN / Infinity)', () => {
    // Pinned behavior, not a guarantee that malformed input is "supported":
    // Fuse 7's own search() always returns valid `[start, end]` tuples with
    // 0 <= start <= end < source.length. The defense here is that a buggy
    // upstream Fuse or a deliberately-crafted result object can't throw
    // synchronously from the snippet renderer — that would crash the search
    // UI mid-render. Output is allowed to be degenerate (empty <mark>) but
    // must not throw or hang.
    const text = 'normal indexed body text content here for slicing experiments';
    const malformed: [number, number][][] = [
      [[10, 0]], // reversed
      [[-5, -1]], // negative
      [[0, Infinity]], // unbounded end
      [[NaN, NaN]], // NaN
      [[1000, 2000]], // out of bounds (past source length)
    ];
    for (const indices of malformed) {
      // Single-snippet path.
      expect(() => snippetHTMLFor(mkResult(text, indices))).not.toThrow();
      // Multi-snippet path.
      expect(() => snippetHTMLFor(mkResult(text, indices), { maxSnippets: 3 })).not.toThrow();
    }
  });
});
