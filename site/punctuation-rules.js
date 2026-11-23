// Quy tắc dấu câu tách từ ảnh (xuong-font-workflow.md 1b): cỡ đầu chấm = chấm chữ i của font, vị trí theo đường chân
// và chiều cao chữ hoa của chính font. Dùng chung cho trình sửa (app.js) và bảng quy tắc (rule-check.js).
import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';
import { measureStem, punctuation } from './vietnamese.js';
import { sampleOutline } from './outline-cleanup.js';

const PUNCT_RULE = { base: '.,:;!?', top: '"\'“”‘’' };
function punctuationMetrics(map) {
  const top = chars => { for (const c of chars) { const g = map.get(c); if (g?.d) { const b = glyphBounds(g); return b.y + b.height; } } };
  return { capTop: top(['H', 'I', 'E', 'T', 'L']) ?? 700, xTop: top(['x', 'z', 'v', 'n', 'u']) ?? 500 };
}
// Đối chiếu cỡ theo skill (xuong-font-workflow.md 1b, thông số của chính font): đầu chấm của . , : ; bằng chấm chữ i
// (không có chấm i thì bằng nét thân). Lệch quá 15% thì co/giãn cả ký tự về đúng mốc, giữ tỉ lệ đầu/đuôi như ảnh.
export function punctuationDot(map) {
  const i = map.get('i');
  if (i?.d) {
    const parts = svgpath(i.d).abs().toString().split(/(?=M)/).filter(x => x.trim()).map(d => glyphBounds({ d })).sort((a, b) => b.y - a.y);
    if (parts.length >= 2 && parts[0].height < glyphBounds(i).height * .35) return parts[0].width;
  }
  try { return measureStem(map) || 0; } catch { return 0; }
}
function headWidth(glyph) {
  // Bề ngang phần đầu chấm: phần trên cùng (45% chiều cao) của contour thấp nhất (dấu phẩy, chấm dưới của : ;).
  const parts = svgpath(glyph.d).abs().toString().split(/(?=M)/).filter(x => x.trim()).map(d => ({ d, b: glyphBounds({ d }) })).sort((a, b) => a.b.y - b.b.y);
  const low = parts[0]; if (!low) return 0;
  if (glyph.char !== ',' && glyph.char !== ';') return Math.max(low.b.width, low.b.height);
  const band = low.b.y + low.b.height * .55;
  let x0 = Infinity, x1 = -Infinity;
  try { for (const contour of sampleOutline(low.d, .5)) for (const [x, y] of contour) if (y >= band) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } } catch { return low.b.width; }
  return x1 > x0 ? x1 - x0 : low.b.width;
}
export function sizePunctuation(glyph, map) {
  // Chỉ . và , : chấm của : ; ! ? đưa về bằng dấu chấm ở bước sau (normalizePunctuation), co cả ký tự theo đầu phẩy
  // của ; sẽ làm chấm trên to ra.
  if (!glyph?.d || !'.,'.includes(glyph.char)) return glyph;
  const dot = punctuationDot(map), head = headWidth(glyph);
  if (!(dot > 0) || !(head > 0) || Math.abs(head / dot - 1) <= .15) return glyph;
  const k = dot / head, box = glyphBounds(glyph);
  // Khung chuẩn của ký tự tách tay có thể phóng dấu câu to gấp 3 lần (đầu phẩy 340, chấm i 113): đưa về mốc là việc bình
  // thường. Chỉ từ chối khi lệch phi lý (> 10 lần): khi đó thứ tách ra không phải dấu câu.
  if (k > 10 || k < .1) return { ...glyph, punctuationRejected: { head: Math.round(head), dot: Math.round(dot) } };
  const d = svgpath(glyph.d).translate(-box.x, -box.y).scale(k).translate(box.x, box.y).round(1).toString();
  return { ...glyph, d, advance: Math.round(glyph.advance - box.width + box.width * k), punctuationSized: Math.round(k * 100) / 100 };
}
export function placePunctuation(glyph, map) {
  glyph = sizePunctuation(glyph, map);
  if (!glyph?.d || !punctuation.includes(glyph.char)) return glyph;
  const { capTop } = punctuationMetrics(map), box = glyphBounds(glyph);
  let dy = 0;
  if (PUNCT_RULE.base.includes(glyph.char)) {
    if (glyph.char === ',' || glyph.char === ';') {
      // Đầu dấu phẩy là phần trên, rộng nhất: đặt đáy phần đầu (≈ đỉnh − bề rộng) ngay trên đường chân.
      const head = Math.min(box.height * .55, box.width * 1.1);
      dy = head - (box.y + box.height);
    } else dy = -box.y;
    if (glyph.char === ';') {   // ; : phần phẩy dưới cùng như dấu phẩy, chấm trên giữ khoảng cách vốn có
      const parts = svgpath(glyph.d).abs().toString().split(/(?=M)/).filter(x => x.trim()).map(d => ({ d, b: glyphBounds({ d }) })).sort((a, b) => a.b.y - b.b.y);
      const low = parts[0]?.b; if (low) { const head = Math.min(low.height * .55, low.width * 1.1); dy = head - (low.y + low.height); }
    }
  } else if (PUNCT_RULE.top.includes(glyph.char)) dy = capTop - (box.y + box.height);
  if (Math.abs(dy) < 2) return glyph;
  return { ...glyph, d: svgpath(glyph.d).translate(0, dy).round(1).toString(), punctuationPlaced: Math.round(dy) };
}
