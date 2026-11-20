// Dựng dấu câu và ký hiệu còn thiếu từ chính nét chữ đã có (độ dày thân, chấm chữ i, chiều cao chữ hoa
// và chữ thường). Chỉ điền ô còn trống, luôn đánh dấu "suy luận" để duyệt; không thay chữ lấy từ ảnh.
// Ký tự hình phức tạp (? @ & $ % *) không tự vẽ: cần ảnh mẫu.
import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';
import { polygon, strokeAlong, outerDirection, measureStem, deriveMarkSamples } from './vietnamese.js';

const rect = (x0, y0, x1, y1) => polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

function reverse(d) {
  const points = svgpath(d).abs().segments.filter(([c]) => c === 'M' || c === 'L').map(([, x, y]) => [x, y]);
  return polygon(points.reverse());
}

function contours(d) {
  const list = [];
  for (const segment of svgpath(d).abs().unshort().unarc().segments) {
    if (segment[0] === 'M') list.push([]);
    list.at(-1)?.push(segment.join(' '));
  }
  return list.map(parts => parts.join(' '));
}

// Đo các thông số của bộ chữ.
function measure(glyphs) {
  const top = chars => { for (const c of chars) { const g = glyphs.get(c); if (g?.d) { const b = glyphBounds(g); return b.y + b.height; } } };
  const stem = measureStem(glyphs);
  const capTop = top(['H', 'I', 'E', 'T', 'L']) ?? 700;
  const xTop = top(['x', 'z', 'v', 'n', 'u']) ?? capTop * .75;
  const reference = glyphs.get('o') || glyphs.get('O') || glyphs.get('H');
  const direction = reference?.d ? outerDirection(reference.d) : 1;
  // Chấm: lấy chấm của chữ i (contour nhỏ phía trên), không có thì dùng dấu chấm, cuối cùng là ô vuông.
  let dot;
  const i = glyphs.get('i');
  if (i?.d) {
    const parts = contours(i.d).map(d => ({ d, box: glyphBounds({ d }) })).sort((a, b) => b.box.y - a.box.y);
    if (parts.length >= 2 && parts[0].box.height < (glyphBounds(i).height) * .35) dot = parts[0].d;
  }
  if (!dot && glyphs.get('.')?.d) dot = glyphs.get('.').d;
  if (!dot) dot = rect(0, 0, stem * 1.1, stem * 1.1);
  const dotBox = glyphBounds({ d: dot });
  return { stem, capTop, xTop, direction, dot, dotBox, bar: .82 * stem, sb: Math.max(40, Math.round(.45 * stem)) };
}

export function deriveSymbols(glyphs) {
  const m = measure(glyphs);
  const { stem, capTop, xTop, bar, sb, dotBox } = m;
  const orient = d => contours(d).map(part => outerDirection(part) === m.direction ? part : reverse(part)).join(' ');
  const dotAt = (x, y) => svgpath(m.dot).translate(x - dotBox.x, y - dotBox.y).toString();
  const dw = dotBox.width, dh = dotBox.height, mid = xTop * .47;
  // Đuôi phẩy: từ đáy chấm cong xuống trái, thon dần.
  const tail = (x, y) => strokeAlong(Array.from({ length: 9 }, (_, k) => {
    const s = k / 8;
    return [x + dw * (.62 - .55 * s), y + dh * (.35 - 1.15 * s) - dh * .1 * s * s];
  }), s => dw * (.58 - .3 * s));
  const comma = (x, y) => dotAt(x, y) + ' ' + tail(x, y);
  const turned = d => { const b = glyphBounds({ d }); return svgpath(d).translate(-b.x - b.width / 2, -b.y - b.height / 2).rotate(180).translate(b.x + b.width / 2, b.y + b.height / 2).toString(); };
  const quoteTop = capTop;
  const quoteY = quoteTop - dh;
  const single = () => comma(0, quoteY);
  const pairGap = dw * .55;
  const shapes = {
    '.': () => dotAt(0, 0),
    ':': () => dotAt(0, 0) + ' ' + dotAt(0, xTop - dh),
    ',': () => comma(0, 0),
    ';': () => comma(0, 0) + ' ' + dotAt(0, xTop - dh),
    '’': single,
    '‘': () => turned(single()),
    '”': () => single() + ' ' + svgpath(single()).translate(dw + pairGap, 0).toString(),
    '“': () => { const one = turned(single()); return one + ' ' + svgpath(one).translate(dw + pairGap, 0).toString(); },
    "'": () => strokeAlong([[0, quoteTop], [0, quoteTop - .32 * capTop]], s => stem * (.85 - .25 * s)),
    '"': () => { const one = strokeAlong([[0, quoteTop], [0, quoteTop - .32 * capTop]], s => stem * (.85 - .25 * s)); return one + ' ' + svgpath(one).translate(stem * 1.6, 0).toString(); },
    '!': () => strokeAlong([[0, capTop], [0, dh * 1.9]], s => stem * (1 - .2 * s)) + ' ' + dotAt(-dw / 2, 0),
    '-': () => rect(0, mid - bar / 2, Math.max(2.4 * stem, .48 * xTop), mid + bar / 2),
    '–': () => rect(0, mid - bar / 2, 500 - 2 * sb, mid + bar / 2),
    '—': () => rect(0, mid - bar / 2, 1000 - 2 * sb, mid + bar / 2),
    '_': () => rect(0, -150 - bar / 2, 560, -150 + bar / 2),
    '=': () => { const w = .55 * capTop, g = bar * .9; return rect(0, mid + g / 2, w, mid + g / 2 + bar) + ' ' + rect(0, mid - g / 2 - bar, w, mid - g / 2); },
    '+': () => { const w = .55 * capTop; return rect(0, mid - bar / 2, w, mid + bar / 2) + ' ' + rect(w / 2 - bar / 2, mid - w / 2, w / 2 + bar / 2, mid + w / 2); },
    '<': () => { const w = .48 * capTop, h = .5 * capTop; return strokeAlong([[w, mid + h / 2], [0, mid], [w, mid - h / 2]], bar); },
    '>': () => { const w = .48 * capTop, h = .5 * capTop; return strokeAlong([[0, mid + h / 2], [w, mid], [0, mid - h / 2]], bar); },
    '/': () => strokeAlong([[0, -.12 * capTop], [.42 * capTop, capTop * 1.04]], stem * .9),
    '\\': () => strokeAlong([[.42 * capTop, -.12 * capTop], [0, capTop * 1.04]], stem * .9),
    '|': () => rect(0, -.22 * capTop, stem * .9, capTop * 1.06),
    '(': () => paren(true), ')': () => paren(false),
    '[': () => bracket(false), ']': () => bracket(true),
    '~': () => { const t = deriveMarkSamples(glyphs).marks.get('̃').d, b = glyphBounds({ d: t }); return svgpath(t).translate(-b.x, mid - b.y - b.height / 2).toString(); },
    '^': () => { const t = deriveMarkSamples(glyphs).marks.get('̂').d, b = glyphBounds({ d: t }); return svgpath(t).translate(-b.x, capTop - b.y - b.height).toString(); },
    '#': () => {
      const h = .78 * capTop, w = .62 * capTop, lean = .12 * capTop, th = stem * .82;
      const v = x => strokeAlong([[x, 0], [x + lean, h]], th);
      return v(w * .22) + ' ' + v(w * .62) + ' ' + rect(0, h * .3 - th / 2, w + lean * .4, h * .3 + th / 2) + ' ' + rect(lean * .4, h * .68 - th / 2, w + lean, h * .68 + th / 2);
    },
  };
  function paren(right) {
    const bottom = -.22 * capTop, top = capTop * 1.04, h = top - bottom, depth = .2 * h;
    const points = Array.from({ length: 21 }, (_, k) => {
      const a = (-.5 + k / 20) * Math.PI * .72, x = depth * (1 - Math.cos(a)) / (1 - Math.cos(Math.PI * .36));
      return [right ? x : depth - x, bottom + h / 2 + Math.sin(a) / Math.sin(Math.PI * .36) * h / 2];
    });
    return strokeAlong(points, s => stem * (.78 + .22 * Math.sin(Math.PI * s)));
  }
  function bracket(right) {
    const bottom = -.22 * capTop, top = capTop * 1.04, arm = 1.6 * stem, th = stem * .9, hb = bar;
    const shape = rect(0, bottom, th, top) + ' ' + rect(0, top - hb, arm, top) + ' ' + rect(0, bottom, arm, bottom + hb);
    return right ? svgpath(shape).scale(-1, 1).translate(arm, 0).toString() : shape;
  }
  const result = [];
  for (const [char, build] of Object.entries(shapes)) {
    const existing = glyphs.get(char);
    if (existing?.d && existing.source !== 'Dựng từ nét chữ') continue;   // chỉ làm lại ký tự do chính bước này dựng
    try {
      const raw = orient(build());
      const box = glyphBounds({ d: raw });
      const d = svgpath(raw).translate(sb - box.x, 0).round(1).toString();
      const advance = ['–', '—'].includes(char) ? (char === '–' ? 500 : 1000) : Math.ceil(box.width + 2 * sb);
      result.push({ char, d, advance, source: 'Dựng từ nét chữ', origin: 'inferred', approved: false, locked: false });
    } catch { /* Bỏ qua ký tự không dựng được. */ }
  }
  return result;
}
