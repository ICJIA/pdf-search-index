<!-- astro/src/components/Search.vue -->
<!--
  Vue 3 SFC island. Loads /searchIndex.json on mount, builds a Fuse instance
  with `includeMatches: true`, renders matched results as the user types.
  Filter chips by collection type are query-driven (only appear after a
  query produces matches, counts reflect that query's results). Zero-match
  chips are disabled; the active filter auto-resets to "All" if a new
  query would orphan it.

  PDFs linked from page bodies are first-class search rows (type=`pdf`,
  path=the PDF URL directly). PDF result links open in a new tab. Every
  result renders a snippet of the matched text with the match `<mark>`-ed.

  Mounted at /search/ with `client:idle`.
-->
<template>
  <div class="search">
    <label class="search__label" for="search-input">Search R3</label>
    <input
      id="search-input"
      v-model="query"
      type="search"
      placeholder="Search the R3 site, including PDF contents"
      autocomplete="off"
      class="search__input"
    />

    <p class="search__count" aria-live="polite">
      <template v-if="!loaded">Loading search index…</template>
      <template v-else-if="!query.trim()">
        Type above to search the R3 site &mdash; {{ rows.length }} pages, news posts, resources,
        research articles, and PDF documents indexed.
      </template>
      <template v-else-if="results.length === 0">
        No matches for &ldquo;{{ query }}&rdquo;.
      </template>
      <template v-else>
        {{ results.length }} match{{ results.length === 1 ? '' : 'es'
        }}<template v-if="activeType !== 'all'">
          in {{ typeLabel(activeType as Row['type']) }}</template
        >.
      </template>
    </p>

    <fieldset v-if="loaded && query.trim() && matched.length" class="search__filters">
      <legend class="sr-only">Filter by content type</legend>
      <button
        v-for="t in types"
        :key="t.key"
        type="button"
        class="search__chip"
        :class="{ 'is-active': activeType === t.key }"
        :aria-pressed="activeType === t.key"
        :disabled="t.key !== 'all' && countByType(t.key) === 0"
        @click="setType(t.key)"
      >
        {{ t.label }} ({{ countByType(t.key) }})
      </button>
    </fieldset>

    <ul v-if="loaded && query.trim() && results.length" class="search__results" role="list">
      <li v-for="r in results.slice(0, 50)" :key="r.item.id">
        <a
          :href="r.item.path"
          :target="r.item.type === 'pdf' ? '_blank' : undefined"
          :rel="r.item.type === 'pdf' ? 'noopener noreferrer' : undefined"
        >
          <span class="search__type">
            {{ typeLabel(r.item.type)
            }}<template v-if="r.item.type === 'pdf'"> &middot; opens in new tab</template>
          </span>
          <strong>{{ r.item.title }}</strong>
          <p v-if="snippetHTMLFor(r)" class="search__snippet" v-html="snippetHTMLFor(r)"></p>
        </a>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Fuse, { type FuseResult, type FuseResultMatch } from 'fuse.js';

interface Row {
  type: 'pages' | 'news' | 'resources' | 'hubArticles' | 'pdf';
  id: string;
  title: string;
  path: string;
  rawText: string;
  postDate?: string;
}

const rows = ref<Row[]>([]);
const fuse = ref<Fuse<Row> | null>(null);
const query = ref('');
const loaded = ref(false);
const activeType = ref<Row['type'] | 'all'>('all');

const types = [
  { key: 'all', label: 'All' },
  { key: 'pages', label: 'Pages' },
  { key: 'news', label: 'News' },
  { key: 'resources', label: 'Resources' },
  { key: 'hubArticles', label: 'Research' },
  { key: 'pdf', label: 'PDFs' },
] as const;

function typeLabel(t: Row['type']): string {
  const found = types.find((x) => x.key === t);
  return found ? found.label : t;
}

const matched = computed<FuseResult<Row>[]>(() => {
  if (!fuse.value || !query.value.trim()) return [];
  return fuse.value.search(query.value);
});

function countByType(t: typeof activeType.value): number {
  if (t === 'all') return matched.value.length;
  return matched.value.filter((r) => r.item.type === t).length;
}

function setType(t: typeof activeType.value): void {
  activeType.value = t;
}

const results = computed<FuseResult<Row>[]>(() => {
  return activeType.value === 'all'
    ? matched.value
    : matched.value.filter((r) => r.item.type === activeType.value);
});

// If a new query has zero matches in the currently-active type, fall back
// to "All" so the UI never lands in a dead-end "0 matches" state while
// matches exist in other types.
watch(matched, (m) => {
  if (activeType.value === 'all') return;
  const inActive = m.filter((r) => r.item.type === activeType.value).length;
  if (inActive === 0) activeType.value = 'all';
});

// ─── Snippet rendering ──────────────────────────────────────────────────

function escapeHTML(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function collapseWS(s: string): string {
  // PDF text from pdf.js often has stretches of whitespace from layout
  // reflow; collapse to single spaces so the snippet reads cleanly.
  return s.replace(/\s+/g, ' ');
}

function longestMatchIndex(m: FuseResultMatch): readonly [number, number] | null {
  if (!m.indices?.length) return null;
  return m.indices.reduce<readonly [number, number]>(
    (best, cur) => (cur[1] - cur[0] > best[1] - best[0] ? cur : best),
    m.indices[0],
  );
}

const SNIPPET_CONTEXT = 80;

function snippetHTMLFor(r: FuseResult<Row>): string {
  const m = (r.matches ?? []).find((x) => x.key === 'rawText');
  if (!m) return '';
  const idx = longestMatchIndex(m);
  if (!idx) return '';

  const [start, end] = idx;
  const text = r.item.rawText;
  const snipStart = Math.max(0, start - SNIPPET_CONTEXT);
  const snipEnd = Math.min(text.length, end + 1 + SNIPPET_CONTEXT);

  const before = collapseWS(text.slice(snipStart, start));
  const hit = collapseWS(text.slice(start, end + 1));
  const after = collapseWS(text.slice(end + 1, snipEnd));

  const leadEllipsis = snipStart > 0 ? '…' : '';
  const trailEllipsis = snipEnd < text.length ? '…' : '';

  return `${leadEllipsis}${escapeHTML(before)}<mark>${escapeHTML(hit)}</mark>${escapeHTML(after)}${trailEllipsis}`;
}

onMounted(async () => {
  const res = await fetch('/searchIndex.json');
  if (!res.ok) {
    console.error('search index fetch failed', res.status);
    return;
  }
  rows.value = (await res.json()) as Row[];
  fuse.value = new Fuse(rows.value, {
    keys: ['title', 'rawText'],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
  loaded.value = true;
});
</script>

<style scoped>
.search {
  max-width: 720px;
  margin: 0 auto;
}
.search__label {
  font-weight: 600;
  display: block;
  margin-bottom: 0.5rem;
}
.search__input {
  width: 100%;
  font-size: 1.1rem;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-r3-primary);
  border-radius: 4px;
  min-height: 44px;
}
.search__input:focus-visible {
  outline: 3px solid var(--color-r3-primary);
  outline-offset: 2px;
}
.search__filters {
  border: none;
  padding: 0;
  margin: 1rem 0;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.search__chip {
  background: #fff;
  border: 1px solid var(--color-r3-primary);
  color: var(--color-r3-primary);
  padding: 0.4rem 0.75rem;
  border-radius: 9999px;
  cursor: pointer;
  min-height: 44px;
  font-weight: 600;
}
.search__chip.is-active {
  background: var(--color-r3-primary);
  color: #fff;
}
.search__chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  border-color: var(--color-r3-text-muted, #555);
  color: var(--color-r3-text-muted, #555);
}
.search__chip:focus-visible {
  outline: 3px solid var(--color-r3-primary);
  outline-offset: 2px;
}
.search__count {
  color: var(--color-r3-text-muted);
  margin: 1rem 0;
}
.search__results {
  list-style: none;
  padding: 0;
  margin: 0;
}
.search__results li {
  margin: 0.5rem 0;
}
.search__results a {
  display: block;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-r3-card-border);
  border-radius: 4px;
  background: #fff;
  text-decoration: none;
  color: inherit;
  min-height: 44px;
}
.search__results a:hover,
.search__results a:focus-visible {
  background: rgba(13, 68, 116, 0.05);
}
.search__results a:focus-visible {
  outline: 2px solid var(--color-r3-primary);
  outline-offset: 2px;
}
.search__type {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--color-r3-text-muted);
  display: block;
  margin-bottom: 0.25rem;
}
.search__snippet {
  color: var(--color-r3-text-muted, #555);
  font-size: 0.875rem;
  margin: 0.5rem 0 0;
  line-height: 1.45;
  /* PDF excerpts can be long; cap height with smooth fade-out instead of
     hard truncation so the snippet hint stays scannable. */
  max-height: 4.5em;
  overflow: hidden;
  position: relative;
}
.search__snippet :deep(mark) {
  background: #fff59d;
  color: #1a1a1a;
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 600;
}
</style>
