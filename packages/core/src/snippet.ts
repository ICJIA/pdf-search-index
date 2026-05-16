import type { FuseResult, FuseResultMatch } from 'fuse.js';

const DEFAULT_CONTEXT_CHARS = 80;
const DEFAULT_SEPARATOR = ' … ';

export interface SnippetOptions {
  contextChars?: number;
  matchKey?: string;
  collapseWhitespace?: boolean;
  /**
   * Render up to N highlighted snippets per result, instead of just the
   * single longest match span. Default `1` — backward compatible.
   *
   * When > 1, the picker greedily takes the N longest non-overlapping
   * spans (overlap = `[start-ctx, end+ctx]` windows intersect), then
   * re-sorts them by start position so snippets appear in document
   * order. Joined with `separator` between snippets.
   */
  maxSnippets?: number;
  /**
   * String inserted between snippets when `maxSnippets > 1`. Default
   * `' … '` (space + horizontal ellipsis + space).
   */
  separator?: string;
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

/**
 * Render the snippet around a single match span. The span boundaries
 * `[start, end]` are inclusive on both ends, matching Fuse's `indices`
 * convention. `source` is the raw indexed string the span points into.
 */
function renderSpan(
  source: string,
  span: readonly [number, number],
  contextChars: number,
  collapse: boolean,
): string {
  const [start, end] = span;
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

export function snippetHTMLFor<T>(r: FuseResult<T>, options?: SnippetOptions): string {
  const contextChars = options?.contextChars ?? DEFAULT_CONTEXT_CHARS;
  const matchKey = options?.matchKey ?? 'text';
  const collapse = options?.collapseWhitespace ?? true;
  const maxSnippets = Math.max(1, options?.maxSnippets ?? 1);
  const separator = options?.separator ?? DEFAULT_SEPARATOR;

  const m = pickMatch(r, matchKey);
  if (!m) return '';

  // Pull source string from the match's value (preferred) or the item field.
  // The narrow internal cast is necessary because T is free; we still guard
  // with `typeof === 'string'` so the runtime contract is preserved.
  const itemRecord = r.item as Record<string, unknown>;
  const source =
    (typeof m.value === 'string' && m.value) ||
    (typeof itemRecord[matchKey] === 'string' ? (itemRecord[matchKey] as string) : '');
  if (!source) return '';

  // Single-snippet fast path — must produce byte-identical output to the
  // pre-1.0.3 implementation for callers who don't set `maxSnippets`.
  if (maxSnippets === 1) {
    const idx = longestIndex(m);
    if (!idx) return '';
    return renderSpan(source, idx, contextChars, collapse);
  }

  if (!m.indices?.length) return '';

  // Multi-snippet path: rank candidate spans by length descending, greedily
  // pick non-overlapping ones (overlap = context windows intersect), then
  // re-sort the chosen spans by `start` so snippets appear in document
  // order. Bounded by `maxSnippets`.
  const candidates = [...m.indices]
    .map((c) => c as readonly [number, number])
    .sort((a, b) => b[1] - b[0] - (a[1] - a[0]));

  const chosen: Array<readonly [number, number]> = [];
  for (const span of candidates) {
    if (chosen.length >= maxSnippets) break;
    const [aStart, aEnd] = span;
    const aWinStart = Math.max(0, aStart - contextChars);
    const aWinEnd = Math.min(source.length, aEnd + 1 + contextChars);
    const overlaps = chosen.some(([bStart, bEnd]) => {
      const bWinStart = Math.max(0, bStart - contextChars);
      const bWinEnd = Math.min(source.length, bEnd + 1 + contextChars);
      return aWinStart < bWinEnd && bWinStart < aWinEnd;
    });
    if (!overlaps) chosen.push(span);
  }

  if (chosen.length === 0) return '';

  chosen.sort((a, b) => a[0] - b[0]);

  return chosen.map((span) => renderSpan(source, span, contextChars, collapse)).join(separator);
}
