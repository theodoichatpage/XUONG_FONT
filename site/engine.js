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

function cropToImageData(ink, imgWidth, blob) {
  const w = blob.x1 - blob.x0 + 1, h = blob.y1 - blob.y0 + 1;
  const cw = w + 2 * PAD, ch = h + 2 * PAD;
  const img = new ImageData(cw, ch);
  img.data.fill(255);
  for (let y = 0; y < h; y++) {
    const src = (blob.y0 + y) * imgWidth + blob.x0;
    for (let x = 0; x < w; x++) {
      if (ink[src + x]) {
        const p = ((y + PAD) * cw + (x + PAD)) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = 0;
      }
    }
  }
  return img;
}

// ---------- trace + build ----------

async function traceCrop(img) {
  traceReady ??= initPotrace();
  await traceReady;
  const svg = await potrace(img, {
    turdsize: 0,
    alphamax: 0.65,
    opticurve: 1,
    opttolerance: 0.08,
    extractcolors: false,
  });
  const m = /d="([^"]+)"/.exec(svg);
  if (!m) return '';
  // potrace SVG uses <g transform="translate(0,H) scale(0.1,-0.1)">; undo it
  return svgpathLib(m[1]).scale(0.1, -0.1).translate(0, img.height).round(1).toString();
}


export async function makeGlyph(ink, width, box, char) {
  const crop = cropToImageData(ink, width, box);
  const d = await traceCrop(crop);
  if (!d) throw new Error('Không tìm thấy nét chữ ' + char);
  return { char, ...placeGlyph(d, crop, PAD, char), source: 'Ảnh mẫu' };
}

export function exportFont(name, glyphs, spacing) {
  return buildTTF(name, glyphs.map(g => ({ ...g, advance: Math.max(1, g.advance + spacing) })));
}

export { MAX_SIDE };
