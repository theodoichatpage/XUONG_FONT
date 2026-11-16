import { MAX_SIDE, makeGlyph } from './engine.js';

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
  return { frame, ink, detailInk };
}

// A clean blank column is a visible boundary between two letters. Only
// recover a word when the resulting boundaries agree with its corrected text.
export function splitWordByGaps(mask, box, count) {
  const { frame: { x, y, w, h }, ink } = mask;
  const left = Math.max(0, box.x0 - x), right = Math.min(w, box.x1 - x);
  const top = Math.max(0, box.y0 - y), bottom = Math.min(h, box.y1 - y);
  const boxes = [];
  let start = -1;
  for (let column = left; column <= right; column++) {
    let occupied = false;
    if (column < right) {
      for (let row = top; row < bottom; row++) {
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

export async function traceSymbol(mask, bbox, char, wordBox) {
  const { frame: { x, y, w, h }, ink, detailInk = ink } = mask;
  const x0 = Math.max(0, bbox.x0 - x), y0 = Math.max(0, bbox.y0 - y);
  const x1 = Math.min(w, bbox.x1 - x), y1 = Math.min(h, bbox.y1 - y);
  const bounds = { x0: w, y0: h, x1: -1, y1: -1 };
  const symbolInk = new Uint8Array(w * h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const p = py * w + px;
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
      throw new Error('Vùng OCR chỉ chứa dấu hoặc thiếu thân chữ.');
    }
  }
  return makeGlyph(symbolInk, w, bounds, char);
}
