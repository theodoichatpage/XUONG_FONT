import opentype from 'opentype.js';
import ClipperLib from 'clipper-lib';
import svg2ttf from 'svg2ttf';
import { familyWeights, familyStyles } from './family-styles.js';
import { familyPreflight, missingFamilyStyles } from './family-validation.js';
import { charset, composeVietnamese } from './vietnamese.js';
import { auditMarks, auditMessage } from './rule-audit.js';
import svgpath from 'svgpath';
import outline from '../scripts/lib/outline-metrics.cjs';
const checkSet = new Set(charset);
const { applyStyleMetadata } = require('../src/font-style-metadata');
const escapeXML = value => String(value).replace(/[&<>"']/g, ch => '&#' + ch.codePointAt(0) + ';');
const { addKerning } = require('../src/kern-table');

// Chữ Việt có dấu (trừ râu ơ ư và Đ đ vốn liền thân).
const isAccented = char => checkSet.has(char) && [...char.normalize('NFD')].length > 1;
const toD = (path, upm) => svgpath(path.toPathData(3)).scale(1000 / upm).toString();
function fromD(d, upm) {
  const output = new opentype.Path();
  svgpath(d).scale(upm / 1000).abs().unshort().unarc().iterate(segment => {
    const [c, ...v] = segment;
    if (c === 'M') output.moveTo(v[0], v[1]);
    else if (c === 'L') output.lineTo(v[0], v[1]);
    else if (c === 'Q') output.quadraticCurveTo(v[0], v[1], v[2], v[3]);
    else if (c === 'C') output.curveTo(v[0], v[1], v[2], v[3], v[4], v[5]);
    else if (c === 'Z') output.close();
  });
  return output;
}
// Ghép lại chữ có dấu sau khi đổi độ đậm, từ thân chữ đã đổi độ đậm và dấu của nhà thiết kế.
// upright[i].light: bản chữ có dấu chỉ đổi độ đậm 0.27 lần (bề dày dấu tăng chậm hơn thân: skill "Bề dày theo độ đậm"),
// dùng làm nguồn hình dấu; dấu được đặt lại theo chuẩn đo (khoảng hở, hai tầng) như Tạo dấu tiếng Việt.
function recomposeWelded(upright, targetsIndex, codePointsByGlyph, upm) {
  const glyphs = new Map(), indexOf = new Map(), targets = new Set();
  upright.forEach(({ path, light, advance }, i) => {
    for (const code of codePointsByGlyph.get(i) || []) {
      const char = String.fromCodePoint(code), shape = targetsIndex.has(i) && light ? light : path;
      indexOf.set(char, i);
      if (targetsIndex.has(i)) targets.add(char);
      if (shape.commands.length || char === ' ') glyphs.set(char, { char, d: shape.commands.length ? toD(shape, upm) : '', advance: advance * 1000 / upm, source: 'Font gốc' });
    }
  });
  const out = new Map();
  for (const glyph of composeVietnamese(glyphs, char => targets.has(char))) {
    if (!targets.has(glyph.char) || !glyph.d) continue;
    out.set(indexOf.get(glyph.char), { path: fromD(glyph.d, upm), advance: glyph.advance * upm / 1000 });
  }
  return out;
}

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

const CL = ClipperLib;
function prepared(path) {
  const polygons = CL.Clipper.SimplifyPolygons(contours(path), CL.PolyFillType.pftNonZero);
  // The largest contour determines the exterior winding.
  const largest = polygons.reduce((best, polygon) =>
    Math.abs(CL.Clipper.Area(polygon)) > Math.abs(CL.Clipper.Area(best)) ? polygon : best, []);
  if (largest.length && !CL.Clipper.Orientation(largest)) polygons.forEach(polygon => polygon.reverse());
  return polygons;
}
// Nới/thu nét song song từng cạnh. Góc nhọn (miter), không bo tròn: font góc sắc (UTM Bebas...) giữ góc chân chữ và
// đỉnh nét. Đường cong đã được chia nhỏ thành đoạn ngắn nên vẫn cong mượt. Góc dài hơn `limit` lần độ nới bị cắt bằng.
function offsetPolygons(polygons, amount, limit, join = CL.JoinType.jtMiter) {
  const offset = new CL.ClipperOffset(limit, .5);
  offset.AddPaths(polygons, join, CL.EndType.etClosedPolygon);
  const result = new CL.Paths();
  offset.Execute(result, amount * 16);
  if (polygons.length && !result.length) throw new Error('Không thể cân nét một ký tự. Hãy giảm độ đậm.');
  return result;
}
function toPath(polygons, amount) {
  const output = new opentype.Path();
  for (const polygon of polygons) {
    if (!polygon.length) continue;
    output.moveTo(polygon[0].X / 16 + amount, polygon[0].Y / 16);
    for (const point of polygon.slice(1)) output.lineTo(point.X / 16 + amount, point.Y / 16);
    output.close();
  }
  return output;
}
function clip(type, subject, clipPaths) {
  const clipper = new CL.Clipper(), out = new CL.Paths();
  clipper.AddPaths(subject, CL.PolyType.ptSubject, true);
  if (clipPaths.length) clipper.AddPaths(clipPaths, CL.PolyType.ptClip, true);
  clipper.Execute(type, out, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return out;
}
const shapeOf = polygons => {
  const simple = CL.Clipper.SimplifyPolygons(polygons, CL.PolyFillType.pftNonZero).filter(p => Math.abs(CL.Clipper.Area(p)) > 256);
  const positive = simple.filter(p => CL.Clipper.Orientation(p)).length;
  return [simple.length, Math.min(positive, simple.length - positive)].join(':');
};
// Mũi nhọn bị cắt để khỏi đâm xuyên nét để lại một đoạn bằng (lòng A, khe M thành đường ngang). Thu đoạn đó về một điểm
// để góc vẫn nhọn: giữ đầu mút nằm trên cạnh đứng/ngang (thân M vẫn thẳng), cạnh xiên đổi góc rất nhẹ; hai cạnh đều xiên
// thì nhọn ở giữa đoạn cắt.
function repoint(result, source, amount) {
  // Cạnh thường của bản thu mảnh song song với một cạnh gốc và cách nó đúng độ thu; đoạn cắt mũi nhọn thì không.
  const distance = Math.abs(amount) * 16, edges = source.flatMap(polygon => polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length]]));
  const offsetEdge = (a, b) => edges.some(([p, q]) => {
    const dx = q.X - p.X, dy = q.Y - p.Y, length = Math.hypot(dx, dy), ex = b.X - a.X, ey = b.Y - a.Y;
    if (!length || Math.abs(dx * ey - dy * ex) > .01 * length * Math.hypot(ex, ey)) return false;
    return Math.abs(Math.abs((a.X - p.X) * dy - (a.Y - p.Y) * dx) / length - distance) < 24;
  });
  const cuts = [];
  for (const polygon of result) polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (Math.hypot(b.X - a.X, b.Y - a.Y) < 4 * distance && !offsetEdge(a, b)) cuts.push([a, b]);
  });
  const near = (p, q) => Math.hypot(p.X - q.X, p.Y - q.Y) < 32;
  const isCut = (a, b) => cuts.some(([p, q]) => (near(a, p) && near(b, q)) || (near(a, q) && near(b, p)));
  const straight = (a, b) => Math.min(Math.abs(b.X - a.X), Math.abs(b.Y - a.Y)) < .02 * Math.hypot(b.X - a.X, b.Y - a.Y);
  return result.map(polygon => {
    const out = polygon.slice();
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if (!isCut(a, b)) continue;
      const before = out[(i - 1 + out.length) % out.length], after = out[(i + 2) % out.length];
      const keepA = straight(before, a), keepB = straight(b, after);
      const tip = keepA && !keepB ? a : keepB && !keepA ? b : { X: Math.round((a.X + b.X) / 2), Y: Math.round((a.Y + b.Y) / 2) };
      out.splice(i, 1, tip);
      out.splice((i + 1) % out.length, 1);
      if (i >= out.length) break;
    }
    return out;
  });
}
function embolden(path, amount, limit = 6, join = CL.JoinType.jtMiter) {
  return toPath(offsetPolygons(prepared(path), amount, limit, join), amount);
}
const topology = value => shapeOf(contours(value));
// Thu mảnh: góc từ 60° trở lên giữ đúng đường song song. Góc hẹp hơn (khe giữa chữ M, đỉnh lòng chữ A, chỗ nối móc
// số 6) nếu để trọn mũi nhọn sẽ đâm sâu vào nét hoặc xuyên thủng nét, nên cắt ở 2 lần độ thu rồi thu chỗ cắt về một
// điểm: góc vẫn nhọn, không thành đường ngang. Làm đậm: giữ giới hạn mũi nhọn 6 lần; mũi nào làm dính nét thì chỉ
// cắt riêng mũi đó ở 2 lần. Cuối cùng mới bo tròn cả glyph.
// Thu mảnh: mỗi mũi nhọn (góc lõm hẹp) đi sâu theo đúng đường song song, chỉ dừng lại khi phần nét còn lại phía trước
// mỏng hơn `wall` (≈ nét đã thu mảnh), và không sâu quá 6 lần độ thu (tránh khe dài ở chỗ nối móc số 6). Không cắt mọi
// mũi ở 2 lần độ thu rồi kéo về một điểm: như vậy cạnh xiên của M, A bị kéo lệch, nét thành hình nêm, dày mỏng không đều.
function truncateSpikes(source, amount, wall) {
  const d = Math.abs(amount) * 16, minWall = wall * 16;
  const high = offsetPolygons(source, amount, 1000), low = offsetPolygons(source, amount, 2);
  const missing = clip(CL.ClipType.ctDifference, low, high);
  if (!missing.length) return high;
  const edges = source.flatMap(polygon => polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length]]));
  const restored = [];
  for (const polygon of source) {
    const sign = Math.sign(CL.Clipper.Area(polygon));
    polygon.forEach((vertex, i) => {
      const prev = polygon[(i - 1 + polygon.length) % polygon.length], next = polygon[(i + 1) % polygon.length];
      const ax = prev.X - vertex.X, ay = prev.Y - vertex.Y, cx = next.X - vertex.X, cy = next.Y - vertex.Y;
      const la = Math.hypot(ax, ay), lc = Math.hypot(cx, cy);
      if (!la || !lc) return;
      // Góc lõm (phía vật liệu > 180°) và hẹp hơn 60°: mũi nhọn dài hơn 2 lần độ thu.
      const cross = (vertex.X - prev.X) * cy - (vertex.Y - prev.Y) * cx;
      if (cross * sign >= 0) return;
      const ex = ax / la + cx / lc, ey = ay / la + cy / lc, el = Math.hypot(ex, ey);
      if (!el) return;
      const half = Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / (la * lc)))) / 2;
      if (Math.sin(half) > .5) return;
      const bx = -ex / el, by = -ey / el, tip = d / Math.sin(half);
      // Tia từ đỉnh góc theo hướng mũi nhọn: khoảng tới mép nét phía trước (bỏ hai cạnh tạo góc).
      let exit = Infinity;
      for (const [p, q] of edges) {
        if (p === vertex || q === vertex) continue;
        const fx = q.X - p.X, fy = q.Y - p.Y, den = bx * fy - by * fx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((p.X - vertex.X) * fy - (p.Y - vertex.Y) * fx) / den, u = ((p.X - vertex.X) * by - (p.Y - vertex.Y) * bx) / den;
        if (t > 1 && u >= 0 && u <= 1) exit = Math.min(exit, t);
      }
      const depth = Math.max(d, Math.min(exit - d - minWall, 6 * d));
      if (depth >= tip) return;
      // Dải dọc theo mũi nhọn, từ độ sâu cho phép tới quá đầu mũi; chỉ trả lại phần vật liệu đã bị mũi nhọn lấy đi.
      const width = (tip - depth) * Math.tan(half) + 32, far = Math.max(tip, exit) + d, nx = -by, ny = bx;
      const strip = [[depth, width], [depth, -width], [far, -width], [far, width]]
        .map(([along, side]) => ({ X: Math.round(vertex.X + bx * along + nx * side), Y: Math.round(vertex.Y + by * along + ny * side) }));
      if (!CL.Clipper.Orientation(strip)) strip.reverse();
      restored.push(...clip(CL.ClipType.ctIntersection, missing, [strip]));
    });
  }
  // Nới phần trả lại ¼ đơn vị để dính liền với nét (cạnh chung trùng khít dễ bị làm tròn hở).
  return restored.length ? clip(CL.ClipType.ctUnion, high, offsetPolygons(restored, .25, 2)) : high;
}
function reweigh(path, amount, wall = 2 * Math.abs(amount)) {
  const source = prepared(path), before = shapeOf(source);
  if (amount < 0) {
    const trimmed = truncateSpikes(source, amount, wall);
    if (shapeOf(trimmed) === before) return toPath(trimmed, amount);
    const low = offsetPolygons(source, amount, 2);
    if (shapeOf(low) === before) {
      const pointed = repoint(low, source, amount);
      return toPath(shapeOf(pointed) === before ? pointed : low, amount);
    }
  } else {
    const high = offsetPolygons(source, amount, 6);
    if (shapeOf(high) === before) return toPath(high, amount);
    const low = offsetPolygons(source, amount, 2);
    if (shapeOf(low) === before) {
      // Phần khác nhau giữa hai bản là các mũi nhọn; chỉ cắt những mũi làm dính nét.
      const pieces = clip(CL.ClipType.ctDifference, high, low).filter(piece => Math.abs(CL.Clipper.Area(piece)) > 64);
      const apply = list => clip(CL.ClipType.ctDifference, high, list);
      let needed = pieces;
      for (const piece of pieces) {
        const rest = needed.filter(other => other !== piece);
        if (shapeOf(apply(rest)) === before) needed = rest;
      }
      const result = apply(needed);
      return toPath(shapeOf(result) === before ? result : low, amount);
    }
  }
  const round = offsetPolygons(source, amount, 2, CL.JoinType.jtRound);
  return toPath(shapeOf(round) === before ? round : offsetPolygons(source, amount, 6), amount);
}

// Bề dày dấu theo độ đậm (skill, mark-standards "Bề dày theo độ đậm"): dấu ≈ min(20 + 0.27 × thân, 0.75 × thân)
// (thang 1000), giữ tỷ lệ riêng của nhà thiết kế: dấu mới = dấu gốc × f(thân mới) / f(thân gốc). Tính riêng từng chữ
// (bề dày 2A/P của chính dấu đó): đổi cùng một độ cho mọi dấu làm dấu mảnh (móc hỏi) gầy hẳn so với dấu dày (trăng, mũ)
// ở kiểu Thin, nét dấu không đều. Thu mảnh còn giữ cỡ dấu (Segoe UI Light so với Regular: cao dấu chỉ giảm ~8%).
// Trả về hàm cho độ nới mỗi bên (đơn vị font) phần dấu của một glyph, và vùng để phóng dấu về cỡ cũ; null nếu không đo được thân.
function markShifter(source, amount, upm) {
  const flat = glyph => glyph?.index && glyph.path.commands.length ? outline.flatten(toD(glyph.path, upm)) : null;
  const l = flat(source.charToGlyph('l')) || flat(source.charToGlyph('I')), stem = l && outline.stemWidth(l);
  if (!stem) return null;
  const next = stem + 2 * amount * 1000 / upm;
  if (!(next > 0)) return null;
  const f = s => Math.min(20 + .27 * s, .75 * s);
  const ratio = f(next) / f(stem);
  return (glyph, chars) => {
    // Chỉ đo và chỉnh riêng chữ Việt cần kiểm (các chữ có dấu khác dùng mức chung, tránh chậm với font nhiều glyph).
    // Nặng là chấm đặc, không thu mảnh như nét: giữ cỡ (Tạo dấu tiếng Việt đã giữ nặng ≥ 0.9 nét thân).
    if (!chars.some(char => checkSet.has(char))) return { shift: amount * .27 };
    if (amount < 0 && chars.every(char => char.normalize('NFD').includes('̣') && [...char.normalize('NFD')].length === 2)) return { shift: 0 };
    const base = chars.map(char => char.normalize('NFD')[0]).find(ch => ch && source.charToGlyph(ch)?.index);
    const own = flat(glyph), plain = base && flat(source.charToGlyph(base)), extra = own && plain ? outline.extraContours(own, plain) : [];
    const thickness = extra.length ? outline.strokeThickness(extra) : NaN;
    if (!(Number.isFinite(thickness) && thickness > 0)) return { shift: amount * .27 };
    if (amount > 0) return { shift: thickness * (ratio - 1) / 2 * upm / 1000 };
    // Thu mảnh: thu nét rồi phóng dấu về lại cỡ cũ (restoreMarks), rồi đo lại bề dày thật và chỉnh độ thu đến khi
    // đúng tỷ lệ × bề dày gốc (phóng lại làm nét dày lên nên không tính thẳng được). Giữ cỡ dấu như font chuyên nghiệp.
    const plainBox = outline.boxOf(plain), area = { top: plainBox.y1 * upm / 1000, bottom: plainBox.y0 * upm / 1000 };
    const measure = path => {
      const marks = outline.flatten(toD(path, upm)).filter(contour => { const b = outline.box(contour); return b.y0 > plainBox.y1 || b.y1 < plainBox.y0; });
      return marks.length ? outline.strokeThickness(marks) : NaN;
    };
    const target = ratio * thickness, build = shift => restoreMarks(reweigh(glyph.path, shift), shift, area);
    let a = thickness * (ratio - 1) / 2 * upm / 1000, ta = measure(build(a)), b = a * 1.6, tb = measure(build(b));
    for (let step = 0; step < 2 && Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(tb - target) > .5 && tb !== ta; step++) {
      const c = Math.min(0, b + (target - tb) * (b - a) / (tb - ta));
      [a, ta, b, tb] = [b, tb, c, measure(build(c))];
    }
    return Number.isFinite(tb) ? { shift: b, restore: area } : { shift: thickness * (ratio - 1) / 2 * upm / 1000 };
  };
}
// Phóng từng dấu (contour nằm hẳn trên đỉnh hoặc dưới chân chữ gốc) quanh tâm của nó về lại chiều cao trước khi thu nét;
// dấu dẹt rộng (ngã, trăng) không rộng hơn bản gốc.
function restoreMarks(path, shift, { top, bottom }) {
  const contours = [];
  for (const command of path.commands) {
    if (command.type === 'M') contours.push([]);
    contours.at(-1)?.push({ ...command });
  }
  for (const contour of contours) {
    const points = contour.filter(command => Number.isFinite(command.x));
    const ys = points.map(point => point.y), xs = points.map(point => point.x);
    const y0 = Math.min(...ys), y1 = Math.max(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (!(y0 > top || y1 < bottom) || !(y1 > y0)) continue;
    const scale = Math.min((y1 - y0 - 2 * shift) / (y1 - y0), (x1 - x0 - 2 * shift) / (x1 - x0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const command of contour) for (const [x, y] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) {
      if (!Number.isFinite(command[x])) continue;
      command[x] = cx + (command[x] - cx) * scale;
      command[y] = cy + (command[y] - cy) * scale;
    }
  }
  const output = new opentype.Path();
  output.commands = contours.flat();
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
  const stemGlyph = [source.charToGlyph('l'), source.charToGlyph('I')].find(glyph => glyph?.index && glyph.path.commands.length);
  const sourceStem = stemGlyph ? outline.stemWidth(outline.flatten(stemGlyph.path.toPathData(3))) || null : null;
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
    const amount = (target.offset - base.offset) * upm / 1000, keptOriginal = [], keptChars = new Set();
    const markShift = amount ? markShifter(source, amount, upm) : null;
    // Thành nét tối thiểu khi mũi nhọn của góc hẹp đi sâu vào (thu mảnh): 0.85 nét thân đã thu (đơn vị font).
    const wall = .85 * Math.max(2 * Math.abs(amount), (sourceStem ?? 0) + 2 * amount);
    const glyphs = [];
    let ascent = source.ascender, descent = source.descender;
    // Lượt 1: làm đậm/mảnh từng glyph ở dạng đứng và kiểm lòng chữ.
    const upright = [], welded = new Set();
    for (let i = 0; i < source.glyphs.length; i++) {
      const old = source.glyphs.get(i);
      const originalPath = old.path ?? new opentype.Path();
      const chars = (codePointsByGlyph.get(i) || []).map(code => String.fromCodePoint(code));
      const required = chars.some(char => checkSet.has(char));
      let path = originalPath, advance = old.advanceWidth ?? upm / 2;
      if (amount && originalPath.commands?.length) {
        try { path = reweigh(originalPath, amount, wall); advance += amount * 2; }
        catch (error) { if (required && !chars.some(isAccented) && chars.some(char => /[\p{L}\p{N}]/u.test(char))) throw error; keptOriginal.push(i); if (required) chars.forEach(char => keptChars.add(char)); }   // ký hiệu phụ quá mảnh: giữ nét gốc
        if (path !== originalPath && topology(originalPath) !== topology(path)) {
          // Chữ có dấu (Ấ, Õ...): nới nét làm dấu dính nhau/dính thân. Không bỏ cả kiểu: ghép lại ở lượt 2 từ
          // thân chữ và dấu đã làm đậm riêng, đặt dấu theo chuẩn đo như Tạo dấu tiếng Việt.
          // (glyph dùng chung cho cả chữ không dấu, như A và Á cùng một hình, vẫn phải giữ lòng chữ như chữ thường)
          if (chars.some(isAccented) && !chars.some(char => checkSet.has(char) && !isAccented(char))) welded.add(i);
          // Glyph ngoài bộ chữ cần kiểm (.notdef ở #0, ký hiệu ♠ ® ᵏ, chữ ngoại Ǻ Ⱥ): giữ nét gốc.
          // Dấu câu, ký hiệu (* % " ! ...): giữ nét gốc và báo, không bỏ cả kiểu vì một ký hiệu. Chữ cái, số vẫn phải giữ lòng chữ.
          else if (!required || !chars.some(char => /[\p{L}\p{N}]/u.test(char))) { path = originalPath; advance = old.advanceWidth ?? upm / 2; keptOriginal.push(i); if (required) chars.forEach(char => keptChars.add(char)); }
          else throw new Error('Biến đổi làm mất lòng chữ hoặc nối/tách nét tại ' + chars.join('/') + '. Giữ bản gốc; cần thiết kế lại mức đậm này.');
        }
      }
      // Chữ có dấu (trừ ơ ư Ơ Ư liền khối): giữ thêm bản đổi độ đậm nhẹ làm nguồn hình dấu, và ghép lại ở lượt 2
      // để khoảng hở dấu–thân không bị nới nét thu hẹp (đối chiếu quy tắc: Bold làm hở còn ~0.06 x-height).
      let light;
      if (amount && originalPath.commands?.length && chars.some(isAccented)) {
        try {
          const mark = markShift ? markShift(old, chars) : { shift: amount * .27 };
          light = reweigh(originalPath, mark.shift);
          if (mark.restore) light = restoreMarks(light, mark.shift, mark.restore);
        } catch { light = originalPath; }
        if (!chars.every(char => /^[ơưƠƯ]$/.test(char))) welded.add(i);
      }
      upright.push({ path, light, advance });
      if (i % 40 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    // Lượt 2: ghép lại chữ có dấu bị dính từ thân và dấu đã làm đậm (thang 1000, trục y lên như trình sửa).
    const recomposed = welded.size ? recomposeWelded(upright, welded, codePointsByGlyph, upm) : new Map();
    for (const i of welded) if (!recomposed.has(i)) throw new Error('Không ghép lại được ' + (codePointsByGlyph.get(i) || []).map(code => String.fromCodePoint(code)).join('/') + ' sau khi đổi độ đậm. Giữ bản gốc; cần thiết kế lại mức đậm này.');
    // Tự đối chiếu quy tắc skill trên kiểu vừa sinh (dạng đứng, thang 1000): mọi chữ đều do Xưởng biến đổi nên chấm hết.
    const auditMap = new Map();
    for (let i = 0; i < upright.length; i++) {
      const { path } = recomposed.get(i) || upright[i];
      if (!path.commands.length) continue;
      for (const code of codePointsByGlyph.get(i) || []) auditMap.set(String.fromCodePoint(code), { d: toD(path, upm), source: recomposed.has(i) ? 'Ghép dấu' : 'Font gốc' });
    }
    // Chỉ chấm chữ Xưởng ghép lại; chữ chỉ được nghiêng/đổi độ đậm giữ nét nhà thiết kế thì không chấm.
    const audit = auditMessage(auditMarks(auditMap)).trim() + (keptChars.size ? ' Giữ nét gốc (đổi độ đậm làm dính/tách nét): ' + [...keptChars].join(' ') + '.' : '');
    for (let i = 0; i < upright.length; i++) {
      let { path, advance } = recomposed.get(i) || upright[i];
      if (italic) path = slantPath(path, angle);
      // Avoid Glyph's constructor: opentype.js 1.x drops Unicode aliases there.
      glyphs.push({ unicodes: codePointsByGlyph.get(i) || [], advanceWidth: Math.max(0, Math.round(advance)), path });
      if (path.commands.length) {
        const bounds = path.getBoundingBox();
        ascent = Math.max(ascent, Math.ceil(bounds.y2));
        descent = Math.min(descent, Math.floor(bounds.y1));
      }
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
      if (index && point >= 32 && checkSet.has(String.fromCodePoint(point)) && source.glyphs.get(index).path.commands.length && !checked.charToGlyph(String.fromCodePoint(point)).path.commands.length) throw new Error('Bản xuất làm rỗng glyph ' + String.fromCodePoint(point));
    }
    await onResult({ name: family + ' ' + style, family, filename: family + '-' + style.replace(/ /g, '') + '.ttf',
      blob: new Blob([bytes], { type: 'font/ttf' }), style, weight, italic, draft: true, quality: { coverage: outputCheck.coverage.counts, checkedAt: new Date().toISOString(), optical: 'not-tested', method: 'outline-offset', oblique: italic, keptOriginal: keptOriginal.length, recomposed: recomposed.size, audit }, isSource: false, text });
    } catch (error) {
      if (!options.onError) throw error;
      await options.onError(style, error);
    }
  }
}
