/**
 * Standard error codes and error class for @rahul_dadhich15/pdf-toolkit.
 */

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_PDF: 'INVALID_PDF',
  UNSUPPORTED_PDF_VERSION: 'UNSUPPORTED_PDF_VERSION',
  UNSUPPORTED_PDF_FEATURE: 'UNSUPPORTED_PDF_FEATURE',
  UNSUPPORTED_FILTER: 'UNSUPPORTED_FILTER',
  UNSUPPORTED_FONT_ENCODING: 'UNSUPPORTED_FONT_ENCODING',
  ENCRYPTED_PDF: 'ENCRYPTED_PDF',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  INVALID_PAGE_RANGE: 'INVALID_PAGE_RANGE',
  PAGE_NOT_FOUND: 'PAGE_NOT_FOUND',
  INVALID_METADATA: 'INVALID_METADATA',
  IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED',
  TIFF_NOT_SUPPORTED: 'TIFF_NOT_SUPPORTED',
  FILE_SIZE_LIMIT_EXCEEDED: 'FILE_SIZE_LIMIT_EXCEEDED',
  PAGE_COUNT_LIMIT_EXCEEDED: 'PAGE_COUNT_LIMIT_EXCEEDED',
  MALFORMED_PDF_OBJECT: 'MALFORMED_PDF_OBJECT',
  STREAM_DECOMPRESSION_FAILED: 'STREAM_DECOMPRESSION_FAILED',
  DOCUMENT_SIGNATURE_PRESENT: 'DOCUMENT_SIGNATURE_PRESENT'
});

export class PdfToolkitError extends Error {
  /**
   * @param {string} code One of ERROR_CODES
   * @param {string} message Descriptive error message
   * @param {Record<string, unknown>} [details] Additional structured context
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PdfToolkitError';
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PdfToolkitError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}
