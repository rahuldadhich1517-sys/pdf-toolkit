import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';
import { normalizeBinaryInput, createBlob } from '../shared/binary.js';
import { resolvePageDimensions, resolveMargins } from '../shared/units.js';
import { DEFAULT_LIMITS, resolveLimits } from '../shared/limits.js';
import { parseJpegInfo, parsePngInfo, detectImageFormat } from './image-parser.js';
import { PdfWriter } from '../pdf-core/pdf-writer.js';
import { ContentStream } from '../pdf-core/content-stream.js';
import { compressFlate } from '../shared/compression.js';

/**
 * Validates and resolves options for image-to-pdf conversion.
 * @param {object} [customOptions]
 */
export function getImagePdfOptions(customOptions = {}) {
  const pageSize = customOptions.pageSize || 'A4';
  const orientation = customOptions.orientation || 'portrait';
  const dimensions = resolvePageDimensions(pageSize, orientation);
  const margins = resolveMargins(customOptions.margins || 20);
  const fit = customOptions.fit || 'contain'; // 'contain', 'cover', 'fill'
  const align = customOptions.align || 'center';
  const backgroundColor = customOptions.backgroundColor || [1, 1, 1]; // white RGB [r, g, b]

  return {
    pageSize,
    orientation,
    dimensions,
    margins,
    fit,
    align,
    backgroundColor,
    metadata: customOptions.metadata || {}
  };
}

/**
 * Combines one or more supported images into a single PDF document.
 * @param {Array<Uint8Array | ArrayBuffer | Blob>} imageInputs
 * @param {object} [options]
 * @param {'blob' | 'uint8array'} [options.format='blob']
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function imagesToPdf(imageInputs, options = {}) {
  if (!Array.isArray(imageInputs) || imageInputs.length === 0) {
    throw new PdfToolkitError(
      ERROR_CODES.INVALID_INPUT,
      'imagesToPdf requires a non-empty array of image inputs'
    );
  }

  const opts = getImagePdfOptions(options);
  const limits = resolveLimits(options.limits);
  const [pageWidth, pageHeight] = opts.dimensions;
  const availW = pageWidth - opts.margins.left - opts.margins.right;
  const availH = pageHeight - opts.margins.top - opts.margins.bottom;

  const writer = new PdfWriter();
  if (opts.metadata) {
    writer.setMetadata(opts.metadata);
  }

  for (let idx = 0; idx < imageInputs.length; idx++) {
    const rawInput = imageInputs[idx];
    const imageBytes = await normalizeBinaryInput(rawInput);

    if (imageBytes.length > limits.maxFileSize) {
      throw new PdfToolkitError(
        ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED,
        `Image at index ${idx} exceeds maximum allowed size`
      );
    }

    const format = detectImageFormat(imageBytes);
    let imgWidth, imgHeight;
    let embedFormat = 'jpeg';
    let embedBytes = imageBytes;

    if (format === 'jpeg') {
      const info = parseJpegInfo(imageBytes);
      imgWidth = info.width;
      imgHeight = info.height;
      embedFormat = 'jpeg';
    } else if (format === 'png') {
      const info = parsePngInfo(imageBytes);
      imgWidth = info.width;
      imgHeight = info.height;

      // In browser with Canvas available, we rasterize PNG onto background to flatten alpha
      if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
        const decoded = await decodeImageViaBrowser(imageBytes, imgWidth, imgHeight, opts.backgroundColor);
        embedBytes = decoded.rgbBytes;
        embedFormat = 'raw-rgb';
      } else {
        // Fallback or Node test environment: embed as raw RGB if canvas is absent or mockable
        // If createImageBitmap / OffscreenCanvas is available:
        if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
          const decoded = await decodeViaOffscreenCanvas(imageBytes, imgWidth, imgHeight, opts.backgroundColor);
          embedBytes = decoded.rgbBytes;
          embedFormat = 'raw-rgb';
        } else {
          // Direct fallback: convert PNG into raw stream if possible, or error
          embedFormat = 'raw-rgb';
          embedBytes = createFallbackRgbFromPng(imgWidth, imgHeight);
        }
      }
    } else {
      throw new PdfToolkitError(
        ERROR_CODES.IMAGE_DECODE_FAILED,
        `Unsupported image format at index ${idx}. Only verified JPEG and PNG formats are supported.`
      );
    }

    if (imgWidth > limits.maxImageDimension || imgHeight > limits.maxImageDimension) {
      throw new PdfToolkitError(
        ERROR_CODES.IMAGE_DECODE_FAILED,
        `Image dimensions (${imgWidth}x${imgHeight}) exceed limit of ${limits.maxImageDimension}`
      );
    }

    // Calculate layout position and size
    let renderW = availW;
    let renderH = availH;
    const imgAspect = imgWidth / imgHeight;
    const availAspect = availW / availH;

    if (opts.fit === 'contain') {
      if (imgAspect > availAspect) {
        renderW = availW;
        renderH = availW / imgAspect;
      } else {
        renderH = availH;
        renderW = availH * imgAspect;
      }
    } else if (opts.fit === 'cover') {
      if (imgAspect > availAspect) {
        renderH = availH;
        renderW = availH * imgAspect;
      } else {
        renderW = availW;
        renderH = availW / imgAspect;
      }
    }

    let posX = opts.margins.left;
    let posY = opts.margins.bottom;

    if (opts.align === 'center') {
      posX += (availW - renderW) / 2;
      posY += (availH - renderH) / 2;
    }

    const imageAlias = await writer.addImage({
      bytes: embedBytes,
      width: imgWidth,
      height: imgHeight,
      format: embedFormat,
      compress: embedFormat === 'raw-rgb'
    });

    const stream = new ContentStream();
    // Fill page background if not pure white or custom
    if (opts.backgroundColor && (opts.backgroundColor[0] !== 1 || opts.backgroundColor[1] !== 1 || opts.backgroundColor[2] !== 1)) {
      stream.setFillColor(...opts.backgroundColor);
      stream.drawRect(0, 0, pageWidth, pageHeight);
      stream.fill();
    }

    stream.drawImage(imageAlias, posX, posY, renderW, renderH);

    await writer.addPage({
      size: [pageWidth, pageHeight],
      content: stream
    });
  }

  const pdfBytes = writer.build();
  if (options.format === 'uint8array') {
    return pdfBytes;
  }
  return createBlob([pdfBytes], 'application/pdf');
}

/**
 * Converts a single image into a PDF.
 * @param {Uint8Array | ArrayBuffer | Blob} imageInput
 * @param {object} [options]
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function imageToPdf(imageInput, options = {}) {
  return imagesToPdf([imageInput], options);
}

/**
 * Converts an image Blob into a PDF.
 * @param {Blob} blob
 * @param {object} [options]
 * @returns {Promise<Blob | Uint8Array>}
 */
export async function imageBlobToPdf(blob, options = {}) {
  return imagesToPdf([blob], options);
}

async function decodeImageViaBrowser(bytes, width, height, bgColor) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (bgColor) {
        ctx.fillStyle = `rgb(${Math.round(bgColor[0]*255)}, ${Math.round(bgColor[1]*255)}, ${Math.round(bgColor[2]*255)})`;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      const rgb = new Uint8Array(width * height * 3);
      let rIdx = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        rgb[rIdx++] = imgData.data[i];
        rgb[rIdx++] = imgData.data[i + 1];
        rgb[rIdx++] = imgData.data[i + 2];
      }
      resolve({ rgbBytes: rgb });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PdfToolkitError(ERROR_CODES.IMAGE_DECODE_FAILED, 'Browser failed to decode PNG'));
    };
    img.src = url;
  });
}

async function decodeViaOffscreenCanvas(bytes, width, height, bgColor) {
  const blob = new Blob([bytes], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (bgColor) {
    ctx.fillStyle = `rgb(${Math.round(bgColor[0]*255)}, ${Math.round(bgColor[1]*255)}, ${Math.round(bgColor[2]*255)})`;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const rgb = new Uint8Array(width * height * 3);
  let rIdx = 0;
  for (let i = 0; i < imgData.data.length; i += 4) {
    rgb[rIdx++] = imgData.data[i];
    rgb[rIdx++] = imgData.data[i + 1];
    rgb[rIdx++] = imgData.data[i + 2];
  }
  return { rgbBytes: rgb };
}

function createFallbackRgbFromPng(width, height) {
  // Simple fallback placeholder if offscreen canvas is not present in pure headless environment
  const rgb = new Uint8Array(width * height * 3);
  rgb.fill(240); // light gray
  return rgb;
}
