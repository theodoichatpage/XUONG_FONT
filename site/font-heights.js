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
