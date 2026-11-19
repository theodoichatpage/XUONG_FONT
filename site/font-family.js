import opentype from 'opentype.js';
import ClipperLib from 'clipper-lib';
import svg2ttf from 'svg2ttf';
import { familyWeights, familyStyles } from './family-styles.js';
import { familyPreflight, missingFamilyStyles } from './family-validation.js';
const { applyStyleMetadata } = require('../src/font-style-metadata');
const escapeXML = value => String(value).replace(/[&<>"']/g, ch => '&#' + ch.codePointAt(0) + ';');
const { addKerning } = require('../src/kern-table');

function slantPath(path, angle) {
  const output = new opentype.Path(), shear = Math.tan(angle * Math.PI / 180);
  output.commands = path.commands.map(command => {
    const next = { ...command };
    for (const [x,y] of [['x','y'],['x1','y1'],['x2','y2']]) if (Number.isFinite(next[x])) next[x] += shear * next[y];
    return next;
  });
  return output;
}

function contours(path) {
  const paths = [];
  let points, start, current;
  for (const command of path.commands) {
    if (command.type === 'M') {
      points = [];
      paths.push(points);
      start = current = { x: command.x, y: command.y };
      points.push({ X: Math.round(current.x * 16), Y: Math.round(current.y * 16) });
    } else if (command.type === 'Z') current = start;
    else {
      const end = { x: command.x, y: command.y };
      const origin = current;
      const steps = command.type === 'L' ? 1 : Math.max(8, Math.min(64, Math.ceil(
        (Math.hypot(end.x - origin.x, end.y - origin.y) +
          Math.hypot(command.x1 - origin.x, command.y1 - origin.y)) / 12)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        let x = end.x, y = end.y;
        if (command.type === 'Q') {
          x = u*u*origin.x + 2*u*t*command.x1 + t*t*end.x;
          y = u*u*origin.y + 2*u*t*command.y1 + t*t*end.y;
        } else if (command.type === 'C') {
          x = u*u*u*origin.x + 3*u*u*t*command.x1 + 3*u*t*t*command.x2 + t*t*t*end.x;
          y = u*u*u*origin.y + 3*u*u*t*command.y1 + 3*u*t*t*command.y2 + t*t*t*end.y;
        }
        points.push({ X: Math.round(x * 16), Y: Math.round(y * 16) });
      }
      current = end;
    }
  }
  return paths.filter(points => points.length >= 3);
}

function embolden(path, amount) {
  const polygons = ClipperLib.Clipper.SimplifyPolygons(contours(path), ClipperLib.PolyFillType.pftNonZero);
  // The largest contour determines the exterior winding.
  const largest = polygons.reduce((best, polygon) =>
    Math.abs(ClipperLib.Clipper.Area(polygon)) > Math.abs(ClipperLib.Clipper.Area(best)) ? polygon : best, []);
  if (largest.length && !ClipperLib.Clipper.Orientation(largest)) polygons.forEach(polygon => polygon.reverse());
  const offset = new ClipperLib.ClipperOffset(2, .5);
  offset.AddPaths(polygons, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const result = new ClipperLib.Paths();
  offset.Execute(result, amount * 16);
  if (polygons.length && !result.length) throw new Error('Không thể cân nét một ký tự. Hãy giảm độ đậm.');
  const output = new opentype.Path();
  for (const polygon of result) {
    output.moveTo(polygon[0].X / 16 + amount, polygon[0].Y / 16);
    for (const point of polygon.slice(1)) output.lineTo(point.X / 16 + amount, point.Y / 16);
    output.close();
  }
  return output;
}

export async function createFontFamily(record, chosen, text, onResult, options = {}) {
  if (record.projectId || record.fromImages) throw new Error('Family từ ảnh cần ảnh riêng của từng Style. Mở Tạo Family từ ảnh để tiếp tục; không sinh Bold bằng offset hoặc Italic bằng shear.');
  const original = await record.blob.arrayBuffer();
  const source = opentype.parse(original);
  const preflight = familyPreflight(source, { baseWeight: options.baseWeight });
  if (!preflight.ready) throw new Error('Chưa thể tạo family. ' + preflight.problems.join('. '));
  if (source.tables.fvar) throw new Error('Chọn một kiểu chữ tĩnh để tạo family.');
  if (source.tables.post?.italicAngle || (source.tables.os2?.fsSelection & 1)) throw new Error('Chọn kiểu đứng làm font gốc để tránh nghiêng chữ hai lần.');
  const base = familyWeights.find(item => item.weight === Number(options.baseWeight))
    || familyWeights.reduce((best,item) => Math.abs(item.weight - (source.tables.os2?.usWeightClass || 400)) < Math.abs(best.weight - (source.tables.os2?.usWeightClass || 400)) ? item : best);
  const angle = Number(options.angle ?? 12);
  if (!Number.isFinite(angle) || angle < 1 || angle > 20) throw new Error('Góc nghiêng cần từ 1 đến 20 độ.');
  const family = record.family || source.getEnglishName('preferredFamily') || source.getEnglishName('fontFamily') || record.name.replace(/(?:[ -]+Regular)$/i, '').trim();
  const upm = source.unitsPerEm;
  // cmap is authoritative: multiple code points can share one outline.
  const codePointsByGlyph = new Map();
  for (const [code, index] of Object.entries(source.tables.cmap.glyphIndexMap)) {
    if (!codePointsByGlyph.has(index)) codePointsByGlyph.set(index, []);
    codePointsByGlyph.get(index).push(Number(code));
  }
  const indexChars = new Map();
  for (let i = 0; i < source.glyphs.length; i++) {
    const codes = codePointsByGlyph.get(i);
    if (codes?.length) indexChars.set(i, String.fromCodePoint(codes[0]));
  }
  const kerning = Object.entries(source.kerningPairs ?? {}).flatMap(([key, value]) => {
    const [a,b] = key.split(',').map(Number);
    return indexChars.has(a) && indexChars.has(b) ? [[indexChars.get(a),indexChars.get(b),value]] : [];
  });
  const targets = missingFamilyStyles(chosen, options.existingStyles || []).map(style => familyStyles.find(item => item.style === style));
  if (targets.some(item => !item)) throw new Error('Kiểu family không hợp lệ.');
  for (const target of targets) {
    const { style, weight, italic } = target;
    try {
    const isSource = !italic && weight === base.weight;
    if (isSource) {
      await onResult({ name: family + ' ' + style, family, style, weight, italic, isSource: true, text,
        filename: record.filename, blob: record.blob });
      continue;
    }
    const amount = (target.offset - base.offset) * upm / 1000;
    const glyphs = [];
    let ascent = source.ascender, descent = source.descender;
    for (let i = 0; i < source.glyphs.length; i++) {
      const old = source.glyphs.get(i);
      const originalPath = old.path ?? new opentype.Path();
      let path = amount && originalPath.commands?.length ? embolden(originalPath, amount) : originalPath;
      if (italic) path = slantPath(path, angle);
      if (amount && originalPath.commands.length) {
        // Offset can erase a counter or weld a detached accent. Reject that draft.
        const topology = value => {
          const polygons = ClipperLib.Clipper.SimplifyPolygons(contours(value), ClipperLib.PolyFillType.pftNonZero);
          const positive=polygons.filter(p => ClipperLib.Clipper.Orientation(p)).length;
          return [polygons.length, Math.min(positive,polygons.length-positive)].join(':');
        };
        if (topology(originalPath) !== topology(path)) throw new Error('Biến đổi làm mất lòng chữ hoặc nối/tách nét tại ' + (old.unicodes?.map(c=>String.fromCodePoint(c)).join('/') || '#' + i) + '. Giữ bản gốc; cần thiết kế lại mức đậm này.');
      }
      // Avoid Glyph's constructor: opentype.js 1.x drops Unicode aliases there.
      const glyph = { unicodes: codePointsByGlyph.get(i) || [],
        advanceWidth: Math.max(0, Math.round((old.advanceWidth ?? upm / 2) + (originalPath.commands.length ? amount * 2 : 0))), path };
      glyphs.push(glyph);
      if (path.commands.length) {
        const bounds = path.getBoundingBox();
        ascent = Math.max(ascent, Math.ceil(bounds.y2));
        descent = Math.min(descent, Math.floor(bounds.y1));
      }
      if (i % 40 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    // Use the same TrueType writer as the editor's download flow.
    // This avoids a second CFF serialization path for imported outlines.
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg"><defs><font id="FamilyFont" horiz-adv-x="${upm / 2}">`,
      `<font-face font-family="${escapeXML(family)}" font-weight="${weight}" font-style="${italic ? 'Italic' : 'Regular'}" units-per-em="${upm}" ascent="${ascent}" descent="${descent}"/>`];
    for (const [index, glyph] of glyphs.entries()) {
      const d = escapeXML(glyph.path.toPathData(3));
      if (index === 0) parts.push(`<missing-glyph horiz-adv-x="${glyph.advanceWidth}" d="${d}"/>`);
      for (const point of glyph.unicodes) {
        if (!Number.isInteger(point) || point < 32 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) continue;
        parts.push(`<glyph glyph-name="uni${point.toString(16)}" unicode="&#${point};" horiz-adv-x="${glyph.advanceWidth}" d="${d}"/>`);
      }
    }
    parts.push('</font></defs></svg>');
    const output = svg2ttf(parts.join(''), { familyname: family, subfamilyname: style,
      fullname: family + ' ' + style, copyright: source.getEnglishName('copyright') || '', ts: 0 });
    let bytes = new Uint8Array(output.buffer);
    if (kerning.length) bytes = addKerning(bytes, kerning);
    bytes = applyStyleMetadata(bytes, { weight, italic, angle });
    // Verify the exported bytes before handing them to storage or preview.
    const checked = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const outputCheck = familyPreflight(checked);
    const outputProblems = outputCheck.problems.filter(message => message !== 'Cần chọn kiểu đứng.');
    if (outputProblems.length) throw new Error(outputProblems.join('. '));
    if (checked.tables.os2?.usWeightClass !== weight || !!(checked.tables.os2?.fsSelection & 1) !== italic) throw new Error('Metadata bản xuất không khớp kiểu đã chọn.');
    for (const [code, index] of Object.entries(source.tables.cmap.glyphIndexMap)) {
      const point = Number(code);
      if (index && point >= 32 && !checked.charToGlyphIndex(String.fromCodePoint(point))) {
        throw new Error('Bản xuất bị thiếu ký tự ' + String.fromCodePoint(point));
      }
      if (index && point >= 32 && source.glyphs.get(index).path.commands.length && !checked.charToGlyph(String.fromCodePoint(point)).path.commands.length) throw new Error('Bản xuất làm rỗng glyph ' + String.fromCodePoint(point));
    }
    await onResult({ name: family + ' ' + style, family, filename: family + '-' + style.replace(/ /g, '') + '.ttf',
      blob: new Blob([bytes], { type: 'font/ttf' }), style, weight, italic, draft: true, quality: { coverage: outputCheck.coverage.counts, checkedAt: new Date().toISOString(), optical: 'not-tested', method: 'outline-offset', oblique: italic }, isSource: false, text });
    } catch (error) {
      if (!options.onError) throw error;
      await options.onError(style, error);
    }
  }
}
