<template>
  <section class="search" aria-labelledby="search-heading">
    <h2 id="search-heading" class="search__heading">Try it</h2>
    <div class="search__card">
      <div class="search__bar">
        <label class="search__label">
          <span class="search__label-text">Search</span>
          <input
            ref="inputEl"
            v-model="query"
            type="search"
            placeholder="Search across all PDFs…"
            autocomplete="off"
            spellcheck="false"
            autocapitalize="off"
            autocorrect="off"
            class="search__input"
          />
        </label>
        <p class="search__meta" aria-live="polite">
          <template v-if="!loaded">Loading search index…</template>
          <template v-else-if="!query.trim()"
            >Type above to search across {{ rows.length }} PDFs.</template
          >
          <template v-else-if="!results.length">No matches for &ldquo;{{ query }}&rdquo;.</template>
          <template v-else
            >{{ results.length }} {{ results.length === 1 ? 'match' : 'matches' }}.</template
          >
        </p>
      </div>

      <ul v-if="results.length" class="search__results">
        <li v-for="r in results.slice(0, 50)" :key="r.item.id" class="search__result">
          <a
            :href="publicPdfUrl(r.item.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="search__result-link"
          >
            <h3 class="search__result-title">{{ r.item.title }}</h3>
            <p v-if="snippet(r)" class="search__snippet" v-html="snippet(r)"></p>
            <span class="search__result-cta">Open PDF</span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

const rows = ref<IndexedPdf[]>([]);
const fuse = ref<Fuse<IndexedPdf> | null>(null);
const query = ref('');
const loaded = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

const results = computed<FuseResult<IndexedPdf>[]>(() => {
  if (!fuse.value || !query.value.trim()) return [];
  return fuse.value.search(query.value);
});

function snippet(r: FuseResult<IndexedPdf>): string {
  return snippetHTMLFor(r, { contextChars: 120, matchKey: 'text' });
}

/**
 * The index was built against `file://` URLs (local-fetch.mjs reads from
 * disk at build time), but the deployed site serves PDFs at `/pdfs/...`.
 * Map filename → public URL here, encoding components so filenames with
 * spaces still resolve as a single path segment.
 */
function publicPdfUrl(fileUrl: string): string {
  // The build URLs look like: file:///abs/path/to/_fixtures/Foo Bar.pdf
  // We only need the basename; the runtime path is /pdfs/<basename>.
  const lastSlash = fileUrl.lastIndexOf('/');
  const basename = lastSlash >= 0 ? fileUrl.slice(lastSlash + 1) : fileUrl;
  // The filename may already be percent-encoded (file:// from URL ctor).
  const decoded = decodeURIComponent(basename);
  return `/pdfs/${encodeURIComponent(decoded)}`;
}

onMounted(async () => {
  const res = await fetch('/searchIndex.pdfs.json');
  rows.value = (await res.json()) as IndexedPdf[];
  fuse.value = new Fuse(rows.value, {
    keys: ['title', 'text'],
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
  margin-top: 2rem;
}

.search__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
  color: var(--text);
}

.search__card {
  position: relative;
  padding: 2rem 1.5rem;
  background: #101015;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.02),
    0 8px 32px -16px rgba(0, 0, 0, 0.5);
}

/* Subtle accent strip along the top edge to signal "interactive panel". */
.search__card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--accent) 70%, transparent) 50%,
    transparent 100%
  );
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  opacity: 0.65;
}

.search__bar {
  position: sticky;
  top: 0;
  z-index: 10;
  margin: -2rem -1.5rem 0;
  padding: 1.25rem 1.5rem 1.25rem;
  background: color-mix(in srgb, #101015 92%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}

.search__label {
  display: block;
}

.search__label-text {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.search__input {
  width: 100%;
  height: 54px;
  padding: 0 1rem;
  font-family: var(--font-mono);
  font-size: 1rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease;
}

.search__input::placeholder {
  color: var(--text-placeholder);
}

.search__input:hover {
  border-color: var(--border-strong);
}

.search__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
  background: var(--surface-hover);
}

.search__meta {
  margin: 0.75rem 0 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.search__results {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
  display: grid;
  gap: 0.75rem;
}

.search__result {
  margin: 0;
}

.search__result-link {
  display: block;
  padding: 1.25rem;
  color: var(--text);
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  position: relative;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    transform 150ms ease;
}

.search__result-link:hover,
.search__result-link:focus-visible {
  border-color: var(--border-strong);
  background: var(--surface-hover);
  outline: none;
}

.search__result-link:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}

.search__result-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.005em;
}

.search__snippet {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search__result-cta {
  display: inline-flex;
  align-items: center;
  margin-top: 0.85rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--accent);
}

.search__result-cta::after {
  content: '\2192';
  margin-left: 0.4em;
  transition: transform 150ms ease;
}

.search__result-link:hover .search__result-cta::after {
  transform: translateX(2px);
}

:deep(mark) {
  background: #a3e635;
  color: #1a2e05;
  padding: 0.05em 0.35em;
  border-radius: 3px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .search__card {
    padding: 1.5rem 1rem;
    border-radius: 10px;
  }
  .search__bar {
    margin: -1.5rem -1rem 0;
    padding: 1rem 1rem 1rem;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
  }
  .search__input {
    height: 44px;
    font-size: 0.95rem;
  }
  .search__heading {
    font-size: 1.25rem;
  }
}
</style>
