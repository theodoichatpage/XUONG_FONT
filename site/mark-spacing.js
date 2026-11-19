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
