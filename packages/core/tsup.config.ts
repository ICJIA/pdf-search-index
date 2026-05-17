import { defineConfig } from 'tsup';

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
});
