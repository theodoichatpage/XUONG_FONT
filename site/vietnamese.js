import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';

export const core = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
export const lowercase = [...'abcdefghijklmnopqrstuvwxyzđ'];
export const punctuation = [...'.,:;!?-–—()“”‘’/+<>', ...`"'@#$%^&*[]{}_=~\\|`];
export const toneSamples = new Map([
  ['\u0301', 'Sắc'], ['\u0300', 'Huyền'], ['\u0323', 'Nặng'],
  ['\u0303', 'Ngã'], ['\u0309', 'Hỏi'], ['\u0306', 'Trăng'], ['\u0302', 'Mũ'], ['\u031b', 'Râu']
]);

const vowels = [...'AĂÂEÊIOÔƠUƯYaăâeêioôơuưy'];
const tones = ['', '\u0300', '\u0301', '\u0309', '\u0303', '\u0323'];
export const accented = [...new Set(vowels.flatMap(vowel => tones.map(tone => (vowel + tone).normalize('NFC'))))]
  .filter(char => !core.includes(char) && !lowercase.includes(char));
export const charset = [...core, 'Đ', ...lowercase, ...accented, ...punctuation];

const templates = {
  '\u0300': 'M-73 94 L-20 94 L62 0 L18 0 Z',
  '\u0301': 'M73 94 L20 94 L-62 0 L-18 0 Z',
  '\u0309': 'M-53 55 C-50 120 71 113 66 60 C64 35 20 29 20 0 L-17 0 C-17 40 28 49 28 66 C28 83 -16 83 -17 55 Z',
  '\u0303': 'M-106 15 C-75 124 14 18 47 57 Q66 62 78 83 L103 77 C73 -26 -15 77 -50 39 Q-67 35 -77 8 Z',
  '\u0302': 'M-113 4 L-21 100 L22 100 L113 4 L67 4 L0 60 L-67 4 Z',
  '\u0306': 'M-113 92 L-78 92 Q0 7 78 92 L113 92 Q83 0 0 0 Q-83 0 -113 92 Z',
  '\u031b': 'M-48 0 Q31 0 54 112 L90 112 Q78 -28 -19 -35 Z',
  '\u0323': 'M41 0 A41 41 0 1 0 -41 0 A41 41 0 1 0 41 0 Z'
};

// Short curved neck and round terminal from the approved uppercase design.
const compactHorn = 'M0 5 C17 10 31 20 39 34 C25 40 20 49 20 62 C20 80 34 94 52 94 C70 94 84 80 84 62 C84 40 69 26 47 15 L4 0 Z';

function undotI(glyph) {
  const contours = [];
  for (const segment of svgpath(glyph.d).abs().segments) {
    if (segment[0] === 'M') contours.push([]);
    contours.at(-1)?.push(segment);
  }
  if (contours.length !== 2) return null;
  const parts = contours.map(contour => {
    const shape = { d: contour.map(([command, ...coordinates]) => command + coordinates.join(' ')).join('') };
    return { shape, bounds: glyphBounds(shape) };
  }).sort((a, b) => b.bounds.height - a.bounds.height);
  const [stem, dot] = parts;
  if (dot.bounds.y <= stem.bounds.y + stem.bounds.height || dot.bounds.height > stem.bounds.height * .35) return null;
  return { ...glyph, d: stem.shape.d };
}

export function composeVietnamese(glyphs, replace = () => false, { replaceHorn = false, requireReferenceMarks = false } = {}) {
  const result = [];
  for (const char of accented) {
    if (['Ảnh mẫu', 'Ảnh làm sạch', 'Font gốc'].includes(glyphs.get(char)?.source) && !replace(char)) continue;
    const [root, ...marks] = char.normalize('NFD');
    const horn = '\u031b';
    const horned = (root + horn).normalize('NFC');
    const useHornedSample = !replaceHorn && marks.length > 1 && marks.includes(horn)
      && glyphs.get(horned)?.source === 'Ảnh mẫu';
    const useCompactHorn = !replaceHorn && marks.includes(horn) && glyphs.get(horned)?.hornStyle === 'compact';
    const base = useHornedSample ? horned : root;
    if (useHornedSample) marks.splice(marks.indexOf(horn), 1);
    if (requireReferenceMarks && marks.some(mark=>{const sample=glyphs.get(mark);return !sample?.d || !(sample.origin==='direct'||sample.source==='Ảnh mẫu'||sample.source==='Font gốc');})) continue;
    let original = glyphs.get(base);
    if (original && base === 'i' && !marks.includes('\u0323')) original = undotI(original);
    if (!original) continue;
    const bounds = glyphBounds(original);
    const bodyTop = bounds.y + bounds.height;
    let top = bodyTop + 28;
    let advance = original.advance;
    const paths = [original.d];
    // Dấu dựng từ nét (nativeSize) được xếp theo quy tắc skill sau vòng lặp: chữ hoa dấu nhỏ và sát hơn,
    // mũ/trăng không rộng quá nguyên âm, cả chồng dấu phải nằm trong chiều cao dòng.
    const isCap = root !== root.toLowerCase();
    const stack = [];
    let fit, derived;
    for (const mark of [...marks].sort((a, b) => Number(b === '\u0302' || b === '\u0306') - Number(a === '\u0302' || a === '\u0306'))) {
      let x = bounds.x + bounds.width / 2;
      let y = top;
      if (mark === horn && useCompactHorn) {
        const scale = Math.min(.9, bounds.width * .38 / 84);
        const overlap = bounds.width * (root === 'o' ? .23 : .15);
        const right = bounds.x + bounds.width;
        paths.push(svgpath(compactHorn).scale(scale).translate(right - overlap, bodyTop - 35).round(1).toString());
        advance += Math.max(0, Math.ceil(84 * scale - overlap));
        continue;
      }
      // Dấu chưa có trong font (ví dụ font gốc chỉ có á à ã â ă, thiếu râu, nặng, hỏi): dựng theo nét của
      // chính bộ chữ thay vì dùng hình mẫu cố định, để độ dày khớp kiểu chữ (Thin, Bold...).
      const sample = toneSamples.has(mark) ? glyphs.get(mark)?.d ? glyphs.get(mark) : (derived ??= deriveMarkSamples(glyphs).marks).get(mark) : undefined;
      if (sample) {
        const source = glyphBounds(sample);
        if (source.width > 0 && source.height > 0) {
          if (mark === '\u031b' && sample.nativeSize) {
            // Skill: r\u00e2u n\u1ed1i v\u00e0o th\u00e2n \u1edf v\u00f9ng tr\u00ean b\u00ean ph\u1ea3i o/u. T\u00ecm m\u00e9p ph\u1ea3i th\u1eadt c\u1ee7a n\u00e9t t\u1ea1i \u0111\u1ed9 cao n\u1ed1i
            // (o cong v\u00e0o trong n\u00ean kh\u00f4ng d\u00f9ng khung ch\u1eef nh\u1eadt), c\u1eafm g\u1ed1c r\u00e2u v\u00e0o trong n\u00e9t \u0111\u1ec3 li\u1ec1n kh\u1ed1i.
            const attachY = bounds.y + bounds.height * (/[oO]/u.test(root) ? .8 : .9);
            const edge = rightEdgeAt(original.d, attachY) ?? bounds.x + bounds.width;
            const inset = .45 * (sample.stem || bounds.width * .2);
            const horn = sameDirection(sample.d, original.d);
            paths.push(svgpath(horn).translate(edge - inset, attachY).round(1).toString());
            const hornRight = edge - inset + source.x + source.width;
            advance = Math.max(advance, Math.ceil(hornRight + 25));
            continue;
          }
          if (mark === '\u031b') {
            const scale = sample.nativeSize ? Math.min(1, bounds.width * .60 / source.width)
              : Math.min(130 / source.height, bounds.width * .60 / source.width);
            const width = source.width * scale, height = source.height * scale;
            const overlap = Math.min(width * .32, bounds.width * .12);
            const right = bounds.x + bounds.width;
            // The left base of the horn seats inside the upper-right stem.
            paths.push(svgpath(sample.d).translate(-source.x, -source.y).scale(scale)
              .translate(right - overlap, bodyTop - height * .62).round(1).toString());
            advance += Math.max(0, Math.ceil(width - overlap));
            continue;
          }
          if (sample.nativeSize && mark !== '\u0323') { stack.push({ mark, sample, source }); continue; }
          const targetHeight = mark === '\u0309' ? 122 : mark === '\u0323' ? 80 : 95;
          const ownSize = sample.nativeSize || sample.source === 'Font gốc';   // dấu lấy từ chính font: giữ cỡ gốc
          const scale = Math.min(ownSize ? 1 : targetHeight / source.height, bounds.width * 1.2 / source.width);
          const height = source.height * scale;
          if (mark === '\u0323') y = bounds.y - 28 - height;
          else top += height + 28;
          paths.push(svgpath(sample.d).translate(-source.x - source.width / 2, -source.y)
            .scale(scale).translate(x, y).round(1).toString());
          continue;
        }
      }
      if (mark === '\u0323') y = bounds.y - 69;
      else if (mark === '\u031b') {
        x = bounds.x + bounds.width;
        y = bodyTop - 72;
        advance += 60;
      } else top += 123;
      paths.push(svgpath(templates[mark]).unarc().translate(x, y).round(1).toString());
    }
    if (stack.length) {
      // Quy tắc skill mục 8 (chữ hoa) và "Các mức số": dấu hoa 90%, khoảng hở hoa chặt hơn thường.
      const sizeRule = isCap ? .9 : 1, gapRule = isCap ? 22 : 28, minGap = 14;
      const widthRule = isCap ? .7 : .8;   // mũ, trăng: kiểm độ rộng theo nguyên âm
      const items = stack.map(({ mark, sample, source }) => {
        const wide = mark === '̂' || mark === '̆';
        const limit = bounds.width * (wide ? widthRule : 1.1) / source.width;
        return { mark, sample, source, scale: Math.min(sizeRule, limit) };
      });
      // Cả chồng dấu phải vừa chiều cao dòng (ascender 1000, chừa 20).
      const base = top - 28;   // trên các dấu đã đặt trước (dấu lấy từ font gốc)
      const room = 980 - base;
      const need = (factor, gap) => items.reduce((sum, item) => sum + gap + item.source.height * item.scale * factor, 0);
      let factor = 1, gap = gapRule;
      if (need(1, gapRule) > room) {
        gap = Math.max(minGap, gapRule - (need(1, gapRule) - room) / items.length);
        factor = Math.max(.7, Math.min(1, (room - gap * items.length) / need(1, 0)));
      }
      let y = base;
      for (const item of items) {
        const scale = item.scale * factor;
        y += gap;
        paths.push(svgpath(item.sample.d).translate(-item.source.x - item.source.width / 2, -item.source.y)
          .scale(scale).translate(bounds.x + bounds.width / 2, y).round(1).toString());
        y += item.source.height * scale;
      }
      fit = { factor: Math.round(factor * 100) / 100, gap: Math.round(gap), top: Math.round(y), fits: y <= 1000 };
    }
    result.push({ char, d: paths.join(' '), advance, source: 'Ghép dấu', origin:'inferred', approved:false, locked:false, base,
      ...(fit ? { markFit: fit } : {}),
      ...(useCompactHorn && char === horned ? { hornStyle: 'compact' } : {}) });
  }
  return result;
}

// Explicit application only replaces existing variants that can use an imported mark.
export function applyReferenceMarks(glyphs, selection) {
  const selectedMarks = Array.isArray(selection) ? selection.filter(mark => toneSamples.has(mark) && glyphs.has(mark))
    : toneSamples.has(selection) ? [selection].filter(mark => glyphs.has(mark)) : undefined;
  const base = selectedMarks ? undefined : selection?.normalize('NFD')[0];
  if (selectedMarks ? !selectedMarks.length : !base || !glyphs.has(base)) return [];
  const targets = new Set(accented.filter(char => {
    if (!glyphs.has(char)) return false;
    const [root, ...marks] = char.normalize('NFD');
    return selectedMarks ? marks.some(mark => selectedMarks.includes(mark)) : root === base
      && marks.some(mark => toneSamples.has(mark) && glyphs.has(mark));
  }));
  return composeVietnamese(glyphs, char => targets.has(char), {
    replaceHorn: selectedMarks?.includes('\u031b')
  }).filter(glyph => targets.has(glyph.char));
}

export function applyCompactLowercaseHorns(glyphs) {
  const drafts = new Map(glyphs);
  const selected = new Set();
  for (const [base, horned] of [['o', 'ơ'], ['u', 'ư']]) {
    if (!glyphs.has(base)) continue;
    selected.add(base);
    drafts.set(horned, { ...drafts.get(horned), source: 'Ghép dấu', hornStyle: 'compact' });
  }
  const matches = char => {
    const [base, ...marks] = char.normalize('NFD');
    return selected.has(base) && marks.includes('\u031b');
  };
  return composeVietnamese(drafts, matches).filter(glyph => matches(glyph.char));
}

// ---------- Dựng dấu mẫu và Đ/đ từ nét chữ đã có ----------
// Theo quy tắc trong skill design-vietnamese-fonts: sắc/huyền thon dần về đầu dưới, mũ là chevron
// (không dùng caron), trăng là cung cong với hai đầu bằng, nặng đối chiếu dấu chấm, hỏi gọn và khác
// dấu chấm hỏi, gạch Đ nằm giữa cap-height, gạch đ nằm giữa x-height và ascender.
// Độ dày lấy từ thân chữ l/I của chính bộ font. Kết quả luôn là "suy luận" và cần duyệt.

const round1 = value => Math.round(value * 10) / 10;
export const polygon = points => 'M' + points.map(([x, y]) => round1(x) + ' ' + round1(y)).join(' L') + ' Z';

// Nét dày đều dọc theo một đường tâm, hai đầu bằng.
export function strokeAlong(points, width) {
  // width: số, hoặc hàm (vị trí 0..1) → độ dày, để nét thon dần như quy tắc skill.
  const at = typeof width === 'function' ? width : () => width;
  const left = [], right = [];
  points.forEach((point, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1, w = at(i / (points.length - 1));
    const nx = -dy / length * w / 2, ny = dx / length * w / 2;
    left.push([point[0] + nx, point[1] + ny]);
    right.push([point[0] - nx, point[1] - ny]);
  });
  return polygon([...left, ...right.reverse()]);
}

export function measureStem(glyphs) {
  for (const char of ['l', 'I', 'i']) {
    const glyph = glyphs.get(char);
    if (!glyph?.d) continue;
    const box = glyphBounds(glyph);
    if (box.width > 0 && box.height / box.width >= 3) return box.width;
  }
  return 90;
}

export function deriveMarkSamples(glyphs) {
  const stem = measureStem(glyphs), t = Math.max(28, Math.min(130, stem * .82));
  const marks = new Map();
  const add = (mark, d) => marks.set(mark, { char: mark, d, advance: 0, source: 'Dựng từ nét chữ', origin: 'inferred',
    nativeSize: true, stem, approved: false, locked: false });

  // Sắc và huyền: nét xiên, đầu trên rộng hơn đầu dưới.
  const acuteH = Math.max(95, 1.9 * t), span = .55 * acuteH, slope = Math.sin(Math.atan2(acuteH, span));
  const wide = 1.12 * t / slope, narrow = .72 * t / slope;
  add('́', polygon([[0, 0], [narrow, 0], [span + wide, acuteH], [span, acuteH]]));
  add('̀', polygon([[span, 0], [span + narrow, 0], [wide, acuteH], [0, acuteH]]));

  // Mũ: chevron đỉnh bằng, nét nhẹ hơn thân và hẹp hơn nguyên âm (skill: kiểm độ rộng theo nguyên âm).
  const capT = .88 * t, capH = Math.max(90, 1.75 * capT), half = 1.15 * capH, angle = Math.atan2(capH, half);
  const leg = capT / Math.sin(angle), notch = capH - capT / Math.cos(angle), flat = .3 * capT;
  add('̂', polygon([[-half, 0], [-half + leg, 0], [0, notch], [half - leg, 0], [half, 0], [flat, capH], [-flat, capH]]));

  // Trăng: lưỡi liềm giữa hai cung tròn, đáy đậm nhất, hai đầu thon và cắt ngang bằng nhau, đối xứng.
  // Dùng cung tròn (không phải nửa elip) để mép trong không tự gập thành khấc ở hai đầu.
  const breveT = .78 * t, breveHalf = Math.max(100, 1.9 * t), breveH = .62 * breveHalf, breveEnd = .45 * breveT;
  const outerR = (breveHalf ** 2 + breveH ** 2) / (2 * breveH);
  const innerHalf = breveHalf - breveEnd, innerH = breveH - breveT, innerR = (innerHalf ** 2 + innerH ** 2) / (2 * innerH);
  const arcPoints = (r, cy, half, steps, reverse) => {
    const end = Math.asin(Math.min(1, half / r)), list = [];
    for (let i = 0; i <= steps; i++) { const a = -end + 2 * end * i / steps; list.push([r * Math.sin(a), cy - r * Math.cos(a)]); }
    return reverse ? list.reverse() : list;
  };
  add('̆', polygon([...arcPoints(outerR, outerR, breveHalf, 40, false), ...arcPoints(innerR, breveT + innerR, innerHalf, 40, true)]));

  // Ngã: sóng một nhịp mềm. Bán kính cong của đường tâm luôn lớn hơn nửa độ dày nét
  // để mép không tự gập thành răng cưa (skill: giữ nhịp uốn và nét sạch).
  const tildeT = .82 * t, waveW = Math.max(200, 3.9 * t), waveSpan = 2.5 * Math.PI;
  const curvature = (waveSpan / waveW) ** 2;
  const amplitude = Math.min(.32 * t + 10, 1 / (curvature * .62 * tildeT));
  add('̃', strokeAlong(Array.from({ length: 49 }, (_, i) => {
    const phase = -.25 * Math.PI + waveSpan * i / 48;
    return [-waveW / 2 + waveW * i / 48, amplitude * Math.sin(phase)];
  }), s => tildeT * (.86 + .14 * Math.sin(Math.PI * s))));

  // Hỏi: móc gọn, lòng mở, khác dấu chấm hỏi (skill). Đầu móc thon, cung tròn đều, cuối cung uốn mềm về giữa
  // rồi thành chân ngắn thẳng đứng, đầu chân cắt ngang. Nét nhẹ hơn thân chữ.
  const hookT = .55 * t, hookR = .55 * t, hookTail = .38 * t, hookBendDrop = .25 * hookR;
  const hookC = 1.16 * hookR + hookBendDrop + hookTail;
  const hookArc = Array.from({ length: 25 }, (_, i) => {
    const a = Math.PI * (160 - 220 * i / 24) / 180;
    return [Math.cos(a) * hookR, hookC + Math.sin(a) * hookR];
  });
  // Từ cuối cung (đang đi xuống trái) uốn bằng Bézier bậc hai: điểm điều khiển trên trục giữa, kết thúc ngay dưới nó
  // nên tiếp tuyến liền ở cả hai đầu; sau đó là chân thẳng đứng.
  const [ex, ey] = hookArc.at(-1), control = [0, hookC - 1.16 * hookR], foot = [0, hookTail];
  const hookBend = Array.from({ length: 8 }, (_, i) => {
    const s = (i + 1) / 8, q = 1 - s;
    return [q * q * ex + 2 * q * s * control[0] + s * s * foot[0], q * q * ey + 2 * q * s * control[1] + s * s * foot[1]];
  });
  const hookPath = [...hookArc, ...hookBend, [0, 0]];
  add('̉', strokeAlong(hookPath, s => hookT * (.72 + .28 * Math.min(1, s * 3))));

  // Nặng: dùng đúng dấu chấm của bộ chữ nếu có.
  const period = glyphs.get('.');
  if (period?.d) {
    // Skill: nặng đối chiếu dấu chấm về độ lớn, nhưng tránh dấu nặng quá lớn. Ở kiểu mảnh (Thin, Light)
    // dấu chấm thường to gấp 2–3 lần nét chữ để dễ thấy cuối câu; dấu nặng chỉ cần cỡ khoảng 1,7 lần nét.
    const box = glyphBounds(period), size = Math.max(box.width, box.height), cap = Math.max(28, 1.7 * stem);
    const k = size > cap ? cap / size : 1;
    add('̣', svgpath(period.d).translate(-box.x, -box.y).scale(k).round(1).toString());
  }
  else {
    const r = .62 * t;
    add('̣', polygon(Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 8) * r, Math.sin(i * Math.PI / 8) * r])));
  }

  // Râu: gốc nằm ngang cắm vào thân, vươn sang phải rồi cong lên; dày gần bằng nét chữ,
  // thon nhẹ về đầu và cắt bằng theo kiểu đầu nét của bộ chữ.
  const hornT = .95 * stem, hornH = Math.max(110, 1.55 * hornT), hornW = .9 * hornT + 45;
  add('̛', strokeAlong(Array.from({ length: 25 }, (_, i) => {
    const s = i / 24;
    return [hornW * Math.sin(s * Math.PI / 2), hornH * Math.pow(s, 1.8)];
  }), s => hornT * (1 - .18 * s)));
  return { marks, stem, thickness: t };
}

// Chiều của contour lớn nhất trong glyph: gạch phải cùng chiều để chỗ chồng lên thân được tô, không bị khoét.
export function outerDirection(d) {
  let best = 0, contour = [];
  const close = () => {
    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const [x0, y0] = contour[i], [x1, y1] = contour[(i + 1) % contour.length];
      area += x0 * y1 - x1 * y0;
    }
    if (Math.abs(area) > Math.abs(best)) best = area;
    contour = [];
  };
  for (const segment of svgpath(d).abs().unarc().segments) {
    if (segment[0] === 'M' && contour.length) close();
    if (segment.length >= 3) contour.push(segment.slice(-2));
  }
  if (contour.length) close();
  return Math.sign(best) || 1;
}

function addBar(glyph, char, center, x0, x1, stem) {
  const half = .39 * stem, offset = Math.max(0, 40 - x0);
  const corners = [[x0, center - half], [x1, center - half], [x1, center + half], [x0, center + half]];
  const bar = polygon(outerDirection(glyph.d) > 0 ? corners : corners.reverse());
  return { char, d: svgpath(glyph.d + ' ' + bar).translate(offset, 0).round(1).toString(),
    advance: Math.max(glyph.advance + offset, Math.ceil(x1 + offset + 40)),
    source: 'Dựng từ nét chữ', origin: 'inferred', approved: false, locked: false, base: glyph.char };
}

export function deriveBarredD(glyphs, stem = measureStem(glyphs)) {
  const result = [];
  const upper = glyphs.get('D'), lower = glyphs.get('d');
  if (upper?.d) {
    const b = glyphBounds(upper);
    result.push(addBar(upper, 'Đ', b.y + b.height * .47, b.x - .55 * stem, b.x + stem + Math.min(b.width * .3, 1.4 * stem), stem));
  }
  if (lower?.d) {
    const b = glyphBounds(lower), o = glyphs.get('o');
    const xHeight = o?.d ? glyphBounds(o).y + glyphBounds(o).height : b.y + b.height * .75;
    const right = b.x + b.width;
    result.push(addBar(lower, 'đ', (xHeight + b.y + b.height) / 2, right - stem - Math.min(b.width * .35, 1.4 * stem), right + .45 * stem, stem));
  }
  return result;
}

// Mép phải thật của các contour tại độ cao y (đơn vị font, trục y hướng lên).
function rightEdgeAt(d, y) {
  let best = null, x0 = 0, y0 = 0, sx = 0, sy = 0;
  const cross = (ax, ay, bx, by) => {
    if ((ay - y) * (by - y) > 0 || ay === by) return;
    const x = ax + (bx - ax) * (y - ay) / (by - ay);
    if (best === null || x > best) best = x;
  };
  for (const [command, ...v] of svgpath(d).abs().unarc().unshort().segments) {
    if (command === 'M') { [x0, y0] = v; sx = x0; sy = y0; continue; }
    const points = [];
    if (command === 'L') points.push(v);
    else if (command === 'H') points.push([v[0], y0]);
    else if (command === 'V') points.push([x0, v[0]]);
    else if (command === 'Z') points.push([sx, sy]);
    else for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t, [ex, ey] = v.slice(-2);
      points.push(command === 'Q'
        ? [u * u * x0 + 2 * u * t * v[0] + t * t * ex, u * u * y0 + 2 * u * t * v[1] + t * t * ey]
        : [u ** 3 * x0 + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t ** 3 * ex, u ** 3 * y0 + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t ** 3 * ey]);
    }
    for (const [x, py] of points) { cross(x0, y0, x, py); x0 = x; y0 = py; }
  }
  return best;
}

// Đảo chiều đa giác dấu nếu ngược chiều contour ngoài của thân, để phần chồng lên thân được tô liền.
export function sameDirection(markD, bodyD) {
  if (outerDirection(markD) === outerDirection(bodyD)) return markD;
  const points = svgpath(markD).abs().segments.filter(([c]) => c === 'M' || c === 'L').map(([, x, y]) => [x, y]);
  return polygon(points.reverse());
}
