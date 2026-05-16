# Example PDF fixtures

These PDFs are referenced by every example in `examples/*`. They're committed so the examples are hermetic: no network calls, no offsite hosting, reproducible search results across machines and CI runs.

## Provenance — these are random clicks, not curated samples

The PDFs here are **publicly available samples from ICJIA's website** ([icjia.illinois.gov](https://icjia.illinois.gov/)) — **randomly chosen** by clicking around ICJIA's many live PDFs. There's no rhyme or reason to _which_ PDFs ended up here: they're arbitrary samples from the live corpus.

We're calling that out explicitly because "look how well it searches these specific PDFs" is a fair skepticism — managers and reviewers are right to wonder whether the demo was cherry-picked. It wasn't. Drop in any other PDF from any other source and the examples work identically. The randomness is the point.

These PDFs were already publicly available, are included here as illustrative integration samples, and **contain no personally identifiable information (PII)**.

## Files

The fixtures landed here on 2026-05-15 and have grown opportunistically since — to see the current list, run:

```bash
ls examples/_fixtures/*.pdf
```

Topic mix as of this writing covers juvenile justice, public health, evaluation reports, methamphetamine trends, substance-use stigma, youth and alcohol, and other ICJIA programmatic topics. The cryptic timestamp suffixes on the filenames are the original Drupal URL slugs from ICJIA's CMS — preserved as-is so the filenames mirror what you'd encounter on the live site.

## Using your own PDFs

Replace any file in this directory with your own. **Every example auto-discovers all `.pdf` files in this directory** at build time — none of them hard-codes specific filenames. Drop in a new PDF, re-run the example, and your PDF is in the search index.

## Why `file://` URLs

Examples reference these PDFs via `file://` URLs and a small `local-fetch.mjs` helper that intercepts `file://` reads. This keeps every example runnable offline. In production, your PDFs are at real `https://...` URLs and the helper isn't needed.
