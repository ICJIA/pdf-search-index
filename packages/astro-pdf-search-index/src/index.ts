import type { AstroIntegration } from 'astro';
import { extractDocumentsFromBody, safeJSONForHTML } from '@icjia/pdf-search-index';
import type { IndexDocumentsOptions, IndexedDocument } from '@icjia/pdf-search-index';
import { writeFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep as pathSep } from 'node:path';

// Re-export so consumers of @icjia/astro-pdf-search-index don't need to
// install @icjia/pdf-search-index just to type-annotate the rows.
export type {
  IndexedDocument,
  IndexDocumentsOptions,
  IndexedPdf,
  IndexPdfsOptions,
  DocumentFormat,
} from '@icjia/pdf-search-index';

export interface PdfSearchIntegrationOptions {
  /**
   * Names of Astro content collections to scan for document links in entry
   * bodies. Each `.md` / `.mdx` file under
   * `src/<contentSourceDir>/<collection>/` is read, frontmatter is stripped,
   * and the body is passed to `extractDocumentsFromBody`.
   *
   * In v1.1 the scanner picks up PDF, DOCX, PPTX, and XLSX links — not just
   * PDFs.
   */
  collections: string[];

  /**
   * Output path relative to the project's public/ directory.
   * Default: `searchIndex.pdfs.json` (name kept for back-compat; contents
   * now include all detected document formats, not just PDFs).
   */
  endpoint?: string;

  /** Cache directory passed to the document extractor. Default `.astro/.pdf-cache`. */
  cacheDir?: string;

  /** Concurrency passed to the document extractor. Default 4. */
  concurrency?: number;

  /**
   * Where to look up source markdown for each entry, relative to `srcDir`.
   * Default `'content'` — Astro's conventional content-collection root.
   */
  contentSourceDir?: string;

  /**
   * Custom `fetch` implementation passed through to the document extractor.
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

        const allRows: IndexedDocument[] = [];
        const seen = new Set<string>();

        for (const collection of options.collections) {
          const collectionDir = resolve(srcDir, contentSourceDir, collection);
          const entries = await readMarkdownEntries(collectionDir);
          const baseOpts: IndexDocumentsOptions = {
            cacheDir,
            concurrency,
            ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
          };

          for (const { body } of entries) {
            const rows = await extractDocumentsFromBody(body, baseOpts);
            for (const row of rows) {
              if (!seen.has(row.id)) {
                seen.add(row.id);
                allRows.push(row);
              }
            }
          }
        }

        const outPath = join(publicDir, endpoint);

        // Path-traversal guard: `endpoint: '../../etc/escape.json'` would
        // otherwise let an attacker write outside publicDir. Compare the
        // resolved absolute paths.
        const publicDirAbs = resolve(publicDir);
        const outAbs = resolve(outPath);
        if (outAbs !== publicDirAbs && !outAbs.startsWith(publicDirAbs + pathSep)) {
          throw new Error(
            `pdfSearchIntegration: endpoint "${endpoint}" resolves outside publicDir ("${outAbs}" is not under "${publicDirAbs}"). Use a relative path that stays inside publicDir.`,
          );
        }

        await mkdir(dirname(outPath), { recursive: true });
        // The emitted JSON ships in `public/` and is commonly inlined into
        // an HTML page via `<script type="application/json">`. Use the
        // HTML-safe serializer so PDF text containing `</script>` can't
        // break out of that embedding.
        await writeFile(outPath, safeJSONForHTML(allRows, 2), 'utf-8');
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
