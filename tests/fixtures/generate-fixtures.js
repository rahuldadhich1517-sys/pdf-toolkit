import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PdfWriter, STANDARD_FONTS } from '../../src/pdf-core/pdf-writer.js';
import { ContentStream } from '../../src/pdf-core/content-stream.js';
import { ByteWriter, stringToBytes } from '../../src/shared/binary.js';
import { PdfDict, PdfName, PdfRef, PdfString, PdfStream } from '../../src/shared/pdf-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(__dirname, { recursive: true });

// 1. Basic 1.4 PDF with multiple pages and metadata
const writer1 = new PdfWriter();
writer1.setMetadata({
  Title: 'Basic 1.4 Fixture',
  Author: ' राहुल दाधीच (Unicode Author)',
  Producer: 'pdf-toolkit-fixture-generator'
});
const f1 = writer1.useStandardFont(STANDARD_FONTS.Helvetica);
for (let i = 1; i <= 3; i++) {
  const cs = new ContentStream();
  cs.beginText();
  cs.setFont(f1, 12);
  cs.moveText(50, 750);
  cs.showText(`Fixture page ${i} content`);
  cs.endText();
  await writer1.addPage({ content: cs });
}
writeFileSync(join(__dirname, 'basic-1.4.pdf'), writer1.build());

// 2. Hierarchical Page Tree (Intermediate Pages node)
const bw2 = new ByteWriter();
bw2.writeLine('%PDF-1.4');
bw2.writeByte(0x25); bw2.writeByte(0xe2); bw2.writeByte(0xe3); bw2.writeByte(0xcf); bw2.writeByte(0xd3); bw2.writeByte(0x0a);

const off2 = [];
// 1 0: Catalog
off2[1] = bw2.offset;
bw2.writeLine('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
// 2 0: Root Pages
off2[2] = bw2.offset;
bw2.writeLine('2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 2 /MediaBox [ 0 0 612 792 ] >>\nendobj');
// 3 0: Intermediate Pages
off2[3] = bw2.offset;
bw2.writeLine('3 0 obj\n<< /Type /Pages /Parent 2 0 R /Kids [ 4 0 R 5 0 R ] /Count 2 >>\nendobj');
// 4 0: Page 1 (inherits MediaBox from 2 0 R)
off2[4] = bw2.offset;
bw2.writeLine('4 0 obj\n<< /Type /Page /Parent 3 0 R /Contents 6 0 R >>\nendobj');
// 5 0: Page 2 (overrides MediaBox)
off2[5] = bw2.offset;
bw2.writeLine('5 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [ 0 0 400 400 ] /Contents 6 0 R >>\nendobj');
// 6 0: Content stream
off2[6] = bw2.offset;
bw2.writeLine('6 0 obj\n<< /Length 40 >>\nstream\nBT /F1 12 Tf 50 700 Td (Hierarchical) Tj ET\nendstream\nendobj');

const startXref2 = bw2.offset;
bw2.writeLine('xref\n0 7\n0000000000 65535 f ');
for (let i = 1; i <= 6; i++) {
  bw2.writeLine(`${String(off2[i]).padStart(10, '0')} 00000 n `);
}
bw2.writeLine('trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + startXref2 + '\n%%EOF');
writeFileSync(join(__dirname, 'hierarchical-pagetree.pdf'), bw2.toBytes());

// 3. Multiple Content Streams on a single page
const bw3 = new ByteWriter();
bw3.writeLine('%PDF-1.4');
bw3.writeByte(0x25); bw3.writeByte(0xe2); bw3.writeByte(0xe3); bw3.writeByte(0xcf); bw3.writeByte(0xd3); bw3.writeByte(0x0a);
const off3 = [];
off3[1] = bw3.offset;
bw3.writeLine('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
off3[2] = bw3.offset;
bw3.writeLine('2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj');
off3[3] = bw3.offset;
bw3.writeLine('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 595.28 841.89 ] /Contents [ 4 0 R 5 0 R ] >>\nendobj');
off3[4] = bw3.offset;
bw3.writeLine('4 0 obj\n<< /Length 38 >>\nstream\nBT /F1 14 Tf 50 750 Td (Part One) Tj ET\nendstream\nendobj');
off3[5] = bw3.offset;
bw3.writeLine('5 0 obj\n<< /Length 38 >>\nstream\nBT /F1 12 Tf 50 700 Td (Part Two) Tj ET\nendstream\nendobj');
const startXref3 = bw3.offset;
bw3.writeLine('xref\n0 6\n0000000000 65535 f ');
for (let i = 1; i <= 5; i++) {
  bw3.writeLine(`${String(off3[i]).padStart(10, '0')} 00000 n `);
}
bw3.writeLine('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + startXref3 + '\n%%EOF');
writeFileSync(join(__dirname, 'multiple-content-streams.pdf'), bw3.toBytes());

// 4. Signed Document
const bw4 = new ByteWriter();
bw4.writeLine('%PDF-1.4');
bw4.writeByte(0x25); bw4.writeByte(0xe2); bw4.writeByte(0xe3); bw4.writeByte(0xcf); bw4.writeByte(0xd3); bw4.writeByte(0x0a);
const off4 = [];
off4[1] = bw4.offset;
bw4.writeLine('1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Perms << /DocMDP 4 0 R >> /SigFlags 3 >>\nendobj');
off4[2] = bw4.offset;
bw4.writeLine('2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj');
off4[3] = bw4.offset;
bw4.writeLine('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 600 800 ] >>\nendobj');
off4[4] = bw4.offset;
bw4.writeLine('4 0 obj\n<< /Type /Sig /ByteRange [ 0 100 200 100 ] >>\nendobj');
const startXref4 = bw4.offset;
bw4.writeLine('xref\n0 5\n0000000000 65535 f ');
for (let i = 1; i <= 4; i++) {
  bw4.writeLine(`${String(off4[i]).padStart(10, '0')} 00000 n `);
}
bw4.writeLine('trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + startXref4 + '\n%%EOF');
writeFileSync(join(__dirname, 'signed-sample.pdf'), bw4.toBytes());

// 5. Broken Xref Offsets
const bw5 = new ByteWriter();
bw5.writeLine('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
bw5.writeLine('2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n');
bw5.writeLine('xref\n0 3\n0000000000 65535 f \n0000099999 00000 n \n0000099999 00000 n \n');
bw5.writeLine('trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n70\n%%EOF');
writeFileSync(join(__dirname, 'broken-xref.pdf'), bw5.toBytes());

console.log('Fixtures generated successfully.');
