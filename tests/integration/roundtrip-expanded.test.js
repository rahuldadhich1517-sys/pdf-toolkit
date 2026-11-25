import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  textToPdf,
  imageToPdf,
  mergePdfs,
  splitPdf,
  rotatePdfPages,
  getPdfPageRotation,
  readPdfMetadata,
  updatePdfMetadata,
  compressPdf,
  extractPdfText,
  renderPdfPages,
  getPdfPageDimensions,
  PdfParser
} from '../../src/index.js';

describe('rigorous roundtrip verification', () => {
  test('Roundtrip 1: Text to PDF -> PDF to text', async () => {
    const input = 'First paragraph of verified content.\n\nSecond paragraph with Special Characters: & < > " ( ) \\ /';
    const pdfBytes = await textToPdf(input, { format: 'uint8array' });

    assert.ok(pdfBytes instanceof Uint8Array);
    const { text, pages } = await extractPdfText(pdfBytes);

    assert.equal(pages.length, 1);
    assert.ok(text.includes('First paragraph of verified content.'));
    assert.ok(text.includes('Second paragraph with Special Characters:'));
  });

  test('Roundtrip 2: Merge -> Split -> Verify original pages', async () => {
    const docA = await textToPdf('Document Alpha - Page 1\n\n' + 'Filler\n'.repeat(60) + 'Document Alpha - Page 2', { format: 'uint8array' });
    const docB = await textToPdf('Document Beta - Page 1', { format: 'uint8array' });

    const parserA = new PdfParser(docA);
    await parserA.parse();
    const countA = parserA.pages.length;

    const parserB = new PdfParser(docB);
    await parserB.parse();
    const countB = parserB.pages.length;

    // Merge
    const merged = await mergePdfs([docA, docB], { format: 'uint8array' });
    const parserMerged = new PdfParser(merged);
    await parserMerged.parse();
    assert.equal(parserMerged.pages.length, countA + countB);

    // Split back into single pages
    const splitDocs = await splitPdf(merged, { format: 'uint8array' });
    assert.equal(splitDocs.length, countA + countB);

    // Verify first page text
    const textPage1 = await extractPdfText(splitDocs[0]);
    assert.ok(textPage1.text.includes('Document Alpha'));

    // Verify last page text
    const textLastPage = await extractPdfText(splitDocs[splitDocs.length - 1]);
    assert.ok(textLastPage.text.includes('Document Beta'));
  });

  test('Roundtrip 3: Rotate -> Inspect rotation -> Re-rotate to 0', async () => {
    const original = await textToPdf('Rotation Roundtrip Content', { format: 'uint8array' });
    assert.equal(await getPdfPageRotation(original, 1), 0);

    const rotated90 = await rotatePdfPages(original, { degrees: 90, pages: [1] }, { format: 'uint8array' });
    assert.equal(await getPdfPageRotation(rotated90, 1), 90);

    const rotated180 = await rotatePdfPages(rotated90, { degrees: 90, pages: [1] }, { format: 'uint8array' });
    assert.equal(await getPdfPageRotation(rotated180, 1), 180);

    const rotatedBack = await rotatePdfPages(rotated180, { degrees: 180, pages: [1] }, { format: 'uint8array' });
    assert.equal(await getPdfPageRotation(rotatedBack, 1), 0);
  });

  test('Roundtrip 4: Metadata update -> Metadata read', async () => {
    const initial = await textToPdf('Metadata content', {
      format: 'uint8array',
      metadata: { Title: 'Initial Title', Author: 'Initial Author' }
    });

    const meta1 = await readPdfMetadata(initial);
    assert.equal(meta1.title, 'Initial Title');
    assert.equal(meta1.author, 'Initial Author');

    const updated = await updatePdfMetadata(
      initial,
      {
        Title: 'Audit Verified Title',
        Author: 'Security Auditor',
        Subject: 'Production Grade',
        Keywords: 'pdf, toolkit, production'
      },
      { format: 'uint8array' }
    );

    const meta2 = await readPdfMetadata(updated);
    assert.equal(meta2.title, 'Audit Verified Title');
    assert.equal(meta2.author, 'Security Auditor');
    assert.equal(meta2.subject, 'Production Grade');
    assert.equal(meta2.keywords, 'pdf, toolkit, production');
    assert.ok(meta2.modDate instanceof Date);
  });

  test('Roundtrip 5: Compression -> Parse and inspect structural output', async () => {
    const rawPdf = await textToPdf('Compressible repeating text.\n'.repeat(50), { format: 'uint8array' });
    const compressRes = await compressPdf(rawPdf, { format: 'uint8array' });

    assert.ok(compressRes.bytes instanceof Uint8Array);
    assert.equal(typeof compressRes.reductionPercentage, 'number');

    const parser = new PdfParser(compressRes.bytes);
    await parser.parse();
    assert.ok(parser.pages.length >= 1);

    const text = await extractPdfText(compressRes.bytes);
    assert.ok(text.text.includes('Compressible repeating text.'));
  });

  test('Roundtrip 6: Page dimensions and rendering metrics', async () => {
    const doc = await textToPdf('Metrics test', { pageSize: 'A4', orientation: 'landscape', format: 'uint8array' });
    const dims = await getPdfPageDimensions(doc, 1, 2.0);

    // A4 landscape is 841.89 x 595.28
    assert.ok(dims.width > dims.height);
    assert.equal(dims.pixelWidth, Math.round(dims.width * 2.0));
  });
});
