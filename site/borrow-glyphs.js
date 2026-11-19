// Lấy chữ còn thiếu từ một kiểu khác trong cùng bộ font (ví dụ số 0–9 chỉ có ở ảnh Medium)
// rồi làm dày/mỏng theo chênh lệch độ đậm. Chỉ dùng cho ô còn trống; kết quả luôn là "suy luận".
import ClipperLib from 'clipper-lib';
import svgpath from 'svgpath';
import { familyWeights } from './family-styles.js';
import { measureStem } from './vietnamese.js';

const SCALE = 16;

// Dải đường cong thành đa giác (đơn vị font × 16 để Clipper làm việc với số nguyên).
function toPolygons(d) {
  const polygons = [];
  let points = [], x = 0, y = 0, startX = 0, startY = 0;
  const push = (px, py) => points.push({ X: Math.round(px * SCALE), Y: Math.round(py * SCALE) });
  for (const [command, ...v] of svgpath(d).abs().unarc().unshort().segments) {
    if (command === 'M') {
      if (points.length >= 3) polygons.push(points);
      points = []; [x, y] = v; startX = x; startY = y; push(x, y);
    } else if (command === 'L') { [x, y] = v; push(x, y); }
    else if (command === 'H') { x = v[0]; push(x, y); }
    else if (command === 'V') { y = v[0]; push(x, y); }
    else if (command === 'Q' || command === 'C') {
      const [ex, ey] = v.slice(-2), steps = 16;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        if (command === 'Q') push(u * u * x + 2 * u * t * v[0] + t * t * ex, u * u * y + 2 * u * t * v[1] + t * t * ey);
        else push(u ** 3 * x + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t ** 3 * ex,
          u ** 3 * y + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t ** 3 * ey);
      }
      [x, y] = [ex, ey];
    } else if (command === 'Z') { x = startX; y = startY; }
  }
  if (points.length >= 3) polygons.push(points);
  return ClipperLib.Clipper.SimplifyPolygons(polygons, ClipperLib.PolyFillType.pftNonZero);
}

const holes = polygons => polygons.filter(p => !ClipperLib.Clipper.Orientation(p)).length;

// Làm dày (amount > 0) hoặc mỏng nét đều mọi phía, giữ góc tròn. Trả null nếu lòng chữ bị bít hoặc nét đứt.
export function adjustWeight(glyph, amount) {
  if (!amount) return { ...glyph };
  const polygons = toPolygons(glyph.d);
  const largest = polygons.reduce((best, p) => Math.abs(ClipperLib.Clipper.Area(p)) > Math.abs(ClipperLib.Clipper.Area(best)) ? p : best, []);
  if (largest.length && !ClipperLib.Clipper.Orientation(largest)) polygons.forEach(p => p.reverse());
  const offset = new ClipperLib.ClipperOffset(2, .5);
  offset.AddPaths(polygons, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const result = new ClipperLib.Paths();
  offset.Execute(result, amount * SCALE);
  if (!result.length || result.length !== polygons.length || holes(result) !== holes(polygons)) return null;
  const d = result.map(p => 'M' + p.map(q => (q.X / SCALE + amount).toFixed(1) + ' ' + (q.Y / SCALE).toFixed(1)).join(' L') + ' Z').join(' ');
  return { ...glyph, d, advance: Math.max(1, Math.round(glyph.advance + 2 * amount)) };
}

const tableOffset = weight => familyWeights.find(item => item.weight === weight)?.offset;

// Chênh lệch nửa độ dày nét giữa hai kiểu: đo thân l/I nếu cả hai kiểu đều có, không thì dùng bảng độ đậm.
export function weightShift(donorGlyphs, targetGlyphs, donorWeight, targetWeight) {
  const has = glyphs => ['l', 'I', 'i'].some(char => glyphs.get(char)?.d);
  if (has(donorGlyphs) && has(targetGlyphs)) return (measureStem(targetGlyphs) - measureStem(donorGlyphs)) / 2;
  const a = tableOffset(donorWeight), b = tableOffset(targetWeight);
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
}

// styles: các kiểu của dự án [{name, weight, italic, glyphs:[...]}]; target: Map ký tự → glyph đang sửa.
export function borrowMissing({ styles, target, weight, italic, chars }) {
  const donors = styles.filter(style => style.glyphs?.some(g => g.d) && !!style.italic === !!italic && style.weight !== weight)
    .sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight));
  const added = [], rejected = [];
  for (const char of chars) {
    if (target.get(char)?.d) continue;
    for (const style of donors) {
      const source = style.glyphs.find(g => g.char === char && g.d);
      if (!source) continue;
      const donorMap = new Map(style.glyphs.map(g => [g.char, g]));
      const shift = weightShift(donorMap, target, style.weight, weight);
      const adjusted = adjustWeight(source, shift);
      if (!adjusted) { rejected.push(char); break; }
      added.push({ ...adjusted, char, origin: 'inferred', source: 'Mượn từ ' + style.name, borrowedFrom: style.name,
        weightShift: Math.round(shift * 10) / 10, approved: false, locked: false, proof: undefined, sourceImageId: undefined,
        pixelCrop: undefined, pixelOutline: undefined, reference: undefined, version: undefined, history: [] });
      break;
    }
  }
  return { added, rejected, donors: donors.map(style => style.name) };
}
