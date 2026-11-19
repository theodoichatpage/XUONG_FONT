'use strict';
function sum(view, offset, length) {
  let total = 0;
  for (let i = 0; i < length; i += 4) {
    let value = 0;
    for (let j = 0; j < 4; j++) value = (value * 256 + (i + j < length ? view.getUint8(offset + i + j) : 0)) >>> 0;
    total = (total + value) >>> 0;
  }
  return total;
}
function applyStyleMetadata(input, { weight = 400, italic = false, angle = 12 } = {}) {
  const bytes = new Uint8Array(input), view = new DataView(bytes.buffer);
  const tables = new Map();
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + 16 * i;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    tables.set(tag, { record, offset: view.getUint32(record + 8), length: view.getUint32(record + 12) });
  }
  const os2 = tables.get('OS/2'), head = tables.get('head'), post = tables.get('post'), hhea = tables.get('hhea');
  if (os2) {
    view.setUint16(os2.offset + 4, weight);
    const old = view.getUint16(os2.offset + 62);
    view.setUint16(os2.offset + 62, (old & ~((1<<0)|(1<<5)|(1<<6)|(1<<9))) | (italic ? 1 : 0) | (weight >= 700 ? 32 : 0) | (!italic && weight === 400 ? 64 : 0));
  }
  if (head) { view.setUint16(head.offset + 44, (weight >= 700 ? 1 : 0) | (italic ? 2 : 0)); view.setUint32(head.offset + 8, 0); }
  if (post) view.setInt32(post.offset + 4, Math.round((italic ? -angle : 0) * 65536));
  if (hhea) { view.setInt16(hhea.offset + 18, 1000); view.setInt16(hhea.offset + 20, italic ? Math.round(Math.tan(angle * Math.PI / 180) * 1000) : 0); }
  for (const table of tables.values()) view.setUint32(table.record + 4, sum(view, table.offset, table.length));
  if (head) view.setUint32(head.offset + 8, (0xb1b0afba - sum(view, 0, bytes.length)) >>> 0);
  return bytes;
}
module.exports = { applyStyleMetadata };
