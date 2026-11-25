import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { PdfName, PdfRef, PdfString, PdfHexString } from '../shared/pdf-types.js';
import { unescapePdfString, decodePdfHexString } from '../shared/strings.js';
import { bytesToLatin1String } from '../shared/binary.js';

export const TOKEN_TYPES = Object.freeze({
  NAME: 'NAME',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  NULL: 'NULL',
  STRING: 'STRING',
  HEX_STRING: 'HEX_STRING',
  DICT_START: 'DICT_START',
  DICT_END: 'DICT_END',
  ARRAY_START: 'ARRAY_START',
  ARRAY_END: 'ARRAY_END',
  KEYWORD: 'KEYWORD',
  EOF: 'EOF'
});

/**
 * Tokenizer for PDF syntax that parses byte arrays without regex approximations.
 */
export class Tokenizer {
  /**
   * @param {Uint8Array} bytes
   * @param {number} [startOffset=0]
   */
  constructor(bytes, startOffset = 0) {
    this.bytes = bytes;
    this.pos = startOffset;
    this.length = bytes.length;
  }

  isWhitespace(b) {
    return b === 0x00 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d || b === 0x20;
  }

  isDelimiter(b) {
    return (
      b === 0x28 || // (
      b === 0x29 || // )
      b === 0x3c || // <
      b === 0x3e || // >
      b === 0x5b || // [
      b === 0x5d || // ]
      b === 0x7b || // {
      b === 0x7d || // }
      b === 0x2f || // /
      b === 0x25    // %
    );
  }

  skipWhitespaceAndComments() {
    while (this.pos < this.length) {
      const b = this.bytes[this.pos];
      if (this.isWhitespace(b)) {
        this.pos++;
      } else if (b === 0x25) { // '%'
        // Comment until \r or \n
        this.pos++;
        while (this.pos < this.length && this.bytes[this.pos] !== 0x0a && this.bytes[this.pos] !== 0x0d) {
          this.pos++;
        }
      } else {
        break;
      }
    }
  }

  peekByte() {
    return this.pos < this.length ? this.bytes[this.pos] : -1;
  }

  readByte() {
    return this.pos < this.length ? this.bytes[this.pos++] : -1;
  }

  /**
   * Reads next token.
   * @returns {{ type: string, value: unknown, pos: number }}
   */
  nextToken() {
    this.skipWhitespaceAndComments();
    if (this.pos >= this.length) {
      return { type: TOKEN_TYPES.EOF, value: null, pos: this.pos };
    }

    const startPos = this.pos;
    const b = this.bytes[this.pos];

    // Dict delimiters << or >>
    if (b === 0x3c && this.pos + 1 < this.length && this.bytes[this.pos + 1] === 0x3c) {
      this.pos += 2;
      return { type: TOKEN_TYPES.DICT_START, value: '<<', pos: startPos };
    }
    if (b === 0x3e && this.pos + 1 < this.length && this.bytes[this.pos + 1] === 0x3e) {
      this.pos += 2;
      return { type: TOKEN_TYPES.DICT_END, value: '>>', pos: startPos };
    }

    // Array delimiters [ and ]
    if (b === 0x5b) {
      this.pos++;
      return { type: TOKEN_TYPES.ARRAY_START, value: '[', pos: startPos };
    }
    if (b === 0x5d) {
      this.pos++;
      return { type: TOKEN_TYPES.ARRAY_END, value: ']', pos: startPos };
    }

    // Name /...
    if (b === 0x2f) {
      this.pos++;
      let nameStr = '';
      while (this.pos < this.length) {
        const nb = this.bytes[this.pos];
        if (this.isWhitespace(nb) || this.isDelimiter(nb)) {
          break;
        }
        if (nb === 0x23 && this.pos + 2 < this.length) {
          // #xx hex escape in PDF name
          const h1 = String.fromCharCode(this.bytes[this.pos + 1]);
          const h2 = String.fromCharCode(this.bytes[this.pos + 2]);
          const val = parseInt(h1 + h2, 16);
          if (!isNaN(val)) {
            nameStr += String.fromCharCode(val);
            this.pos += 3;
            continue;
          }
        }
        nameStr += String.fromCharCode(nb);
        this.pos++;
      }
      return { type: TOKEN_TYPES.NAME, value: new PdfName(nameStr), pos: startPos };
    }

    // Literal String (...)
    if (b === 0x28) {
      this.pos++;
      let depth = 1;
      let rawChars = '';
      let escaped = false;

      while (this.pos < this.length) {
        const sb = this.bytes[this.pos++];
        const ch = String.fromCharCode(sb);

        if (escaped) {
          rawChars += ch;
          escaped = false;
          continue;
        }

        if (ch === '\\') {
          escaped = true;
          rawChars += ch;
        } else if (ch === '(') {
          depth++;
          rawChars += ch;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            break;
          }
          rawChars += ch;
        } else {
          rawChars += ch;
        }
      }

      if (depth !== 0) {
        throw new PdfToolkitError(
          ERROR_CODES.MALFORMED_PDF_OBJECT,
          'Unterminated literal string in PDF at offset ' + startPos
        );
      }

      const decoded = unescapePdfString(rawChars);
      return { type: TOKEN_TYPES.STRING, value: new PdfString(decoded), pos: startPos };
    }

    // Hex String <...>
    if (b === 0x3c) {
      this.pos++;
      let hexChars = '';
      while (this.pos < this.length) {
        const hb = this.bytes[this.pos++];
        if (hb === 0x3e) { // '>'
          break;
        }
        hexChars += String.fromCharCode(hb);
      }
      return { type: TOKEN_TYPES.HEX_STRING, value: new PdfHexString(hexChars), pos: startPos };
    }

    // Number or regular word / keyword
    let word = '';
    while (this.pos < this.length) {
      const wb = this.bytes[this.pos];
      if (this.isWhitespace(wb) || this.isDelimiter(wb)) {
        break;
      }
      word += String.fromCharCode(wb);
      this.pos++;
    }

    if (word === 'true') {
      return { type: TOKEN_TYPES.BOOLEAN, value: true, pos: startPos };
    }
    if (word === 'false') {
      return { type: TOKEN_TYPES.BOOLEAN, value: false, pos: startPos };
    }
    if (word === 'null') {
      return { type: TOKEN_TYPES.NULL, value: null, pos: startPos };
    }

    // Check if number
    if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(word)) {
      const num = Number(word);
      return { type: TOKEN_TYPES.NUMBER, value: num, pos: startPos };
    }

    // Keyword
    return { type: TOKEN_TYPES.KEYWORD, value: word, pos: startPos };
  }
}
