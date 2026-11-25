/**
 * Resource limits and security boundaries.
 * Enforced across all parsers, generators, and processors.
 */

export const DEFAULT_LIMITS = Object.freeze({
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSize: 50 * 1024 * 1024,
  /** Maximum number of pages supported in a single document (default: 2000) */
  maxPageCount: 2000,
  /** Maximum indirect objects in PDF xref/body (default: 50000) */
  maxObjectCount: 50000,
  /** Maximum width or height of an image in pixels (default: 10000) */
  maxImageDimension: 10000,
  /** Maximum total image pixels (default: 40 million) */
  maxImagePixels: 40_000_000,
  /** Maximum decompressed stream size in bytes (default: 20MB per stream) */
  maxDecompressedStreamSize: 20 * 1024 * 1024,
  /** Maximum recursion depth for nested dictionaries/arrays/page trees */
  maxRecursionDepth: 50,
  /** Maximum PDF string length in bytes (default: 5MB) */
  maxStringLength: 5 * 1024 * 1024
});

/**
 * Validates limits options against default bounds.
 * @param {Partial<typeof DEFAULT_LIMITS>} [customLimits]
 * @returns {typeof DEFAULT_LIMITS}
 */
export function resolveLimits(customLimits = {}) {
  return Object.freeze({
    maxFileSize: Math.min(customLimits.maxFileSize ?? DEFAULT_LIMITS.maxFileSize, 200 * 1024 * 1024),
    maxPageCount: Math.min(customLimits.maxPageCount ?? DEFAULT_LIMITS.maxPageCount, 10000),
    maxObjectCount: Math.min(customLimits.maxObjectCount ?? DEFAULT_LIMITS.maxObjectCount, 100000),
    maxImageDimension: Math.min(customLimits.maxImageDimension ?? DEFAULT_LIMITS.maxImageDimension, 20000),
    maxImagePixels: Math.min(customLimits.maxImagePixels ?? DEFAULT_LIMITS.maxImagePixels, 100_000_000),
    maxDecompressedStreamSize: Math.min(customLimits.maxDecompressedStreamSize ?? DEFAULT_LIMITS.maxDecompressedStreamSize, 50 * 1024 * 1024),
    maxRecursionDepth: Math.min(customLimits.maxRecursionDepth ?? DEFAULT_LIMITS.maxRecursionDepth, 100),
    maxStringLength: Math.min(customLimits.maxStringLength ?? DEFAULT_LIMITS.maxStringLength, 20 * 1024 * 1024)
  });
}
