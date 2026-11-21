// Lập bảng khoảng chuẩn cho bước tự đối chiếu quy tắc: min / trung vị / max của từng chỉ số dấu trên 20 font
// chuyên nghiệp (kết quả của measure-vietnamese-marks.cjs). Ghi ra site/mark-ranges.js.
// Chạy: node scripts/measure-vietnamese-marks.cjs && node scripts/build-mark-ranges.cjs
const fs = require('node:fs'), path = require('node:path');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.qa', 'vietnamese-mark-metrics.json'), 'utf8'));
const ranges = {};
for (const row of rows) for (const [key, value] of Object.entries(row)) {
  if (!value || typeof value !== 'object') continue;
  for (const [metric, n] of Object.entries(value)) if (Number.isFinite(n)) (ranges[key + '.' + metric] ??= []).push(n);
}
const out = Object.fromEntries(Object.entries(ranges).filter(([, v]) => v.length >= 10).map(([k, v]) => {
  v.sort((a, b) => a - b);
  return [k, [v[0], v[Math.floor(v.length / 2)], v.at(-1)].map(n => +n.toFixed(3))];
}));
fs.writeFileSync(path.join(__dirname, '..', 'site', 'mark-ranges.js'),
  '// Sinh tự động bởi scripts/build-mark-ranges.cjs từ 20 font chuyên nghiệp đã Việt hóa: [min, trung vị, max].\n'
  + 'export const MARK_RANGES = {\n' + Object.entries(out).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n') + '\n};\n');
console.log(Object.keys(out).length, 'chỉ số');
