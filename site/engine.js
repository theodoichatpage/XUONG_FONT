// Browser demo: photo -> TTF, entirely client-side.
// Reuses the repo's own pure modules (blob-core, metrics, winding, assemble);
// only capture is re-implemented on Canvas because sharp is Node-only.
// Build: npm run build:demo
import { potrace, init as initPotrace } from 'esm-potrace-wasm';
import svgpathLib from 'svgpath';
const { connectedComponents, mergeParts, orderBlobs } = require('../src/blob-core');
const { placeGlyph } = require('../src/metrics');
const { buildTTF } = require('../src/assemble');

// assemble.js wraps its result in Buffer.from(); give the browser a minimal stand-in
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = { from: (u8) => new Uint8Array(u8) };
}

const MAX_SIDE = 2800;
const PAD = 8;

let traceReady;

// ---------- capture (Canvas port of src/capture.js) ----------

function toGray(imgData) {
  const { data, width, height } = imgData;
  const g = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return g;
}

function normalise(g) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  const out = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(((g[i] - lo) * 255) / range)));
  }
  return out;
}

function grayToCanvas(g, width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(width, height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    img.data[p] = img.data[p + 1] = img.data[p + 2] = g[i];
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// local background estimate: heavy downscale then upscale (canvas bilinear)
function localBackground(grayCanvas, width, height) {
  const sw = Math.max(1, Math.round(width / 32));
  const sh = Math.max(1, Math.round(height / 32));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  small.getContext('2d').drawImage(grayCanvas, 0, 0, sw, sh);
  const big = document.createElement('canvas');
  big.width = width; big.height = height;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, width, height);
  return toGray(bctx.getImageData(0, 0, width, height));
}

function morph(ink, width, height, grow) {
  const out = new Uint8Array(ink);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const l = x > 0 && ink[p - 1], r = x < width - 1 && ink[p + 1];
      const u = y > 0 && ink[p - width], d = y < height - 1 && ink[p + width];
      if (grow && !ink[p] && (l || r || u || d)) out[p] = 1;
      if (!grow && ink[p] && !(l && r && u && d)) out[p] = 0;
    }
  }
  return out;
}

function binarize(imgData, { delta = 40, cap = 165 } = {}) {
  const { width, height } = imgData;
  const gray = normalise(toGray(imgData));
  const bg = localBackground(grayToCanvas(gray, width, height), width, height);
  let ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) {
    if (gray[i] < cap && gray[i] < bg[i] - delta) ink[i] = 1;
  }
  ink = morph(morph(ink, width, height, true), width, height, false);
  return ink;
}

// ---------- segmentation (shared blob-core) ----------

export function segmentImage(imgData, sensitivity, polarity) {
  const { width, height } = imgData;
  const ink = polarity === 'adaptive' ? binarize(imgData, { delta: sensitivity }) : toGray(imgData).map((value) => Number(polarity === 'light' ? value >= sensitivity : value <= sensitivity));
  const minArea = Math.max(30, Math.round(width * height * 3e-6));
  let boxes = connectedComponents(ink, width, height, minArea);
  boxes = boxes.filter((b) => b.x1 - b.x0 + 1 >= 4 && b.y1 - b.y0 + 1 >= 4);
  if (boxes.length > 300) throw new Error('Ảnh có quá nhiều chi tiết. Hãy khoanh vùng nhỏ hơn hoặc chỉnh ngưỡng.');
  boxes = mergeParts(boxes);
  return { ink, blobs: orderBlobs(boxes), width };
}

function cropToImageData(ink, imgWidth, blob, coverage, scale) {
  const w = blob.x1 - blob.x0 + 1, h = blob.y1 - blob.y0 + 1;
  const pad = PAD * scale;
  const img = new ImageData(w * scale + 2 * pad, h * scale + 2 * pad);
  img.data.fill(255);
  function pixel(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return 0;
    const p = (blob.y0 + y) * imgWidth + blob.x0 + x;
    return coverage ? coverage[p] : ink[p] * 255;
  }
  function sample(x, y) {
    const center = pixel(x, y);
    if (!coverage || x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return center;
    // Reduce one-pixel edge steps without shifting the outside bounds.
    return (center * 8 + pixel(x - 1, y) + pixel(x + 1, y)
      + pixel(x, y - 1) + pixel(x, y + 1)) / 12;
  }
  for (let y = 0; y < h * scale; y++) {
    const sy = (y + .5) / scale - .5, top = Math.floor(sy), dy = sy - top;
    for (let x = 0; x < w * scale; x++) {
      const sx = (x + .5) / scale - .5, left = Math.floor(sx), dx = sx - left;
      const a = sample(left, top) * (1 - dx) + sample(left + 1, top) * dx;
      const b = sample(left, top + 1) * (1 - dx) + sample(left + 1, top + 1) * dx;
      if (a * (1 - dy) + b * dy >= 128) {
        const p = ((y + pad) * img.width + x + pad) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = 0;
      }
    }
  }
  return img;
}

// ---------- trace + build ----------

async function traceCrop(img, scale) {
  traceReady ??= initPotrace();
  await traceReady;
  const svg = await potrace(img, {
    turdsize: 0,
    alphamax: 0.86,
    opticurve: 1,
    opttolerance: 0.38 * scale,
    extractcolors: false,
  });
  const outline = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(match => match[1]).join(' ');
  if (!outline) return '';
  // potrace SVG uses <g transform="translate(0,H) scale(0.1,-0.1)">; undo it
  return svgpathLib(outline).scale(0.1, -0.1).translate(0, img.height).round(1).toString();
}


export async function makeGlyph(ink, width, box, char, coverage) {
  const size = Math.max(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1);
  const scale = Math.max(1, Math.min(3, Math.floor(900 / size)));
  const crop = cropToImageData(ink, width, box, coverage, scale);
  const d = await traceCrop(crop, scale);
  if (!d) throw new Error('Không tìm thấy nét chữ ' + char);
  return { char, ...placeGlyph(d, crop, PAD * scale, char), source: 'Ảnh mẫu' };
}

export function exportFont(name, glyphs, spacing) {
  return buildTTF(name, glyphs.map(g => ({ ...g, advance: Math.max(1, g.advance + spacing) })));
}

export { MAX_SIDE };
