import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, bytesToLatin1String } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { extractPdfRawContentStreams } from '../pdf-to-raw/index.js';
import { Tokenizer, TOKEN_TYPES } from '../pdf-core/tokenizer.js';
import { PdfString, PdfHexString } from '../shared/pdf-types.js';

/**
 * Parses decoded content stream bytes and extracts textual content.
 * Supports operators:
 * - BT (Begin Text) / ET (End Text)
 * - Tj (Show Text)
 * - TJ (Show text with positioning)
 * - ' (Move to next line and show text)
 * - " (Set word/char spacing, move to next line and show text)
 * - Td / TD / T* / Tm (Text matrix / line movements)
 *
 * @param {Uint8Array} streamBytes
 * @returns {string} Extracted text
 */
export function extractTextFromContentStream(streamBytes) {
  const tokenizer = new Tokenizer(streamBytes);
  const textParts = [];
  let inTextObject = false;

  while (true) {
    const token = tokenizer.nextToken();
    if (token.type === TOKEN_TYPES.EOF) break;

    if (token.value === 'BT') {
      inTextObject = true;
      continue;
    }
    if (token.value === 'ET') {
      inTextObject = false;
      textParts.push('\n');
      continue;
    }

    if (!inTextObject) continue;

    // Line break operators
    if (token.value === 'T*' || token.value === 'TD' || token.value === 'Td') {
      textParts.push('\n');
      continue;
    }

    // Tj operator: string Tj
    if (token.value === 'Tj') {
      // String was before Tj
      // The tokenizer looks forward, but we need the preceding operand
      continue;
    }
  }

  // Token sequence parser with operands stack
  const operands = [];
  const tok = new Tokenizer(streamBytes);
  const lines = [];
  let currentLine = '';

  while (true) {
    const t = tok.nextToken();
    if (t.type === TOKEN_TYPES.EOF) break;

    if (t.type === TOKEN_TYPES.KEYWORD) {
      const op = t.value;

      if (op === 'BT') {
        operands.length = 0;
      } else if (op === 'ET') {
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
          currentLine = '';
        }
        operands.length = 0;
      } else if (op === 'T*' || op === 'Td' || op === 'TD') {
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
          currentLine = '';
        }
        operands.length = 0;
      } else if (op === 'Tj') {
        // Operand is top of stack
        const strVal = operands.pop();
        if (strVal instanceof PdfString || strVal instanceof PdfHexString) {
          currentLine += strVal.value ?? strVal.hex;
        } else if (typeof strVal === 'string') {
          currentLine += strVal;
        }
        operands.length = 0;
      } else if (op === "'") {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';
        const strVal = operands.pop();
        if (strVal instanceof PdfString || strVal instanceof PdfHexString) {
          currentLine += strVal.value ?? strVal.hex;
        }
        operands.length = 0;
      } else if (op === '"') {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';
        const strVal = operands.pop(); // string is 3rd operand
        if (strVal instanceof PdfString || strVal instanceof PdfHexString) {
          currentLine += strVal.value ?? strVal.hex;
        }
        operands.length = 0;
      } else if (op === 'TJ') {
        // Operand is array of strings and positioning numbers
        const arr = operands.pop();
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item instanceof PdfString || item instanceof PdfHexString) {
              currentLine += item.value ?? item.hex;
            } else if (typeof item === 'string') {
              currentLine += item;
            } else if (typeof item === 'number') {
              // Large negative kerning indicates a space between words
              if (item < -150) {
                if (currentLine.length > 0 && !currentLine.endsWith(' ')) {
                  currentLine += ' ';
                }
              }
            }
          }
        }
        operands.length = 0;
      } else {
        // Other operator
        operands.length = 0;
      }
    } else if (t.type === TOKEN_TYPES.ARRAY_START) {
      // Parse array operands
      const arr = [];
      while (true) {
        tok.skipWhitespaceAndComments();
        const p = tok.peekByte();
        if (p === 0x5d) { // ']'
          tok.readByte();
          break;
        }
        if (p === -1) break;
        const elem = tok.nextToken();
        arr.push(elem.value);
      }
      operands.push(arr);
    } else {
      operands.push(t.value);
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.join('\n');
}

/**
 * Extracts text from a specific page.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {number} pageNumber 1-based page number
 * @returns {Promise<{ pageNumber: number, text: string }>}
 */
export async function extractPdfPageText(pdfInput, pageNumber) {
  const streams = await extractPdfRawContentStreams(pdfInput, {
    pages: [pageNumber],
    decode: true
  });

  const texts = streams.map(s => extractTextFromContentStream(s.bytes));
  return {
    pageNumber,
    text: texts.join('\n').trim()
  };
}

/**
 * Extracts selectable text from all or selected pages of a PDF document.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {object} [options]
 * @param {number[]} [options.pages] Selected page numbers
 * @returns {Promise<{ text: string, pages: Array<{ pageNumber: number, text: string }> }>}
 */
export async function extractPdfText(pdfInput, options = {}) {
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

  const pageResults = [];
  for (const pageNum of targetPages) {
    const res = await extractPdfPageText(bytes, pageNum);
    pageResults.push(res);
  }

  const fullText = pageResults.map(p => p.text).filter(Boolean).join('\n\n');

  return {
    text: fullText,
    pages: pageResults
  };
}

/**
 * Returns text extraction metadata (total characters, page count, font types).
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @returns {Promise<{ pageCount: number, estimatedCharacters: number }>}
 */
export async function getPdfTextMetadata(pdfInput) {
  const { text, pages } = await extractPdfText(pdfInput);
  return {
    pageCount: pages.length,
    estimatedCharacters: text.length
  };
}
