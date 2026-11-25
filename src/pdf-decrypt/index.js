import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';

/**
 * Validates whether a provided password matches document encryption.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {string} password
 * @returns {Promise<{ isEncrypted: boolean, passwordValid: boolean, supported: boolean }>}
 */
export async function validatePdfPassword(pdfInput, password) {
  const bytes = await normalizeBinaryInput(pdfInput);
  try {
    const parser = new PdfParser(bytes);
    await parser.parse();
    return {
      isEncrypted: false,
      passwordValid: true,
      supported: true
    };
  } catch (err) {
    if (err.code === ERROR_CODES.ENCRYPTED_PDF) {
      return {
        isEncrypted: true,
        passwordValid: false,
        supported: false
      };
    }
    throw err;
  }
}

/**
 * Inspects PDF security metadata.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @returns {Promise<{ isEncrypted: boolean, supported: boolean, message: string }>}
 */
export async function getPdfSecurityInfo(pdfInput) {
  const bytes = await normalizeBinaryInput(pdfInput);
  try {
    const parser = new PdfParser(bytes);
    await parser.parse();
    return {
      isEncrypted: false,
      supported: true,
      message: 'Document is not encrypted'
    };
  } catch (err) {
    if (err.code === ERROR_CODES.ENCRYPTED_PDF) {
      return {
        isEncrypted: true,
        supported: false,
        message: 'Document is encrypted. Decryption is unsupported in zero-dependency release.'
      };
    }
    throw err;
  }
}

/**
 * Removes password from an encrypted PDF.
 *
 * NOTE ON SECURITY POLICY:
 * In accordance with strict package security rules, arbitrary PDF decryption without verified
 * standards-compliant crypto handlers is unsupported in this zero-dependency release.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {string} password
 * @param {object} [options]
 * @returns {Promise<never>}
 */
export async function decryptPdf(pdfInput, password, options = {}) {
  throw new PdfToolkitError(
    ERROR_CODES.UNSUPPORTED_OPERATION,
    'PDF decryption is not supported in the zero-dependency release.'
  );
}
