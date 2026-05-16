<template>
  <div class="search-and-tune">
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
            <template v-else-if="!results.length"
              >No matches for &ldquo;{{ query }}&rdquo;.</template
            >
            <template v-else
              >{{ results.length }} {{ results.length === 1 ? 'match' : 'matches' }}.</template
            >
          </p>
          <p v-if="useExtendedSearch" class="search__hint">
            Extended search is on. Try
            <code>=exact</code>, <code>!not</code>, <code>^prefix</code>, or <code>end$</code>.
            <a
              href="https://www.fusejs.io/examples.html#extended-search"
              target="_blank"
              rel="noopener noreferrer"
              >Reference &rarr;</a
            >
          </p>
        </div>

        <ul v-if="results.length" class="search__results">
          <li v-for="r in results.slice(0, 50)" :key="r.item.id" class="search__result">
            <a
              :href="viewerUrl(r)"
              target="_blank"
              rel="noopener noreferrer"
              class="search__result-link"
            >
              <h3 class="search__result-title">
                {{ r.item.title }}
                <span v-if="matchCount(r) > 1" class="search__result-matches"
                  >{{ matchCount(r) }} matches</span
                >
              </h3>
              <span v-if="includeScore && typeof r.score === 'number'" class="search__result-score"
                >Score: {{ r.score.toFixed(3) }}</span
              >
              <p v-if="snippet(r)" class="search__snippet" v-html="snippet(r)"></p>
              <span class="search__result-cta">
                <template v-if="query.trim()">Open &amp; highlight in viewer</template>
                <template v-else>Open PDF</template>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </section>

    <section class="tune" aria-labelledby="tune-heading">
      <h2 id="tune-heading" class="tune__heading">
        Tune Fuse.js, live
        <a
          href="https://github.com/krisk/Fuse/releases/tag/v7.4.0-beta.6"
          target="_blank"
          rel="noopener noreferrer"
          class="tune__version-pill"
          aria-label="View fuse.js v7.4.0-beta.6 release on GitHub"
          >v7.4.0-beta.6</a
        >
      </h2>
      <div class="tune__card">
        <!-- Match scoring -->
        <h3 class="tune__group-heading">Match scoring</h3>
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
            <p class="tune__help">0.0 = exact match · 1.0 = match almost anything</p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="tune-ignore-location">
              <input id="tune-ignore-location" v-model="ignoreLocation" type="checkbox" />
              <span>ignoreLocation</span>
            </label>
            <p class="tune__help">Search the entire field (recommended for long PDF text).</p>
          </div>

          <div class="tune__control" :class="{ 'tune__control--disabled': ignoreLocation }">
            <label for="tune-distance">distance: {{ distance }}</label>
            <input
              id="tune-distance"
              v-model.number="distance"
              type="number"
              min="0"
              max="10000"
              step="100"
              class="tune__number"
              :disabled="ignoreLocation"
            />
            <p class="tune__help">Search-window radius. Only matters when ignoreLocation is off.</p>
            <p v-if="ignoreLocation" class="tune__hint-disabled">
              Active only when ignoreLocation is off
            </p>
          </div>

          <div class="tune__control" :class="{ 'tune__control--disabled': ignoreLocation }">
            <label for="tune-location">location: {{ location }}</label>
            <input
              id="tune-location"
              v-model.number="location"
              type="number"
              min="0"
              max="10000"
              step="10"
              class="tune__number"
              :disabled="ignoreLocation"
            />
            <p class="tune__help">
              Where in the field to anchor the search. Only matters when ignoreLocation is off.
            </p>
            <p v-if="ignoreLocation" class="tune__hint-disabled">
              Active only when ignoreLocation is off
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
            <p class="tune__help">Drop matches shorter than this many characters.</p>
          </div>
        </div>

        <hr class="tune__divider" />

        <!-- Result behavior -->
        <h3 class="tune__group-heading">Result behavior</h3>
        <div class="tune__controls">
          <div class="tune__control">
            <label class="tune__checkbox" for="tune-case-sensitive">
              <input id="tune-case-sensitive" v-model="isCaseSensitive" type="checkbox" />
              <span>isCaseSensitive</span>
            </label>
            <p class="tune__help">Match the exact case of the query.</p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="tune-ignore-diacritics">
              <input id="tune-ignore-diacritics" v-model="ignoreDiacritics" type="checkbox" />
              <span>ignoreDiacritics <span class="tune__badge-new">new in 7.4</span></span>
            </label>
            <p class="tune__help">
              Strip accents before comparison (&ldquo;na&iuml;ve&rdquo; matches &ldquo;naive&rdquo;,
              &ldquo;caf&eacute;&rdquo; matches &ldquo;cafe&rdquo;). Useful for multilingual
              corpora.
            </p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="tune-include-score">
              <input id="tune-include-score" v-model="includeScore" type="checkbox" />
              <span>includeScore</span>
            </label>
            <p class="tune__help">
              Surface Fuse&rsquo;s 0&ndash;1 match score on each result. (0 is best.)
            </p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="tune-should-sort">
              <input id="tune-should-sort" v-model="shouldSort" type="checkbox" />
              <span>shouldSort</span>
            </label>
            <p class="tune__help">
              Sort results by relevance. Turn off to see Fuse&rsquo;s input-order output.
            </p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="tune-find-all">
              <input id="tune-find-all" v-model="findAllMatches" type="checkbox" />
              <span>findAllMatches</span>
            </label>
            <p class="tune__help">
              Don&rsquo;t stop at the first match per field. Slower; broader snippets.
            </p>
          </div>

          <div class="tune__control" :class="{ 'tune__control--disabled': useExtendedSearch }">
            <label class="tune__checkbox" for="tune-token-search">
              <input
                id="tune-token-search"
                v-model="tokenSearch"
                type="checkbox"
                :disabled="useExtendedSearch"
              />
              <span>tokenSearch</span>
            </label>
            <p class="tune__help">
              Split multi-word queries into tokens and merge matches per token. Improves recall for
              short queries like &ldquo;drug testing&rdquo; where either word alone is a useful hit.
              <a
                href="https://www.fusejs.io/token-search.html"
                target="_blank"
                rel="noopener noreferrer"
                >Reference &rarr;</a
              >
            </p>
            <p v-if="useExtendedSearch" class="tune__hint-disabled">
              Disabled when useExtendedSearch is on (extended already tokens with its own operators)
            </p>
          </div>
        </div>

        <hr class="tune__divider" />

        <!-- Advanced scoring -->
        <h3 class="tune__group-heading">Advanced scoring</h3>
        <div class="tune__controls">
          <div class="tune__control">
            <label class="tune__checkbox" for="tune-ignore-field-norm">
              <input id="tune-ignore-field-norm" v-model="ignoreFieldNorm" type="checkbox" />
              <span>ignoreFieldNorm</span>
            </label>
            <p class="tune__help">
              Don&rsquo;t penalize matches in long fields. Useful for body-heavy PDFs.
            </p>
          </div>

          <div class="tune__control">
            <label for="tune-field-norm-weight"
              >fieldNormWeight: {{ fieldNormWeight.toFixed(1) }}</label
            >
            <input
              id="tune-field-norm-weight"
              v-model.number="fieldNormWeight"
              type="range"
              min="0"
              max="2"
              step="0.1"
              class="tune__slider"
              :aria-valuenow="fieldNormWeight"
              aria-valuemin="0"
              aria-valuemax="2"
            />
            <p class="tune__help">How much field length penalizes the score. 0 = no penalty.</p>
          </div>
        </div>

        <hr class="tune__divider" />

        <!-- Extended syntax -->
        <h3 class="tune__group-heading">Extended syntax &amp; keys</h3>
        <div class="tune__controls">
          <div class="tune__control">
            <label class="tune__checkbox" for="tune-use-extended">
              <input id="tune-use-extended" v-model="useExtendedSearch" type="checkbox" />
              <span>useExtendedSearch</span>
            </label>
            <p class="tune__help">
              Enable Fuse extended syntax: <code>='exact</code>, <code>!not</code>,
              <code>^prefix</code>, <code>end$</code>.
              <a
                href="https://www.fusejs.io/examples.html#extended-search"
                target="_blank"
                rel="noopener noreferrer"
                >Reference &rarr;</a
              >
            </p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="tune-use-token-search">
              <input id="tune-use-token-search" v-model="useTokenSearch" type="checkbox" />
              <span>useTokenSearch <span class="tune__badge-new">new in 7.4</span></span>
            </label>
            <p class="tune__help">
              Fuse-native token search with TF-IDF scoring. Splits the query into tokens internally
              and ranks results by term-frequency &times; inverse-document-frequency &mdash; better
              relevance than our demo-side
              <code>tokenSearch</code> wrapper above for multi-word queries. Distinct from the
              wrapper: this is built into the Fuse runtime.
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
          <button type="button" class="tune__reset" @click="resetDefaults">
            Reset to defaults
          </button>
        </div>
      </div>
    </section>
  </div>

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
        familiarity and corpus size; for the 10-PDF demo you&rsquo;re looking at, Fuse and any of
        those are interchangeable.
      </p>
    </div>
  </section>

  <section class="index-inspect" aria-labelledby="index-inspect-heading">
    <h2 id="index-inspect-heading" class="index-inspect__heading">Inspect the search index</h2>
    <div class="index-card">
      <p class="index-card__intro">
        Curious how the package&rsquo;s output looks before it hits Fuse? This is the raw
        <code>IndexedPdf[]</code> array that ships as <code>/searchIndex.pdfs.json</code>. Each row
        carries the URL, title, full extracted text, page count, and a stable hash-derived id. Your
        search engine of choice consumes this same shape — Fuse here, MiniSearch / Orama / Lunr /
        Algolia / Typesense elsewhere.
      </p>
      <details class="index-details">
        <summary class="index-details__summary">
          <span class="index-details__chevron" aria-hidden="true"></span>
          Show the parsed search index
        </summary>
        <pre class="index-details__pre"><code>{{ indexDump }}</code></pre>
      </details>
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
const DEFAULTS = {
  threshold: 0.2,
  distance: 100,
  location: 0,
  ignoreLocation: true,
  minMatchCharLength: 2,
  isCaseSensitive: false,
  ignoreDiacritics: false, // New in fuse.js 7.4-beta — strip é→e, ñ→n, etc.
  includeScore: false,
  shouldSort: true,
  findAllMatches: true,
  ignoreFieldNorm: false,
  fieldNormWeight: 1.0,
  useExtendedSearch: false,
  useTokenSearch: false, // New in fuse.js 7.4-beta — native TF-IDF tokenization
  tokenSearch: true, // Demo-side wrapper (distinct from native useTokenSearch)
  searchTitle: true,
  searchText: true,
} as const;

const threshold = ref<number>(DEFAULTS.threshold);
const distance = ref<number>(DEFAULTS.distance);
const location = ref<number>(DEFAULTS.location);
const ignoreLocation = ref<boolean>(DEFAULTS.ignoreLocation);
const minMatchCharLength = ref<number>(DEFAULTS.minMatchCharLength);
const isCaseSensitive = ref<boolean>(DEFAULTS.isCaseSensitive);
const ignoreDiacritics = ref<boolean>(DEFAULTS.ignoreDiacritics);
const includeScore = ref<boolean>(DEFAULTS.includeScore);
const shouldSort = ref<boolean>(DEFAULTS.shouldSort);
const findAllMatches = ref<boolean>(DEFAULTS.findAllMatches);
const ignoreFieldNorm = ref<boolean>(DEFAULTS.ignoreFieldNorm);
const fieldNormWeight = ref<number>(DEFAULTS.fieldNormWeight);
const useExtendedSearch = ref<boolean>(DEFAULTS.useExtendedSearch);
const useTokenSearch = ref<boolean>(DEFAULTS.useTokenSearch);
const tokenSearch = ref<boolean>(DEFAULTS.tokenSearch);
const searchTitle = ref<boolean>(DEFAULTS.searchTitle);
const searchText = ref<boolean>(DEFAULTS.searchText);

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
    distance: distance.value,
    location: location.value,
    ignoreLocation: ignoreLocation.value,
    minMatchCharLength: minMatchCharLength.value,
    isCaseSensitive: isCaseSensitive.value,
    ignoreDiacritics: ignoreDiacritics.value,
    includeScore: includeScore.value,
    shouldSort: shouldSort.value,
    findAllMatches: findAllMatches.value,
    ignoreFieldNorm: ignoreFieldNorm.value,
    fieldNormWeight: fieldNormWeight.value,
    useExtendedSearch: useExtendedSearch.value,
    useTokenSearch: useTokenSearch.value,
    includeMatches: true,
  });
});

/**
 * Token-search wrapper — strategy described at
 * https://www.fusejs.io/token-search.html
 *
 * For multi-word queries (e.g. "drug testing"), splits on whitespace,
 * runs `fuse.search()` for each token, and merges per-item by best score.
 * Items that match more tokens rank higher; ties broken by score.
 *
 * Not a Fuse built-in — Fuse 7 expects a single query string. This is a
 * demo-side wrapper that consumers can copy. Kept off the core package so
 * core's surface stays minimal.
 *
 * Falls back to a single `fuse.search(query)` call when the query has
 * only one token, or when extended search is on (extended has its own
 * token operators).
 */
function tokenizeAndSearch(
  fuse: Fuse<IndexedPdf>,
  q: string,
  minMatch: number,
): FuseResult<IndexedPdf>[] {
  const tokens = q
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= minMatch);
  if (tokens.length <= 1) return fuse.search(q);

  const byId = new Map<string, { result: FuseResult<IndexedPdf>; tokenHits: number }>();
  for (const token of tokens) {
    const tokenResults = fuse.search(token);
    for (const r of tokenResults) {
      const id = r.item.id;
      const existing = byId.get(id);
      if (existing) {
        existing.tokenHits += 1;
        existing.result.score = Math.min(existing.result.score ?? 1, r.score ?? 1);
        existing.result.matches = [...(existing.result.matches ?? []), ...(r.matches ?? [])];
      } else {
        byId.set(id, { result: { ...r }, tokenHits: 1 });
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      if (b.tokenHits !== a.tokenHits) return b.tokenHits - a.tokenHits;
      return (a.result.score ?? 1) - (b.result.score ?? 1);
    })
    .map((entry) => entry.result);
}

const results = computed<FuseResult<IndexedPdf>[]>(() => {
  if (!fuseInstance.value || !query.value.trim() || !keysSelected.value) return [];
  if (tokenSearch.value && !useExtendedSearch.value) {
    return tokenizeAndSearch(fuseInstance.value, query.value, minMatchCharLength.value);
  }
  return fuseInstance.value.search(query.value);
});

const configSnippet = computed(() => {
  const keysLiteral = activeKeys.value.length ? `['${activeKeys.value.join("', '")}']` : '[]';
  const tokenSearchActive = tokenSearch.value && !useExtendedSearch.value;
  return `// fuse.js v7.4.0-beta.6
new Fuse(rows, {
  keys: ${keysLiteral},
  threshold: ${threshold.value.toFixed(2)},
  ignoreLocation: ${ignoreLocation.value},
  location: ${location.value},
  distance: ${distance.value},
  minMatchCharLength: ${minMatchCharLength.value},
  isCaseSensitive: ${isCaseSensitive.value},
  ignoreDiacritics: ${ignoreDiacritics.value}, // new in 7.4-beta
  includeScore: ${includeScore.value},
  shouldSort: ${shouldSort.value},
  findAllMatches: ${findAllMatches.value},
  ignoreFieldNorm: ${ignoreFieldNorm.value},
  fieldNormWeight: ${fieldNormWeight.value.toFixed(1)},
  useExtendedSearch: ${useExtendedSearch.value},
  useTokenSearch: ${useTokenSearch.value}, // new in 7.4-beta — native TF-IDF
  includeMatches: true,
});

// Demo-only: tokenSearch wrapper splits multi-word queries${tokenSearchActive ? ' (active)' : ' (off)'}.
// (Distinct from useTokenSearch above — the wrapper works in any Fuse version;
//  useTokenSearch is the 7.4-beta native implementation with TF-IDF scoring.)
// See https://www.fusejs.io/token-search.html`;
});

/**
 * Render the search index as pretty-printed JSON for the inspector card.
 *
 * The raw `text` field can be 50–150 KB of extracted PDF body per row,
 * which makes the rendered JSON unreadable — one row visually drowns out
 * the rest. Truncate to a short preview here AND tag the row with the
 * real character count so curious devs can see the full size without
 * scrolling through a wall of body text.
 *
 * Everything else (id, url, title, pages, extractedAt) renders as-is.
 */
const TEXT_PREVIEW_CHARS = 240;
const indexDump = computed(() => {
  const previews = rows.value.map((r) => {
    const full = r.text ?? '';
    if (full.length <= TEXT_PREVIEW_CHARS) return r;
    return {
      ...r,
      text: `${full.slice(0, TEXT_PREVIEW_CHARS)}… [truncated for display — full length: ${full.length.toLocaleString()} chars]`,
    };
  });
  return JSON.stringify(previews, null, 2);
});

type SpanTuple = readonly [number, number];

/**
 * Spatially distribute Fuse match indices across the source text so multiple
 * highlighted snippets surface from different parts of the document rather
 * than clustering around the densest region.
 *
 * Why: Fuse can return 100+ index pairs for a common term in a long PDF.
 * snippetHTMLFor's default picker takes the longest non-overlapping spans by
 * length, which biases toward whichever region of the doc happens to have
 * the longest contiguous matches. That makes a 50-page PDF feel like it
 * only matches once or twice in one corner. Bucketing by document position
 * forces coverage of intro / middle / end.
 *
 * Algorithm:
 *  1. Divide [0, sourceLength) into `maxBuckets` equal-width buckets.
 *  2. For each match index `[start, end]`, route it to `floor(start / bucketSize)`.
 *  3. Per bucket, keep the longest matching index (best signal for that region).
 *  4. Return surviving indices, sorted by start position so render order
 *     mirrors document order.
 */
function distributeMatchIndices(
  indices: readonly SpanTuple[],
  sourceLength: number,
  maxBuckets: number,
): SpanTuple[] {
  if (indices.length <= maxBuckets || sourceLength <= 0) {
    return [...indices].sort((a, b) => a[0] - b[0]);
  }
  const bucketSize = sourceLength / maxBuckets;
  const buckets: (SpanTuple | null)[] = Array.from({ length: maxBuckets }, () => null);
  for (const idx of indices) {
    const bucketIdx = Math.min(maxBuckets - 1, Math.floor(idx[0] / bucketSize));
    const current = buckets[bucketIdx];
    if (!current || idx[1] - idx[0] > current[1] - current[0]) {
      buckets[bucketIdx] = idx;
    }
  }
  return buckets.filter((b): b is SpanTuple => b !== null).sort((a, b) => a[0] - b[0]);
}

/**
 * Replace each `matches[*].indices` array (for the `text` key) with a
 * spatially-distributed subset so snippetHTMLFor can surface highlights from
 * across the document, not just the densest cluster. See
 * `distributeMatchIndices` for the bucketing strategy.
 */
function distributeMatches(r: FuseResult<IndexedPdf>, maxBuckets: number): FuseResult<IndexedPdf> {
  const sourceLength = r.item.text?.length ?? 0;
  const newMatches = (r.matches ?? []).map((m) => {
    if (m.key !== 'text' || !m.indices?.length) return m;
    return {
      ...m,
      indices: distributeMatchIndices(m.indices as readonly SpanTuple[], sourceLength, maxBuckets),
    };
  });
  return { ...r, matches: newMatches };
}

function snippet(r: FuseResult<IndexedPdf>): string {
  // Pre-distribute the match indices across document regions before the
  // snippet picker runs. Otherwise, for a term that hits 100+ times in one
  // dense cluster, the picker would render every snippet from the same
  // corner of the PDF. Bucketing forces coverage across intro/middle/end so
  // the rendered passages reflect the true spread of matches.
  const distributed = distributeMatches(r, 8);
  return snippetHTMLFor(distributed, { contextChars: 100, matchKey: 'text', maxSnippets: 8 });
}

/**
 * Total number of body-text match spans across this result. Used to surface
 * "12 matches in this PDF" so the user sees the full hit count even when the
 * rendered snippet only shows the top N. Counts indices from every match
 * entry on `text` key; ignores title-key matches.
 */
function matchCount(r: FuseResult<IndexedPdf>): number {
  const textMatches = (r.matches ?? []).filter((m) => m.key === 'text');
  return textMatches.reduce((sum, m) => sum + (m.indices?.length ?? 0), 0);
}

function resetDefaults(): void {
  threshold.value = DEFAULTS.threshold;
  distance.value = DEFAULTS.distance;
  location.value = DEFAULTS.location;
  ignoreLocation.value = DEFAULTS.ignoreLocation;
  minMatchCharLength.value = DEFAULTS.minMatchCharLength;
  isCaseSensitive.value = DEFAULTS.isCaseSensitive;
  ignoreDiacritics.value = DEFAULTS.ignoreDiacritics;
  includeScore.value = DEFAULTS.includeScore;
  shouldSort.value = DEFAULTS.shouldSort;
  findAllMatches.value = DEFAULTS.findAllMatches;
  ignoreFieldNorm.value = DEFAULTS.ignoreFieldNorm;
  fieldNormWeight.value = DEFAULTS.fieldNormWeight;
  useExtendedSearch.value = DEFAULTS.useExtendedSearch;
  useTokenSearch.value = DEFAULTS.useTokenSearch;
  tokenSearch.value = DEFAULTS.tokenSearch;
  searchTitle.value = DEFAULTS.searchTitle;
  searchText.value = DEFAULTS.searchText;
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

/**
 * Resolve the link target for a result card.
 *
 * When the user has typed a query, route through the bundled Mozilla pdf.js
 * viewer at /pdfjs-viewer/web/viewer.html and append `#search=<query>`. The
 * viewer reads that fragment on load, pre-fills its find bar, jumps to the
 * first match, and highlights every occurrence — the same behaviour Firefox
 * gives natively but reliably across Chromium and WebKit too.
 *
 * When the query is empty we skip the viewer and link the PDF directly so the
 * browser's native viewer (PDFium / WebKit) can render it without the extra
 * ~1.5–2 MB of viewer assets.
 *
 * URL encoding: the viewer's `?file=` is read via `URLSearchParams`, which
 * already URL-decodes the value once before the viewer's JS sees it. So we
 * must encode exactly *one* level: pass `/pdfs/Foo%20Bar.pdf` as the param
 * value (single-encoded). Using `encodeURIComponent` on `publicPdfUrl()` ’s
 * output yields `%2520` and the viewer 404s; concatenating raw also breaks
 * for basenames containing `&`/`?`/`#`. Build the path from a single
 * `encodeURIComponent(basename)` instead.
 *
 * NOTE on Fuse vs viewer semantics: Fuse's fuzzy matching can yield a result
 * (e.g. "applicent" → "applicant portal") that the viewer's literal substring
 * search won't highlight. The PDF still opens; the user can correct the term
 * in the viewer's find bar. Documented in this demo's README.
 */
function viewerUrl(r: FuseResult<IndexedPdf>): string {
  const pdf = publicPdfUrl(r.item.url);
  const q = query.value.trim();
  if (!q) return pdf;
  // `pdf` is already single-encoded (`/pdfs/Foo%20Bar.pdf`). That's what the
  // viewer's URLSearchParams will decode back to `/pdfs/Foo Bar.pdf`, which
  // it then fetches. Embedding it raw is correct here.
  return `/pdfjs-viewer/web/viewer.html?file=${pdf}#search=${encodeURIComponent(q)}`;
}

onMounted(async () => {
  const res = await fetch('/searchIndex.pdfs.json');
  rows.value = (await res.json()) as IndexedPdf[];
  loaded.value = true;
});
</script>

<style scoped>
/*
 * Two-column wrapper for the Try It + Tune Fuse.js sections.
 *
 * On wide viewports (≥1024px) the two cards sit side-by-side so users can
 * adjust tuner controls in the right column and watch the search results
 * update live in the left column. The Try It card's `position: sticky`
 * search bar keeps the input pinned to the viewport top while scrolling
 * through tuner options, so the query input never disappears mid-tune.
 *
 * Below 1024px, the wrapper falls back to a single-column stack so the
 * tuner card doesn't get squeezed below readable width. `align-items: start`
 * lets each column take its own natural height — the search column is
 * usually shorter than the tuner.
 */
.search-and-tune {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-top: 2rem;
}

@media (min-width: 1024px) {
  .search-and-tune {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: start;
  }
}

.search {
  margin-top: 0;
}

/*
 * When side-by-side, each tuner column is ~580px wide — not enough room
 * for the inner 2-column control grid to breathe. Collapse to one column
 * so labels + help text + inputs each get full width within the card.
 */
@media (min-width: 1024px) {
  .search-and-tune .tune__controls {
    grid-template-columns: 1fr;
  }
}

/*
 * `.tune` and `.search` would otherwise add a top margin to the section,
 * which doubles up with the grid `gap`. Zero out the section-level margins
 * inside the grid wrapper.
 */
.search-and-tune > .search,
.search-and-tune > .tune {
  margin-top: 0;
}

.search__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
  color: var(--text);
}

/*
 * The Try It card is the primary call-to-action on the page — anchor it
 * visually with a noticeably higher elevation than the surrounding Tune
 * and Why-Fuse cards. Three reinforcing signals:
 *   1. Lighter surface (#1c1c26 vs page #0a0a0c) — a real step up
 *   2. Stronger border (--border-strong instead of --border)
 *   3. A more prominent lime accent strip + subtle lime glow ring
 */
.search__card {
  position: relative;
  padding: 2rem 1.5rem;
  /*
   * Layered background: faint lime wash (top to ~70%) over the same deep
   * neutral surface used elsewhere. Reinforces "this is the interactive
   * section" without enough saturation to clash with the lime <mark>
   * highlights in the result snippets below. The wash alpha is ~0.045 so
   * over #1c1c26 the resulting top edge sits well inside imperceptible
   * range for non-large text contrast — the badge ("N matches") and other
   * interior text still pass WCAG AA against the practically-unchanged
   * surface color.
   */
  background:
    linear-gradient(180deg, rgba(163, 230, 53, 0.045) 0%, rgba(163, 230, 53, 0) 70%), #1c1c26;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(163, 230, 53, 0.12),
    0 0 50px -22px rgba(163, 230, 53, 0.22),
    0 18px 48px -20px rgba(0, 0, 0, 0.6);
}

/* Prominent lime accent strip along the top edge — primary visual anchor. */
.search__card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(163, 230, 53, 0.4) 15%,
    rgba(163, 230, 53, 0.95) 50%,
    rgba(163, 230, 53, 0.4) 85%,
    transparent 100%
  );
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  opacity: 1;
}

.search__bar {
  position: sticky;
  top: 0;
  z-index: 10;
  margin: -2rem -1.5rem 0;
  padding: 1.25rem 1.5rem 1.25rem;
  background: color-mix(in srgb, #1c1c26 92%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-strong);
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

.search__hint {
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.search__hint code {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0.05em 0.35em;
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--text);
}

.search__hint a {
  color: var(--accent);
  text-decoration: underline;
}

.search__hint a:hover,
.search__hint a:focus-visible {
  text-decoration: none;
  outline: none;
}

.search__hint a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
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
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.search__result-matches {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.55rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #a3e635;
  background: rgba(163, 230, 53, 0.1);
  border: 1px solid rgba(163, 230, 53, 0.3);
  border-radius: 4px;
}

.search__result-score {
  display: inline-block;
  margin: 0 0 0.5rem;
  padding: 0.1em 0.4em;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-muted);
}

.search__snippet {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--text-muted);
  /*
   * Now that findAllMatches defaults to true and maxSnippets is 8, a single
   * card can carry 8 distinct passages. Removing the line-clamp lets the
   * card grow with the matches — the visual height itself becomes a signal
   * for "this PDF is a strong hit" relative to one-snippet cards.
   */
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
.why,
.index-inspect {
  margin-top: 3rem;
}

.tune__heading,
.why__heading,
.index-inspect__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Pinned-version pill next to the "Tune Fuse.js, live" heading. Tells the
 * reader exactly which Fuse build the live tuner is exercising — clickable,
 * opens the release notes on GitHub. Monospace + slightly muted so it reads
 * as metadata rather than a primary visual element. */
.tune__version-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  text-decoration: none;
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background 150ms ease;
}
.tune__version-pill:hover {
  color: var(--text);
  background: var(--surface-hover);
  border-color: var(--border-strong);
  text-decoration: none;
}
.tune__version-pill:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* "new in 7.4" badge attached to specific tuner options. Lime-tinted to tie
 * into the demo's accent without shouting. Plain text — not a link. */
.tune__badge-new {
  display: inline-flex;
  align-items: center;
  margin-left: 0.4em;
  padding: 0.08rem 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #a3e635;
  background: rgba(163, 230, 53, 0.1);
  border: 1px solid rgba(163, 230, 53, 0.32);
  border-radius: 3px;
  white-space: nowrap;
}

.tune__card,
.why__card,
.index-card {
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
.why__card::before,
.index-card::before {
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

.tune__group-heading {
  margin: 0 0 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  font-family: var(--font-sans);
}

.tune__group-heading:not(:first-child) {
  margin-top: 0.25rem;
}

.tune__divider {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 1.5rem 0;
  opacity: 0.6;
}

.tune__controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem 2rem;
  margin-bottom: 0.25rem;
}

.tune__control {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

/*
 * Disabled-state opacity is bounded by WCAG 1.4.3 contrast (4.5:1 for body
 * text on the #101015 card surface). At --text-muted (#a0a0aa) the raw
 * contrast is ~7.3:1; multiplying by opacity 0.85 lands at ~5.0:1 — still
 * comfortably AA. The italic "Active only when ignoreLocation is off" hint
 * carries the primary disabled cue; the opacity is just visual reinforcement.
 */
.tune__control--disabled {
  opacity: 0.85;
  cursor: not-allowed;
}

.tune__control--disabled label,
.tune__control--disabled input {
  cursor: not-allowed;
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

.tune__help code {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0.05em 0.35em;
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--text);
}

.tune__help a {
  color: var(--accent);
  text-decoration: underline;
}
.tune__help a:hover,
.tune__help a:focus-visible {
  text-decoration: none;
  outline: none;
}
.tune__help a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.tune__hint-disabled {
  margin: 0;
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text-muted);
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
  width: 6rem;
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
input.tune__number:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Live config preview */
.tune__config {
  margin-top: 1.25rem;
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

/* ============================================================
 * Index inspect card — expandable JSON preview of the raw index.
 * Uses native <details> for accessibility + zero-JS toggle.
 * ============================================================ */

.index-card {
  padding: 1.5rem;
}

.index-card__intro {
  margin: 0 0 1rem;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 75ch;
}

.index-card__intro code {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-family: var(--font-mono);
  font-size: 0.88em;
  color: var(--text);
}

.index-details {
  /* Suppress the default UA disclosure triangle */
  list-style: none;
}

.index-details__summary {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.95rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: var(--font-sans);
  font-size: 0.88rem;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  list-style: none;
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background 150ms ease;
}

.index-details__summary::-webkit-details-marker {
  display: none;
}

.index-details__summary::marker {
  content: '';
}

.index-details__summary:hover {
  color: var(--text);
  border-color: var(--border-strong);
  background: var(--surface);
}

.index-details__summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.index-details__chevron {
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 5px solid currentColor;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transition: transform 150ms ease;
}

.index-details[open] > .index-details__summary .index-details__chevron {
  transform: rotate(90deg);
}

.index-details__pre {
  margin: 1rem 0 0;
  padding: 1rem 1.25rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text);
  max-height: 480px;
  overflow-y: auto;
  overflow-x: auto;
}

.index-details__pre code {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: inherit;
  color: inherit;
  /*
   * pre-wrap preserves the JSON's structural newlines (object/array on
   * separate lines, indentation, etc.) AND wraps any single long line
   * to fit the container — important because PDF body text values can
   * be tens of KB on one logical line. With plain `pre`, the inspector
   * collapses to a horizontally-scrolling wall of text.
   */
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 640px) {
  .tune__card,
  .why__card,
  .index-card {
    padding: 1.5rem 1rem;
    border-radius: 10px;
  }
  .index-card {
    padding: 1.25rem 1rem;
  }
  .tune__controls {
    grid-template-columns: 1fr;
    gap: 1.25rem;
  }
  .tune__heading,
  .why__heading,
  .index-inspect__heading {
    font-size: 1.25rem;
  }
  .index-details__pre {
    max-height: 360px;
    font-size: 0.72rem;
  }
}
</style>
