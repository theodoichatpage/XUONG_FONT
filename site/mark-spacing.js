import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';

// Move only detached upper/lower marks. Joined horns and Đ crossbars belong to the body.
export function adjustGlyphMarks(glyph, base, { gap, scale }) {
  const marks = [...glyph.char.normalize('NFD')].slice(1).filter(mark => mark !== '\u031b');
  if (!marks.length || !base) return null;
  const bounds = glyphBounds(base), top = bounds.y + bounds.height;
  const contours = [];
  for (const segment of svgpath(glyph.d).abs().unshort().unarc().segments) {
    if (segment[0] === 'M') contours.push([]);
    contours.at(-1)?.push(segment);
  }
  const parts = contours.map(segments => {
    const d = segments.map(segment => segment.join(' ')).join(' ');
    const box = glyphBounds({ d });
    let side;
    if (box.height < bounds.height * .65) {
      if (box.y >= top - 2) side = 'above';
      else if (box.y + box.height <= bounds.y + 2) side = 'below';
    }
    return { d, box, side };
  });
  const groups = ['above', 'below'].map(side => {
    const members = parts.filter(part => part.side === side);
    if (!members.length) return null;
    const box = glyphBounds({ d: members.map(part => part.d).join(' ') });
    const x = box.x + box.width / 2;
    const y = side === 'above' ? box.y : box.y + box.height;
    const dy = side === 'above' ? gap : -gap;
    return { side, x, y, dy };
  }).filter(Boolean);
  if (!groups.length) return null;
  const d = parts.map(part => {
    const group = groups.find(group => group.side === part.side);
    return group ? svgpath(part.d).translate(-group.x, -group.y).scale(scale)
      .translate(group.x, group.y + group.dy).round(3).toString() : part.d;
  }).join(' ');
  return { ...glyph, d, marksAdjusted: true };
}

// ---------- Tự chỉnh dấu theo quy tắc trong skill design-vietnamese-fonts ----------
// - Khoảng hở dấu–thân nhất quán theo nhóm: chữ thường 28, chữ hoa 22 (hoa chặt hơn nhưng không dính).
// - Dấu dưới (nặng) cách chân chữ 28.
// - Chồng dấu trên nằm trong chiều cao dòng (≤ 980/1000), thu dấu tối đa còn 70% nếu cần.
// - Dấu tràn sang chữ bên cạnh: nới lề (sidebearing/advance), không dịch dấu để che lỗi khoảng chữ.
export const MARK_RULES = { gapLower: 28, gapUpper: 22, gapBelow: 28, minGap: 14, lineTop: 980, minScale: .7, margin: 12 };

function splitParts(glyph, bounds) {
  const top = bounds.y + bounds.height, contours = [];
  for (const segment of svgpath(glyph.d).abs().unshort().unarc().segments) {
    if (segment[0] === 'M') contours.push([]);
    contours.at(-1)?.push(segment);
  }
  return contours.map(segments => {
    const d = segments.map(segment => segment.join(' ')).join(' ');
    const box = glyphBounds({ d });
    let side;
    if (box.height < bounds.height * .65) {
      if (box.y >= top - 2) side = 'above';
      else if (box.y + box.height <= bounds.y + 2) side = 'below';
    }
    return { d, box, side };
  });
}

export function autoFixMarks(glyph, base, rules = MARK_RULES) {
  const marks = [...glyph.char.normalize('NFD')].slice(1).filter(mark => mark !== '̛');
  if (!marks.length || !base?.d) return null;
  const bounds = glyphBounds(base), top = bounds.y + bounds.height;
  const isCap = glyph.char !== glyph.char.toLowerCase();
  const parts = splitParts(glyph, bounds);
  const changes = [];
  const moves = {};
  for (const side of ['above', 'below']) {
    const members = parts.filter(part => part.side === side);
    if (!members.length) continue;
    const box = glyphBounds({ d: members.map(part => part.d).join(' ') });
    const cx = box.x + box.width / 2;
    if (side === 'above') {
      const gap = box.y - top, target = isCap ? rules.gapUpper : rules.gapLower;
      let scale = 1, wantGap = target;
      if (top + target + box.height > rules.lineTop) {
        wantGap = Math.max(rules.minGap, rules.lineTop - top - box.height);
        if (top + wantGap + box.height > rules.lineTop)
          scale = Math.max(rules.minScale, (rules.lineTop - top - wantGap) / box.height);
      }
      if (Math.abs(gap - wantGap) > 3) changes.push('gap');
      if (scale < .995) changes.push('fit');
      moves.above = { cx, y: box.y, dy: top + wantGap - box.y, scale };
    } else {
      const gap = bounds.y - (box.y + box.height);
      if (Math.abs(gap - rules.gapBelow) > 3) changes.push('gap');
      moves.below = { cx, y: box.y + box.height, dy: bounds.y - rules.gapBelow - (box.y + box.height), scale: 1 };
    }
  }
  if (!Object.keys(moves).length) return null;
  let d = parts.map(part => {
    const move = moves[part.side];
    return move ? svgpath(part.d).translate(-move.cx, -move.y).scale(move.scale)
      .translate(move.cx, move.y + move.dy).round(2).toString() : part.d;
  }).join(' ');
  // Dấu không được tràn ra ngoài ô chữ (chạm chữ bên cạnh): nới lề trái/phải.
  let advance = glyph.advance;
  const after = glyphBounds({ d }), left = rules.margin - after.x, right = after.x + after.width + rules.margin - advance;
  if (left > 1) { d = svgpath(d).translate(left, 0).round(2).toString(); advance += left; changes.push('side'); }
  if (right > 1) { advance += right; changes.push('side'); }
  if (!changes.length) return { glyph, changes };
  return { glyph: { ...glyph, d, advance: Math.ceil(advance), marksAdjusted: true, markRules: 'skill' }, changes: [...new Set(changes)] };
}
