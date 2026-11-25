import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { textToPdf, generatePdfFromText } from '../../src/text-to-pdf/index.js';
import { markdownToPdf } from '../../src/markdown-to-pdf/index.js';
import { imageToPdf, imagesToPdf } from '../../src/image-to-pdf/index.js';
import { prepareHtmlForPrint, sanitizeHtmlForPrint } from '../../src/html-to-pdf/index.js';
import { PdfParser } from '../../src/pdf-core/pdf-parser.js';
import { extractPdfText } from '../../src/pdf-to-text/index.js';

describe('document generation utilities', () => {
  describe('text-to-pdf', () => {
    test('generates multi-page text PDF with word wrapping', async () => {
      const text = 'Line 1\nLine 2\nLine 3\n\n' + 'A long sentence repeated. '.repeat(100);
      const res = await generatePdfFromText(text, {
        pageSize: 'A4',
        fontSize: 12,
        header: 'Document Header',
        footer: 'Confidential'
      });

      assert.ok(res.bytes.length > 500);
      assert.ok(res.pageCount >= 1);

      // Verify with parser
      const parser = new PdfParser(res.bytes);
      await parser.parse();
      assert.equal(parser.pages.length, res.pageCount);

      // Verify text extraction
      const extracted = await extractPdfText(res.bytes);
      assert.ok(extracted.text.includes('Line 1'));
      assert.ok(extracted.text.includes('Line 2'));
    });

    test('handles empty text gracefully', async () => {
      const bytes = await textToPdf('', { format: 'uint8array' });
      assert.ok(bytes instanceof Uint8Array);
      const parser = new PdfParser(bytes);
      await parser.parse();
      assert.equal(parser.pages.length, 1);
    });
  });

  describe('markdown-to-pdf', () => {
    test('renders headers, lists, code blocks and tables', async () => {
      const md = `
# Markdown Header 1
## Subheader 2

This is a paragraph with **bold text** and *italic words*.

- Bullet item 1
- Bullet item 2

1. Ordered item 1
2. Ordered item 2

> This is a blockquote

\`\`\`javascript
const greeting = "Hello PDF";
console.log(greeting);
\`\`\`

| Column A | Column B |
| --- | --- |
| Val 1 | Val 2 |

---pagebreak---

# Page Two Title
Second page content.
`;

      const bytes = await markdownToPdf(md, { format: 'uint8array' });
      assert.ok(bytes instanceof Uint8Array);

      const parser = new PdfParser(bytes);
      await parser.parse();
      assert.equal(parser.pages.length, 2);

      const extracted = await extractPdfText(bytes);
      assert.ok(extracted.text.includes('Markdown Header 1'));
      assert.ok(extracted.text.includes('Bullet item 1'));
      assert.ok(extracted.text.includes('Page Two Title'));
    });
  });

  describe('image-to-pdf', () => {
    // 1x1 minimal valid baseline JPEG
    const minimalJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
      0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
      0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
      0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
      0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
      0x00, 0xbf, 0x00, 0xff, 0xd9
    ]);

    test('embeds JPEG image directly without re-encoding loss', async () => {
      const bytes = await imageToPdf(minimalJpeg, { format: 'uint8array' });
      assert.ok(bytes instanceof Uint8Array);

      const parser = new PdfParser(bytes);
      await parser.parse();
      assert.equal(parser.pages.length, 1);
    });

    test('supports combining multiple images into a multi-page PDF', async () => {
      const bytes = await imagesToPdf([minimalJpeg, minimalJpeg], { format: 'uint8array' });
      const parser = new PdfParser(bytes);
      await parser.parse();
      assert.equal(parser.pages.length, 2);
    });
  });

  describe('html-to-pdf', () => {
    test('sanitizes script tags and dangerous event handlers', () => {
      const dirtyHtml = '<p onclick="alert(1)">Click</p><script>alert("hack")</script><iframe src="evil.com"></iframe>';
      const clean = sanitizeHtmlForPrint(dirtyHtml);
      assert.ok(!clean.includes('<script>'));
      assert.ok(!clean.includes('onclick'));
      assert.ok(!clean.includes('<iframe'));
    });

    test('prepares print document with page break styling', () => {
      const html = '<h1>Print Me</h1><div class="page-break"></div><p>Page 2</p>';
      const prepared = prepareHtmlForPrint(html, { pageSize: 'Letter', orientation: 'landscape' });
      assert.ok(prepared.includes('@page {'));
      assert.ok(prepared.includes('Letter landscape'));
      assert.ok(prepared.includes('page-break-after: always;'));
    });
  });
});
