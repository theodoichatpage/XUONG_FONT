// Dựng chữ cái gốc còn thiếu từ bộ phận của chữ đã có, như nhà thiết kế làm:
// n ↔ h, n ↔ u, n → m r, o + thân → b d p q, o → c e, E → F L, F + L → E, P → R, O → Q C, V → W, v → w, 6 ↔ 9, l → i.
// Chỉ điền ô trống (hoặc làm lại chữ do chính bước này dựng); luôn là "suy luận" để duyệt.
// Chữ không có bộ phận để mượn (A G K S X Z a g k s …) vẫn cần ảnh mẫu.
import ClipperLib from 'clipper-lib';
import svgpath from 'svgpath';
import { toPolygons } from './borrow-glyphs.js';
import { measureStem, outerDirection, strokeAlong } from './vietnamese.js';

export const DERIVED_SOURCE = 'Dựng từ bộ phận';
const S = 16, C = ClipperLib.Clipper, PT = ClipperLib.PolyType, CT = ClipperLib.ClipType, FT = ClipperLib.PolyFillType;

function run(type, subject, clip) {
  const c = new ClipperLib.Clipper(), out = new ClipperLib.Paths();
  c.AddPaths(subject, PT.ptSubject, true);
  if (clip?.length) c.AddPaths(clip, PT.ptClip, true);
  c.Execute(type, out, FT.pftNonZero, FT.pftNonZero);
  return C.CleanPolygons(out, 1.5).filter(p => p.length >= 3 && Math.abs(C.Area(p)) > 4 * S * S);
}
const union = (...sets) => run(CT.ctUnion, sets.flat(), []);
const cut = (a, b) => run(CT.ctIntersection, a, b);
const minus = (a, b) => run(CT.ctDifference, a, b);
const box = (x0, y0, x1, y1) => [[{ X: x0 * S, Y: y0 * S }, { X: x1 * S, Y: y0 * S }, { X: x1 * S, Y: y1 * S }, { X: x0 * S, Y: y1 * S }]];
const shift = (polys, dx, dy = 0) => polys.map(p => p.map(q => ({ X: q.X + dx * S, Y: q.Y + dy * S })));
const fan = (cx, cy, a0, a1, r) => [[{ X: cx * S, Y: cy * S }, ...Array.from({ length: 9 }, (_, k) => {
  const a = (a0 + (a1 - a0) * k / 8) * Math.PI / 180;
  return { X: (cx + r * Math.cos(a)) * S, Y: (cy + r * Math.sin(a)) * S };
})]];
function bounds(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const q of p) { x0 = Math.min(x0, q.X); x1 = Math.max(x1, q.X); y0 = Math.min(y0, q.Y); y1 = Math.max(y1, q.Y); }
  return { x0: x0 / S, y0: y0 / S, x1: x1 / S, y1: y1 / S, w: (x1 - x0) / S, h: (y1 - y0) / S };
}
// Các khoảng có nét trên một đường ngang (y) hoặc dọc (x), xếp tăng dần.
function spans(polys, at, vertical) {
  const b = bounds(polys), strip = vertical ? box(at - .5, b.y0 - 1, at + .5, b.y1 + 1) : box(b.x0 - 1, at - .5, b.x1 + 1, at + .5);
  const parts = cut(polys, strip).map(p => bounds([p])).map(r => vertical ? [r.y0, r.y1] : [r.x0, r.x1]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of parts) if (merged.length && s[0] <= merged.at(-1)[1] + 1) merged.at(-1)[1] = Math.max(merged.at(-1)[1], s[1]); else merged.push([...s]);
  return merged;
}
const fromD = d => svgpath(d).abs().segments.length ? toPolygons(d) : [];

export function deriveLetters(glyphs) {
  const has = c => !!glyphs.get(c)?.d;
  const ref = ['o', 'O', 'H', 'n', 'l'].map(c => glyphs.get(c)).find(g => g?.d);
  if (!ref) return [];
  const direction = outerDirection(ref.d);
  const P = new Map(), poly = c => { if (!P.has(c)) P.set(c, has(c) ? fromD(glyphs.get(c).d) : null); return P.get(c); };
  const top = chars => { for (const c of chars) if (poly(c)?.length) return bounds(poly(c)).y1; };
  const bottom = chars => { for (const c of chars) if (poly(c)?.length) return bounds(poly(c)).y0; };
  const capTop = top(['H', 'I', 'E', 'T', 'L']) ?? 700;
  const xTop = top(['x', 'z', 'v', 'n', 'u', 'o']) ?? capTop * .72;
  const asc = top(['l', 'h', 'b', 'd', 'k']) ?? capTop;
  const desc = bottom(['p', 'q', 'g', 'j', 'y']) ?? -.24 * capTop;
  const stem = has('l') || has('I') || has('i') ? measureStem(glyphs) : capTop * .12;
  const sides = c => { const g = glyphs.get(c), b = bounds(poly(c)); return { lsb: b.x0, rsb: g.advance - b.x1 }; };

  const made = new Map();
  const ok = c => (has(c) && !made.has(c) && glyphs.get(c).source !== DERIVED_SOURCE) || made.has(c);
  const get = c => made.get(c)?.polys ?? poly(c);
  const spacing = c => made.get(c)?.sides ?? sides(c);
  // Mỗi chữ: danh sách cách dựng, thử theo thứ tự; cách đầu tiên có đủ bộ phận được dùng.
  const rotate = (from, dy = 0) => ({ needs: [from], build: () => {
    const b = bounds(get(from)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const polys = get(from).map(p => p.map(q => ({ X: 2 * cx * S - q.X, Y: 2 * cy * S - q.Y + dy * S })));
    const s = spacing(from); return { polys, sides: { lsb: s.rsb, rsb: s.lsb } };
  } });
  const mirror = from => ({ needs: [from], build: () => {
    const b = bounds(get(from)), s = spacing(from);
    return { polys: union(get(from).map(p => p.map(q => ({ X: (b.x0 + b.x1) * S - q.X, Y: q.Y })))), sides: { lsb: s.rsb, rsb: s.lsb } };
  } });
  const copy = from => ({ needs: [from], build: () => ({ polys: get(from), sides: spacing(from) }) });
  const leftStem = (c, y) => spans(get(c), y, false)[0];
  const rightStem = (c, y) => spans(get(c), y, false).at(-1);
  const bowlStem = (bowl, left, down) => ({ needs: [bowl], build: () => {
    const o = get(bowl), b = bounds(o), s = spacing(bowl);
    let st;
    if (!down && ok('l')) {
      const l = get('l'), ls = leftStem('l', xTop * .5);
      st = shift(l, left ? b.x0 - ls[0] : b.x1 - ls[1]);
    } else st = left ? box(b.x0, down ? desc : 0, b.x0 + stem, down ? xTop : asc) : box(b.x1 - stem, down ? desc : 0, b.x1, down ? xTop : asc);
    return { polys: union(o, st), sides: s };
  } });
  const opened = (bowl, a0, a1, bar) => ({ needs: [bowl], build: () => {
    const o = get(bowl), b = bounds(o), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let polys = minus(o, fan(cx, cy, a0, a1, b.w + b.h));
    if (bar) {
      const walls = spans(o, cy, false), w = Math.max(stem * .8, b.h * .07);
      if (walls.length >= 2) polys = union(polys, box(walls[0][1] - 2, cy - w / 2, walls.at(-1)[0] + 2, cy + w / 2));
    }
    const s = spacing(bowl), nb = bounds(polys);
    return { polys, sides: { lsb: s.lsb, rsb: s.rsb + (b.x1 - nb.x1) * .5 } };
  } });
  const eBars = c => { const e = get(c), [, s1] = leftStem(c, capTop * .25), b = bounds(e); return { e, s1, b, bars: spans(e, s1 + .3 * (b.x1 - s1), true) }; };
  const rules = {
    h: [{ needs: ['n'], build: () => {
      const n = get('n'), [x0, x1] = leftStem('n', xTop * .3);
      let up = box(x0, xTop * .4, x1, asc);
      if (ok('l')) { const ls = leftStem('l', xTop * .5); up = shift(cut(get('l'), box(-1e4, xTop * .4, 1e4, 1e4)), x0 - ls[0]); }
      // Bỏ phần đầu thân trái của n (kể cả chân/serif đầu) để thân l thay vào, tránh serif chồng.
      return { polys: union(minus(n, box(-1e4, xTop * .4, x1 - 1, 1e4)), up), sides: spacing('n') };
    } }],
    n: [{ needs: ['h'], build: () => {
      const h = get('h'), [, x1] = leftStem('h', xTop * .3), arch = bounds(cut(h, box(x1 + stem * .3, -1e4, 1e4, 1e4))).y1;
      return { polys: cut(h, box(-1e4, -1e4, 1e4, arch)), sides: spacing('h') };
    } }, rotate('u')],
    u: [rotate('n')],
    m: [{ needs: ['n'], build: () => {
      const n = get('n'), [x0, x1] = leftStem('n', xTop * .3), [r0] = rightStem('n', xTop * .3);
      return { polys: union(n, shift(cut(n, box(x1 - 1, -1e4, 1e4, 1e4)), r0 - x0)), sides: spacing('n') };
    } }],
    r: [{ needs: ['n'], build: () => {
      const n = get('n'), [, x1] = leftStem('n', xTop * .3), [r0] = rightStem('n', xTop * .3);
      const polys = union(cut(n, box(-1e4, -1e4, x1, 1e4)), cut(n, box(-1e4, xTop * .62, r0 + stem * .55, 1e4)));
      return { polys, sides: { lsb: spacing('n').lsb, rsb: spacing('n').rsb * .6 } };
    } }],
    b: [bowlStem('o', true, false), rotate('q', asc - xTop), mirror('d')],
    d: [bowlStem('o', false, false), rotate('p', asc - xTop), mirror('b')],
    p: [bowlStem('o', true, true), rotate('d', xTop - asc), mirror('q')],
    q: [bowlStem('o', false, true), rotate('b', xTop - asc), mirror('p')],
    c: [opened('o', -36, 36, false)],
    e: [opened('o', -48, -6, true)],
    C: [opened('O', -34, 34, false)],
    // Không chép l ↔ I: chỉ giống nhau ở chữ không chân, đứng (Arial); chữ có chân/nghiêng l thường khác hẳn I hoa
    // (lỗi 23/11: ô I của font nghiêng nhận nét l thường). Cần ảnh mẫu.
    i: [{ needs: ['l'], build: () => {
      const st = cut(get('l'), box(-1e4, -1e4, 1e4, xTop)), [x0, x1] = leftStem('l', xTop * .5);
      let dot = ok('.') ? get('.') : box(0, 0, stem * 1.05, stem * 1.1);
      const db = bounds(dot), dotTop = Math.max(asc, xTop + stem * .8 + db.h);
      dot = shift(dot, (x0 + x1) / 2 - (db.x0 + db.x1) / 2, dotTop - db.y1);
      return { polys: union(st, dot), sides: spacing('l') };
    } }],
    F: [{ needs: ['E'], build: () => {
      const { e, s1, bars } = eBars('E');
      return { polys: union(cut(e, box(-1e4, -1e4, s1, 1e4)), cut(e, box(-1e4, bars[0][1] + .5, 1e4, 1e4))), sides: spacing('E') };
    } }],
    L: [{ needs: ['E'], build: () => {
      const { e, s1, bars } = eBars('E');
      return { polys: union(cut(e, box(-1e4, -1e4, s1, 1e4)), cut(e, box(-1e4, -1e4, 1e4, bars[0][1]))), sides: spacing('E') };
    } }],
    E: [{ needs: ['F', 'L'], build: () => {
      const { e: l, bars } = eBars('L'), f = get('F'), dx = bounds(f).x0 - bounds(l).x0;
      return { polys: union(f, shift(cut(l, box(-1e4, -1e4, 1e4, bars[0][1])), dx)), sides: spacing('F') };
    } }],
    R: [{ needs: ['P'], build: () => {
      const p = get('P'), b = bounds(p), [, s1] = leftStem('P', capTop * .2), bowl = spans(p, s1 + .5 * (b.x1 - s1), true);
      const start = [s1 + .3 * (b.x1 - s1), bowl[0][0] + stem * .3];
      const leg = cut(toPolygons(strokeAlong([start, [b.x1 + .05 * b.w, -stem]], stem * .95)), box(-1e4, b.y0, 1e4, bowl[0][1]));
      return { polys: union(p, leg), sides: { lsb: spacing('P').lsb, rsb: Math.max(spacing('P').rsb * .5, 10) } };
    } }],
    Q: [{ needs: ['O'], build: () => {
      const o = get('O'), b = bounds(o);
      const tail = toPolygons(strokeAlong([[b.x0 + .55 * b.w, b.y0 + .2 * b.h], [b.x1 + .04 * b.w, b.y0 - .1 * b.h]], stem * .9));
      return { polys: union(o, tail), sides: spacing('O') };
    } }],
    W: [{ needs: ['V'], build: () => {
      const v = get('V'), b = bounds(v), arm = rightStem('V', b.y1 - stem * .3);
      return { polys: union(v, shift(v, b.w - (arm[1] - arm[0]))), sides: spacing('V') };
    } }],
    w: [{ needs: ['v'], build: () => {
      const v = get('v'), b = bounds(v), arm = rightStem('v', b.y1 - stem * .3);
      return { polys: union(v, shift(v, b.w - (arm[1] - arm[0]))), sides: spacing('v') };
    } }],
    6: [rotate('9')],
    9: [rotate('6')],
  };

  // Skill mark-standards.md "Font toàn chữ hoa": ô chữ thường là hình chữ hoa (đỉnh x ≥ 0.9 chiều cao hoa).
  // Chữ thường còn thiếu chép từ chữ hoa tương ứng, không dựng từ bộ phận (h ← n sẽ ra hình N).
  if (xTop / capTop > .9) for (const char of 'abcdefghijklmnopqrstuvwxyz') rules[char] = [copy(char.toUpperCase())];
  for (let pass = 0; pass < 3; pass++) {
    let progress = false;
    for (const [char, ways] of Object.entries(rules)) {
      if (made.has(char) || (has(char) && glyphs.get(char).source !== DERIVED_SOURCE)) continue;
      for (const way of ways) {
        if (!way.needs.every(ok)) continue;
        try {
          const { polys, sides } = way.build();
          if (!polys?.length || !(bounds(polys).w > 0)) continue;
          made.set(char, { polys, sides, from: way.needs.join('+') }); progress = true; break;
        } catch (error) { if (globalThis.process?.env?.DERIVE_DEBUG) console.log(char, error); }
      }
    }
    if (!progress) break;
  }

  const result = [];
  for (const [char, { polys, sides, from }] of made) {
    const b = bounds(polys), lsb = Math.max(0, Math.round(sides.lsb)), rsb = Math.max(0, Math.round(sides.rsb));
    let out = polys.map(p => p.map(q => ({ X: q.X / S - b.x0 + lsb, Y: q.Y / S })));
    const toD = list => list.map(p => 'M' + p.map(q => q.X.toFixed(1) + ' ' + q.Y.toFixed(1)).join(' L') + ' Z').join(' ');
    if (outerDirection(toD(out)) !== direction) out = out.map(p => [...p].reverse());
    result.push({ char, d: toD(out), advance: Math.ceil(b.w + lsb + rsb), source: DERIVED_SOURCE, derivedFrom: from,
      origin: 'inferred', approved: false, locked: false });
  }
  return result;
}
