import opentype from 'opentype.js';
import ClipperLib from 'clipper-lib';
const { addKerning } = require('../src/kern-table');

const styles = { 'Ultra Light': [200, -14], Light: [300, -7], Medium: [500, 0], SemiBold: [600, 12], Bold: [700, 20] };

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

export async function createFontFamily(record, chosen, text, onResult) {
  const original = await record.blob.arrayBuffer();
  const source = opentype.parse(original);
  if (source.tables.fvar) throw new Error('Chọn file Regular tĩnh để tạo family.');
  const family = record.name.replace(/(?:[ -]+Regular)$/i, '').trim() + ' Family';
  const upm = source.unitsPerEm;
  const indexChars = new Map();
  for (let i = 0; i < source.glyphs.length; i++) {
    const glyph = source.glyphs.get(i);
    if (glyph.unicodes?.length) indexChars.set(i, String.fromCodePoint(glyph.unicodes[0]));
  }
  const kerning = Object.entries(source.kerningPairs ?? {}).flatMap(([key, value]) => {
    const [a,b] = key.split(',').map(Number);
    return indexChars.has(a) && indexChars.has(b) ? [[indexChars.get(a),indexChars.get(b),value]] : [];
  });
  for (const style of ['Regular', ...chosen]) {
    const [weight, delta] = style === 'Regular' ? [400,0] : styles[style];
    const amount = delta * upm / 1000;
    const glyphs = [];
    let ascent = source.ascender, descent = source.descender;
    for (let i = 0; i < source.glyphs.length; i++) {
      const old = source.glyphs.get(i);
      const originalPath = old.path ?? new opentype.Path();
      const path = amount && originalPath.commands?.length ? embolden(originalPath, amount) : originalPath;
      const glyph = new opentype.Glyph({ name: old.name || (i === 0 ? '.notdef' : 'glyph' + i), unicode: old.unicode,
        unicodes: [...(old.unicodes ?? [])], advanceWidth: Math.max(0, Math.round((old.advanceWidth ?? upm / 2) + (originalPath.commands.length ? amount * 2 : 0))), path });
      glyphs.push(glyph);
      if (path.commands.length) {
        const bounds = path.getBoundingBox();
        ascent = Math.max(ascent, Math.ceil(bounds.y2));
        descent = Math.min(descent, Math.floor(bounds.y1));
      }
      if (i % 40 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    const font = new opentype.Font({ familyName: family, styleName: style,
      unitsPerEm: upm, ascender: ascent, descender: descent, glyphs,
      weightClass: weight, copyright: source.getEnglishName('copyright') || '',
      license: source.getEnglishName('license') || '', licenseURL: source.getEnglishName('licenseURL') || '' });
    font.tables.os2.usWeightClass = weight;
    font.tables.os2.fsSelection = style === 'Regular' ? 64 : weight === 700 ? 32 : 0;
    let bytes = new Uint8Array(font.toArrayBuffer());
    if (kerning.length) bytes = addKerning(bytes, kerning);
    await onResult({ name: family + ' ' + style, filename: family + '-' + style + '.otf',
      blob: new Blob([bytes], { type: 'font/otf' }), style, text });
  }
}
