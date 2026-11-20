// Browser demo: photo -> TTF, entirely client-side.
// Reuses the repo's own pure modules (blob-core, metrics, winding, assemble);
// only capture is re-implemented on Canvas because sharp is Node-only.
// Build: npm run build:demo
import { potrace, init as initPotrace } from 'esm-potrace-wasm';
import svgpathLib from 'svgpath';
const { connectedComponents, mergeParts, orderBlobs } = require('../src/blob-core');
const { placeGlyph } = require('../src/metrics');
const { fitLetterU } = require('../src/fit-letter-u');
const { fitLetterM } = require('../src/fit-letter-m');
const { refineOutline } = require('../src/refine-outline');
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

function cropToImageData(ink, imgWidth, blob, coverage, scale, preserveOutline) {
  const w = blob.x1 - blob.x0 + 1, h = blob.y1 - blob.y0 + 1;
  const pad = PAD * scale;
  const img = new ImageData(w * scale + 2 * pad, h * scale + 2 * pad);
  img.data.fill(255);
  function pixel(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return 0;
    const p = (blob.y0 + y) * imgWidth + blob.x0 + x;
    return coverage ? coverage[p] : ink[p] * 255;
  }
  const source = new Float32Array((w + 2) * (h + 2));
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      const center = pixel(x, y);
      const neighbors = pixel(x - 1, y) + pixel(x + 1, y) + pixel(x, y - 1) + pixel(x, y + 1);
      const diagonals = pixel(x - 1, y - 1) + pixel(x + 1, y - 1)
        + pixel(x - 1, y + 1) + pixel(x + 1, y + 1);
      source[(y + 1) * (w + 2) + x + 1] = coverage && !preserveOutline
        ? (center * 12 + neighbors * 3 + diagonals) / 28 : center;
    }
  }
  function sample(x, y) {
    if (x < -1 || x > w || y < -1 || y > h) return 0;
    return source[(y + 1) * (w + 2) + x + 1];
  }
  // Interpolate grayscale across pixel cells with continuous first derivatives.
  // Bilinear interpolation introduces a new bend at every pixel boundary.
  function cubic(a, b, c, d, t) {
    return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d
      + t * (3 * (b - c) + d - a)));
  }
  for (let y = -scale; y < (h + 1) * scale; y++) {
    const sy = (y + .5) / scale - .5, top = Math.floor(sy), dy = sy - top;
    for (let x = -scale; x < (w + 1) * scale; x++) {
      const sx = (x + .5) / scale - .5, left = Math.floor(sx), dx = sx - left;
      const row = k => cubic(sample(left - 1, k), sample(left, k), sample(left + 1, k), sample(left + 2, k), dx);
      const value = coverage
        ? cubic(row(top - 1), row(top), row(top + 1), row(top + 2), dy)
        : (sample(left, top) * (1 - dx) + sample(left + 1, top) * dx) * (1 - dy)
          + (sample(left, top + 1) * (1 - dx) + sample(left + 1, top + 1) * dx) * dy;
      if (value >= 128) {
        const p = ((y + pad) * img.width + x + pad) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = 0;
      }
    }
  }
  return img;
}

// ---------- trace + build ----------

async function traceCrop(img, scale, photograph, preserveOutline, smooth = false) {
  traceReady ??= initPotrace();
  await traceReady;
  // smooth: tham số chuẩn của Potrace. Góc thật vẫn giữ là góc, đường cong được gộp cho trơn.
  const svg = await potrace(img, smooth ? {
    turdsize: 0, alphamax: .35, opticurve: 1, opttolerance: 0.05 * scale, extractcolors: false,
  } : {
    turdsize: 0,
    alphamax: preserveOutline ? .35 : photograph ? 0.88 : 0.86,
    opticurve: preserveOutline ? 0 : 1,
    opttolerance: (preserveOutline ? .05 : photograph ? 1.2 : 0.38) * scale,
    extractcolors: false,
  });
  const outline = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(match => match[1]).join(' ');
  if (!outline) return '';
  // potrace SVG uses <g transform="translate(0,H) scale(0.1,-0.1)">; undo it
  return svgpathLib(outline).scale(0.1, -0.1).translate(0, img.height).round(1).toString();
}


export async function makeGlyph(ink, width, box, char, coverage, preserveOutline = false, smooth = false) {
  const size = Math.max(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1);
  // Làm mượt: phóng crop đến 4 lần (nội suy bicubic trên độ phủ) để mép chữ nhỏ không thành bậc.
  const scale = Math.max(1, Math.min(smooth && coverage ? 4 : coverage ? 2 : 3, Math.floor((smooth ? 1200 : 900) / size)));
  const crop = cropToImageData(ink, width, box, coverage, scale, preserveOutline);
  const fitted = !preserveOutline && char === 'm' ? fitLetterM(crop, PAD * scale) : null;
  const traced = fitted ?? await traceCrop(crop, scale, Boolean(coverage), preserveOutline, smooth && preserveOutline);
  const d = !preserveOutline && traced && /^u[\u0300\u0301\u0303\u0309]?$/u.test(char.normalize('NFD'))
    ? fitLetterU(crop, PAD * scale, traced) : traced;
  if (!d) throw new Error('Không tìm thấy nét chữ ' + char);
  const glyph = placeGlyph(d, crop, PAD * scale, char);
  return { char, ...glyph, d: fitted || preserveOutline ? glyph.d : refineOutline(glyph.d, char),
    ...(preserveOutline ? { origin:'direct', preserveOutline:true,
      pixelOutline: svgpathLib(traced).translate(-PAD*scale,-PAD*scale).scale(1/scale).round(4).toString() } : {}), source: 'Ảnh mẫu' };
}

export function exportFont(name, glyphs, spacing, metrics) {
  const spaces = glyphs.map(glyph => glyph.referenceWordSpace).filter(Number.isFinite).sort((a, b) => a - b);
  const wordSpace = spaces[Math.floor(spaces.length / 2)];
  return buildTTF(name, glyphs.map(g => ({ ...g, advance: Math.max(1, g.advance + spacing) })),
    { ...metrics, wordSpace: metrics?.wordSpace ?? wordSpace });
}

export { MAX_SIDE };
