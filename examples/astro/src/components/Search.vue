<template>
  <div class="search">
    <input
      v-model="query"
      type="search"
      placeholder="Search the PDF corpus…"
      autocomplete="off"
      class="search__input"
    />
    <p class="search__meta" aria-live="polite">
      <template v-if="!loaded">Loading search index…</template>
      <template v-else-if="!query.trim()">
        {{ rows.length }} PDF(s) indexed. Try "stigma", "methamphetamine", "juvenile".
      </template>
      <template v-else-if="!results.length"> No matches for "{{ query }}". </template>
      <template v-else> {{ results.length }} match(es). </template>
    </p>
    <ul v-if="results.length" class="search__results">
      <li v-for="r in results.slice(0, 50)" :key="r.item.id">
        <a :href="r.item.url" target="_blank" rel="noopener noreferrer">
          <strong>{{ r.item.title }}</strong>
          <p v-if="snippet(r)" class="search__snippet" v-html="snippet(r)"></p>
        </a>
      </li>
    </ul>
  </div>
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

const results = computed<FuseResult<IndexedPdf>[]>(() => {
  if (!fuse.value || !query.value.trim()) return [];
  return fuse.value.search(query.value);
});

function snippet(r: FuseResult<IndexedPdf>): string {
  return snippetHTMLFor(r, { contextChars: 80, matchKey: 'text' });
}

onMounted(async () => {
  const res = await fetch('/searchIndex.pdfs.json');
  rows.value = (await res.json()) as IndexedPdf[];
  fuse.value = new Fuse(rows.value, {
    keys: ['title', 'text'],
    threshold: 0.2,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
  loaded.value = true;
});
</script>

<style scoped>
.search__input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  border: 2px solid #0d4474;
  border-radius: 4px;
}
.search__meta {
  color: #555;
}
.search__results {
  list-style: none;
  padding: 0;
}
.search__results li {
  margin: 0.5rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.search__results a {
  color: #0d4474;
  text-decoration: none;
}
.search__snippet {
  color: #555;
  font-size: 0.9rem;
  margin-top: 0.4rem;
}
:deep(mark) {
  background: #fff59d;
  padding: 0 2px;
  border-radius: 2px;
}
</style>
