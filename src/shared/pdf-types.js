/**
 * PDF object representations used by both parser and writer.
 */

export class PdfName {
  /**
   * @param {string} name Name without leading slash
   */
  constructor(name) {
    this.value = name.startsWith('/') ? name.slice(1) : name;
  }

  toString() {
    return `/${this.value}`;
  }

  toJSON() {
    return `/${this.value}`;
  }
}

export class PdfRef {
  /**
   * @param {number} num Object number
   * @param {number} [gen=0] Generation number
   */
  constructor(num, gen = 0) {
    this.num = num;
    this.gen = gen;
  }

  toString() {
    return `${this.num} ${this.gen} R`;
  }

  toJSON() {
    return `${this.num} ${this.gen} R`;
  }
}

export class PdfString {
  /**
   * @param {string} value Raw unescaped string
   */
  constructor(value) {
    this.value = value;
  }

  toString() {
    return `(${this.value})`;
  }
}

export class PdfHexString {
  /**
   * @param {string} hex Clean hex string without brackets
   */
  constructor(hex) {
    this.hex = hex.replace(/[^0-9A-Fa-f]/g, '');
  }

  toString() {
    return `<${this.hex}>`;
  }
}

export class PdfDict {
  /**
   * @param {Map<string, unknown> | Record<string, unknown>} [initialEntries]
   */
  constructor(initialEntries) {
    this.map = new Map();
    if (initialEntries) {
      if (initialEntries instanceof Map) {
        for (const [k, v] of initialEntries) {
          const key = k.startsWith('/') ? k.slice(1) : k;
          this.map.set(key, v);
        }
      } else {
        for (const [k, v] of Object.entries(initialEntries)) {
          const key = k.startsWith('/') ? k.slice(1) : k;
          this.map.set(key, v);
        }
      }
    }
  }

  get(key) {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    return this.map.get(cleanKey);
  }

  set(key, value) {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    this.map.set(cleanKey, value);
    return this;
  }

  has(key) {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    return this.map.has(cleanKey);
  }

  delete(key) {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    return this.map.delete(cleanKey);
  }

  entries() {
    return this.map.entries();
  }

  keys() {
    return this.map.keys();
  }

  values() {
    return this.map.values();
  }

  get size() {
    return this.map.size;
  }
}

export class PdfStream {
  /**
   * @param {PdfDict} dict Stream dictionary
   * @param {Uint8Array} bytes Raw stream data (encoded/raw)
   */
  constructor(dict, bytes) {
    this.dict = dict;
    this.bytes = bytes;
  }
}
