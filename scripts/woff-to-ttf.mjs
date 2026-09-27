// Converts the Courier Prime WOFF files shipped by @fontsource/courier-prime
// into plain TrueType files. jsPDF can only embed TTF, and we want PDFs to
// use the same typeface as the editor. Run with: node scripts/woff-to-ttf.mjs
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@fontsource/courier-prime/files');
const out = resolve(root, 'src/assets/fonts');

function woffToTtf(woff) {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (view.getUint32(0) !== 0x774f4646) throw new Error('not a WOFF file');
  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = view.getUint32(o);
    const offset = view.getUint32(o + 4);
    const compLength = view.getUint32(o + 8);
    const origLength = view.getUint32(o + 12);
    const checksum = view.getUint32(o + 16);
    let data = woff.subarray(offset, offset + compLength);
    if (compLength < origLength) data = inflateSync(data);
    tables.push({ tag, checksum, data });
  }
  let searchRange = 1, entrySelector = 0;
  while (searchRange * 2 <= numTables) { searchRange *= 2; entrySelector++; }
  searchRange *= 16;
  const headerSize = 12 + numTables * 16;
  let size = headerSize;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const ttf = Buffer.alloc(size);
  ttf.writeUInt32BE(flavor, 0);
  ttf.writeUInt16BE(numTables, 4);
  ttf.writeUInt16BE(searchRange, 6);
  ttf.writeUInt16BE(entrySelector, 8);
  ttf.writeUInt16BE(numTables * 16 - searchRange, 10);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    ttf.writeUInt32BE(t.tag, o);
    ttf.writeUInt32BE(t.checksum, o + 4);
    ttf.writeUInt32BE(offset, o + 8);
    ttf.writeUInt32BE(t.data.length, o + 12);
    Buffer.from(t.data).copy(ttf, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return ttf;
}

const variants = {
  'courier-prime-latin-400-normal.woff': 'CourierPrime-Regular.ttf',
  'courier-prime-latin-700-normal.woff': 'CourierPrime-Bold.ttf',
  'courier-prime-latin-400-italic.woff': 'CourierPrime-Italic.ttf',
  'courier-prime-latin-700-italic.woff': 'CourierPrime-BoldItalic.ttf',
};
for (const [from, to] of Object.entries(variants)) {
  writeFileSync(resolve(out, to), woffToTtf(readFileSync(resolve(src, from))));
  console.log(`wrote src/assets/fonts/${to}`);
}
copyFileSync(resolve(root, 'node_modules/@fontsource/courier-prime/LICENSE'), resolve(out, 'OFL.txt'));
