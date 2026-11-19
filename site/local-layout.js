// Tách dòng và từ trong ảnh mẫu theo nội dung người dùng gõ, chạy hoàn toàn trên trình duyệt.
// Không AI nào đọc hay vẽ lại ảnh: kết quả chỉ là khung từng từ để bước dựng nét có sẵn dùng tiếp.
// Hộp trả về theo định dạng của bước phân tích Gemini: [top,left,bottom,right] chuẩn hóa 0..1000.

export function parseLayoutText(text) {
  return String(text || '').normalize('NFC').split(/\r?\n/u)
    .map(line => line.trim().replace(/\s+/gu, ' ')).filter(Boolean);
}

function otsu(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let weightB = 0, sumB = 0, best = 0, threshold = 127;
  for (let i = 0; i < 256; i++) {
    weightB += histogram[i];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += i * histogram[i];
    const meanB = sumB / weightB, meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) { best = between; threshold = i; }
  }
  return threshold;
}

export function inkMask(canvas) {
  const { width: W, height: H } = canvas;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
  const gray = new Uint8Array(W * H), histogram = new Uint32Array(256);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    // Nền trong suốt được coi là nền trắng.
    const value = data[i + 3] < 128 ? 255 : (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000 | 0;
    gray[p] = value; histogram[value]++;
  }
  const threshold = otsu(histogram, gray.length);
  const ink = new Uint8Array(W * H);
  let count = 0;
  for (let p = 0; p < gray.length; p++) if (gray[p] <= threshold) { ink[p] = 1; count++; }
  if (count > gray.length / 2) for (let p = 0; p < ink.length; p++) ink[p] ^= 1;   // chữ sáng trên nền tối
  return { ink, W, H, threshold };
}

// Gán nhãn vùng nét liền (8 hướng) bằng union-find hai lượt.
export function components(ink, W, H) {
  const labels = new Int32Array(W * H), parent = [0];
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!ink[p]) continue;
    const near = [];
    if (x > 0 && labels[p - 1]) near.push(labels[p - 1]);
    if (y > 0) {
      const up = p - W;
      if (labels[up]) near.push(labels[up]);
      if (x > 0 && labels[up - 1]) near.push(labels[up - 1]);
      if (x + 1 < W && labels[up + 1]) near.push(labels[up + 1]);
    }
    if (!near.length) { const id = parent.length; parent.push(id); labels[p] = id; }
    else { const id = Math.min(...near); labels[p] = id; for (const n of near) union(id, n); }
  }
  const boxes = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = labels[y * W + x];
    if (!id) continue;
    const root = find(id);
    let box = boxes.get(root);
    if (!box) boxes.set(root, box = { x0: x, y0: y, x1: x + 1, y1: y + 1, area: 0 });
    if (x < box.x0) box.x0 = x; if (x + 1 > box.x1) box.x1 = x + 1;
    if (y < box.y0) box.y0 = y; if (y + 1 > box.y1) box.y1 = y + 1;
    box.area++;
  }
  const minArea = Math.max(4, Math.round(W * H * 2e-6));
  return [...boxes.values()].filter(box => box.area >= minArea).map(box => ({
    ...box, h: box.y1 - box.y0, w: box.x1 - box.x0, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2
  }));
}

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const overlapX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
const union = items => ({
  x0: Math.min(...items.map(i => i.x0)), y0: Math.min(...items.map(i => i.y0)),
  x1: Math.max(...items.map(i => i.x1)), y1: Math.max(...items.map(i => i.y1))
});

// Cắt danh sách đã sắp xếp thành `parts` nhóm tại các khoảng hở lớn nhất.
function splitAtLargestGaps(items, parts, gapOf) {
  if (parts <= 1) return [items];
  if (items.length < parts) return null;
  const cuts = items.slice(1).map((_, i) => i + 1)
    .sort((a, b) => gapOf(items[b - 1], items[b]) - gapOf(items[a - 1], items[a])).slice(0, parts - 1).sort((a, b) => a - b);
  const groups = []; let start = 0;
  for (const cut of [...cuts, items.length]) { groups.push(items.slice(start, cut)); start = cut; }
  return groups;
}

export function layoutFromText(canvas, text) {
  const textLines = parseLayoutText(text);
  if (!textLines.length) throw Error('Nhập nội dung chữ trong ảnh, mỗi dòng ảnh một dòng.');
  const { ink, W, H } = inkMask(canvas);
  const comps = components(ink, W, H);
  if (!comps.length) throw Error('Không thấy nét chữ trong ảnh. Cần ảnh chữ tương phản rõ với nền.');

  // Thân chữ: các vùng đủ cao. Dấu, chấm và dấu câu là vùng nhỏ.
  const ref = median(comps.map(c => c.h).sort((a, b) => a - b).slice(Math.floor(comps.length * 0.3)));
  const bodies = comps.filter(c => c.h >= 0.55 * ref).sort((a, b) => a.cy - b.cy);
  const lineBodies = splitAtLargestGaps(bodies, textLines.length, (a, b) => b.cy - a.cy);
  if (!lineBodies) throw Error(`Nội dung có ${textLines.length} dòng nhưng ảnh chỉ thấy ${bodies.length} khối chữ. Kiểm tra lại nội dung đã gõ.`);
  const lines = lineBodies.map(items => ({ bodies: items.sort((a, b) => a.x0 - b.x0), marks: [] }));
  const bodySet = new Set(bodies);

  // Dấu/chấm gắn vào thân chữ ngay trên hoặc dưới nó; vùng nhỏ lạc (dấu câu) theo dòng gần nhất.
  for (const c of comps) {
    if (bodySet.has(c)) continue;
    let best = null;
    lines.forEach((line, index) => {
      for (const b of line.bodies) {
        const ov = overlapX(c, b);
        const above = c.y1 <= b.y0 + 0.3 * b.h, below = c.y0 >= b.y1 - 0.3 * b.h;
        if (ov <= 0 || !(above || below)) continue;
        if (above && ov < 0.3 * c.w) continue;
        if (below && !above && !(b.x0 <= c.cx && c.cx <= b.x1)) continue;
        const gap = Math.max(b.y0 - c.y1, c.y0 - b.y1, 0);
        if (!best || gap < best.gap) best = { gap, index };
      }
    });
    if (best && best.gap < 0.7 * ref) { lines[best.index].marks.push(c); continue; }
    let nearest = 0, distance = Infinity;
    lines.forEach((line, index) => {
      const top = median(line.bodies.map(b => b.y0)), bottom = median(line.bodies.map(b => b.y1));
      const d = Math.abs(c.cy - (top + bottom) / 2);
      if (d < distance && c.y0 > top - 0.5 * ref && c.y1 < bottom + 0.8 * ref) { distance = d; nearest = index; }
    });
    if (distance < Infinity) lines[nearest].marks.push(c);
  }

  const words = [], lineBoxes = [], diagnostics = [];
  const norm = box => {
    const pad = 2;
    const top = Math.max(0, Math.floor((box.y0 - pad) / H * 1000)), left = Math.max(0, Math.floor((box.x0 - pad) / W * 1000));
    const bottom = Math.min(1000, Math.ceil((box.y1 + pad) / H * 1000)), right = Math.min(1000, Math.ceil((box.x1 + pad) / W * 1000));
    return [top, left, Math.max(bottom, top + 1), Math.max(right, left + 1)];
  };
  lines.forEach((line, index) => {
    const textLine = textLines[index], wordTexts = textLine.split(' ');
    // Gộp thân chồng nhau theo chiều ngang thành cột để không cắt giữa một chữ.
    const columns = [];
    for (const b of line.bodies) {
      const last = columns.at(-1);
      if (last && b.x0 < last.x1) { last.x1 = Math.max(last.x1, b.x1); last.items.push(b); }
      else columns.push({ x0: b.x0, x1: b.x1, items: [b] });
    }
    const groups = splitAtLargestGaps(columns, wordTexts.length, (a, b) => b.x0 - a.x1);
    if (!groups) {
      diagnostics.push({ line: index + 1, text: textLine, status: 'too-few-words', expected: wordTexts.length, found: columns.length });
      return;
    }
    const spans = groups.map(g => ({ x0: g[0].x0, x1: g.at(-1).x1, items: g.flatMap(col => col.items) }));
    for (const m of line.marks) {
      const inside = spans.find(s => s.x0 <= m.cx && m.cx <= s.x1);
      const target = inside || spans.reduce((a, b) => Math.min(Math.abs(m.cx - a.x0), Math.abs(m.cx - a.x1)) <= Math.min(Math.abs(m.cx - b.x0), Math.abs(m.cx - b.x1)) ? a : b);
      target.items.push(m);
    }
    spans.forEach((span, i) => words.push({ text: wordTexts[i], box: norm(union(span.items)) }));
    lineBoxes.push({ text: textLine, box: norm(union(spans.flatMap(s => s.items))) });
  });
  if (!words.length) throw Error('Chưa khớp được dòng nào với nội dung đã gõ. Kiểm tra số dòng và số từ.');
  return { words, lines: lineBoxes, diagnostics };
}
