import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PdfParser } from '../../src/pdf-core/pdf-parser.js';
import { decompressFlate } from '../../src/shared/compression.js';
import { stringToBytes } from '../../src/shared/binary.js';
import { ERROR_CODES } from '../../src/shared/errors.js';
import { imagesToPdf } from '../../src/image-to-pdf/index.js';
import { sanitizeHtmlForPrint } from '../../src/html-to-pdf/index.js';

describe('security audit: malformed inputs, bombs and injections', () => {
  test('rejects decompression bomb exceeding stream size limit', async () => {
    // Generate a 1KB compressed block of zeroes that expands into > 1MB
    const uncompressedZeros = new Uint8Array(1024 * 100); // 100 KB of zeroes
    // Use CompressionStream
    const cs = new CompressionStream('deflate');
    const w = cs.writable.getWriter();
    w.write(uncompressedZeros);
    w.close();
    const r = cs.readable.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const compressed = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      compressed.set(c, off);
      off += c.length;
    }

    // Attempt decompressing with a tight limit of 1000 bytes
    await assert.rejects(
      async () => decompressFlate(compressed, 1000),
      { code: ERROR_CODES.STREAM_DECOMPRESSION_FAILED }
    );
  });

  test('rejects image with dimensions exceeding maxImageDimension limit', async () => {
    // Construct JPEG SOF header claiming 50,000 x 50,000 pixels
    const oversizedJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08,
      0xc3, 0x50, // height = 50,000
      0xc3, 0x50, // width = 50,000
      0x03, 0x01, 0x11, 0x00, 0xff, 0xd9
    ]);

    await assert.rejects(
      async () => imagesToPdf([oversizedJpeg], { limits: { maxImageDimension: 10000 } }),
      { code: ERROR_CODES.IMAGE_DECODE_FAILED }
    );
  });

  test('HTML sanitization neutralizes diverse XSS vectors', () => {
    const vectors = [
      '<script src="https://evil.com/payload.js"></script>',
      '<a href="javascript:void(document.cookie)">Click me</a>',
      '<img src="x" onerror="alert(document.domain)" />',
      '<body onload="alert(1)">',
      '<input onfocus="alert(1)" autofocus>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<object data="evil.swf"></object>',
      '<embed src="evil.pdf"></embed>'
    ];

    for (const vec of vectors) {
      const cleaned = sanitizeHtmlForPrint(vec);
      assert.ok(!cleaned.includes('<script'), `Must neutralize script in: ${vec}`);
      assert.ok(!cleaned.includes('onerror='), `Must neutralize onerror in: ${vec}`);
      assert.ok(!cleaned.includes('onload='), `Must neutralize onload in: ${vec}`);
      assert.ok(!cleaned.includes('onfocus='), `Must neutralize onfocus in: ${vec}`);
      assert.ok(!cleaned.includes('javascript:'), `Must neutralize javascript: URI in: ${vec}`);
      assert.ok(!cleaned.includes('<iframe'), `Must neutralize iframe in: ${vec}`);
      assert.ok(!cleaned.includes('<object'), `Must neutralize object in: ${vec}`);
      assert.ok(!cleaned.includes('<embed'), `Must neutralize embed in: ${vec}`);
    }
  });

  test('rejects truncated and corrupted PDF streams', async () => {
    const { ByteWriter } = await import('../../src/shared/binary.js');
    const bw = new ByteWriter();
    bw.writeLine('%PDF-1.4');
    const off = [];
    off[1] = bw.offset;
    bw.writeLine('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
    off[2] = bw.offset;
    bw.writeLine('2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj');
    off[3] = bw.offset;
    bw.writeLine('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 612 792 ] /Contents 4 0 R >>\nendobj');
    off[4] = bw.offset;
    bw.writeLine('4 0 obj\n<< >>\nstream\nTruncated stream bytes without terminating marker\n');
    const startXref = bw.offset;
    bw.writeLine('xref\n0 5\n0000000000 65535 f ');
    for (let i = 1; i <= 4; i++) {
      bw.writeLine(`${String(off[i]).padStart(10, '0')} 00000 n `);
    }
    bw.writeLine('trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + startXref + '\n%%EOF');

    const bytes = bw.toBytes();
    const parser = new PdfParser(bytes);
    await parser.parse();

    const { PdfRef } = await import('../../src/shared/pdf-types.js');
    assert.throws(
      () => parser.resolve(new PdfRef(4, 0)),
      { code: ERROR_CODES.MALFORMED_PDF_OBJECT }
    );
  });
});
