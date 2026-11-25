import { PdfToolkitError, ERROR_CODES } from './errors.js';
import { DEFAULT_LIMITS } from './limits.js';

/**
 * Decompresses Flate (Deflate/zlib) compressed data.
 * Uses native DecompressionStream('deflate') where supported.
 * Handles both raw deflate and zlib wrapper (RFC 1950 / RFC 1951).
 *
 * @param {Uint8Array} compressedBytes
 * @param {number} [maxDecompressedSize]
 * @returns {Promise<Uint8Array>}
 */
export async function decompressFlate(compressedBytes, maxDecompressedSize = DEFAULT_LIMITS.maxDecompressedStreamSize) {
  if (!(compressedBytes instanceof Uint8Array)) {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'compressedBytes must be Uint8Array');
  }

  if (compressedBytes.length === 0) {
    return new Uint8Array(0);
  }

  // DecompressionStream is available in modern browsers and Node 18+
  if (typeof DecompressionStream !== 'undefined') {
    // PDF streams can use zlib wrapper (starts with 0x78) or raw deflate.
    // DecompressionStream('deflate') expects zlib wrapper (RFC 1950).
    // DecompressionStream('deflate-raw') expects raw deflate (RFC 1951).
    let format = 'deflate';
    const b0 = compressedBytes[0];
    const b1 = compressedBytes[1];
    // Check if it's zlib header: standard headers are 0x78 0x01, 0x78 0x9c, 0x78 0xda, 0x78 0x5e
    const isZlib = b0 === 0x78 && ((b0 * 256 + b1) % 31 === 0);
    if (!isZlib) {
      format = 'deflate-raw';
    }

    try {
      return await streamDecompress(compressedBytes, format, maxDecompressedSize);
    } catch (firstErr) {
      // If failed, attempt the alternate format
      try {
        const altFormat = format === 'deflate' ? 'deflate-raw' : 'deflate';
        return await streamDecompress(compressedBytes, altFormat, maxDecompressedSize);
      } catch {
        throw new PdfToolkitError(
          ERROR_CODES.STREAM_DECOMPRESSION_FAILED,
          `Failed to decompress Flate stream: ${firstErr.message}`
        );
      }
    }
  }

  throw new PdfToolkitError(
    ERROR_CODES.UNSUPPORTED_OPERATION,
    'Native DecompressionStream is not available in this environment'
  );
}

/**
 * Helper to decompress via DecompressionStream.
 * @param {Uint8Array} bytes
 * @param {'deflate' | 'deflate-raw'} format
 * @param {number} maxSize
 * @returns {Promise<Uint8Array>}
 */
async function streamDecompress(bytes, format, maxSize) {
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  // Catch any write rejection in case reading is cancelled early
  writer.write(bytes).then(() => writer.close()).catch(() => {});

  const reader = ds.readable.getReader();
  const chunks = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.length;
      if (totalLength > maxSize) {
        try { await reader.cancel(); } catch {}
        throw new PdfToolkitError(
          ERROR_CODES.STREAM_DECOMPRESSION_FAILED,
          `Decompressed stream size (${totalLength}) exceeds maximum allowable size (${maxSize})`
        );
      }
      chunks.push(value);
    }
  } catch (err) {
    try { await reader.cancel(); } catch {}
    throw err;
  }

  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Compresses data using Flate (Deflate/zlib) using native CompressionStream('deflate').
 * @param {Uint8Array} uncompressedBytes
 * @returns {Promise<Uint8Array>}
 */
export async function compressFlate(uncompressedBytes) {
  if (uncompressedBytes.length === 0) {
    return new Uint8Array(0);
  }

  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate');
      const writer = cs.writable.getWriter();
      writer.write(uncompressedBytes);
      writer.close();

      const reader = cs.readable.getReader();
      const chunks = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalLength += value.length;
        chunks.push(value);
      }

      const out = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    } catch (err) {
      throw new PdfToolkitError(
        ERROR_CODES.STREAM_DECOMPRESSION_FAILED,
        `Stream compression failed: ${err.message}`
      );
    }
  }

  // If CompressionStream is not available, we return original uncompressed
  return uncompressedBytes;
}
