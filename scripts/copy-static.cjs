const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');

for (const file of ['index.html', 'style.css']) copyFileSync('site/' + file, 'dist/' + file);

const html = readFileSync('site/index.html', 'utf8');
const css = readFileSync('dist/style.css', 'utf8');
const js = readFileSync('dist/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const standalone = html
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script defer src="./app.js"></script>', '')
  .replace('</body>', () => `<script>\n${js}\n</script>\n</body>`);
writeFileSync('dist/xuong-font.html', standalone);

mkdirSync('dist/ocr', { recursive: true });
for (const [source, target] of [
  ['tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
  ['@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz', 'vie.traineddata.gz'],
  ['tesseract.js/LICENSE.md', 'tesseract-license.txt'],
  ['tesseract.js-core/LICENSE', 'tesseract-core-license.txt']
]) copyFileSync('node_modules/' + source, 'dist/ocr/' + target);
