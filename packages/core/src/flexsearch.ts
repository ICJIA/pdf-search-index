/**
 * `@icjia/pdf-search-index/flexsearch` — alternative search-engine
 * adapter for [FlexSearch](https://github.com/nextapps-de/flexsearch).
 *
 * **When to use this instead of `/fuse`.** FlexSearch hits its stride
 * around the corpus size where Fuse starts to slow down. Pick by
 * corpus:
 *
 *   < 2,500 docs       → Fuse.js (better typo tolerance, snippet
 *                                  positions, simpler API).
 *   2,500 – 10,000 docs → **FlexSearch** (sub-millisecond queries,
 *                                  denser index, built-in WorkerIndex).
 *   10,000+ docs       → Pagefind (chunked on-demand index — see the
 *                                  `/pagefind-emit` entry).
 *
 * **Tradeoffs vs Fuse:**
 *
 * - **No native typo tolerance.** FlexSearch's `tolerant: true` is
 *   n-gram-based; it works but needs tuning. If "applicent" → "applicant"
 *   is core to your UX, stay on Fuse.
 * - **No native match-position output.** FlexSearch returns matched
 *   document IDs, not character-range indices. Snippet highlighting
 *   becomes a substring-search problem; we ship
 *   `snippetHTMLForFlexMatch` to handle the common case.
 * - **Encoded index format.** FlexSearch's `index.export()` produces a
 *   denser-than-JSON serialization. We use this directly in the demo's
 *   "Inspect the prebuilt index" panel so you can compare it side-by-
 *   side with the Fuse equivalent.
 *
 * Added in 1.3.
 */

import type {
  Document as FlexDocumentType,
  DocumentOptions,
  DocumentSearchResult,
} from 'flexsearch';
import type { IndexedDocument } from './types.js';
import { escapeHTML } from './snippet.js';

/**
 * Default FlexSearch Document options tuned for the `IndexedDocument`
 * shape. Mirrors the spirit of `DEFAULT_FUSE_OPTIONS` from `/fuse` —
 * sensible defaults that work for the common case (search across title
 * + text, store url/title/format/pages for result rendering).
 *
 * Override per call via the `options.flexOptions` argument.
 */
export const DEFAULT_FLEX_OPTIONS = {
  document: {
    id: 'id',
    index: [
      { field: 'title', tokenize: 'forward' as const },
      { field: 'text', tokenize: 'forward' as const },
    ],
    // `store` keeps these fields on the index so `result[i].result[j].doc`
    // is populated — we use that for downstream snippet rendering.
    store: ['url', 'title', 'format', 'pages'],
  },
  // Encode strategy: 'icase' = case-insensitive ASCII; the lightest
  // option. For multi-language sites consider 'simple' or 'advanced'.
  encode: 'icase' as const,
} as const;

/**
 * Build a FlexSearch Document index from `IndexedDocument[]` rows.
 *
 * Pure-Node usage:
 *
 * ```ts
 * import { createFlexSearchIndex } from '@icjia/pdf-search-index/flexsearch';
 *
 * const rows = await indexDocuments(urls);
 * const index = await createFlexSearchIndex(rows);
 *
 * // FlexSearch search API
 * const results = await index.search('stigma', { enrich: true });
 * ```
 *
 * Browser usage: build the index in the consumer's bundle the same way.
 * Or use FlexSearch's built-in `WorkerIndex` for off-main-thread search;
 * see https://github.com/nextapps-de/flexsearch/blob/master/doc/worker.md.
 *
 * @param rows  Documents to index.
 * @param options  Optional FlexSearch DocumentOptions override; merged
 *                 onto `DEFAULT_FLEX_OPTIONS`.
 */
export async function createFlexSearchIndex(
  rows: readonly IndexedDocument[],
  options?: { flexOptions?: DocumentOptions<IndexedDocument, false> },
): Promise<FlexDocumentType<IndexedDocument, false>> {
  // Dynamic import keeps the cold-start cost down — consumers that don't
  // use the /flexsearch entry never pay for FlexSearch's resolution. The
  // catch surfaces a clear "install flexsearch" message instead of the
  // raw module-resolution error.
  let DocumentCtor: new (
    opts: DocumentOptions<IndexedDocument, false>,
  ) => FlexDocumentType<IndexedDocument, false>;
  try {
    const mod = await import('flexsearch');
    // FlexSearch ships both default + named exports for `Document`;
    // handle both shapes.
    const m = mod as unknown as {
      Document?: typeof DocumentCtor;
      default?: { Document?: typeof DocumentCtor };
    };
    const candidate = m.Document ?? m.default?.Document;
    if (!candidate) {
      throw new Error('flexsearch module loaded but Document constructor not found');
    }
    DocumentCtor = candidate;
  } catch (e) {
    throw new Error(
      '@icjia/pdf-search-index/flexsearch requires the `flexsearch` peer dependency. ' +
        'Install with: `npm install flexsearch` (or pnpm/yarn equivalent). ' +
        'Underlying error: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }

  const opts =
    options?.flexOptions ??
    (DEFAULT_FLEX_OPTIONS.document as unknown as DocumentOptions<IndexedDocument, false>);
  const index = new DocumentCtor(opts);
  for (const row of rows) {
    index.add(row);
  }
  return index;
}

/**
 * Render an HTML snippet around the first occurrence of `query` in the
 * matched document's text. FlexSearch returns matched docs but not
 * character positions, so we do our own case-insensitive substring
 * search to locate the highlight.
 *
 * Output shape matches `snippetHTMLFor` from `/snippet` — same
 * `<mark>`-wrapped highlight, same `…` leading/trailing markers, same
 * HTML escaping for source text.
 *
 * @param row           The matched IndexedDocument (from FlexSearch's
 *                      enriched result or your own row lookup).
 * @param query         The user's search query.
 * @param options       contextChars (default 80); matchKey (default 'text');
 *                      collapseWhitespace (default true).
 */
export function snippetHTMLForFlexMatch(
  row: IndexedDocument,
  query: string,
  options?: {
    contextChars?: number;
    matchKey?: 'title' | 'text';
    collapseWhitespace?: boolean;
  },
): string {
  const contextChars = options?.contextChars ?? 80;
  const matchKey = options?.matchKey ?? 'text';
  const collapseWS = options?.collapseWhitespace ?? true;
  const source = matchKey === 'title' ? row.title : row.text;
  if (!source || !query.trim()) return '';

  // Case-insensitive substring search. For multi-word queries, locate
  // the first token's first occurrence — keeps the snippet bounded and
  // matches typical "show me where this appears" UX.
  const firstToken = query.trim().split(/\s+/)[0] ?? '';
  if (!firstToken) return '';
  const idx = source.toLowerCase().indexOf(firstToken.toLowerCase());
  if (idx === -1) {
    // No literal substring match — return a small leading slice as
    // context. (FlexSearch matched on a stemmed / tokenized form; the
    // raw substring may not appear verbatim.)
    const head = source.slice(0, contextChars * 2);
    const transformed = collapseWS ? head.replace(/\s+/g, ' ') : head;
    return source.length > contextChars * 2
      ? `${escapeHTML(transformed)}…`
      : escapeHTML(transformed);
  }

  const start = Math.max(0, idx - contextChars);
  const end = Math.min(source.length, idx + firstToken.length + contextChars);

  const transform = collapseWS ? (s: string) => s.replace(/\s+/g, ' ') : (s: string) => s;

  const before = transform(source.slice(start, idx));
  const hit = transform(source.slice(idx, idx + firstToken.length));
  const after = transform(source.slice(idx + firstToken.length, end));

  const lead = start > 0 ? '…' : '';
  const trail = end < source.length ? '…' : '';

  return `${lead}${escapeHTML(before)}<mark>${escapeHTML(hit)}</mark>${escapeHTML(after)}${trail}`;
}

/**
 * Helper: pull `IndexedDocument` rows out of a FlexSearch enriched
 * search result. FlexSearch's result shape is:
 *
 * ```
 * [ { field: 'text', result: [{ id, doc }, ...] }, ... ]
 * ```
 *
 * — one entry per searched field with a per-field result array. This
 * helper flattens + dedupes by `id` and returns the underlying rows in
 * the order they first appear.
 */
export function flattenFlexResults<T extends IndexedDocument>(
  results: DocumentSearchResult<T, false>,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const fieldGroup of results) {
    // Per-field result shape under `enrich: true`:
    //   { id, doc: { ...stored fields without id } }
    // The outer `id` is the row id; the `doc` carries only the fields
    // listed in `store`. We merge them so callers get a complete row
    // back. Without enrich the result element is just the bare id.
    for (const r of fieldGroup.result as unknown[]) {
      let id: string | undefined;
      let row: T | undefined;
      if (typeof r === 'object' && r !== null) {
        const rec = r as { id?: string; doc?: Partial<T> };
        id = rec.id;
        if (rec.doc) row = { ...rec.doc, id: rec.id } as T;
      } else if (typeof r === 'string' || typeof r === 'number') {
        id = String(r);
        // No enrich → caller needs to look the row up themselves.
        // We can't reconstruct the row here.
      }
      if (id && !seen.has(id)) {
        seen.add(id);
        if (row) out.push(row);
      }
    }
  }
  return out;
}

// Re-export the row type for convenience.
export type { IndexedDocument } from './types.js';
