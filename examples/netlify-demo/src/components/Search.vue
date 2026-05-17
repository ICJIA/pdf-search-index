<template>
  <div class="search-and-tune">
    <section class="search" aria-labelledby="search-heading">
      <h2 id="search-heading" class="search__heading">Try it</h2>
      <div class="search__card">
        <!--
          v1.4: engine toggle. Switches between Fuse.js (default, < 2.5K
          docs), FlexSearch (2.5-10K docs), and Pagefind (10K+ docs).
          Each engine has its own search function + stats panel below.
          See the "Why this is shipped" callout under the corpus list
          for the per-engine config + index inspector.
        -->
        <div class="search__engines" role="tablist" aria-label="Choose search engine">
          <button
            v-for="opt in engineOptions"
            :key="opt.value"
            role="tab"
            :aria-selected="engine === opt.value"
            :class="['search__engine', { 'search__engine--active': engine === opt.value }]"
            @click="engine = opt.value"
          >
            <span class="search__engine-name">{{ opt.label }}</span>
            <span class="search__engine-range">{{ opt.range }}</span>
          </button>
        </div>

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
          <div v-if="loaded" class="search__stats">
            <span class="search__stat">
              <span class="search__stat-label">Engine:</span>
              <span class="search__stat-value">{{ engineLabel }}</span>
            </span>
            <span v-if="engineStats.indexBuildMs !== null" class="search__stat">
              <span class="search__stat-label">Index build:</span>
              <span class="search__stat-value">{{ engineStats.indexBuildMs.toFixed(1) }} ms</span>
            </span>
            <span v-if="engineStats.lastQueryMs !== null" class="search__stat">
              <span class="search__stat-label">Last query:</span>
              <span class="search__stat-value">{{ engineStats.lastQueryMs.toFixed(2) }} ms</span>
            </span>
            <span v-if="engineStats.indexSizeBytes !== null" class="search__stat">
              <span class="search__stat-label">Index size:</span>
              <span class="search__stat-value">{{ formatBytes(engineStats.indexSizeBytes) }}</span>
            </span>
          </div>
          <p class="search__meta" aria-live="polite">
            <template v-if="!loaded">Loading search index…</template>
            <template v-else-if="engine === 'fuse' && !keysSelected"
              >Select at least one key (title or text) to enable search.</template
            >
            <template v-else-if="!query.trim()"
              >Type above to search across {{ rows.length }} documents.</template
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

        <!--
          Corpus list — visible when the user hasn't started searching yet.
          Shows the full document set with per-format chips so users can see
          at a glance that the index covers mixed formats. Each entry links
          directly to the file (or to the bundled pdf.js viewer for PDFs)
          using the same `resultLink` helper as the search results below.
        -->
        <section
          v-if="loaded && !query.trim() && rows.length"
          class="corpus"
          aria-labelledby="corpus-heading"
        >
          <h3 id="corpus-heading" class="corpus__heading">
            Files in this corpus
            <span class="corpus__count">{{ rows.length }} documents</span>
          </h3>
          <ul class="corpus__list">
            <li v-for="row in sortedCorpus" :key="row.id" class="corpus__item">
              <a
                :href="corpusLink(row)"
                target="_blank"
                rel="noopener noreferrer"
                class="corpus__link"
              >
                <span
                  class="search__result-format"
                  :class="`search__result-format--${(row.format ?? 'pdf').toLowerCase()}`"
                  :aria-label="`Format: ${(row.format ?? 'pdf').toUpperCase()}`"
                  >{{ (row.format ?? 'pdf').toUpperCase() }}</span
                >
                <span class="corpus__title">{{ row.title }}</span>
              </a>
            </li>
          </ul>
        </section>

        <ul v-if="results.length" class="search__results">
          <li v-for="r in results.slice(0, 50)" :key="r.id" class="search__result">
            <a
              :href="resultLinkForRow(r.item)"
              target="_blank"
              rel="noopener noreferrer"
              class="search__result-link"
            >
              <h3 class="search__result-title">
                <span
                  class="search__result-format"
                  :class="`search__result-format--${(r.item.format ?? 'pdf').toLowerCase()}`"
                  :aria-label="`Format: ${(r.item.format ?? 'pdf').toUpperCase()}`"
                  >{{ (r.item.format ?? 'pdf').toUpperCase() }}</span
                >
                {{ r.item.title }}
                <span v-if="r.matchCount > 1" class="search__result-matches"
                  >{{ r.matchCount }} matches</span
                >
              </h3>
              <span v-if="includeScore && typeof r.score === 'number'" class="search__result-score"
                >Score: {{ r.score.toFixed(3) }}</span
              >
              <p v-if="r.snippetHtml" class="search__snippet" v-html="r.snippetHtml"></p>
              <span class="search__result-cta">
                <template v-if="r.item.format === 'pdf' && query.trim()"
                  >Open &amp; highlight in viewer</template
                >
                <template v-else-if="r.item.format === 'pdf'">Open PDF</template>
                <template v-else>Open {{ (r.item.format ?? 'document').toUpperCase() }}</template>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </section>

    <section class="tune" aria-labelledby="tune-heading">
      <h2 id="tune-heading" class="tune__heading">
        {{ tuneHeading }}
        <a
          :href="tuneVersionPill.href"
          target="_blank"
          rel="noopener noreferrer"
          class="tune__version-pill"
          :aria-label="tuneVersionPill.ariaLabel"
          >{{ tuneVersionPill.label }}</a
        >
      </h2>
      <div v-if="engine === 'fuse'" class="tune__card">
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

      <!--
        v1.4: FlexSearch tune card. FlexSearch's Document index is
        configured at construction — any change here forces a full
        index rebuild via the watcher in <script>. Five tunables:
        tokenize, encode, resolution, optimize, cache. Two field
        toggles for the "Search in" group (title / text).
      -->
      <div v-else-if="engine === 'flexsearch'" class="tune__card">
        <h3 class="tune__group-heading">Index encoding</h3>
        <div class="tune__controls">
          <div class="tune__control">
            <label for="flex-tokenize">tokenize</label>
            <select id="flex-tokenize" v-model="flexTokenize" class="tune__select">
              <option value="strict">strict (whole word)</option>
              <option value="forward">forward (prefix-friendly)</option>
              <option value="reverse">reverse (suffix-friendly)</option>
              <option value="full">full (every substring)</option>
            </select>
            <p class="tune__help">
              How each field is split into searchable tokens. <code>forward</code> is the typeahead
              sweet spot; <code>full</code> indexes every substring (≈4× index size).
            </p>
          </div>

          <div class="tune__control">
            <label for="flex-encode">encode</label>
            <select id="flex-encode" v-model="flexEncode" class="tune__select">
              <option value="icase">icase (ASCII case-fold)</option>
              <option value="simple">simple (icase + light fold)</option>
              <option value="advanced">advanced (phonetic-ish)</option>
              <option value="extra">extra (heavy phonetic)</option>
            </select>
            <p class="tune__help">
              Top-level normalization. <code>advanced</code> handles "fone"→"phone";
              <code>extra</code> is heaviest and slowest to build.
            </p>
          </div>

          <div class="tune__control">
            <label for="flex-resolution">resolution: {{ flexResolution }}</label>
            <input
              id="flex-resolution"
              v-model.number="flexResolution"
              type="range"
              min="1"
              max="9"
              step="1"
              class="tune__slider"
              :aria-valuenow="flexResolution"
              aria-valuemin="1"
              aria-valuemax="9"
            />
            <p class="tune__help">
              Per-field scoring resolution. Higher = finer ranking, bigger index. Default 9.
            </p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="flex-optimize">
              <input id="flex-optimize" v-model="flexOptimize" type="checkbox" />
              <span>optimize</span>
            </label>
            <p class="tune__help">
              Drop less-useful index keys for smaller memory at the cost of recall on rare queries.
            </p>
          </div>

          <div class="tune__control">
            <label class="tune__checkbox" for="flex-cache">
              <input id="flex-cache" v-model="flexCache" type="checkbox" />
              <span>cache</span>
            </label>
            <p class="tune__help">
              Cache recent query results inside FlexSearch — useful for typeahead UIs where the same
              prefix gets queried character-by-character.
            </p>
          </div>
        </div>

        <hr class="tune__divider" />

        <h3 class="tune__group-heading">Indexed fields</h3>
        <div class="tune__controls">
          <div class="tune__control">
            <span class="tune__group-label" id="flex-keys-label">Search in:</span>
            <div class="tune__checkbox-group" role="group" aria-labelledby="flex-keys-label">
              <label class="tune__checkbox" for="flex-key-title">
                <input id="flex-key-title" v-model="flexSearchTitle" type="checkbox" />
                <span>title</span>
              </label>
              <label class="tune__checkbox" for="flex-key-text">
                <input id="flex-key-text" v-model="flexSearchText" type="checkbox" />
                <span>text</span>
              </label>
            </div>
            <p class="tune__help">
              Toggle which fields go into FlexSearch&rsquo;s document index. Both fields use the
              same tokenize / resolution / optimize settings above. Disabling both yields an empty
              index.
            </p>
          </div>
        </div>

        <div class="tune__config" aria-label="Current FlexSearch configuration">
          <p class="tune__config-label">Current config</p>
          <pre><code>{{ configSnippet }}</code></pre>
        </div>

        <div class="tune__reset-row">
          <button type="button" class="tune__reset" @click="resetDefaults">
            Reset to defaults
          </button>
        </div>
      </div>

      <!--
        v1.4: Pagefind tune card. Most Pagefind config is build-time —
        chunked index emitted via `npx pagefind --site dist`. Runtime
        surface is small: excerptLength (words around match) and four
        BM25-style ranking knobs. `.options({...})` applies live.
      -->
      <div v-else class="tune__card">
        <aside class="tune__pagefind-note">
          <strong>Most Pagefind tuning is build-time.</strong> The chunked index is emitted by
          <code>npx pagefind --site dist</code> at build, and its scoring is driven by
          <code>data-pagefind-weight</code>, <code>data-pagefind-filter</code>, and
          <code>data-pagefind-sort</code> attributes on the source HTML. Below are the few
          parameters that <em>are</em> tunable at runtime via <code>pagefind.options(...)</code>.
        </aside>

        <h3 class="tune__group-heading">Excerpt</h3>
        <div class="tune__controls">
          <div class="tune__control">
            <label for="pf-excerpt-length">excerptLength: {{ pagefindExcerptLength }} words</label>
            <input
              id="pf-excerpt-length"
              v-model.number="pagefindExcerptLength"
              type="range"
              min="10"
              max="100"
              step="5"
              class="tune__slider"
              :aria-valuenow="pagefindExcerptLength"
              aria-valuemin="10"
              aria-valuemax="100"
            />
            <p class="tune__help">
              How many words Pagefind returns around the match in <code>data().excerpt</code>.
            </p>
          </div>
        </div>

        <hr class="tune__divider" />

        <h3 class="tune__group-heading">Ranking (BM25-style)</h3>
        <div class="tune__controls">
          <div class="tune__control">
            <label for="pf-term-frequency"
              >termFrequency: {{ pagefindTermFrequency.toFixed(2) }}</label
            >
            <input
              id="pf-term-frequency"
              v-model.number="pagefindTermFrequency"
              type="range"
              min="0"
              max="2"
              step="0.05"
              class="tune__slider"
              :aria-valuenow="pagefindTermFrequency"
              aria-valuemin="0"
              aria-valuemax="2"
            />
            <p class="tune__help">
              BM25 <code>k1</code>. Lower = repeated terms add less; higher = repetition matters
              more. Default 1.0.
            </p>
          </div>

          <div class="tune__control">
            <label for="pf-page-length">pageLength: {{ pagefindPageLength.toFixed(2) }}</label>
            <input
              id="pf-page-length"
              v-model.number="pagefindPageLength"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="tune__slider"
              :aria-valuenow="pagefindPageLength"
              aria-valuemin="0"
              aria-valuemax="1"
            />
            <p class="tune__help">
              BM25 <code>b</code>. How much document length penalizes the score. Default 0.75.
            </p>
          </div>

          <div class="tune__control">
            <label for="pf-term-similarity"
              >termSimilarity: {{ pagefindTermSimilarity.toFixed(2) }}</label
            >
            <input
              id="pf-term-similarity"
              v-model.number="pagefindTermSimilarity"
              type="range"
              min="0"
              max="2"
              step="0.05"
              class="tune__slider"
              :aria-valuenow="pagefindTermSimilarity"
              aria-valuemin="0"
              aria-valuemax="2"
            />
            <p class="tune__help">
              How aggressively Pagefind matches near-but-not-exact terms (typo / stem tolerance).
            </p>
          </div>

          <div class="tune__control">
            <label for="pf-term-saturation"
              >termSaturation: {{ pagefindTermSaturation.toFixed(2) }}</label
            >
            <input
              id="pf-term-saturation"
              v-model.number="pagefindTermSaturation"
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              class="tune__slider"
              :aria-valuenow="pagefindTermSaturation"
              aria-valuemin="0.5"
              aria-valuemax="2"
            />
            <p class="tune__help">
              Diminishing returns on repeated terms. Higher = less penalty for repetition.
            </p>
          </div>
        </div>

        <div class="tune__config" aria-label="Current Pagefind configuration">
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

  <section class="why" aria-labelledby="why-engine-heading">
    <h2 id="why-engine-heading" class="why__heading">{{ whyHeading }}</h2>
    <div class="why__card">
      <!--
        Scale disclaimer — always visible, regardless of selected engine.
        Reinforces the headline point: the package is framework-agnostic;
        the binding constraint is corpus size, not the engine you pick.
      -->
      <aside class="why__disclaimer">
        <strong
          >This package emits plain JSON. Any client-side search engine can consume it.</strong
        >
        That includes Fuse, FlexSearch, Pagefind, MiniSearch, Orama, Lunr, and managed services like
        Algolia / Typesense / MeiliSearch.
        <strong
          >The constraint isn&rsquo;t which framework you use — it&rsquo;s how many documents you
          need to search.</strong
        >
        <br /><br />
        This demo&rsquo;s corpus is 14 documents (10 PDFs + 3 DOCX + 1 XLSX). At that size all three
        engines return results in well under 10&nbsp;ms and feel identical. The toggle below shows
        that the package&rsquo;s output works equally well with any of them — same rows, similar
        results, slightly different highlighting. <strong>In production</strong>, Fuse starts to
        slow down past ~2,500 docs (in-memory full-index load); FlexSearch handles 2,500 – 10,000
        with sub-millisecond queries (denser encoded index); Pagefind scales past five-figure
        corpora because it loads index chunks on demand (only ~5-20 KB per query regardless of total
        corpus). Pick by document count and per-query latency budget; the package doesn&rsquo;t care
        which one you pick.
      </aside>

      <!--
        Compact 3-engine pros/cons table — always visible. Lets demo
        visitors compare fuzzy support, config approach, and tradeoff
        at a glance before reading the per-engine deep-dive below.
      -->
      <div class="why__compare-wrap">
        <table class="why__compare">
          <thead>
            <tr>
              <th scope="col">Engine</th>
              <th scope="col">Fuzzy</th>
              <th scope="col">Pros</th>
              <th scope="col">Cons</th>
              <th scope="col">Production sweet spot</th>
            </tr>
          </thead>
          <tbody>
            <tr :class="{ 'why__compare-row--active': engine === 'fuse' }">
              <th scope="row">Fuse.js</th>
              <td><span class="why__yes">Yes</span> (Bitap; <code>threshold: 0.0 – 1.0</code>)</td>
              <td>
                Smallest API. Best typo tolerance. Native match-position output drives our snippet
                highlighting. Built-in <code>FuseWorker</code> in 7.4.0-beta.6+.
              </td>
              <td>
                In-memory; full index loaded up-front. Build cost grows with corpus. Slows down past
                ~2,500 documents.
              </td>
              <td>&lt; 2,500 documents</td>
            </tr>
            <tr :class="{ 'why__compare-row--active': engine === 'flexsearch' }">
              <th scope="row">FlexSearch</th>
              <td>
                <span class="why__partial">Partial</span> (n-gram via <code>tolerant: true</code>;
                needs tuning)
              </td>
              <td>
                Sub-millisecond queries on 10K+ docs. Encoded index format (denser than JSON).
                Built-in <code>WorkerIndex</code>.
              </td>
              <td>
                Loses Fuse&rsquo;s typo tolerance default. No native match positions — we ship
                <code>snippetHTMLForFlexMatch</code> for substring-based highlight.
              </td>
              <td>2,500 – 10,000 documents</td>
            </tr>
            <tr :class="{ 'why__compare-row--active': engine === 'pagefind' }">
              <th scope="row">Pagefind</th>
              <td><span class="why__no">No</span> (substring + word-boundary; no fuzzy mode)</td>
              <td>
                Chunked on-demand index — only engine that scales past five-figure corpora without
                paying full-index download on first load. Returns pre-highlighted excerpts.
              </td>
              <td>
                Crawls HTML pages, not JSON — needs a build step that emits one HTML per document.
                No fuzzy matching at all.
              </td>
              <td>10,000+ documents</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Fuse.js -->
      <template v-if="engine === 'fuse'">
        <h3>Why Fuse.js is the default here</h3>
        <p>
          Fuse.js is the right default for this package because the whole point — PDFs become search
          rows alongside your page text — assumes you already have a Fuse setup. The R3 reference
          site that motivated this package was Fuse-based; ICJIA&rsquo;s Astro and Nuxt sites are
          Fuse-based; the spec calls Fuse out as the bullseye consumer.
        </p>
        <p>Beyond that genealogy, Fuse fits the constraints:</p>
        <ul>
          <li>
            <strong>Pure client-side.</strong> The whole library is ~12 KB gzipped and runs in the
            browser. No API, no server, no database — the index ships as static JSON and Fuse loads
            it from the page. That&rsquo;s the same shape this package delivers, so they pair
            without ceremony.
          </li>
          <li>
            <strong>Fuzzy matching tolerates typos.</strong> PDF text from <code>pdf.js</code> has
            its own quirks — extra whitespace, line breaks across columns, the occasional OCR-like
            artifact. A user typing &ldquo;applicent&rdquo; should still find
            &ldquo;applicant&rdquo;; Fuse&rsquo;s bitap algorithm handles that with the threshold
            slider above.
          </li>
          <li>
            <strong>Sensible defaults work.</strong> Three lines of code produces a usable index.
            The tuner above covers ~90% of real configuration needs.
          </li>
          <li>
            <strong>Mature and stable.</strong> v7.x has been the API surface for years. No churn,
            no breaking releases mid-deploy.
          </li>
        </ul>
        <h4 class="why__code-heading">How to implement</h4>
        <pre
          class="why__code"
        ><code>// Build-time (Node): index your PDFs into IndexedDocument[] rows
import { indexDocuments } from '@icjia/pdf-search-index';

const rows = await indexDocuments([
  'https://site.com/report.pdf',
  'https://site.com/policy.docx',
]);
// Write rows to public/searchIndex.json (your build step)


// Runtime (browser):
import Fuse from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';

const rows = await fetch('/searchIndex.json').then(r =&gt; r.json());
const fuse = new Fuse(rows, {
  keys: ['title', 'text'],
  threshold: 0.2,
  includeMatches: true,
});

const results = fuse.search('stigma');
for (const r of results) {
  console.log(r.item.title, snippetHTMLFor(r));
}


// Optional v1.2+: build a prebuilt index to skip the in-browser
// Fuse.createIndex() cost (~10s → ~200ms at 2K rows):
import { serializeFuseIndex } from '@icjia/pdf-search-index/fuse';
const indexJson = serializeFuseIndex(rows);
// Write indexJson alongside the rows JSON.

// Then at runtime:
const fuseIndex = Fuse.parseIndex(await fetch('/searchIndex.fuse-index.json').then(r =&gt; r.json()));
const fuse = new Fuse(rows, options, fuseIndex);


// Optional v1.2+: off-main-thread search via FuseWorker:
import &#123; FuseWorker &#125; from '@icjia/pdf-search-index/worker';
const fuse = new FuseWorker(rows, &#123; keys: ['title', 'text'], threshold: 0.2 &#125;);
const results = await fuse.search('stigma');
fuse.terminate(); // on unmount</code></pre>
      </template>

      <!-- FlexSearch -->
      <template v-else-if="engine === 'flexsearch'">
        <h3>Why FlexSearch above ~2,500 documents</h3>
        <p>
          FlexSearch is the right call once Fuse&rsquo;s in-memory full-text index starts to slow
          down. The crossover point depends on document length and field count, but ~2,500 rows is a
          reasonable rule of thumb. FlexSearch&rsquo;s encoded index format is denser than
          Fuse&rsquo;s JSON, queries are sub-millisecond on 10K+ rows, and the built-in
          <code>WorkerIndex</code> handles off-main-thread search out of the box.
        </p>
        <ul>
          <li>
            <strong>Sub-millisecond queries on 10K+ docs.</strong> FlexSearch&rsquo;s inverted index
            + phonetic / forward / reverse tokenizers are tuned for raw speed. Where Fuse would take
            100&nbsp;ms+ on a 10K-row search, FlexSearch is consistently under 1&nbsp;ms.
          </li>
          <li>
            <strong>Denser index format.</strong> The encoded index is meaningfully smaller than the
            equivalent Fuse JSON on the same rows. Saves on the wire and in memory.
          </li>
          <li>
            <strong>Built-in <code>WorkerIndex</code>.</strong> No DIY postMessage plumbing —
            FlexSearch ships a worker variant with the same API.
          </li>
          <li>
            <strong>Tradeoff: no native typo tolerance.</strong> FlexSearch&rsquo;s
            <code>tolerant: true</code> is n-gram-based and needs tuning. If &ldquo;applicent&rdquo;
            → &ldquo;applicant&rdquo; is core to your UX, stay on Fuse.
          </li>
          <li>
            <strong>Tradeoff: no native match positions.</strong> FlexSearch returns matched docs,
            not character ranges. We ship <code>snippetHTMLForFlexMatch</code> which does its own
            substring search for highlighting.
          </li>
        </ul>
        <h4 class="why__code-heading">How to implement</h4>
        <pre class="why__code"><code>// Build-time: same as Fuse — produce IndexedDocument[] rows
import { indexDocuments } from '@icjia/pdf-search-index';
const rows = await indexDocuments(urls);
// Write rows to public/searchIndex.json


// Runtime (browser): build the FlexSearch index in-memory
import &#123;
  createFlexSearchIndex,
  snippetHTMLForFlexMatch,
  flattenFlexResults,
&#125; from '@icjia/pdf-search-index/flexsearch';

const rows = await fetch('/searchIndex.json').then(r =&gt; r.json());
const index = await createFlexSearchIndex(rows);

const raw = await index.search('stigma', &#123; enrich: true &#125;);
const matches = flattenFlexResults(raw);

for (const row of matches) {
  const html = snippetHTMLForFlexMatch(row, 'stigma');
  console.log(row.title, html);
}


// Off-main-thread via FlexSearch's built-in WorkerIndex:
import FlexSearch from 'flexsearch';
const index = new FlexSearch.Document(&#123;
  worker: true,  // each field gets its own worker
  document: &#123; id: 'id', index: ['title', 'text'] &#125;,
&#125;);
for (const row of rows) await index.add(row);
const results = await index.search('stigma');</code></pre>
      </template>

      <!-- Pagefind -->
      <template v-else>
        <h3>Why Pagefind above ~10,000 documents</h3>
        <p>
          Pagefind is the only engine in this package&rsquo;s roadmap that scales gracefully past
          five-figure corpora <em>without</em> paying the full-index download cost on first load. It
          operates on a <strong>chunked on-demand index</strong>: the browser fetches only the index
          chunks needed for each specific query. The full index can be hundreds of MB on disk; the
          client only ever downloads ~5-20 KB per query.
        </p>
        <ul>
          <li>
            <strong>Chunked on-demand.</strong> The build step produces a multi-file index in
            <code>_pagefind/</code>. Each query loads only the chunks containing the query terms.
            First-paint cost stays low even at 100K+ documents.
          </li>
          <li>
            <strong>Pre-highlighted excerpts.</strong> Pagefind&rsquo;s
            <code>.data().excerpt</code> returns text pre-wrapped in <code>&lt;mark&gt;</code>
            tags — no separate snippet helper needed.
          </li>
          <li>
            <strong>Different operating model.</strong> Pagefind crawls <em>HTML pages</em>, not
            JSON. Our package&rsquo;s <code>emitPagefindHTML</code> bridges the two: writes one HTML
            page per indexed document, then Pagefind&rsquo;s CLI walks that directory.
          </li>
          <li>
            <strong>Tradeoff: more setup.</strong> Need to run the Pagefind CLI at build time and
            serve the <code>_pagefind/</code> directory at the same origin as your site. The
            demo&rsquo;s build pipeline does this automatically; for your own site you add it to
            your <code>build</code> script.
          </li>
        </ul>
        <h4 class="why__code-heading">How to implement</h4>
        <pre class="why__code"><code>// Build-time: emit HTML pages + run Pagefind CLI
import { indexDocuments } from '@icjia/pdf-search-index';
import { emitPagefindHTML } from '@icjia/pdf-search-index/pagefind';
import { spawn } from 'node:child_process';

const rows = await indexDocuments(urls);
await emitPagefindHTML(rows, &#123;
  outDir: 'public/pagefind-source',
  publicDirJail: 'public',  // C5-style path-jail
&#125;);

// Run Pagefind CLI against the public/ directory
// (or wire it into your package.json scripts):
//   "build:search": "node build-index.mjs &amp;&amp; pagefind --site public"


// Runtime (browser): load Pagefind's client + chunked index
// (Pagefind is served from /_pagefind/ alongside your site)
const pagefind = await import('/_pagefind/pagefind.js');
const r = await pagefind.search('stigma');

for (const result of r.results) {
  const data = await result.data();
  console.log(data.url, data.excerpt); // excerpt has &lt;mark&gt; pre-wrapped
}</code></pre>
      </template>

      <h3>Not the only option</h3>
      <p>
        The output of this package is plain JSON — every client-side search engine consumes it.
        Below is the honest landscape; pick by team familiarity and corpus size. For the 14-doc demo
        you&rsquo;re looking at, all of these are interchangeable.
      </p>
      <div class="alternates-table-wrap">
        <table class="alternates-table">
          <thead>
            <tr>
              <th scope="col">Engine</th>
              <th scope="col">Strengths</th>
              <th scope="col">Tradeoffs</th>
              <th scope="col">Best corpus size</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <a href="https://www.fusejs.io/" target="_blank" rel="noopener noreferrer"
                  >Fuse.js</a
                >
                <span class="alternates-table__badge">demo default</span>
              </th>
              <td>
                Best typo tolerance (Bitap). Native match-position output for snippet highlighting.
                Built-in <code>FuseWorker</code> in 7.4.0-beta.6+. Smallest API.
              </td>
              <td>In-memory; full index loaded up-front. Build cost grows with corpus.</td>
              <td>&lt; 2,500 documents</td>
            </tr>
            <tr>
              <th scope="row">
                <a
                  href="https://lucaong.github.io/minisearch/"
                  target="_blank"
                  rel="noopener noreferrer"
                  >MiniSearch</a
                >
              </th>
              <td>
                Lighter index format than Fuse. Slightly better relevance ranking via TF-IDF. Easy
                API. Good for prefix / autocomplete.
              </td>
              <td>No native fuzzy matching (substring + token-prefix). No built-in worker.</td>
              <td>&lt; 5,000 documents</td>
            </tr>
            <tr>
              <th scope="row">
                <a href="https://askorama.ai/" target="_blank" rel="noopener noreferrer">Orama</a>
              </th>
              <td>
                Zero-config; multi-language tokenizers. Fast on medium corpora. Vector / hybrid
                search support if you need it later.
              </td>
              <td>
                Newer library (younger ecosystem than Fuse / Lunr / MiniSearch). Heavier bundle.
              </td>
              <td>&lt; 5,000 documents</td>
            </tr>
            <tr>
              <th scope="row">
                <a
                  href="https://github.com/nextapps-de/flexsearch"
                  target="_blank"
                  rel="noopener noreferrer"
                  >FlexSearch</a
                >
              </th>
              <td>
                Sub-millisecond queries on 10K+ docs. Encoded index format (denser than JSON).
                Built-in <code>WorkerIndex</code>. Phonetic / stemming encoders.
              </td>
              <td>
                Loses Fuse&rsquo;s typo tolerance (n-gram mode exists but needs tuning). No native
                match positions — you do your own substring search for highlight.
              </td>
              <td>2,500 – 10,000 documents</td>
            </tr>
            <tr>
              <th scope="row">
                <a href="https://pagefind.app/" target="_blank" rel="noopener noreferrer"
                  >Pagefind</a
                >
              </th>
              <td>
                Chunked on-demand index — only engine that scales past five-figure corpora without
                paying full-index download on first load. Returns pre-highlighted excerpts.
              </td>
              <td>
                Crawls HTML pages, not JSON — needs a build step that emits one HTML per document.
                More setup than Fuse / FlexSearch / MiniSearch.
              </td>
              <td>10,000+ documents</td>
            </tr>
            <tr>
              <th scope="row">
                <a href="https://lunrjs.com/" target="_blank" rel="noopener noreferrer">Lunr</a>
              </th>
              <td>
                Battle-tested classic; Solr-like inverted index in pure JS. Predictable behavior.
              </td>
              <td>
                No fuzzy matching. No web-worker mode out of the box. Less actively developed
                lately.
              </td>
              <td>&lt; 3,000 documents</td>
            </tr>
            <tr>
              <th scope="row">
                <a href="https://typesense.org/" target="_blank" rel="noopener noreferrer"
                  >Typesense</a
                >
                /
                <a href="https://www.meilisearch.com/" target="_blank" rel="noopener noreferrer"
                  >MeiliSearch</a
                >
                /
                <a href="https://www.algolia.com/" target="_blank" rel="noopener noreferrer"
                  >Algolia</a
                >
              </th>
              <td>
                Managed services; backend indexing; production-grade scaling; rich UI components.
              </td>
              <td>
                Not client-side; requires a running service (or Algolia&rsquo;s SaaS). Defeats the
                "no servers" tradeoff this package is built around.
              </td>
              <td>Any size — server handles it</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="alternates-table__footer">
        For more architectural background and migration recipes, see the
        <a
          href="https://github.com/ICJIA/pdf-search-index#using-a-search-engine-other-than-fusejs"
          target="_blank"
          rel="noopener noreferrer"
          >&ldquo;Using a search engine other than Fuse.js&rdquo; section</a
        >
        in the top-level README.
      </p>
    </div>
  </section>

  <section class="index-inspect" aria-labelledby="index-inspect-heading">
    <h2 id="index-inspect-heading" class="index-inspect__heading">Inspect the search index</h2>
    <div class="index-card">
      <p class="index-card__intro">
        Curious how the package&rsquo;s output looks before it hits Fuse? This is the raw
        <code>IndexedDocument[]</code> array that ships as <code>/searchIndex.pdfs.json</code>. Each
        row carries the URL, title, full extracted text, page count (when surfaced by the parser),
        format discriminator (<code>'pdf' | 'docx' | 'pptx' | 'xlsx'</code>), and a stable
        hash-derived id. Your search engine of choice consumes this same shape — Fuse here,
        MiniSearch / Orama / Lunr / Algolia / Typesense elsewhere.
      </p>
      <details class="index-details">
        <summary class="index-details__summary">
          <span class="index-details__chevron" aria-hidden="true"></span>
          Show the document rows (<code>IndexedDocument[]</code>)
        </summary>
        <pre class="index-details__pre"><code>{{ indexDump }}</code></pre>
      </details>

      <!--
        v1.2 prebuilt Fuse index. The build emits a second JSON file
        (`/searchIndex.fuse-index.json`) containing the serialized Fuse
        index records. Consumers fetch both at runtime and pass the
        prebuilt index to `Fuse.parseIndex` to skip the in-browser
        build step. At our 14-doc corpus the perf delta is invisible;
        the dropdown here is purely a "show me what's actually in the
        prebuilt file" diagnostic.
      -->
      <p class="index-card__intro index-card__intro--secondary">
        <strong>New in 1.2:</strong> the build also emits a prebuilt Fuse index at
        <code>/searchIndex.fuse-index.json</code>. Consumers load both files and pass the index to
        <code>Fuse.parseIndex(...)</code> at runtime, skipping the in-browser build (cuts
        first-paint setup from ~10&nbsp;s to ~200&nbsp;ms at the 2,000-row scale). At this demo's 14
        rows the delta is invisible — the dropdown below is a diagnostic so you can see what the
        prebuilt-index file actually looks like.
      </p>
      <details v-if="fuseIndexDump" class="index-details">
        <summary class="index-details__summary">
          <span class="index-details__chevron" aria-hidden="true"></span>
          Show the prebuilt Fuse index (<code>searchIndex.fuse-index.json</code>)
        </summary>
        <pre class="index-details__pre"><code>{{ fuseIndexDump }}</code></pre>
      </details>
      <p v-else class="index-card__intro index-card__intro--muted">
        <em
          >(Prebuilt Fuse index file not loaded — older build, or a fetch failure. Rebuild the demo
          to emit <code>searchIndex.fuse-index.json</code>.)</em
        >
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Fuse, { type FuseResult } from 'fuse.js';
import { snippetHTMLFor } from '@icjia/pdf-search-index/snippet';
import {
  createFlexSearchIndex,
  snippetHTMLForFlexMatch,
  flattenFlexResults,
} from '@icjia/pdf-search-index/flexsearch';
import type { IndexedPdf } from '@icjia/pdf-search-index';

const rows = ref<IndexedPdf[]>([]);
const query = ref('');
const loaded = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

// v1.4: engine toggle. The demo ships all three engines side-by-side so
// visitors can compare what config / index / results look like for each
// at the same corpus.
type Engine = 'fuse' | 'flexsearch' | 'pagefind';
const engine = ref<Engine>('fuse');
const engineOptions: { value: Engine; label: string; range: string }[] = [
  { value: 'fuse', label: 'Fuse.js', range: '< 2.5K docs' },
  { value: 'flexsearch', label: 'FlexSearch', range: '2.5K – 10K' },
  { value: 'pagefind', label: 'Pagefind', range: '10K+' },
];
const engineLabel = computed(
  () => engineOptions.find((o) => o.value === engine.value)?.label ?? 'Fuse.js',
);
// v1.4: dynamic "Why XXX?" heading. Mirrors the engine toggle so the
// section header reads "Why Fuse.js?" when Fuse is selected, "Why
// FlexSearch?" when FlexSearch, etc.
const whyHeading = computed(() => `Why ${engineLabel.value}?`);

/**
 * v1.4: per-engine tune heading + version pill. The "Tune Fuse.js, live"
 * card switches to "Tune FlexSearch, live" / "Tune Pagefind, live" based
 * on the active engine. The version pill points at the matching release
 * page so the user can verify the exact API surface against upstream docs.
 */
const tuneHeading = computed(() => {
  if (engine.value === 'fuse') return 'Tune Fuse.js, live';
  if (engine.value === 'flexsearch') return 'Tune FlexSearch, live';
  return 'Tune Pagefind, live';
});

const tuneVersionPill = computed(() => {
  if (engine.value === 'fuse') {
    return {
      label: 'v7.4.0-beta.6',
      href: 'https://github.com/krisk/Fuse/releases/tag/v7.4.0-beta.6',
      ariaLabel: 'View fuse.js v7.4.0-beta.6 release on GitHub',
    };
  }
  if (engine.value === 'flexsearch') {
    return {
      label: 'v0.7.43',
      href: 'https://github.com/nextapps-de/flexsearch/releases/tag/0.7.43',
      ariaLabel: 'View FlexSearch v0.7.43 release on GitHub',
    };
  }
  return {
    label: 'v1.x',
    href: 'https://pagefind.app/docs/',
    ariaLabel: 'View Pagefind v1.x docs',
  };
});

// Per-engine stats. Reset whenever the engine switches.
interface EngineStats {
  indexBuildMs: number | null;
  lastQueryMs: number | null;
  indexSizeBytes: number | null;
}
const engineStats = ref<EngineStats>({
  indexBuildMs: null,
  lastQueryMs: null,
  indexSizeBytes: null,
});
function resetEngineStats(): void {
  engineStats.value = { indexBuildMs: null, lastQueryMs: null, indexSizeBytes: null };
}
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

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

/**
 * v1.4: FlexSearch tunables. FlexSearch's `Document` index is configured
 * at construction time — changing any of these forces a full index rebuild
 * via `buildFlexIndex()`. The watcher below handles that.
 *
 * - `flexTokenize` — per-field segmentation: 'strict' (full word), 'forward'
 *   (prefix-search friendly), 'reverse' (suffix), 'full' (every substring).
 *   Forward is the sweet spot for typeahead UX; full hits a ~4x index size.
 * - `flexEncode` — top-level normalization: 'icase' (case-fold only),
 *   'simple' (icase + light ASCII fold), 'advanced' (phonetic-ish — handles
 *   "fone"→"phone"), 'extra' (heavier phonetic — slower index build).
 * - `flexResolution` — per-field scoring resolution; higher = finer ranking,
 *   bigger index. FlexSearch's default is 9.
 * - `flexOptimize` — drops less-useful index keys for smaller memory at the
 *   cost of recall on rare queries.
 * - `flexCache` — caches recent query results inside FlexSearch. Useful for
 *   typeahead where the same prefix is queried character-by-character.
 */
const FLEX_DEFAULTS = {
  tokenize: 'forward' as 'strict' | 'forward' | 'reverse' | 'full',
  encode: 'icase' as 'icase' | 'simple' | 'advanced' | 'extra',
  resolution: 9,
  optimize: true,
  cache: true,
  searchTitle: true,
  searchText: true,
} as const;

const flexTokenize = ref<'strict' | 'forward' | 'reverse' | 'full'>(FLEX_DEFAULTS.tokenize);
const flexEncode = ref<'icase' | 'simple' | 'advanced' | 'extra'>(FLEX_DEFAULTS.encode);
const flexResolution = ref<number>(FLEX_DEFAULTS.resolution);
const flexOptimize = ref<boolean>(FLEX_DEFAULTS.optimize);
const flexCache = ref<boolean>(FLEX_DEFAULTS.cache);
const flexSearchTitle = ref<boolean>(FLEX_DEFAULTS.searchTitle);
const flexSearchText = ref<boolean>(FLEX_DEFAULTS.searchText);

/**
 * v1.4: Pagefind tunables. Pagefind's heavy lifting is build-time
 * (chunked index emitted from HTML), so only a small surface is runtime-
 * tunable via `pagefindLib.options({...})`. The four ranking knobs map
 * to BM25-style parameters that affect score; `excerptLength` controls
 * the number of words rendered around the match in `data().excerpt`.
 *
 * Changing any of these calls `.options()` on the loaded Pagefind lib
 * and re-runs the current search. No index rebuild needed.
 */
const PAGEFIND_DEFAULTS = {
  excerptLength: 30,
  termFrequency: 1.0,
  pageLength: 0.75,
  termSimilarity: 1.0,
  termSaturation: 1.4,
} as const;

const pagefindExcerptLength = ref<number>(PAGEFIND_DEFAULTS.excerptLength);
const pagefindTermFrequency = ref<number>(PAGEFIND_DEFAULTS.termFrequency);
const pagefindPageLength = ref<number>(PAGEFIND_DEFAULTS.pageLength);
const pagefindTermSimilarity = ref<number>(PAGEFIND_DEFAULTS.termSimilarity);
const pagefindTermSaturation = ref<number>(PAGEFIND_DEFAULTS.termSaturation);

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
  const fuseOptions = {
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
  };
  // 1.2: if a prebuilt index loaded successfully, pass it as the third
  // arg to Fuse. The runtime options above still apply for query-time
  // matching; the prebuilt index just skips the per-row tokenization
  // step. Falls back to building from scratch when prebuiltIndex is null
  // (older build, fetch failed, etc.).
  return prebuiltIndex.value
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Fuse(rows.value, fuseOptions, prebuiltIndex.value as any)
    : new Fuse(rows.value, fuseOptions);
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

// Fuse path — original behavior preserved. Returns Fuse's native
// FuseResult shape since the existing template / snippet helper expects
// that. v1.4 wraps this in a unified `results` computed below.
const fuseResults = computed<FuseResult<IndexedPdf>[]>(() => {
  if (!fuseInstance.value || !query.value.trim() || !keysSelected.value) return [];
  const t0 = performance.now();
  let out: FuseResult<IndexedPdf>[];
  if (tokenSearch.value && !useExtendedSearch.value) {
    out = tokenizeAndSearch(fuseInstance.value, query.value, minMatchCharLength.value);
  } else {
    out = fuseInstance.value.search(query.value);
  }
  // Stats stored as a side effect of computed; not ideal Vue pattern
  // but fine for a demo. Updated each time the user types.
  if (engine.value === 'fuse') {
    engineStats.value = {
      ...engineStats.value,
      lastQueryMs: performance.now() - t0,
    };
  }
  return out;
});

// ───────────────────────────────────────────────────────────────────
// v1.4: FlexSearch engine path
// ───────────────────────────────────────────────────────────────────

// Built once on mount + when rows arrive. FlexSearch's Document index
// is mutable, so we hold a single instance and re-search on every
// query change. Stats track the index build + last-query time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flexIndex = ref<any | null>(null);
const flexResults = ref<{ row: IndexedPdf; snippetHtml: string }[]>([]);

function buildFlexOptions() {
  const fields: {
    field: string;
    tokenize: typeof flexTokenize.value;
    resolution: number;
    optimize: boolean;
  }[] = [];
  if (flexSearchTitle.value) {
    fields.push({
      field: 'title',
      tokenize: flexTokenize.value,
      resolution: flexResolution.value,
      optimize: flexOptimize.value,
    });
  }
  if (flexSearchText.value) {
    fields.push({
      field: 'text',
      tokenize: flexTokenize.value,
      resolution: flexResolution.value,
      optimize: flexOptimize.value,
    });
  }
  return {
    document: {
      id: 'id',
      index: fields,
      store: ['url', 'title', 'format', 'pages'],
    },
    encode: flexEncode.value,
    cache: flexCache.value,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

async function buildFlexIndex(): Promise<void> {
  if (!rows.value.length) return;
  // Skip rebuild if neither field is selected — would yield an empty index
  // and FlexSearch throws. The template's tune card prevents this state
  // through "Search in:" checkbox guards, but defensively handle it.
  if (!flexSearchTitle.value && !flexSearchText.value) {
    flexIndex.value = null;
    return;
  }
  const t0 = performance.now();
  flexIndex.value = await createFlexSearchIndex(rows.value, { flexOptions: buildFlexOptions() });
  const buildMs = performance.now() - t0;
  if (engine.value === 'flexsearch') {
    engineStats.value = {
      indexBuildMs: buildMs,
      lastQueryMs: null,
      indexSizeBytes: null,
    };
  }
}

/**
 * Rebuild FlexSearch index whenever a FlexSearch tunable changes — but
 * only when the user is actually viewing FlexSearch. Avoids wasted work
 * if they're tuning Fuse and the watcher accidentally fires on shared state.
 */
watch(
  [
    flexTokenize,
    flexEncode,
    flexResolution,
    flexOptimize,
    flexCache,
    flexSearchTitle,
    flexSearchText,
  ],
  () => {
    if (engine.value === 'flexsearch') void buildFlexIndex();
  },
);

/**
 * Apply Pagefind runtime options when any of them change. Pagefind's
 * `.options({...})` is cumulative — re-passing the full ranking block
 * each time keeps the state in sync. The watcher re-runs the active
 * query so the UI reflects the new ranking immediately.
 */
watch(
  [
    pagefindExcerptLength,
    pagefindTermFrequency,
    pagefindPageLength,
    pagefindTermSimilarity,
    pagefindTermSaturation,
  ],
  () => {
    if (!pagefindLib.value) return;
    try {
      pagefindLib.value.options({
        excerptLength: pagefindExcerptLength.value,
        ranking: {
          termFrequency: pagefindTermFrequency.value,
          pageLength: pagefindPageLength.value,
          termSimilarity: pagefindTermSimilarity.value,
          termSaturation: pagefindTermSaturation.value,
        },
      });
    } catch (e) {
      console.warn('[demo] failed to apply Pagefind options', e);
    }
    if (engine.value === 'pagefind') void runPagefindSearch();
  },
);

async function runFlexSearch(): Promise<void> {
  if (!flexIndex.value || !query.value.trim()) {
    flexResults.value = [];
    return;
  }
  const t0 = performance.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await flexIndex.value.search(query.value, { enrich: true });
  const flat = flattenFlexResults<IndexedPdf>(raw);
  flexResults.value = flat.map((row) => ({
    row,
    snippetHtml: snippetHTMLForFlexMatch(row, query.value),
  }));
  engineStats.value = {
    ...engineStats.value,
    lastQueryMs: performance.now() - t0,
  };
}

// ───────────────────────────────────────────────────────────────────
// v1.4: Pagefind engine path
// ───────────────────────────────────────────────────────────────────

// Pagefind loads its client lazily at runtime from /_pagefind/pagefind.js
// (emitted by the build step). The vite-ignore comment keeps Vite from
// trying to bundle the chunked index files at build time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pagefindLib = ref<any | null>(null);
const pagefindResults = ref<{ row: IndexedPdf; snippetHtml: string }[]>([]);
const rowByUrlFilename = computed(() => {
  // Pagefind result `url` ends in the emitted page filename
  // (`/pagefind-source/<id>.html`). Build a lookup from filename → row
  // so we can map a Pagefind hit back to our IndexedPdf for rendering.
  const m = new Map<string, IndexedPdf>();
  for (const row of rows.value) {
    m.set(`${row.id}.html`, row);
  }
  return m;
});

async function loadPagefind(): Promise<void> {
  if (typeof window === 'undefined' || pagefindLib.value) return;
  const t0 = performance.now();
  try {
    // Pagefind is built into dist/_pagefind/ by our postbuild step
    // (scripts/emit-pagefind.mjs). We can't use a literal `import()`
    // here because Rollup tries to statically resolve the string and
    // fails — the file doesn't exist until after the build runs. Wrap
    // the import in `new Function` so Rollup treats it as opaque and
    // emits it as runtime-only code.
    const dynImport = new Function('p', 'return import(p)') as (p: string) => Promise<unknown>;
    pagefindLib.value = await dynImport('/_pagefind/pagefind.js');
    // v1.4: push the tune-card defaults to Pagefind so the runtime
    // options reflect the demo's UI from the moment Pagefind loads.
    try {
      pagefindLib.value.options({
        excerptLength: pagefindExcerptLength.value,
        ranking: {
          termFrequency: pagefindTermFrequency.value,
          pageLength: pagefindPageLength.value,
          termSimilarity: pagefindTermSimilarity.value,
          termSaturation: pagefindTermSaturation.value,
        },
      });
    } catch (optErr) {
      console.warn('[demo] failed to apply initial Pagefind options', optErr);
    }
    if (engine.value === 'pagefind') {
      engineStats.value = {
        indexBuildMs: performance.now() - t0,
        lastQueryMs: null,
        indexSizeBytes: null,
      };
    }
  } catch (e) {
    console.warn('[demo] failed to load /_pagefind/pagefind.js — running `pnpm build` emits it', e);
  }
}

async function runPagefindSearch(): Promise<void> {
  if (!pagefindLib.value || !query.value.trim()) {
    pagefindResults.value = [];
    return;
  }
  const t0 = performance.now();
  const r = await pagefindLib.value.search(query.value);
  // r.results is an array of { id, score, data: () => Promise<...> }.
  // Materialize each so we can show the excerpt.
  const materialized = await Promise.all(
    (r.results as Array<{ id: string; data: () => Promise<{ url: string; excerpt: string }> }>)
      .slice(0, 50)
      .map(async (rr) => {
        const data = await rr.data();
        const filename = data.url.split('/').pop() ?? '';
        const row = rowByUrlFilename.value.get(filename);
        if (!row) return null;
        // Pagefind returns excerpts pre-wrapped in <mark> tags already.
        return { row, snippetHtml: data.excerpt };
      }),
  );
  pagefindResults.value = materialized.filter(
    (x): x is { row: IndexedPdf; snippetHtml: string } => x !== null,
  );
  engineStats.value = {
    ...engineStats.value,
    lastQueryMs: performance.now() - t0,
  };
}

// ───────────────────────────────────────────────────────────────────
// v1.4: unified results dispatcher
// ───────────────────────────────────────────────────────────────────

interface UnifiedResult {
  id: string;
  item: IndexedPdf;
  snippetHtml: string;
  matchCount: number;
  score?: number | undefined;
}

const results = computed<UnifiedResult[]>(() => {
  if (engine.value === 'fuse') {
    return fuseResults.value.map((r) => ({
      id: r.item.id,
      item: r.item,
      snippetHtml: snippet(r),
      matchCount: matchCount(r),
      score: r.score,
    }));
  }
  if (engine.value === 'flexsearch') {
    return flexResults.value.map((r) => ({
      id: r.row.id,
      item: r.row,
      snippetHtml: r.snippetHtml,
      matchCount: 1,
    }));
  }
  // pagefind
  return pagefindResults.value.map((r) => ({
    id: r.row.id,
    item: r.row,
    snippetHtml: r.snippetHtml,
    matchCount: 1,
  }));
});

// Re-run searches when query or engine changes. Fuse's results is a
// pure computed so it reacts automatically; FlexSearch and Pagefind
// need explicit triggers because their search calls are async.
watch([query, engine, flexIndex, pagefindLib], () => {
  if (engine.value === 'flexsearch') void runFlexSearch();
  if (engine.value === 'pagefind') void runPagefindSearch();
});

// Reset stats + lazy-init engine-specific resources when the user
// switches the engine toggle.
watch(engine, async (newEngine) => {
  resetEngineStats();
  if (newEngine === 'flexsearch' && !flexIndex.value) {
    await buildFlexIndex();
  } else if (newEngine === 'pagefind' && !pagefindLib.value) {
    await loadPagefind();
  } else if (newEngine === 'fuse') {
    // Reflect Fuse's current state in stats (build time isn't tracked
    // for Fuse since it's a synchronous computed; show 0 placeholder).
    engineStats.value = { indexBuildMs: 0, lastQueryMs: null, indexSizeBytes: null };
  }
});

/**
 * v1.4: per-engine config snippet. Returns the live config object for the
 * currently-selected engine, formatted as the code the user would paste
 * into their own app. Each engine's tune section binds to a distinct set
 * of refs above; this computed re-renders whenever any of them change.
 */
const configSnippet = computed(() => {
  if (engine.value === 'fuse') {
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
  }
  if (engine.value === 'flexsearch') {
    const fields: string[] = [];
    if (flexSearchTitle.value) {
      fields.push(
        `    { field: 'title', tokenize: '${flexTokenize.value}', resolution: ${flexResolution.value}, optimize: ${flexOptimize.value} }`,
      );
    }
    if (flexSearchText.value) {
      fields.push(
        `    { field: 'text', tokenize: '${flexTokenize.value}', resolution: ${flexResolution.value}, optimize: ${flexOptimize.value} }`,
      );
    }
    const fieldsBlock = fields.length ? fields.join(',\n') : '    // (no fields selected)';
    return `// flexsearch v0.7.43
import FlexSearch from 'flexsearch';

const index = new FlexSearch.Document({
  document: {
    id: 'id',
    index: [
${fieldsBlock}
    ],
    store: ['url', 'title', 'format', 'pages'],
  },
  encode: '${flexEncode.value}',
  cache: ${flexCache.value},
});

for (const row of rows) index.add(row);
const raw = await index.search(query, { enrich: true });
// Use flattenFlexResults() to merge per-field results into a flat list
// of rows. See @icjia/pdf-search-index/flexsearch for the helper.`;
  }
  // pagefind
  return `// pagefind v1.x (build step: \`npx pagefind --site dist\`)
const pagefind = await import('/_pagefind/pagefind.js');

// Runtime options — these update live as you tune sliders.
pagefind.options({
  excerptLength: ${pagefindExcerptLength.value}, // words around match
  ranking: {
    termFrequency: ${pagefindTermFrequency.value.toFixed(2)},  // BM25 k1
    pageLength: ${pagefindPageLength.value.toFixed(2)},       // BM25 b
    termSimilarity: ${pagefindTermSimilarity.value.toFixed(2)},   // typo tolerance
    termSaturation: ${pagefindTermSaturation.value.toFixed(2)},   // diminishing returns
  },
});

const r = await pagefind.search(query);
const results = await Promise.all(
  r.results.slice(0, 50).map((rr) => rr.data()),
);

// Most Pagefind tuning is build-time (data-pagefind-weight, -filter,
// -sort attributes on the source HTML). See https://pagefind.app/docs/.`;
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

/**
 * Holds the raw prebuilt-index JSON text fetched from
 * `/searchIndex.fuse-index.json`. Stored as a string so we can render
 * the file verbatim in the inspector without an extra serialize step.
 *
 * Falls back to `null` when the file isn't present (older build or
 * `prebuildIndex` option disabled). The dropdown hides itself in that
 * case rather than show an empty pre block.
 */
const fuseIndexRaw = ref<string | null>(null);

/**
 * Pretty-printed prebuilt Fuse index for the inspector. The serialized
 * Fuse index has its own structure (`keys` + `records[]` with per-key
 * `v` and `n` slots) — distinct from the row JSON. We don't truncate
 * `v` values here; they're already the field contents the rows JSON
 * shows in full, so this just exposes Fuse's internal index shape for
 * curious devs.
 */
const fuseIndexDump = computed(() => {
  if (!fuseIndexRaw.value) return '';
  try {
    return JSON.stringify(JSON.parse(fuseIndexRaw.value), null, 2);
  } catch {
    return fuseIndexRaw.value;
  }
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
  if (engine.value === 'fuse') {
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
    return;
  }
  if (engine.value === 'flexsearch') {
    flexTokenize.value = FLEX_DEFAULTS.tokenize;
    flexEncode.value = FLEX_DEFAULTS.encode;
    flexResolution.value = FLEX_DEFAULTS.resolution;
    flexOptimize.value = FLEX_DEFAULTS.optimize;
    flexCache.value = FLEX_DEFAULTS.cache;
    flexSearchTitle.value = FLEX_DEFAULTS.searchTitle;
    flexSearchText.value = FLEX_DEFAULTS.searchText;
    return;
  }
  // pagefind
  pagefindExcerptLength.value = PAGEFIND_DEFAULTS.excerptLength;
  pagefindTermFrequency.value = PAGEFIND_DEFAULTS.termFrequency;
  pagefindPageLength.value = PAGEFIND_DEFAULTS.pageLength;
  pagefindTermSimilarity.value = PAGEFIND_DEFAULTS.termSimilarity;
  pagefindTermSaturation.value = PAGEFIND_DEFAULTS.termSaturation;
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

/**
 * Pick the open-link target for a result row. Routes PDFs through the
 * bundled Mozilla pdf.js viewer (for in-document highlight when the user
 * has typed a query); routes everything else (DOCX, PPTX, XLSX) at the
 * direct public file URL. The browser handles those formats via OS-level
 * file association (download + open in Word / PowerPoint / Excel /
 * Pages / etc).
 *
 * The pdf.js viewer is PDF-only — handing it a .docx would 404.
 */
function resultLink(r: FuseResult<IndexedPdf>): string {
  return (r.item.format ?? 'pdf') === 'pdf' ? viewerUrl(r) : publicPdfUrl(r.item.url);
}

/**
 * v1.4: row-based variant for the unified results dispatcher. FlexSearch
 * and Pagefind don't produce FuseResult; they produce plain rows. This
 * variant takes the row directly. For PDFs we still route through the
 * pdf.js viewer; the query for highlight comes from the global ref.
 */
function resultLinkForRow(row: IndexedPdf): string {
  if ((row.format ?? 'pdf') !== 'pdf') return publicPdfUrl(row.url);
  const pdf = publicPdfUrl(row.url);
  const q = query.value.trim();
  if (!q) return pdf;
  return `/pdfjs-viewer/web/viewer.html?file=${pdf}#search=${encodeURIComponent(q)}`;
}

/**
 * Like `resultLink` but for the corpus list (no query active). Always
 * routes to the plain file URL — there's nothing to highlight without
 * a query, so we skip the viewer wrapping. PDFs open in the browser's
 * native renderer; Office files download or open in the OS handler.
 */
function corpusLink(row: IndexedPdf): string {
  return publicPdfUrl(row.url);
}

/**
 * Corpus list sorted (a) by format (PDF, DOCX, PPTX, XLSX — UI grouping
 * order), then (b) alphabetically by title. Keeps the list scannable
 * and stable across rebuilds.
 */
const FORMAT_ORDER = { pdf: 0, docx: 1, pptx: 2, xlsx: 3 } as const;
const sortedCorpus = computed(() =>
  [...rows.value].sort((a, b) => {
    const fa = FORMAT_ORDER[(a.format ?? 'pdf') as keyof typeof FORMAT_ORDER] ?? 99;
    const fb = FORMAT_ORDER[(b.format ?? 'pdf') as keyof typeof FORMAT_ORDER] ?? 99;
    if (fa !== fb) return fa - fb;
    return a.title.localeCompare(b.title);
  }),
);

// 1.2 demo: fetch BOTH the rows and the prebuilt Fuse index in
// parallel. The runtime Fuse instance reuses the prebuilt index via
// `Fuse.parseIndex`, skipping the in-browser build step. At 14 rows
// the perf delta is invisible (~3 ms either way); the production
// argument for the pattern lives at the ~2K-row scale.
//
// If `searchIndex.fuse-index.json` isn't present (older build), we
// gracefully fall back to the 1.0.x path: pass `null` so the
// `prebuiltIndex` computed below stays null and `runFuseSearch` builds
// the index from scratch.
const prebuiltIndex = ref<unknown | null>(null);

onMounted(async () => {
  const [rowsRes, indexRes] = await Promise.all([
    fetch('/searchIndex.pdfs.json'),
    fetch('/searchIndex.fuse-index.json').catch(() => null),
  ]);
  rows.value = (await rowsRes.json()) as IndexedPdf[];
  if (indexRes && indexRes.ok) {
    // Capture the raw JSON text first so the inspector dropdown can
    // pretty-print it verbatim, then parseIndex for the runtime Fuse.
    fuseIndexRaw.value = await indexRes.text();
    try {
      prebuiltIndex.value = Fuse.parseIndex(JSON.parse(fuseIndexRaw.value));
    } catch {
      // If parse fails (malformed file), drop back to building from
      // scratch — the inspector dropdown still shows the raw text.
      prebuiltIndex.value = null;
    }
  }
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
/*
 * Two-column wrapper for Try It + Tune. The breakpoint moved 1024 → 1180
 * because at 1024–1100 the columns ended up ~430px each — not enough
 * room for the result cards' snippets to breathe.
 *
 * `minmax(0, 1fr)` on each track + an explicit `min-width: 0` cascade
 * down to every descendant of `.search` are both required to stop the
 * Try It column from blowing past its assigned width when a result
 * snippet contains long unbroken token runs (PDF body text occasionally
 * has run-on strings). Without those, the column ignores the 1fr cap,
 * grows to fit content, and visually overlaps with the Tune column.
 */
.search-and-tune {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-top: 2rem;
}

@media (min-width: 1180px) {
  .search-and-tune {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2.5rem;
    align-items: start;
  }
}

.search {
  margin-top: 0;
}

/*
 * Each section AND each of its descendants needs `min-width: 0` so a
 * deeply-nested long string doesn't push the grid track wider than its
 * `minmax(0, 1fr)` cap. Default `min-width: auto` resolves to content
 * intrinsic width, which is what was blowing out the column.
 */
.search-and-tune > section {
  min-width: 0;
  max-width: 100%;
}

.search-and-tune .search__card,
.search-and-tune .search__bar,
.search-and-tune .search__results,
.search-and-tune .search__result,
.search-and-tune .search__result-link {
  min-width: 0;
  max-width: 100%;
}

/*
 * Long unbroken tokens inside snippets and titles (PDF text occasionally
 * has run-on strings with no whitespace) need to wrap aggressively so they
 * never exceed the column width. `overflow-wrap: anywhere` falls back to
 * mid-word breaks only when no soft-wrap opportunity exists.
 */
.search-and-tune .search__snippet,
.search-and-tune .search__result-title {
  overflow-wrap: anywhere;
  word-break: break-word;
}

/*
 * When side-by-side, each tuner column is ~580px wide — not enough room
 * for the inner 2-column control grid to breathe. Collapse to one column
 * so labels + help text + inputs each get full width within the card.
 */
@media (min-width: 1180px) {
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

/*
 * v1.4: engine toggle. Segmented control across the top of the search
 * card so users can switch between Fuse / FlexSearch / Pagefind. Each
 * button shows the engine name + the corpus-size range it's tuned for.
 */
.search__engines {
  display: flex;
  gap: 0.5rem;
  margin: 0 0 1.5rem;
  padding: 0.55rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.search__engine {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 1.15rem 0.9rem 1.3rem;
  min-height: 5rem;
  line-height: 1.3;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  color: var(--text-muted);
  transition:
    background 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
}

.search__engine:hover:not(.search__engine--active) {
  background: var(--surface-elevated);
  color: var(--text);
}

.search__engine--active {
  background: rgba(163, 230, 53, 0.1);
  border-color: rgba(163, 230, 53, 0.4);
  color: var(--text);
}

.search__engine-name {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.005em;
}

.search__engine--active .search__engine-name {
  color: #a3e635;
}

.search__engine-range {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-subtle);
}

/*
 * Stats panel inline under the search input. Shows index build /
 * last query / index size per engine. Compact and unobtrusive.
 */
.search__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.1rem;
  margin: 0.6rem 0 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-subtle);
}

.search__stat {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}

.search__stat-label {
  color: var(--text-subtle);
}

.search__stat-value {
  color: var(--text);
  font-weight: 500;
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

/*
 * Corpus list — shown when the user hasn't started searching. Visually
 * lighter than search-result cards so it reads as "here's what's
 * indexed" rather than "here are matches." Reuses .search__result-format
 * for the format chips so styling stays in lockstep.
 */
.corpus {
  margin: 1.5rem 0 0;
}

.corpus__heading {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0 0 0.85rem;
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.005em;
  color: var(--text);
}

.corpus__count {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-subtle);
}

.corpus__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.4rem;
}

.corpus__item {
  margin: 0;
}

.corpus__link {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.75rem;
  text-decoration: none;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    transform 80ms ease;
  min-width: 0;
}

.corpus__link:hover,
.corpus__link:focus-visible {
  background: var(--surface-elevated);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.corpus__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.corpus__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 500;
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

/*
 * Format badge — visually distinguishes each document type in the result
 * list. WCAG AA contrast verified for each variant against the dark
 * surface background. Color choices loosely follow industry convention:
 *   PDF  → red (Adobe Acrobat)
 *   DOCX → blue (Microsoft Word)
 *   PPTX → orange (Microsoft PowerPoint)
 *   XLSX → green (Microsoft Excel)
 */
.search__result-format {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.55rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 4px;
  border: 1px solid;
  flex-shrink: 0;
}

.search__result-format--pdf {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.35);
}

.search__result-format--docx {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
  border-color: rgba(96, 165, 250, 0.35);
}

.search__result-format--pptx {
  color: #fb923c;
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.35);
}

.search__result-format--xlsx {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
  border-color: rgba(74, 222, 128, 0.35);
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

/* v1.4: <select> for FlexSearch's tokenize / encode dropdowns.
   Matches the visual weight of .tune__number so the two coexist
   in the same control grid without one looking like an afterthought. */
select.tune__select {
  width: 14rem;
  max-width: 100%;
  height: 36px;
  padding: 0 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}
select.tune__select:hover {
  border-color: var(--border-strong);
}
select.tune__select:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}

/* v1.4: callout at the top of the Pagefind tune card. Explains why
   the runtime surface is small — most of Pagefind's config is in the
   build step's data-pagefind-* attrs, not runtime API. */
.tune__pagefind-note {
  margin: 0 0 1.25rem;
  padding: 0.85rem 1rem;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border-left: 3px solid var(--accent);
  border-radius: 6px;
}
.tune__pagefind-note strong {
  color: var(--text);
}
.tune__pagefind-note code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0.1rem 0.3rem;
  background: var(--surface);
  border-radius: 3px;
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

/*
 * v1.3.1+: per-engine code snippet under "How to implement". The block
 * shows actual import + usage code for the currently-selected engine
 * (Fuse / FlexSearch / Pagefind) so demo visitors can copy-paste the
 * pattern that matches their corpus-size choice.
 */
.why__code-heading {
  margin: 1.5rem 0 0.6rem;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-subtle);
}

.why__code {
  margin: 0;
  padding: 1rem 1.25rem;
  background: #0f0f17;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.55;
  color: #e8e8f0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: pre;
  tab-size: 2;
}

.why__code code {
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
}

/*
 * Scale-disclaimer callout that sits at the top of the "Why XXX" card.
 * Always visible regardless of selected engine. Visually distinct from
 * the per-engine prose so visitors don't miss the "this is a demo;
 * production is different" caveat.
 */
.why__disclaimer {
  margin: 0 0 1.5rem;
  padding: 1rem 1.25rem;
  background: rgba(163, 230, 53, 0.06);
  border: 1px solid rgba(163, 230, 53, 0.22);
  border-radius: 8px;
  color: var(--text-muted);
  line-height: 1.6;
  font-size: 0.92rem;
}

.why__disclaimer strong {
  color: var(--text);
}

/*
 * Compact 3-engine comparison table — always visible at the top of the
 * "Why XXX" card. Highlights the currently-selected engine's row so
 * visitors can find the engine they just selected in the comparison.
 */
.why__compare-wrap {
  margin: 0 0 2rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.why__compare {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.why__compare thead {
  background: var(--surface);
}

.why__compare th,
.why__compare td {
  padding: 0.65rem 0.85rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
  line-height: 1.5;
}

.why__compare tbody tr:last-child th,
.why__compare tbody tr:last-child td {
  border-bottom: none;
}

.why__compare thead th {
  color: var(--text);
  font-weight: 600;
  font-size: 0.76rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
}

.why__compare tbody th {
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}

.why__compare tbody td {
  color: var(--text-muted);
}

.why__compare tbody td:last-child {
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.why__compare-row--active {
  background: rgba(163, 230, 53, 0.06);
}

.why__compare-row--active th,
.why__compare-row--active td {
  color: var(--text);
}

.why__yes {
  color: #a3e635;
  font-weight: 600;
}

.why__partial {
  color: #fb923c;
  font-weight: 600;
}

.why__no {
  color: #f87171;
  font-weight: 600;
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

/* Separator between the two index inspectors (rows vs prebuilt Fuse). */
.index-card__intro--secondary {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}

/* Used for the "prebuilt index file not loaded" fallback message. */
.index-card__intro--muted {
  color: var(--text-subtle);
  font-size: 0.88rem;
}

/*
 * Search-engine alternatives table. Lives in the "Why Fuse" card, just
 * below the "Not the only option" heading. Up-front transparency about
 * the alternatives matters more than promoting Fuse — the package emits
 * plain JSON that any of these consume, and "right tool for the job"
 * varies by corpus size.
 */
.alternates-table-wrap {
  margin: 0.5rem 0 1rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.alternates-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  line-height: 1.5;
}

.alternates-table thead {
  background: var(--surface);
}

.alternates-table th,
.alternates-table td {
  padding: 0.65rem 0.85rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
}

.alternates-table tbody tr:last-child th,
.alternates-table tbody tr:last-child td {
  border-bottom: none;
}

.alternates-table thead th {
  color: var(--text);
  font-weight: 600;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
}

.alternates-table tbody th {
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}

.alternates-table tbody th a {
  color: var(--accent);
  text-decoration: none;
}

.alternates-table tbody th a:hover,
.alternates-table tbody th a:focus-visible {
  text-decoration: underline;
}

.alternates-table tbody td {
  color: var(--text-muted);
}

.alternates-table tbody td:last-child {
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

.alternates-table__badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.1rem 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #a3e635;
  background: rgba(163, 230, 53, 0.1);
  border: 1px solid rgba(163, 230, 53, 0.3);
  border-radius: 4px;
}

.alternates-table__footer {
  margin: 0.5rem 0 0;
  font-size: 0.88rem;
  color: var(--text-subtle);
}

.alternates-table__footer a {
  color: var(--accent);
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
