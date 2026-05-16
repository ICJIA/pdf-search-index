import type { AstroIntegration } from 'astro';
import { extractPdfsFromBody } from '@icjia/pdf-search-index';
import type { IndexedPdf, IndexPdfsOptions } from '@icjia/pdf-search-index';
import { writeFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Re-export so consumers of @icjia/astro-pdf-search-index don't need to
// install @icjia/pdf-search-index just to type-annotate the rows.
export type { IndexedPdf, IndexPdfsOptions } from '@icjia/pdf-search-index';

export interface PdfSearchIntegrationOptions {
  /**
   * Names of Astro content collections to scan for PDF links in entry bodies.
   * Each `.md` / `.mdx` file under `src/<contentSourceDir>/<collection>/` is
   * read, frontmatter is stripped, and the body is passed to
   * `extractPdfsFromBody`.
   */
  collections: string[];

  /**
   * Output path relative to the project's public/ directory.
   * Default: `searchIndex.pdfs.json`.
   */
  endpoint?: string;

  /** Cache directory passed to extractPdfsFromBody. Default `.astro/.pdf-cache`. */
  cacheDir?: string;

  /** Concurrency passed to extractPdfsFromBody. Default 4. */
  concurrency?: number;

  /**
   * Where to look up source markdown for each entry, relative to `srcDir`.
   * Default `'content'` — Astro's conventional content-collection root.
   */
  contentSourceDir?: string;

  /**
   * Custom `fetch` implementation passed through to `extractPdfsFromBody`.
   * Useful for testing or for examples that need to resolve `file://` URLs
   * to local fixtures. Defaults to the global `fetch`.
   */
  fetch?: typeof fetch;
}

export default function pdfSearchIntegration(
  options: PdfSearchIntegrationOptions,
): AstroIntegration {
  const endpoint = options.endpoint ?? 'searchIndex.pdfs.json';
  const cacheDir = options.cacheDir ?? '.astro/.pdf-cache';
  const concurrency = options.concurrency ?? 4;
  const contentSourceDir = options.contentSourceDir ?? 'content';
  const fetchImpl = options.fetch;

  // `astro:config:done` is the right hook to capture the resolved AstroConfig
  // (where srcDir/publicDir are real URLs). We do the actual scan + write
  // there because (a) it runs once per build, (b) the publicDir is finalized,
  // and (c) emitting to public/ before Astro's own build pipeline copies
  // static assets means the index ends up in the final dist/.
  let resolvedSrcDir: URL | null = null;
  let resolvedPublicDir: URL | null = null;

  return {
    name: '@icjia/astro-pdf-search-index',
    hooks: {
      'astro:config:done': ({ config }) => {
        resolvedSrcDir = config.srcDir;
        resolvedPublicDir = config.publicDir;
      },
      'astro:build:start': async () => {
        if (!resolvedSrcDir || !resolvedPublicDir) return;

        const srcDir = fileURLToPath(resolvedSrcDir);
        const publicDir = fileURLToPath(resolvedPublicDir);

        const allRows: IndexedPdf[] = [];
        const seen = new Set<string>();

        for (const collection of options.collections) {
          const collectionDir = resolve(srcDir, contentSourceDir, collection);
          const entries = await readMarkdownEntries(collectionDir);
          const baseOpts: IndexPdfsOptions = {
            cacheDir,
            concurrency,
            ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
          };

          for (const { body } of entries) {
            const rows = await extractPdfsFromBody(body, baseOpts);
            for (const row of rows) {
              if (!seen.has(row.id)) {
                seen.add(row.id);
                allRows.push(row);
              }
            }
          }
        }

        const outPath = join(publicDir, endpoint);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, JSON.stringify(allRows, null, 2), 'utf-8');
      },
    },
  };
}

/**
 * Recursively read `.md`/`.mdx` files from a directory. Returns each one's
 * raw body (frontmatter stripped if present). Tolerant of a missing
 * directory — returns `[]`.
 */
async function readMarkdownEntries(dir: string): Promise<Array<{ path: string; body: string }>> {
  const out: Array<{ path: string; body: string }> = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    const st = await stat(full);
    if (st.isDirectory()) {
      out.push(...(await readMarkdownEntries(full)));
    } else if (e.endsWith('.md') || e.endsWith('.mdx')) {
      const raw = await readFile(full, 'utf-8');
      const body = stripFrontmatter(raw);
      out.push({ path: full, body });
    }
  }
  return out;
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  return raw.slice(end + 4).trimStart();
}
