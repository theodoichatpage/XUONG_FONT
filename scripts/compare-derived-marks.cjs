// So dấu Xưởng tự dựng với dấu gốc của nhà thiết kế: lấy font chuyên nghiệp đã Việt hóa, xóa mọi chữ có dấu,
// cho Xưởng dựng lại (như nút Tạo dấu tiếng Việt), rồi đo cả hai bằng cùng một phép đo.
// Kết quả: tỷ số dựng/gốc cho từng chỉ số (1.00 = khớp nhà thiết kế).
const fs = require('node:fs'), path = require('node:path'), esbuild = require('esbuild');
const M = require('./lib/outline-metrics.cjs');
const { load, measureFont, winFonts } = require('./measure-vietnamese-marks.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.qa', 'derive-vietnamese.cjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'lib', 'derive-vietnamese.mjs')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error' });
delete require.cache[out];
const { deriveAll, toneSamples } = require(out);

const vietnameseMarks = new Set([...toneSamples.keys()]);
const isVietnameseExtra = ch => { const [, ...m] = ch.normalize('NFD'); return m.some(x => vietnameseMarks.has(x)) || vietnameseMarks.has(ch); };

function derivedFont(font) {
  const glyphs = new Map();
  for (const ch of font.all()) { if (isVietnameseExtra(ch)) continue; const g = font.svg(ch); if (g) glyphs.set(ch, { ...g, source: 'Font gốc' }); }
  const { glyphs: next } = deriveAll(glyphs);
  return { name: font.name + ' (dựng)', weight: font.weight, get: ch => next.get(ch)?.d ? M.flatten(next.get(ch).d) : null };
}

const metrics = ['h', 'w', 't', 'gap', 'size', 'reach', 'tip', 'taper'];
function compare(files = winFonts.filter(f => fs.existsSync(f))) {
  const rows = [];
  for (const file of files) {
    const font = load(file), pro = measureFont(font), made = measureFont(derivedFont(font));
    if (!pro || !made) continue;
    const row = { font: pro.font, weight: pro.weight };
    for (const key of Object.keys(pro)) {
      if (!pro[key] || typeof pro[key] !== 'object' || !made[key]) continue;
      for (const m of metrics) if (Number.isFinite(pro[key][m]) && Number.isFinite(made[key][m]) && Math.abs(pro[key][m]) > 1e-3)
        row[key + '.' + m] = { pro: pro[key][m], made: made[key][m], ratio: made[key][m] / pro[key][m] };
    }
    rows.push(row);
  }
  return rows;
}
if (require.main === module) {
  const rows = compare(process.argv.slice(2).length ? process.argv.slice(2) : undefined);
  const keys = [...new Set(rows.flatMap(r => Object.keys(r).filter(k => k.includes('.'))))].sort();
  const med = v => { v = v.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
  console.log('chỉ số'.padEnd(16), 'tỷ số dựng/gốc: min / trung vị / max', '   (gốc trung vị → dựng trung vị)');
  for (const k of keys) {
    const r = rows.map(x => x[k]).filter(Boolean), q = r.map(x => x.ratio).sort((a, b) => a - b);
    console.log(k.padEnd(16), [q[0], med(q), q.at(-1)].map(n => n.toFixed(2)).join(' / ').padEnd(22), '   ', med(r.map(x => x.pro)).toFixed(3), '→', med(r.map(x => x.made)).toFixed(3));
  }
  if (process.env.DETAIL) for (const r of rows) console.log(r.font.padEnd(22), process.env.DETAIL.split(',').map(k => k + ' ' + (r[k] ? r[k].pro.toFixed(2) + '→' + r[k].made.toFixed(2) : '-')).join('  '));
}
module.exports = { compare };
