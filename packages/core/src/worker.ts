/**
 * `@icjia/pdf-search-index/worker` — wrapper around `FuseWorker` from
 * `fuse.js/worker` (7.4.0-beta.6+) with `IndexedDocument` typing.
 *
 * `FuseWorker` is Fuse's built-in multi-worker sharded search runner:
 * the rows are split across `Math.min(navigator.hardwareConcurrency, 8)`
 * workers, each builds its own Fuse index, and `.search()` fans out and
 * merges results — all off the main thread. For 2,000+ document corpora
 * this is the difference between a frozen UI for 5–10 seconds on first
 * search and a responsive UI throughout.
 *
 * Why a wrapper instead of asking consumers to import directly from
 * `fuse.js/worker`?
 *
 *   1. **Typing.** As of fuse.js@7.4.0-beta.6, the `/worker` subpath
 *      ships JS but no `.d.ts`. This wrapper supplies the type surface
 *      so TypeScript consumers get autocomplete and `result.item.format`
 *      discrimination on `IndexedDocument`.
 *   2. **Discoverability.** Listed alongside `/fuse` and `/snippet` in
 *      consumers' IDEs — easier to find than the peer-dep subpath.
 *
 * Caveats inherited from `fuse.js/worker`:
 *
 *   - **Function-valued Fuse options are not supported.** `sortFn`,
 *     `getFn`, `tokenize`, etc. throw at construction.
 *   - **`useTokenSearch` is not supported.** Token search depends on
 *     corpus-level statistics that diverge per shard.
 *   - **No prebuilt-index reuse across shards.** Each shard builds its
 *     own index inside its worker. For the prebuilt-index pattern, use
 *     single-thread `Fuse` with `prebuildFuseIndex` from `/fuse`.
 *
 * Three-line consumer usage:
 *
 * ```ts
 * import { FuseWorker } from '@icjia/pdf-search-index/worker';
 *
 * const fuse = new FuseWorker(rows, {
 *   keys: ['title', 'text'],
 *   threshold: 0.2,
 *   includeMatches: true,
 * });
 *
 * const results = await fuse.search('stigma');
 *
 * // Clean up when unmounting the component:
 * fuse.terminate();
 * ```
 *
 * Added in 1.2.
 */

import type { IFuseOptions, FuseResult, FuseSearchOptions } from 'fuse.js';
import type { IndexedDocument } from './types.js';

/**
 * Worker-options bag supported by Fuse's built-in FuseWorker (7.4.0-beta.6+).
 */
export interface FuseWorkerOptions {
  /**
   * Override the URL the workers load. Defaults to the
   * `fuse.worker.mjs` shipped with `fuse.js/worker`. Useful when your
   * bundler can't resolve `import.meta.url` paths automatically.
   */
  workerUrl?: URL | string;
  /**
   * Override the number of workers. Defaults to
   * `Math.min(navigator.hardwareConcurrency, 8)`.
   */
  maxWorkers?: number;
}

/**
 * Sharded multi-worker Fuse runner over `IndexedDocument` rows.
 *
 * Same API as Fuse's upstream `FuseWorker` but with the generic
 * narrowed to `IndexedDocument` so `result.item.format` is correctly
 * discriminated.
 *
 * @see https://www.fusejs.io/web-workers.html for upstream docs.
 */
export interface FuseWorker {
  /**
   * Run a query across every shard, merge the per-shard results, and
   * return them sorted by score.
   */
  search(query: string, options?: FuseSearchOptions): Promise<FuseResult<IndexedDocument>[]>;

  /**
   * Add new documents to the index. Routed to the shard with the lowest
   * count to keep shards balanced.
   */
  add(doc: IndexedDocument): Promise<void>;

  /**
   * Remove documents matching the predicate. Runs in every shard.
   */
  remove(predicate: (doc: IndexedDocument) => boolean): Promise<number>;

  /**
   * Stop every worker. Call this when unmounting the consumer
   * component — workers persist otherwise and leak memory.
   */
  terminate(): void;
}

interface FuseWorkerCtor {
  new (
    docs: readonly IndexedDocument[],
    options?: IFuseOptions<IndexedDocument>,
    workerOptions?: FuseWorkerOptions,
  ): FuseWorker;
}

// Dynamic import on first use. Keeps the optional peer dep optional —
// the consumer only pays the import cost when they actually instantiate
// a worker. The dynamic-import path also dodges the "no .d.ts in
// fuse.js/worker" issue at consumer compile time.
//
// F3 from v1.2 audit: our peer-dep range is `fuse.js: "^7.0.0 ||
// >=7.4.0-beta.0"`. Stable fuse.js@7.0.x – 7.3.x does NOT ship `/worker`
// — that subpath landed in 7.4.0-beta.6. Without an explicit catch,
// a consumer on stable 7.3 who tries `createFuseWorker(...)` gets
// `ERR_MODULE_NOT_FOUND` with no hint to upgrade. The catch below
// surfaces a clear, actionable message.
let cachedCtor: FuseWorkerCtor | null = null;
async function getFuseWorkerCtor(): Promise<FuseWorkerCtor> {
  if (cachedCtor) return cachedCtor;
  try {
    const mod = (await import('fuse.js/worker')) as unknown as { FuseWorker: FuseWorkerCtor };
    cachedCtor = mod.FuseWorker;
    return cachedCtor;
  } catch (e) {
    throw new Error(
      '@icjia/pdf-search-index/worker requires fuse.js >= 7.4.0-beta.6 ' +
        '(the /worker subpath is not in earlier 7.x releases). Upgrade with: ' +
        '`npm install fuse.js@7.4.0-beta.6` (or later). Underlying error: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

/**
 * Construct a `FuseWorker` asynchronously. Resolves once the upstream
 * module has been imported and the constructor is ready. Slightly more
 * verbose than `new FuseWorker(...)` but keeps the package import-cost
 * zero for consumers that don't use the worker path.
 *
 * ```ts
 * const fuse = await createFuseWorker(rows, {
 *   keys: ['title', 'text'],
 *   threshold: 0.2,
 * });
 * const results = await fuse.search('stigma');
 * ```
 */
export async function createFuseWorker(
  docs: readonly IndexedDocument[],
  options?: IFuseOptions<IndexedDocument>,
  workerOptions?: FuseWorkerOptions,
): Promise<FuseWorker> {
  const Ctor = await getFuseWorkerCtor();
  return new Ctor(docs, options, workerOptions);
}

// Re-export the IndexedDocument type for convenience — consumers
// using this subpath almost always want it for their generic param.
export type { IndexedDocument } from './types.js';
