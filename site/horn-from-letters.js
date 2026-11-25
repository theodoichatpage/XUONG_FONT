// Râu ơ ư người dùng vẽ trong ảnh (ư, ơ, Ư, Ơ tách từ ảnh): tách phần râu khỏi thân để ghép các chữ có râu còn thiếu,
// giữ đúng hình, cỡ và chỗ nối như trong ảnh (thứ tự lấy dấu của skill: dấu vẽ trong chữ ở ảnh trước, rồi bảng dấu, rồi
// dựng từ nét). Râu liền thân nên không tách theo contour như dấu thanh được: lấy chữ có râu trừ đi chữ gốc cùng ảnh
// (u, o, U, O), bỏ mảnh vụn ở mép do hai lần tách lệch nhau vài đơn vị, giữ mảnh ở vùng trên bên phải rồi lấy thêm một
// đoạn nét quanh chỗ nối để râu ghép vào chữ khác vẫn chồng lên thân.
import ClipperLib from 'clipper-lib';
import { toPolygons } from './borrow-glyphs.js';
import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';

const S = 16, C = ClipperLib.Clipper;
function run(type, subject, clip) {
  const clipper = new C(), out = [];
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  if (clip.length) clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  clipper.Execute(type, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
}
const offset = (polys, delta) => {
  const co = new ClipperLib.ClipperOffset(2, .25 * S), out = [];
  co.AddPaths(polys, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  co.Execute(out, delta * S);
  return out;
};
const shift = (polys, dx, dy) => polys.map(p => p.map(q => ({ X: q.X + Math.round(dx * S), Y: q.Y + Math.round(dy * S) })));
const toD = polys => polys.map(p => 'M' + p.map(q => (q.X / S).toFixed(1) + ' ' + (q.Y / S).toFixed(1)).join(' L') + ' Z').join(' ');
const boxOf = poly => { const xs = poly.map(q => q.X / S), ys = poly.map(q => q.Y / S); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };

const signedArea = poly => poly.reduce((sum, q, i) => { const r = poly[(i + 1) % poly.length]; return sum + q.X * r.Y - r.X * q.Y; }, 0);
// Chiều của contour lớn nhất trong đường viền gốc (trước khi Clipper chuẩn hóa chiều).
function outerSign(d) {
  let best = 0, area = 0, start = null, prev = null;
  const close = () => { if (start && prev) area += prev[0] * start[1] - start[0] * prev[1]; if (Math.abs(area) > Math.abs(best)) best = area; area = 0; };
  for (const [command, ...v] of svgpath(d).abs().unarc().unshort().segments) {
    if (command === 'M') { close(); start = prev = v.slice(-2); continue; }
    if (command === 'Z') continue;
    const p = command === 'H' ? [v[0], prev[1]] : command === 'V' ? [prev[0], v[0]] : v.slice(-2);
    area += prev[0] * p[1] - p[0] * prev[1]; prev = p;
  }
  close();
  return Math.sign(best) || 1;
}

// donor: chữ có râu tách từ ảnh; root: chữ gốc cùng ảnh; stem: nét thân; topRightEdge(d, bounds, root, stem) → { edge }.
// Trả về { d, anchor: { dx, dy } } (dx: mép trái râu so với mép phải vùng trên của chữ gốc; dy: đáy râu so với đỉnh thân)
// hoặc null nếu không tách được.
export function hornFromLetter(donor, root, stem, topRightEdge) {
  if (!donor?.d || !root?.d || !stem) return null;
  try {
    const db = glyphBounds(donor), rb = glyphBounds(root);
    // Chữ có râu và chữ gốc cùng ảnh, cùng tỉ lệ: canh theo mép trái và đáy (râu chỉ ở trên, bên phải).
    const dx = db.x - rb.x, dy = db.y - rb.y;
    const donorPolys = toPolygons(donor.d), rootPolys = shift(toPolygons(root.d), dx, dy);
    const top = rb.y + rb.height + dy, right = rb.x + rb.width + dx;
    // Bỏ mảnh vụn dọc mép thân (hai lần tách cùng một chữ lệch nhau vài điểm ảnh).
    const rest = offset(offset(run(ClipperLib.ClipType.ctDifference, donorPolys, rootPolys), -.12 * stem), .12 * stem);
    const pieces = rest.filter(p => C.Orientation(p) && Math.abs(C.Area(p)) > (.15 * stem * S) ** 2)
      .map(p => ({ p, b: boxOf(p), area: Math.abs(C.Area(p)) }))
      .filter(({ b }) => b.y1 > top - .1 * stem && b.x1 > right - stem && b.x0 > rb.x + dx + rb.width * .3);
    if (!pieces.length) return null;
    const horn = pieces.sort((a, b) => b.area - a.area)[0].p;
    // Lấy thêm phần nét của chính chữ ảnh quanh chỗ nối để râu cắm vào thân khi ghép sang chữ khác.
    // Chỉ lấy trong vùng chân râu cắm vào nét (từ mép phải vùng trên lùi vào 0.45 nét, như râu Xưởng dựng), để không
    // kéo theo đỉnh thân u (chân serif) sang chữ o.
    const { edge } = topRightEdge(root.d, rb, root.char, stem);
    // Bên phải mép thân giữ trọn (đuôi râu có thể chúc xuống thấp như Arial Bold); lùi vào trong nét chỉ ở gần đỉnh.
    const rect = (x0, y0) => [{ X: Math.round(x0 * S), Y: Math.round(y0 * S) }, { X: 1e5 * S, Y: Math.round(y0 * S) }, { X: 1e5 * S, Y: 1e5 * S }, { X: Math.round(x0 * S), Y: 1e5 * S }];
    const zone = run(ClipperLib.ClipType.ctUnion, [rect(edge + dx, -1e4), rect(edge + dx - .45 * stem, top - 1.2 * stem)], []);
    const near = run(ClipperLib.ClipType.ctIntersection, run(ClipperLib.ClipType.ctIntersection, donorPolys, offset([horn], .25 * stem)), zone);
    const grown = run(ClipperLib.ClipType.ctUnion, [horn, ...near], []);
    if (!grown.length) return null;
    // Cùng chiều contour ngoài với chữ trong ảnh: phần râu chồng lên thân mới được tô liền (ngược chiều thì bị khoét
    // thành khe trắng ở chỗ nối).
    const placed = shift(grown, -dx, -dy), want = outerSign(donor.d);
    const outerOf = placed.reduce((a, p) => Math.abs(C.Area(p)) > Math.abs(C.Area(a)) ? p : a, placed[0]);
    const d = toD(Math.sign(signedArea(outerOf)) === want ? placed : placed.map(p => [...p].reverse())), hb = glyphBounds({ d });
    return { d, anchor: { dx: hb.x - edge, dy: hb.y - (rb.y + rb.height) } };
  } catch { return null; }
}

// Râu ghép sang chữ gốc khác (râu ư cho Ư, Ơ): nếu đặt theo khoảng của ảnh mà chưa chạm thân (chân serif U mỏng, cao hơn
// chỗ nối ở u), dời dần sang trái / lên / xuống, tối đa 0.6 nét, tới khi râu liền thân. Trả về đường râu đã dời.
export function seatHorn(bodyD, hornD, stem) {
  try {
    const body = toPolygons(bodyD), horn = toPolygons(hornD);
    const count = polys => run(ClipperLib.ClipType.ctUnion, polys, []).filter(p => C.Orientation(p) && Math.abs(C.Area(p)) > 36 * 256).length;
    const alone = count(body);
    const tries = [[0, 0]];
    for (let k = 1; k <= 6; k++) for (const [x, y] of [[-k, 0], [0, k], [-k, k], [0, -k], [-k, -k]]) tries.push([x * .1 * stem, y * .1 * stem]);
    for (const [x, y] of tries) if (count([...body, ...shift(horn, x, y)]) <= alone) return x || y ? svgpath(hornD).translate(x, y).round(1).toString() : hornD;
  } catch { /* không đo được: giữ nguyên */ }
  return hornD;
}

// Đầu râu dựng từ nét của chính font (mark-standards.md, Kiểu đầu nét): đo **đầu tay chữ r** — đoạn nét mọc từ thân rồi
// kết thúc tự do, gần râu nhất. Tay r = chữ r trừ thân chữ i không chấm. Đầu phình to hơn nét tay (giọt nước của Times,
// Palatino, Askino) → 'ball', kèm hình giọt nước lấy nguyên từ tay r (tâm ở gốc tọa độ) để gắn vào đầu râu; đầu vuốt
// mảnh dần → 'taper'; còn lại 'plain' (đầu cắt như sans). Trả về null nếu không tách được tay r (chữ nghiêng dính nét).
export function strokeTerminal(glyphs, stem, topRightEdge) {
  const r = glyphs.get('r'), i = glyphs.get('i') || glyphs.get('ı');
  if (!r?.d || !i?.d || !stem) return null;
  try {
    const parts = svgpath(i.d).abs().toString().split(/(?=M)/).filter(p => p.trim()).map(d => ({ d, b: glyphBounds({ d }) }));
    const body = parts.sort((a, b) => b.b.height - a.b.height)[0];
    if (!body) return null;
    const arm = hornFromLetter(r, { char: 'ı', d: body.d }, stem, topRightEdge);
    if (!arm) return null;
    const polys = toPolygons(arm.d), b = glyphBounds({ d: arm.d });
    if (b.width < .6 * stem) return null;
    // Mặt cắt dọc theo chiều dài tay (tay r chạy ngang): bề dày ở giữa tay so với phần đầu tay.
    const thick = x => {
      let h = 0;
      for (const p of polys) {
        const ys = [];
        for (let k = 0; k < p.length; k++) { const a = p[k], c = p[(k + 1) % p.length]; const ax = a.X / S, cx = c.X / S; if ((ax <= x) !== (cx <= x)) ys.push(a.Y / S + (x - ax) / (cx - ax) * (c.Y - a.Y) / S); }
        ys.sort((m, n) => m - n);
        for (let k = 0; k + 1 < ys.length; k += 2) h += ys[k + 1] - ys[k];
      }
      return h;
    };
    const at = f => thick(b.x + b.width * f);
    const middle = Math.max(1, [.35, .45, .55].map(at).sort((m, n) => m - n)[1]);
    const end = Math.max(at(.8), at(.86), at(.92)), tip = at(.95);
    const terminal = end > 1.35 * middle ? 'ball' : tip < .45 * middle && end < .8 * middle ? 'taper' : 'plain';
    if (terminal !== 'ball') return { terminal, middle };
    // Giọt nước: phần tay r từ 70% chiều dài trở ra, đặt tâm khung về gốc tọa độ.
    const cut = [[{ X: Math.round((b.x + .7 * b.width) * S), Y: -1e5 * S }, { X: 1e5 * S, Y: -1e5 * S }, { X: 1e5 * S, Y: 1e5 * S }, { X: Math.round((b.x + .7 * b.width) * S), Y: 1e5 * S }]];
    const ball = run(ClipperLib.ClipType.ctIntersection, polys, cut);
    if (!ball.length) return { terminal: 'plain', middle };
    const d = toD(ball), bb = glyphBounds({ d });
    return { terminal, middle, ball: { d: svgpath(d).translate(-(bb.x + bb.width / 2), -(bb.y + bb.height / 2)).round(1).toString(), width: bb.width, height: bb.height } };
  } catch { return null; }
}
