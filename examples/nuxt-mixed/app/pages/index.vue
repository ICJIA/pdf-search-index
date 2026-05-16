<template>
  <main>
    <h1>PDF Search — Nuxt 4 mixed-content example</h1>
    <p class="lede">
      Nuxt 4 + <code>@nuxt/content</code> + a mocked Strapi-style CMS. The server route at
      <code>/api/searchIndex</code> walks both sources and returns pages, content rows, and deduped
      PDF rows.
    </p>

    <input v-model="query" type="search" placeholder="Search the PDF corpus…" autocomplete="off" />
    <p class="meta" aria-live="polite">
      <template v-if="!loaded">Loading…</template>
      <template v-else-if="!query.trim()">
        {{ all.length }} row(s) indexed ({{ pdfs.length }} PDF(s)). Try "stigma", "methamphetamine",
        "juvenile".
      </template>
      <template v-else-if="!results.length">No matches for "{{ query }}".</template>
      <template v-else>{{ results.length }} match(es).</template>
    </p>
    <ul v-if="results.length" class="results">
      <li v-for="r in results.slice(0, 50)" :key="String(r.item.id)">
        <a
          v-if="(r.item as PdfLike).url"
          :href="(r.item as PdfLike).url"
          target="_blank"
          rel="noopener"
        >
          <strong>{{ r.item.title }}</strong>
        </a>
        <strong v-else>{{ r.item.title }}</strong>
        <p v-if="snippet(r)" class="snippet" v-html="snippet(r)"></p>
      </li>
    </ul>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

interface PdfLike extends IndexedPdf {
  url: string;
}
interface CmsRow {
  type: 'cms';
  id: string;
  title: string;
}
interface ContentRow {
  type: 'content';
  id: string;
  title?: string;
}
type Row = PdfLike | CmsRow | ContentRow;

const all = ref<Row[]>([]);
const pdfs = ref<PdfLike[]>([]);
const fuse = ref<Fuse<Row> | null>(null);
const query = ref('');
const loaded = ref(false);

const results = computed<FuseResult<Row>[]>(() => {
  if (!fuse.value || !query.value.trim()) return [];
  return fuse.value.search(query.value);
});

function snippet(r: FuseResult<Row>): string {
  return 'text' in r.item ? snippetHTMLFor(r as FuseResult<PdfLike>, { matchKey: 'text' }) : '';
}

onMounted(async () => {
  const res = await fetch('/api/searchIndex');
  const body = (await res.json()) as { cms: CmsRow[]; content: ContentRow[]; pdfs: PdfLike[] };
  pdfs.value = body.pdfs;
  all.value = [...body.cms, ...body.content, ...body.pdfs];
  fuse.value = new Fuse(all.value, {
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
main {
  font:
    16px/1.5 system-ui,
    sans-serif;
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem;
}
h1 {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}
p.lede {
  color: #555;
  margin-top: 0;
}
input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  border: 2px solid #0d4474;
  border-radius: 4px;
}
.meta {
  color: #555;
}
.results {
  list-style: none;
  padding: 0;
}
.results li {
  margin: 0.5rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.results a {
  color: #0d4474;
  text-decoration: none;
}
.snippet {
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
