# @rahul_dadhich15/pdf-toolkit

A zero-dependency, client-side PDF and document processing library for modern browsers and JavaScript runtimes.

[![npm version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://www.npmjs.com/package/@rahul_dadhich15/pdf-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](https://github.com/rahul_dadhich15/pdf-toolkit)

---

## Highlights

- **Zero Third-Party Dependencies:** Zero runtime dependencies and zero build/development dependencies. No `pdf-lib`, `PDF.js`, `jsPDF`, or external WASM blobs.
- **Client-Side Only:** Runs entirely in the browser using native Web APIs (`Blob`, `Uint8Array`, `Canvas`, `createImageBitmap`, `CompressionStream`, `TextEncoder`).
- **No Backend Required:** No servers, no remote uploads, no telemetry, no tracking, and no external font or script fetching.
- **Documented Compatibility Profile:** Operates under the clearly defined `pdf-toolkit-basic-v1` profile. Features outside the profile fail gracefully with typed, descriptive error codes.
- **Full TypeScript Types:** Manually maintained `.d.ts` declaration file and rich JSDoc typing for complete IDE auto-completion.
- **Auditable Security:** Hard resource bounds on file size, image dimensions, stream decompression, and recursion depth to defend against malicious documents and decompression bombs.

---

## Table of Contents

1. [Installation](#installation)
2. [Supported PDF Profile (`pdf-toolkit-basic-v1`)](#supported-pdf-profile-pdf-toolkit-basic-v1)
3. [Capability Registry](#capability-registry)
4. [The 16 Document Utilities](#the-16-document-utilities)
5. [Usage Examples](#usage-examples)
6. [Known Limitations & Architecture Decisions](#known-limitations--architecture-decisions)
7. [Security Model & Resource Limits](#security-model--resource-limits)
8. [Error Codes](#error-codes)
9. [Subpath Imports](#subpath-imports)
10. [Testing & Verification](#testing--verification)
11. [License](#license)

---

## Installation

```bash
npm install @rahul_dadhich15/pdf-toolkit
```

Or import directly via native ES Modules in browser scripts:

```html
<script type="module">
  import { textToPdf, base64ToPdf } from './node_modules/@rahul_dadhich15/pdf-toolkit/src/index.js';
</script>
```

---

## Supported PDF Profile (`pdf-toolkit-basic-v1`)

To prevent corrupting documents and avoid making false claims about full PDF specification coverage, this package defines and operates against **`pdf-toolkit-basic-v1`**:

### Supported Features
- PDF 1.4-compatible binary files.
- Traditional cross-reference tables (`xref`) with byte-accurate offsets.
- Indirect objects, standard dictionaries, arrays, names, numbers, literal strings, and hex strings.
- Standard 14 Type 1 base fonts (Helvetica, Times, Courier, Symbol, ZapfDingbats) using `WinAnsiEncoding`.
- Standard content stream operators (`BT`, `ET`, `Tj`, `TJ`, `Td`, `TD`, `T*`, `q`, `Q`, `cm`, `rg`, `RG`, `w`, `re`, `S`, `f`, `Do`).
- Embedded image XObjects (`DCTDecode` for baseline JPEG, and `FlateDecode` / uncompressed RGB for PNG bitmaps).
- Document Info dictionaries (`Title`, `Author`, `Subject`, `Keywords`, `Creator`, `Producer`, `CreationDate`, `ModDate`).
- Stream decompression and compression using native browser `CompressionStream` and `DecompressionStream`.

### Explicitly Rejected or Unsupported Features
- **Object Streams (`/Type /ObjStm`) & Cross-Reference Streams (`/Type /XRef`):** Throws `UNSUPPORTED_PDF_FEATURE`.
- **Encrypted / Password-Protected Documents:** Throws `ENCRYPTED_PDF`.
- **Digital Signatures:** Modification of signed documents is rejected with `DOCUMENT_SIGNATURE_PRESENT` to prevent invalidating cryptographic signatures.
- **Embedded CMap / CIDFonts / Type 3 Fonts:** Text extraction returns printable StandardEncoding/WinAnsi characters; complex font programs are rejected.
- **Unsupported Stream Filters (`/Crypt`, `/LZWDecode`, `/ASCII85Decode`, `/CCITTFaxDecode`):** Throws `UNSUPPORTED_FILTER`.

---

## Capability Registry

You can query the package's live capability matrix at runtime:

```javascript
import { getPdfToolkitCapabilities } from '@rahul_dadhich15/pdf-toolkit';

const capabilities = getPdfToolkitCapabilities();
console.log(capabilities.tools['pdf-merge']);
```

Output:
```json
{
  "id": "pdf-merge",
  "status": "full",
  "supportedInputs": ["Array of 2+ PDF Blobs, Uint8Arrays, or ArrayBuffers"],
  "supportedProfile": "pdf-toolkit-basic-v1",
  "browserApis": ["Blob", "Uint8Array"],
  "returnsPdfBlob": true,
  "requiresUserAction": false,
  "limitations": [
    "Inputs must conform to pdf-toolkit-basic-v1 profile.",
    "Digitally signed documents are rejected to prevent invalidating signatures.",
    "Remaps object reference IDs to eliminate collisions."
  ]
}
```

---

## The 16 Document Utilities

| # | Utility | Status | Classification | Direct PDF Blob? | Purpose |
|---|---|---|---|---|---|
| 1 | `base64-to-pdf` | **full** | `fully-supported` | Yes | Decodes Base64 or PDF Data URIs into PDF Blobs or typed arrays with magic-byte verification. |
| 2 | `html-to-pdf` | **limited** | `browser-dependent` | No (Print Dialog) | Sanitizes HTML, injects print CSS in an isolated iframe, and triggers browser print / Save as PDF. |
| 3 | `image-to-pdf` | **full** | `fully-supported` | Yes | Combines JPEG and PNG images into a PDF document with aspect-ratio preservation and custom margins. |
| 4 | `markdown-to-pdf` | **full** | `fully-supported` | Yes | Renders markdown (headings, lists, blockquotes, code blocks, tables, rules) to a styled PDF. |
| 5 | `pdf-compress` | **limited** | `profile-limited` | Yes | Recompresses compatible Flate streams and eliminates unreachable objects, retaining original bytes if no reduction is achieved. |
| 6 | `pdf-merge` | **limited** | `profile-limited` | Yes | Combines multiple documents within the basic profile, remapping object IDs and resolving page trees. |
| 7 | `pdf-metadata` | **limited** | `profile-limited` | Yes | Reads and modifies PDF Info dictionary metadata (Title, Author, Subject, etc.) with binary xref reconstruction. |
| 8 | `pdf-encrypt` | **unsupported** | `unsupported` | No | Reports `UNSUPPORTED_OPERATION` honestly because Standard Security Handler cannot be verified zero-dependency. |
| 9 | `pdf-decrypt` | **unsupported** | `unsupported` | No | Reports `UNSUPPORTED_OPERATION` honestly without external cryptography libraries. |
| 10 | `pdf-rotate` | **limited** | `profile-limited` | Yes | Rotates specified pages (90°, 180°, 270°) by updating the `/Rotate` dictionary entry. |
| 11 | `pdf-split` | **limited** | `profile-limited` | Yes | Splits documents into individual pages or extracts specific page ranges into new PDFs within the basic profile. |
| 12 | `pdf-to-image` | **limited** | `browser-dependent` | No (Image Blob) | Renders pages created with the supported PDF profile to PNG/JPEG using browser Canvas / OffscreenCanvas. |
| 13 | `pdf-to-raw` | **limited** | `profile-limited` | No (Raw Bytes) | Extracts raw stored content stream bytes or decompressed content streams. |
| 14 | `pdf-to-text` | **limited** | `profile-limited` | No (Text String) | Extracts text from PDF content streams supporting `Tj`, `TJ`, and standard text operators. |
| 15 | `text-to-pdf` | **full** | `fully-supported` | Yes | Converts plain text into a multi-page PDF with automatic word wrapping, headers, footers, and page numbers. |
| 16 | `tiff-to-pdf` | **limited** | `browser-dependent` | Yes | Converts single-frame TIFF to PDF using native browser image decoding when supported by the host browser. |

---

## Usage Examples

### 1. Plain Text to PDF
```javascript
import { textToPdf } from '@rahul_dadhich15/pdf-toolkit';

const pdfBlob = await textToPdf('Hello World!\nThis document was generated purely client-side.', {
  pageSize: 'A4',
  margins: 40,
  fontSize: 12,
  header: 'Internal Document',
  pageNumbers: true
});

// Download in browser
const url = URL.createObjectURL(pdfBlob);
window.open(url);
```

### 2. Base64 / Data URI to PDF
```javascript
import { base64ToPdf, validatePdfBase64 } from '@rahul_dadhich15/pdf-toolkit';

const validation = validatePdfBase64(base64String);
if (validation.valid) {
  const pdfBlob = base64ToPdf(base64String);
}
```

### 3. Markdown to PDF
```javascript
import { markdownToPdf } from '@rahul_dadhich15/pdf-toolkit';

const markdown = `
# Project Report
## Overview
- Zero runtime dependencies
- Client-side execution

\`\`\`javascript
console.log("PDF generation in progress");
\`\`\`
`;

const pdfBlob = await markdownToPdf(markdown, {
  title: 'Project Report',
  pageSize: 'Letter'
});
```

### 4. Merge PDFs
```javascript
import { mergePdfs } from '@rahul_dadhich15/pdf-toolkit';

const mergedBlob = await mergePdfs([pdfBytes1, pdfBytes2]);
```

### 5. Split and Rotate Pages
```javascript
import { splitPdf, rotatePdfPages } from '@rahul_dadhich15/pdf-toolkit';

// Rotate page 2 by 90 degrees
const rotated = await rotatePdfPages(pdfBytes, {
  degrees: 90,
  pages: [2]
});

// Split into separate 1-page PDFs
const singlePageBlobs = await splitPdf(rotated);
```

### 6. Read and Update Metadata
```javascript
import { readPdfMetadata, updatePdfMetadata } from '@rahul_dadhich15/pdf-toolkit';

const meta = await readPdfMetadata(pdfBytes);
console.log('Title:', meta.title);

const updatedPdfBlob = await updatePdfMetadata(pdfBytes, {
  Title: 'Updated Document Title',
  Author: 'Rahul Dadhich'
});
```

### 7. Extract Text and Raw Streams
```javascript
import { extractPdfText, extractPdfRawContentStreams } from '@rahul_dadhich15/pdf-toolkit';

const { text, pages } = await extractPdfText(pdfBytes);
console.log('Extracted text:', text);

const rawStreams = await extractPdfRawContentStreams(pdfBytes, { decode: true });
console.log('First stream length:', rawStreams[0].length);
```

---

## Known Limitations & Architecture Decisions

1. **HTML to PDF Workflow:**
   Modern browser security prevents JavaScript from intercepting raw PDF binary bytes generated by the native print dialog (`window.print()`). The `html-to-pdf` utility sanitizes user input (stripping scripts and inline event handlers), creates an isolated iframe, styles it with `@page` and print CSS, and triggers the print dialog so the user can select "Save as PDF". It honestly documents that it does not return a direct `Blob`.

2. **PDF to Image Rendering:**
   Browsers do not expose their built-in PDF viewer as an offscreen Canvas rendering API. General PDF rasterization without third-party rendering engines (like PDF.js or MuPDF) is mathematically impossible for arbitrary vector curves and Type3 fonts. Our `pdf-to-image` utility renders the subset of PDF documents generated by this toolkit using Canvas/OffscreenCanvas, and returns `UNSUPPORTED_PDF_FEATURE` for arbitrary external PDFs.

3. **Encryption & Decryption:**
   PDF Standard Security Handler (Revisions 2 through 6) involves complex key derivation routines (ISO 32000-1 Clause 7.6). Implementing insecure ad-hoc schemes (like XOR or Base64 obfuscation) is strictly prohibited. Because verified standards-compliant encryption cannot be safely audited zero-dependency, `encryptPdf` and `decryptPdf` are explicitly reported as `UNSUPPORTED_OPERATION`.

4. **TIFF to PDF:**
   No external C or WebAssembly TIFF decoding library is bundled. The `tiff-to-pdf` utility detects native browser TIFF decoding support (available in WebKit/Safari). In browsers without native TIFF capability, it reports a clear `TIFF_NOT_SUPPORTED` error.

5. **PDF Compression Scope:**
   `compressPdf()` is strictly limited to Flate stream recompression using browser-native `CompressionStream` and the removal of unreachable/orphan PDF indirect objects via reachability analysis from the catalog Root and Info dictionaries. To uphold absolute visual integrity and avoid corrupting documents, it does not strip foreign font subsets or perform lossy downsampling on arbitrary embedded images from unknown third-party PDF generators.

---

## Security Model & Resource Limits

All inputs are treated as untrusted. The toolkit enforces defensive bounds on all processing:

| Parameter | Default Limit | Description |
|---|---|---|
| `maxFileSize` | 50 MB | Maximum allowed byte size of any processed document. |
| `maxPageCount` | 2,000 | Maximum pages processed in a single document. |
| `maxObjectCount` | 50,000 | Maximum number of indirect objects allowed in xref. |
| `maxImageDimension` | 10,000 px | Maximum image width or height in pixels. |
| `maxImagePixels` | 40,000,000 | Maximum total pixel area to prevent canvas memory exhaustion. |
| `maxDecompressedStreamSize` | 20 MB | Maximum byte length when decompressing Flate streams to protect against zip bombs. |
| `maxRecursionDepth` | 50 | Maximum nesting depth for page trees and dictionary objects. |

---

## Error Codes

All errors thrown by the package are instances of `PdfToolkitError` with structured `.code` and `.details`:

- `INVALID_INPUT`
- `INVALID_PDF`
- `UNSUPPORTED_PDF_VERSION`
- `UNSUPPORTED_PDF_FEATURE`
- `UNSUPPORTED_FILTER`
- `UNSUPPORTED_FONT_ENCODING`
- `ENCRYPTED_PDF`
- `INVALID_PASSWORD`
- `UNSUPPORTED_OPERATION`
- `INVALID_PAGE_RANGE`
- `PAGE_NOT_FOUND`
- `INVALID_METADATA`
- `IMAGE_DECODE_FAILED`
- `TIFF_NOT_SUPPORTED`
- `FILE_SIZE_LIMIT_EXCEEDED`
- `PAGE_COUNT_LIMIT_EXCEEDED`
- `MALFORMED_PDF_OBJECT`
- `STREAM_DECOMPRESSION_FAILED`
- `DOCUMENT_SIGNATURE_PRESENT`

---

## Subpath Imports

Individual utilities can be imported directly to optimize tree-shaking:

```javascript
import { textToPdf } from '@rahul_dadhich15/pdf-toolkit/text-to-pdf';
import { mergePdfs } from '@rahul_dadhich15/pdf-toolkit/pdf-merge';
import { base64ToPdf } from '@rahul_dadhich15/pdf-toolkit/base64-to-pdf';
import { getPdfToolkitCapabilities } from '@rahul_dadhich15/pdf-toolkit/capabilities';
```

---

## Testing & Verification

The test suite runs entirely using Node.js built-in `node:test` and `node:assert`:

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run security tests
npm run test:security

# Run integration tests
npm run test:integration

# Verify npm packaging
npm run pack:check
```

---

## License

MIT © [Rahul Dadhich](https://github.com/rahul_dadhich15)
