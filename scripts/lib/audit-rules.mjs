import './dom-bbox-shim.mjs';
import { deriveAll, toneSamples } from './derive-vietnamese.mjs';
import { auditMarks, auditMessage } from '../../site/rule-audit.js';
import { measureSlant } from '../../site/vietnamese.js';
import opentype from 'opentype.js'; import svgpath from 'svgpath'; import fs from 'fs';
const marks = new Set([...toneSamples.keys()]);
const isVi = ch => { const [, ...m] = ch.normalize('NFD'); return m.some(x => marks.has(x)) || marks.has(ch); };
for (const f of process.argv.slice(2)) {
  const font = opentype.parse(fs.readFileSync('C:/Windows/Fonts/' + f).buffer), k = 1000 / font.unitsPerEm, base = new Map();
  for (const code of Object.keys(font.tables.cmap.glyphIndexMap)) { const ch = String.fromCodePoint(+code); if (+code < 32 || isVi(ch)) continue; const g = font.charToGlyph(ch); base.set(ch, { char: ch, d: svgpath(g.path.toPathData(3)).scale(k).toString(), advance: g.advanceWidth * k, source: 'Font gốc' }); }
  const made = deriveAll(base).glyphs;
  console.log(f, auditMessage(auditMarks(made, { slant: measureSlant(made) })));
}
