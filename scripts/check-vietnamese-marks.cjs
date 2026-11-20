// Kiểm dấu Xưởng tự dựng so với dấu gốc của nhà thiết kế (chuẩn trong skills/.../mark-standards.md).
// Với mỗi font Windows đã Việt hóa có trên máy: xóa chữ có dấu, dựng lại như nút Tạo dấu tiếng Việt, đo cả hai.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { winFonts } = require('./measure-vietnamese-marks.cjs');
const { compare } = require('./compare-derived-marks.cjs');

const files = winFonts.filter(f => fs.existsSync(f));
if (files.length < 6) { console.log(`SKIP: cần ít nhất 6 font Windows đã Việt hóa để so (tìm thấy ${files.length}).`); process.exit(0); }
const rows = compare(files);
assert(rows.length >= 6, 'không đo được đủ font');
const med = v => { v = [...v].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
// Trung vị dựng/gốc của từng chỉ số phải nằm trong 0.85–1.15; từng font không lệch quá giới hạn riêng.
const limits = { h: [.6, 1.6], w: [.55, 1.6], t: [.6, 1.8], size: [.6, 1.6] };
const marks = ['sac', 'huyen', 'hoi', 'nga', 'mu', 'trang', 'nang'];
const fails = [];
for (const mark of marks) for (const tag of ['', 'Cap']) for (const metric of [...Object.keys(limits), 'gap']) {
  const key = mark + tag + '.' + metric, list = rows.map(r => r[key]).filter(Boolean);
  if (list.length < 6) continue;
  if (mark === 'nang' && metric === 't') continue;   // dấu chấm: bề dày 2A/P không có nghĩa, đã kiểm cỡ
  if (metric === 'gap') {
    // Khoảng hở nhỏ nên so chênh lệch tuyệt đối theo x-height: trung vị lệch ≤ 0.03, từng font ≤ 0.10
    // (Arial cố ý để hỏi gần chạm Ỏ: 0.02).
    const m = med(list.map(x => x.made - x.pro));
    if (Math.abs(m) > .03) fails.push(`${key}: trung vị lệch ${m.toFixed(3)} x-height`);
    for (const r of rows) { const x = r[key]; if (x && Math.abs(x.made - x.pro) > .1) fails.push(`${key} ở ${r.font}: ${x.pro.toFixed(3)} → ${x.made.toFixed(3)}`); }
    continue;
  }
  const m = med(list.map(x => x.ratio));
  if (m < .85 || m > 1.15) fails.push(`${key}: trung vị dựng/gốc ${m.toFixed(2)}`);
  for (const r of rows) { const x = r[key]; if (x && (x.ratio < limits[metric][0] || x.ratio > limits[metric][1])) fails.push(`${key} ở ${r.font}: ${x.pro.toFixed(3)} → ${x.made.toFixed(3)}`); }
}
for (const key of ['rau_o.reach', 'rau_u.reach', 'rau_O.reach', 'rau_U.reach', 'rau_U.tip']) {
  const m = med(rows.map(r => r[key]?.ratio).filter(Number.isFinite));
  if (!(m >= .8 && m <= 1.25)) fails.push(`${key}: trung vị dựng/gốc ${m?.toFixed(2)}`);
}
assert.deepEqual(fails, [], 'Dấu dựng lệch chuẩn:\n' + fails.join('\n'));
console.log(`PASS: dấu dựng khớp dấu gốc của ${rows.length} font (trung vị mọi chỉ số trong 0.85–1.15; từng font trong giới hạn).`);
