/**
 * Tiny string-scrubbing helpers shared across the package. Lives in its
 * own file (no Node-only imports) so the browser-facing entries
 * (`/flexsearch`, `/snippet`, `/worker`, `/pagefind`) can import them
 * without dragging `node:module` / `node:fs` / etc. into the client
 * bundle via the much-larger `extractor.ts`.
 *
 * Added in v1.4 when `/extractor` started using `createRequire` (for
 * the vendored officeparser CJS load) and downstream entries that
 * imported `scrubControl` started failing in Vite's browser build
 * with `Module "module" has been externalized for browser compatibility`.
 */

/**
 * Strip ASCII control bytes (NUL through US, plus DEL) from a string,
 * replacing each with `?`. Used to defang user-controlled error messages
 * and extracted PDF text before they're concatenated into emit paths
 * (log lines, HTML body text, thrown Error messages).
 *
 * Conservative — also strips CR, LF, tab. Inputs are expected to be
 * single-line ASCII-clean strings (URLs, error messages, extracted text
 * fragments). Multi-line content should be split BEFORE scrubbing.
 */
export function scrubControl(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f]/g, '?');
}

/**
 * Reduce a URL to `protocol//host`, scrubbed. Used in failure logs so
 * we don't disclose path / query / fragment in error output. Falls
 * back to `[invalid-url]` for non-URL strings.
 */
export function scrubUrl(url: string): string {
  try {
    const u = new URL(url);
    return scrubControl(`${u.protocol}//${u.host}`);
  } catch {
    return '[invalid-url]';
  }
}
