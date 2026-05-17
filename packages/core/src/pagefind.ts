/**
 * `@icjia/pdf-search-index/pagefind` — build-step helper for the
 * [Pagefind](https://pagefind.app/) search engine.
 *
 * **When to use this instead of `/fuse` or `/flexsearch`.** Pagefind is
 * fundamentally different from both: it operates on a chunked
 * on-demand index rather than an in-memory index loaded up-front. For
 * five-figure+ corpora it's the only viable option that doesn't pay
 * the full-index download cost on first load.
 *
 *   < 2,500 docs       → Fuse.js
 *   2,500 – 10,000 docs → FlexSearch
 *   **10,000+ docs**     → **Pagefind**
 *
 * **How Pagefind works.** Pagefind expects an HTML site to crawl. It
 * walks the rendered HTML, builds its inverted index, and partitions it
 * into chunks the browser loads only when a query needs them. The
 * resulting bundle on the wire is tiny (the `pagefind.js` client is
 * ~50 KB gz; individual query chunks are 5–20 KB each).
 *
 * **What this helper does.** Our package outputs JSON document rows.
 * Pagefind expects HTML pages. `emitPagefindHTML` is the bridge:
 * given `IndexedDocument[]` rows, it writes one HTML page per document
 * into a configured output directory. Each page contains the document's
 * extracted text inside a `<main data-pagefind-body>` wrapper. After
 * running this helper, the consumer invokes the Pagefind CLI against
 * the output dir, which produces the chunked index files.
 *
 * **Usage:**
 *
 * ```ts
 * // build step (Node)
 * import { emitPagefindHTML } from '@icjia/pdf-search-index/pagefind';
 * import { indexDocuments } from '@icjia/pdf-search-index';
 *
 * const rows = await indexDocuments(urls);
 * await emitPagefindHTML(rows, {
 *   outDir: 'public/pagefind-source',
 *   // Each row becomes pageFind-source/<id>.html.
 * });
 * ```
 *
 * Then add to `package.json` scripts:
 *
 * ```json
 * "build:search": "node build-index.mjs && pagefind --site public --output-subdir _pagefind"
 * ```
 *
 * Pagefind crawls `public/` (which includes the emitted
 * `pagefind-source/*.html`) and writes the chunked index to
 * `public/_pagefind/`. Consumer page loads that via the standard
 * `<script src="/_pagefind/pagefind.js">` Pagefind UI library.
 *
 * **Security.** The emitted HTML inlines the document text via
 * `safeJSONForHTML` — wait, HTML isn't JSON. We use direct HTML escape
 * so PDF text containing `<script>` etc. can't break out. Path-jail on
 * `outDir` is the caller's responsibility; pass an absolute or
 * project-relative path you trust.
 *
 * Added in 1.3.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep as pathSep } from 'node:path';
import type { IndexedDocument } from './types.js';
import { scrubControl } from './scrub.js';

export interface EmitPagefindHTMLOptions {
  /**
   * Directory to write the per-document HTML pages into. Must be inside
   * the same `public/` (or equivalent static-asset) directory that
   * Pagefind will crawl at build time. Relative paths resolve against
   * `process.cwd()`.
   */
  outDir: string;

  /**
   * Optional base URL to embed as a link on each emitted page so users
   * who land directly can navigate to the original document. If unset,
   * the row's `url` is used verbatim.
   */
  baseUrl?: string;

  /**
   * If set, restricts the outDir resolution to stay inside this jail
   * (typically the project's `public/` or `dist/` directory). Any path
   * that would escape the jail is rejected with a clear error. This is
   * analogous to the Astro adapter's `endpoint` jail (C5 fix from
   * 1.0.2). When unset, no jail check is applied — the caller is
   * trusted to pass a sane outDir.
   */
  publicDirJail?: string;
}

export interface EmitPagefindHTMLResult {
  /** Absolute path to the output directory after resolution. */
  outDirAbs: string;
  /** Number of HTML pages emitted. */
  pagesEmitted: number;
  /** Filenames written (relative to outDir). */
  filenames: string[];
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHTMLText(s: string): string {
  // v1.4 (V13-4): strip ASCII control bytes BEFORE HTML-escape so NUL,
  // ESC, BEL, DEL, CR etc. extracted from a hostile document can't
  // smuggle terminal-control sequences into the emitted HTML body. The
  // five HTML metachars are then escaped as before. Consistent with the
  // scrubControl helper used in extractor.ts for log lines.
  return scrubControl(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

/**
 * Render a single Pagefind-crawlable HTML page for an `IndexedDocument`.
 *
 * Layout:
 *
 *   <!doctype html>
 *   <html><head>...</head>
 *   <body>
 *     <main data-pagefind-body>
 *       <h1>{title}</h1>
 *       <a href="{url}">{url}</a>
 *       <article>{text}</article>
 *     </main>
 *   </body></html>
 *
 * The `data-pagefind-body` attribute tells Pagefind which DOM subtree
 * to crawl — without it, Pagefind would index the page's header/footer
 * noise too. Limiting the crawl to `<main>` keeps the index focused on
 * the document content.
 */
function renderPagefindHTML(row: IndexedDocument, baseUrl: string | undefined): string {
  const title = escapeHTMLText(row.title);
  // 6th-audit fix V13-2: escape `baseUrl` before concatenation so a
  // crafted developer-supplied baseUrl can't inject HTML. The API
  // contract says `baseUrl` is a developer literal, but escaping
  // defensively costs nothing and closes the only attack path.
  const baseUrlSafe = baseUrl ? escapeHTMLText(baseUrl.replace(/\/$/, '')) : '';
  const url = baseUrlSafe ? `${baseUrlSafe}/${escapeHTMLText(row.url)}` : escapeHTMLText(row.url);
  const text = escapeHTMLText(row.text);
  // 6th-audit fix V13-3: a caller passing a non-string `format` (or a
  // typed-as-string object with a custom `toUpperCase` returning HTML)
  // could inject markup into the `<meta>` and `<span>` below. Force a
  // real string, then HTML-escape. Belt-and-suspenders defense even
  // though TS callers can't normally hit this.
  const formatRaw = typeof row.format === 'string' && row.format ? row.format : 'pdf';
  const format = escapeHTMLText(formatRaw.toUpperCase());
  // Pagefind's tagging support: data-pagefind-filter lets consumers
  // filter results by format in the UI. We tag every emitted page with
  // its format so the consumer can build "PDF only" / "DOCX only" UI
  // filters out of the box.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="pagefind:format" content="${format}">
</head>
<body>
<main data-pagefind-body>
<h1 data-pagefind-meta="title">${title}</h1>
<p>Format: <span data-pagefind-filter="format">${format}</span></p>
<p>Source: <a href="${url}">${url}</a></p>
<article>
${text}
</article>
</main>
</body>
</html>
`;
}

/**
 * Emit one HTML page per `IndexedDocument` row into `outDir`. After
 * this runs, the consumer invokes the Pagefind CLI against the parent
 * static-asset directory to produce the chunked index.
 *
 * Returns the resolved absolute outDir, the page count, and the
 * filename list (useful for debug / verification).
 */
export async function emitPagefindHTML(
  rows: readonly IndexedDocument[],
  options: EmitPagefindHTMLOptions,
): Promise<EmitPagefindHTMLResult> {
  const outDirAbs = resolve(options.outDir);

  // Path-jail check, modeled on the C5 fix in the Astro adapter.
  if (options.publicDirJail) {
    const jailAbs = resolve(options.publicDirJail);
    if (outDirAbs !== jailAbs && !outDirAbs.startsWith(jailAbs + pathSep)) {
      throw new Error(
        `emitPagefindHTML: outDir "${options.outDir}" resolves outside publicDirJail ` +
          `("${outDirAbs}" is not under "${jailAbs}"). Use a path that stays inside the jail.`,
      );
    }
  }

  await mkdir(outDirAbs, { recursive: true });

  // 6th-audit fix V13-1: the string-prefix jail above can be bypassed
  // if the jail directory contains a symlink that resolves outside.
  // Re-check after mkdir with realpath-resolved paths to defeat
  // symlink-based escapes. We do this *after* mkdir so realpath
  // succeeds on the freshly-created (or pre-existing) outDir.
  if (options.publicDirJail) {
    const { realpath } = await import('node:fs/promises');
    try {
      const outDirReal = await realpath(outDirAbs);
      const jailReal = await realpath(resolve(options.publicDirJail));
      if (outDirReal !== jailReal && !outDirReal.startsWith(jailReal + pathSep)) {
        throw new Error(
          `emitPagefindHTML: outDir "${options.outDir}" resolves (via symlink) outside ` +
            `publicDirJail. Real outDir: "${outDirReal}", real jail: "${jailReal}". ` +
            `Either remove the symlink or skip publicDirJail entirely.`,
        );
      }
    } catch (e) {
      // realpath() throws on missing paths or permission errors. Don't
      // swallow — propagate so caller knows the jail check couldn't
      // run.
      if (e instanceof Error && e.message.startsWith('emitPagefindHTML:')) throw e;
      throw new Error(
        `emitPagefindHTML: jail symlink-check failed for "${options.outDir}" / ` +
          `"${options.publicDirJail}". Underlying: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const filenames: string[] = [];
  for (const row of rows) {
    // Filename uses the row id (already sanitized as `<format>-<hex>`).
    // This guarantees no path-traversal characters reach disk.
    const filename = `${row.id}.html`;
    const filepath = resolve(outDirAbs, filename);
    // Defensive: re-verify the resolved filepath stays inside outDir.
    // Should be impossible to escape with our id format, but
    // belt-and-suspenders.
    if (!filepath.startsWith(outDirAbs + pathSep) && filepath !== outDirAbs) {
      throw new Error(
        `emitPagefindHTML: row id "${row.id}" produces a filepath outside outDir. Skipping.`,
      );
    }
    await mkdir(dirname(filepath), { recursive: true });
    await writeFile(filepath, renderPagefindHTML(row, options.baseUrl), 'utf-8');
    filenames.push(filename);
  }

  return {
    outDirAbs,
    pagesEmitted: filenames.length,
    filenames,
  };
}

// Re-export the row type for convenience.
export type { IndexedDocument } from './types.js';
