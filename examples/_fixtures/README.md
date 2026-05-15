# Example PDF fixtures

These PDFs are referenced by every example in `examples/*`. They're committed so the examples are hermetic: no network calls, no offsite hosting, reproducible search results across machines and CI runs.

## Provenance — these are random clicks, not curated samples

The PDFs here are **publicly available samples from ICJIA's website** ([icjia.illinois.gov](https://icjia.illinois.gov/)) — **randomly chosen** by clicking around ICJIA's many live PDFs. There's no rhyme or reason to *which* PDFs ended up here: they're just four arbitrary samples from the live corpus.

We're calling that out explicitly because "look how well it searches these specific PDFs" is a fair skepticism — managers and reviewers are right to wonder whether the demo was cherry-picked. It wasn't. Drop in any other PDF from any other source and the examples work identically. The randomness is the point.

These PDFs were already public, are republished here under fair use as illustrative integration samples, and **contain no personally identifiable information (PII)**.

## Files (at commit time)

The four fixtures landed here on 2026-05-15:

- `Drug Testing Lit Review-200203T22022729.pdf`
- `JJ_Statewide_Snapshot_2014_final_09132016-191011T20090709.pdf`
- `Overview_Methamphetamine_Trends-191011T20091574.pdf`
- `Stigma PDF for posting-230627T13295515.pdf`

The cryptic timestamp suffixes are the original Drupal URL slugs from ICJIA's CMS — preserved as-is so the filenames mirror what you'd encounter on the live site.

## Using your own PDFs

Replace any file in this directory with your own. **Every example auto-discovers all `.pdf` files in this directory** at build time — none of them hard-codes specific filenames. Drop in a new PDF, re-run the example, and your PDF is in the search index.

## Why `file://` URLs

Examples reference these PDFs via `file://` URLs and a small `local-fetch.mjs` helper that intercepts `file://` reads. This keeps every example runnable offline. In production, your PDFs are at real `https://...` URLs and the helper isn't needed.
