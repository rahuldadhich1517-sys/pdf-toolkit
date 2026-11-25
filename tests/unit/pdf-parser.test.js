import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PdfParser } from '../../src/pdf-core/pdf-parser.js';
import { PdfWriter, STANDARD_FONTS } from '../../src/pdf-core/pdf-writer.js';
import { ContentStream } from '../../src/pdf-core/content-stream.js';
import { PdfToolkitError, ERROR_CODES } from '../../src/shared/errors.js';
import { stringToBytes } from '../../src/shared/binary.js';

describe('pdf-parser', () => {
  async function createSamplePdf(pageCount = 2) {
    const writer = new PdfWriter();
    writer.setMetadata({ Title: 'Sample Parser PDF', Author: 'Tester' });
    const font = writer.useStandardFont(STANDARD_FONTS.Helvetica);

    for (let i = 1; i <= pageCount; i++) {
      const stream = new ContentStream();
      stream.beginText();
      stream.setFont(font, 12);
      stream.moveText(50, 700);
      stream.showText(`Page content ${i}`);
      stream.endText();
      await writer.addPage({ content: stream });
    }
    return writer.build();
  }

  test('successfully parses valid basic PDF', async () => {
    const pdfBytes = await createSamplePdf(2);
    const parser = new PdfParser(pdfBytes);
    await parser.parse();

    assert.equal(parser.pdfVersion, '1.4');
    assert.equal(parser.pages.length, 2);
    assert.ok(parser.rootRef);
    assert.ok(parser.infoRef);
  });

  test('rejects file without valid PDF header', async () => {
    const invalidBytes = stringToBytes('This is not a PDF file');
    const parser = new PdfParser(invalidBytes);
    await assert.rejects(
      async () => parser.parse(),
      { code: ERROR_CODES.INVALID_PDF }
    );
  });

  test('rejects PDF missing startxref marker', async () => {
    const pdfBytes = await createSamplePdf(1);
    // Truncate trailer
    const corruptedBytes = pdfBytes.subarray(0, pdfBytes.length - 30);
    const parser = new PdfParser(corruptedBytes);
    await assert.rejects(
      async () => parser.parse(),
      { code: ERROR_CODES.INVALID_PDF }
    );
  });

  test('rejects encrypted PDFs with ENCRYPTED_PDF error', async () => {
    // Construct mock PDF trailer with /Encrypt
    let rawPdf =
      '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
      '3 0 obj\n<< /Filter /Standard >>\nendobj\n';
    const xrefOffset = rawPdf.length;
    rawPdf +=
      'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000109 00000 n \n' +
      'trailer\n<< /Size 4 /Root 1 0 R /Encrypt 3 0 R >>\n' +
      `startxref\n${xrefOffset}\n%%EOF`;

    const parser = new PdfParser(stringToBytes(rawPdf));
    await assert.rejects(
      async () => parser.parse(),
      { code: ERROR_CODES.ENCRYPTED_PDF }
    );
  });

  test('rejects unsupported stream filter', async () => {
    const pdfBytes = await createSamplePdf(1);
    const parser = new PdfParser(pdfBytes);
    await parser.parse();

    // Mock stream with unsupported filter using real PdfStream and PdfDict
    const { PdfStream, PdfDict, PdfName } = await import('../../src/shared/pdf-types.js');
    const fakeStream = new PdfStream(
      new PdfDict({ Filter: new PdfName('Crypt') }),
      new Uint8Array(10)
    );
    await assert.rejects(
      async () => parser.decodeStream(fakeStream),
      { code: ERROR_CODES.UNSUPPORTED_FILTER }
    );
  });
});
