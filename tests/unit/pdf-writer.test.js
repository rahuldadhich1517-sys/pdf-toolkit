import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PdfWriter, STANDARD_FONTS } from '../../src/pdf-core/pdf-writer.js';
import { ContentStream } from '../../src/pdf-core/content-stream.js';
import { bytesToLatin1String } from '../../src/shared/binary.js';

describe('pdf-writer', () => {
  test('generates minimal valid PDF 1.4 binary structure', async () => {
    const writer = new PdfWriter();
    writer.setMetadata({
      Title: 'Test Document',
      Author: 'Rahul Dadhich'
    });

    const fontAlias = writer.useStandardFont(STANDARD_FONTS.Helvetica);
    const stream = new ContentStream();
    stream.beginText();
    stream.setFont(fontAlias, 14);
    stream.moveText(50, 750);
    stream.showText('Hello, PDF Writer!');
    stream.endText();

    await writer.addPage({
      size: [595.28, 841.89],
      content: stream,
      compressContent: false
    });

    const bytes = writer.build();
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 200);

    const pdfString = bytesToLatin1String(bytes);

    // Verify PDF header
    assert.ok(pdfString.startsWith('%PDF-1.4'));

    // Verify objects structure
    assert.ok(pdfString.includes('1 0 obj'));
    assert.ok(pdfString.includes('/Type /Pages'));
    assert.ok(pdfString.includes('/Type /Catalog'));
    assert.ok(pdfString.includes('/Type /Font'));

    // Verify xref table
    assert.ok(pdfString.includes('\nxref\n'));
    assert.ok(pdfString.includes('0000000000 65535 f '));

    // Verify trailer and startxref
    assert.ok(pdfString.includes('\ntrailer\n'));
    assert.ok(pdfString.includes('/Root'));
    assert.ok(pdfString.includes('startxref'));
    assert.ok(pdfString.endsWith('%%EOF') || pdfString.endsWith('%%EOF\n'));
  });

  test('correctly calculates byte offsets in xref table', async () => {
    const writer = new PdfWriter();
    const stream = new ContentStream();
    stream.beginText();
    stream.setFont(writer.useStandardFont(STANDARD_FONTS.Courier), 12);
    stream.moveText(100, 100);
    stream.showText('Byte offset test');
    stream.endText();

    await writer.addPage({ content: stream });
    const bytes = writer.build();
    const pdfString = bytesToLatin1String(bytes);

    // Locate startxref
    const startXrefMatch = pdfString.match(/startxref\r?\n(\d+)\r?\n%%EOF/);
    assert.ok(startXrefMatch, 'startxref must be present');
    const startXrefOffset = parseInt(startXrefMatch[1], 10);

    // Verify 'xref' appears at exact startxref byte offset
    const xrefSlice = pdfString.slice(startXrefOffset, startXrefOffset + 4);
    assert.equal(xrefSlice, 'xref');
  });

  test('supports multi-page document creation and page rotation', async () => {
    const writer = new PdfWriter();
    const f = writer.useStandardFont(STANDARD_FONTS.TimesRoman);

    for (let p = 1; p <= 3; p++) {
      const stream = new ContentStream();
      stream.beginText();
      stream.setFont(f, 12);
      stream.moveText(50, 500);
      stream.showText(`Page number ${p}`);
      stream.endText();

      await writer.addPage({
        content: stream,
        rotation: p === 2 ? 90 : 0
      });
    }

    const bytes = writer.build();
    const pdfString = bytesToLatin1String(bytes);
    assert.ok(pdfString.includes('/Count 3'));
    assert.ok(pdfString.includes('/Rotate 90'));
  });
});
