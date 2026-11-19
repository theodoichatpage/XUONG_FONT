import {charset} from './vietnamese.js';
import {wordInk,splitCleanWord,splitWordByGaps,traceSymbol,pixelBox,expandWordBox,inkCrossesBox,alignReferenceGlyphs,refineDetectedWords} from './reference-image.js';

export function splitReferenceWord(mask, area, chars) {
  if (chars.length === 1) return [area];
  const separated = splitCleanWord(mask, area, chars);
  if (separated.length) return separated;
  if (chars.some(char => /^[õÕ]$/u.test(char))) {
    const byBody = splitWordByGaps(mask, area, chars.length, true);
    if (byBody.length) return byBody;
  }
  return splitWordByGaps(mask, area, chars.length);
}


export async function traceDetectedWords(image, detectedWords, signal, index, settings) {
  const located=refineDetectedWords(image,detectedWords,settings?.lines);
  const words = located.map(({ text, box }) => ({ text, area: pixelBox(box, image) }));
  const neighbors = words.map(word => word.area);
  const imageGlyphs = [], diagnostics=[];
  for (const { text, area: original } of words) {
    const chars = [...text.normalize('NFC').replace(/\s/gu,'')];
    if (chars.some(char => !charset.includes(char))) {diagnostics.push({text,box:original,status:'unsupported-character'});continue;}
    const expanded = expandWordBox(original, neighbors, image);
    let area = expanded;
    let mask = wordInk(image, area, settings);
    let parts = splitReferenceWord(mask, area, chars);
    if (!parts.length || inkCrossesBox(mask, area)) {
      area = original;
      mask = wordInk(image, area, settings);
      if (inkCrossesBox(mask, area)) {diagnostics.push({text,box:original,status:'ink-crosses-box'});continue;}
      parts = splitReferenceWord(mask, area, chars);
    }
    const wordGlyphs = [];
    diagnostics.push({text,box:original,status:parts.length?'segmented':'no-safe-separation',expected:chars.length,parts:parts.length});
    for (const [offset, part] of parts.entries()) {
      signal.throwIfAborted();
      const char = chars[offset];
      try {
        const glyph = await traceSymbol(mask, part, char, area);
        if (Number.isInteger(index)) glyph.reference = { index, crop: glyph.pixelCrop };
        wordGlyphs.push(glyph);
      } catch { /* Keep the letter listed as observed even if tracing fails. */ }
    }
    if (wordGlyphs.length) imageGlyphs.push(wordGlyphs);
  }
  const result=alignReferenceGlyphs(imageGlyphs);result.diagnostics=diagnostics;return result;
}

