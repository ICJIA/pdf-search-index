import { defineConfig } from 'tsup';
import { cpSync, existsSync } from 'node:fs';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    fuse: 'src/fuse.ts',
    snippet: 'src/snippet.ts',
    worker: 'src/worker.ts',
    flexsearch: 'src/flexsearch.ts',
    pagefind: 'src/pagefind.ts',
    mcp: 'src/mcp.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  // v1.4: copy src/vendor → dist/vendor after tsup finishes. parseOfficeDoc
  // resolves the vendored officeparser source via import.meta.url, so the
  // .cjs file has to ship alongside the bundled dist/<entry>.js files. tsup
  // doesn't follow CJS files as build input (they're a runtime asset, not a
  // source-graph node), so we copy them post-bundle.
  async onSuccess() {
    if (existsSync('src/vendor')) {
      cpSync('src/vendor', 'dist/vendor', { recursive: true });
    }
  },
});
