import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { decodeBase64, createBlob, bytesToLatin1String } from '../shared/binary.js';
import { DEFAULT_LIMITS, resolveLimits } from '../shared/limits.js';

/**
 * Parses a Data URI into its MIME type and Base64 payload.
 * @param {string} dataUri
 * @returns {{ mimeType: string, base64: string }}
 */
export function parsePdfDataUri(dataUri) {
  if (typeof dataUri !== 'string') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Input must be a data URI string');
  }

  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new PdfToolkitError(
      ERROR_CODES.INVALID_INPUT,
      'Invalid PDF Data URI format. Expected format: data:<mime-type>;base64,<payload>'
    );
  }

  return {
    mimeType: match[1].trim().toLowerCase(),
    base64: match[2].trim()
  };
}

/**
 * Validates Base64 or Data URI string for PDF signature.
 * @param {string} input
 * @returns {{ valid: boolean, error?: string, size?: number }}
 */
export function validatePdfBase64(input) {
  try {
    let rawBase64 = input;
    if (typeof input === 'string' && input.startsWith('data:')) {
      const parsed = parsePdfDataUri(input);
      rawBase64 = parsed.base64;
    }
    const bytes = decodeBase64(rawBase64);
    if (bytes.length < 5) {
      return { valid: false, error: 'Content too small to contain PDF header' };
    }
    const header = bytesToLatin1String(bytes.subarray(0, 10));
    if (!header.includes('%PDF-')) {
      return { valid: false, error: 'Missing %PDF- header magic bytes' };
    }
    return { valid: true, size: bytes.length };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Returns metadata from a PDF Base64 string.
 * @param {string} input
 * @returns {{ size: number, isDataUri: boolean, mimeType?: string, pdfVersion?: string }}
 */
export function getPdfBase64Metadata(input) {
  let isDataUri = false;
  let mimeType;
  let rawBase64 = input;

  if (typeof input === 'string' && input.startsWith('data:')) {
    const parsed = parsePdfDataUri(input);
    rawBase64 = parsed.base64;
    mimeType = parsed.mimeType;
    isDataUri = true;
  }

  const bytes = decodeBase64(rawBase64);
  const headStr = bytesToLatin1String(bytes.subarray(0, 1024));
  const versionMatch = headStr.match(/%PDF-(\d+\.\d+)/);

  return {
    size: bytes.length,
    isDataUri,
    mimeType,
    pdfVersion: versionMatch ? versionMatch[1] : undefined
  };
}

/**
 * Decodes Base64 or PDF Data URI into a PDF Uint8Array or Blob.
 *
 * @param {string} input Plain Base64 or Data URI
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @param {number} [options.maxSize]
 * @returns {Blob | Uint8Array}
 */
export function base64ToPdf(input, options = {}) {
  if (typeof input !== 'string') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'base64ToPdf requires a string input');
  }

  const limits = resolveLimits({ maxFileSize: options.maxSize });
  let rawBase64 = input;

  if (input.startsWith('data:')) {
    const parsed = parsePdfDataUri(input);
    if (parsed.mimeType !== 'application/pdf' && parsed.mimeType !== 'application/x-pdf') {
      // Do not trust MIME alone, but alert if completely divergent
    }
    rawBase64 = parsed.base64;
  }

  const bytes = decodeBase64(rawBase64, limits.maxFileSize);

  // Validate PDF magic bytes %PDF-
  if (bytes.length < 5) {
    throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Decoded bytes are too small to be a PDF');
  }

  const headStr = bytesToLatin1String(bytes.subarray(0, Math.min(1024, bytes.length)));
  if (!headStr.includes('%PDF-')) {
    throw new PdfToolkitError(
      ERROR_CODES.INVALID_PDF,
      'Decoded payload does not start with valid PDF magic bytes (%PDF-)'
    );
  }

  if (options.format === 'uint8array') {
    return bytes;
  }

  return createBlob([bytes], 'application/pdf');
}
