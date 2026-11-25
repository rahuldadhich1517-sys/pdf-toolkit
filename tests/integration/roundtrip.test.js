import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as toolkit from '../../src/index.js';

describe('end-to-end integration roundtrip', () => {
  test('full lifecycle: generate text PDF -> rotate -> update metadata -> compress -> split -> merge -> extract text', async () => {
    // 1. Generate text PDF
    const textContent =
      'Document Title: Integration Flow\n\n' +
      'This is an end-to-end verification of the @rahul_dadhich15/pdf-toolkit package.\n' +
      'All 16 tools adhere to the zero-dependency client-side architecture.\n';

    const initialPdf = await toolkit.textToPdf(textContent, {
      format: 'uint8array',
      metadata: { Title: 'Phase 1 Doc', Author: 'Tester' }
    });

    assert.ok(initialPdf instanceof Uint8Array);

    // 2. Rotate page
    const rotatedPdf = await toolkit.rotatePdfPages(
      initialPdf,
      { degrees: 90, pages: 'all' },
      { format: 'uint8array' }
    );
    const rotation = await toolkit.getPdfPageRotation(rotatedPdf, 1);
    assert.equal(rotation, 90);

    // 3. Update metadata
    const updatedMetaPdf = await toolkit.updatePdfMetadata(
      rotatedPdf,
      { Title: 'Updated In Roundtrip', Subject: 'Automated Test' },
      { format: 'uint8array' }
    );
    const meta = await toolkit.readPdfMetadata(updatedMetaPdf);
    assert.equal(meta.title, 'Updated In Roundtrip');
    assert.equal(meta.subject, 'Automated Test');

    // 4. Compress PDF
    const compressResult = await toolkit.compressPdf(updatedMetaPdf, { format: 'uint8array' });
    assert.ok(compressResult.bytes instanceof Uint8Array);

    // 5. Split document
    const splitParts = await toolkit.splitPdf(compressResult.bytes, { format: 'uint8array' });
    assert.equal(splitParts.length, 1);

    // 6. Merge with another document
    const secondDoc = await toolkit.textToPdf('Second document page text.', { format: 'uint8array' });
    const mergedDoc = await toolkit.mergePdfs([splitParts[0], secondDoc], { format: 'uint8array' });

    // 7. Extract text from merged document
    const extracted = await toolkit.extractPdfText(mergedDoc);
    assert.ok(extracted.text.includes('Integration Flow'));
    assert.ok(extracted.text.includes('Second document page text.'));
    assert.equal(extracted.pages.length, 2);
  });

  test('subpath exports integrity', async () => {
    // Verify each subpath module can be imported cleanly
    const subpaths = [
      'base64-to-pdf',
      'html-to-pdf',
      'image-to-pdf',
      'markdown-to-pdf',
      'pdf-compress',
      'pdf-merge',
      'pdf-metadata',
      'pdf-encrypt',
      'pdf-decrypt',
      'pdf-rotate',
      'pdf-split',
      'pdf-to-image',
      'pdf-to-raw',
      'pdf-to-text',
      'text-to-pdf',
      'tiff-to-pdf',
      'capabilities'
    ];

    for (const sub of subpaths) {
      const mod = await import(`../../src/${sub}/index.js`);
      assert.ok(mod, `Subpath ${sub} must export valid module`);
    }
  });
});
