/**
 * @rahul_dadhich15/pdf-toolkit
 * Zero-dependency client-side PDF and document processing toolkit for modern browsers.
 */

// Error handling and limits
export { PdfToolkitError, ERROR_CODES } from './shared/errors.js';
export { DEFAULT_LIMITS, resolveLimits } from './shared/limits.js';

// Capability registry
export { getPdfToolkitCapabilities, SUPPORTED_PDF_PROFILE } from './capabilities/index.js';

// Core PDF engine
export { PdfWriter, STANDARD_FONTS } from './pdf-core/pdf-writer.js';
export { PdfParser } from './pdf-core/pdf-parser.js';
export { ContentStream } from './pdf-core/content-stream.js';
export { Tokenizer, TOKEN_TYPES } from './pdf-core/tokenizer.js';
export { PdfName, PdfRef, PdfDict, PdfStream, PdfString, PdfHexString } from './shared/pdf-types.js';

// Utility 1: base64-to-pdf
export {
  base64ToPdf,
  parsePdfDataUri,
  validatePdfBase64,
  getPdfBase64Metadata
} from './base64-to-pdf/index.js';

// Utility 2: html-to-pdf
export {
  prepareHtmlForPrint,
  openHtmlPrintDialog,
  sanitizeHtmlForPrint,
  getHtmlPrintOptions
} from './html-to-pdf/index.js';

// Utility 3: image-to-pdf
export {
  imageToPdf,
  imagesToPdf,
  imageBlobToPdf,
  getImagePdfOptions
} from './image-to-pdf/index.js';

// Utility 4: markdown-to-pdf
export {
  markdownToPdf,
  parseMarkdownForPdf,
  getMarkdownPdfOptions
} from './markdown-to-pdf/index.js';

// Utility 5: pdf-compress
export {
  compressPdf,
  getPdfCompressionInfo,
  getPdfCompressionOptions
} from './pdf-compress/index.js';

// Utility 6: pdf-merge
export {
  mergePdfs,
  validateMergeInputs,
  getPdfMergeOptions
} from './pdf-merge/index.js';

// Utility 7: pdf-metadata
export {
  readPdfMetadata,
  updatePdfMetadata,
  getPdfMetadata,
  validatePdfMetadata
} from './pdf-metadata/index.js';

// Utility 8: pdf-encrypt (Reported honestly as UNSUPPORTED_OPERATION)
export {
  encryptPdf,
  validateEncryptionOptions,
  getPdfEncryptionInfo
} from './pdf-encrypt/index.js';

// Utility 9: pdf-decrypt (Reported honestly as UNSUPPORTED_OPERATION)
export {
  decryptPdf,
  validatePdfPassword,
  getPdfSecurityInfo
} from './pdf-decrypt/index.js';

// Utility 10: pdf-rotate
export {
  rotatePdfPages,
  getPdfPageRotation,
  validatePageRotation
} from './pdf-rotate/index.js';

// Utility 11: pdf-split
export {
  splitPdf,
  splitPdfByRanges,
  extractPdfPages,
  validatePdfPageRanges
} from './pdf-split/index.js';

// Utility 12: pdf-to-image
export {
  renderPdfPages,
  renderPdfPage,
  getPdfRenderOptions,
  getPdfPageDimensions
} from './pdf-to-image/index.js';

// Utility 13: pdf-to-raw
export {
  extractPdfRawContentStreams,
  getPdfPageContentStreams,
  getPdfStreamMetadata
} from './pdf-to-raw/index.js';

// Utility 14: pdf-to-text
export {
  extractPdfText,
  extractPdfPageText,
  getPdfTextMetadata
} from './pdf-to-text/index.js';

// Utility 15: text-to-pdf
export {
  textToPdf,
  generatePdfFromText,
  getTextPdfOptions
} from './text-to-pdf/index.js';

// Utility 16: tiff-to-pdf
export {
  tiffToPdf,
  validateTiffInput,
  getTiffMetadata,
  getTiffConversionCapabilities
} from './tiff-to-pdf/index.js';
