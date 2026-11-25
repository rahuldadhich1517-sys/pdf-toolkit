import { PdfRef, PdfDict, PdfStream, PdfName, PdfString, PdfHexString } from '../shared/pdf-types.js';

/**
 * Copies an object graph from a source PdfParser into a target object registry,
 * remapping all indirect references to prevent collisions.
 */
export class ObjectCloner {
  /**
   * @param {import('./pdf-parser.js').PdfParser} sourceParser
   * @param {(val: unknown) => PdfRef} targetAllocator
   */
  constructor(sourceParser, targetAllocator) {
    this.sourceParser = sourceParser;
    this.targetAllocator = targetAllocator;
    /** @type {Map<number, PdfRef>} sourceObjNum -> targetRef */
    this.refMap = new Map();
  }

  /**
   * Deep clones any value, replacing source references with remapped target references.
   * @param {unknown} val
   * @returns {unknown}
   */
  clone(val) {
    if (val === null || val === undefined) {
      return val;
    }
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
      return val;
    }
    if (val instanceof PdfName || val instanceof PdfString || val instanceof PdfHexString) {
      return val;
    }

    if (val instanceof PdfRef) {
      if (this.refMap.has(val.num)) {
        return this.refMap.get(val.num);
      }
      // Allocate new ref in target
      const targetRef = this.targetAllocator(null);
      this.refMap.set(val.num, targetRef);

      // Resolve and clone source object
      const sourceObj = this.sourceParser.resolve(val);
      const clonedObj = this.clone(sourceObj);
      // Register resolved target object with target allocator
      this.targetAllocator(clonedObj, targetRef);
      return targetRef;
    }

    if (Array.isArray(val)) {
      return val.map(item => this.clone(item));
    }

    if (val instanceof PdfDict) {
      const clonedDict = new PdfDict();
      for (const [k, v] of val.entries()) {
        // Do not clone Parent reference in page dictionary directly as it will point to new Pages root
        if (k === 'Parent') continue;
        clonedDict.set(k, this.clone(v));
      }
      return clonedDict;
    }

    if (val instanceof PdfStream) {
      const clonedDict = this.clone(val.dict);
      return new PdfStream(clonedDict, val.bytes.slice());
    }

    return val;
  }
}
