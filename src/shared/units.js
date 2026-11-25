/**
 * Standard page sizes in PDF points (1/72 inch).
 */
export const PAGE_SIZES = Object.freeze({
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  LETTER: [612.0, 792.0],
  LEGAL: [612.0, 1008.0],
  TABLOID: [792.0, 1224.0]
});

/**
 * Resolves page dimension into [width, height] in points.
 * @param {string | [number, number]} [size='A4']
 * @param {'portrait' | 'landscape'} [orientation='portrait']
 * @returns {[number, number]}
 */
export function resolvePageDimensions(size = 'A4', orientation = 'portrait') {
  let [w, h] = PAGE_SIZES.A4;
  if (typeof size === 'string') {
    const upper = size.toUpperCase();
    if (PAGE_SIZES[upper]) {
      [w, h] = PAGE_SIZES[upper];
    }
  } else if (Array.isArray(size) && size.length === 2 && !isNaN(size[0]) && !isNaN(size[1])) {
    [w, h] = [Number(size[0]), Number(size[1])];
  }

  if (orientation === 'landscape' && w < h) {
    return [h, w];
  }
  if (orientation === 'portrait' && w > h) {
    return [h, w];
  }
  return [w, h];
}

/**
 * Normalizes margin options into { top, right, bottom, left } points.
 * @param {number | { top?: number, right?: number, bottom?: number, left?: number }} [margins=36]
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function resolveMargins(margins = 36) {
  if (typeof margins === 'number') {
    return { top: margins, right: margins, bottom: margins, left: margins };
  }
  return {
    top: margins?.top ?? 36,
    right: margins?.right ?? 36,
    bottom: margins?.bottom ?? 36,
    left: margins?.left ?? 36
  };
}

export function mmToPoints(mm) {
  return (mm * 72) / 25.4;
}

export function pointsToMm(pt) {
  return (pt * 25.4) / 72;
}

export function inchesToPoints(inch) {
  return inch * 72;
}
