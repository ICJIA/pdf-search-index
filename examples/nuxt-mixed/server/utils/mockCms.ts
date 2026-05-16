// Mock the kind of payload a Strapi-style CMS would return — id, title, body.
// To exercise the dedupe path realistically, the mock CMS owns exactly ONE
// of the fixtures (the last one alphabetically) — the rest are owned by the
// @nuxt/content source (see scripts/generate-content.mjs).
//
// `fixturesDir` is embedded as an absolute path in runtimeConfig at build
// time (see nuxt.config.ts), so this works in dev, build, and preview
// regardless of process.cwd().
import { readdirSync } from 'node:fs';
import { resolve, parse } from 'node:path';
import { useRuntimeConfig } from '#imports';

function humanize(stem: string): string {
  return stem
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getMockCmsPages(): { id: string; title: string; body: string }[] {
  const { fixturesDir } = useRuntimeConfig();
  const fixturesAbs = fixturesDir as string;
  const pdfs = readdirSync(fixturesAbs)
    .filter((e) => e.toLowerCase().endsWith('.pdf'))
    .sort();
  if (pdfs.length === 0) return [];
  const cmsOwned = pdfs[pdfs.length - 1]!;
  const stem = parse(cmsOwned).name;
  const cleanStem = stem.replace(/-\d{6}T\d{8}$/, '').replace(/-\d{8,}$/, '');
  const title = humanize(cleanStem);
  const url = new URL(`file://${resolve(fixturesAbs, cmsOwned)}`).href;
  return [
    {
      id:
        'cms-' +
        cmsOwned
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40),
      title,
      body: `A random ICJIA-public sample document, served via a mocked CMS: [${title}](${url}).`,
    },
  ];
}
