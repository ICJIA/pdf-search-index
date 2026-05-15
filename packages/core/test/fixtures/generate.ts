// Generate test fixture PDFs using pdf-lib. Run via `pnpm fixtures`.
// Produces:
//   small-text.pdf   — single page, "Hello applicant portal world" text
//   multi-page.pdf   — three pages, distinct text per page
//   image-only.pdf   — single page, only a drawn rectangle (no text layer)
//
// `encrypted.pdf` is generated via a Node-side encryption step using pdf-lib's
// save options if available; otherwise the encrypted-PDF case is exercised
// via a mocked unpdf in the extractor test.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  // small-text.pdf
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([300, 200]);
    page.drawText('Hello applicant portal world', {
      x: 20,
      y: 100,
      font,
      size: 14,
      color: rgb(0, 0, 0),
    });
    writeFileSync(join(here, 'small-text.pdf'), await doc.save());
  }

  // multi-page.pdf
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 3; i++) {
      const page = doc.addPage([300, 200]);
      page.drawText(`Page ${i} content unique-marker-${i}`, {
        x: 20,
        y: 100,
        font,
        size: 14,
      });
    }
    writeFileSync(join(here, 'multi-page.pdf'), await doc.save());
  }

  // image-only.pdf (no text layer; just a drawn rectangle)
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    page.drawRectangle({
      x: 50,
      y: 50,
      width: 100,
      height: 80,
      color: rgb(0.2, 0.4, 0.8),
    });
    writeFileSync(join(here, 'image-only.pdf'), await doc.save());
  }

  console.log('Generated fixtures: small-text.pdf, multi-page.pdf, image-only.pdf');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
