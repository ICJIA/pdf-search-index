import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  loadOfficeParser,
  OFFICEPARSER_RELATIVE_SPECIFIER,
  OFFICEPARSER_PACKAGE_SPECIFIER,
} from '../src/office-loader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_VENDORED = join(HERE, '..', 'dist', 'vendor', 'officeparser', 'officeParser.cjs');

// Regression coverage for the bundled-consumer failure: a framework that
// bundles this package (e.g. an Astro/Vite prerendered endpoint calling
// indexDocuments()) relocates the calling code into the CONSUMER's output,
// where the relative `./vendor/...` require no longer resolves. Before the
// package-name fallback, every DOCX/PPTX/XLSX silently extracted empty on
// such builds (observed in the field: ICJIA DVFR on Netlify).
describe('loadOfficeParser', () => {
  it('uses the relative specifier when it resolves (unbundled fast path)', () => {
    const marker = { parseOfficeAsync: async () => 'relative' };
    const calls: string[] = [];
    const fake = (id: string) => {
      calls.push(id);
      return marker;
    };
    expect(loadOfficeParser(fake)).toBe(marker);
    expect(calls).toEqual([OFFICEPARSER_RELATIVE_SPECIFIER]);
  });

  it('falls back to the package-name specifier when the relative path misses (bundled consumer)', () => {
    const marker = { parseOfficeAsync: async () => 'package' };
    const calls: string[] = [];
    const fake = (id: string) => {
      calls.push(id);
      if (id === OFFICEPARSER_RELATIVE_SPECIFIER) {
        throw new Error(`Cannot find module '${id}'`);
      }
      return marker;
    };
    expect(loadOfficeParser(fake)).toBe(marker);
    expect(calls).toEqual([OFFICEPARSER_RELATIVE_SPECIFIER, OFFICEPARSER_PACKAGE_SPECIFIER]);
  });

  it('reports BOTH attempted specifiers when both fail', () => {
    const fake = (id: string) => {
      throw new Error(`nope: ${id}`);
    };
    let message = '';
    try {
      loadOfficeParser(fake);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain(OFFICEPARSER_RELATIVE_SPECIFIER);
    expect(message).toContain(OFFICEPARSER_PACKAGE_SPECIFIER);
  });

  it('loads the real vendored module with the default require (dev/src tree)', () => {
    const mod = loadOfficeParser();
    expect(typeof mod.parseOfficeAsync).toBe('function');
  });

  // The exports-map half of the fix. Node's package self-reference resolves
  // the bare specifier against THIS package's own `exports`, exactly like a
  // consumer's node_modules lookup would — so this proves the subpath works
  // without simulating an install. Needs dist/vendor/ (CI builds before
  // testing; skipped on a local unbuilt checkout).
  it.skipIf(!existsSync(DIST_VENDORED))(
    'package-name subpath resolves through the exports map (survives consumer bundling)',
    () => {
      const req = createRequire(import.meta.url);
      const resolved = req.resolve(OFFICEPARSER_PACKAGE_SPECIFIER);
      expect(resolved.endsWith(join('dist', 'vendor', 'officeparser', 'officeParser.cjs'))).toBe(
        true,
      );
      const mod = req(OFFICEPARSER_PACKAGE_SPECIFIER) as { parseOfficeAsync: unknown };
      expect(typeof mod.parseOfficeAsync).toBe('function');
    },
  );
});
