import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { PdfParser } from '../pdf-core/pdf-parser.js';
import { PdfDict, PdfString, PdfRef, PdfName } from '../shared/pdf-types.js';
import { parsePdfDate, formatPdfDate, escapePdfString } from '../shared/strings.js';
import { ByteWriter } from '../shared/binary.js';

export const METADATA_FIELDS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];

/**
 * Validates metadata object fields.
 * @param {Record<string, unknown>} metadata
 * @returns {boolean}
 */
export function validatePdfMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_METADATA, 'Metadata must be an object');
  }
  for (const [k, v] of Object.entries(metadata)) {
    if (v !== undefined && v !== null && typeof v !== 'string' && !(v instanceof Date)) {
      throw new PdfToolkitError(
        ERROR_CODES.INVALID_METADATA,
        `Metadata field '${k}' must be a string or Date`
      );
    }
  }
  return true;
}

/**
 * Reads standard metadata from a PDF document.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readPdfMetadata(pdfInput) {
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  const result = {
    title: null,
    author: null,
    subject: null,
    keywords: null,
    creator: null,
    producer: null,
    creationDate: null,
    modDate: null,
    pageCount: parser.pages.length,
    pdfVersion: parser.pdfVersion,
    isEncrypted: false,
    hasXmp: false
  };

  if (parser.infoRef) {
    const infoDict = parser.resolve(parser.infoRef);
    if (infoDict instanceof PdfDict) {
      const getStr = (key) => {
        const v = infoDict.get(key);
        if (v instanceof PdfString) return v.value;
        if (typeof v === 'string') return v;
        return null;
      };

      result.title = getStr('Title');
      result.author = getStr('Author');
      result.subject = getStr('Subject');
      result.keywords = getStr('Keywords');
      result.creator = getStr('Creator');
      result.producer = getStr('Producer');

      const cd = getStr('CreationDate');
      result.creationDate = cd ? parsePdfDate(cd) : null;
      const md = getStr('ModDate');
      result.modDate = md ? parsePdfDate(md) : null;
    }
  }

  // Check if Catalog has /Metadata (XMP)
  const catalog = parser.resolve(parser.rootRef);
  if (catalog instanceof PdfDict && catalog.has('Metadata')) {
    result.hasXmp = true;
  }

  return result;
}

export const getPdfMetadata = readPdfMetadata;

/**
 * Updates metadata fields of a PDF and outputs a new valid PDF.
 * @param {Uint8Array | ArrayBuffer | Blob} pdfInput
 * @param {Record<string, string | Date>} newMetadata
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function updatePdfMetadata(pdfInput, newMetadata, options = {}) {
  validatePdfMetadata(newMetadata);
  const bytes = await normalizeBinaryInput(pdfInput);
  const parser = new PdfParser(bytes);
  await parser.parse();

  if (parser.hasDigitalSignature) {
    throw new PdfToolkitError(
      ERROR_CODES.DOCUMENT_SIGNATURE_PRESENT,
      'Document has a digital signature. Updating metadata will invalidate signatures.'
    );
  }

  // Create or update info dictionary
  let infoDict;
  let infoRef = parser.infoRef;

  if (infoRef) {
    const existing = parser.resolve(infoRef);
    infoDict = existing instanceof PdfDict ? new PdfDict(existing.map) : new PdfDict();
  } else {
    infoDict = new PdfDict();
    // Allocate new object number
    const maxNum = Math.max(...parser.xrefOffsets.keys(), 0);
    infoRef = new PdfRef(maxNum + 1, 0);
  }

  // Apply new metadata
  for (const [key, val] of Object.entries(newMetadata)) {
    if (val === null || val === undefined) {
      infoDict.delete(key);
    } else if (val instanceof Date) {
      infoDict.set(key, new PdfString(formatPdfDate(val)));
    } else {
      infoDict.set(key, new PdfString(String(val)));
    }
  }

  infoDict.set('ModDate', new PdfString(formatPdfDate(new Date())));

  // Re-serialize with updated info dictionary and rebuild xref
  const outBytes = serializePdfWithUpdatedObjects(parser, new Map([[infoRef.num, infoDict]]), infoRef);

  if (options.format === 'uint8array') {
    return outBytes;
  }
  return createBlob([outBytes], 'application/pdf');
}

/**
 * Re-serializes a parsed PDF with specified object replacements and updates xref table cleanly.
 * @param {PdfParser} parser
 * @param {Map<number, unknown>} replacedObjects
 * @param {PdfRef} [newInfoRef]
 * @param {Set<number>} [allowedObjNums] If supplied, only serialize reachable/allowed objects
 * @returns {Uint8Array}
 */
export function serializePdfWithUpdatedObjects(parser, replacedObjects, newInfoRef, allowedObjNums) {
  const writer = new ByteWriter(parser.bytes.length + 2048);

  // Write header
  writer.writeLine(`%PDF-${parser.pdfVersion || '1.4'}`);
  writer.writeByte(0x25);
  writer.writeByte(0xe2);
  writer.writeByte(0xe3);
  writer.writeByte(0xcf);
  writer.writeByte(0xd3);
  writer.writeByte(0x0a);

  const baseNums = allowedObjNums ? allowedObjNums : parser.xrefOffsets.keys();
  const allObjNums = new Set([...baseNums, ...replacedObjects.keys()]);
  const sortedObjNums = Array.from(allObjNums).sort((a, b) => a - b);
  const newOffsets = new Map();

  for (const num of sortedObjNums) {
    newOffsets.set(num, writer.offset);
    writer.writeLine(`${num} 0 obj`);

    if (replacedObjects.has(num)) {
      serializeValue(replacedObjects.get(num), writer);
    } else {
      const obj = parser.resolve(new PdfRef(num, 0));
      serializeValue(obj, writer);
    }

    writer.writeLine();
    writer.writeLine('endobj');
  }

  // Write Xref
  const startXref = writer.offset;
  const maxObjNum = sortedObjNums[sortedObjNums.length - 1] || 0;
  const size = maxObjNum + 1;

  writer.writeLine('xref');
  writer.writeLine(`0 ${size}`);
  writer.writeLine('0000000000 65535 f ');

  for (let i = 1; i <= maxObjNum; i++) {
    const off = newOffsets.get(i);
    if (off !== undefined) {
      writer.writeLine(`${String(off).padStart(10, '0')} 00000 n `);
    } else {
      writer.writeLine('0000000000 65535 f ');
    }
  }

  // Update Trailer
  const trailer = new PdfDict(parser.trailerDict ? parser.trailerDict.map : {});
  trailer.set('Size', size);
  if (newInfoRef) {
    trailer.set('Info', newInfoRef);
  }

  writer.writeLine('trailer');
  serializeValue(trailer, writer);
  writer.writeLine();
  writer.writeLine('startxref');
  writer.writeLine(String(startXref));
  writer.writeLine('%%EOF');

  return writer.toBytes();
}

function serializeValue(val, writer) {
  if (val === null || val === undefined) {
    writer.writeString('null');
  } else if (typeof val === 'boolean') {
    writer.writeString(val ? 'true' : 'false');
  } else if (typeof val === 'number') {
    writer.writeString(Number.isInteger(val) ? String(val) : val.toFixed(4).replace(/\.?0+$/, ''));
  } else if (typeof val === 'string') {
    writer.writeString(`(${escapePdfString(val)})`);
  } else if (val instanceof PdfName) {
    writer.writeString(`/${val.value}`);
  } else if (val instanceof PdfRef) {
    writer.writeString(`${val.num} ${val.gen} R`);
  } else if (val instanceof PdfString) {
    writer.writeString(`(${escapePdfString(val.value)})`);
  } else if (Array.isArray(val)) {
    writer.writeString('[ ');
    for (let i = 0; i < val.length; i++) {
      serializeValue(val[i], writer);
      if (i < val.length - 1) writer.writeString(' ');
    }
    writer.writeString(' ]');
  } else if (val instanceof PdfDict) {
    writer.writeLine('<<');
    for (const [k, v] of val.entries()) {
      writer.writeString(`  /${k} `);
      serializeValue(v, writer);
      writer.writeLine();
    }
    writer.writeString('>>');
  } else if (val && val.dict && val.bytes) {
    // Stream
    serializeValue(val.dict, writer);
    writer.writeLine();
    writer.writeLine('stream');
    writer.writeBytes(val.bytes);
    writer.writeLine();
    writer.writeString('endstream');
  } else {
    writer.writeString(String(val));
  }
}
