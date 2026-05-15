import type { FuseResult, FuseResultMatch } from 'fuse.js';

const DEFAULT_CONTEXT_CHARS = 80;

export interface SnippetOptions {
  contextChars?: number;
  matchKey?: string;
  collapseWhitespace?: boolean;
}

export function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

function collapseWS(s: string): string {
  return s.replace(/\s+/g, ' ');
}

function longestIndex(m: FuseResultMatch): readonly [number, number] | null {
  if (!m.indices?.length) return null;
  let best = m.indices[0] as readonly [number, number];
  for (const cur of m.indices) {
    const c = cur as readonly [number, number];
    if (c[1] - c[0] > best[1] - best[0]) best = c;
  }
  return best;
}

function pickMatch<T>(r: FuseResult<T>, matchKey: string): FuseResultMatch | null {
  if (!r.matches?.length) return null;
  return r.matches.find((m) => m.key === matchKey) ?? r.matches[0] ?? null;
}

export function snippetHTMLFor<T>(r: FuseResult<T>, options?: SnippetOptions): string {
  const contextChars = options?.contextChars ?? DEFAULT_CONTEXT_CHARS;
  const matchKey = options?.matchKey ?? 'text';
  const collapse = options?.collapseWhitespace ?? true;

  const m = pickMatch(r, matchKey);
  if (!m) return '';

  const idx = longestIndex(m);
  if (!idx) return '';

  // Pull source string from the match's value (preferred) or the item field.
  // The narrow internal cast is necessary because T is free; we still guard
  // with `typeof === 'string'` so the runtime contract is preserved.
  const itemRecord = r.item as Record<string, unknown>;
  const source =
    (typeof m.value === 'string' && m.value) ||
    (typeof itemRecord[matchKey] === 'string' ? (itemRecord[matchKey] as string) : '');
  if (!source) return '';

  const [start, end] = idx;
  const snipStart = Math.max(0, start - contextChars);
  const snipEnd = Math.min(source.length, end + 1 + contextChars);

  const transform = collapse ? collapseWS : (s: string) => s;

  const before = transform(source.slice(snipStart, start));
  const hit = transform(source.slice(start, end + 1));
  const after = transform(source.slice(end + 1, snipEnd));

  const lead = snipStart > 0 ? '…' : '';
  const trail = snipEnd < source.length ? '…' : '';

  return `${lead}${escapeHTML(before)}<mark>${escapeHTML(hit)}</mark>${escapeHTML(after)}${trail}`;
}
