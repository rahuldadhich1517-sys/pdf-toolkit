import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { PdfWriter } from '../pdf-core/pdf-writer.js';
import { ObjectCloner } from '../pdf-core/object-cloner.js';
import { PdfRef, PdfDict, PdfName } from '../shared/pdf-types.js';

/**
 * Validates and parses page range expressions like "1-3, 5, 7-10".
 * @param {string | Array<number | { start: number, end: number }>} ranges
 * @param {number} totalPages
 * @returns {Array<{ start: number, end: number }>}
 */
export function validatePdfPageRanges(ranges, totalPages) {
  if (totalPages <= 0) {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Document has no pages');
  }

  const result = [];

  if (typeof ranges === 'string') {
    const parts = ranges.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PAGE_RANGE, 'Page range string is empty');
    }

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map(s => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end) || start < 1 || end < start || start > totalPages || end > totalPages) {
          throw new PdfToolkitError(
            ERROR_CODES.INVALID_PAGE_RANGE,
            `Invalid range '${part}' for document with ${totalPages} pages`
          );
        }
        result.push({ start, end });
      } else {
        const page = parseInt(part, 10);
        if (isNaN(page) || page < 1 || page > totalPages) {
          throw new PdfToolkitError(
            ERROR_CODES.INVALID_PAGE_RANGE,
            `Invalid page number '${part}' for document with ${totalPages} pages`
          );
        }
        result.push({ start: page, end: page });
      }
    }
  } else if (Array.isArray(ranges)) {
    if (ranges.length === 0) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PAGE_RANGE, 'Page ranges array is empty');
    }
    for (const r of ranges) {
      if (typeof r === 'number') {
        if (r < 1 || r > totalPages) {
          throw new PdfToolkitError(ERROR_CODES.INVALID_PAGE_RANGE, `Page number ${r} out of range`);
        }
        result.push({ start: r, end: r });
      } else if (r && typeof r === 'object') {
        const start = Number(r.start);
        const end = Number(r.end);
        if (isNaN(start) || isNaN(end) || start < 1 || end < start || start > totalPages || end > totalPages) {
          throw new PdfToolkitError(
            ERROR_CODES.INVALID_PAGE_RANGE,
            `Invalid range { start: ${r.start}, end: ${r.end} }`
          );
        }
        result.push({ start, end });
      }
    }
  } else {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Ranges must be a string or array');
  }

  return result;
}

/**
 * Extracts a subset of pages into a new single PDF document.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {number[]} pageNumbers 1-based page indices to extract
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function extractPdfPages(pdfInput, pageNumbers, options = {}) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
    throw new PdfToolkitError(ERROR_CODES.INVALID_PAGE_RANGE, 'pageNumbers array must not be empty');
  }

  const totalPages = parser.pages.length;
  for (const p of pageNumbers) {
    if (typeof p !== 'number' || p < 1 || p > totalPages) {
      throw new PdfToolkitError(
        ERROR_CODES.PAGE_NOT_FOUND,
        `Page number ${p} is out of bounds (1 to ${totalPages})`
      );
    }
  }

  const writer = new PdfWriter();
  const cloner = new ObjectCloner(parser, (obj, existingRef) => {
    if (existingRef) {
      // Find and set existing object
      const item = writer._objects.find(o => o.num === existingRef.num);
      if (item) item.value = obj;
      return existingRef;
    }
    return writer.addObject(obj);
  });

  for (const pageNum of pageNumbers) {
    const pageDict = parser.pages[pageNum - 1];
    const clonedPageDict = cloner.clone(pageDict);
    const newPageRef = writer.allocateRef();
    writer.addObject(clonedPageDict, newPageRef);
    writer._pageRefs.push(newPageRef);
  }

  const outBytes = writer.build();
  if (options.format === 'uint8array') {
    return outBytes;
  }
  return createBlob([outBytes], 'application/pdf');
}

/**
 * Splits PDF into multiple documents using specified ranges.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {string | Array<number | { start: number, end: number }>} ranges
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Array<Blob | Uint8Array>>}
 */
export async function splitPdfByRanges(pdfInput, ranges, options = {}) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  const validatedRanges = validatePdfPageRanges(ranges, parser.pages.length);
  const outputs = [];

  for (const r of validatedRanges) {
    const pageNumbers = [];
    for (let p = r.start; p <= r.end; p++) {
      pageNumbers.push(p);
    }
    const doc = await extractPdfPages(bytes, pageNumbers, options);
    outputs.push(doc);
  }

  return outputs;
}

/**
 * Splits a PDF: by default, splits every single page into its own PDF document.
 * If ranges are supplied in options.ranges, splits by those ranges.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {object} [options]
 * @param {string | Array<number | { start: number, end: number }>} [options.ranges]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Array<Blob | Uint8Array>>}
 */
export async function splitPdf(pdfInput, options = {}) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  if (options.ranges) {
    return splitPdfByRanges(bytes, options.ranges, options);
  }

  // Split every single page
  const outputs = [];
  for (let p = 1; p <= parser.pages.length; p++) {
    const pageDoc = await extractPdfPages(bytes, [p], options);
    outputs.push(pageDoc);
  }
  return outputs;
}
