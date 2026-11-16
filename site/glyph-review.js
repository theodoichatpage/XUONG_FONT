const size = 320;
const inset = 18;
const ns = 'http://www.w3.org/2000/svg';

function canvas() {
  const result = document.createElement('canvas');
  result.width = result.height = size;
  return result;
}

function outlineBounds(path) {
  const svg = document.createElementNS(ns, 'svg');
  svg.style.position = 'fixed';
  svg.style.visibility = 'hidden';
  const shape = document.createElementNS(ns, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  document.body.append(svg);
  try { return shape.getBBox(); }
  finally { svg.remove(); }
}

export function prepareGlyphReview(image, box, glyph) {
  const reference = canvas(), rendered = canvas(), overlay = canvas();
  const rect = outlineBounds(glyph.d);
  if (!rect.width || !rect.height || !box.w || !box.h) throw new Error('Vùng khoanh hoặc nét ký tự trống.');

  const refRatio = box.w / box.h;
  const glyphRatio = rect.width / rect.height;
  const proofHeight = (size - inset * 2) / Math.max(1, refRatio, glyphRatio);
  const baseline = (size + proofHeight) / 2;
  const refWidth = refRatio * proofHeight;
  const referenceCtx = reference.getContext('2d');
  referenceCtx.fillStyle = '#f7f2e8';
  referenceCtx.fillRect(0, 0, size, size);
  referenceCtx.imageSmoothingEnabled = false;
  referenceCtx.drawImage(image, box.x, box.y, box.w, box.h, (size - refWidth) / 2, baseline - proofHeight, refWidth, proofHeight);

  const path = new Path2D(glyph.d);
  const unit = proofHeight / rect.height;
  function draw(ctx, fill) {
    ctx.translate((size - rect.width * unit) / 2 - rect.x * unit, baseline + rect.y * unit);
    ctx.scale(unit, -unit);
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  const glyphCtx = rendered.getContext('2d');
  glyphCtx.fillStyle = '#f7f2e8';
  glyphCtx.fillRect(0, 0, size, size);
  draw(glyphCtx, '#261b18');

  const overlayCtx = overlay.getContext('2d');
  overlayCtx.drawImage(reference, 0, 0);
  draw(overlayCtx, '#ff453acc');
  return { reference: reference.toDataURL(), rendered: rendered.toDataURL(), overlay: overlay.toDataURL() };
}
