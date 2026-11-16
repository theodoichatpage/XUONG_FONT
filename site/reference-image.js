import svgpath from 'svgpath';
import { MAX_SIDE, makeGlyph } from './engine.js';

const { unifyReferenceA } = require('../src/refine-outline');
const { connectedComponents } = require('../src/blob-core');
const { band } = require('../src/metrics');

export async function referenceCanvas(file, crop) {
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
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
  return (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
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
  const ink = pixels.map(value => Number(light ? value > threshold : value <= threshold));
  if (settings?.polarity === 'light' || settings?.polarity === 'dark') return { frame, ink };
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
  const boxes = connectedComponents(region, frame.w, frame.h, 3, labels);
  const tall = box => box.y1 - box.y0 + 1 >= (y1 - y0) * .47;
  const bodies = boxes.filter(tall).sort((a, b) => a.x0 + a.x1 - b.x0 - b.x1);
  if (bodies.length !== chars.length) return [];
  const groups = bodies.map(body => [body]);
  for (const mark of boxes.filter(box => !tall(box))) {
    let best = -1, distance = Infinity;
    for (const [i, body] of bodies.entries()) {
      const [base, ...accents] = chars[i].normalize('NFD');
      if ((!accents.length && !/[ij]/u.test(base)) || (mark.y0 <= body.y1 && mark.y1 >= body.y0)) continue;
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
  return { ...glyph, preserveOutline: mask.preserveOutline, pixelCrop: { x: x + bounds.x0, y: y + bounds.y0,
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
  const capitals = glyphs.filter(({ char }) => /^[A-ZĐ0-9]$/u.test(char));
  const anchors = capitals.length ? capitals : glyphs.filter(({ char }) => /^[acenosuvwxz]$/u.test(char));
  const scale = median((anchors.length ? anchors : glyphs).map(glyph => {
    const [bottom, top] = band(glyph.char);
    return (top - bottom) / glyph.pixelCrop.h;
  }));
  const gaps = [];
  for (const word of words) {
    for (let i = 1; i < word.length; i++) {
      const left = word[i - 1].pixelCrop, right = word[i].pixelCrop;
      const gap = (right.x - left.x - left.w) * scale;
      if (gap > 0) gaps.push(gap);
    }
  }
  const side = Math.round(Math.max(18, Math.min(55, (median(gaps) || 80) / 2)));
  return unifyReferenceA(words.map(word => {
    const upright = word.filter(({ char }) => /^[A-ZĐ0-9bdfhkltđ]$/u.test(char));
    const stable = upright.length ? upright : word.filter(({ char }) => {
      const [base, ...marks] = char.normalize('NFD');
      return /^\p{L}$/u.test(base) && !/[gjpqy]/u.test(base) && !marks.includes('\u0323');
    });
    const baseline = median(stable.map(({ pixelCrop }) => pixelCrop.y + pixelCrop.h));
    return word.map(glyph => {
      const crop = glyph.pixelCrop;
      const [bottom, top] = band(glyph.char);
      const ratio = scale * crop.h / (top - bottom);
      const alignedTop = Number.isFinite(baseline) ? (baseline - crop.y) * scale : bottom + scale * crop.h;
      return {
        ...glyph,
        d: svgpath(glyph.d).translate(-50, -top).scale(ratio).translate(side, alignedTop).round(1).toString(),
        advance: Math.round(crop.w * scale + 2 * side)
      };
    });
  }).flat());
}
