// Đo dấu tiếng Việt trong các font chuyên nghiệp đã Việt hóa sẵn để lập chuẩn cho skill và cho bước dựng dấu.
// Mọi số đều là tỷ lệ theo chính font: nét thân (stem), x-height, chiều cao hoa, dấu chấm, độ rộng nguyên âm.
// Chạy: node scripts/measure-vietnamese-marks.cjs [font.ttf ...]  (mặc định: font Windows có sẵn tiếng Việt)
const fs = require('node:fs'), path = require('node:path'), opentype = require('opentype.js');
const M = require('./lib/outline-metrics.cjs');

const winFonts = ['arial', 'arialbd', 'times', 'timesbd', 'segoeuil', 'segoeuisl', 'segoeui', 'seguisb', 'seguibl', 'tahoma', 'tahomabd',
  'verdana', 'verdanab', 'cour', 'courbd', 'calibril', 'calibri', 'calibrib', 'consola', 'pala'].map(f => `C:/Windows/Fonts/${f}.ttf`);

function load(file) {
  const font = opentype.parse(fs.readFileSync(file).buffer), k = 1000 / font.unitsPerEm;
  const get = ch => { const g = font.charToGlyph(ch); if (!g || !g.index) return null; return M.flatten(require('svgpath')(g.path.toPathData(3)).scale(k).toString()); };
  const svg = ch => { const g = font.charToGlyph(ch); if (!g || !g.index) return null; return { char: ch, d: require('svgpath')(g.path.toPathData(3)).scale(k).toString(), advance: Math.round(g.advanceWidth * k) }; };
  const all = () => Object.keys(font.tables.cmap.glyphIndexMap).map(c => String.fromCodePoint(+c)).filter(c => c.codePointAt(0) >= 32);
  return { name: font.getEnglishName('fullName') || path.basename(file), weight: font.tables.os2?.usWeightClass || 400, get, svg, all };
}

const { measureFont } = require('./lib/mark-metrics.cjs');

if (require.main === module) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : winFonts.filter(f => fs.existsSync(f));
  const rows = files.map(f => measureFont(load(f))).filter(Boolean);
  fs.mkdirSync(path.join(__dirname, '..', '.qa'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', '.qa', 'vietnamese-mark-metrics.json'), JSON.stringify(rows, null, 1));
  // Tóm tắt: min / trung vị / max mỗi chỉ số.
  const keys = new Set(); for (const r of rows) for (const [k, v] of Object.entries(r)) if (v && typeof v === 'object') for (const m of Object.keys(v)) keys.add(k + '.' + m);
  const stat = vals => { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? [v[0], v[Math.floor(v.length / 2)], v.at(-1)].map(n => n.toFixed(2)).join(' / ') : '-'; };
  console.log('fonts:', rows.map(r => r.font + ' ' + r.weight).join(', '));
  console.log('periodSize', stat(rows.map(r => r.periodSize)));
  for (const k of [...keys].sort()) { const [a, b] = k.split('.'); console.log(k.padEnd(18), stat(rows.map(r => r[a]?.[b]))); }
}
module.exports = { load, measureFont, winFonts };
