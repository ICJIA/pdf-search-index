# Vendored dependencies

Source files in this directory are **copies of upstream packages**, vendored into
`@icjia/pdf-search-index` so the package's DOCX/PPTX/XLSX path keeps working
even if the upstream package is removed from npm.

## Why vendor

The package depended on `officeparser` (a single-maintainer npm package) for
DOCX / PPTX / XLSX text extraction. If that package were ever taken down
(takedown notice, supply-chain compromise, account deletion), every
`@icjia/pdf-search-index` install would silently lose Office-format support.
Vendoring the source removes that risk: the upstream package can disappear
from npm tomorrow and our `parseOfficeDoc` path still works because the
code lives in this repo.

## What's vendored (v1.4)

- **`officeparser/officeParser.cjs`** — byte-identical copy of
  `officeparser@5.2.2`'s `officeParser.js`. MIT-licensed, see
  `officeparser/LICENSE`. Used by `parseOfficeDoc` in `../extractor.ts` via
  a dynamic `import()` with `import.meta.url` resolution.

## What's NOT vendored

The vendored `officeParser.cjs` still `require()`s four transitive deps at
top of file:

- `concat-stream` (~5 KB, npm: ~30M weekly downloads)
- `@xmldom/xmldom` (~150 KB, npm: ~20M weekly downloads)
- `file-type` (~50 KB, npm: ~60M weekly downloads)
- `yauzl` (~80 KB, npm: ~30M weekly downloads)

These are kept as direct npm `dependencies` of `@icjia/pdf-search-index`
because:

1. Each is a widely-used package with multiple maintainers — significantly
   lower takedown risk than a single-maintainer parser.
2. Combined they'd add ~285 KB of source we'd need to keep in lockstep with
   upstream — meaningful maintenance burden for marginal protection.
3. If any of these *are* taken down, the path-of-recovery is short: vendor
   just that one (small) package without re-vendoring `officeparser`.

Full transitive-dep vendoring is tracked for a future release if user
demand warrants the maintenance cost.

## Upstream tracking

| Vendored copy | Upstream | Pinned version | Source URL |
| ------------- | -------- | -------------- | ---------- |
| `officeparser/officeParser.cjs` | `officeparser` | 5.2.2 | https://github.com/harshankur/officeParser/blob/v5.2.2/officeParser.js |

To pull a new upstream version: replace `officeParser.cjs` with the new
upstream `officeParser.js`, verify the four `require()` calls at the top
haven't changed, run the security test suite (ZIP-slip + XXE probes), and
bump the table above. Do NOT modify the vendored source manually — keep
it byte-identical to upstream so version-tracking stays unambiguous.
