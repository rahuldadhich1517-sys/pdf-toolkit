import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PdfParser } from '../../src/pdf-core/pdf-parser.js';
import { extractPdfText } from '../../src/pdf-to-text/index.js';
import { extractPdfRawContentStreams } from '../../src/pdf-to-raw/index.js';
import { updatePdfMetadata } from '../../src/pdf-metadata/index.js';
import { rotatePdfPages } from '../../src/pdf-rotate/index.js';
import { ERROR_CODES } from '../../src/shared/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('real PDF fixtures audit', () => {
  test('parses basic-1.4.pdf fixture and extracts metadata & text', async () => {
    const bytes = readFileSync(join(__dirname, '../fixtures/basic-1.4.pdf'));
    const parser = new PdfParser(new Uint8Array(bytes));
    await parser.parse();

    assert.equal(parser.pdfVersion, '1.4');
    assert.equal(parser.pages.length, 3);

    const { text, pages } = await extractPdfText(new Uint8Array(bytes));
    assert.equal(pages.length, 3);
    assert.ok(text.includes('Fixture page 1 content'));
    assert.ok(text.includes('Fixture page 2 content'));
    assert.ok(text.includes('Fixture page 3 content'));
  });

  test('parses hierarchical-pagetree.pdf and resolves page tree inheritance', async () => {
    const bytes = readFileSync(join(__dirname, '../fixtures/hierarchical-pagetree.pdf'));
    const parser = new PdfParser(new Uint8Array(bytes));
    await parser.parse();

    assert.equal(parser.pages.length, 2);

    // Page 1 inherits MediaBox [0, 0, 612, 792] from parent Pages node
    const page1 = parser.pages[0];
    const mb1 = parser.resolve(page1.get('MediaBox'));
    assert.deepEqual(mb1, [0, 0, 612, 792]);

    // Page 2 overrides MediaBox [0, 0, 400, 400]
    const page2 = parser.pages[1];
    const mb2 = parser.resolve(page2.get('MediaBox'));
    assert.deepEqual(mb2, [0, 0, 400, 400]);

    const { text } = await extractPdfText(new Uint8Array(bytes));
    assert.ok(text.includes('Hierarchical'));
  });

  test('handles page with multiple content streams correctly', async () => {
    const bytes = readFileSync(join(__dirname, '../fixtures/multiple-content-streams.pdf'));
    const parser = new PdfParser(new Uint8Array(bytes));
    await parser.parse();

    assert.equal(parser.pages.length, 1);

    const rawStreams = await extractPdfRawContentStreams(new Uint8Array(bytes), { decode: true });
    assert.equal(rawStreams.length, 2);

    const { text } = await extractPdfText(new Uint8Array(bytes));
    assert.ok(text.includes('Part One'));
    assert.ok(text.includes('Part Two'));
  });

  test('rejects modifying digitally signed documents', async () => {
    const bytes = readFileSync(join(__dirname, '../fixtures/signed-sample.pdf'));
    const uint8 = new Uint8Array(bytes);

    // update metadata should reject signed document
    await assert.rejects(
      async () => updatePdfMetadata(uint8, { Title: 'Hack' }),
      { code: ERROR_CODES.DOCUMENT_SIGNATURE_PRESENT }
    );

    // rotate should reject signed document
    await assert.rejects(
      async () => rotatePdfPages(uint8, { degrees: 90 }),
      { code: ERROR_CODES.DOCUMENT_SIGNATURE_PRESENT }
    );
  });

  test('rejects broken cross-reference tables with out-of-bounds offsets', async () => {
    const bytes = readFileSync(join(__dirname, '../fixtures/broken-xref.pdf'));
    const parser = new PdfParser(new Uint8Array(bytes));

    await assert.rejects(
      async () => parser.parse(),
      { code: ERROR_CODES.INVALID_PDF }
    );
  });
});
