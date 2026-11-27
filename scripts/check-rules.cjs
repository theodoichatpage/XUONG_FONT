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
const { composeVietnamese, marksFromImageLetters, deriveMarkSamples, toneSamples, hornShape, hornEnds, measureStem, measureBody, strokeContrast, rightEdgeAt, HORN_END_VERSION } = moduleFor('vietnamese-rules', 'site/vietnamese.js');
const { deriveSymbols } = moduleFor('derive-symbols-rules', 'site/derive-symbols.js');
const { glyphBounds } = moduleFor('glyph-review-rules', 'site/glyph-review.js');
const { hornFromLetter, apartFrom } = moduleFor('horn-from-letters-rules', 'site/horn-from-letters.js');
const parse = buf => opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const home = process.env.USERPROFILE || process.env.HOME || '';
const fonts = [
  { name: 'Arial', file: 'C:/Windows/Fonts/arial.ttf' },
  { name: 'Sử Việt Kiêu Hùng', file: path.join(home, 'Downloads', 'Sử Việt Kiêu Hùng.ttf'),
    feasible: ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium'], infeasible: ['SemiBold', 'Bold', 'ExtraBold', 'Black'], family: ['Light', 'Medium'] },
  { name: 'UTM Bebas', file: path.join(home, 'AppData/Local/Microsoft/Windows/Fonts/UTM Bebas.ttf'),
    feasible: ['ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold'], infeasible: ['Thin', 'ExtraBold', 'Black'], family: ['Light'] },
  // Migra Extralight đã Việt hóa của người dùng (chỉ đo trên máy, không commit): ExtraBold từng mất mũ của ổ ẩ.
  { name: 'Migra Việt hóa', file: path.join(home, 'Downloads', 'migra-vn', 'migra-vn-extralight.ttf'), baseWeight: 200, familyOnly: true, family: ['ExtraBold'] },
];
// Dấu trên của chữ có dấu: số contour nằm hẳn trên đỉnh chữ gốc và khoảng hở dấu–thân (đơn vị 1000 em).
function upperMarks(f, char) {
  const k = 1000 / f.unitsPerEm, top = f.charToGlyph(char.normalize('NFD')[0]).getBoundingBox().y2 * k, parts = [];
  let cur; for (const c of f.charToGlyph(char).path.commands) { if (c.type === 'M') parts.push(cur = []); if ('y' in c) cur.push(c.y * k); }
  const above = parts.filter(p => Math.min(...p) > top - 2);
  return { count: above.length, gap: above.length ? Math.min(...above.flat()) - top : NaN };
}
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
    if (font.familyOnly) {
      // 4b. Family giữ đủ dấu hai tầng và khoảng hở dấu–thân của font gốc (lỗi 26/11/2026: ExtraBold của Migra mất mũ
      // của ổ ẩ — mũ tụt dưới mốc tách dấu nên bị tính là thân — và hỏi rơi xuống dính o thành "thơi"; hở ó còn 0.04).
      const twoTier = [...'ổẩễộóỏ'], want = Object.fromEntries(twoTier.map(c => [c, upperMarks(source, c)]));
      await createFontFamily(record(font.name, buf), font.family, 'x', async result => {
        if (!result.blob) return;
        const out = parse(Buffer.from(await result.blob.arrayBuffer()));
        for (const c of twoTier) {
          const got = upperMarks(out, c);
          assert.equal(got.count, want[c].count, font.name + ' ' + result.style + ': ' + c + ' còn ' + got.count + ' dấu trên, font gốc ' + want[c].count);
          assert.ok(Math.abs(got.gap - want[c].gap) <= 6, font.name + ' ' + result.style + ': ' + c + ' hở dấu–thân ' + Math.round(got.gap) + ', font gốc ' + Math.round(want[c].gap));
        }
      }, { baseWeight: font.baseWeight });
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
  // 6. Râu vẽ trong chữ ư của ảnh: tách ra ghép ơ (và Ư, Ơ) giữ hình, cỡ của râu trong ảnh, liền thân (lỗi cũ: bỏ qua
  // râu trong ảnh, dựng râu theo hình mẫu chung nên khác kiểu và cỡ font gốc). Đối chiếu với ơ thật của font.
  for (const [name, file] of [['Times New Roman', 'C:/Windows/Fonts/times.ttf'], ['Arial Bold', 'C:/Windows/Fonts/arialbd.ttf'], ['Segoe UI', 'C:/Windows/Fonts/segoeui.ttf']]) {
    if (!fs.existsSync(file)) continue;
    const source = parse(fs.readFileSync(file)), image = glyphMap(source), real = glyphMap(source);
    for (const g of image.values()) g.origin = 'direct';
    for (const c of [...'ơƠƯờởữợ']) image.delete(c);
    const horn = marksFromImageLetters(image).get('̛');
    assert.ok(horn?.byRoot?.u, name + ': phải tách được râu từ chữ ư trong ảnh');
    image.set('̛', horn);
    const made = new Map(composeVietnamese(image, () => false, { requireReferenceMarks: true }).map(g => [g.char, g]));
    const rows = checkRules(new Map([...image, ...made]));
    assert.notEqual(status(rows, 'horn'), 'fail', name + ': râu lấy từ ảnh rời thân ' + JSON.stringify(rows.rows.find(r => r.id === 'horn')?.issues));
    const top = c => { const b = glyphBounds(c); return b.y + b.height; }, rightOf = c => { const b = glyphBounds(c); return b.x + b.width; };
    const want = top(real.get('ơ')) - top(real.get('o')), got = top(made.get('ơ')) - top(image.get('o'));
    assert.ok(Math.abs(got - want) <= Math.max(.25 * want, 20), name + ': râu ơ ghép từ râu ư cao ' + Math.round(got) + ' trên đỉnh, ơ thật ' + Math.round(want));
    const reachWant = rightOf(real.get('ơ')) - rightOf(real.get('o')), reachGot = rightOf(made.get('ơ')) - rightOf(image.get('o'));
    assert.ok(Math.abs(reachGot - reachWant) <= .3 * reachWant + 10, name + ': râu ơ vươn ' + Math.round(reachGot) + ', ơ thật ' + Math.round(reachWant));
  }
  done.push('râu tách từ chữ ư trong ảnh: đạt');
  // 7. Đầu râu dựng từ nét của chính font (mark-standards.md, Kiểu đầu nét). Lỗi cũ: font chữ viết đầu vuốt nhọn bị râu
  // bo tròn vì chỉ có hai kiểu tròn/vuông và l của chữ viết (vòng nét) bị đo nhầm là đầu tròn.
  const endsCases = [['Times New Roman', 'C:/Windows/Fonts/times.ttf', e => e.terminal === 'ball' && e.ball && !e.round],
    ['Arial', 'C:/Windows/Fonts/arial.ttf', e => e.terminal === 'plain' && !e.round && e.endRatio === .82],
    ['Monotype Corsiva', 'C:/Windows/Fonts/MTCORSVA.TTF', e => !e.round], ['Segoe Script', 'C:/Windows/Fonts/segoesc.ttf', e => !e.round],
    ['Comic Sans', 'C:/Windows/Fonts/comic.ttf', e => e.terminal !== 'taper']];
  for (const [name, file, ok] of endsCases) {
    if (!fs.existsSync(file)) continue;
    const map = glyphMap(parse(fs.readFileSync(file)), 'Font gốc'), ends = hornEnds(map, measureStem(map), Math.max(.2, Math.min(1, 1.1 * measureBody(map).contrast - .1)));
    assert.ok(ok(ends), name + ': đầu râu sai kiểu ' + JSON.stringify({ ...ends, ball: !!ends.ball }));
    if (name === 'Times New Roman') {
      for (const c of [...'ơưƠƯờởữợ']) map.delete(c);
      const { marks } = deriveMarkSamples(map); for (const [m, g] of marks) if (!map.get(m)) map.set(m, g);
      const made = new Map(composeVietnamese(map, () => false).map(g => [g.char, g]));
      const rows = checkRules(new Map([...map, ...made]));
      assert.notEqual(status(rows, 'horn'), 'fail', name + ': râu giọt nước rời thân ' + JSON.stringify(rows.rows.find(r => r.id === 'horn')?.issues));
    }
  }
  done.push('đầu râu theo nét của font (giọt nước, vuốt nhọn, cắt bằng): đạt');
  // 8. Font chân vát sắc (Migra, bản dùng cá nhân trong Downloads; không đưa vào repo). Lỗi cũ: o của Migra có trục nét
  // nghiêng nên phép đo cắt giữa ra tương phản 0.99 (nét đều) thay vì 0.29; râu là dải cong mảnh, dài, không thanh–đậm.
  const migraDir = path.join(home, 'Downloads', 'Migra - Free for Personal Use');
  for (const file of ['Migra-Extralight.ttf', 'Migra-Extrabold.ttf'].map(f => path.join(migraDir, f))) {
    if (!fs.existsSync(file)) continue;
    const name = path.basename(file), map = glyphMap(parse(fs.readFileSync(file)), 'Font gốc');
    const contrast = strokeContrast(map), stem = measureStem(map);
    assert.ok(contrast < .5, name + ': tương phản đo ra ' + contrast.toFixed(2) + ', Migra là font thanh–đậm');
    const ends = hornEnds(map, stem, Math.max(.2, Math.min(1, 1.1 * contrast - .1)));
    assert.equal(ends.terminal, 'blade', name + ': đầu râu phải là lưỡi vát, đo được ' + ends.terminal);
    assert.ok(!ends.round && ends.footRatio < .5 && ends.endRatio === 1 && ends.cut > 0 && ends.v === HORN_END_VERSION,
      name + ': râu đầu vát phải chân mảnh, đầu trên đậm, cắt vát chéo, không bo tròn ' + JSON.stringify(ends));
    for (const c of [...'ơưƠƯờởữợ']) map.delete(c);
    const { marks } = deriveMarkSamples(map); for (const [m, g] of marks) if (!map.get(m)) map.set(m, g);
    const made = new Map(composeVietnamese(map, () => false).map(g => [g.char, g]));
    // Dấu râu mẫu lưu trong dự án từ trước (kết quả đo đầu nét cũ, không có phiên bản) phải được đo lại khi ghép.
    const old = new Map(map); old.set('̛', { ...map.get('̛'), hornEnd: { terminal: 'plain', round: false, footRatio: 1, endRatio: .82, ball: null } });
    assert.equal(composeVietnamese(old, () => false).find(g => g.char === 'ư').d, made.get('ư').d, name + ': dấu râu mẫu cũ không được đo lại');
    const rows = checkRules(new Map([...map, ...made]));
    assert.notEqual(status(rows, 'horn'), 'fail', name + ': râu rời thân ' + JSON.stringify(rows.rows.find(r => r.id === 'horn')?.issues));
    const xH = glyphBounds(map.get('x')).height;
    for (const [char, root] of [['ư', 'u'], ['Ư', 'U']]) {
      const g = glyphBounds(made.get(char)), r = glyphBounds(map.get(root)), reach = (g.x + g.width - r.x - r.width) / r.width, tip = (g.y + g.height - r.y - r.height) / xH;
      const [rMin, , rMax] = MARK_RANGES['rau_' + root + '.reach'], [tMin, , tMax] = MARK_RANGES['rau_' + root + '.tip'];
      assert.ok(reach <= rMax && tip <= tMax, name + ' ' + char + ': râu dài/cao quá chuẩn (vươn ' + reach.toFixed(2) + ' ≤ ' + rMax + ', cao ' + tip.toFixed(2) + ' ≤ ' + tMax + ')');
    }
    // ư và ơ (Ư và Ơ) cùng một nét râu: cùng độ cao đầu râu, cùng chiều ngang từ chỗ nối (người dùng 25/11/2026:
    // râu ư dài hơn râu ơ vì độ vươn đo từ khung u gồm cả đuôi chân phải).
    const hornSize = (char, root) => { const g = glyphBounds(made.get(char)), r = glyphBounds(map.get(root)), top = r.y + r.height;
      let edge = -Infinity;   // mép phải xa nhất của một phần năm trên (như quy tắc Chỗ nối râu)
      for (let n = 0; n <= 12; n++) { const x = rightEdgeAt(map.get(root).d, top - 2 - r.height * .2 * n / 12); if (x !== null) edge = Math.max(edge, x); }
      let hornRight = -Infinity;   // mép phải của phần râu (trên đỉnh thân; khung chữ u còn gồm đuôi chân phải)
      for (let n = 1; n <= 24; n++) { const x = rightEdgeAt(made.get(char).d, top + (g.y + g.height - top) * n / 25); if (x !== null) hornRight = Math.max(hornRight, x); }
      return { w: hornRight - edge, h: g.y + g.height - top }; };
    for (const [a, b] of [[['ư', 'u'], ['ơ', 'o']], [['Ư', 'U'], ['Ơ', 'O']]]) {
      const p = hornSize(...a), q = hornSize(...b);
      assert.ok(Math.abs(p.w - q.w) <= .15 * stem + 4 && Math.abs(p.h - q.h) <= .15 * stem + 6,
        name + ': râu ' + a[0] + ' và ' + b[0] + ' phải cùng cỡ (' + JSON.stringify([p, q].map(x => [Math.round(x.w), Math.round(x.h)])) + ')');
    }
    // Ký tự đặc biệt theo kiểu nét: font thanh-đậm thì nét ngang (gạch nối) mảnh như nét mảnh của font.
    const hyphen = glyphBounds(deriveSymbols(map).find(g => g.char === '-'));
    assert.ok(hyphen.height < .5 * stem, name + ': gạch nối của font thanh-đậm phải mảnh, đo ' + Math.round(hyphen.height) + ' / nét thân ' + Math.round(stem));
    done.push(name + ': râu đầu vát, ư ơ cùng cỡ, ký tự đặc biệt thanh-đậm đạt');
  }
  // Font nét đều / sans (Arial) giữ ký tự đặc biệt gần đều nét: gạch nối dày 0.82 nét thân như cũ.
  { const map = glyphMap(parse(fs.readFileSync('C:/Windows/Fonts/arial.ttf')), 'Font gốc'), stem = measureStem(map);
    const h = glyphBounds(deriveSymbols(map).find(g => g.char === '-')).height;
    assert.ok(Math.abs(h - .82 * stem) < 2, 'Arial: gạch nối phải giữ 0.82 nét thân, đo ' + h.toFixed(1));
    done.push('Arial: ký tự đặc biệt nét đều đạt'); }
  // 9. Sửa râu ơ trong Font Lab rồi lan sang chữ khác (lỗi 26/11/2026, Migra Italic): râu vẽ thành contour riêng phải
  // giữ nguyên đường cong và số điểm (không làm phẳng thành chuỗi đoạn thẳng dày), và dấu thanh của ở ử phải tách được
  // dù khung dấu hỏi chồng lên khung đầu râu ở chữ nghiêng.
  if (fs.existsSync('C:/Windows/Fonts/timesi.ttf')) {
    const map = glyphMap(parse(fs.readFileSync('C:/Windows/Fonts/timesi.ttf')), 'Font gốc'), o = map.get('o'), stem = measureStem(map), ob = glyphBounds(o);
    const r = ob.x + ob.width, t = ob.y + ob.height;
    const hornD = `M${r - 40} ${t - 90} C${r - 10} ${t - 60} ${r + 40} ${t + 20} ${r + 70} ${t + 120} L${r + 95} ${t + 112} C${r + 62} ${t + 10} ${r + 10} ${t - 80} ${r - 25} ${t - 112} Z`;
    const donor = { char: 'ơ', d: o.d + ' ' + hornD };
    const { topRightEdge } = moduleFor('vietnamese-rules', 'site/vietnamese.js');
    const horn = hornFromLetter(donor, o, stem, topRightEdge);
    assert.ok(horn?.direct, 'Times Italic: râu vẽ thành contour riêng phải được lấy nguyên contour');
    const curves = d => svgpath(d).abs().segments.filter(([c]) => c === 'C').length;
    assert.equal(curves(horn.d), curves(hornD), 'Times Italic: râu lan sang chữ khác phải giữ đường cong như người vẽ, có ' + curves(horn.d) + ' đoạn cong');
    // Dấu hỏi đặt sao cho khung chồng lên khung đầu râu nhưng không chạm râu.
    const hook = `M${r + 5} ${t + 90} L${r + 5} ${t + 150} L${r + 40} ${t + 150} L${r + 40} ${t + 90} Z`;   // cùng chiều contour ngoài với râu
    const tone = apartFrom(donor.d + ' ' + hook, donor.d, { outer: true });
    assert.equal(tone.length, 1, 'Times Italic: ở phải tách đúng một dấu hỏi, tách được ' + tone.length);
    done.push('râu sửa tay lan sang chữ khác giữ đường cong, dấu hỏi chữ nghiêng tách đúng');
  }
  // 10. Dấu hỏi dựng từ nét đi theo kiểu nét của font (lỗi 27/11/2026, Migra): font thanh-đậm thì hỏi cũng thanh-đậm
  // theo trục nét của o (mảnh/đậm ≈ độ tương phản), font nét đều/sans giữ gần đều. Đo bề dày dấu ở mọi điểm viền
  // (khoảng tới phía viền đối diện), lấy mức 10% / 90%.
  {
    const spread = d => {
      const pts = []; svgpath(d).abs().iterate(seg => { if (seg.length >= 3) pts.push([seg[seg.length - 2], seg[seg.length - 1]]); });
      const n = pts.length, w = [];
      for (let i = 0; i < n; i++) {
        let m = Infinity;
        for (let j = 0; j < n; j++) {
          if (Math.min(Math.abs(i - j), n - Math.abs(i - j)) < n / 6) continue;
          const a = pts[j], b = pts[(j + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
          const u = Math.max(0, Math.min(1, ((pts[i][0] - a[0]) * dx + (pts[i][1] - a[1]) * dy) / L));
          m = Math.min(m, Math.hypot(pts[i][0] - a[0] - u * dx, pts[i][1] - a[1] - u * dy));
        }
        w.push(m);
      }
      w.sort((a, b) => a - b); return w[Math.floor(n * .1)] / w[Math.floor(n * .9)];
    };
    const migra = path.join(require('node:os').homedir(), 'Downloads/Migra - Free for Personal Use/Migra-Extralight.ttf');
    const checked = [];
    for (const [name, file, contrasty] of [['Times', 'C:/Windows/Fonts/times.ttf', true], ['Migra Extralight', migra, true], ['Arial', 'C:/Windows/Fonts/arial.ttf', false]]) {
      if (!fs.existsSync(file)) continue;
      const g = glyphMap(parse(fs.readFileSync(file)), 'Font gốc'), contrast = strokeContrast(g);
      const derived = deriveMarkSamples(g), hook = (derived.marks || derived).get('̉'), ratio = spread(hook.d);
      if (contrasty) assert.ok(ratio <= contrast + .15, `${name}: dấu hỏi dựng phải thanh-đậm theo nét font (mảnh/đậm ${ratio.toFixed(2)}, tương phản o ${contrast.toFixed(2)})`);
      else assert.ok(ratio >= .6, `${name}: font nét gần đều thì dấu hỏi dựng gần đều (mảnh/đậm ${ratio.toFixed(2)})`);
      checked.push(name + ' ' + ratio.toFixed(2));
    }
    done.push('dấu hỏi dựng theo kiểu nét (' + checked.join(', ') + ')');
  }
  console.log('PASS: bảng quy tắc skill —', done.join('; '));
})().catch(error => { console.error(error); process.exit(1); });
