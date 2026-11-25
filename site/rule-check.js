// Bảng quy tắc duy nhất của Xưởng, mỗi quy tắc ghi mục skill nó lấy từ. Đo trên chính bộ chữ đang làm (thông số của
// font gốc: chấm chữ i, nét thân, đường chân, chiều cao chữ hoa), không so với font khác. Chạy sau mọi thao tác dựng
// (tách ảnh, tách tay, nhận chữ từ dự án Family, Hoàn thiện, Tạo dấu tiếng Việt) và trong bài kiểm tự động
// `npm run check:rules` trên font thật của người dùng.
import ClipperLib from 'clipper-lib';
import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';
import { measureStem, charset, rightEdgeAt } from './vietnamese.js';
import { normalizeHeights, normalizePunctuation, normalizeDotBelow } from './font-heights.js';
import { placePunctuation } from './punctuation-rules.js';
import { outlineDefects } from './outline-quality.js';
import { auditMarks } from './rule-audit.js';
import { toPolygons } from './borrow-glyphs.js';

const SKILL = 'skills/design-vietnamese-fonts/';
const parts = d => svgpath(d).abs().toString().split(/(?=M)/).filter(p => p.trim()).map(d => ({ d, b: glyphBounds({ d }) }));
const capTopOf = map => { for (const c of ['H', 'I', 'E', 'T', 'L']) { const g = map.get(c); if (g?.d) { const b = glyphBounds(g); return b.y + b.height; } } return 0; };
// Chấm chữ i: contour nhỏ trên cùng của i (xuong-font-workflow.md 1b).
export function iDotWidth(map) {
  const i = map.get('i');
  if (!i?.d) return 0;
  const list = parts(i.d).sort((a, b) => b.b.y - a.b.y), full = glyphBounds(i);
  return list.length >= 2 && list[0].b.height < full.height * .35 ? list[0].b.width : 0;
}
const near = (value, target, tolerance) => target > 0 && Math.abs(value / target - 1) <= tolerance;

// Râu do Xưởng ghép (ơ ư Ơ Ư): phần râu là các contour không có trong chữ gốc. Chân râu phải nằm ở mép phải xa nhất của
// vùng trên chữ gốc (một phần năm trên, như chỗ Xưởng nối râu), cắm vào nét không quá 0.6 nét thân. Trả về độ lùi vào trong nếu vượt, 0 nếu đạt.
export function hornFootOffset(glyph, map, stem) {
  if (glyph?.source !== 'Ghép dấu' || !stem) return 0;
  const [root] = glyph.char.normalize('NFD'), base = map.get(root);
  if (!base?.d || !'oOuU'.includes(root)) return 0;
  const key = b => [b.x, b.y, b.width, b.height].map(v => Math.round(v)).join(',');
  const own = new Set(parts(base.d).map(p => key(p.b))), box = glyphBounds(base), top = box.y + box.height;
  const extra = parts(glyph.d).filter(p => !own.has(key(p.b)) && p.b.y + p.b.height > top && p.b.x > box.x + box.width / 2);
  if (!extra.length) return 0;
  const hornLeft = Math.min(...extra.map(p => p.b.x));
  let edge = -Infinity;
  for (let n = 0; n <= 12; n++) { const x = rightEdgeAt(base.d, top - 2 - box.height * .2 * n / 12); if (x !== null) edge = Math.max(edge, x); }
  const offset = edge - hornLeft;
  return Number.isFinite(offset) && offset > .6 * stem ? offset : 0;
}

// Mỗi quy tắc: id, mô tả ngắn, mục skill, hàm đo trả về danh sách chữ lệch kèm số đo.
export const RULES = [
  { id: 'dot-i', text: 'Dấu chấm rộng bằng chấm chữ i của font', skill: 'references/xuong-font-workflow.md 1b',
    check(map, ctx) {
      const p = map.get('.');
      if (!p?.d || !ctx.dot) return null;
      const w = glyphBounds(p).width;
      return near(w, ctx.dot, .15) ? [] : [{ char: '.', measure: Math.round(w), target: Math.round(ctx.dot) }];
    } },
  { id: 'colon-dots', text: 'Chấm của : ; ! ? bằng dấu chấm', skill: 'references/xuong-font-workflow.md 1b',
    check(map, ctx) {
      if (!ctx.period) return null;
      const out = [];
      for (const char of ':;!?') {
        const g = map.get(char);
        if (!g?.d) continue;
        for (const { b } of parts(g.d)) {
          if (char === ';' && b.y < -.1 * ctx.period) continue;   // phần phẩy dưới của ; không phải chấm
          const size = Math.max(b.width, b.height), aspect = b.height / (b.width || 1);
          if (size < 2 * ctx.period && aspect > .6 && aspect < 1.7 && !near(size, ctx.period, .1)) { out.push({ char, measure: Math.round(size), target: Math.round(ctx.period) }); break; }
        }
      }
      return out;
    } },
  { id: 'dot-below', text: 'Dấu nặng bằng dấu chấm', skill: 'references/xuong-font-workflow.md 1c',
    check(map, ctx) {
      if (!ctx.period) return null;
      const out = [];
      for (const [char, g] of map) {
        if (!g?.d || !char.normalize('NFD').includes('̣')) continue;
        const dot = parts(g.d).filter(({ b }) => b.y + b.height <= ctx.stem * .25 && Math.max(b.width, b.height) < 1.6 * ctx.period).sort((a, b) => a.b.y - b.b.y)[0];
        if (dot && !near(Math.max(dot.b.width, dot.b.height), ctx.period, .1)) out.push({ char, measure: Math.round(Math.max(dot.b.width, dot.b.height)), target: Math.round(ctx.period) });
      }
      return out;
    } },
  { id: 'punct-place', text: 'Dấu câu đúng chỗ: . , : ; ! ? ngồi trên đường chân, ngoặc kép đỉnh ngang chữ hoa', skill: 'references/xuong-font-workflow.md 1b',
    check(map, ctx) {
      if (!ctx.capTop) return null;
      const out = [], tol = .05 * ctx.capTop;
      for (const char of '.:!?') { const g = map.get(char); if (g?.d) { const b = glyphBounds(g); if (Math.abs(b.y) > tol) out.push({ char, measure: Math.round(b.y), target: 0 }); } }
      for (const char of ',;') {
        const g = map.get(char); if (!g?.d) continue;
        const low = parts(g.d).sort((a, b) => a.b.y - b.b.y)[0]?.b;
        if (low && !(low.y < 0 && low.y + low.height > 0)) out.push({ char, measure: Math.round(low.y + low.height), target: 'trên đường chân' });
      }
      for (const char of '“”‘’"\'') { const g = map.get(char); if (g?.d) { const b = glyphBounds(g), top = b.y + b.height; if (Math.abs(top - ctx.capTop) > 2 * tol) out.push({ char, measure: Math.round(top), target: Math.round(ctx.capTop) }); } }
      return out;
    } },
  { id: 'heights', text: 'Chân phẳng đúng đường chân, đỉnh phẳng cùng nhóm bằng nhau', skill: 'references/xuong-font-workflow.md 1',
    check(map, ctx) {
      const { changed } = normalizeHeights(map, ctx.editable);
      return changed.map(g => ({ char: g.char, measure: g.heightFix?.baseline ? 'chân ' + Math.round(-g.heightFix.baseline) : 'đỉnh ×' + (g.heightFix?.scale || 1).toFixed(2), target: 'nhóm' }));
    } },
  { id: 'horn', text: 'Râu ơ ư nối liền thân ở vùng trên bên phải, không rời', skill: 'references/design-rules.md (Phân loại dấu: râu là phần nối vào thân; Râu: nối ở vùng trên bên phải o/u)',
    check(map, ctx) {
      const out = [];
      for (const [char, g] of map) {
        if (!g?.d || !char.normalize('NFD').includes('̛')) continue;
        const marks = [...char.normalize('NFD')].filter(m => m !== '̛').length - 1;
        try {
          const solids = ClipperLib.Clipper.SimplifyPolygons(toPolygons(g.d), ClipperLib.PolyFillType.pftNonZero)
            .filter(p => ClipperLib.Clipper.Orientation(p) && Math.abs(ClipperLib.Clipper.Area(p)) > 36 * 256);
          if (solids.length > 1 + Math.max(0, marks)) { out.push({ char, measure: solids.length + ' mảng', target: (1 + Math.max(0, marks)) + ' mảng' }); continue; }
        } catch { /* không đo được: bỏ qua */ }
        // Râu Xưởng ghép: chân râu mọc từ mép phải xa nhất ở vùng trên của o/u (đầu chân serif của U, vai phải của o),
        // không mọc từ giữa nét rồi vắt ngang qua chân serif (lỗi cũ ở Ư của font có chân).
        const misplaced = hornFootOffset(g, map, ctx.stem);
        if (misplaced) out.push({ char, measure: 'chân râu lùi ' + Math.round(misplaced) + ' vào trong', target: '≤ ' + Math.round(.6 * ctx.stem) });
      }
      return out;
    } },
  { id: 'outline', text: 'Viền không xù, đường cong không gấp khúc', skill: 'references/xuong-font-workflow.md 2',
    check(map, ctx) {
      const out = [];
      for (const [char, g] of map) { if (!g?.d || !ctx.editable(g)) continue; const q = outlineDefects(g.d); if (q.total) out.push({ char, measure: q.total + ' lỗi', target: 0 }); }
      return out;
    } },
  { id: 'marks', text: 'Dấu Xưởng ghép theo chuẩn đo dấu', skill: 'references/mark-standards.md',
    check(map) {
      const audit = auditMarks(map);
      if (!audit?.checked) return null;
      return audit.issues.map(issue => ({ char: issue.char, measure: issue.text, target: 'chuẩn' }));
    } },
  { id: 'coverage', text: 'Đủ bộ ký tự', skill: 'references/checking-coverage.md',
    check(map) { return charset.filter(char => !map.get(char)?.d).map(char => ({ char, measure: 'thiếu', target: 'có' })); } },
];

// Đối chiếu toàn bộ bảng quy tắc. editable: chữ được phép sửa (nét dò ảnh, chữ suy luận, font người dùng tự dựng).
export function checkRules(map, { editable = glyph => glyph?.source !== 'Font gốc' } = {}) {
  let stem = 0; try { stem = measureStem(map) || 0; } catch { /* chưa đo được */ }
  const period = map.get('.')?.d ? (b => Math.max(b.width, b.height))(glyphBounds(map.get('.'))) : 0;
  const ctx = { stem, dot: iDotWidth(map) || stem, period, capTop: capTopOf(map), editable };
  const rows = RULES.map(rule => {
    let issues = null;
    try { issues = rule.check(map, ctx); } catch { issues = null; }
    return { id: rule.id, text: rule.text, skill: SKILL + rule.skill, status: issues === null ? 'skip' : issues.length ? 'fail' : 'pass', issues: issues || [] };
  });
  return { rows, passed: rows.filter(r => r.status === 'pass').length, checked: rows.filter(r => r.status !== 'skip').length };
}

export function ruleMessage(result, { only } = {}) {
  if (!result) return '';
  const rows = result.rows.filter(r => r.status === 'fail' && (!only || only.includes(r.id)));
  return ' Đối chiếu quy tắc skill: đạt ' + result.passed + '/' + result.checked + ' quy tắc.'
    + (rows.length ? ' LỆCH: ' + rows.map(r => r.text + ' (' + r.issues.slice(0, 8).map(i => i.char).join(' ') + (r.issues.length > 8 ? ' …' : '') + ')').join('; ') + '.' : '');
}

// Sửa theo bảng quy tắc những gì sửa được an toàn (chỉ dời, co dọc ít, co/giãn dấu câu và chấm nặng; không vẽ lại hình):
// chiều cao, cỡ và vị trí dấu câu, dấu nặng. chars: giới hạn ở các chữ vừa dựng (sau một lần tách ảnh).
export function fixRules(map, { editable = glyph => glyph?.source !== 'Font gốc' && !glyph?.locked && !glyph?.approved, chars } = {}) {
  const next = new Map(map), changed = new Set();
  const allowed = glyph => glyph && editable(glyph) && (!chars || chars.has(glyph.char));
  const put = glyph => { if (glyph && next.get(glyph.char) !== glyph) { next.set(glyph.char, glyph); changed.add(glyph.char); } };
  for (const glyph of normalizeHeights(next, allowed).changed) put(glyph);
  let stem = 0; try { stem = measureStem(next) || 0; } catch { /* chưa đo được */ }
  for (const glyph of normalizePunctuation(next, stem, allowed).changed) put(glyph);
  for (const [char, glyph] of next) if (allowed(glyph) && ".,:;!?“”‘’'\"".includes(char)) { const placed = placePunctuation(glyph, next); if (placed !== glyph && !placed.punctuationRejected) put(placed); }
  for (const glyph of normalizeDotBelow(next, stem, allowed).changed) put(glyph);
  return { map: next, changed: [...changed] };
}
