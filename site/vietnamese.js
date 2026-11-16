import svgpath from 'svgpath';

export const core = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
export const lowercase = [...'abcdefghijklmnopqrstuvwxyzđ'];
export const punctuation = [...'.,:;!?-–—()“”‘’/+'];
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

export function composeVietnamese(glyphs) {
  const result = [];
  for (const char of accented) {
    if (glyphs.get(char)?.source === 'Ảnh mẫu') continue;
    const [base, ...marks] = char.normalize('NFD');
    const original = glyphs.get(base);
    if (!original || (base === 'i' && !marks.includes('\u0323'))) continue;
    const lower = base === base.toLowerCase();
    const bodyTop = lower ? (base === 'i' ? 660 : 480) : 700;
    let top = bodyTop + 28;
    let advance = original.advance;
    const paths = [original.d];
    for (const mark of [...marks].sort((a, b) => Number(b === '\u0302' || b === '\u0306') - Number(a === '\u0302' || a === '\u0306'))) {
      let x = original.advance / 2;
      let y = top;
      if (mark === '\u0323') y = -84;
      else if (mark === '\u031b') {
        x = original.advance - 47;
        y = bodyTop - 72;
        advance += 60;
      } else top += 123;
      paths.push(svgpath(templates[mark]).unarc().translate(x, y).round(1).toString());
    }
    result.push({ char, d: paths.join(' '), advance, source: 'Ghép dấu', base });
  }
  return result;
}
