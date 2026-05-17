// Ambient module declaration: fuse.js@7.4.0-beta.6 ships `/worker` as
// runtime JS (`fuse-worker.mjs` / `fuse-worker.cjs`) but no `.d.ts`.
// Without this declaration our `dynamic import('fuse.js/worker')` in
// `worker.ts` would be typed as `any` and tsc would refuse to compile.
//
// The declaration is intentionally minimal — the public surface we use
// is just the `FuseWorker` constructor, which `worker.ts` re-types with
// `IndexedDocument` narrowing for our consumers.
//
// Upstream fix: if a future fuse.js release ships `dist/fuse-worker.d.ts`
// and adds a `types` field to `./worker` in its `exports` map, this file
// becomes redundant and can be removed.

declare module 'fuse.js/worker' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const FuseWorker: new (...args: any[]) => unknown;
}
