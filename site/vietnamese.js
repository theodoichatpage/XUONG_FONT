import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';

export const core = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
export const lowercase = [...'abcdefghijklmnopqrstuvwxyzđ'];
export const punctuation = [...'.,:;!?-–—()“”‘’/+'];
export const toneSamples = new Map([
  ['\u0301', 'Sắc'], ['\u0300', 'Huyền'], ['\u0323', 'Nặng'],
  ['\u0303', 'Ngã'], ['\u0309', 'Hỏi'], ['\u0306', 'Trăng'], ['\u0302', 'Mũ'], ['\u031b', 'Râu']
]);

const vowels = [...'AĂÂEÊIOÔƠUƯYaăâeêioôơuưy'];
const tones = ['', '\u0300', '\u0301', '\u0309', '\u0303', '\u0323'];
export const accented = [...new Set(vowels.flatMap(vowel => tones.map(tone => (vowel + tone).normalize('NFC'))))]
  .filter(char => !core.includes(char) && !lowercase.includes(char));
export const charset = [...core, 'Đ', ...lowercase, ...accented, ...punctuation];

const templates = {
  '\u0300': 'M-73 94 L-20 94 L62 0 L18 0 Z',
  '\u0301': 'M73 94 L20 94 L-62 0 L-18 0 Z',
  '\u0309': 'M-53 55 C-50 120 71 113 66 60 C64 35 20 29 20 0 L-17 0 C-17 40 28 49 28 66 C28 83 -16 83 -17 55 Z',
  '\u0303': 'M-106 15 C-75 124 14 18 47 57 Q66 62 78 83 L103 77 C73 -26 -15 77 -50 39 Q-67 35 -77 8 Z',
  '\u0302': 'M-113 4 L-21 100 L22 100 L113 4 L67 4 L0 60 L-67 4 Z',
  '\u0306': 'M-113 92 L-78 92 Q0 7 78 92 L113 92 Q83 0 0 0 Q-83 0 -113 92 Z',
  '\u031b': 'M-48 0 Q31 0 54 112 L90 112 Q78 -28 -19 -35 Z',
  '\u0323': 'M41 0 A41 41 0 1 0 -41 0 A41 41 0 1 0 41 0 Z'
};

function undotI(glyph) {
  const contours = [];
  for (const segment of svgpath(glyph.d).abs().segments) {
    if (segment[0] === 'M') contours.push([]);
    contours.at(-1)?.push(segment);
  }
  if (contours.length !== 2) return null;
  const parts = contours.map(contour => {
    const shape = { d: contour.map(([command, ...coordinates]) => command + coordinates.join(' ')).join('') };
    return { shape, bounds: glyphBounds(shape) };
  }).sort((a, b) => b.bounds.height - a.bounds.height);
  const [stem, dot] = parts;
  if (dot.bounds.y <= stem.bounds.y + stem.bounds.height || dot.bounds.height > stem.bounds.height * .35) return null;
  return { ...glyph, d: stem.shape.d };
}

export function composeVietnamese(glyphs, replace = () => false, { replaceHorn = false } = {}) {
  const result = [];
  for (const char of accented) {
    if (glyphs.get(char)?.source === 'Ảnh mẫu' && !replace(char)) continue;
    const [root, ...marks] = char.normalize('NFD');
    const horn = '\u031b';
    const horned = (root + horn).normalize('NFC');
    const useHornedSample = !replaceHorn && marks.length > 1 && marks.includes(horn)
      && glyphs.get(horned)?.source === 'Ảnh mẫu';
    const base = useHornedSample ? horned : root;
    if (useHornedSample) marks.splice(marks.indexOf(horn), 1);
    let original = glyphs.get(base);
    if (original && base === 'i' && !marks.includes('\u0323')) original = undotI(original);
    if (!original) continue;
    const bounds = glyphBounds(original);
    const bodyTop = bounds.y + bounds.height;
    let top = bodyTop + 28;
    let advance = original.advance;
    const paths = [original.d];
    for (const mark of [...marks].sort((a, b) => Number(b === '\u0302' || b === '\u0306') - Number(a === '\u0302' || a === '\u0306'))) {
      let x = bounds.x + bounds.width / 2;
      let y = top;
      const sample = toneSamples.has(mark) ? glyphs.get(mark) : undefined;
      if (sample) {
        const source = glyphBounds(sample);
        if (source.width > 0 && source.height > 0) {
          if (mark === '\u031b') {
            const scale = Math.min(130 / source.height, bounds.width * .60 / source.width);
            const width = source.width * scale, height = source.height * scale;
            const overlap = Math.min(width * .32, bounds.width * .12);
            const right = bounds.x + bounds.width;
            // The left base of the horn seats inside the upper-right stem.
            paths.push(svgpath(sample.d).translate(-source.x, -source.y).scale(scale)
              .translate(right - overlap, bodyTop - height * .62).round(1).toString());
            advance += Math.max(0, Math.ceil(width - overlap));
            continue;
          }
          const targetHeight = mark === '\u0309' ? 122 : mark === '\u0323' ? 80 : 95;
          const scale = Math.min(targetHeight / source.height, bounds.width * 1.2 / source.width);
          const height = source.height * scale;
          if (mark === '\u0323') y = bounds.y - 28 - height;
          else top += height + 28;
          paths.push(svgpath(sample.d).translate(-source.x - source.width / 2, -source.y)
            .scale(scale).translate(x, y).round(1).toString());
          continue;
        }
      }
      if (mark === '\u0323') y = bounds.y - 69;
      else if (mark === '\u031b') {
        x = bounds.x + bounds.width;
        y = bodyTop - 72;
        advance += 60;
      } else top += 123;
      paths.push(svgpath(templates[mark]).unarc().translate(x, y).round(1).toString());
    }
    result.push({ char, d: paths.join(' '), advance, source: 'Ghép dấu', base });
  }
  return result;
}

// Explicit application only replaces existing variants that can use an imported mark.
export function applyReferenceMarks(glyphs, selection) {
  const selectedMarks = Array.isArray(selection) ? selection.filter(mark => toneSamples.has(mark) && glyphs.has(mark))
    : toneSamples.has(selection) ? [selection].filter(mark => glyphs.has(mark)) : undefined;
  const base = selectedMarks ? undefined : selection?.normalize('NFD')[0];
  if (selectedMarks ? !selectedMarks.length : !base || !glyphs.has(base)) return [];
  const targets = new Set(accented.filter(char => {
    if (!glyphs.has(char)) return false;
    const [root, ...marks] = char.normalize('NFD');
    return selectedMarks ? marks.some(mark => selectedMarks.includes(mark)) : root === base
      && marks.some(mark => toneSamples.has(mark) && glyphs.has(mark));
  }));
  return composeVietnamese(glyphs, char => targets.has(char), {
    replaceHorn: selectedMarks?.includes('\u031b')
  }).filter(glyph => targets.has(glyph.char));
}
