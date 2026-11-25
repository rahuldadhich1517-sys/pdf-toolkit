import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getPdfToolkitCapabilities, SUPPORTED_PDF_PROFILE } from '../../src/capabilities/index.js';
import { encryptPdf } from '../../src/pdf-encrypt/index.js';
import { decryptPdf } from '../../src/pdf-decrypt/index.js';
import { getTiffConversionCapabilities } from '../../src/tiff-to-pdf/index.js';
import { ERROR_CODES } from '../../src/shared/errors.js';

describe('capabilities and restricted utilities', () => {
  test('capability registry reports all 16 utilities with detailed metadata', () => {
    const caps = getPdfToolkitCapabilities();
    assert.equal(caps.package, '@rahul_dadhich15/pdf-toolkit');
    assert.equal(caps.supportedPdfProfile, 'pdf-toolkit-basic-v1');

    const expectedTools = [
      'base64-to-pdf',
      'html-to-pdf',
      'image-to-pdf',
      'markdown-to-pdf',
      'pdf-compress',
      'pdf-merge',
      'pdf-metadata',
      'pdf-encrypt',
      'pdf-decrypt',
      'pdf-rotate',
      'pdf-split',
      'pdf-to-image',
      'pdf-to-raw',
      'pdf-to-text',
      'text-to-pdf',
      'tiff-to-pdf'
    ];

    assert.equal(Object.keys(caps.tools).length, 16);
    for (const toolId of expectedTools) {
      assert.ok(caps.tools[toolId], `Tool ${toolId} must be present in registry`);
      assert.ok(['full', 'limited', 'unsupported'].includes(caps.tools[toolId].status));
      assert.ok(Array.isArray(caps.tools[toolId].limitations));
    }

    // Verify honest reporting
    assert.equal(caps.tools['html-to-pdf'].status, 'limited');
    assert.equal(caps.tools['html-to-pdf'].returnsPdfBlob, false);
    assert.equal(caps.tools['html-to-pdf'].requiresUserAction, true);
    assert.equal(caps.tools['html-to-pdf'].classification, 'browser-dependent');

    assert.equal(caps.tools['pdf-encrypt'].status, 'unsupported');
    assert.equal(caps.tools['pdf-decrypt'].status, 'unsupported');
    assert.equal(caps.tools['tiff-to-pdf'].status, 'limited');
    assert.equal(caps.tools['pdf-to-image'].status, 'limited');

    // Manipulation and compression utilities are profile-limited
    assert.equal(caps.tools['pdf-compress'].status, 'limited');
    assert.equal(caps.tools['pdf-compress'].classification, 'profile-limited');
    assert.equal(caps.tools['pdf-merge'].status, 'limited');
    assert.equal(caps.tools['pdf-merge'].classification, 'profile-limited');
    assert.equal(caps.tools['pdf-split'].status, 'limited');
    assert.equal(caps.tools['pdf-metadata'].status, 'limited');
  });

  test('encryptPdf throws UNSUPPORTED_OPERATION without pretending to succeed', async () => {
    await assert.rejects(
      async () => encryptPdf(new Uint8Array(10), {}),
      { code: ERROR_CODES.UNSUPPORTED_OPERATION }
    );
  });

  test('decryptPdf throws UNSUPPORTED_OPERATION without pretending to succeed', async () => {
    await assert.rejects(
      async () => decryptPdf(new Uint8Array(10), 'pass'),
      { code: ERROR_CODES.UNSUPPORTED_OPERATION }
    );
  });

  test('reports TIFF conversion capabilities accurately', () => {
    const tiffCaps = getTiffConversionCapabilities();
    assert.equal(typeof tiffCaps.supported, 'boolean');
    assert.ok(Array.isArray(tiffCaps.limitations));
  });
});
