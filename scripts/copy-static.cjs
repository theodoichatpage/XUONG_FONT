const { copyFileSync, readFileSync, writeFileSync, cpSync, readdirSync } = require('node:fs');

for (const file of ['index.html', 'style.css']) copyFileSync('site/' + file, 'dist/' + file);

cpSync('site/references', 'dist/references', { recursive: true });

const html = readFileSync('site/index.html', 'utf8');
const css = readFileSync('dist/style.css', 'utf8');
const js = readFileSync('dist/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
let standalone = html
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script defer src="./app.js"></script>', '')
  .replace('</body>', () => `<script>\n${js}\n</script>\n</body>`);
for (const file of ['design-challenges.png', 'diacritical-details.png']) {
  const data = 'data:image/png;base64,' + readFileSync('site/references/' + file).toString('base64');
  standalone = standalone.replaceAll('./references/' + file, data);
}
for (const file of readdirSync('site/references/vector').filter(file => file.endsWith('.svg'))) {
  const data = 'data:image/svg+xml;base64,' + readFileSync('site/references/vector/' + file).toString('base64');
  standalone = standalone.replaceAll('./references/vector/' + file, data);
}
writeFileSync('dist/xuong-font.html', standalone);
