import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { PdfStream, PdfRef, PdfName } from '../shared/pdf-types.js';

/**
 * Extracts raw page content streams from a PDF document.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {object} [options]
 * @param {number[]} [options.pages] 1-based page numbers to extract (default: all)
 * @param {boolean} [options.decode=false] If true, decompresses supported streams
 * @returns {Promise<Array<{ pageNumber: number, streamIndex: number, bytes: Uint8Array, decoded: boolean, filters: string[], length: number }>>}
 */
export async function extractPdfRawContentStreams(pdfInput, options = {}) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  const totalPages = parser.pages.length;
  let targetPages = [];

  if (options.pages && Array.isArray(options.pages)) {
    for (const p of options.pages) {
      if (p < 1 || p > totalPages) {
        throw new PdfToolkitError(ERROR_CODES.PAGE_NOT_FOUND, `Page ${p} out of range`);
      }
      targetPages.push(p);
    }
  } else {
    for (let p = 1; p <= totalPages; p++) targetPages.push(p);
  }

  const results = [];

  for (const pageNum of targetPages) {
    const pageDict = parser.pages[pageNum - 1];
    const contentsVal = pageDict.get('Contents');
    if (!contentsVal) continue;

    const resolvedContents = parser.resolve(contentsVal);
    const streamObjs = Array.isArray(resolvedContents)
      ? resolvedContents.map(ref => parser.resolve(ref))
      : [resolvedContents];

    let streamIdx = 0;
    for (const streamObj of streamObjs) {
      if (!(streamObj instanceof PdfStream)) continue;

      const filterVal = streamObj.dict.get('Filter');
      const filters = [];
      if (filterVal) {
        const filterArr = Array.isArray(filterVal) ? filterVal : [filterVal];
        for (const f of filterArr) {
          filters.push(f instanceof PdfName ? f.value : String(f));
        }
      }

      let outputBytes = streamObj.bytes;
      let isDecoded = false;

      if (options.decode) {
        outputBytes = await parser.decodeStream(streamObj);
        isDecoded = true;
      }

      results.push({
        pageNumber: pageNum,
        streamIndex: streamIdx++,
        bytes: outputBytes,
        decoded: isDecoded,
        filters,
        length: outputBytes.length
      });
    }
  }

  return results;
}

/**
 * Gets content streams for a single page.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {number} pageNumber 1-based page number
 * @param {object} [options]
 * @returns {Promise<Array<{ streamIndex: number, bytes: Uint8Array, decoded: boolean, filters: string[], length: number }>>}
 */
export async function getPdfPageContentStreams(pdfInput, pageNumber, options = {}) {
  const streams = await extractPdfRawContentStreams(pdfInput, {
    ...options,
    pages: [pageNumber]
  });
  return streams;
}

/**
 * Returns metadata about a page's content streams without returning byte buffers.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {number} pageNumber 1-based page index
 * @returns {Promise<{ pageNumber: number, streamCount: number, totalBytes: number, filters: string[][] }>}
 */
export async function getPdfStreamMetadata(pdfInput, pageNumber) {
  const streams = await extractPdfRawContentStreams(pdfInput, {
    pages: [pageNumber],
    decode: false
  });

  return {
    pageNumber,
    streamCount: streams.length,
    totalBytes: streams.reduce((sum, s) => sum + s.length, 0),
    filters: streams.map(s => s.filters)
  };
}
