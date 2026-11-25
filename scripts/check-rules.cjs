// Bài kiểm bảng quy tắc skill (site/rule-check.js) trên font thật: Arial (luôn có) và font của người dùng nếu có trên
// máy (Sử Việt Kiêu Hùng trong Downloads, UTM Bebas đã cài). Mỗi lỗi từng gặp được giữ thành một điều kiện ở đây để
// sửa code về sau không làm lỗi cũ quay lại.
// Chạy: npm run check:rules
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), esbuild = require('esbuild'), opentype = require('opentype.js'), svgpath = require('svgpath');
const dir = path.join(__dirname, '../.qa'); fs.mkdirSync(dir, { recursive: true });
function moduleFor(name, file) {
  const output = path.join(dir, name + '.cjs');
  esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, platform: 'node', format: 'cjs', outfile: output, logLevel: 'silent',
    external: ['wawoff2', 'esm-potrace-wasm'], inject: [path.join(__dirname, 'lib', 'dom-bbox-shim.mjs')] });
  return require(output);
}
const { checkRules, fixRules } = moduleFor('rule-check', 'site/rule-check.js');
const { createFontFamily, familyFeasibility } = moduleFor('family-generator-rules', 'site/font-family.js');
const { composeVietnamese, marksFromImageLetters, deriveMarkSamples, toneSamples, hornShape } = moduleFor('vietnamese-rules', 'site/vietnamese.js');
const { glyphBounds } = moduleFor('glyph-review-rules', 'site/glyph-review.js');
const parse = buf => opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const home = process.env.USERPROFILE || process.env.HOME || '';
const fonts = [
  { name: 'Arial', file: 'C:/Windows/Fonts/arial.ttf' },
  { name: 'Sử Việt Kiêu Hùng', file: path.join(home, 'Downloads', 'Sử Việt Kiêu Hùng.ttf'),
    feasible: ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium'], infeasible: ['SemiBold', 'Bold', 'ExtraBold', 'Black'], family: ['Light', 'Medium'] },
  { name: 'UTM Bebas', file: path.join(home, 'AppData/Local/Microsoft/Windows/Fonts/UTM Bebas.ttf'),
    feasible: ['ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold'], infeasible: ['Thin', 'ExtraBold', 'Black'], family: ['Light'] },
];
const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?“”‘’\'"ơưƠƯờởữợỏọạụịỵĐđ'];
function glyphMap(font, source = 'Ảnh mẫu') {
  const k = 1000 / font.unitsPerEm, map = new Map();
  for (const char of chars) { const g = font.charToGlyph(char); if (!g?.index || !g.path.commands.length) continue; map.set(char, { char, d: svgpath(g.path.toPathData(3)).scale(k).toString(), advance: g.advanceWidth * k, source }); }
  return map;
}
const status = (result, id) => result.rows.find(r => r.id === id)?.status;
const record = (name, buf) => ({ id: 1, name, filename: name + '.ttf', blob: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } });
(async () => {
  const done = [];
  for (const font of fonts) {
    if (!fs.existsSync(font.file)) { done.push(font.name + ': bỏ qua (không có file trên máy này)'); continue; }
    const buf = fs.readFileSync(font.file), source = parse(buf);
    // 1. Coi font như nét dò ảnh: sửa theo bảng quy tắc thì dấu câu, dấu nặng phải đạt (lỗi cũ: dấu phẩy to, nhảy lên đầu).
    const { map } = fixRules(glyphMap(source), { editable: () => true });
    const after = checkRules(map, { editable: () => true });
    for (const id of ['dot-i', 'colon-dots', 'dot-below', 'punct-place']) assert.notEqual(status(after, id), 'fail', font.name + ': sau khi sửa vẫn lệch quy tắc ' + id + ' ' + JSON.stringify(after.rows.find(r => r.id === id)?.issues.slice(0, 4)));
    // 2. Râu ơ ư nối liền thân ở font gốc.
    const original = checkRules(glyphMap(source, 'Font gốc'));
    assert.notEqual(status(original, 'horn'), 'fail', font.name + ': râu rời ở font gốc ' + JSON.stringify(original.rows.find(r => r.id === 'horn')?.issues));
    // 2b. Font dựng từ ảnh: chữ có dấu còn thiếu ghép bằng dấu người dùng vẽ trong chữ có dấu đã có (dấu hỏi ở ỏ ghép
    // cho ủ, ở…), không dùng dấu font khác; loại dấu ảnh không có thì dựng từ nét chữ (lỗi cũ: để trống).
    if (font.feasible) {
      const image = glyphMap(source); for (const g of image.values()) g.origin = 'direct';
      for (const c of [...'abcdefghijklmnopqrstuvwxyzAOUEI']) { const g = source.charToGlyph(c); if (g?.index) image.set(c, { char: c, d: svgpath(g.path.toPathData(3)).scale(1000 / source.unitsPerEm).toString(), advance: g.advanceWidth * 1000 / source.unitsPerEm, source: 'Ảnh mẫu', origin: 'direct' }); }
      for (const c of ['ủ', 'ở', 'ợ', 'ạ', 'ụ', 'ị', 'ỵ']) image.delete(c);
      for (const [mark, sample] of marksFromImageLetters(image)) image.set(mark, sample);
      const hookSample = image.get('̉');
      assert.ok(hookSample?.fromLetter, font.name + ': phải lấy dấu hỏi từ chữ có dấu trong ảnh');
      const missingMarks = [...toneSamples.keys()].filter(m => !image.get(m)?.d);
      if (missingMarks.length) { const { marks } = deriveMarkSamples(image); for (const m of missingMarks) if (marks.get(m)) image.set(m, marks.get(m)); }
      const made = new Map(composeVietnamese(image, () => false, { requireReferenceMarks: true }).map(g => [g.char, g]));
      for (const c of ['ủ', 'ở', 'ạ', 'ụ']) assert.ok(made.get(c)?.d, font.name + ': chưa ghép được ' + c + ' cho font dựng từ ảnh');
      const markH = d => { const ps = svgpath(d).abs().toString().split(/(?=M)/).filter(x => x.trim()).map(x => glyphBounds({ d: x })).sort((a, b) => b.y - a.y); return ps[0]?.height || 0; };
      const want = glyphBounds({ d: hookSample.d }).height, got = markH(made.get('ủ').d);
      assert.ok(Math.abs(got / want - 1) <= .12, font.name + ': dấu hỏi ghép vào ủ cao ' + Math.round(got) + ', dấu hỏi vẽ trong ảnh ' + Math.round(want));
    }
    if (font.feasible) {
      // 3. Biết trước kiểu family nào làm được (lỗi cũ: Bold không tạo được nhưng vẫn cho chọn).
      const verdict = await familyFeasibility(record(font.name, buf));
      for (const style of font.feasible) assert.equal(verdict.get(style), null, font.name + ' ' + style + ' phải làm được: ' + verdict.get(style));
      for (const style of font.infeasible) assert.ok(verdict.get(style), font.name + ' ' + style + ' phải bị làm mờ');
      // 4. Family giữ râu ơ ư (lỗi cũ: mất râu ở Thin/Light) và cỡ dấu hỏi của chính font (lỗi cũ: hỏi 122 thành 189).
      const hook = f => { const g = f.charToGlyph('ỏ'), o = f.charToGlyph('o'); const top = o.getBoundingBox().y2 * 1000 / f.unitsPerEm;
        const parts = []; let cur; for (const c of g.path.commands) { if (c.type === 'M') parts.push(cur = []); if ('y' in c) cur.push(c.y * 1000 / f.unitsPerEm); }
        const above = parts.filter(p => Math.min(...p) > top - 2); return above.length ? Math.max(...above.flat()) - Math.min(...above.flat()) : 0; };
      const sourceHook = hook(source);
      await createFontFamily(record(font.name, buf), font.family, 'x', async result => {
        if (!result.blob) return;
        const out = parse(Buffer.from(await result.blob.arrayBuffer()));
        const rows = checkRules(glyphMap(out, 'Font gốc'));
        assert.notEqual(status(rows, 'horn'), 'fail', font.name + ' ' + result.style + ': râu rời ' + JSON.stringify(rows.rows.find(r => r.id === 'horn')?.issues));
        const h = hook(out);
        if (sourceHook) assert.ok(Math.abs(h / sourceHook - 1) <= .12, font.name + ' ' + result.style + ': dấu hỏi cao ' + Math.round(h) + ', font gốc ' + Math.round(sourceHook));
      });
    }
    done.push(font.name + ': đạt');
  }
  // 5. Râu mẫu (tách từ ảnh, bảng dấu) ghép vào chữ có chân serif: chân râu mọc từ đầu chân serif của U / vai phải
  // của O, liền thân, vươn và cao theo chuẩn đo (lỗi cũ: râu cao cố định 130, mọc từ giữa nét U rồi vắt ngang chân serif).
  const { MARK_RANGES } = moduleFor('mark-ranges-rules', 'site/mark-ranges.js');
  for (const [name, file] of [['Times New Roman', 'C:/Windows/Fonts/times.ttf'], ['Georgia', 'C:/Windows/Fonts/georgia.ttf'], ['Arial', 'C:/Windows/Fonts/arial.ttf']]) {
    if (!fs.existsSync(file)) continue;
    const source = parse(fs.readFileSync(file)), image = glyphMap(source);
    for (const g of image.values()) g.origin = 'direct';
    for (const c of [...'ơưƠƯờởữợ']) image.delete(c);
    image.set('̛', { char: '̛', d: hornShape(260, 300, 30), advance: 0, source: 'Ảnh mẫu', origin: 'direct' });
    const made = new Map(composeVietnamese(image, () => false).map(g => [g.char, g]));
    const all = new Map([...image, ...made]), rows = checkRules(all);
    assert.notEqual(status(rows, 'horn'), 'fail', name + ': râu mẫu ghép sai chỗ/rời thân ' + JSON.stringify(rows.rows.find(r => r.id === 'horn')?.issues));
    const xH = glyphBounds(image.get('x')).height;
    for (const [char, root] of [['Ư', 'U'], ['ư', 'u'], ['Ơ', 'O'], ['ơ', 'o']]) {
      const g = made.get(char), rb = glyphBounds(image.get(root)), gb = glyphBounds(g);
      const reach = (gb.x + gb.width - rb.x - rb.width) / rb.width, tip = (gb.y + gb.height - rb.y - rb.height) / xH;
      for (const [metric, value] of [['reach', reach], ['tip', tip]]) {
        const [min, , max] = MARK_RANGES['rau_' + root + '.' + metric], pad = (max - min) * .1;
        assert.ok(value >= min - pad && value <= max + pad, name + ' ' + char + ': ' + metric + ' ' + value.toFixed(2) + ' ngoài chuẩn ' + min + '–' + max);
      }
    }
  }
  done.push('râu mẫu ghép vào chữ có chân serif: đạt');
  console.log('PASS: bảng quy tắc skill —', done.join('; '));
})().catch(error => { console.error(error); process.exit(1); });
