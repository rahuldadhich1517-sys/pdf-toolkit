import { ByteWriter, stringToBytes } from '../shared/binary.js';
import { PdfName, PdfRef, PdfDict, PdfStream, PdfString, PdfHexString } from '../shared/pdf-types.js';
import { escapePdfString, formatPdfDate } from '../shared/strings.js';
import { PAGE_SIZES } from '../shared/units.js';
import { ContentStream } from './content-stream.js';
import { compressFlate } from '../shared/compression.js';

export const STANDARD_FONTS = Object.freeze({
  Helvetica: 'Helvetica',
  HelveticaBold: 'Helvetica-Bold',
  HelveticaOblique: 'Helvetica-Oblique',
  HelveticaBoldOblique: 'Helvetica-BoldOblique',
  TimesRoman: 'Times-Roman',
  TimesBold: 'Times-Bold',
  TimesItalic: 'Times-Italic',
  TimesBoldItalic: 'Times-BoldItalic',
  Courier: 'Courier',
  CourierBold: 'Courier-Bold',
  CourierOblique: 'Courier-Oblique',
  CourierBoldOblique: 'Courier-BoldOblique',
  Symbol: 'Symbol',
  ZapfDingbats: 'ZapfDingbats'
});

/**
 * Minimal, standard-compliant PDF 1.4 document builder.
 */
export class PdfWriter {
  constructor() {
    this._nextObjNum = 1;
    /** @type {Array<{ num: number, gen: number, value: unknown }>} */
    this._objects = [];
    /** @type {Array<PdfRef>} */
    this._pageRefs = [];
    /** @type {Map<string, { fontRef: PdfRef, alias: string }>} */
    this._fonts = new Map();
    /** @type {Map<string, { imageRef: PdfRef, alias: string }>} */
    this._images = new Map();
    /** @type {Record<string, string>} */
    this._metadata = {
      Producer: '@rahul_dadhich15/pdf-toolkit (v0.1.0)',
      CreationDate: formatPdfDate()
    };
  }

  /**
   * Allocates a new indirect object reference.
   * @returns {PdfRef}
   */
  allocateRef() {
    const ref = new PdfRef(this._nextObjNum++, 0);
    return ref;
  }

  /**
   * Registers an object with a given reference or allocates a new one.
   * @param {unknown} value
   * @param {PdfRef} [ref]
   * @returns {PdfRef}
   */
  addObject(value, ref) {
    const objectRef = ref || this.allocateRef();
    this._objects.push({ num: objectRef.num, gen: objectRef.gen, value });
    return objectRef;
  }

  /**
   * Sets document metadata info.
   * @param {Record<string, string>} meta
   */
  setMetadata(meta) {
    if (meta) {
      this._metadata = { ...this._metadata, ...meta };
    }
  }

  /**
   * Registers a Standard 14 font and returns its resource alias e.g. /F1
   * @param {string} baseFont
   * @returns {string} Font alias e.g. 'F1'
   */
  useStandardFont(baseFont = STANDARD_FONTS.Helvetica) {
    if (this._fonts.has(baseFont)) {
      return this._fonts.get(baseFont).alias;
    }
    const alias = `F${this._fonts.size + 1}`;
    const fontRef = this.allocateRef();
    const fontDict = new PdfDict({
      Type: new PdfName('Font'),
      Subtype: new PdfName('Type1'),
      BaseFont: new PdfName(baseFont),
      Encoding: new PdfName('WinAnsiEncoding')
    });
    this.addObject(fontDict, fontRef);
    this._fonts.set(baseFont, { fontRef, alias });
    return alias;
  }

  /**
   * Embeds a raw image (JPEG or raw RGB/RGBA bitmap) as an Image XObject.
   * @param {object} options
   * @param {Uint8Array} options.bytes
   * @param {number} options.width
   * @param {number} options.height
   * @param {'jpeg' | 'raw-rgb' | 'raw-gray'} options.format
   * @param {boolean} [options.compress]
   * @returns {Promise<string>} Image alias e.g. 'Im1'
   */
  async addImage({ bytes, width, height, format, compress = false }) {
    const alias = `Im${this._images.size + 1}`;
    const imageRef = this.allocateRef();

    const dict = new PdfDict({
      Type: new PdfName('XObject'),
      Subtype: new PdfName('Image'),
      Width: width,
      Height: height,
      BitsPerComponent: 8
    });

    let streamBytes = bytes;
    if (format === 'jpeg') {
      dict.set('ColorSpace', new PdfName('DeviceRGB'));
      dict.set('Filter', new PdfName('DCTDecode'));
    } else if (format === 'raw-rgb') {
      dict.set('ColorSpace', new PdfName('DeviceRGB'));
      if (compress) {
        streamBytes = await compressFlate(bytes);
        dict.set('Filter', new PdfName('FlateDecode'));
      }
    } else if (format === 'raw-gray') {
      dict.set('ColorSpace', new PdfName('DeviceGray'));
      if (compress) {
        streamBytes = await compressFlate(bytes);
        dict.set('Filter', new PdfName('FlateDecode'));
      }
    }

    dict.set('Length', streamBytes.length);
    const stream = new PdfStream(dict, streamBytes);
    this.addObject(stream, imageRef);
    this._images.set(alias, { imageRef, alias });
    return alias;
  }

  /**
   * Adds a page to the PDF with the given dimensions and content stream.
   * @param {object} options
   * @param {[number, number]} [options.size] [width, height] in points (default: A4 [595.28, 841.89])
   * @param {ContentStream | Uint8Array} options.content Content stream
   * @param {number} [options.rotation] Page rotation (0, 90, 180, 270)
   * @param {boolean} [options.compressContent=true]
   * @returns {Promise<PdfRef>} Page reference
   */
  async addPage({ size = PAGE_SIZES.A4, content, rotation = 0, compressContent = true }) {
    const pageRef = this.allocateRef();
    const contentRef = this.allocateRef();

    const rawBytes = content instanceof ContentStream ? content.toBytes() : content;
    let streamBytes = rawBytes;
    const contentDict = new PdfDict();

    if (compressContent && rawBytes.length > 0) {
      streamBytes = await compressFlate(rawBytes);
      contentDict.set('Filter', new PdfName('FlateDecode'));
    }
    contentDict.set('Length', streamBytes.length);

    this.addObject(new PdfStream(contentDict, streamBytes), contentRef);

    // Build page resources dictionary
    const fontResDict = new PdfDict();
    for (const [_, { fontRef, alias }] of this._fonts) {
      fontResDict.set(alias, fontRef);
    }

    const xObjectResDict = new PdfDict();
    for (const [alias, { imageRef }] of this._images) {
      xObjectResDict.set(alias, imageRef);
    }

    const resDict = new PdfDict({
      ProcSet: [new PdfName('PDF'), new PdfName('Text'), new PdfName('ImageB'), new PdfName('ImageC')]
    });
    if (fontResDict.size > 0) resDict.set('Font', fontResDict);
    if (xObjectResDict.size > 0) resDict.set('XObject', xObjectResDict);

    const pageDict = new PdfDict({
      Type: new PdfName('Page'),
      MediaBox: [0, 0, size[0], size[1]],
      Resources: resDict,
      Contents: contentRef
    });

    if (rotation && rotation % 360 !== 0) {
      pageDict.set('Rotate', ((rotation % 360) + 360) % 360);
    }

    this.addObject(pageDict, pageRef);
    this._pageRefs.push(pageRef);
    return pageRef;
  }

  /**
   * Compiles the complete PDF document into a binary Uint8Array.
   * Generates catalog, pages tree, info dictionary, xref table, trailer, startxref.
   * @returns {Uint8Array}
   */
  build() {
    const pagesRef = this.allocateRef();
    const catalogRef = this.allocateRef();
    const infoRef = this.allocateRef();

    // 1. Pages Tree Object
    const pagesDict = new PdfDict({
      Type: new PdfName('Pages'),
      Kids: [...this._pageRefs],
      Count: this._pageRefs.length
    });
    this.addObject(pagesDict, pagesRef);

    // Link each page to its parent pages tree
    for (const item of this._objects) {
      if (item.value instanceof PdfDict && item.value.get('Type')?.value === 'Page') {
        item.value.set('Parent', pagesRef);
      }
    }

    // 2. Catalog Object
    const catalogDict = new PdfDict({
      Type: new PdfName('Catalog'),
      Pages: pagesRef
    });
    this.addObject(catalogDict, catalogRef);

    // 3. Info Object
    const infoDict = new PdfDict();
    for (const [key, val] of Object.entries(this._metadata)) {
      if (val !== undefined && val !== null) {
        infoDict.set(key, new PdfString(String(val)));
      }
    }
    this.addObject(infoDict, infoRef);

    // Sort objects by object number
    this._objects.sort((a, b) => a.num - b.num);

    const writer = new ByteWriter(16384);

    // Header (PDF 1.4 + binary marker)
    writer.writeLine('%PDF-1.4');
    writer.writeByte(0x25); // %
    writer.writeByte(0xe2);
    writer.writeByte(0xe3);
    writer.writeByte(0xcf);
    writer.writeByte(0xd3);
    writer.writeByte(0x0a);

    /** @type {number[]} */
    const offsets = [];

    // Write all objects
    for (const item of this._objects) {
      offsets[item.num] = writer.offset;
      writer.writeLine(`${item.num} ${item.gen} obj`);
      this._serializeObject(item.value, writer);
      writer.writeLine();
      writer.writeLine('endobj');
    }

    // Write cross-reference table
    const startXref = writer.offset;
    const maxObjNum = this._objects[this._objects.length - 1].num;
    const totalEntries = maxObjNum + 1;

    writer.writeLine('xref');
    writer.writeLine(`0 ${totalEntries}`);
    // Object 0 (free list head)
    writer.writeLine('0000000000 65535 f ');

    for (let i = 1; i <= maxObjNum; i++) {
      const offset = offsets[i];
      if (offset !== undefined) {
        const offsetStr = String(offset).padStart(10, '0');
        writer.writeLine(`${offsetStr} 00000 n `);
      } else {
        writer.writeLine('0000000000 65535 f ');
      }
    }

    // Write trailer
    const trailerDict = new PdfDict({
      Size: totalEntries,
      Root: catalogRef,
      Info: infoRef
    });

    writer.writeLine('trailer');
    this._serializeObject(trailerDict, writer);
    writer.writeLine();
    writer.writeLine('startxref');
    writer.writeLine(String(startXref));
    writer.writeLine('%%EOF');

    return writer.toBytes();
  }

  _serializeObject(val, writer) {
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
    } else if (val instanceof PdfHexString) {
      writer.writeString(`<${val.hex}>`);
    } else if (Array.isArray(val)) {
      writer.writeString('[ ');
      for (let i = 0; i < val.length; i++) {
        this._serializeObject(val[i], writer);
        if (i < val.length - 1) writer.writeString(' ');
      }
      writer.writeString(' ]');
    } else if (val instanceof PdfDict) {
      writer.writeLine('<<');
      for (const [key, entryVal] of val.entries()) {
        writer.writeString(`  /${key} `);
        this._serializeObject(entryVal, writer);
        writer.writeLine();
      }
      writer.writeString('>>');
    } else if (val instanceof PdfStream) {
      this._serializeObject(val.dict, writer);
      writer.writeLine();
      writer.writeLine('stream');
      writer.writeBytes(val.bytes);
      writer.writeLine();
      writer.writeString('endstream');
    } else {
      writer.writeString(String(val));
    }
  }
}
