/**
 * Comprehensive Capability Registry for @rahul_dadhich15/pdf-toolkit.
 * Explicitly documents real runtime capabilities, limitations, and requirements.
 */

export const SUPPORTED_PDF_PROFILE = 'pdf-toolkit-basic-v1';

export function getPdfToolkitCapabilities() {
  return {
    package: '@rahul_dadhich15/pdf-toolkit',
    version: '0.1.0',
    supportedPdfProfile: SUPPORTED_PDF_PROFILE,
    profileDescription:
      'PDF 1.4-compatible documents with traditional cross-reference tables, Standard 14 fonts, WinAnsiEncoding, standard page trees, unencrypted content, FlateDecode/DCTDecode streams.',
    tools: {
      'base64-to-pdf': {
        id: 'base64-to-pdf',
        status: 'full',
        classification: 'fully-supported',
        supportedInputs: ['Plain Base64 string', 'PDF Data URI (data:application/pdf;base64,...)'],
        supportedProfile: 'Any PDF binary transport',
        browserApis: ['atob', 'Blob', 'Uint8Array', 'TextDecoder'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: ['Enforces maximum file size limit (default 50MB).']
      },
      'html-to-pdf': {
        id: 'html-to-pdf',
        status: 'limited',
        classification: 'browser-dependent',
        supportedInputs: ['HTML string', 'HTML fragments'],
        supportedProfile: 'Browser Print Engine',
        browserApis: ['window.print', 'HTMLIFrameElement', 'CSS @page'],
        returnsPdfBlob: false,
        requiresUserAction: true,
        limitations: [
          'Browser security sandbox does not allow JavaScript to intercept binary PDF bytes from window.print().',
          'Prepares print document in an isolated iframe with page-break CSS and triggers browser "Save as PDF" dialog.',
          'External stylesheets and remote images are excluded by default for security.'
        ]
      },
      'image-to-pdf': {
        id: 'image-to-pdf',
        status: 'full',
        classification: 'fully-supported',
        supportedInputs: ['JPEG (.jpg, .jpeg)', 'PNG (.png)', 'Blob', 'Uint8Array'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Canvas', 'createImageBitmap', 'Blob', 'Uint8Array'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'JPEG streams are embedded directly as DCTDecode streams with zero re-encoding loss.',
          'PNG alpha channels are composited onto configurable background color (default white).',
          'Enforces max image dimension (10,000px) and pixel limits.'
        ]
      },
      'markdown-to-pdf': {
        id: 'markdown-to-pdf',
        status: 'full',
        classification: 'fully-supported',
        supportedInputs: ['Markdown text string'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Blob', 'Uint8Array', 'TextEncoder'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Supports headings (H1-H6), paragraphs, bold, italic, code blocks, blockquotes, lists, horizontal rules, tables, and page breaks.',
          'Does not claim full CommonMark/GFM spec parity.',
          'Uses Standard 14 fonts (Helvetica, Times, Courier).'
        ]
      },
      'pdf-compress': {
        id: 'pdf-compress',
        status: 'limited',
        classification: 'profile-limited',
        supportedInputs: ['Uint8Array', 'ArrayBuffer', 'Blob'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['CompressionStream', 'DecompressionStream', 'Blob', 'Uint8Array'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Supported only for documents conforming to pdf-toolkit-basic-v1 profile.',
          'Recompresses compatible Flate streams and removes unreachable objects.',
          'Does not perform lossy font downsampling or arbitrary image downsampling on foreign documents.'
        ]
      },
      'pdf-merge': {
        id: 'pdf-merge',
        status: 'limited',
        classification: 'profile-limited',
        supportedInputs: ['Array of 2+ PDF Blobs, Uint8Arrays, or ArrayBuffers'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Blob', 'Uint8Array'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Supported only for documents conforming to pdf-toolkit-basic-v1 profile.',
          'Digitally signed documents are rejected to prevent invalidating signatures.',
          'Cross-reference streams and object streams from PDF 1.5+ are not supported.'
        ]
      },
      'pdf-metadata': {
        id: 'pdf-metadata',
        status: 'limited',
        classification: 'profile-limited',
        supportedInputs: ['Uint8Array', 'ArrayBuffer', 'Blob'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Blob', 'Uint8Array'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Supported only for documents conforming to pdf-toolkit-basic-v1 profile.',
          'Reads and writes Info dictionary (Title, Author, Subject, Keywords, Creator, Producer, CreationDate, ModDate).',
          'Detects presence of XMP metadata package without overwriting.',
          'Rejects encrypted PDFs.'
        ]
      },
      'pdf-encrypt': {
        id: 'pdf-encrypt',
        status: 'unsupported',
        classification: 'unsupported',
        supportedInputs: [],
        supportedProfile: 'None',
        browserApis: [],
        returnsPdfBlob: false,
        requiresUserAction: false,
        limitations: [
          'Standards-compliant PDF Standard Security Handler (AES/RC4) is not available in zero-dependency release.',
          'Insecure custom XOR or fake obfuscation handlers are strictly forbidden.',
          'Throws UNSUPPORTED_OPERATION.'
        ]
      },
      'pdf-decrypt': {
        id: 'pdf-decrypt',
        status: 'unsupported',
        classification: 'unsupported',
        supportedInputs: [],
        supportedProfile: 'None',
        browserApis: [],
        returnsPdfBlob: false,
        requiresUserAction: false,
        limitations: [
          'Arbitrary PDF password decryption is unsupported in zero-dependency release without external verified crypto.',
          'Throws UNSUPPORTED_OPERATION.'
        ]
      },
      'pdf-rotate': {
        id: 'pdf-rotate',
        status: 'limited',
        classification: 'profile-limited',
        supportedInputs: ['Uint8Array', 'ArrayBuffer', 'Blob'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Blob', 'Uint8Array'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Supported only for documents conforming to pdf-toolkit-basic-v1 profile.',
          'Supports rotation angles: 90, 180, 270, 0 degrees.',
          'Operates on page dictionary /Rotate entries without re-encoding image streams.'
        ]
      },
      'pdf-split': {
        id: 'pdf-split',
        status: 'limited',
        classification: 'profile-limited',
        supportedInputs: ['Uint8Array', 'ArrayBuffer', 'Blob'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Blob', 'Uint8Array'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Supported only for documents conforming to pdf-toolkit-basic-v1 profile.',
          'Splits all pages or specified page ranges into separate PDF documents.',
          'Copies required page resources and fonts with remapped references.'
        ]
      },
      'pdf-to-image': {
        id: 'pdf-to-image',
        status: 'limited',
        classification: 'browser-dependent',
        supportedInputs: ['Uint8Array', 'ArrayBuffer', 'Blob'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Canvas', 'OffscreenCanvas', 'Blob'],
        returnsPdfBlob: false,
        requiresUserAction: false,
        limitations: [
          'Browser does not expose its native PDF viewer as an offscreen canvas rendering API.',
          'Renders pages conforming to pdf-toolkit-basic-v1 profile created with supported text/fonts.',
          'Arbitrary third-party vector/Type3 PDFs require full raster engine and are rejected.'
        ]
      },
      'pdf-to-raw': {
        id: 'pdf-to-raw',
        status: 'limited',
        classification: 'profile-limited',
        supportedInputs: ['Uint8Array', 'ArrayBuffer', 'Blob'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Uint8Array', 'DecompressionStream'],
        returnsPdfBlob: false,
        requiresUserAction: false,
        limitations: [
          'Supported only for documents conforming to pdf-toolkit-basic-v1 profile.',
          'Extracts raw stored stream bytes or decompressed stream bytes.',
          'Reports filter names and stream byte lengths.'
        ]
      },
      'pdf-to-text': {
        id: 'pdf-to-text',
        status: 'limited',
        classification: 'profile-limited',
        supportedInputs: ['Uint8Array', 'ArrayBuffer', 'Blob'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Uint8Array', 'TextDecoder'],
        returnsPdfBlob: false,
        requiresUserAction: false,
        limitations: [
          'Supported only for documents conforming to pdf-toolkit-basic-v1 profile.',
          'Parses Tj, TJ, \', \", Td, TD, T* operators in content streams.',
          'Supports WinAnsiEncoding and StandardEncoding strings.',
          'Does not support complex multi-byte CMap ToUnicode fonts.'
        ]
      },
      'text-to-pdf': {
        id: 'text-to-pdf',
        status: 'full',
        classification: 'fully-supported',
        supportedInputs: ['Plain text string'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Blob', 'Uint8Array', 'TextEncoder'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Generates valid PDF 1.4 multi-page document with word wrapping and line breaking.',
          'Supports Standard 14 fonts, customizable margins, headers, and footers.',
          'Non-Latin1 characters beyond WinAnsi are escaped safely.'
        ]
      },
      'tiff-to-pdf': {
        id: 'tiff-to-pdf',
        status: 'limited',
        classification: 'browser-dependent',
        supportedInputs: ['TIFF image bytes (.tif, .tiff)'],
        supportedProfile: SUPPORTED_PDF_PROFILE,
        browserApis: ['Image', 'Canvas'],
        returnsPdfBlob: true,
        requiresUserAction: false,
        limitations: [
          'Depends on host browser native image decoding support (Safari/WebKit natively, limited in Chrome/Firefox).',
          'Only first frame is extracted for multi-page TIFF.',
          'Throws TIFF_NOT_SUPPORTED when host browser cannot decode the format.'
        ]
      }
    }
  };
}
