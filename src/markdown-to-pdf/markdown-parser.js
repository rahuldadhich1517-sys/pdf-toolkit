/**
 * Scoped Markdown parser tailored for PDF generation without external libraries.
 * Handles headings, paragraphs, lists, code blocks, blockquotes, tables, and page breaks.
 */

export const BLOCK_TYPES = Object.freeze({
  H1: 'H1',
  H2: 'H2',
  H3: 'H3',
  H4: 'H4',
  H5: 'H5',
  H6: 'H6',
  PARAGRAPH: 'PARAGRAPH',
  CODE_BLOCK: 'CODE_BLOCK',
  BLOCKQUOTE: 'BLOCKQUOTE',
  UL_ITEM: 'UL_ITEM',
  OL_ITEM: 'OL_ITEM',
  HR: 'HR',
  TABLE: 'TABLE',
  PAGE_BREAK: 'PAGE_BREAK'
});

/**
 * Parses markdown text into a structured AST of blocks.
 * @param {string} markdown
 * @returns {Array<{ type: string, text?: string, lines?: string[], rows?: string[][], level?: number }>}
 */
export function parseMarkdown(markdown) {
  if (typeof markdown !== 'string') {
    return [];
  }

  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Page breaks
    if (trimmed === '---pagebreak---' || trimmed === '\\newpage' || trimmed === '<!-- pagebreak -->') {
      blocks.push({ type: BLOCK_TYPES.PAGE_BREAK });
      i++;
      continue;
    }

    // Fenced Code Blocks
    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip ending ```
      blocks.push({ type: BLOCK_TYPES.CODE_BLOCK, lines: codeLines });
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const type = `H${level}`;
      blocks.push({ type: BLOCK_TYPES[type], text: headingMatch[2].trim(), level });
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: BLOCK_TYPES.HR });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: BLOCK_TYPES.BLOCKQUOTE, text: quoteLines.join(' ') });
      continue;
    }

    // Unordered List (- or *)
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      blocks.push({ type: BLOCK_TYPES.UL_ITEM, text: ulMatch[1] });
      i++;
      continue;
    }

    // Ordered List (1. ...)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      blocks.push({ type: BLOCK_TYPES.OL_ITEM, text: olMatch[2], index: parseInt(olMatch[1], 10) });
      i++;
      continue;
    }

    // Table detection: line contains '|'
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const rowLine = lines[i].trim();
        // check if separator row like |---|---|
        if (!/^\|[\s\-:|]+\|$/.test(rowLine)) {
          const cells = rowLine
            .slice(1, -1)
            .split('|')
            .map(c => c.trim());
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        blocks.push({ type: BLOCK_TYPES.TABLE, rows: tableRows });
        continue;
      }
    }

    // Paragraph: collect consecutive non-empty lines
    const pLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('- ') &&
      !lines[i].trim().startsWith('* ') &&
      !/^\d+\.\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('|')
    ) {
      pLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: BLOCK_TYPES.PARAGRAPH, text: pLines.join(' ') });
  }

  return blocks;
}

/**
 * Strips inline formatting tags like **bold**, *italic*, `code` to plain text.
 * @param {string} text
 * @returns {string}
 */
export function stripInlineMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
