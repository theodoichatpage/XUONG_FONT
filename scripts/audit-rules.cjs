// Tự đối chiếu quy tắc skill trên font Windows: xóa chữ có dấu, cho Xưởng dựng lại, rồi chấm bằng site/rule-audit.js
// (cùng bước kiểm chạy trong trang sau Tạo dấu tiếng Việt). Chạy: npm run audit:rules [arial.ttf times.ttf ...]
const path = require('node:path'), esbuild = require('esbuild'), { execFileSync } = require('node:child_process');
const out = path.join(__dirname, '..', '.qa', 'audit-rules.cjs');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'lib', 'audit-rules.mjs')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error' });
const fonts = process.argv.slice(2).length ? process.argv.slice(2) : ['arial.ttf', 'ariali.ttf', 'times.ttf', 'segoeuil.ttf', 'segoeui.ttf', 'seguibl.ttf', 'verdana.ttf', 'calibri.ttf', 'consola.ttf'];
process.stdout.write(execFileSync(process.execPath, [out, ...fonts], { encoding: 'utf8' }));
