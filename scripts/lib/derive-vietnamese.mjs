// Gói cho node: dựng dấu và ghép chữ Việt như nút "Tạo dấu tiếng Việt" (font gốc không có dấu tiếng Việt).
import './dom-bbox-shim.mjs';
import { deriveMarkSamples, composeVietnamese, toneSamples, measureStem } from '../../site/vietnamese.js';
export function deriveAll(glyphs) {
  const next = new Map(glyphs);
  const { marks, stem } = deriveMarkSamples(next);
  for (const [mark, glyph] of marks) if (!next.has(mark)) next.set(mark, glyph);
  for (const glyph of composeVietnamese(next)) next.set(glyph.char, glyph);
  return { glyphs: next, stem };
}
export { toneSamples, measureStem };
export { importAccentSamples } from '../../site/font-import.js';
