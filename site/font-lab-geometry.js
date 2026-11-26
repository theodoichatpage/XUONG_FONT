// Phép hình học cho Font Lab. Một contour là danh sách điểm neo { x, y, in, out, smooth }: in/out là tay nắm (null = đoạn
// thẳng phía đó). Tọa độ đơn vị font (UPM 1000, y hướng lên). Không đụng DOM, kiểm được bằng node.
import svgpath from 'svgpath';

export const clone = value => JSON.parse(JSON.stringify(value));
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = v => Math.hypot(v.x, v.y);
const unit = v => { const n = len(v); return n ? { x: v.x / n, y: v.y / n } : { x: 0, y: 0 }; };
const along = (p, v, s) => ({ x: p.x + v.x * s, y: p.y + v.y * s });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const round = v => Math.round(v * 10) / 10;
const point = p => ({ x: p.x, y: p.y });

// ---- Đọc và ghi ------------------------------------------------------------------------------------------------------
export function parseOutline(d) {
  const contours = [];
  let contour = null, current = { x: 0, y: 0 };
  const close = () => {
    if (!contour) return;
    if (contour.length > 1) {
      const first = contour[0], last = contour.at(-1);
      if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) { first.in = last.in; contour.pop(); }
    }
    if (contour.length) contours.push(contour);
    contour = null;
  };
  for (const s of svgpath(d).abs().unshort().unarc().segments) {
    const k = s[0].toUpperCase();
    if (k === 'M') { close(); contour = [{ x: s[1], y: s[2], in: null, out: null }]; current = { x: s[1], y: s[2] }; continue; }
    if (k === 'Z') { close(); continue; }
    if (!contour) continue;
    let to, c1 = null, c2 = null;
    if (k === 'L') to = { x: s[1], y: s[2] };
    else if (k === 'H') to = { x: s[1], y: current.y };
    else if (k === 'V') to = { x: current.x, y: s[1] };
    else if (k === 'C') { c1 = { x: s[1], y: s[2] }; c2 = { x: s[3], y: s[4] }; to = { x: s[5], y: s[6] }; }
    else if (k === 'Q') {
      const q = { x: s[1], y: s[2] }; to = { x: s[3], y: s[4] };
      c1 = along(current, sub(q, current), 2 / 3); c2 = along(to, sub(q, to), 2 / 3);
    } else continue;
    // Đoạn thẳng dài 0 (font nhập hay có "L" tới đúng điểm vừa tới): bỏ, không tạo điểm trùng.
    if (!c1 && Math.hypot(to.x - current.x, to.y - current.y) < 1e-3) continue;
    if (c1) contour.at(-1).out = c1;
    contour.push({ x: to.x, y: to.y, in: c2, out: null });
    current = to;
  }
  close();
  for (const list of contours) for (const node of list) {
    if (node.in && len(sub(node.in, node)) < .01) node.in = null;
    if (node.out && len(sub(node.out, node)) < .01) node.out = null;
    node.smooth = isSmooth(node);
  }
  return contours;
}

export function isSmooth(node) {
  if (!node.in || !node.out) return false;
  const a = unit(sub(node, node.in)), b = unit(sub(node.out, node));
  return dot(a, b) > Math.cos(4 * Math.PI / 180);
}

export function serializeOutline(contours) {
  return contours.filter(c => c.length >= 2).map(c => {
    let s = `M${round(c[0].x)} ${round(c[0].y)}`;
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if (a.out || b.in) {
        const p = a.out ?? a, q = b.in ?? b;
        s += `C${round(p.x)} ${round(p.y)} ${round(q.x)} ${round(q.y)} ${round(b.x)} ${round(b.y)}`;
      } else s += `L${round(b.x)} ${round(b.y)}`;
    }
    return s + 'Z';
  }).join('');
}

// ---- Đường cong ------------------------------------------------------------------------------------------------------
export const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
};
export const segment = (a, b) => [point(a), point(a.out ?? a), point(b.in ?? b), point(b)];
export const samples = (a, b, steps) => { const [p0, p1, p2, p3] = segment(a, b); return Array.from({ length: steps + 1 }, (_, k) => bezier(p0, p1, p2, p3, k / steps)); };

function split(p0, p1, p2, p3, t) {
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t), d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t);
  return [[p0, a, d, f], [f, e, c, p3]];
}

// Chèn điểm vào đoạn từ điểm i tới điểm sau, tại tham số t. Trả về chỉ số điểm mới.
export function insertNode(contour, i, t) {
  const a = contour[i], b = contour[(i + 1) % contour.length];
  if (!a.out && !b.in) {
    const p = lerp(a, b, t);
    contour.splice(i + 1, 0, { x: p.x, y: p.y, in: null, out: null, smooth: false });
    return i + 1;
  }
  const [left, right] = split(...segment(a, b), t);
  a.out = left[1];
  b.in = right[2];
  contour.splice(i + 1, 0, { x: left[3].x, y: left[3].y, in: left[2], out: right[1], smooth: true });
  return i + 1;
}

// Thêm điểm cực trị (chỗ tiếp tuyến nằm ngang hoặc đứng) trên mọi đoạn cong, như "Add extremes" của FontLab.
export function addExtremes(contour) {
  let added = 0;
  for (let i = contour.length - 1; i >= 0; i--) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    if (!a.out && !b.in) continue;
    const [p0, p1, p2, p3] = segment(a, b), ts = [];
    for (const axis of ['x', 'y']) {
      const A = p1[axis] - p0[axis], B = p2[axis] - p1[axis], C = p3[axis] - p2[axis];
      const qa = A - 2 * B + C, qb = 2 * (B - A), qc = A;
      if (Math.abs(qa) < 1e-9) { if (Math.abs(qb) > 1e-9) ts.push(-qc / qb); continue; }
      const disc = qb * qb - 4 * qa * qc;
      if (disc < 0) continue;
      const r = Math.sqrt(disc);
      ts.push((-qb + r) / (2 * qa), (-qb - r) / (2 * qa));
    }
    const valid = [...new Set(ts.filter(t => t > .03 && t < .97).map(t => Math.round(t * 1e4) / 1e4))].sort((x, y) => x - y);
    let done = 0, index = i;
    for (const t of valid) { index = insertNode(contour, index, (t - done) / (1 - done)); done = t; added++; }
  }
  return added;
}

// Xóa điểm i: hai đoạn hai bên gộp thành một; có đường cong thì khớp một đường cong bậc ba qua các điểm lấy mẫu của hai
// đoạn cũ, giữ hướng tiếp tuyến ở hai đầu (cách khớp của Schneider).
export function removeNode(contour, i) {
  const n = contour.length;
  if (n <= 2) return false;
  const p = contour[(i - 1 + n) % n], q = contour[i], r = contour[(i + 1) % n];
  const curved = p.out || q.in || q.out || r.in;
  const points = [...samples(p, q, 12), ...samples(q, r, 12).slice(1)];
  contour.splice(contour.indexOf(q), 1);
  if (!curved) return true;
  const lengths = [0];
  for (let k = 1; k < points.length; k++) lengths.push(lengths[k - 1] + len(sub(points[k], points[k - 1])));
  const total = lengths.at(-1) || 1;
  const t0 = unit(sub(p.out ?? q.in ?? q, p)), t1 = unit(sub(r.in ?? q.out ?? q, r));
  let c11 = 0, c12 = 0, c22 = 0, x1 = 0, x2 = 0;
  points.forEach((pt, k) => {
    const u = lengths[k] / total, v = 1 - u;
    const b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
    const a1 = { x: t0.x * b1, y: t0.y * b1 }, a2 = { x: t1.x * b2, y: t1.y * b2 };
    const rest = { x: pt.x - (p.x * (b0 + b1) + r.x * (b2 + b3)), y: pt.y - (p.y * (b0 + b1) + r.y * (b2 + b3)) };
    c11 += dot(a1, a1); c12 += dot(a1, a2); c22 += dot(a2, a2); x1 += dot(rest, a1); x2 += dot(rest, a2);
  });
  const det = c11 * c22 - c12 * c12, chord = len(sub(r, p));
  let alpha1 = det ? (x1 * c22 - x2 * c12) / det : 0, alpha2 = det ? (c11 * x2 - c12 * x1) / det : 0;
  if (!(alpha1 > chord * 1e-3) || !(alpha2 > chord * 1e-3) || alpha1 > chord * 2 || alpha2 > chord * 2) alpha1 = alpha2 = chord / 3;
  p.out = along(p, t0, alpha1);
  r.in = along(r, t1, alpha2);
  return true;
}

// Khoảng lệch lớn nhất giữa hai đường gấp khúc (hai chiều).
function deviation(a, b) {
  const near = (pt, list) => {
    let best = Infinity;
    for (let k = 1; k < list.length; k++) {
      const s = list[k - 1], e = list[k], v = sub(e, s), n = dot(v, v);
      const t = n ? Math.max(0, Math.min(1, dot(sub(pt, s), v) / n)) : 0;
      best = Math.min(best, len(sub(pt, along(s, v, t))));
    }
    return best;
  };
  return Math.max(...a.map(pt => near(pt, b)), ...b.map(pt => near(pt, a)));
}

function turnAt(contour, i) {
  const n = contour.length, node = contour[i], prev = contour[(i - 1 + n) % n], next = contour[(i + 1) % n];
  const into = unit(sub(node, node.in ?? prev.out ?? prev)), out = unit(sub(node.out ?? next.in ?? next, node));
  return Math.acos(Math.max(-1, Math.min(1, dot(into, out)))) * 180 / Math.PI;
}

function isExtreme(contour, i) {
  const node = contour[i];
  if (!node.in && !node.out) return false;
  const t = unit(sub(node.out ?? node, node.in ?? node));
  return Math.abs(t.x) < Math.sin(3 * Math.PI / 180) || Math.abs(t.y) < Math.sin(3 * Math.PI / 180);
}

// Bớt điểm thừa (nét vẽ lại từ ảnh có nhiều điểm không cần): bỏ từng điểm nếu đường mới lệch đường cũ không quá
// `tolerance` đơn vị. Giữ góc thật (nét quay > 25°) và điểm cực trị như cách vẽ font chuẩn.
export function simplifyContour(contour, tolerance = 3, keep = () => false) {
  let removed = 0, changed = true;
  while (changed && contour.length > 3) {
    changed = false;
    for (let i = 0; i < contour.length && contour.length > 3; i++) {
      const node = contour[i];
      if (keep(node) || turnAt(contour, i) > 25 || isExtreme(contour, i)) continue;
      const n = contour.length, prev = contour[(i - 1 + n) % n], next = contour[(i + 1) % n];
      const before = [...samples(prev, node, 16), ...samples(node, next, 16).slice(1)];
      const trial = clone(contour);
      removeNode(trial, i);
      // Sau khi bỏ điểm i, điểm trước nằm ở i − 1 (hoặc cuối danh sách khi i = 0).
      const pIndex = i === 0 ? n - 2 : i - 1, a = trial[pIndex], b = trial[(pIndex + 1) % trial.length];
      if (deviation(before, samples(a, b, 32)) > tolerance) continue;
      contour.splice(0, contour.length, ...trial);
      for (const p of contour) p.smooth = p.smooth && !!p.in && !!p.out;
      removed++; changed = true; i--;
    }
  }
  return removed;
}

// Đổi điểm góc ↔ điểm cong. Điểm cong mới: hai tay nắm thẳng hàng theo hướng từ điểm trước tới điểm sau.
export function toggleSmooth(contour, i) {
  const node = contour[i];
  if (node.smooth) { node.smooth = false; return; }
  makeSmooth(contour, i, false);
}

// Cong đều: tay nắm thẳng hàng theo hướng điểm trước → điểm sau, dài 0,36 khoảng cách tới điểm bên cạnh.
export function makeSmooth(contour, i, even = true) {
  const node = contour[i], n = contour.length, prev = contour[(i - 1 + n) % n], next = contour[(i + 1) % n];
  const tangent = unit(sub(next, prev));
  const back = !even && node.in ? len(sub(node, node.in)) : len(sub(node, prev)) * .36;
  const ahead = !even && node.out ? len(sub(node.out, node)) : len(sub(next, node)) * .36;
  node.in = along(node, tangent, -back);
  node.out = along(node, tangent, ahead);
  node.smooth = true;
}

// Góc nhọn: thu tay nắm về điểm (hợp cho chân chữ, mũi dấu).
// Góc nhọn (như FontLab): giữ nguyên hai tay nắm, chỉ tách để kéo riêng từng bên. Điểm đã là góc mà bấm lần nữa
// thì thu hẳn tay nắm (hai cạnh thẳng vào góc, hợp cho mũi dấu, chân chữ).
export function makeCorner(contour, i) {
  const node = contour[i];
  if (node.smooth) { node.smooth = false; return; }
  node.in = node.out = null;
}

// Đoạn giữa hai điểm liền nhau: thẳng hoặc cong (tay nắm ở 1/3 và 2/3).
export function makeLine(contour, i) {
  const a = contour[i], b = contour[(i + 1) % contour.length];
  a.out = null; b.in = null; a.smooth = b.smooth = false;
}
export function makeCurve(contour, i) {
  const a = contour[i], b = contour[(i + 1) % contour.length];
  if (a.out && b.in) return;
  if (!a.out) a.out = lerp(a, b, 1 / 3);
  if (!b.in) b.in = lerp(a, b, 2 / 3);
}

// Cân tay nắm (như "Balance" của FontLab): hai tay nắm của một đoạn cong có cùng độ căng, giữ nguyên hướng.
export function balanceSegment(contour, i) {
  const a = contour[i], b = contour[(i + 1) % contour.length];
  if (!a.out || !b.in) return false;
  const d1 = sub(a.out, a), d2 = sub(b.in, b), w = sub(b, a);
  const det = d1.x * -d2.y - d1.y * -d2.x;
  if (Math.abs(det) < 1e-9) return false;
  const s = (w.x * -d2.y - w.y * -d2.x) / det, t = (d1.x * w.y - d1.y * w.x) / det;
  if (s <= 1e-6 || t <= 1e-6) return false;
  const tension = (1 / s + 1 / t) / 2;
  a.out = along(a, d1, s * tension);
  b.in = along(b, d2, t * tension);
  return true;
}

// Điểm nghi xù: nét quay ngược gắt (> 150°) tại điểm, hoặc đoạn thẳng ngắn dưới 4/1000 em (bậc thang điểm ảnh).
export function roughNodes(contours) {
  const marks = new Set();
  contours.forEach((contour, c) => {
    const n = contour.length;
    if (n < 3) return;
    contour.forEach((node, i) => {
      if (turnAt(contour, i) > 150) marks.add(c + ':' + i);
      const next = contour[(i + 1) % n];
      if (!node.out && !next.in && len(sub(next, node)) < 4) { marks.add(c + ':' + i); marks.add(c + ':' + (i + 1) % n); }
    });
  });
  return marks;
}

// ---- Biến đổi --------------------------------------------------------------------------------------------------------
export function mapContour(contour, f) {
  return contour.map(node => ({ ...f(node), in: node.in && f(node.in), out: node.out && f(node.out), smooth: node.smooth }));
}
export function reverseContour(contour) {
  return contour.slice().reverse().map(node => ({ ...node, in: node.out, out: node.in }));
}
export function contourBox(contour) {
  const xs = [], ys = [];
  for (const node of contour) for (const p of [node, node.in, node.out]) if (p) { xs.push(p.x); ys.push(p.y); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
export function outlineBox(contours) {
  const boxes = contours.filter(c => c.length).map(contourBox);
  return { x0: Math.min(...boxes.map(b => b.x0)), x1: Math.max(...boxes.map(b => b.x1)), y0: Math.min(...boxes.map(b => b.y0)), y1: Math.max(...boxes.map(b => b.y1)) };
}
// Đáy thật của nét (theo điểm cong, không theo tay nắm).
export function inkBox(contours) {
  const pts = contours.flatMap(c => c.flatMap((node, i) => samples(node, c[(i + 1) % c.length], 8)));
  return { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) };
}

// Các điểm cắt của contour với đường thẳng đứng x = axis: { i, t } trên đoạn i.
function crossings(contour, axis) {
  const found = [];
  contour.forEach((a, i) => {
    const b = contour[(i + 1) % contour.length], [p0, p1, p2, p3] = segment(a, b);
    const fx = t => bezier(p0, p1, p2, p3, t).x - axis;
    let prev = fx(0);
    for (let k = 1; k <= 64; k++) {
      const t = k / 64, value = fx(t);
      if (prev === 0 && k === 1) found.push({ i, t: 0 });
      else if (prev < 0 !== value < 0 && value !== 0) {
        let lo = (k - 1) / 64, hi = t, flo = prev;
        for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2, fm = fx(mid); if (flo < 0 === fm < 0) { lo = mid; flo = fm; } else hi = mid; }
        found.push({ i, t: (lo + hi) / 2 });
      }
      prev = value;
    }
  });
  // Điểm cắt sát một điểm có sẵn (đỉnh, đáy chữ O nằm đúng trục): dùng luôn điểm đó, không chèn điểm gần trùng.
  const n = contour.length, seen = new Set();
  return found.map(({ i, t }) => t > .99 ? { i: (i + 1) % n, t: 0 } : t < .01 ? { i, t: 0 } : { i, t })
    .filter(({ i, t }) => t > 0 || !seen.has(i) && seen.add(i));
}

// Đối xứng theo trục đứng: giữ nửa `side` ('left' | 'right') rồi lật sang nửa kia, như chữ U, O, A, V, H.
// Contour cắt trục đúng hai lần thì ghép nửa giữ lại với ảnh lật của nó; contour nằm trọn một bên thì giữ bên được chọn
// và thêm ảnh lật. Trả về null nếu có contour cắt trục số lần khác 0 hoặc 2.
export function symmetrize(contours, axis, side = 'left') {
  const keepSide = p => side === 'left' ? p.x < axis : p.x > axis;
  const mirror = p => p && { x: 2 * axis - p.x, y: p.y };
  const result = [];
  for (const original of contours) {
    const contour = clone(original), cuts = crossings(contour, axis);
    if (cuts.length === 0) {
      const mid = contourBox(contour);
      if (keepSide({ x: (mid.x0 + mid.x1) / 2 })) { result.push(contour, reverseContour(mapContour(contour, mirror))); }
      continue;
    }
    if (cuts.length !== 2) return null;
    // Chèn hai điểm cắt (đoạn sau trước để chỉ số đoạn trước không đổi).
    cuts.sort((a, b) => b.i - a.i || b.t - a.t);
    const made = [], lastT = new Map();
    for (const cut of cuts) {
      if (cut.t < 1e-6) { made.push(contour[cut.i]); continue; }
      // Hai điểm cắt trên cùng một đoạn: sau khi tách ở điểm sau, đoạn i chỉ còn phần [0, t trước].
      const before = lastT.get(cut.i);
      made.push(contour[insertNode(contour, cut.i, before ? cut.t / before : cut.t)]);
      lastT.set(cut.i, cut.t);
    }
    for (const node of made) node.x = axis;
    const ia = contour.indexOf(made[0]), ib = contour.indexOf(made[1]), n = contour.length;
    const arc = (from, to) => { const list = []; for (let k = from; ; k = (k + 1) % n) { list.push(contour[k]); if (k === to) break; } return list; };
    const first = arc(ia, ib), second = arc(ib, ia);
    const inside = list => list.slice(1, -1);
    const kept = inside(first).some(keepSide) || !inside(second).some(keepSide) ? first : second;

    const keptNodes = kept.map(node => ({ ...node, in: node.in && { ...node.in }, out: node.out && { ...node.out } }));
    keptNodes[0].in = mirror(keptNodes[0].out);
    keptNodes.at(-1).out = mirror(keptNodes.at(-1).in);
    keptNodes[0].smooth = !!keptNodes[0].out; keptNodes.at(-1).smooth = !!keptNodes.at(-1).in;
    // Điểm cong nằm trên trục đối xứng phải có tiếp tuyến nằm ngang, nếu không chỗ ghép bị gãy nhẹ.
    for (const node of [keptNodes[0], keptNodes.at(-1)]) {
      if (!made.some(m => m.x === node.x && m.y === node.y && m.smooth)) continue;
      if (node.in) node.in.y = node.y;
      if (node.out) node.out.y = node.y;
    }
    const mirrored = kept.slice(1, -1).reverse().map(node => ({ ...mirror(node), in: mirror(node.out), out: mirror(node.in), smooth: node.smooth }));

    result.push([...keptNodes, ...mirrored]);
  }
  return result;
}
