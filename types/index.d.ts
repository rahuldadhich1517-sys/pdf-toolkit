/**
 * Type declarations for @rahul_dadhich15/pdf-toolkit.
 */

export interface ErrorDetails {
  [key: string]: unknown;
}

export declare class PdfToolkitError extends Error {
  code: string;
  details: ErrorDetails;
  constructor(code: string, message: string, details?: ErrorDetails);
  toJSON(): { name: string; code: string; message: string; details: ErrorDetails };
}

export declare const ERROR_CODES: {
  readonly INVALID_INPUT: 'INVALID_INPUT';
  readonly INVALID_PDF: 'INVALID_PDF';
  readonly UNSUPPORTED_PDF_VERSION: 'UNSUPPORTED_PDF_VERSION';
  readonly UNSUPPORTED_PDF_FEATURE: 'UNSUPPORTED_PDF_FEATURE';
  readonly UNSUPPORTED_FILTER: 'UNSUPPORTED_FILTER';
  readonly UNSUPPORTED_FONT_ENCODING: 'UNSUPPORTED_FONT_ENCODING';
  readonly ENCRYPTED_PDF: 'ENCRYPTED_PDF';
  readonly INVALID_PASSWORD: 'INVALID_PASSWORD';
  readonly UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION';
  readonly INVALID_PAGE_RANGE: 'INVALID_PAGE_RANGE';
  readonly PAGE_NOT_FOUND: 'PAGE_NOT_FOUND';
  readonly INVALID_METADATA: 'INVALID_METADATA';
  readonly IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED';
  readonly TIFF_NOT_SUPPORTED: 'TIFF_NOT_SUPPORTED';
  readonly FILE_SIZE_LIMIT_EXCEEDED: 'FILE_SIZE_LIMIT_EXCEEDED';
  readonly PAGE_COUNT_LIMIT_EXCEEDED: 'PAGE_COUNT_LIMIT_EXCEEDED';
  readonly MALFORMED_PDF_OBJECT: 'MALFORMED_PDF_OBJECT';
  readonly STREAM_DECOMPRESSION_FAILED: 'STREAM_DECOMPRESSION_FAILED';
  readonly DOCUMENT_SIGNATURE_PRESENT: 'DOCUMENT_SIGNATURE_PRESENT';
};

export declare const SUPPORTED_PDF_PROFILE: string;

export interface ToolCapability {
  id: string;
  status: 'full' | 'limited' | 'unsupported';
  classification: 'fully-supported' | 'profile-limited' | 'browser-dependent' | 'unsupported';
  supportedInputs: string[];
  supportedProfile: string;
  browserApis: string[];
  returnsPdfBlob: boolean;
  requiresUserAction: boolean;
  limitations: string[];
}

export interface ToolkitCapabilities {
  package: string;
  version: string;
  supportedPdfProfile: string;
  profileDescription: string;
  tools: Record<string, ToolCapability>;
}

export declare function getPdfToolkitCapabilities(): ToolkitCapabilities;

// 1. base64-to-pdf
export interface Base64Options {
  format?: 'blob' | 'uint8array';
  maxSize?: number;
}
export declare function base64ToPdf(input: string, options?: Base64Options): Blob | Uint8Array;
export declare function parsePdfDataUri(dataUri: string): { mimeType: string; base64: string };
export declare function validatePdfBase64(input: string): { valid: boolean; error?: string; size?: number };
export declare function getPdfBase64Metadata(input: string): { size: number; isDataUri: boolean; mimeType?: string; pdfVersion?: string };

// 2. html-to-pdf
export interface HtmlPrintOptions {
  pageSize?: string;
  orientation?: 'portrait' | 'landscape';
  margins?: string;
  title?: string;
  customCss?: string;
  printBackgrounds?: boolean;
}
export declare function prepareHtmlForPrint(html: string, options?: HtmlPrintOptions): string;
export declare function openHtmlPrintDialog(html: string, options?: HtmlPrintOptions): Promise<{ printed: boolean; message: string }>;
export declare function sanitizeHtmlForPrint(html: string): string;
export declare function getHtmlPrintOptions(options?: HtmlPrintOptions): HtmlPrintOptions;

// 3. image-to-pdf
export interface ImagePdfOptions {
  pageSize?: string | [number, number];
  orientation?: 'portrait' | 'landscape';
  margins?: number | { top?: number; right?: number; bottom?: number; left?: number };
  fit?: 'contain' | 'cover' | 'fill';
  align?: 'center' | 'left' | 'right';
  backgroundColor?: [number, number, number];
  format?: 'blob' | 'uint8array';
  metadata?: Record<string, string>;
}
export declare function imageToPdf(image: Uint8Array | ArrayBuffer | Blob, options?: ImagePdfOptions): Promise<Blob | Uint8Array>;
export declare function imagesToPdf(images: Array<Uint8Array | ArrayBuffer | Blob>, options?: ImagePdfOptions): Promise<Blob | Uint8Array>;
export declare function imageBlobToPdf(blob: Blob, options?: ImagePdfOptions): Promise<Blob | Uint8Array>;
export declare function getImagePdfOptions(options?: ImagePdfOptions): ImagePdfOptions;

// 4. markdown-to-pdf
export interface MarkdownPdfOptions {
  pageSize?: string | [number, number];
  orientation?: 'portrait' | 'landscape';
  margins?: number | { top?: number; right?: number; bottom?: number; left?: number };
  fontSize?: number;
  title?: string;
  header?: string;
  footer?: string;
  pageNumbers?: boolean;
  format?: 'blob' | 'uint8array';
  metadata?: Record<string, string>;
}
export declare function markdownToPdf(markdown: string, options?: MarkdownPdfOptions): Promise<Blob | Uint8Array>;
export declare function parseMarkdownForPdf(markdown: string): unknown[];
export declare function getMarkdownPdfOptions(options?: MarkdownPdfOptions): MarkdownPdfOptions;

// 5. pdf-compress
export interface CompressPdfOptions {
  recompressStreams?: boolean;
  removeUnusedObjects?: boolean;
  retainIfLarger?: boolean;
  format?: 'blob' | 'uint8array';
}
export interface CompressionResult {
  bytes: Uint8Array;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  reductionRatio: number;
  didCompress: boolean;
  modifiedStreams: number;
}
export declare function compressPdf(pdf: Uint8Array | ArrayBuffer | Blob, options?: CompressPdfOptions): Promise<CompressionResult>;
export declare function getPdfCompressionInfo(pdf: Uint8Array | ArrayBuffer | Blob): Promise<{
  originalSize: number;
  streamCount: number;
  uncompressedStreams: number;
  totalStreamBytes: number;
  pageCount: number;
  pdfVersion: string;
}>;
export declare function getPdfCompressionOptions(options?: CompressPdfOptions): CompressPdfOptions;

// 6. pdf-merge
export declare function mergePdfs(pdfs: Array<Uint8Array | ArrayBuffer | Blob>, options?: { format?: 'blob' | 'uint8array'; metadata?: Record<string, string> }): Promise<Blob | Uint8Array>;
export declare function validateMergeInputs(inputs: unknown[]): boolean;
export declare function getPdfMergeOptions(options?: unknown): { metadata: Record<string, string> };

// 7. pdf-metadata
export interface PdfMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: Date | null;
  modDate: Date | null;
  pageCount: number;
  pdfVersion: string;
  isEncrypted: boolean;
  hasXmp: boolean;
}
export declare function readPdfMetadata(pdf: Uint8Array | ArrayBuffer | Blob): Promise<PdfMetadata>;
export declare const getPdfMetadata: typeof readPdfMetadata;
export declare function updatePdfMetadata(pdf: Uint8Array | ArrayBuffer | Blob, newMetadata: Record<string, string | Date>, options?: { format?: 'blob' | 'uint8array' }): Promise<Blob | Uint8Array>;
export declare function validatePdfMetadata(metadata: Record<string, unknown>): boolean;

// 8. pdf-encrypt (Unsupported)
export declare function encryptPdf(pdf: Uint8Array | ArrayBuffer | Blob, options?: unknown): Promise<never>;
export declare function validateEncryptionOptions(options?: unknown): { supported: boolean; reason: string };
export declare function getPdfEncryptionInfo(pdf: Uint8Array | ArrayBuffer | Blob): Promise<{ isEncrypted: boolean; algorithm: string | null }>;

// 9. pdf-decrypt (Unsupported)
export declare function decryptPdf(pdf: Uint8Array | ArrayBuffer | Blob, password: string, options?: unknown): Promise<never>;
export declare function validatePdfPassword(pdf: Uint8Array | ArrayBuffer | Blob, password: string): Promise<{ isEncrypted: boolean; passwordValid: boolean; supported: boolean }>;
export declare function getPdfSecurityInfo(pdf: Uint8Array | ArrayBuffer | Blob): Promise<{ isEncrypted: boolean; supported: boolean; message: string }>;

// 10. pdf-rotate
export interface RotateConfig {
  degrees: number;
  pages?: number[] | 'all';
  relative?: boolean;
}
export declare function rotatePdfPages(pdf: Uint8Array | ArrayBuffer | Blob, config: RotateConfig, options?: { format?: 'blob' | 'uint8array' }): Promise<Blob | Uint8Array>;
export declare function getPdfPageRotation(pdf: Uint8Array | ArrayBuffer | Blob, pageNumber: number): Promise<number>;
export declare function validatePageRotation(angle: number): number;

// 11. pdf-split
export declare function splitPdf(pdf: Uint8Array | ArrayBuffer | Blob, options?: { ranges?: string | Array<number | { start: number; end: number }>; format?: 'blob' | 'uint8array' }): Promise<Array<Blob | Uint8Array>>;
export declare function splitPdfByRanges(pdf: Uint8Array | ArrayBuffer | Blob, ranges: string | Array<number | { start: number; end: number }>, options?: { format?: 'blob' | 'uint8array' }): Promise<Array<Blob | Uint8Array>>;
export declare function extractPdfPages(pdf: Uint8Array | ArrayBuffer | Blob, pageNumbers: number[], options?: { format?: 'blob' | 'uint8array' }): Promise<Blob | Uint8Array>;
export declare function validatePdfPageRanges(ranges: unknown, totalPages: number): Array<{ start: number; end: number }>;

// 12. pdf-to-image
export interface RenderOptions {
  scale?: number;
  format?: 'image/png' | 'image/jpeg';
  quality?: number;
  backgroundColor?: string;
  pages?: number[];
}
export declare function renderPdfPage(pdf: Uint8Array | ArrayBuffer | Blob, pageNumber: number, options?: RenderOptions): Promise<{ blob: Blob; width: number; height: number; pageNumber: number }>;
export declare function renderPdfPages(pdf: Uint8Array | ArrayBuffer | Blob, options?: RenderOptions): Promise<Array<{ blob: Blob; width: number; height: number; pageNumber: number }>>;
export declare function getPdfRenderOptions(options?: RenderOptions): RenderOptions;
export declare function getPdfPageDimensions(pdf: Uint8Array | ArrayBuffer | Blob, pageNumber: number, scale?: number): Promise<{ width: number; height: number; pixelWidth: number; pixelHeight: number; rotation: number }>;

// 13. pdf-to-raw
export interface RawStreamResult {
  pageNumber: number;
  streamIndex: number;
  bytes: Uint8Array;
  decoded: boolean;
  filters: string[];
  length: number;
}
export declare function extractPdfRawContentStreams(pdf: Uint8Array | ArrayBuffer | Blob, options?: { pages?: number[]; decode?: boolean }): Promise<RawStreamResult[]>;
export declare function getPdfPageContentStreams(pdf: Uint8Array | ArrayBuffer | Blob, pageNumber: number, options?: { decode?: boolean }): Promise<RawStreamResult[]>;
export declare function getPdfStreamMetadata(pdf: Uint8Array | ArrayBuffer | Blob, pageNumber: number): Promise<{ pageNumber: number; streamCount: number; totalBytes: number; filters: string[][] }>;

// 14. pdf-to-text
export declare function extractPdfText(pdf: Uint8Array | ArrayBuffer | Blob, options?: { pages?: number[] }): Promise<{ text: string; pages: Array<{ pageNumber: number; text: string }> }>;
export declare function extractPdfPageText(pdf: Uint8Array | ArrayBuffer | Blob, pageNumber: number): Promise<{ pageNumber: number; text: string }>;
export declare function getPdfTextMetadata(pdf: Uint8Array | ArrayBuffer | Blob): Promise<{ pageCount: number; estimatedCharacters: number }>;

// 15. text-to-pdf
export interface TextPdfOptions {
  pageSize?: string | [number, number];
  orientation?: 'portrait' | 'landscape';
  margins?: number | { top?: number; right?: number; bottom?: number; left?: number };
  fontSize?: number;
  lineHeight?: number;
  font?: string;
  align?: 'left' | 'center' | 'right';
  pageNumbers?: boolean;
  header?: string;
  footer?: string;
  format?: 'blob' | 'uint8array';
  metadata?: Record<string, string>;
}
export declare function textToPdf(text: string, options?: TextPdfOptions): Promise<Blob | Uint8Array>;
export declare function generatePdfFromText(text: string, options?: TextPdfOptions): Promise<{ bytes: Uint8Array; blob: Blob; pageCount: number }>;
export declare function getTextPdfOptions(options?: TextPdfOptions): TextPdfOptions;

// 16. tiff-to-pdf
export declare function tiffToPdf(tiff: Uint8Array | ArrayBuffer | Blob, options?: { pageSize?: string; margins?: number; format?: 'blob' | 'uint8array' }): Promise<Blob | Uint8Array>;
export declare function validateTiffInput(bytes: Uint8Array): { valid: boolean; isLittleEndian?: boolean; error?: string };
export declare function getTiffMetadata(tiff: Uint8Array | ArrayBuffer | Blob): Promise<{ width: number; height: number; isLittleEndian: boolean; pageCount: number }>;
export declare function getTiffConversionCapabilities(): { supported: boolean; engine: string; limitations: string[] };
