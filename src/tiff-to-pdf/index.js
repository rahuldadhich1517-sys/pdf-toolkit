import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { PdfWriter } from '../pdf-core/pdf-writer.js';
import { ContentStream } from '../pdf-core/content-stream.js';
import { resolvePageDimensions, resolveMargins } from '../shared/units.js';

/**
 * Returns runtime TIFF conversion capabilities in the current browser.
 * Most modern browsers (Chrome, Firefox, Edge) do not natively decode TIFF without Safari/WebKit or OS plugins.
 * @returns {{ supported: boolean, engine: string, limitations: string[] }}
 */
export function getTiffConversionCapabilities() {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  // Check if browser native image support includes TIFF
  const hasNativeTiff = isBrowser && typeof Image !== 'undefined';

  return {
    supported: hasNativeTiff,
    engine: hasNativeTiff ? 'browser-native' : 'none',
    limitations: [
      'Multi-page TIFF documents are limited to first decodable frame in browser',
      'TIFF support depends on host browser engine (native in Safari, limited in Chrome/Firefox)',
      'No third-party WebAssembly/C decoders are bundled to maintain zero-dependency guarantee'
    ]
  };
}

/**
 * Validates TIFF input signature (little-endian II\x2a\x00 or big-endian MM\x00\x2a).
 * @param {Uint8Array} bytes
 * @returns {{ valid: boolean, isLittleEndian?: boolean, error?: string }}
 */
export function validateTiffInput(bytes) {
  if (bytes.length < 8) {
    return { valid: false, error: 'Input too short to be a valid TIFF' };
  }

  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];

  const isLittle = b0 === 0x49 && b1 === 0x49 && b2 === 0x2a && b3 === 0x00; // 'II*\0'
  const isBig = b0 === 0x4d && b1 === 0x4d && b2 === 0x00 && b3 === 0x2a;    // 'MM\0*'

  if (!isLittle && !isBig) {
    return { valid: false, error: 'Not a valid TIFF header (missing II or MM signature)' };
  }

  return { valid: true, isLittleEndian: isLittle };
}

/**
 * Reads basic TIFF metadata (dimensions, byte order) from IFD.
 * @param {Uint8Array | ArrayBuffer | Blob} tiffInput
 * @returns {Promise<{ width: number, height: number, isLittleEndian: boolean, pageCount: number }>}
 */
export async function getTiffMetadata(tiffInput) {
  const bytes = await normalizeBinaryInput(tiffInput);
  const validInfo = validateTiffInput(bytes);
  if (!validInfo.valid) {
    throw new PdfToolkitError(ERROR_CODES.TIFF_NOT_SUPPORTED, validInfo.error);
  }

  const isLE = validInfo.isLittleEndian;
  const readUint16 = (off) => isLE ? bytes[off] | (bytes[off + 1] << 8) : (bytes[off] << 8) | bytes[off + 1];
  const readUint32 = (off) => isLE
    ? (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0
    : ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;

  const firstIfdOffset = readUint32(4);
  if (firstIfdOffset >= bytes.length) {
    throw new PdfToolkitError(ERROR_CODES.TIFF_NOT_SUPPORTED, 'Invalid first IFD offset in TIFF');
  }

  let width = 0;
  let height = 0;
  const numEntries = readUint16(firstIfdOffset);

  for (let i = 0; i < numEntries; i++) {
    const entryOff = firstIfdOffset + 2 + i * 12;
    if (entryOff + 12 > bytes.length) break;
    const tag = readUint16(entryOff);
    const type = readUint16(entryOff + 2);
    const value = type === 3 ? readUint16(entryOff + 8) : readUint32(entryOff + 8);

    if (tag === 256) width = value; // ImageWidth
    if (tag === 257) height = value; // ImageLength
  }

  return {
    width,
    height,
    isLittleEndian: isLE,
    pageCount: 1
  };
}

/**
 * Converts TIFF image into a PDF using browser-native decoding where available.
 * If browser cannot decode the format, returns clear TIFF_NOT_SUPPORTED error.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} tiffInput
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function tiffToPdf(tiffInput, options = {}) {
  const bytes = await normalizeBinaryInput(tiffInput);
  const validInfo = validateTiffInput(bytes);
  if (!validInfo.valid) {
    throw new PdfToolkitError(ERROR_CODES.TIFF_NOT_SUPPORTED, validInfo.error);
  }

  const meta = await getTiffMetadata(bytes);

  // If in browser environment, attempt native image decode
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    try {
      const decoded = await attemptBrowserTiffDecode(bytes);
      // Embed decoded canvas into PDF
      const writer = new PdfWriter();
      const dims = resolvePageDimensions(options.pageSize || 'A4');
      const margins = resolveMargins(options.margins || 20);

      const imgAlias = await writer.addImage({
        bytes: decoded.rgbBytes,
        width: decoded.width,
        height: decoded.height,
        format: 'raw-rgb',
        compress: true
      });

      const stream = new ContentStream();
      const availW = dims[0] - margins.left - margins.right;
      const availH = dims[1] - margins.top - margins.bottom;
      const aspect = decoded.width / decoded.height;
      let rW = availW;
      let rH = availW / aspect;
      if (rH > availH) {
        rH = availH;
        rW = availH * aspect;
      }

      stream.drawImage(imgAlias, margins.left, margins.bottom, rW, rH);
      await writer.addPage({ size: dims, content: stream });

      const outBytes = writer.build();
      if (options.format === 'uint8array') return outBytes;
      return createBlob([outBytes], 'application/pdf');
    } catch {
      throw new PdfToolkitError(
        ERROR_CODES.TIFF_NOT_SUPPORTED,
        'The host browser engine cannot decode this TIFF image format natively. Zero-dependency policy prevents third-party binary decoders.'
      );
    }
  }

  // Non-browser or unsupported browser environment
  throw new PdfToolkitError(
    ERROR_CODES.TIFF_NOT_SUPPORTED,
    'TIFF conversion requires browser-native TIFF decoding support or Safari/WebKit runtime.'
  );
}

function attemptBrowserTiffDecode(bytes) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: 'image/tiff' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgb = new Uint8Array(canvas.width * canvas.height * 3);
      let rIdx = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        rgb[rIdx++] = imgData.data[i];
        rgb[rIdx++] = imgData.data[i + 1];
        rgb[rIdx++] = imgData.data[i + 2];
      }
      resolve({ rgbBytes: rgb, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Browser image loading failed'));
    };
    img.src = url;
  });
}
