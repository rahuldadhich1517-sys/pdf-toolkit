import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { resolvePageDimensions, resolveMargins, PAGE_SIZES } from '../shared/units.js';
import { PdfWriter, STANDARD_FONTS } from '../pdf-core/pdf-writer.js';
import { ContentStream } from '../pdf-core/content-stream.js';
import { createBlob } from '../shared/binary.js';

/**
 * Approximates character width for standard monospaced or proportional base fonts.
 * Standard Helvetica average char width ~ 0.52 of font size. Courier is 0.60.
 * @param {string} text
 * @param {number} fontSize
 * @param {string} fontName
 * @returns {number}
 */
function estimateTextWidth(text, fontSize, fontName = 'Helvetica') {
  if (fontName.startsWith('Courier')) {
    return text.length * fontSize * 0.60;
  }
  // Approximate proportional font width
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 32) total += 0.28; // space
    else if ('ijlI1'.includes(text[i])) total += 0.25;
    else if ('mwMW'.includes(text[i])) total += 0.85;
    else if (code >= 65 && code <= 90) total += 0.65; // uppercase
    else total += 0.52; // lowercase/symbols
  }
  return total * fontSize;
}

/**
 * Wraps text into lines that fit within maxWidth.
 * @param {string} line
 * @param {number} maxWidth
 * @param {number} fontSize
 * @param {string} fontName
 * @returns {string[]}
 */
function wrapLine(line, maxWidth, fontSize, fontName) {
  if (estimateTextWidth(line, fontSize, fontName) <= maxWidth) {
    return [line];
  }

  const words = line.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (estimateTextWidth(testLine, fontSize, fontName) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      // If single word is longer than line width, break the word
      if (estimateTextWidth(word, fontSize, fontName) > maxWidth) {
        let chunk = '';
        for (let i = 0; i < word.length; i++) {
          if (estimateTextWidth(chunk + word[i], fontSize, fontName) > maxWidth) {
            lines.push(chunk);
            chunk = word[i];
          } else {
            chunk += word[i];
          }
        }
        currentLine = chunk;
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Returns normalized text to PDF options.
 * @param {object} [customOptions]
 */
export function getTextPdfOptions(customOptions = {}) {
  const pageSize = customOptions.pageSize || 'A4';
  const orientation = customOptions.orientation || 'portrait';
  const dimensions = resolvePageDimensions(pageSize, orientation);
  const margins = resolveMargins(customOptions.margins || 40);
  const fontSize = customOptions.fontSize || 11;
  const lineHeight = customOptions.lineHeight || fontSize * 1.35;
  const font = customOptions.font || STANDARD_FONTS.Helvetica;
  const alignment = customOptions.align || 'left';
  const showPageNumbers = customOptions.pageNumbers ?? true;
  const header = customOptions.header || '';
  const footer = customOptions.footer || '';

  return {
    pageSize,
    orientation,
    dimensions,
    margins,
    fontSize,
    lineHeight,
    font,
    alignment,
    showPageNumbers,
    header,
    footer,
    metadata: customOptions.metadata || {}
  };
}

/**
 * Converts plain text into a multi-page PDF document.
 *
 * @param {string} text Plain text input
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function textToPdf(text, options = {}) {
  const result = await generatePdfFromText(text, options);
  if (options.format === 'uint8array') {
    return result.bytes;
  }
  return result.blob;
}

/**
 * Converts plain text into PDF returning structured result.
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<{ bytes: Uint8Array, blob: Blob, pageCount: number }>}
 */
export async function generatePdfFromText(text, options = {}) {
  if (typeof text !== 'string') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'textToPdf requires a text string');
  }

  const opts = getTextPdfOptions(options);
  const [pageWidth, pageHeight] = opts.dimensions;
  const contentWidth = pageWidth - opts.margins.left - opts.margins.right;
  const contentHeight = pageHeight - opts.margins.top - opts.margins.bottom;

  // Split raw text by newlines and wrap
  const rawLines = text.split(/\r?\n/);
  const wrappedLines = [];
  for (const rawLine of rawLines) {
    if (rawLine === '') {
      wrappedLines.push('');
    } else {
      const wrapped = wrapLine(rawLine, contentWidth, opts.fontSize, opts.font);
      wrappedLines.push(...wrapped);
    }
  }

  // Calculate lines per page
  const maxLinesPerPage = Math.max(1, Math.floor(contentHeight / opts.lineHeight));
  const pagesData = [];

  for (let i = 0; i < wrappedLines.length; i += maxLinesPerPage) {
    pagesData.push(wrappedLines.slice(i, i + maxLinesPerPage));
  }

  if (pagesData.length === 0) {
    // Empty document has 1 empty page
    pagesData.push([]);
  }

  const writer = new PdfWriter();
  if (opts.metadata) {
    writer.setMetadata(opts.metadata);
  }

  const fontAlias = writer.useStandardFont(opts.font);
  const smallFontAlias = writer.useStandardFont(STANDARD_FONTS.Helvetica);

  for (let p = 0; p < pagesData.length; p++) {
    const pageLines = pagesData[p];
    const stream = new ContentStream();
    const pageNum = p + 1;
    const totalPages = pagesData.length;

    // Optional Header
    if (opts.header) {
      stream.beginText();
      stream.setFont(smallFontAlias, 9);
      stream.setFillColor(0.4, 0.4, 0.4);
      stream.moveText(opts.margins.left, pageHeight - opts.margins.top + 15);
      stream.showText(opts.header);
      stream.endText();
    }

    // Body Text
    stream.beginText();
    stream.setFont(fontAlias, opts.fontSize);
    stream.setFillColor(0.1, 0.1, 0.1);
    stream.setTextLeading(opts.lineHeight);

    let startY = pageHeight - opts.margins.top - opts.fontSize;
    let currentX = opts.margins.left;

    // Position at initial line
    stream.moveText(currentX, startY);

    for (let l = 0; l < pageLines.length; l++) {
      const lineText = pageLines[l];
      if (l > 0) {
        stream.nextLine();
      }
      if (lineText.length > 0) {
        stream.showText(lineText);
      }
    }
    stream.endText();

    // Footer & Page Numbers
    if (opts.footer || opts.showPageNumbers) {
      stream.beginText();
      stream.setFont(smallFontAlias, 9);
      stream.setFillColor(0.4, 0.4, 0.4);

      if (opts.footer) {
        stream.moveText(opts.margins.left, opts.margins.bottom - 20);
        stream.showText(opts.footer);
      }

      if (opts.showPageNumbers) {
        const pageStr = `Page ${pageNum} of ${totalPages}`;
        const numWidth = estimateTextWidth(pageStr, 9, 'Helvetica');
        const numX = pageWidth - opts.margins.right - numWidth;
        if (opts.footer) {
          stream.endText();
          stream.beginText();
          stream.setFont(smallFontAlias, 9);
          stream.setFillColor(0.4, 0.4, 0.4);
        }
        stream.moveText(numX, opts.margins.bottom - 20);
        stream.showText(pageStr);
      }
      stream.endText();
    }

    await writer.addPage({
      size: [pageWidth, pageHeight],
      content: stream
    });
  }

  const pdfBytes = writer.build();
  const pdfBlob = createBlob([pdfBytes], 'application/pdf');

  return {
    bytes: pdfBytes,
    blob: pdfBlob,
    pageCount: pagesData.length
  };
}
