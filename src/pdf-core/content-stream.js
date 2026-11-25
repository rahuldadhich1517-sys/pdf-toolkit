import { ByteWriter } from '../shared/binary.js';
import { escapePdfString } from '../shared/strings.js';

/**
 * Helper to build PDF page content streams with standard PDF graphics and text operators.
 */
export class ContentStream {
  constructor() {
    this.writer = new ByteWriter();
  }

  /**
   * Saves graphics state: `q`
   */
  saveGraphicsState() {
    this.writer.writeLine('q');
    return this;
  }

  /**
   * Restores graphics state: `Q`
   */
  restoreGraphicsState() {
    this.writer.writeLine('Q');
    return this;
  }

  /**
   * Concatenates transformation matrix: `a b c d e f cm`
   */
  concatMatrix(a, b, c, d, e, f) {
    this.writer.writeLine(`${a.toFixed(4)} ${b.toFixed(4)} ${c.toFixed(4)} ${d.toFixed(4)} ${e.toFixed(4)} ${f.toFixed(4)} cm`);
    return this;
  }

  /**
   * Sets RGB fill color: `r g b rg` (0.0 to 1.0)
   */
  setFillColor(r, g, b) {
    this.writer.writeLine(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    return this;
  }

  /**
   * Sets RGB stroke color: `r g b RG` (0.0 to 1.0)
   */
  setStrokeColor(r, g, b) {
    this.writer.writeLine(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
    return this;
  }

  /**
   * Sets line width: `w w`
   */
  setLineWidth(width) {
    this.writer.writeLine(`${width.toFixed(2)} w`);
    return this;
  }

  /**
   * Draws a rectangle: `x y w h re`
   */
  drawRect(x, y, w, h) {
    this.writer.writeLine(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    return this;
  }

  /**
   * Strokes current path: `S`
   */
  stroke() {
    this.writer.writeLine('S');
    return this;
  }

  /**
   * Fills current path: `f`
   */
  fill() {
    this.writer.writeLine('f');
    return this;
  }

  /**
   * Fills and strokes current path: `B`
   */
  fillAndStroke() {
    this.writer.writeLine('B');
    return this;
  }

  /**
   * Draws horizontal line from (x1, y) to (x2, y)
   */
  drawLine(x1, y1, x2, y2) {
    this.writer.writeLine(`${x1.toFixed(2)} ${y1.toFixed(2)} m`);
    this.writer.writeLine(`${x2.toFixed(2)} ${y2.toFixed(2)} l`);
    this.writer.writeLine('S');
    return this;
  }

  /**
   * Begins a text object: `BT`
   */
  beginText() {
    this.writer.writeLine('BT');
    return this;
  }

  /**
   * Ends a text object: `ET`
   */
  endText() {
    this.writer.writeLine('ET');
    return this;
  }

  /**
   * Sets font and size: `/FontName size Tf`
   * @param {string} fontName e.g., 'F1'
   * @param {number} size in points
   */
  setFont(fontName, size) {
    const name = fontName.startsWith('/') ? fontName : `/${fontName}`;
    this.writer.writeLine(`${name} ${size.toFixed(2)} Tf`);
    return this;
  }

  /**
   * Moves text position: `x y Td`
   */
  moveText(x, y) {
    this.writer.writeLine(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
    return this;
  }

  /**
   * Sets text leading (line spacing): `leading TL`
   */
  setTextLeading(leading) {
    this.writer.writeLine(`${leading.toFixed(2)} TL`);
    return this;
  }

  /**
   * Shows a text string: `(escaped) Tj`
   * @param {string} text
   */
  showText(text) {
    const escaped = escapePdfString(text);
    this.writer.writeLine(`(${escaped}) Tj`);
    return this;
  }

  /**
   * Moves to next line and shows text: `T*` or `'`
   */
  nextLine() {
    this.writer.writeLine('T*');
    return this;
  }

  /**
   * Draws an image XObject at (x, y) with (w, h):
   * q w 0 0 h x y cm /ImageName Do Q
   * @param {string} imageName e.g. 'Im1'
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  drawImage(imageName, x, y, w, h) {
    const name = imageName.startsWith('/') ? imageName : `/${imageName}`;
    this.saveGraphicsState();
    this.concatMatrix(w, 0, 0, h, x, y);
    this.writer.writeLine(`${name} Do`);
    this.restoreGraphicsState();
    return this;
  }

  /**
   * Returns accumulated stream bytes.
   * @returns {Uint8Array}
   */
  toBytes() {
    return this.writer.toBytes();
  }
}
