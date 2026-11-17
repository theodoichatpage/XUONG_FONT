'use strict';

function checksum(view, offset, length) {
  let sum = 0;
  for (let i = 0; i < length; i += 4) sum = (sum + view.getUint32(offset + i)) >>> 0;
  return sum;
}

function putSearchHeader(view, offset, count, recordSize) {
  const exponent = Math.floor(Math.log2(count));
  const range = 2 ** exponent * recordSize;
  view.setUint16(offset, count);
  view.setUint16(offset + 2, range);
  view.setUint16(offset + 4, exponent);
  view.setUint16(offset + 6, count * recordSize - range);
}

function readGlyphIds(source, tableCount) {
  for (let index = 0; index < tableCount; index++) {
    const record = 12 + index * 16;
    if (source.getUint32(record) !== 0x636d6170) continue;
    const cmap = source.getUint32(record + 8);
    for (let sub = 0; sub < source.getUint16(cmap + 2); sub++) {
      const offset = cmap + source.getUint32(cmap + 8 + sub * 8);
      if (source.getUint16(offset) !== 12) continue;
      const groups = source.getUint32(offset + 12);
      const ids = new Map();
      for (let i = 0; i < groups; i++) {
        const group = offset + 16 + 12 * i;
        const start = source.getUint32(group);
        const end = source.getUint32(group + 4);
        const firstGlyph = source.getUint32(group + 8);
        for (let point = start; point <= end; point++) ids.set(point, firstGlyph + point - start);
      }
      return ids;
    }
  }
  return new Map();
}

function addKerning(bytes, charPairs) {
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = source.getUint16(4);
  const ids = readGlyphIds(source, count);
  const pairs = charPairs.map(([left, right, value]) => [ids.get(left.codePointAt(0)), ids.get(right.codePointAt(0)), value])
    .filter(([left, right]) => left && right);
  if (!pairs.length) return bytes;
  const kernLength = 18 + 6 * pairs.length;
  const oldSize = Math.ceil(bytes.length / 4) * 4;
  const kernOffset = oldSize + 16;
  const output = new Uint8Array(kernOffset + Math.ceil(kernLength / 4) * 4);
  const view = new DataView(output.buffer);
  output.set(bytes.subarray(0, 12), 0);
  output.set(bytes.subarray(12 + 16 * count), 12 + 16 * (count + 1));
  putSearchHeader(view, 4, count + 1, 16);
  const kernTag = 0x6b65726e;
  const records = [];
  let head;
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const tag = source.getUint32(record);
    const offset = source.getUint32(record + 8) + 16;
    records.push([tag, source.getUint32(record + 4), offset, source.getUint32(record + 12)]);
    if (tag === 0x68656164) head = offset;
  }
  view.setUint16(kernOffset + 2, 1); // One horizontal format-0 subtable.
  view.setUint16(kernOffset + 6, kernLength - 4);
  view.setUint16(kernOffset + 8, 1);
  putSearchHeader(view, kernOffset + 10, pairs.length, 6);
  pairs.sort(([leftA, rightA], [leftB, rightB]) => leftA - leftB || rightA - rightB);
  for (const [index, [left, right, value]] of pairs.entries()) {
    const offset = kernOffset + 18 + index * 6;
    view.setUint16(offset, left);
    view.setUint16(offset + 2, right);
    view.setInt16(offset + 4, value);
  }
  records.push([kernTag, checksum(view, kernOffset, kernLength), kernOffset, kernLength]);
  records.sort(([a], [b]) => a - b);
  for (const [i, fields] of records.entries()) {
    fields.forEach((value, j) => view.setUint32(12 + i * 16 + j * 4, value));
  }
  view.setUint32(head + 8, 0);
  view.setUint32(head + 8, (0xb1b0afba - checksum(view, 0, output.length)) >>> 0);
  return output;
}

module.exports = { addKerning };
