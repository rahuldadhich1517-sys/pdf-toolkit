import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { resolvePageDimensions, resolveMargins } from '../shared/units.js';
import { PdfWriter, STANDARD_FONTS } from '../pdf-core/pdf-writer.js';
import { ContentStream } from '../pdf-core/content-stream.js';
import { createBlob } from '../shared/binary.js';
import { parseMarkdown, stripInlineMarkdown, BLOCK_TYPES } from './markdown-parser.js';

export function getMarkdownPdfOptions(customOptions = {}) {
  const pageSize = customOptions.pageSize || 'A4';
  const orientation = customOptions.orientation || 'portrait';
  const dimensions = resolvePageDimensions(pageSize, orientation);
  const margins = resolveMargins(customOptions.margins || 40);
  const baseFontSize = customOptions.fontSize || 10;
  const title = customOptions.title || '';
  const header = customOptions.header || '';
  const footer = customOptions.footer || '';
  const showPageNumbers = customOptions.pageNumbers ?? true;

  return {
    pageSize,
    orientation,
    dimensions,
    margins,
    baseFontSize,
    title,
    header,
    footer,
    showPageNumbers,
    metadata: customOptions.metadata || {}
  };
}

export function parseMarkdownForPdf(markdown) {
  return parseMarkdown(markdown);
}

/**
 * Converts Markdown string into a styled PDF document.
 * @param {string} markdown
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function markdownToPdf(markdown, options = {}) {
  if (typeof markdown !== 'string') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'markdownToPdf requires a string input');
  }

  const opts = getMarkdownPdfOptions(options);
  const [pageWidth, pageHeight] = opts.dimensions;
  const contentWidth = pageWidth - opts.margins.left - opts.margins.right;
  const bottomThreshold = opts.margins.bottom + 30;

  const blocks = parseMarkdown(markdown);

  const writer = new PdfWriter();
  if (opts.title) {
    writer.setMetadata({ Title: opts.title, ...opts.metadata });
  } else if (opts.metadata) {
    writer.setMetadata(opts.metadata);
  }

  const fNormal = writer.useStandardFont(STANDARD_FONTS.Helvetica);
  const fBold = writer.useStandardFont(STANDARD_FONTS.HelveticaBold);
  const fOblique = writer.useStandardFont(STANDARD_FONTS.HelveticaOblique);
  const fMono = writer.useStandardFont(STANDARD_FONTS.Courier);

  /** @type {Array<ContentStream>} */
  const pageStreams = [];
  let curStream = new ContentStream();
  pageStreams.push(curStream);

  let curY = pageHeight - opts.margins.top;

  function newPage() {
    curStream = new ContentStream();
    pageStreams.push(curStream);
    curY = pageHeight - opts.margins.top;
  }

  function checkSpace(neededHeight) {
    if (curY - neededHeight < bottomThreshold) {
      newPage();
    }
  }

  // Draw Title if provided
  if (opts.title) {
    checkSpace(40);
    curStream.beginText();
    curStream.setFont(fBold, opts.baseFontSize * 2);
    curStream.setFillColor(0.05, 0.05, 0.05);
    curStream.moveText(opts.margins.left, curY - (opts.baseFontSize * 2));
    curStream.showText(opts.title);
    curStream.endText();
    curY -= (opts.baseFontSize * 2.5);
  }

  for (const block of blocks) {
    if (block.type === BLOCK_TYPES.PAGE_BREAK) {
      newPage();
      continue;
    }

    if (block.type.startsWith('H')) {
      const level = block.level || 1;
      const sizeMultiplier = [2.0, 1.6, 1.3, 1.15, 1.05, 1.0][level - 1] || 1.0;
      const headingSize = opts.baseFontSize * sizeMultiplier;
      const headingText = stripInlineMarkdown(block.text);

      checkSpace(headingSize * 2);
      curY -= headingSize * 0.5;

      curStream.beginText();
      curStream.setFont(fBold, headingSize);
      curStream.setFillColor(0.1, 0.1, 0.2);
      curStream.moveText(opts.margins.left, curY - headingSize);
      curStream.showText(headingText);
      curStream.endText();

      curY -= headingSize * 1.4;

      if (level <= 2) {
        // Sub-rule under H1 and H2
        curStream.setStrokeColor(0.8, 0.8, 0.8);
        curStream.setLineWidth(0.75);
        curStream.drawLine(opts.margins.left, curY + 4, pageWidth - opts.margins.right, curY + 4);
        curY -= 6;
      }
      continue;
    }

    if (block.type === BLOCK_TYPES.HR) {
      checkSpace(15);
      curY -= 6;
      curStream.setStrokeColor(0.8, 0.8, 0.8);
      curStream.setLineWidth(1);
      curStream.drawLine(opts.margins.left, curY, pageWidth - opts.margins.right, curY);
      curY -= 12;
      continue;
    }

    if (block.type === BLOCK_TYPES.PARAGRAPH) {
      const text = stripInlineMarkdown(block.text);
      const lineHeight = opts.baseFontSize * 1.35;
      const lines = wrapTextSimple(text, contentWidth, opts.baseFontSize);

      for (const line of lines) {
        checkSpace(lineHeight);
        curStream.beginText();
        curStream.setFont(fNormal, opts.baseFontSize);
        curStream.setFillColor(0.15, 0.15, 0.15);
        curStream.moveText(opts.margins.left, curY - opts.baseFontSize);
        curStream.showText(line);
        curStream.endText();
        curY -= lineHeight;
      }
      curY -= lineHeight * 0.4;
      continue;
    }

    if (block.type === BLOCK_TYPES.UL_ITEM || block.type === BLOCK_TYPES.OL_ITEM) {
      const bullet = block.type === BLOCK_TYPES.UL_ITEM ? '-' : `${block.index || 1}.`;
      const text = stripInlineMarkdown(block.text);
      const lineHeight = opts.baseFontSize * 1.35;
      const bulletIndent = 16;
      const lines = wrapTextSimple(text, contentWidth - bulletIndent, opts.baseFontSize);

      checkSpace(lineHeight);
      // Bullet symbol
      curStream.beginText();
      curStream.setFont(fBold, opts.baseFontSize);
      curStream.setFillColor(0.2, 0.2, 0.2);
      curStream.moveText(opts.margins.left + 4, curY - opts.baseFontSize);
      curStream.showText(bullet);
      curStream.endText();

      for (let l = 0; l < lines.length; l++) {
        if (l > 0) checkSpace(lineHeight);
        curStream.beginText();
        curStream.setFont(fNormal, opts.baseFontSize);
        curStream.setFillColor(0.15, 0.15, 0.15);
        curStream.moveText(opts.margins.left + bulletIndent, curY - opts.baseFontSize);
        curStream.showText(lines[l]);
        curStream.endText();
        curY -= lineHeight;
      }
      continue;
    }

    if (block.type === BLOCK_TYPES.BLOCKQUOTE) {
      const text = stripInlineMarkdown(block.text);
      const lineHeight = opts.baseFontSize * 1.35;
      const quoteIndent = 18;
      const lines = wrapTextSimple(text, contentWidth - quoteIndent, opts.baseFontSize);
      const totalBlockHeight = lines.length * lineHeight;

      checkSpace(totalBlockHeight + 10);
      const startQuoteY = curY;

      for (const line of lines) {
        curStream.beginText();
        curStream.setFont(fOblique, opts.baseFontSize);
        curStream.setFillColor(0.35, 0.35, 0.35);
        curStream.moveText(opts.margins.left + quoteIndent, curY - opts.baseFontSize);
        curStream.showText(line);
        curStream.endText();
        curY -= lineHeight;
      }

      // Vertical quote bar
      curStream.setStrokeColor(0.65, 0.65, 0.7);
      curStream.setLineWidth(3);
      curStream.drawLine(opts.margins.left + 4, startQuoteY, opts.margins.left + 4, curY + (lineHeight * 0.3));

      curY -= lineHeight * 0.4;
      continue;
    }

    if (block.type === BLOCK_TYPES.CODE_BLOCK) {
      const codeLines = block.lines || [];
      const codeFontSize = opts.baseFontSize * 0.9;
      const lineHeight = codeFontSize * 1.35;
      const blockPad = 6;
      const totalCodeH = codeLines.length * lineHeight + (blockPad * 2);

      checkSpace(Math.min(totalCodeH, 100));

      // Draw background rect
      curStream.setFillColor(0.95, 0.95, 0.96);
      curStream.drawRect(opts.margins.left, curY - totalCodeH, contentWidth, totalCodeH);
      curStream.fill();

      let codeY = curY - blockPad - codeFontSize;
      for (const cl of codeLines) {
        curStream.beginText();
        curStream.setFont(fMono, codeFontSize);
        curStream.setFillColor(0.1, 0.1, 0.1);
        curStream.moveText(opts.margins.left + blockPad, codeY);
        // Truncate line if it exceeds block width
        const safeLine = cl.slice(0, 100);
        curStream.showText(safeLine);
        curStream.endText();
        codeY -= lineHeight;
      }
      curY -= (totalCodeH + 8);
      continue;
    }

    if (block.type === BLOCK_TYPES.TABLE) {
      const rows = block.rows || [];
      if (rows.length === 0) continue;
      const colCount = Math.max(...rows.map(r => r.length));
      const colWidth = contentWidth / colCount;
      const rowHeight = opts.baseFontSize * 1.6;

      for (let r = 0; r < rows.length; r++) {
        checkSpace(rowHeight);
        const row = rows[r];
        const isHeader = r === 0;

        if (isHeader) {
          curStream.setFillColor(0.92, 0.92, 0.94);
          curStream.drawRect(opts.margins.left, curY - rowHeight, contentWidth, rowHeight);
          curStream.fill();
        }

        // Draw cells
        for (let c = 0; c < colCount; c++) {
          const cellText = stripInlineMarkdown(row[c] || '');
          curStream.beginText();
          curStream.setFont(isHeader ? fBold : fNormal, opts.baseFontSize * 0.95);
          curStream.setFillColor(0.1, 0.1, 0.1);
          curStream.moveText(opts.margins.left + (c * colWidth) + 4, curY - (opts.baseFontSize * 1.1));
          curStream.showText(cellText.slice(0, 30));
          curStream.endText();
        }

        // Bottom border line
        curStream.setStrokeColor(0.8, 0.8, 0.8);
        curStream.setLineWidth(0.5);
        curStream.drawLine(opts.margins.left, curY - rowHeight, pageWidth - opts.margins.right, curY - rowHeight);

        curY -= rowHeight;
      }
      curY -= 8;
      continue;
    }
  }

  // Finalize pages and attach headers/footers
  const totalPages = pageStreams.length;
  for (let p = 0; p < totalPages; p++) {
    const stream = pageStreams[p];
    const pageNum = p + 1;

    if (opts.header) {
      stream.beginText();
      stream.setFont(fNormal, 9);
      stream.setFillColor(0.4, 0.4, 0.4);
      stream.moveText(opts.margins.left, pageHeight - opts.margins.top + 15);
      stream.showText(opts.header);
      stream.endText();
    }

    if (opts.footer || opts.showPageNumbers) {
      stream.beginText();
      stream.setFont(fNormal, 9);
      stream.setFillColor(0.4, 0.4, 0.4);

      if (opts.footer) {
        stream.moveText(opts.margins.left, opts.margins.bottom - 20);
        stream.showText(opts.footer);
      }

      if (opts.showPageNumbers) {
        const pageStr = `${pageNum} / ${totalPages}`;
        stream.moveText(pageWidth - opts.margins.right - 40, opts.margins.bottom - 20);
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
  if (options.format === 'uint8array') {
    return pdfBytes;
  }
  return createBlob([pdfBytes], 'application/pdf');
}

function wrapTextSimple(text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';

  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    const approxW = test.length * fontSize * 0.52;
    if (approxW <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
