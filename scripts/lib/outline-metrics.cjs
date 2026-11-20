// Đo outline font (UPM 1000, y hướng lên) cho chuẩn dấu tiếng Việt: tách contour, diện tích, chu vi,
// bề dày nét ngang theo scanline. Dùng chung cho script đo font chuyên nghiệp và bước kiểm tra dấu.
const svgpath = require('svgpath');

// Làm phẳng path SVG (đã ở UPM 1000) thành các contour polyline.
function flatten(d, steps = 16) {
  const contours = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0;
  svgpath(d).abs().unshort().unarc().iterate((s, i, px, py) => {
    const c = s[0];
    if (c === 'M') { cur = [[s[1], s[2]]]; contours.push(cur); x = sx = s[1]; y = sy = s[2]; return; }
    if (c === 'Z') { x = sx; y = sy; return; }
    if (!cur) { cur = [[px, py]]; contours.push(cur); }
    if (c === 'L') { cur.push([s[1], s[2]]); x = s[1]; y = s[2]; }
    else if (c === 'H') { cur.push([s[1], py]); x = s[1]; }
    else if (c === 'V') { cur.push([px, s[1]]); y = s[1]; }
    else if (c === 'Q' || c === 'C') {
      const P = c === 'C' ? [[px, py], [s[1], s[2]], [s[3], s[4]], [s[5], s[6]]] : [[px, py], [s[1], s[2]], [s[3], s[4]]];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps; let q = P.map(p => [...p]);
        while (q.length > 1) q = q.slice(1).map((p, j) => [q[j][0] + (p[0] - q[j][0]) * t, q[j][1] + (p[1] - q[j][1]) * t]);
        cur.push(q[0]);
      }
      x = P.at(-1)[0]; y = P.at(-1)[1];
    }
  });
  return contours.filter(c => c.length > 2);
}
const box = pts => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
};
const area = c => { let a = 0; for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const perimeter = c => c.reduce((n, p, i) => n + Math.hypot(c[(i + 1) % c.length][0] - p[0], c[(i + 1) % c.length][1] - p[1]), 0);
const boxOf = contours => box(contours.flat());

// Các đoạn tô (theo luật nonzero xấp xỉ bằng chẵn lẻ) trên đường ngang y.
function spans(contours, y) {
  const xs = [];
  for (const c of contours) for (let i = 0; i < c.length; i++) {
    const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
    if ((ay <= y) !== (by <= y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
  }
  xs.sort((a, b) => a - b);
  const out = []; for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}
// Bề dày thân đứng: đo ngang ở 40–60% chiều cao glyph, lấy trung vị đoạn hẹp nhất (bỏ chân serif).
function stemWidth(contours) {
  const b = boxOf(contours), v = [];
  for (let k = 0; k <= 10; k++) {
    const s = spans(contours, b.y0 + b.h * (.4 + .02 * k)).map(([a, c]) => c - a).filter(w => w > .5);
    if (s.length) v.push(Math.min(...s));
  }
  v.sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : b.w;
}
// Contour của glyph có dấu không trùng contour nào của chữ gốc (khớp theo khung, sai số 1.5 đơn vị).
function extraContours(accented, base) {
  const bb = base.map(box);
  return accented.filter(c => {
    const b = box(c);
    return !bb.some(o => Math.abs(o.x0 - b.x0) < 1.5 && Math.abs(o.y0 - b.y0) < 1.5 && Math.abs(o.x1 - b.x1) < 1.5 && Math.abs(o.y1 - b.y1) < 1.5);
  });
}
// Bề dày trung bình của nét mảnh: 2·diện tích / chu vi (chính xác cho nét dài, hơi thấp cho dấu ngắn).
const strokeThickness = contours => {
  let a = 0, p = 0; for (const c of contours) { a += Math.abs(area(c)); p += perimeter(c); }
  return p ? 2 * a / p : 0;
};
module.exports = { flatten, box, boxOf, area, perimeter, spans, stemWidth, extraContours, strokeThickness };
