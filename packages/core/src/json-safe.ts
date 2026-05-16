/**
 * Serialize a value as JSON safe for embedding in an HTML `<script>` block.
 *
 * `JSON.stringify` does not escape `</`, `-->`, or `<!--`, so PDF text
 * containing the literal `</script>` would otherwise let an attacker break
 * out of a surrounding `<script type="application/json">...</script>`
 * embedding. We also escape U+2028 / U+2029 because older JS parsers (and
 * any environment that runs the JSON through `eval`) treat them as line
 * terminators inside string literals.
 *
 * Use this in place of `JSON.stringify` whenever the JSON output may be
 * inlined into HTML -- the CLI's `--out` writer and the Astro adapter's
 * emit both go through this helper.
 *
 * Implementation note: the U+2028 / U+2029 regexes are built via the
 * `RegExp` constructor using `String.fromCharCode(...)` because some
 * parsers (esbuild, pre-ES2019 engines) reject those literal codepoints
 * inside a regex literal as an unterminated regex.
 */
const RE_LS = new RegExp(String.fromCharCode(0x2028), 'g');
const RE_PS = new RegExp(String.fromCharCode(0x2029), 'g');

export function safeJSONForHTML(obj: unknown, indent?: number): string {
  return JSON.stringify(obj, null, indent)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e')
    .replace(RE_LS, '\\u2028')
    .replace(RE_PS, '\\u2029');
}
