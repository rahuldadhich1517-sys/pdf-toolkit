import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToPdf,
  parsePdfDataUri,
  validatePdfBase64,
  getPdfBase64Metadata
} from '../../src/base64-to-pdf/index.js';
import { PdfToolkitError, ERROR_CODES } from '../../src/shared/errors.js';
import { encodeBase64 } from '../../src/shared/binary.js';

describe('base64-to-pdf', () => {
  const minimalPdfHeader = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF';
  const validBase64 = encodeBase64(new TextEncoder().encode(minimalPdfHeader));
  const validDataUri = `data:application/pdf;base64,${validBase64}`;

  test('converts valid Base64 string to Uint8Array', () => {
    const bytes = base64ToPdf(validBase64, { format: 'uint8array' });
    assert.ok(bytes instanceof Uint8Array);
    const decodedStr = new TextDecoder().decode(bytes);
    assert.ok(decodedStr.startsWith('%PDF-1.4'));
  });

  test('converts valid PDF Data URI', () => {
    const bytes = base64ToPdf(validDataUri, { format: 'uint8array' });
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(new TextDecoder().decode(bytes).startsWith('%PDF-1.4'));
  });

  test('parses PDF Data URI', () => {
    const parsed = parsePdfDataUri(validDataUri);
    assert.equal(parsed.mimeType, 'application/pdf');
    assert.equal(parsed.base64, validBase64);
  });

  test('validates PDF Base64 signature', () => {
    const checkValid = validatePdfBase64(validBase64);
    assert.equal(checkValid.valid, true);

    const checkInvalid = validatePdfBase64('SGVsbG8gV29ybGQ='); // "Hello World"
    assert.equal(checkInvalid.valid, false);
    assert.match(checkInvalid.error, /magic bytes/);
  });

  test('extracts metadata from Base64 PDF', () => {
    const meta = getPdfBase64Metadata(validDataUri);
    assert.equal(meta.isDataUri, true);
    assert.equal(meta.mimeType, 'application/pdf');
    assert.equal(meta.pdfVersion, '1.4');
  });

  test('rejects non-string or empty input', () => {
    assert.throws(() => base64ToPdf(null), { code: ERROR_CODES.INVALID_INPUT });
    assert.throws(() => base64ToPdf(''), { code: ERROR_CODES.INVALID_INPUT });
  });

  test('rejects invalid Base64 characters', () => {
    assert.throws(() => base64ToPdf('This is not base 64!!!'), { code: ERROR_CODES.INVALID_INPUT });
  });

  test('rejects Base64 without valid %PDF- magic bytes', () => {
    const notPdfB64 = encodeBase64(new TextEncoder().encode('Hello World'));
    assert.throws(() => base64ToPdf(notPdfB64), { code: ERROR_CODES.INVALID_PDF });
  });

  test('enforces custom max size limits', () => {
    assert.throws(
      () => base64ToPdf(validBase64, { maxSize: 10 }),
      { code: ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED }
    );
  });
});
