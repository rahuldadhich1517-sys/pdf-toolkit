# Changelog

All notable changes to `@rahul_dadhich15/pdf-toolkit` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-25

### Added
- Standalone zero-dependency client-side PDF processing architecture.
- Documented `pdf-toolkit-basic-v1` compatibility profile for PDF 1.4 documents.
- Minimal binary PDF 1.4 writer with standard 14 base fonts, content streams, image XObjects, xref table, and trailer.
- Scoped PDF 1.4 parser supporting object tokenization, traditional xref tables, page tree traversal, stream decoding, and trailer inspection.
- 16 document utilities:
  1. `base64-to-pdf`: Base64 and PDF Data URI decoding with binary header validation.
  2. `html-to-pdf`: Isolated iframe print preparation with sanitize filter and print styling.
  3. `image-to-pdf`: Direct JPEG embedding and PNG bitmap compositing onto customizable page dimensions.
  4. `markdown-to-pdf`: Scoped markdown parser supporting headings, lists, blockquotes, code blocks, tables, and page breaks.
  5. `pdf-compress`: Flate stream recompression with byte size verification.
  6. `pdf-merge`: Multi-document merger with object reference remapping and page tree reconstruction.
  7. `pdf-metadata`: Read and edit PDF Info dictionary metadata with binary serialization.
  8. `pdf-encrypt`: Capability reporting with explicit `UNSUPPORTED_OPERATION` error for unverified crypto.
  9. `pdf-decrypt`: Capability reporting with explicit `UNSUPPORTED_OPERATION` error for unverified crypto.
  10. `pdf-rotate`: Modulo-360 page dictionary `/Rotate` attribute modification.
  11. `pdf-split`: Single-page splitting and page range extraction into distinct documents.
  12. `pdf-to-image`: Limited Canvas-based page rendering for documents created with supported profile.
  13. `pdf-to-raw`: Raw and decompressed content stream extraction with filter metadata.
  14. `pdf-to-text`: Extraction of selectable text from standard content stream operators (`Tj`, `TJ`, `Td`, `T*`).
  15. `text-to-pdf`: Multi-page text layout engine with automatic word wrapping, headers, footers, and page numbers.
  16. `tiff-to-pdf`: Single-frame TIFF conversion using browser-native decoding capability checks.
- Comprehensive Capability Registry via `getPdfToolkitCapabilities()`.
- Built-in TypeScript declarations in `types/index.d.ts`.
- Security defense boundaries against decompression bombs, file size limits, pixel limits, and recursion limits.
- Browser verification harness in `examples/browser-test.html` and automated headless runner `tests/browser-runner.js`.
- 100% dependency-free test suite using Node.js built-in `node:test` runner.

### Audited & Refined
- Enhanced `pdf-compress` with object reachability graph traversal from Root/Info to eliminate orphan indirect objects.
- Fixed missing `PdfRef` resolution in `getPdfCompressionInfo()` and `compressPdf()`.
- Handled early cancellation and write rejection in `DecompressionStream` to prevent unhandled rejection events on oversized stream detection.
- Updated `getPdfToolkitCapabilities()` with explicit `classification` field (`fully-supported`, `profile-limited`, `browser-dependent`, `unsupported`) and marked arbitrary PDF operations as `limited`.
- Added multiple real PDF fixtures: `basic-1.4.pdf`, `hierarchical-pagetree.pdf`, `multiple-content-streams.pdf`, `signed-sample.pdf`, and `broken-xref.pdf`.
- Verified live in real Google Chrome browser (`HeadlessChrome 158.0.8127.88`) via Chrome DevTools Protocol with 21 browser tests passing.
- Validated clean external consumer tarball installation with all 17 subpath exports and TypeScript declarations.
