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
          <template v-else-if="!keysSelected"
            >Select at least one key (title or text) to enable search.</template
          >
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

  <section class="tune" aria-labelledby="tune-heading">
    <h2 id="tune-heading" class="tune__heading">Tune Fuse.js, live</h2>
    <div class="tune__card">
      <div class="tune__controls">
        <div class="tune__control">
          <label for="tune-threshold">Threshold: {{ threshold.toFixed(2) }}</label>
          <input
            id="tune-threshold"
            v-model.number="threshold"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="tune__slider"
            :aria-valuenow="threshold"
            aria-valuemin="0"
            aria-valuemax="1"
          />
          <p class="tune__help">0.0 = exact match only · 1.0 = match almost anything</p>
        </div>

        <div class="tune__control">
          <label class="tune__checkbox" for="tune-ignore-location">
            <input id="tune-ignore-location" v-model="ignoreLocation" type="checkbox" />
            <span>ignoreLocation</span>
          </label>
          <p class="tune__help">
            When on, Fuse searches the entire field. When off, matches near the start of the field
            score higher — usually wrong for long PDF text.
          </p>
        </div>

        <div class="tune__control">
          <label for="tune-min-match">minMatchCharLength: {{ minMatchCharLength }}</label>
          <input
            id="tune-min-match"
            v-model.number="minMatchCharLength"
            type="number"
            min="1"
            max="8"
            class="tune__number"
          />
          <p class="tune__help">
            Drop matches shorter than this many characters. Raises signal-to-noise but misses short
            query terms.
          </p>
        </div>

        <div class="tune__control">
          <span class="tune__group-label" id="tune-keys-label">Search in:</span>
          <div class="tune__checkbox-group" role="group" aria-labelledby="tune-keys-label">
            <label class="tune__checkbox" for="tune-key-title">
              <input id="tune-key-title" v-model="searchTitle" type="checkbox" />
              <span>title</span>
            </label>
            <label class="tune__checkbox" for="tune-key-text">
              <input id="tune-key-text" v-model="searchText" type="checkbox" />
              <span>text</span>
            </label>
          </div>
          <p class="tune__help">
            Disable &ldquo;text&rdquo; to see how much weaker the match is when only titles are
            indexed — that&rsquo;s the case for any search engine that doesn&rsquo;t extract PDF
            text.
          </p>
        </div>
      </div>

      <div class="tune__config" aria-label="Current Fuse.js configuration">
        <p class="tune__config-label">Current config</p>
        <pre><code>{{ configSnippet }}</code></pre>
      </div>

      <div class="tune__reset-row">
        <button type="button" class="tune__reset" @click="resetDefaults">Reset to defaults</button>
      </div>
    </div>
  </section>

  <section class="why" aria-labelledby="why-fuse-heading">
    <h2 id="why-fuse-heading" class="why__heading">Why Fuse.js?</h2>
    <div class="why__card">
      <h3>Why Fuse.js is the default here</h3>
      <p>
        Fuse.js is the right default for this package because the whole point — PDFs become search
        rows alongside your page text — assumes you already have a Fuse setup. The R3 reference site
        that motivated this package was Fuse-based; ICJIA&rsquo;s Astro and Nuxt sites are
        Fuse-based; the spec calls Fuse out as the bullseye consumer.
      </p>
      <p>Beyond that genealogy, Fuse fits the constraints:</p>
      <ul>
        <li>
          <strong>Pure client-side.</strong> The whole library is ~12 KB gzipped and runs in the
          browser. No API, no server, no database — the index ships as static JSON and Fuse loads it
          from the page. That&rsquo;s the same shape this package delivers, so they pair without
          ceremony.
        </li>
        <li>
          <strong>Fuzzy matching tolerates typos.</strong> PDF text from <code>pdf.js</code> has its
          own quirks — extra whitespace, line breaks across columns, the occasional OCR-like
          artifact. A user typing &ldquo;applicent&rdquo; should still find &ldquo;applicant&rdquo;;
          Fuse&rsquo;s bitap algorithm handles that with the threshold slider above.
        </li>
        <li>
          <strong>Sensible defaults work.</strong> Three lines of code (<code
            >new Fuse(rows, &#123; keys: ['title', 'text'], includeMatches: true &#125;)</code
          >) produces a usable index. The four controls in the tuner above cover ~90% of real
          configuration needs.
        </li>
        <li>
          <strong>Mature and stable.</strong> v7.x has been the API surface for years. No churn, no
          breaking releases mid-deploy.
        </li>
      </ul>

      <h3>Not the only option</h3>
      <p>
        The output of this package is plain JSON — every search engine consumes it. The top-level
        README has working recipes for MiniSearch (lighter index format, slightly better relevance),
        Orama (zero-config, multi-language, fast on large corpora), Lunr (no-fuzzy classic),
        FlexSearch (best raw perf, fiddlier config), Pagefind (build-time crawler — different
        model), and three managed services (Typesense, MeiliSearch, Algolia). Pick by team
        familiarity and corpus size; for the 7-PDF demo you&rsquo;re looking at, Fuse and any of
        those are interchangeable.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import type { IndexedPdf } from '@icjia/pdf-search-index';

const rows = ref<IndexedPdf[]>([]);
const query = ref('');
const loaded = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

// Tuner state — defaults match the canonical configuration the package
// recommends. These drive a computed Fuse instance below; the rest of
// the app is unaffected since this is scoped to the demo component.
const DEFAULT_THRESHOLD = 0.3;
const DEFAULT_IGNORE_LOCATION = true;
const DEFAULT_MIN_MATCH_CHAR_LENGTH = 2;

const threshold = ref(DEFAULT_THRESHOLD);
const ignoreLocation = ref(DEFAULT_IGNORE_LOCATION);
const minMatchCharLength = ref(DEFAULT_MIN_MATCH_CHAR_LENGTH);
const searchTitle = ref(true);
const searchText = ref(true);

const keysSelected = computed(() => searchTitle.value || searchText.value);

const activeKeys = computed<string[]>(() => {
  const keys: string[] = [];
  if (searchTitle.value) keys.push('title');
  if (searchText.value) keys.push('text');
  return keys;
});

const fuseInstance = computed(() => {
  if (!rows.value.length) return null;
  if (!activeKeys.value.length) return null;
  return new Fuse(rows.value, {
    keys: activeKeys.value,
    threshold: threshold.value,
    ignoreLocation: ignoreLocation.value,
    minMatchCharLength: minMatchCharLength.value,
    includeMatches: true,
  });
});

const results = computed<FuseResult<IndexedPdf>[]>(() => {
  if (!fuseInstance.value || !query.value.trim()) return [];
  return fuseInstance.value.search(query.value);
});

const configSnippet = computed(() => {
  const keysLiteral = activeKeys.value.length ? `['${activeKeys.value.join("', '")}']` : '[]';
  return `new Fuse(rows, {
  keys: ${keysLiteral},
  threshold: ${threshold.value.toFixed(2)},
  ignoreLocation: ${ignoreLocation.value},
  minMatchCharLength: ${minMatchCharLength.value},
  includeMatches: true,
});`;
});

function snippet(r: FuseResult<IndexedPdf>): string {
  return snippetHTMLFor(r, { contextChars: 120, matchKey: 'text' });
}

function resetDefaults(): void {
  threshold.value = DEFAULT_THRESHOLD;
  ignoreLocation.value = DEFAULT_IGNORE_LOCATION;
  minMatchCharLength.value = DEFAULT_MIN_MATCH_CHAR_LENGTH;
  searchTitle.value = true;
  searchText.value = true;
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

/* ============================================================
 * Tuner section — live Fuse.js options panel.
 * Mirrors the elevated-card treatment used for the Try It card.
 * ============================================================ */

.tune,
.why {
  margin-top: 3rem;
}

.tune__heading,
.why__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
  color: var(--text);
}

.tune__card,
.why__card {
  position: relative;
  padding: 2rem 1.5rem;
  background: #101015;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.02),
    0 8px 32px -16px rgba(0, 0, 0, 0.5);
}

.tune__card::before,
.why__card::before {
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

.tune__controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem 2rem;
  margin-bottom: 1.5rem;
}

.tune__control {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tune__control label,
.tune__group-label {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--text);
}

.tune__help {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.45;
}

/* Slider */
input[type='range'].tune__slider {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  height: 2rem;
  margin: 0;
}
input[type='range'].tune__slider::-webkit-slider-runnable-track {
  height: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
}
input[type='range'].tune__slider::-moz-range-track {
  height: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
}
input[type='range'].tune__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  margin-top: -7px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #a3e635;
  border: 2px solid #1a2e05;
  cursor: pointer;
}
input[type='range'].tune__slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #a3e635;
  border: 2px solid #1a2e05;
  cursor: pointer;
}
input[type='range'].tune__slider:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 4px;
}

/* Checkboxes */
.tune__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--text);
}
.tune__checkbox input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #a3e635;
  cursor: pointer;
  margin: 0;
}
.tune__checkbox input[type='checkbox']:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.tune__checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin-top: 0.1rem;
}

/* Number input */
input.tune__number {
  width: 5rem;
  height: 36px;
  padding: 0 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}
input.tune__number:hover {
  border-color: var(--border-strong);
}
input.tune__number:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}

/* Live config preview */
.tune__config {
  margin-top: 0.5rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
}
.tune__config-label {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tune__config pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-x: auto;
}
.tune__config pre code {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: inherit;
  color: inherit;
}

/* Reset button */
.tune__reset-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}
.tune__reset {
  padding: 0.55rem 1rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: var(--font-sans);
  font-size: 0.88rem;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background 150ms ease;
}
.tune__reset:hover {
  color: var(--text);
  border-color: var(--border-strong);
  background: var(--surface);
}
.tune__reset:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Why-Fuse card */
.why__card h3 {
  margin: 1.5rem 0 0.6rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}
.why__card h3:first-child {
  margin-top: 0;
}
.why__card p {
  margin: 0 0 0.85rem;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 65ch;
}
.why__card p:last-child {
  margin-bottom: 0;
}
.why__card ul {
  margin: 0.5rem 0 0.85rem;
  padding-left: 1.25rem;
  color: var(--text-muted);
  line-height: 1.65;
}
.why__card ul li {
  margin-bottom: 0.5rem;
}
.why__card ul li:last-child {
  margin-bottom: 0;
}
.why__card ul li strong {
  color: var(--text);
  font-weight: 600;
}
.why__card code {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.88em;
  color: var(--text);
}

@media (max-width: 640px) {
  .tune__card,
  .why__card {
    padding: 1.5rem 1rem;
    border-radius: 10px;
  }
  .tune__controls {
    grid-template-columns: 1fr;
    gap: 1.25rem;
  }
  .tune__heading,
  .why__heading {
    font-size: 1.25rem;
  }
}
</style>
