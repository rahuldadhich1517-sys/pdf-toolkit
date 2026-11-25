import { PdfToolkitError, ERROR_CODES } from './errors.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('latin1');
const utf8Decoder = new TextDecoder('utf-8');

/**
 * Normalizes any binary-like input (Uint8Array, ArrayBuffer, ArrayBufferView) to a Uint8Array.
 * If input is a Blob/File, async resolution is required.
 * @param {unknown} input
 * @returns {Uint8Array}
 */
export function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new PdfToolkitError(
    ERROR_CODES.INVALID_INPUT,
    'Expected Uint8Array, ArrayBuffer, or TypedArray view'
  );
}

/**
 * Asynchronously normalizes input including Blobs and Files to Uint8Array.
 * @param {unknown} input
 * @returns {Promise<Uint8Array>}
 */
export async function normalizeBinaryInput(input) {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const buffer = await input.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return toUint8Array(input);
}

/**
 * Creates a Blob from binary parts if Blob is defined in the environment.
 * @param {Array<Uint8Array | string>} parts
 * @param {string} [type='application/pdf']
 * @returns {Blob}
 */
export function createBlob(parts, type = 'application/pdf') {
  if (typeof Blob !== 'undefined') {
    return new Blob(parts, { type });
  }
  // In pure Node.js older than global Blob, fallback:
  if (typeof globalThis.Blob !== 'undefined') {
    return new globalThis.Blob(parts, { type });
  }
  throw new PdfToolkitError(
    ERROR_CODES.UNSUPPORTED_OPERATION,
    'Blob API is not available in the current environment'
  );
}

/**
 * Decodes ASCII/Latin1 string to Uint8Array.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function stringToBytes(str) {
  return textEncoder.encode(str);
}

/**
 * Decodes Uint8Array to Latin1/binary string (byte values 0-255 preserved).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToLatin1String(bytes) {
  return textDecoder.decode(bytes);
}

/**
 * Decodes Uint8Array to UTF-8 string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToUtf8String(bytes) {
  return utf8Decoder.decode(bytes);
}

/**
 * Validates Base64 string and decodes it without third-party libraries.
 * Handles whitespace and checks padding.
 * @param {string} base64
 * @param {number} [maxSize]
 * @returns {Uint8Array}
 */
export function decodeBase64(base64, maxSize) {
  if (typeof base64 !== 'string') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Base64 input must be a string');
  }

  // Strip all ASCII whitespace
  const sanitized = base64.replace(/\s+/g, '');
  if (sanitized.length === 0) {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Base64 input is empty');
  }

  if (sanitized.length % 4 !== 0) {
    throw new PdfToolkitError(
      ERROR_CODES.INVALID_INPUT,
      `Invalid Base64 length (${sanitized.length}), must be multiple of 4`
    );
  }

  // Validate characters
  const validBase64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!validBase64Pattern.test(sanitized)) {
    throw new PdfToolkitError(
      ERROR_CODES.INVALID_INPUT,
      'Base64 string contains invalid characters'
    );
  }

  // Pre-calculate estimated byte size
  let padding = 0;
  if (sanitized.endsWith('==')) {
    padding = 2;
  } else if (sanitized.endsWith('=')) {
    padding = 1;
  }
  const byteLength = (sanitized.length * 3) / 4 - padding;

  if (maxSize && byteLength > maxSize) {
    throw new PdfToolkitError(
      ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED,
      `Decoded size (${byteLength} bytes) exceeds limit of ${maxSize} bytes`
    );
  }

  // Use globalThis.atob or native Node Buffer if available
  if (typeof globalThis.atob === 'function') {
    try {
      const binaryStr = globalThis.atob(sanitized);
      const out = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        out[i] = binaryStr.charCodeAt(i);
      }
      return out;
    } catch (err) {
      throw new PdfToolkitError(
        ERROR_CODES.INVALID_INPUT,
        `Base64 decode failed: ${err.message}`
      );
    }
  }

  // Pure JS fallback table decode
  const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const revLookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < b64chars.length; i++) {
    revLookup[b64chars.charCodeAt(i)] = i;
  }

  const out = new Uint8Array(byteLength);
  let outIdx = 0;
  for (let i = 0; i < sanitized.length; i += 4) {
    const c0 = revLookup[sanitized.charCodeAt(i)];
    const c1 = revLookup[sanitized.charCodeAt(i + 1)];
    const c2 = sanitized[i + 2] === '=' ? 0 : revLookup[sanitized.charCodeAt(i + 2)];
    const c3 = sanitized[i + 3] === '=' ? 0 : revLookup[sanitized.charCodeAt(i + 3)];

    if (c0 < 0 || c1 < 0 || (sanitized[i + 2] !== '=' && c2 < 0) || (sanitized[i + 3] !== '=' && c3 < 0)) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Invalid character in Base64 string');
    }

    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < byteLength) out[outIdx++] = (triple >> 16) & 0xff;
    if (outIdx < byteLength && sanitized[i + 2] !== '=') out[outIdx++] = (triple >> 8) & 0xff;
    if (outIdx < byteLength && sanitized[i + 3] !== '=') out[outIdx++] = triple & 0xff;
  }
  return out;
}

/**
 * Encodes Uint8Array into Base64 string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encodeBase64(bytes) {
  const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = bytes.length;
  let result = '';
  let i = 0;

  for (; i + 2 < len; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result += b64chars[(triple >> 18) & 0x3f];
    result += b64chars[(triple >> 12) & 0x3f];
    result += b64chars[(triple >> 6) & 0x3f];
    result += b64chars[triple & 0x3f];
  }

  if (i < len) {
    if (len - i === 1) {
      const single = bytes[i] << 16;
      result += b64chars[(single >> 18) & 0x3f];
      result += b64chars[(single >> 12) & 0x3f];
      result += '==';
    } else {
      const double = (bytes[i] << 16) | (bytes[i + 1] << 8);
      result += b64chars[(double >> 18) & 0x3f];
      result += b64chars[(double >> 12) & 0x3f];
      result += b64chars[(double >> 6) & 0x3f];
      result += '=';
    }
  }

  return result;
}

/**
 * Dynamic growable byte buffer for constructing binary PDFs.
 */
export class ByteWriter {
  /**
   * @param {number} [initialCapacity=4096]
   */
  constructor(initialCapacity = 4096) {
    this.buffer = new Uint8Array(initialCapacity);
    this.length = 0;
  }

  _ensure(additional) {
    const needed = this.length + additional;
    if (needed > this.buffer.length) {
      let newCapacity = Math.max(this.buffer.length * 2, needed);
      const newBuf = new Uint8Array(newCapacity);
      newBuf.set(this.buffer.subarray(0, this.length));
      this.buffer = newBuf;
    }
  }

  /**
   * Appends single byte (0-255).
   * @param {number} b
   * @returns {ByteWriter}
   */
  writeByte(b) {
    this._ensure(1);
    this.buffer[this.length++] = b & 0xff;
    return this;
  }

  /**
   * Appends Uint8Array or slice of bytes.
   * @param {Uint8Array} bytes
   * @returns {ByteWriter}
   */
  writeBytes(bytes) {
    this._ensure(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
    return this;
  }

  /**
   * Writes string encoded as UTF-8 or ASCII bytes.
   * @param {string} str
   * @returns {ByteWriter}
   */
  writeString(str) {
    const encoded = textEncoder.encode(str);
    return this.writeBytes(encoded);
  }

  /**
   * Writes a line of string followed by newline \n.
   * @param {string} str
   * @returns {ByteWriter}
   */
  writeLine(str = '') {
    this.writeString(str);
    this.writeByte(0x0a);
    return this;
  }

  /**
   * Returns current offset in bytes.
   * @returns {number}
   */
  get offset() {
    return this.length;
  }

  /**
   * Returns copy of the accumulated bytes.
   * @returns {Uint8Array}
   */
  toBytes() {
    return this.buffer.slice(0, this.length);
  }
}
