import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { serializePdfWithUpdatedObjects } from '../pdf-metadata/index.js';

/**
 * Validates rotation angle (must be multiple of 90: 90, 180, 270, 0).
 * @param {number} angle
 * @returns {number} Normalized angle (0, 90, 180, 270)
 */
export function validatePageRotation(angle) {
  if (typeof angle !== 'number' || isNaN(angle)) {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Rotation angle must be a number');
  }
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized % 90 !== 0) {
    throw new PdfToolkitError(
      ERROR_CODES.INVALID_INPUT,
      `Rotation angle must be a multiple of 90 degrees (got ${angle})`
    );
  }
  return normalized;
}

/**
 * Gets current rotation angle of a given 1-based page number.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {number} pageNumber 1-based page index
 * @returns {Promise<number>} Rotation in degrees (0, 90, 180, 270)
 */
export async function getPdfPageRotation(pdfInput, pageNumber) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  if (pageNumber < 1 || pageNumber > parser.pages.length) {
    throw new PdfToolkitError(
      ERROR_CODES.PAGE_NOT_FOUND,
      `Page number ${pageNumber} out of range (document has ${parser.pages.length} pages)`
    );
  }

  const page = parser.pages[pageNumber - 1];
  const rot = parser.resolve(page.get('Rotate'));
  return typeof rot === 'number' ? ((rot % 360) + 360) % 360 : 0;
}

/**
 * Rotates selected pages in a PDF document.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {object} rotationConfig
 * @param {number} rotationConfig.degrees Angle (90, 180, 270, -90, etc.)
 * @param {Array<number> | 'all'} [rotationConfig.pages='all'] 1-based page numbers or 'all'
 * @param {boolean} [rotationConfig.relative=true] If true, adds to existing rotation. If false, sets absolute.
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function rotatePdfPages(pdfInput, rotationConfig, options = {}) {
  if (!rotationConfig || typeof rotationConfig !== 'object') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Rotation configuration object required');
  }

  const addDegrees = validatePageRotation(rotationConfig.degrees ?? 90);
  const isRelative = rotationConfig.relative ?? true;
  const targetPages = rotationConfig.pages || 'all';

  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  if (parser.hasDigitalSignature) {
    throw new PdfToolkitError(
      ERROR_CODES.DOCUMENT_SIGNATURE_PRESENT,
      'Document has a digital signature. Modifying pages will invalidate signatures.'
    );
  }

  const totalPages = parser.pages.length;
  let pageIndicesToRotate = [];

  if (targetPages === 'all') {
    for (let i = 0; i < totalPages; i++) pageIndicesToRotate.push(i);
  } else if (Array.isArray(targetPages)) {
    for (const p of targetPages) {
      if (typeof p !== 'number' || p < 1 || p > totalPages) {
        throw new PdfToolkitError(
          ERROR_CODES.PAGE_NOT_FOUND,
          `Invalid page number ${p} (document has ${totalPages} pages)`
        );
      }
      pageIndicesToRotate.push(p - 1);
    }
  } else {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, "pages option must be 'all' or an array of page numbers");
  }

  const replacedObjects = new Map();

  for (const idx of pageIndicesToRotate) {
    const pageDict = parser.pages[idx];
    const pageRef = pageDict._ref;

    let newAngle;
    if (isRelative) {
      const currentRot = parser.resolve(pageDict.get('Rotate')) || 0;
      newAngle = (currentRot + addDegrees) % 360;
    } else {
      newAngle = addDegrees;
    }

    pageDict.set('Rotate', newAngle);

    if (pageRef) {
      replacedObjects.set(pageRef.num, pageDict);
    }
  }

  const outBytes = serializePdfWithUpdatedObjects(parser, replacedObjects);

  if (options.format === 'uint8array') {
    return outBytes;
  }
  return createBlob([outBytes], 'application/pdf');
}
