import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { PdfWriter } from '../pdf-core/pdf-writer.js';
import { ObjectCloner } from '../pdf-core/object-cloner.js';

/**
 * Validates inputs for PDF merging.
 * @param {Array<unknown>} inputs
 */
export function validateMergeInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 2) {
    throw new PdfToolkitError(
      ERROR_CODES.INVALID_INPUT,
      'mergePdfs requires an array of at least 2 PDF inputs'
    );
  }
  return true;
}

/**
 * Returns resolved merge options.
 * @param {object} [options]
 */
export function getPdfMergeOptions(options = {}) {
  return {
    metadata: options.metadata || {
      Title: 'Merged Document',
      Producer: '@rahul_dadhich15/pdf-toolkit (pdf-merge)'
    }
  };
}

/**
 * Merges multiple supported PDF documents into a single PDF document.
 * Resolves page trees, remaps object IDs, and recalculates cross-reference offsets.
 *
 * @param {Array<Uint8Array | ArrayBuffer | Blob>} pdfInputs
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @param {Record<string, string>} [options.metadata]
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function mergePdfs(pdfInputs, options = {}) {
  validateMergeInputs(pdfInputs);
  const opts = getPdfMergeOptions(options);

  const writer = new PdfWriter();
  if (opts.metadata) {
    writer.setMetadata(opts.metadata);
  }

  let totalMergedPages = 0;

  for (let docIdx = 0; docIdx < pdfInputs.length; docIdx++) {
    const rawInput = pdfInputs[docIdx];
    const bytes = await normalizeBinaryInput(rawInput);
    const parser = new PdfParser(bytes);
    await parser.parse();

    if (parser.hasDigitalSignature) {
      throw new PdfToolkitError(
        ERROR_CODES.DOCUMENT_SIGNATURE_PRESENT,
        `Document at index ${docIdx} contains a digital signature. Merging will invalidate digital signatures.`
      );
    }

    const cloner = new ObjectCloner(parser, (obj, existingRef) => {
      if (existingRef) {
        const item = writer._objects.find(o => o.num === existingRef.num);
        if (item) item.value = obj;
        return existingRef;
      }
      return writer.addObject(obj);
    });

    for (const pageDict of parser.pages) {
      const clonedPage = cloner.clone(pageDict);
      const newPageRef = writer.allocateRef();
      writer.addObject(clonedPage, newPageRef);
      writer._pageRefs.push(newPageRef);
      totalMergedPages++;
    }
  }

  if (totalMergedPages === 0) {
    throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Merged output contains 0 pages');
  }

  const outBytes = writer.build();
  if (options.format === 'uint8array') {
    return outBytes;
  }
  return createBlob([outBytes], 'application/pdf');
}
