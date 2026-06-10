/**
 * Loader for the vendored officeparser CJS source (see src/vendor/README.md).
 *
 * Two resolution strategies, in order:
 *
 * 1. `./vendor/officeparser/officeParser.cjs`, relative to THIS module's
 *    runtime location (`import.meta.url`). Works whenever the package runs
 *    from its own tree: `src/` in dev/vitest, `dist/` in the published build
 *    (tsup's `onSuccess` copies `src/vendor` → `dist/vendor`).
 *
 * 2. `@icjia/pdf-search-index/vendor/officeparser/officeParser.cjs` — the
 *    package-name subpath, mapped to `./dist/vendor/*` in package.json
 *    `exports`. This is the path that survives CONSUMER BUNDLING: when a
 *    framework inlines this package into its own build output (e.g. an
 *    Astro/Vite prerendered endpoint lands in `dist/.prerender/chunks/`),
 *    `import.meta.url` points at the consumer's chunk and strategy 1 misses.
 *    A bare specifier instead resolves by walking up to the consumer's
 *    `node_modules`, where the installed package still has `dist/vendor/`
 *    intact. Found in the field: every DOCX silently dropped from the ICJIA
 *    DVFR search index on Netlify builds, because Astro had bundled the
 *    endpoint that called `indexDocuments()`. (Consumer-side workaround was
 *    `vite: { ssr: { external: ['@icjia/pdf-search-index'] } }`; this loader
 *    makes the package bundle-proof on its own.)
 *
 * Inside this repo, strategy 2 also resolves without any node_modules link
 * via Node's package self-reference (enabled by the `exports` field) — which
 * is what test/office-loader.test.ts leans on.
 */
import { createRequire } from 'node:module';

export const OFFICEPARSER_RELATIVE_SPECIFIER = './vendor/officeparser/officeParser.cjs';
export const OFFICEPARSER_PACKAGE_SPECIFIER =
  '@icjia/pdf-search-index/vendor/officeparser/officeParser.cjs';

export interface OfficeParserModule {
  parseOfficeAsync: (buffer: Buffer) => Promise<string>;
}

/** Minimal require-shaped callable — injectable so tests can simulate the
 * bundled-consumer case without actually bundling. */
export type RequireLike = (id: string) => unknown;

export function loadOfficeParser(req?: RequireLike): OfficeParserModule {
  const r = req ?? (createRequire(import.meta.url) as RequireLike);
  let relativeError: unknown;
  try {
    return r(OFFICEPARSER_RELATIVE_SPECIFIER) as OfficeParserModule;
  } catch (e) {
    relativeError = e;
  }
  try {
    return r(OFFICEPARSER_PACKAGE_SPECIFIER) as OfficeParserModule;
  } catch (e) {
    const msg = (x: unknown) => (x instanceof Error ? x.message : String(x));
    throw new Error(
      `vendored officeparser not loadable. Tried "${OFFICEPARSER_RELATIVE_SPECIFIER}" ` +
        `(${msg(relativeError)}), then "${OFFICEPARSER_PACKAGE_SPECIFIER}" (${msg(e)}).`,
    );
  }
}
