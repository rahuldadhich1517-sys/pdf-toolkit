import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { DEFAULT_LIMITS, resolveLimits } from '../shared/limits.js';
import { PdfName, PdfRef, PdfDict, PdfStream, PdfString, PdfHexString } from '../shared/pdf-types.js';
import { Tokenizer, TOKEN_TYPES } from './tokenizer.js';
import { bytesToLatin1String } from '../shared/binary.js';
import { decompressFlate } from '../shared/compression.js';

/**
 * Robust, scoped parser for PDF 1.4 documents conforming to the `pdf-toolkit-basic-v1` profile.
 */
export class PdfParser {
  /**
   * @param {Uint8Array} bytes
   * @param {Partial<typeof DEFAULT_LIMITS>} [customLimits]
   */
  constructor(bytes, customLimits = {}) {
    if (!(bytes instanceof Uint8Array)) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Input must be a Uint8Array');
    }
    this.bytes = bytes;
    this.limits = resolveLimits(customLimits);

    if (bytes.length > this.limits.maxFileSize) {
      throw new PdfToolkitError(
        ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED,
        `File size (${bytes.length} bytes) exceeds limit of ${this.limits.maxFileSize} bytes`
      );
    }

    /** @type {Map<number, number>} objNum -> byteOffset */
    this.xrefOffsets = new Map();
    /** @type {Map<number, unknown>} cached resolved objects */
    this.resolvedObjects = new Map();
    /** @type {PdfDict | null} */
    this.trailerDict = null;
    /** @type {PdfRef | null} */
    this.rootRef = null;
    /** @type {PdfRef | null} */
    this.infoRef = null;
    /** @type {Array<{ ref: PdfRef, dict: PdfDict }>} */
    this.pages = [];
  }

  /**
   * Initializes and parses the PDF structure.
   */
  async parse() {
    this._validateHeader();
    const startXrefOffset = this._locateStartXref();
    this._readXrefAndTrailer(startXrefOffset);
    this._validateSecurityAndFeatures();
    await this._discoverPages();
    return this;
  }

  _validateHeader() {
    if (this.bytes.length < 8) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'File is too short to be a valid PDF');
    }

    // PDF header must appear within first 1024 bytes
    const searchSlice = this.bytes.subarray(0, Math.min(1024, this.bytes.length));
    const headerStr = bytesToLatin1String(searchSlice);
    const match = headerStr.match(/%PDF-(\d+)\.(\d+)/);

    if (!match) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Missing %PDF- header');
    }

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    this.pdfVersion = `${major}.${minor}`;

    // pdf-toolkit-basic-v1 profile supports PDF 1.0 to 1.7 documents matching basic profile
    if (major !== 1) {
      throw new PdfToolkitError(
        ERROR_CODES.UNSUPPORTED_PDF_VERSION,
        `PDF version ${this.pdfVersion} is not supported. Only PDF 1.x files are supported.`
      );
    }
  }

  _locateStartXref() {
    // Scan backwards from EOF (within last 1024 bytes)
    const scanLen = Math.min(1024, this.bytes.length);
    const tailBytes = this.bytes.subarray(this.bytes.length - scanLen);
    const tailStr = bytesToLatin1String(tailBytes);

    const startxrefIdx = tailStr.lastIndexOf('startxref');
    if (startxrefIdx === -1) {
      throw new PdfToolkitError(
        ERROR_CODES.INVALID_PDF,
        'Cannot locate startxref marker in file trailer'
      );
    }

    const afterStartxref = tailStr.slice(startxrefIdx + 9).trim();
    const match = afterStartxref.match(/^(\d+)/);
    if (!match) {
      throw new PdfToolkitError(
        ERROR_CODES.INVALID_PDF,
        'Malformed startxref offset in PDF'
      );
    }

    const offset = parseInt(match[1], 10);
    if (offset < 0 || offset >= this.bytes.length) {
      throw new PdfToolkitError(
        ERROR_CODES.INVALID_PDF,
        `startxref offset ${offset} points outside file boundaries`
      );
    }

    return offset;
  }

  _readXrefAndTrailer(startXrefOffset) {
    const tokenizer = new Tokenizer(this.bytes, startXrefOffset);
    const token = tokenizer.nextToken();

    if (token.type === TOKEN_TYPES.NUMBER) {
      // If startxref points to a number, this is likely a Cross-Reference Stream (PDF 1.5+)
      // Check next tokens
      const next1 = tokenizer.nextToken();
      const next2 = tokenizer.nextToken();
      if (next1.type === TOKEN_TYPES.NUMBER && next2.value === 'obj') {
        throw new PdfToolkitError(
          ERROR_CODES.UNSUPPORTED_PDF_FEATURE,
          'Cross-reference streams (/Type /XRef) are unsupported in pdf-toolkit-basic-v1 profile'
        );
      }
    }

    if (token.value !== 'xref') {
      throw new PdfToolkitError(
        ERROR_CODES.INVALID_PDF,
        `Expected 'xref' at offset ${startXrefOffset}, found '${token.value}'`
      );
    }

    // Read traditional xref sections
    while (true) {
      tokenizer.skipWhitespaceAndComments();
      const nextTok = tokenizer.nextToken();
      if (nextTok.value === 'trailer') {
        break;
      }

      if (nextTok.type !== TOKEN_TYPES.NUMBER) {
        throw new PdfToolkitError(
          ERROR_CODES.INVALID_PDF,
          `Invalid xref section header at offset ${nextTok.pos}`
        );
      }

      const firstObjNum = nextTok.value;
      const countTok = tokenizer.nextToken();
      if (countTok.type !== TOKEN_TYPES.NUMBER) {
        throw new PdfToolkitError(
          ERROR_CODES.INVALID_PDF,
          `Invalid xref count at offset ${countTok.pos}`
        );
      }
      const entryCount = countTok.value;

      if (this.xrefOffsets.size + entryCount > this.limits.maxObjectCount) {
        throw new PdfToolkitError(
          ERROR_CODES.MALFORMED_PDF_OBJECT,
          `Object count exceeds limit of ${this.limits.maxObjectCount}`
        );
      }

      for (let i = 0; i < entryCount; i++) {
        tokenizer.skipWhitespaceAndComments();
        // Each entry is 20 bytes: 10 digit offset, 5 digit gen, 'n' or 'f'
        const offsetTok = tokenizer.nextToken();
        const genTok = tokenizer.nextToken();
        const flagTok = tokenizer.nextToken();

        const objNum = firstObjNum + i;
        if (flagTok.value === 'n' && offsetTok.type === TOKEN_TYPES.NUMBER) {
          const byteOffset = offsetTok.value;
          if (byteOffset < 0 || byteOffset >= this.bytes.length) {
            throw new PdfToolkitError(
              ERROR_CODES.INVALID_PDF,
              `Object ${objNum} offset ${byteOffset} is out of bounds`
            );
          }
          if (!this.xrefOffsets.has(objNum)) {
            this.xrefOffsets.set(objNum, byteOffset);
          }
        }
      }
    }

    // Parse Trailer Dictionary
    const trailerObj = this._parseValue(tokenizer, 0);
    if (!(trailerObj instanceof PdfDict)) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Malformed trailer dictionary');
    }
    this.trailerDict = trailerObj;

    // Check for incremental updates (Prev in trailer)
    if (trailerObj.has('Prev')) {
      // In pdf-toolkit-basic-v1, parse previous xref if needed, or document limited update
      const prevOffset = trailerObj.get('Prev');
      if (typeof prevOffset === 'number' && prevOffset > 0 && prevOffset < this.bytes.length) {
        // Read previous xref safely
        try {
          this._readPreviousXref(prevOffset);
        } catch {
          // If previous xref reading fails, continue with primary table
        }
      }
    }

    // Resolve Root
    const root = trailerObj.get('Root');
    if (root instanceof PdfRef) {
      this.rootRef = root;
    } else {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Trailer is missing /Root catalog reference');
    }

    // Resolve Info if present
    const info = trailerObj.get('Info');
    if (info instanceof PdfRef) {
      this.infoRef = info;
    }
  }

  _readPreviousXref(prevOffset) {
    const tokenizer = new Tokenizer(this.bytes, prevOffset);
    const tok = tokenizer.nextToken();
    if (tok.value !== 'xref') return;

    while (true) {
      tokenizer.skipWhitespaceAndComments();
      const nextTok = tokenizer.nextToken();
      if (nextTok.value === 'trailer' || nextTok.type === TOKEN_TYPES.EOF) break;
      if (nextTok.type !== TOKEN_TYPES.NUMBER) break;

      const firstObjNum = nextTok.value;
      const countTok = tokenizer.nextToken();
      if (countTok.type !== TOKEN_TYPES.NUMBER) break;
      const entryCount = countTok.value;

      for (let i = 0; i < entryCount; i++) {
        tokenizer.skipWhitespaceAndComments();
        const offsetTok = tokenizer.nextToken();
        const genTok = tokenizer.nextToken();
        const flagTok = tokenizer.nextToken();

        const objNum = firstObjNum + i;
        if (flagTok.value === 'n' && offsetTok.type === TOKEN_TYPES.NUMBER) {
          // Do not overwrite more recent offset from primary table
          if (!this.xrefOffsets.has(objNum)) {
            this.xrefOffsets.set(objNum, offsetTok.value);
          }
        }
      }
    }
  }

  _validateSecurityAndFeatures() {
    // 1. Encrypted PDFs
    if (this.trailerDict.has('Encrypt')) {
      throw new PdfToolkitError(
        ERROR_CODES.ENCRYPTED_PDF,
        'This document is password-protected or encrypted. Encrypted documents are unsupported in zero-dependency release.'
      );
    }

    // 2. Digital Signatures: check Root /Perms or /SigFlags or signature fields
    const catalog = this.resolve(this.rootRef);
    if (catalog instanceof PdfDict) {
      if (catalog.has('Perms') || (catalog.has('SigFlags') && catalog.get('SigFlags') !== 0)) {
        this.hasDigitalSignature = true;
      }
    }
  }

  async _discoverPages() {
    const catalog = this.resolve(this.rootRef);
    if (!(catalog instanceof PdfDict)) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Document catalog is not a valid dictionary');
    }

    const pagesRef = catalog.get('Pages');
    if (!pagesRef) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Document catalog missing /Pages entry');
    }

    const pagesNode = this.resolve(pagesRef);
    if (!(pagesNode instanceof PdfDict)) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Pages root node is not a dictionary');
    }

    this.pages = [];
    this._traversePageTree(pagesNode, {}, 0);

    if (this.pages.length === 0) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Document contains no pages');
    }
    if (this.pages.length > this.limits.maxPageCount) {
      throw new PdfToolkitError(
        ERROR_CODES.PAGE_COUNT_LIMIT_EXCEEDED,
        `Page count (${this.pages.length}) exceeds maximum limit (${this.limits.maxPageCount})`
      );
    }
  }

  _traversePageTree(node, inheritedProps, depth) {
    if (depth > this.limits.maxRecursionDepth) {
      throw new PdfToolkitError(
        ERROR_CODES.MALFORMED_PDF_OBJECT,
        'Page tree recursion depth exceeded limit'
      );
    }

    // Merge inheritable attributes: MediaBox, CropBox, Resources, Rotate
    const currentInherited = { ...inheritedProps };
    if (node.has('MediaBox')) currentInherited.MediaBox = this.resolve(node.get('MediaBox'));
    if (node.has('CropBox')) currentInherited.CropBox = this.resolve(node.get('CropBox'));
    if (node.has('Resources')) currentInherited.Resources = this.resolve(node.get('Resources'));
    if (node.has('Rotate')) currentInherited.Rotate = this.resolve(node.get('Rotate'));

    const type = node.get('Type')?.value;

    if (type === 'Page') {
      // Apply inherited attributes if missing in the page itself
      if (!node.has('MediaBox') && currentInherited.MediaBox) {
        node.set('MediaBox', currentInherited.MediaBox);
      }
      if (!node.has('Resources') && currentInherited.Resources) {
        node.set('Resources', currentInherited.Resources);
      }
      if (!node.has('Rotate') && currentInherited.Rotate !== undefined) {
        node.set('Rotate', currentInherited.Rotate);
      }
      this.pages.push(node);
      return;
    }

    const kids = this.resolve(node.get('Kids'));
    if (!Array.isArray(kids)) {
      // If it doesn't have kids but has MediaBox/Contents, treat as single page
      if (node.has('Contents') || node.has('MediaBox')) {
        this.pages.push(node);
        return;
      }
      throw new PdfToolkitError(ERROR_CODES.INVALID_PDF, 'Pages node missing valid /Kids array');
    }

    for (const kidRef of kids) {
      const kidNode = this.resolve(kidRef);
      if (kidNode instanceof PdfDict) {
        // Tag kidNode with its ref if known
        if (kidRef instanceof PdfRef) {
          kidNode._ref = kidRef;
        }
        this._traversePageTree(kidNode, currentInherited, depth + 1);
      }
    }
  }

  /**
   * Resolves a reference or returns direct value.
   * @param {unknown} val
   * @returns {unknown}
   */
  resolve(val) {
    if (!(val instanceof PdfRef)) {
      return val;
    }

    if (this.resolvedObjects.has(val.num)) {
      return this.resolvedObjects.get(val.num);
    }

    const offset = this.xrefOffsets.get(val.num);
    if (offset === undefined) {
      return null;
    }

    const obj = this._parseIndirectObject(val.num, offset);
    this.resolvedObjects.set(val.num, obj);
    return obj;
  }

  _parseIndirectObject(expectedNum, offset) {
    const tokenizer = new Tokenizer(this.bytes, offset);
    const numTok = tokenizer.nextToken();
    const genTok = tokenizer.nextToken();
    const objTok = tokenizer.nextToken();

    if (objTok.value !== 'obj') {
      throw new PdfToolkitError(
        ERROR_CODES.MALFORMED_PDF_OBJECT,
        `Expected 'obj' at offset ${offset}, found '${objTok.value}'`
      );
    }

    const val = this._parseValue(tokenizer, 0);

    // Check if followed by 'stream'
    tokenizer.skipWhitespaceAndComments();
    const nextTok = tokenizer.nextToken();
    if (nextTok.value === 'stream') {
      if (!(val instanceof PdfDict)) {
        throw new PdfToolkitError(
          ERROR_CODES.MALFORMED_PDF_OBJECT,
          'Stream must be preceded by a dictionary'
        );
      }

      // Check for Object Stream (/Type /ObjStm)
      if (val.get('Type')?.value === 'ObjStm') {
        throw new PdfToolkitError(
          ERROR_CODES.UNSUPPORTED_PDF_FEATURE,
          'Compressed object streams (/Type /ObjStm) are unsupported in pdf-toolkit-basic-v1'
        );
      }

      // Read stream data
      const streamBytes = this._readStreamBytes(tokenizer, val);
      return new PdfStream(val, streamBytes);
    }

    return val;
  }

  _readStreamBytes(tokenizer, dict) {
    let length = this.resolve(dict.get('Length'));
    let startPos = tokenizer.pos;

    // After 'stream' token, skip single \r\n or \n
    if (startPos < this.bytes.length && this.bytes[startPos] === 0x0d) {
      startPos++;
    }
    if (startPos < this.bytes.length && this.bytes[startPos] === 0x0a) {
      startPos++;
    }

    let endPos;
    if (typeof length === 'number' && length >= 0 && startPos + length <= this.bytes.length) {
      endPos = startPos + length;
    } else {
      // Find 'endstream' manually
      const slice = this.bytes.subarray(startPos);
      const str = bytesToLatin1String(slice);
      const endIdx = str.indexOf('endstream');
      if (endIdx === -1) {
        throw new PdfToolkitError(
          ERROR_CODES.MALFORMED_PDF_OBJECT,
          'Cannot find endstream marker'
        );
      }
      endPos = startPos + endIdx;
      // Strip trailing \r or \n before endstream
      while (endPos > startPos && (this.bytes[endPos - 1] === 0x0a || this.bytes[endPos - 1] === 0x0d)) {
        endPos--;
      }
    }

    return this.bytes.subarray(startPos, endPos);
  }

  _parseValue(tokenizer, depth) {
    if (depth > this.limits.maxRecursionDepth) {
      throw new PdfToolkitError(
        ERROR_CODES.MALFORMED_PDF_OBJECT,
        'Parser depth limit exceeded'
      );
    }

    const tok = tokenizer.nextToken();
    switch (tok.type) {
      case TOKEN_TYPES.NUMBER: {
        // Lookahead to check if it's an indirect reference: num gen R
        const curPos = tokenizer.pos;
        const next1 = tokenizer.nextToken();
        if (next1.type === TOKEN_TYPES.NUMBER) {
          const next2 = tokenizer.nextToken();
          if (next2.value === 'R') {
            return new PdfRef(tok.value, next1.value);
          }
        }
        // Rewind if not reference
        tokenizer.pos = curPos;
        return tok.value;
      }
      case TOKEN_TYPES.NAME:
      case TOKEN_TYPES.STRING:
      case TOKEN_TYPES.HEX_STRING:
      case TOKEN_TYPES.BOOLEAN:
      case TOKEN_TYPES.NULL:
        return tok.value;

      case TOKEN_TYPES.ARRAY_START: {
        const arr = [];
        while (true) {
          tokenizer.skipWhitespaceAndComments();
          const p = tokenizer.peekByte();
          if (p === 0x5d) { // ']'
            tokenizer.readByte();
            break;
          }
          if (p === -1) {
            throw new PdfToolkitError(ERROR_CODES.MALFORMED_PDF_OBJECT, 'Unclosed array');
          }
          arr.push(this._parseValue(tokenizer, depth + 1));
        }
        return arr;
      }

      case TOKEN_TYPES.DICT_START: {
        const dict = new PdfDict();
        while (true) {
          tokenizer.skipWhitespaceAndComments();
          if (tokenizer.pos + 1 < tokenizer.length &&
              tokenizer.bytes[tokenizer.pos] === 0x3e &&
              tokenizer.bytes[tokenizer.pos + 1] === 0x3e) {
            tokenizer.pos += 2;
            break;
          }
          if (tokenizer.pos >= tokenizer.length) {
            throw new PdfToolkitError(ERROR_CODES.MALFORMED_PDF_OBJECT, 'Unclosed dictionary');
          }

          const keyTok = tokenizer.nextToken();
          if (keyTok.type !== TOKEN_TYPES.NAME) {
            throw new PdfToolkitError(
              ERROR_CODES.MALFORMED_PDF_OBJECT,
              `Dictionary key must be a Name, got ${keyTok.value}`
            );
          }
          const val = this._parseValue(tokenizer, depth + 1);
          dict.set(keyTok.value.value, val);
        }
        return dict;
      }

      default:
        return tok.value;
    }
  }

  /**
   * Decodes a stream according to its /Filter dictionary entries.
   * @param {PdfStream} stream
   * @returns {Promise<Uint8Array>}
   */
  async decodeStream(stream) {
    if (!stream || !(stream instanceof PdfStream)) {
      throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'Invalid stream');
    }

    const filterObj = stream.dict.get('Filter');
    if (!filterObj) {
      // Unfiltered raw bytes
      return stream.bytes;
    }

    const filters = Array.isArray(filterObj) ? filterObj : [filterObj];
    let currentBytes = stream.bytes;

    for (const f of filters) {
      const filterName = f instanceof PdfName ? f.value : String(f);
      if (filterName === 'FlateDecode' || filterName === 'Fl') {
        currentBytes = await decompressFlate(currentBytes, this.limits.maxDecompressedStreamSize);
      } else {
        throw new PdfToolkitError(
          ERROR_CODES.UNSUPPORTED_FILTER,
          `Stream filter '/${filterName}' is not supported in pdf-toolkit-basic-v1 profile`
        );
      }
    }

    return currentBytes;
  }
}
