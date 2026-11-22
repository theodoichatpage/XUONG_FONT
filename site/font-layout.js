import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';

const { XH, band } = require('../src/metrics');
const resolution = .25;
const profiles = new WeakMap();
const fixedTs = new WeakMap();
let surface;

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function profile(glyph) {
  if (profiles.has(glyph)) return profiles.get(glyph);
  const box = glyphBounds(glyph);
  surface ??= document.createElement('canvas');
  const width = surface.width = Math.max(1, Math.ceil(box.width * resolution) + 2);
  const height = surface.height = Math.max(1, Math.ceil(box.height * resolution) + 2);
  const context = surface.getContext('2d', { willReadFrequently: true });
  const top = box.y + box.height;
  context.setTransform(resolution, 0, 0, -resolution, 1 - box.x * resolution, 1 + top * resolution);
  context.fill(new Path2D(glyph.d));
  const pixels = context.getImageData(0, 0, width, height).data;
  const rows = [];
  for (let y = 0; y < height; y++) {
    let left = width, right = -1, firstEnd = -1, lastStart = -1;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 128) {
        if (right >= 0 && firstEnd < 0) firstEnd = right + 1;
        continue;
      }
      if (right < 0 || x > right + 1) lastStart = x;
      left = Math.min(left, x);
      right = x;
    }
    if (right >= left) rows.push({
      y: top - (y - .5) / resolution,
      left: (left - .5) / resolution + box.x,
      right: (right - .5) / resolution + box.x,
      width: (right - left + 1) / resolution,
      stem: ((firstEnd < 0 ? right + 1 : firstEnd) - left) / resolution,
      rightStem: (right + 1 - lastStart) / resolution,
      separated: lastStart > left
    });
  }
  const result = { box, rows };
  profiles.set(glyph, result);
  return result;
}

export function fitLowercaseT(glyph) {
  if (glyph.char !== 't') return glyph;
  if (fixedTs.has(glyph)) return fixedTs.get(glyph);
  const { box, rows } = profile(glyph);
  const top = box.y + box.height;
  const stem = median(rows.filter(row => row.y >= box.y + box.height * .35 && row.y <= box.y + box.height * .60)
    .map(row => row.width));
  const shoulder = rows.filter(row => row.y < top - box.height * .055 && row.y > top - box.height * .40);
  const widest = Math.max(...shoulder.map(row => row.width));
  const bar = shoulder.find((row, i) => row.width >= Math.max(stem * 1.16, widest * .82)
    && shoulder[i + 1]?.width >= stem * 1.12);
  if (!bar || bar.y <= box.y + 100 || top - bar.y < 12) {
    fixedTs.set(glyph, glyph);
    return glyph;
  }
  const idealTop = band('t')[1];
  const mapped = svgpath(glyph.d).abs().unshort().unarc().iterate(segment => {
    if (!'MLCQ'.includes(segment[0])) return;
    for (let i = 2; i < segment.length; i += 2) {
      const y = segment[i];
      if (y <= box.y) continue;
      segment[i] = y < bar.y ? box.y + (y - box.y) * (XH - box.y) / (bar.y - box.y)
        : XH + (y - bar.y) * (idealTop - XH) / (top - bar.y);
    }
  }).round(1).toString();
  const result = { ...glyph, d: mapped };
  fixedTs.set(glyph, result);
  return result;
}

export function fitLowercaseQ(glyph) {
  if (glyph.char !== 'q') return glyph;
  const { y, height } = glyphBounds(glyph);
  const top = y + height;
  if (top <= 0 || Math.abs(top - XH) < 4) return glyph;
  const scale = XH / top;
  const d = svgpath(glyph.d).abs().unshort().unarc().iterate(segment => {
    if (segment[0] === 'V' && segment[1] > 0) segment[1] *= scale;
    if (!'MLCQ'.includes(segment[0])) return;
    for (let i = 2; i < segment.length; i += 2) {
      if (segment[i] > 0) segment[i] *= scale;
    }
  }).round(1).toString();
  return { ...glyph, d };
}

const fixedUs = new WeakMap();

export function fitLowercaseUStems(glyph) {
  if (glyph.char.normalize('NFD')[0] !== 'u') return glyph;
  if (fixedUs.has(glyph)) return fixedUs.get(glyph);
  const { rows } = profile(glyph);
  const stems = rows.filter(row => row.separated && row.y >= XH * .32 && row.y <= XH * .73);
  let result = glyph;
  if (stems.length >= 8) {
    const target = median(stems.map(row => row.stem));
    const current = median(stems.map(row => row.rightStem));
    const outer = median(stems.map(row => row.right + .5 / resolution));
    const leftInner = median(stems.map(row => row.left + row.stem - .5 / resolution));
    const inner = outer - current;
    const counter = inner - leftInner;
    const delta = Math.min(target - current, counter * .7, counter - 10);
    if (delta >= 4 && current >= 8) {
      const d = svgpath(glyph.d).abs().unshort().unarc().iterate(segment => {
        if (segment[0] === 'H') segment[1] = adjustedX(segment[1]);
        else if ('MLCQ'.includes(segment[0])) {
          for (let i = 1; i < segment.length; i += 2) segment[i] = adjustedX(segment[i]);
        }
      }).round(1).toString();
      result = { ...glyph, d };
    }

    function adjustedX(x) {
      if (x <= leftInner || x >= outer - 1 / resolution) return x;
      const weight = x < inner ? (x - leftInner) / counter : (outer - x) / current;
      return x - delta * weight;
    }
  }
  fixedUs.set(glyph, result);
  return result;
}

// Siết cặp chữ theo khoảng trống thật giữa hai hình (5% hàng hẹp nhất), không để hai nét gần hơn `minimum`.
function tightenPair(leftGlyph, rightGlyph, limit, minimum) {
  const left = profile(leftGlyph), right = profile(rightGlyph);
  const bins = new Map(right.rows.map(row => [Math.round(row.y * resolution), row.left]));
  const gaps = left.rows.flatMap(row => {
    const edge = bins.get(Math.round(row.y * resolution));
    return edge === undefined ? [] : [leftGlyph.advance + edge - row.right];
  }).sort((a, b) => a - b);
  if (!gaps.length) return 0;
  const clearance = gaps[Math.floor(gaps.length * .05)];
  return Math.floor(Math.min(limit, clearance - minimum));
}

// Cặp tiếng Việt (quy tắc skill): T V W Y đứng trước nguyên âm thường kể cả khi mang dấu (Tố, Vì, Yên, Wà),
// cặp hoa chéo AV AT AY AW LT LV LY và Ư/Ơ trước T. Chỉ siết, giới hạn 0,07 em, giữ khoảng hở ≥ 14/1000 em
// đo trên cả dấu, nên dấu không chạm tay chữ T, V.
export function vietnameseKerning(glyphs) {
  const byChar = new Map(glyphs.map(glyph => [glyph.char, glyph]));
  const vowels = [...byChar.keys()].filter(char => /^[aeouy]$/.test(char.normalize('NFD')[0]) && char === char.toLowerCase() && char.length === 1);
  const list = [];
  for (const first of 'TVWY') for (const second of vowels) list.push([first, second, 70]);
  for (const pair of ['AV', 'AT', 'AY', 'AW', 'VA', 'TA', 'YA', 'WA', 'LT', 'LV', 'LY', 'LW', 'ƯT', 'ƠT', 'ƯV', 'ƠV', 'PA', 'FA']) list.push([pair[0], pair[1], 60]);
  const pairs = [];
  for (const [first, second, limit] of list) {
    const a = byChar.get(first), b = byChar.get(second);
    if (!a?.d || !b?.d) continue;
    const tighten = tightenPair(a, b, limit, 14);
    if (tighten >= 6) pairs.push([first, second, -tighten]);
  }
  return pairs;
}

export function fontKerning(glyphs) {
  const byChar = new Map(glyphs.map(glyph => [glyph.char, glyph]));
  const pairs = [];
  for (const [first, second, limit, minimum] of [['o', 'w', 42, 9], ['K', 'i', 30, 12], ['K', 'h', 28, 12]]) {
    const leftGlyph = byChar.get(first), rightGlyph = byChar.get(second);
    if (!leftGlyph || !rightGlyph) continue;
    const tighten = tightenPair(leftGlyph, rightGlyph, limit, minimum);
    if (tighten > 0) pairs.push([first, second, -tighten]);
  }
  const fixed = new Set(pairs.map(([a, b]) => a + b));
  for (const pair of vietnameseKerning(glyphs)) if (!fixed.has(pair[0] + pair[1])) pairs.push(pair);
  if (byChar.has('T') && byChar.has('h')) pairs.push(['T', 'h', 24]);
  if (byChar.has('2') && byChar.has('3')) pairs.push(['2', '3', 30]);
  if (byChar.has('P') && byChar.has('H')) pairs.push(['P', 'H', 24]);
  if (byChar.has('P') && byChar.has('h')) pairs.push(['P', 'h', 28]);
  if (byChar.has('k') && byChar.has('h')) pairs.push(['k', 'h', 26]);
  return pairs;
}

export function balanceGlyphSpacing(glyphs, adjustment) {
  const gap = Math.max(22, 46 + adjustment);
  return glyphs.map(glyph => {
    if (glyph.preserveOutline) return {...glyph,advance:Math.max(1,glyph.advance+adjustment)};
    if (!/^[\p{L}\p{N}]$/u.test(glyph.char)) return { ...glyph, advance: Math.max(1, glyph.advance + adjustment) };
    const { box, rows } = profile(glyph);
    const middle = rows.filter(row => row.y >= XH * .25 && row.y <= XH * .72);
    if (middle.length < 5) return { ...glyph, advance: Math.max(1, glyph.advance + adjustment) };
    const left = median(middle.map(row => row.left));
    const right = median(middle.map(row => row.right));
    const digit = /^[0-9]$/.test(glyph.char);
    const halfGap = (gap + (digit ? 26 : 0)) / 2;
    const minimum = digit ? 8 : -24;
    const leftBearing = Math.max(minimum, halfGap - (left - box.x));
    const rightBearing = Math.max(minimum, halfGap - (box.x + box.width - right));
    return { ...glyph, d: svgpath(glyph.d).translate(leftBearing - box.x, 0).round(1).toString(),
      advance: Math.max(1, Math.round(box.width + leftBearing + rightBearing)) };
  });
}

export function measureLeftStem(glyph) {
  const { box, rows } = profile(glyph);
  const middle = rows.filter(row => row.y >= XH * .28 && row.y <= XH * .76);
  if (middle.length < 6) return null;
  const width = median(middle.map(row => row.stem));
  const edge = median(middle.map(row => row.left));
  if (!Number.isFinite(width) || width < 8) return null;
  const stableRows = middle.filter(row => Math.abs(row.left - edge) <= width * .14
    && Math.abs(row.stem - width) <= width * .19).length;
  return { width, edge, box, stable: stableRows >= middle.length * .78 };
}

export function matchLeftStem(glyph, reference) {
  const current = measureLeftStem(glyph), desired = measureLeftStem(reference);
  if (!current || !desired) return null;
  return fitStemWidth(glyph, current, desired.width);
}

function fitStemWidth(glyph, current, targetWidth) {
  const delta = targetWidth - current.width;
  if (Math.abs(delta) < 4) return null;
  const start = current.edge, seam = start + current.width;
  const right = current.box.x + current.box.width;
  // Keep the exterior edges fixed and taper the adjustment into the interior.
  if (right - seam < 12 || Math.abs(delta) > current.width * .45 || seam + delta >= right - 6) return null;
  const outline = svgpath(glyph.d).abs().unshort().unarc().iterate(segment => {
    if (segment[0] === 'H') {
      segment[1] = adjust(segment[1]);
    } else if ('MLCQ'.includes(segment[0])) {
      for (let i = 1; i < segment.length; i += 2) segment[i] = adjust(segment[i]);
    }
  });
  function adjust(x) {
    if (x <= start || x >= right) return x;
    if (x <= seam) return x + delta * (x - start) / current.width;
    return x + delta * (right - x) / (right - seam);
  }
  return { ...glyph, d: outline.round(1).toString() };
}

const comparableStems = [
  'BDEFHIKLMNPRU',
  'bdhiklmnpru',
  '0689'
];

export function balanceFontStrokes(glyphs) {
  const updates = [];
  let measured = 0;
  for (const group of comparableStems) {
    const candidates = glyphs.filter(glyph => glyph.source !== 'Ghép dấu'
      && group.includes(glyph.char.normalize('NFD')[0])).map(glyph => ({ glyph, stem: measureLeftStem(glyph) }))
      .filter(({ stem }) => stem?.stable);
    measured += candidates.length;
    // Base letters determine the weight, so a family with many accents has one vote.
    const bases = candidates.filter(({ glyph }) => group.includes(glyph.char));
    if (bases.length < 3) continue;
    const target = median(bases.map(({ stem }) => stem.width));
    for (const { glyph, stem } of candidates) {
      const deviation = Math.abs(stem.width - target) / target;
      if (deviation < .075 || deviation > .35) continue;
      const adjusted = fitStemWidth(glyph, stem, target);
      const estimate = adjusted && measureLeftStem(adjusted);
      if (estimate && Math.abs(estimate.width - target) + 2 < Math.abs(stem.width - target)) updates.push(adjusted);
    }
  }
  return { updates, measured };
}
