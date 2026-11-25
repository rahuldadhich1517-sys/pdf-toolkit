import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PdfWriter } from '../../src/pdf-core/pdf-writer.js';
import { ContentStream } from '../../src/pdf-core/content-stream.js';
import { readPdfMetadata, updatePdfMetadata } from '../../src/pdf-metadata/index.js';
import { rotatePdfPages, getPdfPageRotation } from '../../src/pdf-rotate/index.js';
import { splitPdf, extractPdfPages } from '../../src/pdf-split/index.js';
import { mergePdfs } from '../../src/pdf-merge/index.js';
import { compressPdf } from '../../src/pdf-compress/index.js';
import { PdfParser } from '../../src/pdf-core/pdf-parser.js';

describe('pdf manipulation utilities', () => {
  async function makeSamplePdf(text, pages = 3) {
    const writer = new PdfWriter();
    writer.setMetadata({ Title: 'Original Title', Author: 'Original Author' });
    const f = writer.useStandardFont();
    for (let i = 1; i <= pages; i++) {
      const stream = new ContentStream();
      stream.beginText();
      stream.setFont(f, 12);
      stream.moveText(50, 700);
      stream.showText(`${text} Page ${i}`);
      stream.endText();
      await writer.addPage({ content: stream, compressContent: false });
    }
    return writer.build();
  }

  describe('pdf-metadata', () => {
    test('reads and updates metadata correctly', async () => {
      const pdf = await makeSamplePdf('Metadata Test', 1);
      const meta = await readPdfMetadata(pdf);
      assert.equal(meta.title, 'Original Title');
      assert.equal(meta.author, 'Original Author');

      const updatedPdf = await updatePdfMetadata(
        pdf,
        {
          Title: 'Updated New Title',
          Author: 'New Author',
          Subject: 'Unit Testing'
        },
        { format: 'uint8array' }
      );

      const newMeta = await readPdfMetadata(updatedPdf);
      assert.equal(newMeta.title, 'Updated New Title');
      assert.equal(newMeta.author, 'New Author');
      assert.equal(newMeta.subject, 'Unit Testing');
    });
  });

  describe('pdf-rotate', () => {
    test('rotates individual page or all pages', async () => {
      const pdf = await makeSamplePdf('Rotate Test', 3);
      assert.equal(await getPdfPageRotation(pdf, 2), 0);

      const rotated = await rotatePdfPages(
        pdf,
        { degrees: 90, pages: [2], relative: true },
        { format: 'uint8array' }
      );

      assert.equal(await getPdfPageRotation(rotated, 1), 0);
      assert.equal(await getPdfPageRotation(rotated, 2), 90);
      assert.equal(await getPdfPageRotation(rotated, 3), 0);

      // Rotate all
      const rotateAll = await rotatePdfPages(
        rotated,
        { degrees: 180, pages: 'all' },
        { format: 'uint8array' }
      );
      assert.equal(await getPdfPageRotation(rotateAll, 1), 180);
      assert.equal(await getPdfPageRotation(rotateAll, 2), 270);
    });
  });

  describe('pdf-split', () => {
    test('splits multi-page document into single page documents', async () => {
      const pdf = await makeSamplePdf('Split Test', 3);
      const parts = await splitPdf(pdf, { format: 'uint8array' });
      assert.equal(parts.length, 3);

      for (const part of parts) {
        const parser = new PdfParser(part);
        await parser.parse();
        assert.equal(parser.pages.length, 1);
      }
    });

    test('extracts specific page subset', async () => {
      const pdf = await makeSamplePdf('Extract Test', 4);
      const extracted = await extractPdfPages(pdf, [1, 3], { format: 'uint8array' });

      const parser = new PdfParser(extracted);
      await parser.parse();
      assert.equal(parser.pages.length, 2);
    });
  });

  describe('pdf-merge', () => {
    test('merges multiple PDF files into one with combined page tree', async () => {
      const pdf1 = await makeSamplePdf('Doc 1', 2);
      const pdf2 = await makeSamplePdf('Doc 2', 2);

      const merged = await mergePdfs([pdf1, pdf2], { format: 'uint8array' });
      const parser = new PdfParser(merged);
      await parser.parse();
      assert.equal(parser.pages.length, 4);
    });
  });

  describe('pdf-compress', () => {
    test('compresses and reports accurate reduction stats', async () => {
      const pdf = await makeSamplePdf('Compress Test', 2);
      const result = await compressPdf(pdf, { format: 'uint8array' });

      assert.ok(result.originalSize > 0);
      assert.ok(result.compressedSize > 0);
      assert.equal(typeof result.reductionPercentage, 'number');
      assert.ok(result.bytes instanceof Uint8Array);

      // Verify the compressed document is structurally intact
      const parser = new PdfParser(result.bytes);
      await parser.parse();
      assert.equal(parser.pages.length, 2);
    });
  });
});
