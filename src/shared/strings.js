/**
 * PDF string escaping, unescaping, hex encoding, and date handling.
 */

/**
 * Escapes characters for a PDF literal string (...).
 * Parentheses and backslashes must be escaped.
 * @param {string} str
 * @returns {string}
 */
export function escapePdfString(str) {
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '\\') {
      res += '\\\\';
    } else if (char === '(') {
      res += '\\(';
    } else if (char === ')') {
      res += '\\)';
    } else if (char === '\r') {
      res += '\\r';
    } else if (char === '\n') {
      res += '\\n';
    } else if (char === '\t') {
      res += '\\t';
    } else if (char === '\b') {
      res += '\\b';
    } else if (char === '\f') {
      res += '\\f';
    } else {
      const code = str.charCodeAt(i);
      if (code < 32 || code > 126) {
        // If it fits in Latin1/WinAnsi:
        if (code <= 255) {
          res += '\\' + code.toString(8).padStart(3, '0');
        } else {
          // Replace unsupported characters with '?' to prevent corrupting PDF syntax
          res += '?';
        }
      } else {
        res += char;
      }
    }
  }
  return res;
}

/**
 * Unescapes a PDF literal string body (without enclosing parens).
 * Resolves \n, \r, \t, \b, \f, \(, \), \\, and \ooo octal escapes.
 * @param {string} raw
 * @returns {string}
 */
export function unescapePdfString(raw) {
  let result = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      i++;
      const next = raw[i];
      if (next === 'n') result += '\n';
      else if (next === 'r') result += '\r';
      else if (next === 't') result += '\t';
      else if (next === 'b') result += '\b';
      else if (next === 'f') result += '\f';
      else if (next === '(') result += '(';
      else if (next === ')') result += ')';
      else if (next === '\\') result += '\\';
      else if (next === '\r') {
        if (i + 1 < raw.length && raw[i + 1] === '\n') i++;
        // line continuation: ignore newline
      } else if (next === '\n') {
        // line continuation: ignore newline
      } else if (next >= '0' && next <= '7') {
        // Octal escape: 1 to 3 octal digits
        let octal = next;
        if (i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7') {
          octal += raw[++i];
          if (i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7') {
            octal += raw[++i];
          }
        }
        result += String.fromCharCode(parseInt(octal, 8));
      } else {
        result += next;
      }
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Parses a hex string `<48656c6c6f>` into a decoded string.
 * @param {string} hexContent Content inside angle brackets
 * @returns {string}
 */
export function decodePdfHexString(hexContent) {
  const cleanHex = hexContent.replace(/\s+/g, '');
  let padded = cleanHex;
  if (padded.length % 2 !== 0) {
    padded += '0';
  }
  let out = '';
  for (let i = 0; i < padded.length; i += 2) {
    const code = parseInt(padded.slice(i, i + 2), 16);
    if (!isNaN(code)) {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/**
 * Encodes text into a PDF hex string `<...>`.
 * @param {string} str
 * @returns {string}
 */
export function encodePdfHexString(str) {
  let hex = '<';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) & 0xff;
    hex += code.toString(16).padStart(2, '0');
  }
  hex += '>';
  return hex;
}

/**
 * Formats a JavaScript Date into PDF Date format: D:YYYYMMDDHHmmSS+00'00'
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function formatPdfDate(date = new Date()) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `D:${year}${month}${day}${hours}${minutes}${seconds}Z`;
}

/**
 * Parses a PDF Date string `D:YYYYMMDDHHmmSS...` into a JS Date or null.
 * @param {string} pdfDate
 * @returns {Date | null}
 */
export function parsePdfDate(pdfDate) {
  if (typeof pdfDate !== 'string') return null;
  const match = pdfDate.match(/^D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+\-])?(\d{2})?'?(\d{2})?'?/);
  if (!match) return null;

  const [_, y, m, d, h, min, s, tz, tzH, tzM] = match;
  const year = parseInt(y, 10);
  const month = m ? parseInt(m, 10) - 1 : 0;
  const day = d ? parseInt(d, 10) : 1;
  const hour = h ? parseInt(h, 10) : 0;
  const minute = min ? parseInt(min, 10) : 0;
  const second = s ? parseInt(s, 10) : 0;

  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (tz && (tz === '+' || tz === '-') && tzH) {
    const offsetMin = (parseInt(tzH, 10) * 60 + (tzM ? parseInt(tzM, 10) : 0)) * (tz === '+' ? -1 : 1);
    return new Date(date.getTime() + offsetMin * 60 * 1000);
  }
  return date;
}
