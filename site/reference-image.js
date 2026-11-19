import svgpath from 'svgpath';
import { MAX_SIDE, makeGlyph } from './engine.js';
import { placeReferenceWords } from './reference-placement.js';
import { isReferenceInk, referenceLuminance } from './reference-mask.js';

const { unifyReferenceA } = require('../src/refine-outline');
const { connectedComponents } = require('../src/blob-core');
const { band, LOWERCASE, XH } = require('../src/metrics');

export async function referenceCanvas(file, crop, {native=false}={}) {
  const image = await createImageBitmap(file);
  try {
    const scale = native ? 1 : Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const { x, y, w, h } = crop ?? { x: 0, y: 0, w: width, h: height };
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, -x, -y, width, height);
    return canvas;
  } finally { image.close(); }
}

function region(canvas, box, pad = 0) {
  const x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad);
  const w = Math.max(1, Math.min(canvas.width, box.x1 + pad) - x);
  const h = Math.max(1, Math.min(canvas.height, box.y1 + pad) - y);
  return { x, y, w, h };
}

function luminance(data, p) {
  return referenceLuminance(data,p);
}

function otsu(histogram, count) {
  const total = histogram.reduce((sum, n, i) => sum + n * i, 0);
  let left = 0, sum = 0, maximum = -1, threshold = 127;
  for (let i = 0; i < 255; i++) {
    left += histogram[i];
    sum += histogram[i] * i;
    const right = count - left;
    if (!left || !right) continue;
    const delta = sum / left - (total - sum) / right;
    const variance = left * right * delta * delta;
    if (variance > maximum) {
      maximum = variance;
      threshold = i;
    }
  }
  return threshold;
}

export function wordInk(canvas, box, settings) {
  const frame = region(canvas, box, 5);
  const { x, y, w, h } = frame;
  const { data } = canvas.getContext('2d').getImageData(x, y, w, h);
  const histogram = new Uint32Array(256);
  const border = new Uint32Array(256);
  const pixels = new Uint8Array(w * h);
  for (let p = 0; p < pixels.length; p++) {
    const value = luminance(data, p * 4);
    pixels[p] = value;
    histogram[value]++;
    const px = p % w, py = Math.floor(p / w);
    if (px === 0 || px === w - 1 || py === 0 || py === h - 1) border[value]++;
  }
  const manualThreshold = Number(settings?.threshold);
  const threshold = settings?.polarity === 'light' ? manualThreshold - 1
    : settings?.polarity === 'dark' ? manualThreshold : otsu(histogram, pixels.length);
  const borderCount = border.reduce((sum, n) => sum + n, 0);
  const darkBorder = border.subarray(0, threshold + 1).reduce((sum, n) => sum + n, 0);
  const light = settings?.polarity === 'light' || (settings?.polarity !== 'dark' && darkBorder > borderCount / 2);
  const ink = pixels.map(value => isReferenceInk(value,threshold,light));
  // Direct reconstruction: no expansion into gray neighbors, no morphology,
  // no synthetic cleanup. Uncertain backgrounds remain visible for review.
  if (!settings?.legacyCleanup) {
    return { frame, ink, coverage: ink.map(value=>value*255), preserveOutline:true,
      processing:{threshold,light,method:'threshold-only',morphology:false} };
  }
  if (settings?.polarity === 'light' || settings?.polarity === 'dark') return { frame, ink, preserveOutline:true };
  const whiteBorder = border.subarray(235).reduce((sum, n) => sum + n, 0);
  const blackPixels = histogram.subarray(0, 40).reduce((sum, n) => sum + n, 0);
  const edgePixels = histogram.subarray(40, 216).reduce((sum, n) => sum + n, 0);
  if (!light && whiteBorder >= borderCount * .95 && blackPixels > 0 && edgePixels <= blackPixels * .20) {
    // Clean artwork is already the intended outline. Use its coverage directly.
    const coverage = pixels.map(value => 255 - value);
    return { frame, ink: coverage.map(value => Number(value >= 128)), coverage, preserveOutline: true };
  }
  let cumulative = 0;
  const background = border.findIndex(n => (cumulative += n) >= borderCount / 2);
  const detailThreshold = Math.round(background + (threshold - background) * .57);
  let detailInk = ink;
  if (Math.abs(threshold - background) >= 14) {
    for (let pass = 0; pass < 2; pass++) {
      const previous = detailInk;
      detailInk = previous.map((on, p) => {
        if (on || !(light ? pixels[p] > detailThreshold : pixels[p] <= detailThreshold)) return on;
        const x = p % w;
        return Number((x > 0 && previous[p - 1]) || (x < w - 1 && previous[p + 1])
          || previous[p - w] || previous[p + w] || false);
      });
    }
  }
  const contourThreshold = Math.abs(threshold - background) >= 14 ? detailThreshold : threshold;
  const coverage = pixels.map((value, p) => {
    const signed = (light ? value - contourThreshold : contourThreshold - value) * 6;
    return detailInk[p] ? Math.max(129, Math.min(255, 128 + signed))
      : Math.max(0, Math.min(127, 128 + signed));
  });
  return { frame, ink, detailInk, coverage };
}

// A clean blank column is a visible boundary between two letters. Only
// recover a word when the resulting boundaries agree with its corrected text.
export function splitWordByGaps(mask, box, count, bodyOnly = false) {
  const { frame: { x, y, w, h }, ink } = mask;
  const left = Math.max(0, box.x0 - x), right = Math.min(w, box.x1 - x);
  const top = Math.max(0, box.y0 - y), bottom = Math.min(h, box.y1 - y);
  const bodyTop = bodyOnly ? top + Math.floor((bottom - top) * .42) : top;
  const bodyBottom = bodyOnly ? bottom - Math.floor((bottom - top) * .12) : bottom;
  const boxes = [];
  let start = -1;
  for (let column = left; column <= right; column++) {
    let occupied = false;
    if (column < right) {
      for (let row = bodyTop; row < bodyBottom; row++) {
        if (ink[row * w + column]) {
          occupied = true;
          break;
        }
      }
    }
    if (occupied && start < 0) start = column;
    if (!occupied && start >= 0) {
      boxes.push({ x0: x + start, x1: x + column, y0: y + top, y1: y + bottom });
      start = -1;
    }
  }
  if (boxes.length !== count) return [];
  const cuts = boxes.slice(1).map((next, index) => Math.round((boxes[index].x1 + next.x0) / 2));
  return boxes.map((box, index) => ({
    ...box, x0: cuts[index - 1] ?? x + left, x1: cuts[index] ?? x + right
  }));
}

// A swash can overlap the next letter in x even when neither touches the other.
export function splitCleanWord(mask, box, chars) {
  if (!mask.preserveOutline || chars.some(char => !/[\p{L}\p{N}]/u.test(char))) return [];
  const { frame, ink } = mask;
  const x0 = Math.max(0, box.x0 - frame.x), y0 = Math.max(0, box.y0 - frame.y);
  const x1 = Math.min(frame.w, box.x1 - frame.x), y1 = Math.min(frame.h, box.y1 - frame.y);
  const region = new Uint8Array(ink.length);
  for (let y = y0; y < y1; y++) {
    const start = y * frame.w + x0, end = y * frame.w + x1;
    region.set(ink.subarray(start, end), start);
  }
  const labels = new Int32Array(ink.length);
  let boxes = connectedComponents(region, frame.w, frame.h, 3, labels);
  // Crop padding and tall accents must not demote real lowercase bodies.
  const bodyHeight = boxes.reduce((maximum,box)=>Math.max(maximum,box.y1-box.y0+1),0);
  const tall = box => box.y1 - box.y0 + 1 >= bodyHeight * .47;
  if (mask.processing?.method !== 'threshold-only' && boxes.filter(tall).length === chars.length - 1) {
    // Two letters can touch at a tip or a serif even in very clean artwork.
    const candidate = boxes.filter(tall).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    if (candidate) {
      const width = candidate.x1 - candidate.x0 + 1;
      const middle = (candidate.x0 + candidate.x1) / 2;
      let cut = -1, score = Infinity;
      for (let x = Math.ceil(middle - .18 * width); x <= middle + .18 * width; x++) {
        let pixels = 0;
        for (let y = candidate.y0; y <= candidate.y1; y++) {
          pixels += Number(labels[y * frame.w + x] === candidate.label);
        }
        const rank = pixels + Math.abs(x - middle) / width;
        if (rank < score) { cut = x; score = rank; }
      }
      if (cut >= 0 && score <= .10 * (candidate.y1 - candidate.y0 + 1)) {
        for (let y = candidate.y0; y <= candidate.y1; y++) {
          const p = y * frame.w + cut;
          if (labels[p] === candidate.label) region[p] = 0;
        }
        labels.fill(0);
        boxes = connectedComponents(region, frame.w, frame.h, 3, labels);
        for (let y = candidate.y0; y <= candidate.y1; y++) {
          const p = y * frame.w + cut;
          if (!labels[p] && !region[p] && ink[p]) labels[p] = -1;
        }
      }
    }
  }
  const bodies = boxes.filter(tall).sort((a, b) => a.x0 + a.x1 - b.x0 - b.x1);
  if (bodies.length !== chars.length) return [];
  const groups = bodies.map(body => [body]);
  for (const mark of boxes.filter(box => !tall(box))) {
    let best = -1, distance = Infinity;
    for (const [i, body] of bodies.entries()) {
      const [base, ...accents] = chars[i].normalize('NFD');
      const overlap = Math.min(mark.y1, body.y1) - Math.max(mark.y0, body.y0) + 1;
      if ((!accents.length && !/[ij]/u.test(base)) || overlap > .40 * (mark.y1 - mark.y0 + 1)) continue;
      const dx = Math.abs((body.x0 + body.x1 - mark.x0 - mark.x1) / 2);
      if (dx <= Math.max(body.x1 - body.x0, (y1 - y0) * .13) && dx < distance) {
        best = i;
        distance = dx;
      }
    }
    if (best < 0) return [];
    groups[best].push(mark);
  }
  mask.labels = labels;
  return groups.map(group => ({
    x0: frame.x + Math.min(...group.map(box => box.x0)),
    x1: frame.x + Math.max(...group.map(box => box.x1)) + 1,
    y0: frame.y + Math.min(...group.map(box => box.y0)),
    y1: frame.y + Math.max(...group.map(box => box.y1)) + 1,
    components: new Set(group.map(box => box.label))
  }));
}

export function pixelBox(box, image) {
  const [top, left, bottom, right] = box;
  return { x0: Math.floor(left * image.width / 1000), y0: Math.floor(top * image.height / 1000),
    x1: Math.ceil(right * image.width / 1000), y1: Math.ceil(bottom * image.height / 1000) };
}

export function expandWordBox(box, neighbors, image) {
  const height = box.y1 - box.y0;
  const dx = Math.max(2, Math.ceil(height * .10)), dy = Math.max(3, Math.ceil(height * .16));
  const area = {
    x0: Math.max(0, box.x0 - dx), y0: Math.max(0, box.y0 - dy),
    x1: Math.min(image.width, box.x1 + dx), y1: Math.min(image.height, box.y1 + dy)
  };
  for (const other of neighbors) {
    if (other === box) continue;
    const shareX = Math.min(box.x1, other.x1) > Math.max(box.x0, other.x0);
    const shareY = Math.min(box.y1, other.y1) > Math.max(box.y0, other.y0);
    if (shareX && other.y1 <= box.y0) area.y0 = Math.max(area.y0, Math.ceil((other.y1 + box.y0) / 2));
    if (shareX && other.y0 >= box.y1) area.y1 = Math.min(area.y1, Math.floor((other.y0 + box.y1) / 2));
    if (shareY && other.x1 <= box.x0) area.x0 = Math.max(area.x0, Math.ceil((other.x1 + box.x0) / 2));
    if (shareY && other.x0 >= box.x1) area.x1 = Math.min(area.x1, Math.floor((other.x0 + box.x1) / 2));
  }
  return area;
}

export function inkCrossesBox(mask, box) {
  const { frame, ink } = mask;
  function at(x, y) {
    const px = x - frame.x, py = y - frame.y;
    return px >= 0 && px < frame.w && py >= 0 && py < frame.h && ink[py * frame.w + px];
  }
  for (let x = box.x0; x < box.x1; x++) {
    if ((at(x, box.y0) && at(x, box.y0 - 1)) || (at(x, box.y1 - 1) && at(x, box.y1))) return true;
  }
  for (let y = box.y0; y < box.y1; y++) {
    if ((at(box.x0, y) && at(box.x0 - 1, y)) || (at(box.x1 - 1, y) && at(box.x1, y))) return true;
  }
  return false;
}

export function inkBox(mask, bbox) {
  const { frame: { x, y, w, h }, ink, detailInk = ink } = mask;
  const x0 = Math.max(0, bbox.x0 - x), y0 = Math.max(0, bbox.y0 - y);
  const x1 = Math.min(w, bbox.x1 - x), y1 = Math.min(h, bbox.y1 - y);
  const bounds = { x0: w, y0: h, x1: -1, y1: -1 };
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      if (!detailInk[py * w + px]) continue;
      bounds.x0 = Math.min(bounds.x0, px);
      bounds.x1 = Math.max(bounds.x1, px);
      bounds.y0 = Math.min(bounds.y0, py);
      bounds.y1 = Math.max(bounds.y1, py);
    }
  }
  return bounds.x1 < bounds.x0 ? undefined : { x: x + bounds.x0, y: y + bounds.y0,
    w: bounds.x1 - bounds.x0 + 1, h: bounds.y1 - bounds.y0 + 1 };
}

export function completeTildeO(glyph) {
  // A separate tilde, the rounded body, and its counter each need a contour.
  return !/^[õÕ]$/u.test(glyph.char) || (glyph.d.match(/M/gi)?.length ?? 0) >= 3;
}

function lowercaseBodyTop(ink, width, bounds, char) {
  const [base] = char.normalize('NFD');
  const withShoulder = LOWERCASE.ascenders.includes(base) && !/[flđ]/u.test(base);
  const tracked = LOWERCASE.body + LOWERCASE.descenders + LOWERCASE.dotted;
  const withCrossbar = LOWERCASE.crossbar.includes(base);
  if (!withShoulder && !withCrossbar && !tracked.includes(base)) return undefined;
  const rows = [];
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    let left = width, right = -1;
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!ink[y * width + x]) continue;
      left = Math.min(left, x);
      right = x;
    }
    rows.push(right < left ? 0 : right - left + 1);
  }
  let bestStart = 0, bestLength = 0, start = 0;
  for (let i = 0; i <= rows.length; i++) {
    if (rows[i]) continue;
    if (i - start > bestLength) { bestStart = start; bestLength = i - start; }
    start = i + 1;
  }
  if (bestLength < rows.length * .5) return undefined;
  if (withCrossbar) {
    const stem = median(rows.slice(Math.floor(rows.length * .36), Math.ceil(rows.length * .66)));
    const bar = rows.findIndex((span, i) => i >= rows.length * .08 && i < rows.length * .36
      && span >= stem * 1.32 && rows[i + 1] >= stem * 1.19);
    return bar < 0 ? undefined : bounds.y0 + bar;
  }
  if (withShoulder) {
    // The upper stem is narrow until the shoulder starts on the right.
    const stem = median(rows.slice(bestStart + Math.floor(bestLength * .08), bestStart + Math.ceil(bestLength * .15)));
    const shoulder = rows.findIndex((span, i) => i >= bestStart + bestLength * .09
      && i < bestStart + bestLength * .46 && span >= stem * 1.45
      && rows[i + 1] >= stem * 1.45 && rows[i + 2] >= stem * 1.45);
    return shoulder < 0 ? undefined : bounds.y0 + shoulder;
  }
  return bounds.y0 + bestStart;
}

// Insets at the middle of the glyph ignore overhanging accents and tails.
function opticalInsets(ink, width, bounds) {
  const height = bounds.y1 - bounds.y0 + 1;
  const left = [], right = [];
  for (let y = bounds.y0 + Math.floor(height * .32); y <= bounds.y0 + Math.floor(height * .67); y++) {
    let x0 = bounds.x0, x1 = bounds.x1;
    while (x0 <= x1 && !ink[y * width + x0]) x0++;
    if (x0 > x1) continue;
    while (!ink[y * width + x1]) x1--;
    left.push(x0 - bounds.x0);
    right.push(bounds.x1 - x1);
  }
  return [median(left) || 0, median(right) || 0];
}

export async function traceSymbol(mask, bbox, char, wordBox) {
  const { frame: { x, y, w, h }, ink, detailInk = ink } = mask;
  const x0 = Math.max(0, bbox.x0 - x), y0 = Math.max(0, bbox.y0 - y);
  const x1 = Math.min(w, bbox.x1 - x), y1 = Math.min(h, bbox.y1 - y);
  const bounds = { x0: w, y0: h, x1: -1, y1: -1 };
  const symbolInk = new Uint8Array(w * h);
  const coverage = bbox.components ? mask.coverage.slice() : mask.coverage;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const p = py * w + px;
      if (bbox.components && mask.labels[p] && !bbox.components.has(mask.labels[p])) {
        coverage[p] = 0;
        continue;
      }
      if (!detailInk[p]) continue;
      symbolInk[p] = 1;
      bounds.x0 = Math.min(bounds.x0, px);
      bounds.x1 = Math.max(bounds.x1, px);
      bounds.y0 = Math.min(bounds.y0, py);
      bounds.y1 = Math.max(bounds.y1, py);
    }
  }
  if (bounds.x1 < bounds.x0 || bounds.y1 < bounds.y0) throw new Error('Không thấy nét chữ.');
  if (wordBox && /\p{L}/u.test(char) && [...char.normalize('NFD')].length > 1) {
    const wordHeight = wordBox.y1 - wordBox.y0;
    const inkHeight = bounds.y1 - bounds.y0 + 1;
    const reachesBody = y + bounds.y1 >= wordBox.y0 + wordHeight * 0.58
      && y + bounds.y0 < wordBox.y0 + wordHeight * 0.62;
    if (inkHeight < wordHeight * 0.42 || !reachesBody) {
      throw new Error('Vùng ảnh chỉ chứa dấu hoặc thiếu thân chữ.');
    }
  }
  const glyph = await makeGlyph(symbolInk, w, bounds, char, coverage, mask.preserveOutline);
  if (!completeTildeO(glyph)) throw new Error('Chữ thiếu thân hoặc dấu ngã.');
  const bodyTop = mask.preserveOutline ? lowercaseBodyTop(symbolInk, w, bounds, char) : undefined;
  return { ...glyph, preserveOutline: mask.preserveOutline, processing:mask.processing,
    referenceBodyTop: Number.isFinite(bodyTop) ? y + bodyTop : undefined,
    referenceInsets: mask.preserveOutline ? opticalInsets(symbolInk, w, bounds) : undefined, pixelCrop: { x: x + bounds.x0, y: y + bounds.y0,
    w: bounds.x1 - bounds.x0 + 1, h: bounds.y1 - bounds.y0 + 1 } };
}

function median(values) {
  const sorted = values.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Every letter from the same image uses the same conversion from pixels to font units.
export function alignReferenceGlyphs(words) {
  const glyphs = words.flat();
  if (glyphs.length && glyphs.every(glyph=>glyph.pixelOutline)) return placeReferenceWords(words);
  const clean = glyphs.length > 0 && glyphs.every(glyph => glyph.preserveOutline);
  const baselineAnchors = clean ? glyphs.filter(({ char }) => {
    const [base, ...marks] = char.normalize('NFD');
    return /^[A-ZĐ0-9aceinorsuvwxz]$/u.test(base)
      && !/[JMNQ]/u.test(base) && !marks.includes('\u0323');
  }) : [];
  const bottoms = baselineAnchors.map(({ pixelCrop }) => pixelCrop.y + pixelCrop.h);
  const capHeight = median(baselineAnchors.map(({ pixelCrop }) => pixelCrop.h));
  const commonBaseline = Math.max(...bottoms) - Math.min(...bottoms) <= .16 * capHeight
    ? median(bottoms) : NaN;
  const capitals = glyphs.filter(({ char }) => /^[A-ZĐ0-9]$/u.test(char) && (!clean || !/[JMNQ]/u.test(char)));
  const anchors = capitals.length ? capitals : glyphs.filter(({ char }) => /^[acenosuvwxz]$/u.test(char));
  const scale = median((anchors.length ? anchors : glyphs).map(glyph => {
    const [bottom, top] = band(glyph.char);
    return clean && Number.isFinite(commonBaseline) && /^[A-ZĐ0-9]$/u.test(glyph.char)
      ? top / (commonBaseline - glyph.pixelCrop.y) : (top - bottom) / glyph.pixelCrop.h;
  }));
  const gaps = [], wordGaps = [];
  const bearings = new Map();
  const measuredGap = (left, right) => (right.x - left.x - left.w) * scale;
  const opticalGaps = [];
  function addBearing(char, edge, gap) {
    if (!bearings.has(char)) bearings.set(char, { left: [], right: [] });
    bearings.get(char)[edge].push(gap);
  }
  for (const [index, word] of words.entries()) {
    for (let i = 1; i < word.length; i++) {
      const left = word[i - 1], right = word[i];
      const gap = measuredGap(left.pixelCrop, right.pixelCrop);
      if (gap > 0) gaps.push(gap);
      if (clean && left.referenceInsets && right.referenceInsets) {
        const optical = gap + (left.referenceInsets[1] + right.referenceInsets[0]) * scale;
        if (optical >= 0 && optical <= 145) {
          opticalGaps.push(optical);
          addBearing(left.char, 'right', optical);
          addBearing(right.char, 'left', optical);
        }
      }
    }
    const last = word.at(-1)?.pixelCrop, next = words[index + 1]?.[0]?.pixelCrop;
    if (clean && last && next && Number.isFinite(commonBaseline)) {
      const gap = measuredGap(last, next);
      if (gap >= 35 && gap <= 195) wordGaps.push(gap);
    }
  }
  const side = Math.round(Math.max(clean ? 5 : 18, Math.min(55, (median(gaps) || 70) / 2)));
  const opticalGap = Math.max(30, Math.min(56, median(opticalGaps) || 42));
  const referenceWordSpace = clean ? Math.round(Math.max(85, Math.min(145, median(wordGaps) - 2 * side || 115))) : undefined;
  return unifyReferenceA(words.map(word => {
    const upright = word.filter(({ char }) => /^[A-ZĐ0-9bdfhkltđ]$/u.test(char));
    const stable = upright.length ? upright : word.filter(({ char }) => {
      const [base, ...marks] = char.normalize('NFD');
      return /^\p{L}$/u.test(base) && !/[gjpqy]/u.test(base) && !marks.includes('\u0323');
    });
    const baseline = Number.isFinite(commonBaseline) ? commonBaseline : median(stable.map(({ pixelCrop }) => pixelCrop.y + pixelCrop.h));
    return word.map(glyph => {
      const crop = glyph.pixelCrop;
      const [bottom, top] = band(glyph.char);
      const ratio = scale * crop.h / (top - bottom);
      const alignedTop = Number.isFinite(baseline) ? (baseline - crop.y) * scale : bottom + scale * crop.h;
      const measured = bearings.get(glyph.char);
      function bearing(edge, inset) {
        if (!clean || !glyph.referenceInsets) return side;
        const local = measured?.[edge]?.length ? median(measured[edge]) : opticalGap;
        const gap = opticalGap + Math.max(-12, Math.min(12, (local - opticalGap) * .30));
        return Math.max(-24, gap / 2 - inset * scale);
      }
      const left = bearing('left', glyph.referenceInsets?.[0]);
      const right = bearing('right', glyph.referenceInsets?.[1]);
      const outline = svgpath(glyph.d).translate(-50, -top).scale(ratio).translate(left, alignedTop).abs().unshort();
      const bodyHeight = alignedTop - (glyph.referenceBodyTop - crop.y) * scale;
      const targetHeight = XH;
      const crossbar = LOWERCASE.crossbar.includes(glyph.char);
      if (clean && bodyHeight >= .75 * targetHeight && bodyHeight <= 1.20 * targetHeight) {
        outline.iterate(segment => {
          if (!'MLCQ'.includes(segment[0])) return;
          for (let i = 2; i < segment.length; i += 2) {
            const point = segment[i];
            if (point <= 0) continue;
            if (point < bodyHeight) segment[i] = point * targetHeight / bodyHeight;
            else if (crossbar && alignedTop > bodyHeight) {
              segment[i] = targetHeight + (point - bodyHeight) * (top - targetHeight) / (alignedTop - bodyHeight);
            } else segment[i] = point + targetHeight - bodyHeight;
          }
        });
      }
      return {
        ...glyph,
        referenceWordSpace,
        d: outline.round(1).toString(),
        advance: Math.max(1, Math.round(crop.w * scale + left + right))
      };
    });
  }).flat());
}

// Use whitespace visible in the pixels to locate words inside a transcribed
// line. No equal-width slicing, pixel deletion, stroke expansion or OCR outlines.
export function locateLineWords(canvas, lines) {
  const words=[];
  for(const line of lines||[]){
    const tokens=line.text.trim().split(/\s+/u),box=pixelBox(line.box,canvas);
    const mask=wordInk(canvas,box),{frame,ink}=mask,gaps=[];
    let start=-1;
    for(let x=box.x0;x<=box.x1;x++){
      let occupied=false;
      if(x<box.x1)for(let y=box.y0;y<box.y1;y++)if(ink[(y-frame.y)*frame.w+x-frame.x]){occupied=true;break;}
      if(!occupied&&start<0)start=x;
      if(occupied&&start>=0){if(start>box.x0)gaps.push({x:Math.round((start+x)/2),width:x-start});start=-1;}
    }
    gaps.sort((a,b)=>b.width-a.width);
    const chosen=gaps.slice(0,tokens.length-1);
    if(chosen.length!==tokens.length-1||chosen.some(g=>g.width<2))continue;
    // An ambiguous gap must not silently shift every following character.
    if(chosen.length&&gaps[tokens.length-1]&&chosen.at(-1).width<gaps[tokens.length-1].width*1.4)continue;
    const cuts=chosen.sort((a,b)=>a.x-b.x).map(g=>g.x);
    tokens.forEach((text,i)=>words.push({text,box:[box.y0/canvas.height*1000,(cuts[i-1]??box.x0)/canvas.width*1000,box.y1/canvas.height*1000,(cuts[i]??box.x1)/canvas.width*1000]}));
  }
  return words;
}

export function isCleanReference(canvas){
  const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
  let clean=0,total=0;
  const stride=Math.max(1,Math.floor(canvas.width*canvas.height/200000));
  for(let p=0;p<data.length/4;p+=stride){const i=p*4,min=Math.min(data[i],data[i+1],data[i+2]),max=Math.max(data[i],data[i+1],data[i+2]);if(min>=245||max<=40)clean++;total++;}
  return clean/total>=.94;
}

export function refineDetectedWords(canvas, words, lines){
  if(!lines?.length)return words;
  const result=[],replaced=[];
  for(const line of lines){const located=locateLineWords(canvas,[line]);if(located.length){result.push(...located);replaced.push(line);}}
  result.push(...words.filter(word=>!replaced.some(line=>{const y=(word.box[0]+word.box[2])/2;return y>=line.box[0]&&y<=line.box[2];})));
  return result;
}
