// Font Lab: chỉnh tay nét một ký tự (nháy đúp ô chữ trong Bộ ký tự). Mục đích là tinh chỉnh nét, không dời chữ: khi
// lưu, chữ luôn được đặt lại lên đường chân (chân phẳng về 0, chân tròn giữ độ vượt dòng của chính font).
// Cách hiện điểm theo kiểu "logo construction": ô vuông là điểm góc, ô tròn là điểm cong, chấm nhỏ là tay nắm. Các nút
// biến đổi và sửa điểm theo FontLab 8 (lật, đối xứng, canh điểm, cong đều, góc nhọn, cân tay nắm, thêm cực trị, bớt
// điểm thừa). Đường kẻ quy tắc dấu lấy từ bảng chuẩn của skill (font-lab-rules.js).
import { cleanOutline } from './outline-cleanup.js';
import { outlineDefects } from './outline-quality.js';
import * as G from './font-lab-geometry.js';
import { markRules } from './font-lab-rules.js';

export { parseOutline, serializeOutline, removeNode, toggleSmooth, roughNodes } from './font-lab-geometry.js';

const { clone } = G;
const DESCENDERS = /[gjpqyQJ]/;

// Dời dọc để chữ ngồi đúng đường chân: chân phẳng → 0; chân là đường cong (o, U, s…) → độ vượt dòng của chính font.
export function baselineShift(char, contours, { xH = 500, overshoot = 0, overshootUpper = 0 } = {}) {
  const [root] = char.normalize('NFD');
  if (!/[\p{L}\p{N}]/u.test(root) || DESCENDERS.test(root) || !contours.length) return 0;
  const body = contours.filter(c => G.contourBox(c).y1 > .25 * xH);
  if (!body.length) return 0;
  const ink = G.inkBox(body);
  let lowest = null;
  for (const c of body) for (const node of c) if (!lowest || node.y < lowest.y) lowest = node;
  const round = lowest && (lowest.smooth || lowest.in || lowest.out) && Math.abs(lowest.y - ink.y0) < 2;
  const upper = root !== root.toLowerCase();
  const target = round ? Math.max(-25, Math.min(0, upper ? overshootUpper : overshoot)) : 0;
  const shift = target - ink.y0;
  // Chữ tròn mỗi chữ vượt dòng hơi khác nhau (e, c, s so với o): chỉ dời khi lệch rõ.
  return Math.abs(shift) < (round ? 6 : .5) ? 0 : Math.round(shift * 10) / 10;
}

export function setupFontLab({ getGlyph, commit, unlock, recompose, metrics, label = char => char, onStatus = () => {} }) {
  const $ = id => document.getElementById(id);
  const dialog = $('font-lab'), canvas = $('fl-canvas'), ctx = canvas.getContext('2d');
  let glyph, contours = [], undo = [], redo = [], selected = new Set(), contourSelection = new Set(), dirty = false;
  let view = { scale: 1, ox: 0, oy: 0 }, drag = null, preview = null, transformBase = null, font = {}, rules = null;
  let rough = new Set(), spaceDown = false, gridStep = 10;

  const key = (c, i) => c + ':' + i;
  const parseKey = k => k.split(':').map(Number);
  const toScreen = p => ({ x: view.ox + p.x * view.scale, y: view.oy - p.y * view.scale });
  const toFont = (x, y) => ({ x: (x - view.ox) / view.scale, y: (view.oy - y) / view.scale });
  const opt = id => $(id).checked;
  const pathOf = list => {
    const path = new Path2D();
    for (const contour of list) {
      if (contour.length < 2) continue;
      const first = toScreen(contour[0]);
      path.moveTo(first.x, first.y);
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i], b = contour[(i + 1) % contour.length], to = toScreen(b);
        if (a.out || b.in) { const p = toScreen(a.out ?? a), q = toScreen(b.in ?? b); path.bezierCurveTo(p.x, p.y, q.x, q.y, to.x, to.y); }
        else path.lineTo(to.x, to.y);
      }
      path.closePath();
    }
    return path;
  };
  const selectedNodes = () => [...selected].map(parseKey).map(([c, i]) => contours[c]?.[i]).filter(Boolean);
  const eachPoint = (node, f) => { for (const p of [node, node.in, node.out]) if (p) f(p); };

  function size() {
    const box = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return box;
  }

  // Khung vừa chữ: ôm nét chữ, đường chân và bước chữ, chừa lề để thấy đường kẻ quy tắc.
  function fit() {
    const box = canvas.getBoundingClientRect();
    const ink = contours.length ? G.inkBox(contours) : { x0: 0, x1: glyph?.advance ?? 500, y0: 0, y1: font.capH ?? 700 };
    const ruleTop = Math.max(0, ...(rules?.guides ?? []).flatMap(g => [g.y, g.y1].filter(Number.isFinite)));
    const top = Math.max(ink.y1, ruleTop, font.xH ?? 0), bottom = Math.min(0, ink.y0);
    const left = Math.min(0, ink.x0), right = Math.max(glyph?.advance ?? ink.x1, ink.x1);
    const padX = (right - left) * .14 + 20, padY = (top - bottom) * .1 + 20;
    view.scale = Math.min(box.width / (right - left + 2 * padX), box.height / (top - bottom + 2 * padY));
    view.ox = box.width / 2 - (left + right) / 2 * view.scale;
    view.oy = box.height / 2 + (top + bottom) / 2 * view.scale;
    draw();
  }

  function drawGrid(box) {
    const steps = [1, 2, 5, 10, 20, 50, 100, 200];
    gridStep = steps.find(s => s * view.scale >= 9) ?? 200;
    const major = gridStep * 5, from = toFont(0, box.height), to = toFont(box.width, 0);
    ctx.lineWidth = 1;
    for (let x = Math.floor(from.x / gridStep) * gridStep; x <= to.x; x += gridStep) {
      const sx = Math.round(toScreen({ x, y: 0 }).x) + .5;
      ctx.strokeStyle = x % major === 0 ? 'rgba(168,154,139,.16)' : 'rgba(168,154,139,.07)';
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, box.height); ctx.stroke();
    }
    for (let y = Math.floor(from.y / gridStep) * gridStep; y <= to.y; y += gridStep) {
      const sy = Math.round(toScreen({ x: 0, y }).y) + .5;
      ctx.strokeStyle = y % major === 0 ? 'rgba(168,154,139,.16)' : 'rgba(168,154,139,.07)';
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(box.width, sy); ctx.stroke();
    }
  }

  function drawRules(box) {
    if (!rules) return;
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    for (const g of rules.guides) {
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      if (g.kind === 'h') {
        const y = Math.round(toScreen({ x: 0, y: g.y }).y) + .5;
        ctx.strokeStyle = 'rgba(120,200,255,.75)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(box.width, y); ctx.stroke();
        ctx.fillStyle = '#9fd6ff'; ctx.textAlign = 'right'; ctx.fillText(g.label, box.width - 8, y - 4);
      } else if (g.kind === 'v') {
        const x = Math.round(toScreen({ x: g.x, y: 0 }).x) + .5;
        ctx.strokeStyle = 'rgba(120,200,255,.6)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, box.height); ctx.stroke();
        if (g.label) { ctx.fillStyle = '#9fd6ff'; ctx.textAlign = 'left'; ctx.fillText(g.label, x + 4, 14); }
      } else if (g.kind === 'band') {
        const a = toScreen({ x: 0, y: g.y1 }).y, b = toScreen({ x: 0, y: g.y0 }).y;
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(110,220,150,.13)'; ctx.fillRect(0, a, box.width, b - a);
        ctx.strokeStyle = 'rgba(110,220,150,.55)'; ctx.strokeRect(-1, a, box.width + 2, b - a);
        ctx.fillStyle = '#8fe3ad'; ctx.textAlign = 'right'; ctx.fillText(g.label, box.width - 8, a - 4);
      } else if (g.kind === 'xband') {
        // Dải dọc: khoảng cho phép (tô), vạch đứt ở mức giữa của 20 font.
        const a = toScreen({ x: g.x0, y: 0 }).x, b = toScreen({ x: g.x1, y: 0 }).x, m = Math.round(toScreen({ x: g.mid, y: 0 }).x) + .5;
        ctx.setLineDash([]); ctx.fillStyle = 'rgba(110,220,150,.11)'; ctx.fillRect(a, 0, b - a, box.height);
        ctx.strokeStyle = 'rgba(110,220,150,.55)'; ctx.strokeRect(a, -1, b - a, box.height + 2);
        ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(m, 0); ctx.lineTo(m, box.height); ctx.stroke();
        const room = b + 8 + ctx.measureText(g.label).width < box.width;
        ctx.fillStyle = '#8fe3ad'; ctx.textAlign = room ? 'left' : 'right'; ctx.fillText(g.label, room ? b + 4 : a - 4, 30);
      } else if (g.kind === 'vband') {
        const top = toScreen({ x: 0, y: g.y1 }).y - 10, bottom = toScreen({ x: 0, y: g.y0 }).y + 10;
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(110,220,150,.8)'; ctx.lineWidth = 1.5;
        for (const [x0, x1] of [[g.x0, g.x1], [g.inner0, g.inner1]]) {
          const a = toScreen({ x: x0, y: 0 }).x, b = toScreen({ x: x1, y: 0 }).x;
          for (const x of [a, b]) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
        }
        ctx.fillStyle = '#8fe3ad'; ctx.textAlign = 'center'; ctx.fillText(g.label + ' (hai cặp vạch: nhỏ nhất – lớn nhất)', toScreen({ x: (g.x0 + g.x1) / 2, y: 0 }).x, bottom + 14);
      }
    }
    ctx.setLineDash([]);
  }

  function draw() {
    const box = size();
    ctx.fillStyle = '#29221d'; ctx.fillRect(0, 0, box.width, box.height);
    if (opt('fl-grid')) drawGrid(box);
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    const line = (name, value) => {
      if (!Number.isFinite(value)) return;
      const y = Math.round(toScreen({ x: 0, y: value }).y) + .5;
      ctx.strokeStyle = 'rgba(214,196,176,.55)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(box.width, y); ctx.stroke();
      ctx.fillStyle = '#c8b8a6'; ctx.textAlign = 'left'; ctx.fillText(name + ' ' + Math.round(value), 8, y - 4);
    };
    line('Đường chân chữ', 0); line('x-height', font.xH); line('Chữ hoa', font.capH); line('Nét vươn trên', font.ascent); line('Nét xuống', font.descent);
    for (const x of [0, glyph?.advance]) {
      if (!Number.isFinite(x)) continue;
      const sx = Math.round(toScreen({ x, y: 0 }).x) + .5;
      ctx.strokeStyle = 'rgba(214,196,176,.35)'; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, box.height); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (opt('fl-rules')) drawRules(box);
    const shown = preview?.contours ?? contours, showPoints = opt('fl-points') && !spaceDown; // giữ phím cách: xem trước nét, ẩn điểm neo
    ctx.fillStyle = showPoints ? 'rgba(255,252,245,.86)' : '#fffcf5';
    ctx.fill(pathOf(shown));
    if (opt('fl-rules') && !preview) drawThicknessHints();
    if (preview) { ctx.strokeStyle = '#e0533d'; ctx.lineWidth = 1.2; ctx.stroke(pathOf(contours)); }
    if (!showPoints || preview) { drawMarquee(); return; }
    ctx.strokeStyle = '#b8a896'; ctx.lineWidth = 1; ctx.stroke(pathOf(contours));
    for (const c of contourSelection) if (contours[c]) { ctx.strokeStyle = '#e0533d'; ctx.lineWidth = 2; ctx.stroke(pathOf([contours[c]])); }
    contours.forEach(contour => contour.forEach(node => {
      const p = toScreen(node);
      for (const handle of [node.in, node.out]) {
        if (!handle) continue;
        const h = toScreen(handle);
        ctx.strokeStyle = '#8d8073'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.fillStyle = '#d9c9b6'; ctx.beginPath(); ctx.arc(h.x, h.y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }));
    contours.forEach((contour, c) => contour.forEach((node, i) => {
      const p = toScreen(node), k = key(c, i), active = selected.has(k);
      if (rough.has(k)) { ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = active ? '#e0533d' : '#29221d'; ctx.strokeStyle = active ? '#fffcf5' : '#f0b45a'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (node.smooth) ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); else ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fill(); ctx.stroke();
    }));
    drawMarquee();
  }

  // Dấu/râu dày hoặc mỏng quá so với nét thân của font: tô đỏ khối nét đó và ghi số cần đạt ngay trên hình.
  function drawThicknessHints() {
    for (const check of rules?.checks ?? []) {
      if (check.ok || !check.shapes?.length) continue;
      const thick = check.value > check.range[1];
      ctx.fillStyle = 'rgba(224,60,45,.55)'; ctx.fill(pathOf(check.shapes));
      ctx.strokeStyle = '#ff5a44'; ctx.lineWidth = 2; ctx.stroke(pathOf(check.shapes));
      const box = G.outlineBox(check.shapes), at = toScreen({ x: box.x1, y: box.y1 });
      const text = check.label + (thick ? ' dày quá: ' : ' mỏng quá: ') + Math.round(check.value) + ' → nên ' + Math.round(check.range[0]) + '–' + Math.round(check.range[1]);
      ctx.font = 'bold 12px ' + getComputedStyle(document.body).fontFamily;
      const w = ctx.measureText(text).width, x = Math.min(at.x + 8, canvas.clientWidth - w - 12), y = Math.max(18, at.y - 8);
      ctx.fillStyle = 'rgba(41,34,29,.85)'; ctx.fillRect(x - 5, y - 13, w + 10, 19);
      ctx.fillStyle = '#ff8a7a'; ctx.textAlign = 'left'; ctx.fillText(text, x, y);
    }
  }

  function drawMarquee() {
    if (!drag?.marquee) return;
    const { x0, y0, x1, y1 } = drag.marquee;
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#9fd6ff'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(x0, x1) + .5, Math.min(y0, y1) + .5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.setLineDash([]);
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
    // Gần viền: vị trí trên đoạn (để nháy đúp thêm điểm).
    let edge = null, edgeDistance = 6;
    contours.forEach((contour, c) => contour.forEach((node, i) => {
      const pts = G.samples(node, contour[(i + 1) % contour.length], 40);
      pts.forEach((p, k) => { const s = toScreen(p), d = Math.hypot(s.x - x, s.y - y); if (d < edgeDistance && k > 0 && k < 40) { edgeDistance = d; edge = { c, i, t: k / 40, part: 'edge' }; } });
    }));
    // Không trúng điểm: chọn khối nét nhỏ nhất chứa vị trí bấm (dấu nằm riêng, lòng chữ nằm trong thân).
    const ratio = window.devicePixelRatio || 1;
    let inside = null, area = Infinity;
    contours.forEach((contour, c) => {
      // isPointInPath đo theo điểm ảnh thật của canvas; đường đã nhân tỉ lệ màn hình qua phép biến đổi hiện tại.
      if (!ctx.isPointInPath(pathOf([contour]), x * ratio, y * ratio)) return;
      const b = G.contourBox(contour), a = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (a < area) { area = a; inside = { c, part: 'contour' }; }
    });
    return edge ? { ...edge, inside } : inside;
  }

  function remember() { undo.push(clone(contours)); if (undo.length > 200) undo.shift(); redo = []; }
  function changed() {
    dirty = true; preview = null; rough = G.roughNodes(contours);
    $('fl-cleanup-preview').checked = false;
    updateRules(); refreshPanel(); draw();
  }

  function updateRules() {
    rules = glyph ? markRules(glyph.char, contours, font) : null;
    const list = $('fl-rule-list');
    list.replaceChildren();
    for (const check of rules?.checks ?? []) {
      const row = document.createElement('li');
      row.className = check.ok ? 'ok' : 'bad';
      const value = Math.abs(check.value) >= 10 ? Math.round(check.value) : check.value.toFixed(2);
      const [a, b] = check.range.map(v => Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(2));
      row.innerHTML = '<b></b><span></span><small></small>';
      row.querySelector('b').textContent = (check.ok ? '✓ ' : '✗ ') + check.name;
      row.querySelector('span').textContent = value + ' (chuẩn ' + a + '–' + b + check.unit + ')';
      row.querySelector('small').textContent = check.note || '';
      list.append(row);
    }
    $('fl-harmony').replaceChildren(...(rules?.harmony ?? []).map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    $('fl-rules-box').hidden = !rules?.checks.length && !rules?.harmony.length;
  }

  function refreshPanel() {
    const d = G.serializeOutline(contours), defects = outlineDefects(d);
    $('fl-stats').textContent = contours.reduce((s, c) => s + c.length, 0) + ' điểm · ' + contours.length + ' khối nét · '
      + rough.size + ' điểm nghi xù · lỗi nét ' + defects.total;
    const nodes = selectedNodes(), node = nodes.length === 1 ? nodes[0] : null;
    $('fl-x').disabled = $('fl-y').disabled = !node;
    $('fl-x').value = node ? Math.round(node.x * 10) / 10 : ''; $('fl-y').value = node ? Math.round(node.y * 10) / 10 : '';
    for (const id of ['fl-delete', 'fl-smooth', 'fl-corner', 'fl-line', 'fl-curve']) $(id).disabled = !nodes.length;
    for (const id of ['fl-align-left', 'fl-align-center', 'fl-align-right', 'fl-align-top', 'fl-align-middle', 'fl-align-bottom']) $(id).disabled = nodes.length < 2;
    $('fl-undo').disabled = !undo.length; $('fl-redo').disabled = !redo.length;
    const shift = glyph ? baselineShift(glyph.char, contours, font) : 0;
    $('fl-baseline').textContent = shift ? 'Khi lưu, chữ sẽ được đặt lại lên đường chân (dời ' + (shift > 0 ? '+' : '') + shift + ').' : '';
    // Chữ đã sửa tay: vẫn cho bấm Lưu để áp lại nét này cho các chữ ghép từ nó (ờ ở ư...).
    $('fl-save').disabled = !dirty && !shift && !glyph?.manualEdit;
    $('fl-unlock').hidden = !glyph?.locked;
    $('fl-scope').textContent = nodes.length ? 'Áp dụng cho ' + nodes.length + ' điểm đang chọn' : 'Chưa chọn điểm: áp dụng cho cả chữ';
  }

  function select(keys, contoursPicked = []) {
    selected = new Set(keys); contourSelection = new Set(contoursPicked);
    transformBase = null; $('fl-scale').value = 100; $('fl-rotate').value = 0;
    $('fl-scale-value').textContent = '100'; $('fl-rotate-value').textContent = '0';
    refreshPanel(); draw();
  }
  const allKeys = () => contours.flatMap((c, ci) => c.map((_, i) => key(ci, i)));

  const snapPoint = p => {
    const step = opt('fl-snap') ? gridStep : 1;
    return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
  };

  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    canvas.focus();
    if (event.button === 1 || event.button === 2 || event.button === 0 && (event.altKey || spaceDown)) {
      drag = { pan: true, x: event.clientX, y: event.clientY, ox: view.ox, oy: view.oy };
      canvas.setPointerCapture(event.pointerId); return;
    }
    if (event.button !== 0 || preview) return;
    const box = canvas.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    let target = opt('fl-points') ? hit(x, y) : null;
    if (target?.part === 'edge') target = target.inside;
    canvas.setPointerCapture(event.pointerId);
    if (!target || target.part === 'contour') {
      // Kéo ở chỗ không có điểm (trên nền hay trên nét): khung chọn nhiều điểm. Bấm một lần vào nét: chọn cả khối nét.
      // Không kéo dời cả khối bằng chuột, để khỏi dời chữ nhầm; dời khối bằng phím mũi tên.
      drag = { marquee: { x0: x, y0: y, x1: x, y1: y }, base: event.shiftKey ? new Set(selected) : new Set(), shift: event.shiftKey, contour: target?.c };
      return;
    }
    if (target.part === 'node') {
      const k = key(target.c, target.i);
      if (event.shiftKey) { const next = new Set(selected); next.has(k) ? next.delete(k) : next.add(k); select(next); }
      else if (!selected.has(k)) select([k]);
    }
    const anchor = target.part === 'node' || target.part === 'in' || target.part === 'out'
      ? (target.part === 'node' ? contours[target.c][target.i] : contours[target.c][target.i][target.part]) : null;
    drag = { target, start: toFont(x, y), anchor: anchor && { x: anchor.x, y: anchor.y }, before: clone(contours), moved: false };
  });

  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    if (drag.pan) { view.ox = drag.ox + event.clientX - drag.x; view.oy = drag.oy + event.clientY - drag.y; draw(); return; }
    const box = canvas.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    if (drag.marquee) {
      Object.assign(drag.marquee, { x1: x, y1: y });
      const { x0, y0 } = drag.marquee, inBox = p => { const s = toScreen(p); return s.x >= Math.min(x0, x) && s.x <= Math.max(x0, x) && s.y >= Math.min(y0, y) && s.y <= Math.max(y0, y); };
      const keys = new Set(drag.base);
      contours.forEach((c, ci) => c.forEach((node, i) => { if (inBox(node)) keys.add(key(ci, i)); }));
      selected = keys; contourSelection = new Set(); refreshPanel(); draw(); return;
    }
    const now = toFont(x, y);
    let dx = now.x - drag.start.x, dy = now.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * view.scale < 3) return;
    if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    if (drag.anchor) { const snapped = snapPoint({ x: drag.anchor.x + dx, y: drag.anchor.y + dy }); dx = snapped.x - drag.anchor.x; dy = snapped.y - drag.anchor.y; }
    else { dx = Math.round(dx); dy = Math.round(dy); }
    drag.moved = true;
    contours = clone(drag.before);
    const { c, i, part } = drag.target;
    if (part === 'in' || part === 'out') {
      const node = contours[c][i], handle = node[part], other = part === 'in' ? 'out' : 'in';
      node[part] = { x: handle.x + dx, y: handle.y + dy };
      if (node.smooth && node[other]) {
        const keep = Math.hypot(node[other].x - node.x, node[other].y - node.y), direction = node[part];
        const v = { x: node.x - direction.x, y: node.y - direction.y }, n = Math.hypot(v.x, v.y) || 1;
        node[other] = { x: node.x + v.x / n * keep, y: node.y + v.y / n * keep };
      }
    } else for (const node of selectedNodes()) eachPoint(node, p => { p.x += dx; p.y += dy; });
    rough = G.roughNodes(contours); updateRules(); refreshPanel(); draw();
  });

  const endDrag = () => {
    if (drag?.moved) { undo.push(drag.before); redo = []; changed(); }
    const finished = drag; drag = null;
    if (finished?.marquee) {
      const { x0, y0, x1, y1 } = finished.marquee;
      if (Math.hypot(x1 - x0, y1 - y0) < 4) {
        // Chỉ bấm, không kéo: chọn khối nét dưới chuột, hoặc bỏ chọn khi bấm ra nền.
        if (finished.contour != null) {
          const keys = contours[finished.contour].map((_, i) => key(finished.contour, i));
          if (finished.shift) select([...selected, ...keys], [...contourSelection, finished.contour]); else select(keys, [finished.contour]);
        } else if (!finished.shift) select([]);
      }
      draw();
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', event => {
    const box = canvas.getBoundingClientRect(), target = hit(event.clientX - box.left, event.clientY - box.top);
    if (target?.part === 'node') { remember(); G.toggleSmooth(contours[target.c], target.i); changed(); }
    else if (target?.part === 'edge') {
      // Nháy đúp lên viền: thêm điểm tại đó.
      remember(); const i = G.insertNode(contours[target.c], target.i, target.t); changed(); select([key(target.c, i)]);
    }
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const box = canvas.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    const factor = Math.exp(-event.deltaY / 400), at = toFont(x, y);
    view.scale = Math.max(.05, Math.min(60, view.scale * factor));
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
      for (const i of list.sort((a, b) => b - a)) G.removeNode(contours[c], i);
    }
    // Chọn cả khối nét rồi xóa: bỏ cả khối (một dấu dựng sai, một hạt nhiễu).
    contours = contours.filter((_, c) => !emptied.includes(c));
    select([]); changed();
  }

  function nudge(dx, dy) {
    if (!selected.size) return;
    remember();
    for (const node of selectedNodes()) eachPoint(node, p => { p.x += dx; p.y += dy; });
    changed();
  }

  function step(from, to) {
    if (!from.length) return;
    to.push(clone(contours)); contours = from.pop(); select([]); changed();
  }

  // Làm việc trên điểm đang chọn: gom theo contour, chạy từ chỉ số lớn về nhỏ để không lệch chỉ số khi chèn/xóa.
  function onSelected(f, { pairs = false } = {}) {
    if (!selected.size) return;
    remember();
    const byContour = new Map();
    for (const k of selected) { const [c, i] = parseKey(k); if (!byContour.has(c)) byContour.set(c, new Set()); byContour.get(c).add(i); }
    for (const [c, set] of byContour) {
      const contour = contours[c];
      for (const i of [...set].sort((a, b) => b - a)) {
        if (pairs && !set.has((i + 1) % contour.length)) continue;
        f(contour, i);
      }
    }
    changed();
  }

  // Biến đổi theo vùng chọn (hoặc cả chữ): lật quanh tâm vùng.
  function flip(axis) {
    const nodes = selected.size ? selectedNodes() : contours.flat();
    if (!nodes.length) return;
    remember();
    const pts = nodes.flatMap(n => [n, n.in, n.out].filter(Boolean));
    const cx = (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2, cy = (Math.min(...pts.map(p => p.y)) + Math.max(...pts.map(p => p.y))) / 2;
    for (const node of nodes) eachPoint(node, p => { if (axis === 'x') p.x = 2 * cx - p.x; else p.y = 2 * cy - p.y; });
    // Lật cả khối nét thì đảo chiều contour để giữ chiều tô.
    const whole = selected.size ? [...contourSelection] : contours.map((_, c) => c);
    for (const c of whole) contours[c] = G.reverseContour(contours[c]);
    select([]); changed();
  }

  function symmetry(side) {
    const scope = contourSelection.size ? [...contourSelection] : contours.map((_, c) => c);
    const picked = scope.map(c => contours[c]), ink = G.inkBox(picked), axis = (ink.x0 + ink.x1) / 2;
    const result = G.symmetrize(picked, axis, side);
    if (!result) { $('fl-message').textContent = 'Không đối xứng được: có khối nét cắt trục giữa nhiều hơn hai lần.'; return; }
    remember();
    contours = [...contours.filter((_, c) => !scope.includes(c)), ...result];
    $('fl-message').textContent = 'Đã đối xứng quanh trục x = ' + Math.round(axis) + '.';
    select([]); changed();
  }

  function align(axis, mode) {
    const nodes = selectedNodes();
    if (nodes.length < 2) return;
    remember();
    const values = nodes.map(n => n[axis]);
    const target = mode === 'min' ? Math.min(...values) : mode === 'max' ? Math.max(...values) : (Math.min(...values) + Math.max(...values)) / 2;
    for (const node of nodes) { const d = target - node[axis]; eachPoint(node, p => { p[axis] += d; }); }
    changed();
  }

  dialog.addEventListener('keydown', event => {
    if (event.target.matches('input:not([type=checkbox]), select, textarea')) return;
    const ctrl = event.ctrlKey || event.metaKey, k = event.key.toLowerCase();
    if (ctrl && k === 'z') { event.preventDefault(); event.shiftKey ? step(redo, undo) : step(undo, redo); }
    else if (ctrl && k === 'y') { event.preventDefault(); step(redo, undo); }
    else if (ctrl && k === 'a') { event.preventDefault(); select(allKeys(), contours.map((_, c) => c)); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
    else if (event.key.startsWith('Arrow') && selected.size) {
      event.preventDefault();
      const s = event.shiftKey ? 10 : 1;
      nudge(event.key === 'ArrowLeft' ? -s : event.key === 'ArrowRight' ? s : 0, event.key === 'ArrowUp' ? s : event.key === 'ArrowDown' ? -s : 0);
    } else if (event.key === ' ') { event.preventDefault(); if (!spaceDown && !event.repeat) { spaceDown = true; canvas.style.cursor = 'grab'; draw(); } }
  });
  const spaceUp = () => { if (!spaceDown) return; spaceDown = false; canvas.style.cursor = ''; draw(); };
  dialog.addEventListener('keyup', event => { if (event.key === ' ') spaceUp(); });
  window.addEventListener('blur', spaceUp);

  // Co giãn, xoay vùng chọn (hoặc cả khối nét đang chọn) quanh tâm vùng.
  const transformInput = () => {
    if (!selected.size) return;
    if (!transformBase) transformBase = clone(contours);
    const scale = Number($('fl-scale').value) / 100, angle = Number($('fl-rotate').value) * Math.PI / 180;
    $('fl-scale-value').textContent = $('fl-scale').value; $('fl-rotate-value').textContent = $('fl-rotate').value;
    contours = clone(transformBase);
    const nodes = selectedNodes(), pts = nodes.flatMap(n => [n, n.in, n.out].filter(Boolean));
    const cx = (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2, cy = (Math.min(...pts.map(p => p.y)) + Math.max(...pts.map(p => p.y))) / 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (const node of nodes) eachPoint(node, p => { const x = (p.x - cx) * scale, y = (p.y - cy) * scale; p.x = cx + x * cos - y * sin; p.y = cy + x * sin + y * cos; });
    rough = G.roughNodes(contours); draw();
  };
  const transformDone = () => {
    if (!transformBase) return;
    undo.push(transformBase); redo = []; transformBase = null;
    const keep = [...selected], picked = [...contourSelection];
    changed(); select(keep, picked);
  };
  for (const id of ['fl-scale', 'fl-rotate']) { $(id).addEventListener('input', transformInput); $(id).addEventListener('change', transformDone); }

  for (const axis of ['x', 'y']) $('fl-' + axis).addEventListener('change', () => {
    const [node] = selectedNodes(), value = Number($('fl-' + axis).value);
    if (!node || !Number.isFinite(value)) return;
    remember();
    const delta = value - node[axis];
    eachPoint(node, p => { p[axis] += delta; });
    changed();
  });

  $('fl-delete').onclick = deleteSelected;
  $('fl-smooth').onclick = () => onSelected((c, i) => G.makeSmooth(c, i, true));
  $('fl-corner').onclick = () => onSelected(G.makeCorner);
  $('fl-line').onclick = () => onSelected(G.makeLine, { pairs: true });
  $('fl-curve').onclick = () => onSelected(G.makeCurve, { pairs: true });
  $('fl-balance').onclick = () => {
    remember(); let n = 0;
    contours.forEach((contour, c) => contour.forEach((_, i) => {
      if (selected.size && !(selected.has(key(c, i)) && selected.has(key(c, (i + 1) % contour.length)))) return;
      if (G.balanceSegment(contour, i)) n++;
    }));
    $('fl-message').textContent = 'Đã cân ' + n + ' đoạn cong.'; select([]); changed();
  };
  $('fl-extremes').onclick = () => {
    remember(); let n = 0;
    const scope = contourSelection.size ? [...contourSelection] : contours.map((_, c) => c);
    for (const c of scope) n += G.addExtremes(contours[c]);
    $('fl-message').textContent = n ? 'Đã thêm ' + n + ' điểm cực trị.' : 'Chữ đã đủ điểm cực trị.'; select([]); changed();
  };
  $('fl-simplify').onclick = () => {
    remember(); let n = 0;
    const tolerance = Number($('fl-simplify-level').value);
    // Có điểm đang chọn (ví dụ khoanh phần râu): chỉ bớt trong các điểm đó; chưa chọn: cả chữ.
    // Đánh dấu bằng thuộc tính vì phép bớt điểm sao chép lại contour.
    const picked = selected.size && !contourSelection.size;
    if (picked) for (const node of selectedNodes()) node.pick = true;
    const scope = picked ? [...new Set([...selected].map(k => parseKey(k)[0]))] : contourSelection.size ? [...contourSelection] : contours.map((_, c) => c);
    for (const c of scope) n += G.simplifyContour(contours[c], tolerance, picked ? node => !node.pick : () => false);
    for (const contour of contours) for (const node of contour) delete node.pick;
    $('fl-message').textContent = n ? 'Đã bớt ' + n + ' điểm thừa (lệch nét tối đa ' + tolerance + ' đơn vị).' : 'Không có điểm nào bớt được ở mức này.';
    select([]); changed();
  };
  $('fl-flip-x').onclick = () => flip('x');
  $('fl-flip-y').onclick = () => flip('y');
  $('fl-sym-left').onclick = () => symmetry('left');
  $('fl-sym-right').onclick = () => symmetry('right');
  $('fl-align-left').onclick = () => align('x', 'min');
  $('fl-align-center').onclick = () => align('x', 'mid');
  $('fl-align-right').onclick = () => align('x', 'max');
  $('fl-align-top').onclick = () => align('y', 'max');
  $('fl-align-middle').onclick = () => align('y', 'mid');
  $('fl-align-bottom').onclick = () => align('y', 'min');
  $('fl-undo').onclick = () => step(undo, redo);
  $('fl-redo').onclick = () => step(redo, undo);
  $('fl-fit').onclick = fit;
  for (const id of ['fl-points', 'fl-grid', 'fl-rules']) $(id).onchange = draw;

  // Làm sạch nét: dùng bộ nắn outline có sẵn của Xưởng (outline-cleanup.js) cho riêng chữ này.
  const runCleanup = () => {
    try {
      const result = cleanOutline({ ...glyph, locked: false, d: G.serializeOutline(contours) }, { tolerance: Number($('fl-cleanup-level').value) });
      preview = { contours: G.parseOutline(result.d) };
      const before = outlineDefects(G.serializeOutline(contours)).total, after = outlineDefects(result.d).total;
      $('fl-cleanup-note').textContent = 'Lỗi nét ' + before + ' → ' + after + '. Viền đỏ là nét hiện tại.';
    } catch (error) { preview = null; $('fl-cleanup-note').textContent = error.message; $('fl-cleanup-preview').checked = false; }
    draw();
  };
  $('fl-cleanup-preview').onchange = () => { if (opt('fl-cleanup-preview')) runCleanup(); else { preview = null; $('fl-cleanup-note').textContent = ''; draw(); } };
  $('fl-cleanup-level').onchange = () => { if (opt('fl-cleanup-preview')) runCleanup(); };
  $('fl-cleanup-apply').onclick = () => {
    if (!preview) runCleanup();
    if (!preview) return;
    remember(); contours = preview.contours; select([]); changed();
    $('fl-cleanup-note').textContent = 'Đã làm sạch. Hoàn tác được.';
  };

  $('fl-recompose').onclick = () => {
    try {
      const d = recompose(glyph.char);
      if (!d) { $('fl-message').textContent = 'Không dựng lại được chữ này theo quy tắc (thiếu chữ gốc hoặc dấu mẫu).'; return; }
      remember(); contours = G.parseOutline(d); select([]); changed();
      $('fl-message').textContent = 'Đã dựng lại theo bảng quy tắc. Hoàn tác được.';
    } catch (error) { $('fl-message').textContent = error.message; }
  };

  $('fl-save').onclick = async () => {
    const shift = baselineShift(glyph.char, contours, font);
    const final = shift ? contours.map(c => G.mapContour(c, p => ({ x: p.x, y: p.y + shift }))) : contours;
    const { outlineUndo, ...snapshot } = glyph;
    const next = { ...glyph, d: G.serializeOutline(final), outlineUndo: snapshot, manualEdit: { time: new Date().toISOString(), baselineShift: shift || undefined },
      version: (glyph.version || 0) + 1, approved: true, locked: true, proof: undefined, identityVersion: undefined, pixelOutline: undefined };
    try {
      $('fl-save').disabled = true;
      const spread = await commit(glyph, next);
      glyph = next; dirty = false; undo = []; redo = [];
      // Ô dấu mẫu lưu đúng hình dựng theo quy tắc thì được trả về dấu Xưởng dựng (không khóa), báo đúng như vậy.
      const ruled = getGlyph(next.char) && !getGlyph(next.char).locked;
      onStatus((ruled ? 'Đã đưa ' + label(next.char) + ' về dấu dựng theo quy tắc từ nét của font (không khóa, quy tắc đổi thì dựng lại theo).'
        : 'Đã lưu nét sửa tay cho ' + label(next.char) + (shift ? ', đặt lại lên đường chân (dời ' + shift + ')' : '') + '. Chữ được khóa để các bước dựng tự động không ghi đè.')
        + (spread?.length ? ' Đã ghép lại theo nét mới: ' + spread.join(' ') + '.' : '')
        + (spread?.error ? ' Chưa ghép lại được các chữ liên quan (' + spread.error + '); mở lại chữ này và bấm Lưu chữ để thử lại.' : ''));
      dialog.close();
    } catch (error) {
      // Lỗi xảy ra sau khi chữ đã ghi vào bộ chữ: lấy bản đang có làm mốc, để bấm Lưu lần nữa không bị chặn
      // "Chữ đã đổi trong lúc chỉnh" (Font Lab là hộp thoại chặn, chỉ chính nó đổi được chữ này lúc đang mở).
      glyph = getGlyph(glyph.char) || glyph;
      $('fl-message').textContent = error.message; refreshPanel();
    }
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
    glyph = current; contours = G.parseOutline(current.d); undo = []; redo = []; dirty = false; preview = null;
    font = metrics(); rough = G.roughNodes(contours);
    $('fl-title').textContent = 'Font Lab · ' + label(char);
    $('fl-source').textContent = (current.source || '') + (current.locked ? ' · đã khóa' : '');
    for (const id of ['fl-message', 'fl-cleanup-note']) $(id).textContent = '';
    $('fl-cleanup-preview').checked = false;
    $('fl-recompose').hidden = [...char.normalize('NFD')].length < 2;
    updateRules();
    select([]);
    dialog.showModal();
    requestAnimationFrame(fit);
    canvas.focus();
  }
  return { open };
}
