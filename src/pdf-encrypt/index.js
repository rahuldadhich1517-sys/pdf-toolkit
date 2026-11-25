import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';

/**
 * Validates encryption options against supported capability parameters.
 * @param {object} [options]
 */
export function validateEncryptionOptions(options = {}) {
  return {
    supported: false,
    reason: 'PDF Standard Security Handler (AES/RC4) is not available in the zero-dependency release.'
  };
}

/**
 * Returns encryption status information for a PDF document.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @returns {Promise<object>}
 */
export async function getPdfEncryptionInfo(pdfInput) {
  const bytes = await normalizeBinaryInput(pdfInput);
  try {
    const parser = new PdfParser(bytes);
    await parser.parse();
    return {
      isEncrypted: false,
      algorithm: null,
      permissions: null
    };
  } catch (err) {
    if (err.code === ERROR_CODES.ENCRYPTED_PDF) {
      return {
        isEncrypted: true,
        algorithm: 'Unknown / Standard Security Handler',
        supportedInToolkit: false
      };
    }
    throw err;
  }
}

/**
 * Password-protects a PDF document.
 *
 * NOTE ON SECURITY POLICY:
 * In accordance with strict package security rules, we do not implement custom XOR, Base64,
 * or unreviewed ad-hoc cryptographic handlers masquerading as real PDF Standard Security.
 * Standards-compliant PDF encryption requires full implementation of PDF Standard Security Handler
 * Revision 2-6 (ISO 32000-1 Clause 7.6), which cannot be verified without external cryptography
 * or native crypto primitives covering all PDF revisions.
 *
 * This operation is marked UNSUPPORTED_OPERATION to ensure no false security claims are made.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {object} options
 * @returns {Promise<never>}
 */
export async function encryptPdf(pdfInput, options = {}) {
  throw new PdfToolkitError(
    ERROR_CODES.UNSUPPORTED_OPERATION,
    'PDF encryption is not supported in the zero-dependency release. Fake or insecure encryption schemes are strictly disallowed.'
  );
}
