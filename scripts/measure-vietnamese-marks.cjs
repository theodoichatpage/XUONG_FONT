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

const upper = { '́': 'ó', '̀': 'ò', '̉': 'ỏ', '̃': 'õ', '̂': 'ô', '̆': 'ă', '̣': 'ọ' };
const upperCap = { '́': 'Ó', '̀': 'Ò', '̉': 'Ỏ', '̃': 'Õ', '̂': 'Ô', '̆': 'Ă', '̣': 'Ọ' };
const names = { '́': 'sac', '̀': 'huyen', '̉': 'hoi', '̃': 'nga', '̂': 'mu', '̆': 'trang', '̣': 'nang' };

// Độ tương phản nét của o: nét ngang mảnh nhất (đo dọc ở giữa) / nét đứng dày nhất (đo ngang ở giữa).
function contrastOf(o) {
  const b = M.boxOf(o), v = x => { const ys = []; for (const c of o) for (let i = 0; i < c.length; i++) { const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length]; if ((ax <= x) !== (bx <= x)) ys.push(ay + (x - ax) / (bx - ax) * (by - ay)); } ys.sort((p, q) => p - q); const s = []; for (let i = 0; i + 1 < ys.length; i += 2) s.push(ys[i + 1] - ys[i]); return s; };
  let thin = Infinity, thick = 0;
  for (let k = -3; k <= 3; k++) { const s = v((b.x0 + b.x1) / 2 + k * b.w * .02); if (s.length >= 2) thin = Math.min(thin, ...s); const h = M.spans(o, b.y0 + b.h / 2 + k * b.h * .02).map(([a, c]) => c - a); if (h.length >= 2) thick = Math.max(thick, ...h); }
  return thin / thick;
}
function measureFont(font) {
  const l = font.get('l'), x = font.get('x'), H = font.get('H'), dot = font.get('.');
  if (!l || !x || !H) return null;
  const stem = M.stemWidth(l), xH = M.boxOf(x).y1, capH = M.boxOf(H).y1, period = M.boxOf(dot);
  const out = { font: font.name, contrast: +contrastOf(font.get('o')).toFixed(2), weight: font.weight, stem: +stem.toFixed(1), xH: Math.round(xH), capH: Math.round(capH),
    periodSize: +(Math.max(period.w, period.h) / stem).toFixed(2) };
  for (const [table, tag] of [[upper, ''], [upperCap, 'Cap']]) {
    for (const [mark, ch] of Object.entries(table)) {
      const baseCh = ch.normalize('NFD')[0], base = font.get(baseCh), acc = font.get(ch);
      if (!base || !acc) continue;
      const extra = M.extraContours(acc, base);
      if (!extra.length) continue;
      const bb = M.boxOf(base), mb = M.boxOf(extra), ref = tag ? capH : xH;
      const r = {
        h: mb.h / xH,                                   // chiều cao dấu / x-height
        w: mb.w / bb.w,                                 // độ rộng dấu / độ rộng nguyên âm
        t: M.strokeThickness(extra) / stem,             // bề dày nét dấu (2A/P) / nét thân
        gap: (mark === '̣' ? bb.y0 - mb.y1 : mb.y0 - bb.y1) / xH,   // khoảng hở / x-height
        dx: ((mb.x0 + mb.x1) / 2 - (bb.x0 + bb.x1) / 2) / bb.w,      // lệch tâm ngang / độ rộng nguyên âm
      };
      if (mark === '́' || mark === '̀') {                              // độ thon: bề ngang ở 15% / ở 85% chiều cao
        const at = f => { const s = M.spans(extra, mb.y0 + mb.h * f).map(([a, c]) => c - a); return s.length ? Math.max(...s) : NaN; };
        r.taper = mark === '́' ? at(.15) / at(.85) : at(.15) / at(.85);
      }
      if (mark === '̣') r.size = Math.max(mb.w, mb.h) / stem;        // cỡ dấu nặng / nét thân
      if (mark === '̣') r.vsPeriod = Math.max(mb.w, mb.h) / Math.max(period.w, period.h);
      out[names[mark] + tag] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(3)]));
      void ref;
    }
  }
  // Râu: thường liền khối với o/u nên đo theo khung: độ vươn phải và độ cao đầu râu so với đỉnh thân.
  for (const [baseCh, ch] of [['o', 'ơ'], ['u', 'ư'], ['O', 'Ơ'], ['U', 'Ư']]) {
    const base = font.get(baseCh), acc = font.get(ch);
    if (!base || !acc) continue;
    const bb = M.boxOf(base), ab = M.boxOf(acc), extra = M.extraContours(acc, base);
    out['rau_' + baseCh] = { reach: +((ab.x1 - bb.x1) / bb.w).toFixed(3), tip: +((ab.y1 - bb.y1) / xH).toFixed(3),
      t: extra.length && M.boxOf(extra).h < .6 * bb.h ? +(M.strokeThickness(extra) / stem).toFixed(3) : null };
  }
  // Hai tầng dấu: tâm dấu thanh so với tâm mũ/trăng (theo bề rộng mũ), đáy dấu thanh theo chiều cao mũ, đỉnh cả cụm / em.
  for (const [ch, vowel] of [['ấ', 'a'], ['ầ', 'a'], ['ẩ', 'a'], ['ẫ', 'a'], ['ắ', 'a'], ['ẳ', 'a'], ['Ấ', 'A'], ['Ầ', 'A'], ['Ẩ', 'A'], ['Ẫ', 'A'], ['Ắ', 'A'], ['Ẳ', 'A']]) {
    const g = font.get(ch), v = font.get(vowel);
    if (!g || !v) continue;
    const items = M.extraContours(g, v).map(k => ({ k, b: M.box(k) })).sort((p, q) => p.b.y0 - q.b.y0);
    if (items.length < 2) continue;
    const cb = items[0].b, tb = M.boxOf(items.slice(1).map(t => t.k));
    out['tier_' + ch] = { side: +(((tb.x0 + tb.x1) / 2 - (cb.x0 + cb.x1) / 2) / cb.w).toFixed(3), bottom: +((tb.y0 - cb.y0) / cb.h).toFixed(3), top: +(Math.max(tb.y1, cb.y1) / 1000).toFixed(3) };
  }
  // Chồng dấu: hỏi trên mũ (ẩ), khoảng hở giữa hai tầng.
  const acirc = font.get('â'), ahoi = font.get('ẩ');
  if (acirc && ahoi) {
    const top = M.extraContours(ahoi, acirc), cb = M.boxOf(M.extraContours(acirc, font.get('a')));
    if (top.length) { const tb = M.boxOf(top); out.stack = { gap: +((tb.y0 - cb.y1) / xH).toFixed(3), side: +(((tb.x0 + tb.x1) / 2 - (cb.x0 + cb.x1) / 2) / cb.w).toFixed(3) }; }
  }
  return out;
}

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
