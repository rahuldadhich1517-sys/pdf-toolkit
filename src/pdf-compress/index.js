import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { PdfStream, PdfDict, PdfName, PdfRef } from '../shared/pdf-types.js';
import { compressFlate } from '../shared/compression.js';
import { serializePdfWithUpdatedObjects } from '../pdf-metadata/index.js';

export function getPdfCompressionOptions(options = {}) {
  return {
    recompressStreams: options.recompressStreams ?? true,
    removeUnusedObjects: options.removeUnusedObjects ?? true,
    retainIfLarger: options.retainIfLarger ?? true
  };
}

/**
 * Traverses reachable objects from Root and Info to identify and eliminate orphan objects.
 * @param {PdfParser} parser
 * @returns {Set<number>}
 */
function findReachableObjects(parser) {
  const reachable = new Set();
  const queue = [];

  function enqueue(ref) {
    if (ref instanceof PdfRef && !reachable.has(ref.num)) {
      reachable.add(ref.num);
      queue.push(ref);
    }
  }

  if (parser.rootRef) enqueue(parser.rootRef);
  if (parser.infoRef) enqueue(parser.infoRef);

  while (queue.length > 0) {
    const curRef = queue.shift();
    const obj = parser.resolve(curRef);
    scanForRefs(obj, enqueue);
  }

  return reachable;
}

function scanForRefs(val, enqueue) {
  if (!val) return;
  if (val instanceof PdfRef) {
    enqueue(val);
  } else if (Array.isArray(val)) {
    for (const item of val) scanForRefs(item, enqueue);
  } else if (val instanceof PdfDict) {
    for (const [_, v] of val.entries()) scanForRefs(v, enqueue);
  } else if (val instanceof PdfStream) {
    scanForRefs(val.dict, enqueue);
  }
}

/**
 * Gathers stream and compression statistics for a PDF document.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @returns {Promise<object>}
 */
export async function getPdfCompressionInfo(pdfInput) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  let streamCount = 0;
  let uncompressedStreams = 0;
  let totalStreamBytes = 0;

  for (const [objNum] of parser.xrefOffsets) {
    const obj = parser.resolve(new PdfRef(objNum, 0));
    if (obj instanceof PdfStream) {
      streamCount++;
      totalStreamBytes += obj.bytes.length;
      if (!obj.dict.has('Filter')) {
        uncompressedStreams++;
      }
    }
  }

  return {
    originalSize: bytes.length,
    streamCount,
    uncompressedStreams,
    totalStreamBytes,
    pageCount: parser.pages.length,
    pdfVersion: parser.pdfVersion
  };
}

/**
 * Compresses supported PDF streams using native Flate compression and removes unreferenced objects.
 * Preserves document integrity and strictly validates output size.
 *
 * NOTE ON CAPABILITIES:
 * Compression is limited to Flate stream recompression and unreferenced object removal within
 * the `pdf-toolkit-basic-v1` profile. It preserves exact visual and typographic fidelity and
 * does not alter foreign fonts or perform lossy downsampling on unsupported third-party images.
 *
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<object>}
 */
export async function compressPdf(pdfInput, options = {}) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  const opts = getPdfCompressionOptions(options);
  const replacedObjects = new Map();
  let modifiedStreams = 0;

  for (const [objNum] of parser.xrefOffsets) {
    const obj = parser.resolve(new PdfRef(objNum, 0));
    if (obj instanceof PdfStream) {
      const filter = obj.dict.get('Filter');

      // If stream has no filter, apply FlateDecode compression
      if (!filter) {
        const compressed = await compressFlate(obj.bytes);
        if (compressed.length < obj.bytes.length) {
          const newDict = new PdfDict(obj.dict.map);
          newDict.set('Filter', new PdfName('FlateDecode'));
          newDict.set('Length', compressed.length);
          replacedObjects.set(objNum, new PdfStream(newDict, compressed));
          modifiedStreams++;
        }
      } else if (opts.recompressStreams && (filter.value === 'FlateDecode' || filter.value === 'Fl')) {
        // Try decompressing and recompressing with native engine
        try {
          const decompressed = await parser.decodeStream(obj);
          const recompressed = await compressFlate(decompressed);
          if (recompressed.length < obj.bytes.length) {
            const newDict = new PdfDict(obj.dict.map);
            newDict.set('Length', recompressed.length);
            replacedObjects.set(objNum, new PdfStream(newDict, recompressed));
            modifiedStreams++;
          }
        } catch {
          // If stream cannot be safely recompressed, preserve original
        }
      }
    }
  }

  let reachableSet = null;
  if (opts.removeUnusedObjects) {
    reachableSet = findReachableObjects(parser);
  }

  let finalBytes;
  if (replacedObjects.size > 0 || (reachableSet && reachableSet.size < parser.xrefOffsets.size)) {
    finalBytes = serializePdfWithUpdatedObjects(parser, replacedObjects, null, reachableSet);
  } else {
    finalBytes = bytes;
  }

  const originalSize = bytes.length;
  const compressedSize = finalBytes.length;
  let resultBytes = finalBytes;
  let didCompress = compressedSize < originalSize;

  if (compressedSize >= originalSize && opts.retainIfLarger) {
    resultBytes = bytes;
    didCompress = false;
  }

  const reductionRatio = originalSize > 0 ? (originalSize - resultBytes.length) / originalSize : 0;
  const reductionPercentage = Math.round(reductionRatio * 10000) / 100;

  const resultBlob = createBlob([resultBytes], 'application/pdf');

  return {
    bytes: resultBytes,
    blob: resultBlob,
    originalSize,
    compressedSize: resultBytes.length,
    reductionPercentage,
    reductionRatio,
    didCompress,
    modifiedStreams
  };
}
