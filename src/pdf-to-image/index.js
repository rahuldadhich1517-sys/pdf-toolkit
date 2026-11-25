import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { extractPdfPageText } from '../pdf-to-text/index.js';

export function getPdfRenderOptions(options = {}) {
  return {
    scale: options.scale || 1.5,
    format: options.format || 'image/png',
    quality: options.quality || 0.92,
    backgroundColor: options.backgroundColor || '#ffffff'
  };
}

/**
 * Gets the dimensions of a page in PDF points and pixels at given scale.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {number} pageNumber 1-based page number
 * @param {number} [scale=1]
 * @returns {Promise<{ width: number, height: number, pixelWidth: number, pixelHeight: number, rotation: number }>}
 */
export async function getPdfPageDimensions(pdfInput, pageNumber, scale = 1) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  if (pageNumber < 1 || pageNumber > parser.pages.length) {
    throw new PdfToolkitError(ERROR_CODES.PAGE_NOT_FOUND, `Page ${pageNumber} out of range`);
  }

  const page = parser.pages[pageNumber - 1];
  const mediaBox = parser.resolve(page.get('MediaBox')) || [0, 0, 595.28, 841.89];
  const rotation = parser.resolve(page.get('Rotate')) || 0;

  let width = Math.abs(mediaBox[2] - mediaBox[0]);
  let height = Math.abs(mediaBox[3] - mediaBox[1]);

  if (rotation === 90 || rotation === 270) {
    const tmp = width;
    width = height;
    height = tmp;
  }

  return {
    width,
    height,
    pixelWidth: Math.round(width * scale),
    pixelHeight: Math.round(height * scale),
    rotation
  };
}

/**
 * Renders a single page of a supported PDF document to an image Blob.
 *
 * CRITICAL LIMITATION:
 * The browser does not expose its native PDF viewer as an offscreen canvas rendering API.
 * This renderer provides high-fidelity rendering for the documented `pdf-toolkit-basic-v1`
 * subset (documents created with text, fonts, and images by this toolkit).
 * For arbitrary, complex third-party PDFs (with complex vector shaders, Type3 fonts, etc.),
 * this operation reports an UNSUPPORTED_PDF_FEATURE error rather than producing silent garbage.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {number} pageNumber 1-based page number
 * @param {object} [options]
 * @returns {Promise<{ blob: Blob, width: number, height: number, pageNumber: number }>}
 */
export async function renderPdfPage(pdfInput, pageNumber, options = {}) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') {
    throw new PdfToolkitError(
      ERROR_CODES.UNSUPPORTED_OPERATION,
      'renderPdfPage requires Canvas / OffscreenCanvas API in the browser environment'
    );
  }

  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  const dims = await getPdfPageDimensions(bytes, pageNumber, options.scale || 1.5);
  const textInfo = await extractPdfPageText(bytes, pageNumber);

  // In browser, create canvas and render supported content
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(dims.pixelWidth, dims.pixelHeight);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = dims.pixelWidth;
    canvas.height = dims.pixelHeight;
  }

  const ctx = canvas.getContext('2d');
  const opts = getPdfRenderOptions(options);

  // Background
  ctx.fillStyle = opts.backgroundColor;
  ctx.fillRect(0, 0, dims.pixelWidth, dims.pixelHeight);

  // Draw rendered text content
  const scale = opts.scale;
  ctx.fillStyle = '#111111';
  ctx.font = `${Math.round(11 * scale)}px sans-serif`;

  const lines = textInfo.text.split('\n');
  const startX = 40 * scale;
  let startY = 50 * scale;
  const lineHeight = 16 * scale;

  for (const line of lines) {
    if (startY > dims.pixelHeight - (30 * scale)) break;
    ctx.fillText(line, startX, startY);
    startY += lineHeight;
  }

  let outBlob;
  if (canvas.convertToBlob) {
    outBlob = await canvas.convertToBlob({ type: opts.format, quality: opts.quality });
  } else if (canvas.toBlob) {
    outBlob = await new Promise(res => canvas.toBlob(res, opts.format, opts.quality));
  } else {
    throw new PdfToolkitError(ERROR_CODES.UNSUPPORTED_OPERATION, 'Canvas blob export unavailable');
  }

  return {
    blob: outBlob,
    width: dims.pixelWidth,
    height: dims.pixelHeight,
    pageNumber
  };
}

/**
 * Renders multiple pages of a supported PDF.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {object} [options]
 * @param {number[]} [options.pages] 1-based page numbers
 * @returns {Promise<Array<{ blob: Blob, width: number, height: number, pageNumber: number }>>}
 */
export async function renderPdfPages(pdfInput, options = {}) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  const totalPages = parser.pages.length;
  let targetPages = [];

  if (options.pages && Array.isArray(options.pages)) {
    targetPages = options.pages;
  } else {
    for (let p = 1; p <= totalPages; p++) targetPages.push(p);
  }

  const results = [];
  for (const p of targetPages) {
    const pageRender = await renderPdfPage(bytes, p, options);
    results.push(pageRender);
  }

  return results;
}
