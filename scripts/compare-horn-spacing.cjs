// So khoảng trắng quanh râu ơ ư: dựng lại bằng Xưởng (sau khi xóa chữ có dấu) và so với font gốc đã Việt hóa.
// Đo: lề phải (advance − mép phải) của ư ơ Ư Ơ, và khoảng hở thật giữa râu ư và chữ ơ trong "ươ".
const fs = require('node:fs'), path = require('node:path'), esbuild = require('esbuild');
const M = require('./lib/outline-metrics.cjs');
const { load, winFonts } = require('./measure-vietnamese-marks.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.qa', 'derive-vietnamese.cjs');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'lib', 'derive-vietnamese.mjs')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error' });
delete require.cache[out];
const { deriveAll, toneSamples } = require(out);
const marks = new Set([...toneSamples.keys()]);
const isVi = ch => { const [, ...m] = ch.normalize('NFD'); return m.some(x => marks.has(x)) || marks.has(ch); };
const box = d => { let x0 = Infinity, x1 = -Infinity; for (const c of M.flatten(d)) for (const [x] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return [x0, x1]; };
// Khoảng hở ngang nhỏ nhất giữa a và b đặt cạnh nhau, xét theo từng dải cao (không chỉ khung bao).
function pairGap(a, b) {
  const rows = new Map();
  const scan = (g, dx, side) => { for (const c of M.flatten(g.d)) for (let i = 0; i < c.length; i++) {
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    for (let y = Math.ceil(Math.min(ay, by) / 10) * 10; y <= Math.max(ay, by); y += 10) {
      const x = ay === by ? Math.max(ax, bx) : ax + (y - ay) / (by - ay) * (bx - ax);
      const r = rows.get(y) || {}; r[side] = side === 'L' ? Math.max(r.L ?? -Infinity, x + dx) : Math.min(r.R ?? Infinity, x + dx); rows.set(y, r);
    } } };
  scan(a, 0, 'L'); scan(b, a.advance, 'R');
  let gap = Infinity; for (const r of rows.values()) if (r.L !== undefined && r.R !== undefined) gap = Math.min(gap, r.R - r.L);
  return gap;
}
const files = process.argv.slice(2).length ? process.argv.slice(2) : winFonts.filter(f => fs.existsSync(f));
const extra = ['ariali','timesi','segoeuii','calibrii','verdanai'].map(n => 'C:/Windows/Fonts/' + n + '.ttf').filter(f => fs.existsSync(f));
for (const file of process.argv.slice(2).length ? files : [...files, ...extra]) {
  const font = load(file), pro = new Map(), base = new Map();
  for (const ch of font.all()) { const g = font.svg(ch); if (!g) continue; pro.set(ch, g); if (!isVi(ch)) base.set(ch, { ...g, source: 'Font gốc' }); }
  const made = deriveAll(base).glyphs;
  const rsb = (m, ch) => { const g = m.get(ch); return g?.d ? Math.round(g.advance - box(g.d)[1]) : NaN; };
  const cells = ['ư', 'ơ', 'Ư', 'Ơ'].map(ch => ch + ' ' + rsb(pro, ch) + '→' + rsb(made, ch));
  const g = (m, a, b) => Math.round(pairGap(m.get(a), m.get(b)));
  const pairs = [['ư', 'ơ', 'u', 'o'], ['ư', 'n', 'u', 'n'], ['ơ', 'n', 'o', 'n'], ['Ư', 'N', 'U', 'N']];
  console.log(path.basename(file).padEnd(14), cells.join('  '), ' |', pairs.map(([a, b, c, d]) => a + b + ' ' + g(pro, a, b) + '→' + g(made, a, b) + ' (' + c + d + ' ' + g(pro, c, d) + ')').join('  '));
}
