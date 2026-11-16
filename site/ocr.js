import { MAX_SIDE, makeGlyph } from './engine.js';

let library;
const assets = new URL('./ocr/', document.baseURI);

export async function createOcrWorker() {
  if (location.protocol === 'file:') {
    throw new Error('Hãy mở Xưởng Font trên Vercel để chạy OCR trong trình duyệt.');
  }
  library ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('tesseract.min.js', assets).href;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Không tải được bộ nhận diện tiếng Việt.'));
    document.head.append(script);
  }).catch(error => {
    library = undefined;
    throw error;
  });
  const tesseract = await library;
  return tesseract.createWorker('vie', 1, {
    workerPath: new URL('worker.min.js', assets).href,
    corePath: new URL('tesseract-core-lstm.wasm.js', assets).href,
    langPath: assets.href,
    workerBlobURL: false
  });
}

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

export function wordThumbnail(canvas, box) {
  const { x, y, w, h } = region(canvas, box, 4);
  const scale = Math.min(1, 220 / w, 58 / h);
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(w * scale));
  thumb.height = Math.max(1, Math.round(h * scale));
  thumb.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, thumb.width, thumb.height);
  thumb.setAttribute('aria-hidden', 'true');
  return thumb;
}

export async function detectWords(worker, canvas) {
  // PSM 11 searches for text throughout a video frame, including separate titles.
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  return (data.blocks ?? []).flatMap(block => block.paragraphs)
    .flatMap(paragraph => paragraph.lines).flatMap(line => line.words)
    .filter(word => word.text.trim() && word.symbols.length);
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
  return { frame, ink: pixels.map(value => Number(light ? value > threshold : value <= threshold)) };
}

export async function traceSymbol(mask, bbox, char) {
  const { frame: { x, y, w, h }, ink } = mask;
  const x0 = Math.max(0, bbox.x0 - x), y0 = Math.max(0, bbox.y0 - y);
  const x1 = Math.min(w, bbox.x1 - x), y1 = Math.min(h, bbox.y1 - y);
  const bounds = { x0: w, y0: h, x1: -1, y1: -1 };
  const symbolInk = new Uint8Array(w * h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const p = py * w + px;
      if (!ink[p]) continue;
      symbolInk[p] = 1;
      bounds.x0 = Math.min(bounds.x0, px);
      bounds.x1 = Math.max(bounds.x1, px);
      bounds.y0 = Math.min(bounds.y0, py);
      bounds.y1 = Math.max(bounds.y1, py);
    }
  }
  if (bounds.x1 < bounds.x0 || bounds.y1 < bounds.y0) throw new Error('Không thấy nét chữ.');
  return makeGlyph(symbolInk, w, bounds, char);
}
