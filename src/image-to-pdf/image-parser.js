import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';

/**
 * Extracts width, height, and color channels from JPEG byte stream.
 * Pure JS parser searching for Start of Frame (SOF) markers.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, channels: number }}
 */
export function parseJpegInfo(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new PdfToolkitError(ERROR_CODES.IMAGE_DECODE_FAILED, 'Not a valid JPEG image (missing SOI)');
  }

  let offset = 2;
  const len = bytes.length;

  while (offset < len) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    // Standalone markers without length
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > len) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];

    // SOF0 (Baseline), SOF1 (Extended Sequential), SOF2 (Progressive)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (offset + 8 > len) {
        throw new PdfToolkitError(ERROR_CODES.IMAGE_DECODE_FAILED, 'Truncated JPEG SOF segment');
      }
      const precision = bytes[offset + 2];
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const channels = bytes[offset + 7];

      return { width, height, channels, precision };
    }

    offset += segmentLength;
  }

  throw new PdfToolkitError(
    ERROR_CODES.IMAGE_DECODE_FAILED,
    'Could not find valid SOF marker in JPEG file'
  );
}

/**
 * Extracts dimensions and color info from PNG IHDR chunk.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, bitDepth: number, colorType: number }}
 */
export function parsePngInfo(bytes) {
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24) {
    throw new PdfToolkitError(ERROR_CODES.IMAGE_DECODE_FAILED, 'Input too small to be a valid PNG');
  }

  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== pngSig[i]) {
      throw new PdfToolkitError(ERROR_CODES.IMAGE_DECODE_FAILED, 'Not a valid PNG image');
    }
  }

  // Next chunk should be IHDR (length: 4 bytes, type: 4 bytes 'IHDR')
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunkType !== 'IHDR') {
    throw new PdfToolkitError(ERROR_CODES.IMAGE_DECODE_FAILED, 'First PNG chunk must be IHDR');
  }

  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  const bitDepth = bytes[24];
  const colorType = bytes[25];

  return { width, height, bitDepth, colorType };
}

/**
 * Detects image format based on magic bytes.
 * @param {Uint8Array} bytes
 * @returns {'jpeg' | 'png' | 'unknown'}
 */
export function detectImageFormat(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  return 'unknown';
}
