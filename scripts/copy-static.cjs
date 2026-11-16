const { copyFileSync, readFileSync, writeFileSync } = require('node:fs');

for (const file of ['index.html', 'style.css']) copyFileSync('site/' + file, 'dist/' + file);

const html = readFileSync('site/index.html', 'utf8');
const css = readFileSync('dist/style.css', 'utf8');
const js = readFileSync('dist/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const standalone = html
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script defer src="./app.js"></script>', '')
  .replace('</body>', () => `<script>\n${js}\n</script>\n</body>`);
writeFileSync('dist/xuong-font.html', standalone);
