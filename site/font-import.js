import opentype from 'opentype.js';
import { glyphBounds } from './glyph-review.js';
import { toneSamples } from './vietnamese.js';
import svgpath from 'svgpath';

export async function importFontFile(record) {
  const font = opentype.parse(await record.blob.arrayBuffer());
  if (font.tables.fvar) throw new Error('Hãy xuất một kiểu chữ tĩnh từ variable font rồi nhập lại.');
  const scale = 1000 / font.unitsPerEm;
  const glyphs = new Map();
  const indexChars = new Map();
  for (let i = 0; i < font.glyphs.length; i++) {
    const glyph = font.glyphs.get(i);
    const d = svgpath(glyph.path.toPathData(3)).scale(scale).round(3).toString();
    for (const code of glyph.unicodes) {
      if (code < 32 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) continue;
      const char = String.fromCodePoint(code);
      glyphs.set(char, { char, d, advance: Math.round(glyph.advanceWidth * scale), source: 'Font gốc' });
      if (!indexChars.has(i)) indexChars.set(i, char);
    }
  }
  if (!glyphs.size) throw new Error('Font không có bảng mã Unicode đọc được.');
  // Preserve legacy pair adjustments available from the parser.
  const kerning = Object.entries(font.kerningPairs).flatMap(([pair, amount]) => {
    const [a, b] = pair.split(',').map(Number);
    return indexChars.has(a) && indexChars.has(b)
      ? [[indexChars.get(a), indexChars.get(b), Math.round(amount * scale)]] : [];
  });
  return { glyphs, styleMetrics: { familyName: record.family || font.getEnglishName('preferredFamily') || font.getEnglishName('fontFamily'), styleName: record.style || font.getEnglishName('fontSubfamily') || 'Regular', weight: font.tables.os2?.usWeightClass || 400 }, metrics: { ascent: Math.ceil(font.ascender * scale),
    descent: Math.floor(font.descender * scale), wordSpace: glyphs.get(' ')?.advance, kerning } };
}

export function importAccentSamples(glyphs) {
  for (const mark of toneSamples.keys()) {
    if (glyphs.has(mark)) continue;
    const donor = [...glyphs.values()].find(glyph => {
      const [root, ...marks] = glyph.char.normalize('NFD');
      return marks.length === 1 && marks[0] === mark && glyphs.has(root);
    });
    if (!donor) continue;
    const root = glyphs.get(donor.char.normalize('NFD')[0]);
    const rootBox = glyphBounds(root);
    const contours = [];
    for (const segment of svgpath(donor.d).abs().unshort().unarc().segments) {
      if (segment[0] === 'M') contours.push([]);
      contours.at(-1)?.push(segment);
    }
    const paths = contours.map(contour => contour.map(segment => segment.join(' ')).join(' ')).filter(d => {
      const box = glyphBounds({ d });
      return mark === '\u0323' ? box.y + box.height < rootBox.y
        : box.y >= rootBox.y + rootBox.height - 8 && box.height < rootBox.height * .5;
    });
    if (paths.length) glyphs.set(mark, { char: mark, d: paths.join(' '), advance: donor.advance, source: 'Font gốc' });
  }
  for (const [root, target] of [['D', 'Đ'], ['d', 'đ']]) {
    if (glyphs.has(target) || !glyphs.has(root)) continue;
    const base = glyphs.get(root);
    const { x, y, width, height } = glyphBounds(base);
    const barY = y + height * (root === 'D' ? .52 : .78);
    const thickness = height * .07;
    const left = x - width * .12, right = x + width * (root === 'D' ? .52 : 1.1);
    glyphs.set(target, { ...base, char: target, source: 'Ghép dấu', base: root,
      d: base.d + ` M${left} ${barY} H${right} V${barY + thickness} H${left} Z` });
  }
}
