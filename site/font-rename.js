// Đổi tên bên trong file TTF/OTF (bảng 'name'): tên family, tên đầy đủ, tên PostScript, mã duy nhất.
// Chỉ viết lại bảng 'name' và các checksum; mọi bảng khác (outline, kerning, GPOS...) giữ nguyên từng byte.

const read = (view, offset, size) => size === 2 ? view.getUint16(offset) : view.getUint32(offset);

function decode(bytes, platform) {
  if (platform === 0 || platform === 3) {
    let text = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return text;
  }
  return String.fromCharCode(...bytes);
}
function encode(text, platform) {
  if (platform === 0 || platform === 3) {
    const out = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); out[2 * i] = c >> 8; out[2 * i + 1] = c & 255; }
    return out;
  }
  // Macintosh Roman: giữ ký tự ASCII, ký tự khác thay bằng '-'.
  return Uint8Array.from(text, c => c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 45);
}
function checksum(bytes) {
  const padded = new Uint8Array((bytes.length + 3) & ~3); padded.set(bytes);
  const view = new DataView(padded.buffer);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}

function parse(buffer) {
  const view = new DataView(buffer), count = read(view, 4, 2), tables = [];
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i;
    const tag = String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
    tables.push({ tag, offset: read(view, at + 8, 4), length: read(view, at + 12, 4) });
  }
  return { view, tables, version: read(view, 0, 4) };
}

// Đọc các tên chính: { family, style, typoFamily, typoStyle, full, postscript }.
export function readFontNames(buffer) {
  const { view, tables } = parse(buffer), table = tables.find(t => t.tag === 'name');
  if (!table) return {};
  const base = table.offset, count = read(view, base + 2, 2), strings = base + read(view, base + 4, 2), names = {};
  for (let i = 0; i < count; i++) {
    const at = base + 6 + 12 * i, platform = read(view, at, 2), language = read(view, at + 4, 2), id = read(view, at + 6, 2);
    const length = read(view, at + 8, 2), offset = read(view, at + 10, 2);
    const text = decode(new Uint8Array(buffer, strings + offset, length), platform);
    const english = platform === 3 ? language === 0x409 : platform === 1 ? language === 0 : true;
    if (english && !(id in names && platform !== 3)) names[id] = text;
  }
  return { family: names[1], style: names[2], unique: names[3], full: names[4], postscript: names[6], typoFamily: names[16], typoStyle: names[17] };
}

// Đặt tên family mới (giữ nguyên tên kiểu: Thin Italic, Bold...). Trả về ArrayBuffer font mới.
export function renameFontFamily(buffer, newFamily) {
  const { view, tables, version } = parse(buffer), nameTable = tables.find(t => t.tag === 'name');
  if (!nameTable) throw new Error('Font không có bảng tên.');
  const current = readFontNames(buffer);
  const style = current.typoStyle || current.style || 'Regular';
  const legacyStyle = current.style || 'Regular';
  const legacyFamily = current.typoFamily && current.family && current.family.startsWith(current.typoFamily)
    ? newFamily + current.family.slice(current.typoFamily.length) : newFamily;
  const full = style === 'Regular' ? newFamily : newFamily + ' ' + style;
  const postscript = (newFamily.replace(/[^A-Za-z0-9]/g, '') + '-' + style.replace(/[^A-Za-z0-9]/g, '')).slice(0, 63);
  const replacement = { 1: legacyFamily, 3: postscript + ';XuongFont', 4: full, 6: postscript, 16: newFamily };
  void legacyStyle;
  // Viết lại bảng name (format 0) với chuỗi mới cho ID 1, 3, 4, 6, 16; các bản ghi khác giữ nguyên chuỗi.
  const base = nameTable.offset, count = read(view, base + 2, 2), strings = base + read(view, base + 4, 2);
  const records = [];
  for (let i = 0; i < count; i++) {
    const at = base + 6 + 12 * i, platform = read(view, at, 2), encoding = read(view, at + 2, 2), language = read(view, at + 4, 2), id = read(view, at + 6, 2);
    const length = read(view, at + 8, 2), offset = read(view, at + 10, 2);
    const bytes = id in replacement ? encode(replacement[id], platform) : new Uint8Array(buffer, strings + offset, length).slice();
    records.push({ platform, encoding, language, id, bytes });
  }
  // Font chưa có ID 16 mà family gốc khác: thêm bản ghi Windows tiếng Anh cho ID 16.
  if (!records.some(r => r.id === 16) && legacyFamily !== newFamily) records.push({ platform: 3, encoding: 1, language: 0x409, id: 16, bytes: encode(newFamily, 3) });
  records.sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.id - b.id);
  const storage = records.reduce((n, r) => n + r.bytes.length, 0), headerSize = 6 + 12 * records.length;
  const name = new Uint8Array(headerSize + storage), nv = new DataView(name.buffer);
  nv.setUint16(0, 0); nv.setUint16(2, records.length); nv.setUint16(4, headerSize);
  let cursor = 0;
  records.forEach((r, i) => {
    const at = 6 + 12 * i;
    nv.setUint16(at, r.platform); nv.setUint16(at + 2, r.encoding); nv.setUint16(at + 4, r.language); nv.setUint16(at + 6, r.id);
    nv.setUint16(at + 8, r.bytes.length); nv.setUint16(at + 10, cursor);
    name.set(r.bytes, headerSize + cursor); cursor += r.bytes.length;
  });
  // Dựng lại file: thư mục bảng + các bảng căn 4 byte, checksum từng bảng, rồi head.checkSumAdjustment.
  const data = tables.map(t => ({ tag: t.tag, bytes: t.tag === 'name' ? name : new Uint8Array(buffer, t.offset, t.length).slice() }));
  const head = data.find(t => t.tag === 'head');
  if (head) new DataView(head.bytes.buffer).setUint32(8, 0);
  const numTables = data.length, dirSize = 12 + 16 * numTables;
  let size = dirSize; for (const t of data) size += (t.bytes.length + 3) & ~3;
  const out = new Uint8Array(size), ov = new DataView(out.buffer);
  ov.setUint32(0, version); ov.setUint16(4, numTables);
  const entrySelector = Math.floor(Math.log2(numTables)), searchRange = 16 * 2 ** entrySelector;
  ov.setUint16(6, searchRange); ov.setUint16(8, entrySelector); ov.setUint16(10, numTables * 16 - searchRange);
  let offset = dirSize;
  data.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0).forEach((t, i) => {
    const at = 12 + 16 * i;
    for (let k = 0; k < 4; k++) ov.setUint8(at + k, t.tag.charCodeAt(k));
    ov.setUint32(at + 4, checksum(t.bytes)); ov.setUint32(at + 8, offset); ov.setUint32(at + 12, t.bytes.length);
    out.set(t.bytes, offset); t.offset = offset; offset += (t.bytes.length + 3) & ~3;
  });
  if (head) ov.setUint32(head.offset + 8, (0xB1B0AFBA - checksum(out)) >>> 0);
  return out.buffer;
}

// Tên mới cho mục trong bộ sưu tập và family bên trong font: "XFVN - Poppins-ThinItalic", family "XFVN - Poppins".
export function prefixedNames(label, names, prefix) {
  const clean = label.replace(/\s*Việt hóa\s*$/i, '').trim();
  // Font Xưởng lưu có thể mang family kiểu "Poppins-ThinItalic Việt hóa": bỏ hậu tố Việt hóa và tên kiểu dính sau dấu gạch.
  let family = (names.typoFamily || names.family || clean).replace(/\s*Việt hóa\s*$/i, '').trim();
  const style = (names.typoStyle || names.style || '').trim(), styleKey = style.replace(/\s+/g, '');
  for (const tail of [styleKey && '-' + styleKey, style && ' ' + style, '-Regular', ' Regular'].filter(Boolean)) {
    if (family.length > tail.length && family.toLowerCase().endsWith(tail.toLowerCase())) { family = family.slice(0, -tail.length).trim(); break; }
  }
  family = family.replace(/-(?:Hairline|Thin|ExtraLight|UltraLight|Light|Regular|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy)?(?:Italic|Oblique)?$/i, m => m.length > 1 ? '' : m).trim() || family;
  return {
    label: clean.startsWith(prefix) ? clean : prefix + clean,
    family: family.startsWith(prefix) ? family : prefix + family,
  };
}

// Mọi font Xưởng xuất ra (lưu, tải, family tự sinh) mang tiền tố này ở tên bộ sưu tập và tên trong file,
// để không trùng tên với font gốc khi cài. Font gốc người dùng nhập vào không đổi.
export const XUONG_PREFIX = 'XFVN - ';
const toArrayBuffer = data => data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
export function xuongFontFile(input, label) {
  const buffer = toArrayBuffer(input);
  const names = prefixedNames(label, readFontNames(buffer), XUONG_PREFIX);
  const current = readFontNames(buffer);
  const family = current.typoFamily || current.family || '';
  const renamed = family === names.family ? buffer : renameFontFamily(buffer, names.family);
  return { buffer: renamed, label: names.label, family: names.family };
}
export async function withXuongPrefix(record) {
  const original = await record.blob.arrayBuffer(), result = xuongFontFile(original, record.name);
  if (result.label === record.name && result.buffer === original) return record;
  const extension = record.filename?.match(/\.(ttf|otf)$/i)?.[0] || '.ttf';
  return { ...record, ...(record.family ? { family: result.family } : {}), name: result.label,
    filename: result.label.replace(/[<>:"/\|?*]/g, '-') + extension, blob: new Blob([result.buffer], { type: record.blob.type || 'font/ttf' }) };
}
