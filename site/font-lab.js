// Font Lab: chỉnh tay nét một ký tự (nháy đúp ô chữ trong Bộ ký tự).
// Cách hiện điểm theo kiểu "logo construction": ô vuông là điểm góc, ô tròn là điểm cong, chấm nhỏ nối đường mảnh là
// tay nắm. Sửa được: kéo điểm/tay nắm, xóa điểm (giữ đường cong bằng cách khớp lại một đường cong bậc ba), đổi góc ↔ cong,
// chọn cả khối nét (contour) để dời, co giãn, xoay; làm sạch nét có xem trước; dựng lại dấu theo bảng quy tắc.
// Tọa độ: đơn vị font (UPM 1000, trục y hướng lên), giống glyph.d trong Xưởng.
import svgpath from 'svgpath';
import { cleanOutline } from './outline-cleanup.js';
import { outlineDefects } from './outline-quality.js';

const clone = value => JSON.parse(JSON.stringify(value));
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = v => Math.hypot(v.x, v.y);
const unit = v => { const n = len(v); return n ? { x: v.x / n, y: v.y / n } : { x: 0, y: 0 }; };
const along = (p, v, s) => ({ x: p.x + v.x * s, y: p.y + v.y * s });
const round = v => Math.round(v * 10) / 10;

// ---- Đọc và ghi đường nét ----------------------------------------------------------------------------------------
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

function isSmooth(node) {
  if (!node.in || !node.out) return false;
  const a = unit(sub(node, node.in)), b = unit(sub(node.out, node));
  return a.x * b.x + a.y * b.y > Math.cos(4 * Math.PI / 180);
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

// ---- Thao tác trên điểm -------------------------------------------------------------------------------------------
const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
};
const segmentPoints = (a, b, steps) => Array.from({ length: steps }, (_, k) => bezier(a, a.out ?? a, b.in ?? b, b, (k + 1) / steps));

// Xóa điểm i: hai đoạn hai bên gộp thành một. Đoạn thẳng gộp thành đoạn thẳng; có đường cong thì khớp một đường cong
// bậc ba qua các điểm lấy mẫu của hai đoạn cũ (giữ hướng tiếp tuyến ở hai đầu, cách khớp của Schneider).
export function removeNode(contour, i) {
  const n = contour.length;
  if (n <= 2) return false;
  const p = contour[(i - 1 + n) % n], q = contour[i], r = contour[(i + 1) % n];
  const curved = p.out || q.in || q.out || r.in;
  contour.splice(i, 1);
  if (!curved) return true;
  const samples = [p, ...segmentPoints(p, q, 12), ...segmentPoints(q, r, 12)];
  const lengths = [0];
  for (let k = 1; k < samples.length; k++) lengths.push(lengths[k - 1] + len(sub(samples[k], samples[k - 1])));
  const total = lengths.at(-1) || 1;
  const t0 = unit(sub(p.out ?? q.in ?? q, p)), t1 = unit(sub(r.in ?? q.out ?? q, r));
  let c11 = 0, c12 = 0, c22 = 0, x1 = 0, x2 = 0;
  samples.forEach((point, k) => {
    const u = lengths[k] / total, v = 1 - u;
    const b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
    const a1 = { x: t0.x * b1, y: t0.y * b1 }, a2 = { x: t1.x * b2, y: t1.y * b2 };
    const rest = { x: point.x - (p.x * (b0 + b1) + r.x * (b2 + b3)), y: point.y - (p.y * (b0 + b1) + r.y * (b2 + b3)) };
    c11 += a1.x * a1.x + a1.y * a1.y; c12 += a1.x * a2.x + a1.y * a2.y; c22 += a2.x * a2.x + a2.y * a2.y;
    x1 += rest.x * a1.x + rest.y * a1.y; x2 += rest.x * a2.x + rest.y * a2.y;
  });
  const det = c11 * c22 - c12 * c12, chord = len(sub(r, p));
  let alpha1 = det ? (x1 * c22 - x2 * c12) / det : 0, alpha2 = det ? (c11 * x2 - c12 * x1) / det : 0;
  if (!(alpha1 > chord * 1e-3) || !(alpha2 > chord * 1e-3) || alpha1 > chord * 2 || alpha2 > chord * 2) alpha1 = alpha2 = chord / 3;
  p.out = along(p, t0, alpha1);
  r.in = along(r, t1, alpha2);
  if (p.smooth && p.in) { const back = len(sub(p, p.in)); p.in = along(p, t0, -back); }
  if (r.smooth && r.out) { const ahead = len(sub(r.out, r)); r.out = along(r, t1, -ahead); }
  return true;
}

// Đổi điểm góc ↔ điểm cong. Điểm cong mới: hai tay nắm thẳng hàng theo hướng từ điểm trước tới điểm sau.
export function toggleSmooth(contour, i) {
  const node = contour[i], n = contour.length;
  if (node.smooth) { node.smooth = false; return; }
  const prev = contour[(i - 1 + n) % n], next = contour[(i + 1) % n];
  const tangent = unit(sub(next, prev));
  const backLength = node.in ? len(sub(node, node.in)) : len(sub(node, prev)) / 3;
  const aheadLength = node.out ? len(sub(node.out, node)) : len(sub(next, node)) / 3;
  node.in = along(node, tangent, -backLength);
  node.out = along(node, tangent, aheadLength);
  node.smooth = true;
}

// Điểm nghi xù: nét quay ngược gắt (> 150°) tại điểm, hoặc đoạn thẳng ngắn dưới 4/1000 em (bậc thang điểm ảnh).
export function roughNodes(contours) {
  const marks = new Set();
  contours.forEach((contour, c) => {
    const n = contour.length;
    if (n < 3) return;
    contour.forEach((node, i) => {
      const prev = contour[(i - 1 + n) % n], next = contour[(i + 1) % n];
      const into = unit(sub(node, node.in ?? prev.out ?? prev)), out = unit(sub(node.out ?? next.in ?? next, node));
      if (into.x * out.x + into.y * out.y < Math.cos(150 * Math.PI / 180)) marks.add(c + ':' + i);
      if (!node.out && !next.in && len(sub(next, node)) < 4) { marks.add(c + ':' + i); marks.add(c + ':' + (i + 1) % n); }
    });
  });
  return marks;
}

function transformContour(contour, { cx, cy, scale = 1, angle = 0, dx = 0, dy = 0 }) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const move = p => {
    if (!p) return p;
    const x = (p.x - cx) * scale, y = (p.y - cy) * scale;
    return { ...p, x: cx + x * cos - y * sin + dx, y: cy + x * sin + y * cos + dy };
  };
  return contour.map(node => ({ ...move(node), in: move(node.in), out: move(node.out), smooth: node.smooth }));
}

function contourBox(contour) {
  const xs = [], ys = [];
  for (const node of contour) for (const p of [node, node.in, node.out]) if (p) { xs.push(p.x); ys.push(p.y); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// ---- Popup ---------------------------------------------------------------------------------------------------------
export function setupFontLab({ getGlyph, commit, unlock, recompose, metrics, label = char => char, onStatus = () => {} }) {
  const $ = id => document.getElementById(id);
  const dialog = $('font-lab'), canvas = $('fl-canvas'), ctx = canvas.getContext('2d');
  let glyph, contours = [], undo = [], redo = [], selected = new Set(), contourSelection = new Set(), dirty = false;
  let view = { scale: 1, ox: 0, oy: 0 }, drag = null, preview = null, transformBase = null, guides = {};
  let showPoints = true, rough = new Set();

  const key = (c, i) => c + ':' + i;
  const parseKey = k => k.split(':').map(Number);
  const toScreen = p => ({ x: view.ox + p.x * view.scale, y: view.oy - p.y * view.scale });
  const toFont = (x, y) => ({ x: (x - view.ox) / view.scale, y: (view.oy - y) / view.scale });
  const pathOf = (list, transform = toScreen) => {
    const path = new Path2D();
    for (const contour of list) {
      if (contour.length < 2) continue;
      const first = transform(contour[0]);
      path.moveTo(first.x, first.y);
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i], b = contour[(i + 1) % contour.length], to = transform(b);
        if (a.out || b.in) {
          const p = transform(a.out ?? a), q = transform(b.in ?? b);
          path.bezierCurveTo(p.x, p.y, q.x, q.y, to.x, to.y);
        } else path.lineTo(to.x, to.y);
      }
      path.closePath();
    }
    return path;
  };

  function size() {
    const box = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return box;
  }

  function fit() {
    const box = canvas.getBoundingClientRect();
    const top = Math.max(guides.ascent ?? 900, ...contours.map(c => contourBox(c).y1));
    const bottom = Math.min(guides.descent ?? -250, ...contours.map(c => contourBox(c).y0));
    const left = Math.min(0, ...contours.map(c => contourBox(c).x0)), right = Math.max(glyph?.advance ?? 600, ...contours.map(c => contourBox(c).x1));
    const margin = 36;
    view.scale = Math.min((box.width - margin * 2) / (right - left), (box.height - margin * 2) / (top - bottom));
    view.ox = (box.width - (right - left) * view.scale) / 2 - left * view.scale;
    view.oy = margin + top * view.scale + ((box.height - margin * 2) - (top - bottom) * view.scale) / 2;
    draw();
  }

  function draw() {
    const box = size();
    ctx.fillStyle = '#29221d'; ctx.fillRect(0, 0, box.width, box.height);
    // Đường chuẩn và bước chữ.
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    const line = (name, value) => {
      if (!Number.isFinite(value)) return;
      const y = Math.round(toScreen({ x: 0, y: value }).y) + .5;
      ctx.strokeStyle = 'rgba(168,154,139,.55)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(box.width, y); ctx.stroke();
      ctx.fillStyle = '#a89a8b'; ctx.textAlign = 'left'; ctx.fillText(name + ' ' + Math.round(value), 8, y - 4);
    };
    line('Đường chân chữ', 0); line('x-height', guides.x); line('Chữ hoa', guides.cap); line('Nét vươn trên', guides.ascent); line('Nét xuống', guides.descent);
    for (const x of [0, glyph?.advance]) {
      if (!Number.isFinite(x)) continue;
      const sx = Math.round(toScreen({ x, y: 0 }).x) + .5;
      ctx.strokeStyle = 'rgba(168,154,139,.35)'; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, box.height); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Nét chữ.
    const shown = preview?.contours ?? contours;
    ctx.fillStyle = showPoints ? 'rgba(255,252,245,.88)' : '#fffcf5';
    ctx.fill(pathOf(shown));
    if (preview) { ctx.strokeStyle = '#e0533d'; ctx.lineWidth = 1.2; ctx.stroke(pathOf(contours)); }
    if (!showPoints || preview) return;
    ctx.strokeStyle = '#b8a896'; ctx.lineWidth = 1; ctx.stroke(pathOf(contours));
    for (const c of contourSelection) { ctx.strokeStyle = '#e0533d'; ctx.lineWidth = 2; ctx.stroke(pathOf([contours[c]])); }
    // Tay nắm.
    contours.forEach(contour => contour.forEach(node => {
      const p = toScreen(node);
      for (const handle of [node.in, node.out]) {
        if (!handle) continue;
        const h = toScreen(handle);
        ctx.strokeStyle = '#8d8073'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.fillStyle = '#d9c9b6'; ctx.beginPath(); ctx.arc(h.x, h.y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }));
    // Điểm neo.
    contours.forEach((contour, c) => contour.forEach((node, i) => {
      const p = toScreen(node), k = key(c, i), active = selected.has(k);
      if (rough.has(k)) { ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = active ? '#e0533d' : '#29221d'; ctx.strokeStyle = active ? '#fffcf5' : '#f0b45a'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (node.smooth) ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); else ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fill(); ctx.stroke();
    }));
  }

  function hit(x, y) {
    let best = null, bestDistance = 9;
    contours.forEach((contour, c) => contour.forEach((node, i) => {
      for (const [part, point] of [['node', node], ['in', node.in], ['out', node.out]]) {
        if (!point) continue;
        const p = toScreen(point), distance = Math.hypot(p.x - x, p.y - y) + (part === 'node' ? 0 : 1.5);
        if (distance < bestDistance) { bestDistance = distance; best = { c, i, part }; }
      }
    }));
    if (best) return best;
    // Không trúng điểm: chọn khối nét nhỏ nhất chứa vị trí bấm (dấu nằm riêng, lòng chữ nằm trong thân).
    const ratio = window.devicePixelRatio || 1;
    let inside = null, area = Infinity;
    contours.forEach((contour, c) => {
      // isPointInPath đo theo điểm ảnh thật của canvas; đường đã nhân tỉ lệ màn hình qua phép biến đổi hiện tại.
      if (!ctx.isPointInPath(pathOf([contour]), x * ratio, y * ratio)) return;
      const b = contourBox(contour), a = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (a < area) { area = a; inside = { c, part: 'contour' }; }
    });
    return inside;
  }

  function remember() { undo.push(clone(contours)); if (undo.length > 200) undo.shift(); redo = []; }
  function changed() {
    dirty = true; preview = null; rough = roughNodes(contours);
    $('fl-cleanup-preview').checked = false;
    refreshPanel(); draw();
  }

  function refreshPanel() {
    const d = serializeOutline(contours), defects = outlineDefects(d);
    $('fl-stats').textContent = contours.reduce((s, c) => s + c.length, 0) + ' điểm · ' + contours.length + ' khối nét · '
      + rough.size + ' điểm nghi xù · lỗi nét ' + defects.total;
    const [only] = selected.size === 1 ? [...selected].map(parseKey) : [];
    const node = only && contours[only[0]]?.[only[1]];
    $('fl-x').disabled = $('fl-y').disabled = !node;
    $('fl-x').value = node ? round(node.x) : ''; $('fl-y').value = node ? round(node.y) : '';
    $('fl-toggle').disabled = $('fl-delete').disabled = !selected.size;
    $('fl-toggle').textContent = node?.smooth ? 'Đổi thành điểm góc' : 'Đổi thành điểm cong';
    $('fl-contour').hidden = !contourSelection.size;
    $('fl-undo').disabled = !undo.length; $('fl-redo').disabled = !redo.length;
    $('fl-save').disabled = !dirty;
    $('fl-unlock').hidden = !glyph?.locked;
  }

  function select(keys, contoursPicked = []) {
    selected = new Set(keys); contourSelection = new Set(contoursPicked);
    transformBase = null; $('fl-scale').value = 100; $('fl-rotate').value = 0;
    $('fl-scale-value').textContent = '100'; $('fl-rotate-value').textContent = '0';
    refreshPanel(); draw();
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 1 || event.button === 0 && event.altKey) {
      drag = { pan: true, x: event.clientX, y: event.clientY, ox: view.ox, oy: view.oy };
      canvas.setPointerCapture(event.pointerId); return;
    }
    if (event.button !== 0 || preview) return;
    const box = canvas.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    const target = showPoints ? hit(x, y) : null;
    canvas.setPointerCapture(event.pointerId);
    if (!target) {
      if (!event.shiftKey) select([]);
      drag = { pan: true, x: event.clientX, y: event.clientY, ox: view.ox, oy: view.oy }; return;
    }
    if (target.part === 'contour') {
      const keys = contours[target.c].map((_, i) => key(target.c, i));
      if (event.shiftKey) select([...selected, ...keys], [...contourSelection, target.c]); else select(keys, [target.c]);
    } else if (target.part === 'node') {
      const k = key(target.c, target.i);
      if (event.shiftKey) { const next = new Set(selected); next.has(k) ? next.delete(k) : next.add(k); select(next); }
      else if (!selected.has(k)) select([k]);
    }
    drag = { target, start: toFont(x, y), before: clone(contours), moved: false };
  });

  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    if (drag.pan) { view.ox = drag.ox + event.clientX - drag.x; view.oy = drag.oy + event.clientY - drag.y; draw(); return; }
    const box = canvas.getBoundingClientRect(), now = toFont(event.clientX - box.left, event.clientY - box.top);
    let dx = now.x - drag.start.x, dy = now.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * view.scale < 3) return;
    if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    drag.moved = true;
    contours = clone(drag.before);
    const { c, i, part } = drag.target;
    if (part === 'in' || part === 'out') {
      const node = contours[c][i], handle = node[part], other = part === 'in' ? 'out' : 'in';
      node[part] = { x: handle.x + dx, y: handle.y + dy };
      if (node.smooth && node[other]) {
        const keep = len(sub(node[other], node)), direction = unit(sub(node, node[part]));
        node[other] = along(node, direction, keep);
      }
    } else {
      for (const k of selected) {
        const [ci, ni] = parseKey(k), node = contours[ci]?.[ni];
        if (!node) continue;
        for (const p of [node, node.in, node.out]) if (p) { p.x += dx; p.y += dy; }
      }
    }
    rough = roughNodes(contours); refreshPanel(); draw();
  });

  const endDrag = () => {
    if (drag?.moved) { undo.push(drag.before); redo = []; changed(); }
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', event => {
    const box = canvas.getBoundingClientRect(), target = hit(event.clientX - box.left, event.clientY - box.top);
    if (target?.part !== 'node') return;
    remember(); toggleSmooth(contours[target.c], target.i); changed();
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const box = canvas.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    const factor = Math.exp(-event.deltaY / 400), at = toFont(x, y);
    view.scale = Math.max(.05, Math.min(40, view.scale * factor));
    view.ox = x - at.x * view.scale; view.oy = y + at.y * view.scale;
    draw();
  }, { passive: false });

  function deleteSelected() {
    if (!selected.size) return;
    remember();
    const byContour = new Map();
    for (const k of selected) { const [c, i] = parseKey(k); if (!byContour.has(c)) byContour.set(c, []); byContour.get(c).push(i); }
    const emptied = [];
    for (const [c, list] of byContour) {
      if (contourSelection.has(c) || list.length >= contours[c].length - 1) { emptied.push(c); continue; }
      for (const i of list.sort((a, b) => b - a)) removeNode(contours[c], i);
    }
    // Chọn cả khối nét rồi xóa: bỏ cả khối (ví dụ một dấu dựng sai, một hạt nhiễu).
    contours = contours.filter((_, c) => !emptied.includes(c));
    select([]); changed();
  }

  function nudge(dx, dy) {
    if (!selected.size) return;
    remember();
    for (const k of selected) {
      const [c, i] = parseKey(k), node = contours[c]?.[i];
      if (node) for (const p of [node, node.in, node.out]) if (p) { p.x += dx; p.y += dy; }
    }
    changed();
  }

  function step(from, to) {
    if (!from.length) return;
    to.push(clone(contours)); contours = from.pop(); select([]); changed();
  }

  dialog.addEventListener('keydown', event => {
    if (event.target.matches('input, select, textarea')) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? step(redo, undo) : step(undo, redo); }
    else if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); step(redo, undo); }
    else if (ctrl && event.key.toLowerCase() === 'a') {
      // Chọn cả chữ (mọi khối nét), ví dụ để dời cả chữ về đường chân bằng phím mũi tên.
      event.preventDefault();
      select(contours.flatMap((contour, c) => contour.map((_, i) => key(c, i))), contours.map((_, c) => c));
    }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
    else if (event.key.startsWith('Arrow') && selected.size) {
      event.preventDefault();
      const s = event.shiftKey ? 10 : 1;
      nudge(event.key === 'ArrowLeft' ? -s : event.key === 'ArrowRight' ? s : 0, event.key === 'ArrowUp' ? s : event.key === 'ArrowDown' ? -s : 0);
    } else if (event.key === ' ' && !event.repeat) { event.preventDefault(); showPoints = !showPoints; $('fl-points').checked = showPoints; draw(); }
  });

  // Co giãn, xoay khối nét đang chọn quanh tâm của khối.
  const transformInput = () => {
    if (!contourSelection.size) return;
    if (!transformBase) transformBase = clone(contours);
    const scale = Number($('fl-scale').value) / 100, angle = Number($('fl-rotate').value) * Math.PI / 180;
    $('fl-scale-value').textContent = $('fl-scale').value; $('fl-rotate-value').textContent = $('fl-rotate').value;
    contours = clone(transformBase);
    for (const c of contourSelection) {
      const b = contourBox(transformBase[c]);
      contours[c] = transformContour(transformBase[c], { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, scale, angle });
    }
    rough = roughNodes(contours); draw();
  };
  const transformDone = () => {
    if (!transformBase) return;
    undo.push(transformBase); redo = []; transformBase = null;
    const picked = [...contourSelection];
    changed(); select(picked.flatMap(c => contours[c].map((_, i) => key(c, i))), picked);
  };
  for (const id of ['fl-scale', 'fl-rotate']) { $(id).addEventListener('input', transformInput); $(id).addEventListener('change', transformDone); }

  for (const axis of ['x', 'y']) $('fl-' + axis).addEventListener('change', () => {
    const [only] = [...selected].map(parseKey), node = only && contours[only[0]]?.[only[1]];
    const value = Number($('fl-' + axis).value);
    if (!node || !Number.isFinite(value)) return;
    remember();
    const delta = value - node[axis];
    for (const p of [node, node.in, node.out]) if (p) p[axis] += delta;
    changed();
  });
  $('fl-toggle').onclick = () => {
    if (!selected.size) return;
    remember();
    for (const k of selected) { const [c, i] = parseKey(k); if (contours[c]?.[i]) toggleSmooth(contours[c], i); }
    changed();
  };
  $('fl-delete').onclick = deleteSelected;
  $('fl-undo').onclick = () => step(undo, redo);
  $('fl-redo').onclick = () => step(redo, undo);
  $('fl-fit').onclick = fit;
  $('fl-points').onchange = () => { showPoints = $('fl-points').checked; draw(); };

  // Làm sạch nét: dùng bộ nắn outline có sẵn của Xưởng (outline-cleanup.js) cho riêng chữ này.
  const runCleanup = () => {
    try {
      const result = cleanOutline({ ...glyph, locked: false, d: serializeOutline(contours) }, { tolerance: Number($('fl-cleanup-level').value) });
      preview = { contours: parseOutline(result.d) };
      const before = outlineDefects(serializeOutline(contours)).total, after = outlineDefects(result.d).total;
      $('fl-cleanup-note').textContent = 'Lỗi nét ' + before + ' → ' + after + '. Viền đỏ là nét hiện tại.';
    } catch (error) { preview = null; $('fl-cleanup-note').textContent = error.message; $('fl-cleanup-preview').checked = false; }
    draw();
  };
  $('fl-cleanup-preview').onchange = () => { if ($('fl-cleanup-preview').checked) runCleanup(); else { preview = null; $('fl-cleanup-note').textContent = ''; draw(); } };
  $('fl-cleanup-level').onchange = () => { if ($('fl-cleanup-preview').checked) runCleanup(); };
  $('fl-cleanup-apply').onclick = () => {
    if (!preview) runCleanup();
    if (!preview) return;
    remember(); contours = preview.contours; select([]); changed();
    $('fl-cleanup-note').textContent = 'Đã làm sạch. Hoàn tác được.';
  };

  $('fl-recompose').onclick = () => {
    try {
      const d = recompose(glyph.char);
      if (!d) { $('fl-recompose-note').textContent = 'Không dựng lại được chữ này theo quy tắc (thiếu chữ gốc hoặc dấu mẫu).'; return; }
      remember(); contours = parseOutline(d); select([]); changed();
      $('fl-recompose-note').textContent = 'Đã dựng lại theo bảng quy tắc. Hoàn tác được.';
    } catch (error) { $('fl-recompose-note').textContent = error.message; }
  };

  $('fl-save').onclick = async () => {
    if (!dirty) return;
    const { outlineUndo, ...snapshot } = glyph;
    const next = { ...glyph, d: serializeOutline(contours), outlineUndo: snapshot, manualEdit: { time: new Date().toISOString() },
      version: (glyph.version || 0) + 1, approved: true, locked: true, proof: undefined, identityVersion: undefined, pixelOutline: undefined };
    try {
      $('fl-save').disabled = true;
      await commit(glyph, next);
      glyph = next; dirty = false; undo = []; redo = [];
      onStatus('Đã lưu nét sửa tay cho ' + label(next.char) + '. Chữ được khóa để các bước dựng tự động không ghi đè.');
      dialog.close();
    } catch (error) { $('fl-message').textContent = error.message; refreshPanel(); }
  };
  $('fl-unlock').onclick = async () => {
    try {
      const next = await unlock(glyph);
      if (next) { glyph = next; refreshPanel(); $('fl-message').textContent = 'Đã mở khóa. Các bước dựng tự động có thể sửa chữ này lại.'; }
    } catch (error) { $('fl-message').textContent = error.message; }
  };
  $('fl-close').onclick = () => { if (!dirty || confirm('Bỏ các thay đổi chưa lưu của ' + label(glyph.char) + '?')) dialog.close(); };
  dialog.addEventListener('cancel', event => {
    if (dirty && !confirm('Bỏ các thay đổi chưa lưu của ' + label(glyph.char) + '?')) event.preventDefault();
  });
  new ResizeObserver(() => { if (dialog.open) draw(); }).observe(canvas);

  function open(char) {
    const current = getGlyph(char);
    if (!current?.d) { onStatus('Chưa có nét cho ' + label(char) + ' để chỉnh trong Font Lab.'); return; }
    glyph = current; contours = parseOutline(current.d); undo = []; redo = []; dirty = false; preview = null;
    guides = metrics(); rough = roughNodes(contours);
    $('fl-title').textContent = 'Font Lab · ' + label(char);
    $('fl-source').textContent = (current.source || '') + (current.locked ? ' · đã khóa' : '');
    $('fl-message').textContent = ''; $('fl-cleanup-note').textContent = ''; $('fl-recompose-note').textContent = '';
    $('fl-cleanup-preview').checked = false;
    $('fl-recompose-box').hidden = [...char.normalize('NFD')].length < 2;
    showPoints = true; $('fl-points').checked = true;
    select([]);
    dialog.showModal();
    requestAnimationFrame(fit);
    canvas.focus();
  }
  return { open };
}
