// Chuẩn hóa chiều cao theo quy tắc skill: chữ đáy phẳng ngồi đúng đường chân (y = 0); chữ đỉnh phẳng
// cùng nhóm (hoa, x-height, đầu chữ thường) cao bằng trung vị nhóm. Chữ tròn, nhọn (O C G S o c e s A …)
// được phép vượt dòng nên không đụng. Lệch nhỏ (≤ 8% chiều cao chữ hoa) coi là lỗi tách ảnh và được sửa;
// lệch lớn hơn coi là cố ý (font trang trí) và chỉ báo. Chỉ áp cho nét dò từ ảnh và chữ suy luận: font vẽ sẵn
// (Palatino để chân I E i thấp 29/1000, Calibri thấp 3/1000) là thiết kế cố ý.
import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';

const FLAT_BOTTOM = 'BDEFHIKLPRTXZhiklmnrxz147';   // không có M N: đỉnh nhọn dưới chân được phép vượt dòng
const GROUPS = [
  { name: 'chữ hoa', chars: 'BDEFHIKLNPRTZ', anchor: 'EFHILNTZ' },   // U V W Y J M: serif/đỉnh nhọn được phép cao hơn,
  { name: 'x-height', chars: 'uvwxyz', anchor: 'uvwxyz' },
  { name: 'đầu chữ thường', chars: 'bdhkl', anchor: 'bdhkl' },
];
const median = values => { const v = [...values].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };

export function normalizeHeights(glyphs, editable = glyph => !glyph.locked) {
  const box = char => { const g = glyphs.get(char); if (!g?.d) return null; const b = glyphBounds(g); return b.height > 0 ? b : null; };
  const anchorTops = [...'EFHILNTZ'].map(box).filter(Boolean).map(b => b.y + b.height);
  if (anchorTops.length < 3) return { changed: [], held: [] };
  const capTop = median(anchorTops), small = .01 * capTop, large = .08 * capTop;
  const changed = new Map(), held = [];
  const current = char => changed.get(char) ?? glyphs.get(char);
  // Đường chân theo chính font (trung vị đáy nhóm đáy phẳng): font chuẩn có thể để chân thấp hơn 0 vài đơn vị.
  const bottoms = [...FLAT_BOTTOM].map(box).filter(Boolean).map(b => b.y), baseline = bottoms.length >= 3 ? median(bottoms) : 0;
  for (const char of FLAT_BOTTOM) {
    const g = current(char), b = box(char);
    if (!b || !editable(g)) continue;
    const dev = b.y - baseline;
    if (Math.abs(dev) <= small) continue;
    if (Math.abs(dev) > large) { held.push(char + ' (chân lệch ' + Math.round(dev) + ')'); continue; }
    changed.set(char, { ...g, d: svgpath(g.d).translate(0, -dev).round(1).toString(), heightFix: { baseline: -dev } });
  }
  for (const { chars, anchor } of GROUPS) {
    const tops = [...anchor].map(char => current(char)).filter(g => g?.d).map(g => { const b = glyphBounds(g); return b.y + b.height; });
    if (tops.length < 3) continue;
    const target = median(tops);
    for (const char of chars) {
      const g = current(char);
      if (!g?.d || !editable(g)) continue;
      const b = glyphBounds(g), top = b.y + b.height, dev = top - target;
      if (Math.abs(dev) <= .015 * capTop) continue;
      if (Math.abs(dev) > .05 * capTop) { held.push(char + ' (đỉnh lệch ' + Math.round(dev) + ')'); continue; }
      // Kéo đỉnh về chuẩn, giữ chân (co giãn dọc quanh đáy chữ; nét ngang đổi ≤ 8%).
      const base = Math.max(0, b.y), k = (target - base) / (top - base);
      changed.set(char, { ...g, d: svgpath(g.d).translate(0, -base).scale(1, k).translate(0, base).round(1).toString(),
        heightFix: { ...(g.heightFix || {}), scale: k } });
    }
  }
  return { changed: [...changed.values()], held };
}

// Cỡ dấu câu theo nét thân (đo 21 font chuẩn, bỏ font đơn cách): dấu chấm rộng 1,0–1,5 nét thân (trung vị 1,2),
// dấu phẩy cao 2,1–3,5 nét thân. Dấu chấm lệch khoảng → mọi dấu câu dựng từ chấm (. , : ; ' " ‘ ’ “ ” và chấm của ! ?)
// co/giãn cùng một tỉ lệ để giữ tương quan; từng contour co quanh chân (nếu chạm đường chân) hoặc quanh tâm.
const DOT_PUNCTUATION = ".,:;'\"‘’“”";
export function normalizePunctuation(glyphs, stem, editable = glyph => !glyph.locked) {
  const capGlyph = ['H', 'E', 'I'].map(c => glyphs.get(c)).find(g => g?.d), capTop = capGlyph ? glyphBounds(capGlyph).y + glyphBounds(capGlyph).height : 0;
  const period = glyphs.get('.'), comma = glyphs.get(',');
  if (!(stem > 0) || !(period?.d || comma?.d)) return { changed: [], factor: 1 };
  let factor = 1;
  if (period?.d) { const w = glyphBounds(period).width; if (w > 1.5 * stem || w < stem) factor = 1.2 * stem / w; }
  else { const h = glyphBounds(comma).height; if (h > 3.5 * stem || h < 2.1 * stem) factor = 2.9 * stem / h; }
  if (Math.abs(factor - 1) < .03) return { changed: [], factor: 1 };
  const parts = d => svgpath(d).abs().toString().split(/(?=M)/).filter(part => part.trim());
  const scalePart = (part, anchorTop) => {
    const b = glyphBounds({ d: part }), cx = b.x + b.width / 2;
    const cy = anchorTop ? b.y + b.height : b.y <= stem * .5 && b.y + b.height >= 0 ? Math.max(b.y, 0) : b.y + b.height / 2;
    return svgpath(part).translate(-cx, -cy).scale(factor).translate(cx, cy).round(1).toString();
  };
  const changed = [];
  for (const char of [...DOT_PUNCTUATION, '!', '?']) {
    const g = glyphs.get(char);
    if (!g?.d || !editable(g)) continue;
    const quote = "'\"‘’“”".includes(char), dotOnly = char === '!' || char === '?';
    const list = parts(g.d);
    let d = list.map(part => {
      if (!dotOnly) return scalePart(part, quote);
      const b = glyphBounds({ d: part });   // ! ?: co chấm (contour nhỏ ngồi ở chân) cùng tỉ lệ dấu chấm
      return b.y <= stem && b.height < 2.2 * stem && b.width < 2.2 * stem ? scalePart(part, false) : part;
    }).join(' ');
    // ! ? cao quá chữ hoa > 8%: co cả ký tự quanh chân về chiều cao chữ hoa.
    const tall = glyphBounds({ d });
    if (dotOnly && capTop && tall.y + tall.height > 1.08 * capTop) d = svgpath(d).scale(capTop / (tall.y + tall.height)).round(1).toString();
    if (d === g.d) continue;
    const before = glyphBounds(g), after = glyphBounds({ d }), shift = before.x - after.x;
    changed.push({ ...g, d: svgpath(d).translate(shift, 0).round(1).toString(),
      advance: Math.max(1, Math.round(g.advance + (after.width - before.width))), punctuationFix: factor });
  }
  return { changed, factor };
}

// Dấu nặng theo dấu chấm (chuẩn đo 20 font: cạnh lớn nhất của nặng = 0,88 [0,67–1,0] dấu chấm; không font nào
// dùng nặng to hơn chấm). Tìm chấm nặng (contour nhỏ nằm dưới đường chân) ở mọi chữ có dấu nặng, kể cả chữ
// theo ảnh; ngoài khoảng thì co/giãn tại chỗ quanh đỉnh chấm (giữ khoảng hở với thân) về 0,88 dấu chấm.
export function normalizeDotBelow(glyphs, stem, editable = glyph => !glyph.locked) {
  const period = glyphs.get('.');
  if (!period?.d || !(stem > 0)) return { changed: [] };
  const pb = glyphBounds(period), periodSize = Math.max(pb.width, pb.height), target = .88 * periodSize;
  const changed = [];
  for (const [char, g] of glyphs) {
    if (!g?.d || !editable(g) || !char.normalize('NFD').includes('̣')) continue;
    const parts = svgpath(g.d).abs().toString().split(/(?=M)/).filter(part => part.trim());
    let done = false, sizes = [];
    const d = parts.map(part => {
      const b = glyphBounds({ d: part });
      // chấm nặng: nằm hẳn dưới đường chân, cỡ không quá 2,5 nét thân hay 1,6 dấu chấm
      if (done || !(b.y + b.height <= stem * .25) || Math.max(b.width, b.height) > Math.max(2.5 * stem, 1.6 * periodSize)) return part;
      const size = Math.max(b.width, b.height), ratio = size / periodSize;
      done = true; sizes.push(+ratio.toFixed(2));
      if (ratio >= .67 && ratio <= 1) return part;
      const k = target / size, cx = b.x + b.width / 2, top = b.y + b.height;
      return svgpath(part).translate(-cx, -top).scale(k).translate(cx, top).round(1).toString();
    }).join(' ');
    if (done && d !== svgpath(g.d).abs().toString().split(/(?=M)/).filter(p => p.trim()).join(' ')) changed.push({ ...g, d, dotBelowFix: sizes[0] });
  }
  return { changed };
}
