'use strict';

const svgpath = require('svgpath');
const { CAP } = require('./metrics');
const { fixWinding } = require('./winding');

const end = segment => segment.slice(-2);

function contoursOf(path) {
  const contours = [];
  for (const segment of svgpath(path).abs().unshort().segments) {
    if (segment[0] === 'M') contours.push([]);
    contours.at(-1)?.push(segment);
  }
  return contours;
}

function removeStraightJoins(contour) {
  for (let i = 1; i + 1 < contour.length; i++) {
    if (contour[i][0] !== 'L' || contour[i + 1][0] !== 'L') continue;
    const [ax, ay] = end(contour[i - 1]);
    const [bx, by] = end(contour[i]);
    const [cx, cy] = end(contour[i + 1]);
    const length = Math.hypot(cx - ax, cy - ay);
    const forward = (bx - ax) * (cx - bx) + (by - ay) * (cy - by);
    if (length && forward > 0 && Math.abs((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) <= length) {
      contour.splice(i--, 1);
    }
  }
}

function smoothCurveJoins(contour) {
  for (let i = 1; i + 1 < contour.length; i++) {
    const before = contour[i], after = contour[i + 1];
    if (before[0] !== 'C' || after[0] !== 'C') continue;
    const [x, y] = end(before);
    const inX = x - before[3], inY = y - before[4];
    const outX = after[1] - x, outY = after[2] - y;
    const a = Math.hypot(inX, inY), b = Math.hypot(outX, outY);
    if (!a || !b) continue;
    // Reconcile almost-tangent curves while keeping deliberate corners.
    const cosine = (inX * outX + inY * outY) / (a * b);
    if (cosine < .92 || cosine > .9995) continue;
    const dx = inX / a + outX / b, dy = inY / a + outY / b;
    const norm = Math.hypot(dx, dy);
    before[3] = x - dx / norm * a;
    before[4] = y - dy / norm * a;
    after[1] = x + dx / norm * b;
    after[2] = y + dy / norm * b;
  }
}

function bounds(contour) {
  const xs = [], ys = [];
  for (const segment of contour) {
    for (let i = 1; i + 1 < segment.length; i += 2) {
      xs.push(segment[i]);
      ys.push(segment[i + 1]);
    }
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function roundedContour({ x0, x1, y0, y1 }, rx, ry) {
  const left = x0 + rx, right = x1 - rx, bottom = y0 + ry, top = y1 - ry;
  const kx = rx * .55228475, ky = ry * .55228475;
  const contour = [['M', x0, bottom], ['L', x0, top],
    ['C', x0, top + ky, left - kx, y1, left, y1]];
  if (right > left) contour.push(['L', right, y1]);
  contour.push(['C', right + kx, y1, x1, top + ky, x1, top], ['L', x1, bottom],
    ['C', x1, bottom - ky, right + kx, y0, right, y0]);
  if (right > left) contour.push(['L', left, y0]);
  contour.push(['C', left - kx, y0, x0, bottom - ky, x0, bottom], ['Z']);
  return contour;
}

function fitCondensedO(contours) {
  const boxes = contours.map(bounds);
  const outerIndex = boxes.reduce((best, box, i) => box.y1 - box.y0 > boxes[best].y1 - boxes[best].y0 ? i : best, 0);
  const outer = boxes[outerIndex];
  const innerIndex = boxes.findIndex(box => box.x0 > outer.x0 && box.x1 < outer.x1
    && box.y0 > outer.y0 && box.y1 < outer.y1);
  if (innerIndex < 0) return;
  const hole = boxes[innerIndex];
  const w = hole.x1 - hole.x0, h = hole.y1 - hole.y0;
  const bodyWidth = outer.x1 - outer.x0, bodyHeight = outer.y1 - outer.y0;
  const left = hole.x0 - outer.x0, right = outer.x1 - hole.x1;
  if (h < 3.5 * w || bodyHeight < 2 * bodyWidth || h < .56 * bodyHeight || h > .93 * bodyHeight
    || Math.abs(left - right) > .18 * bodyWidth) return;
  // Only fit upright, condensed loops with a single narrow counter.
  const mid = (outer.x0 + outer.x1) / 2;
  contours[outerIndex] = roundedContour(outer, bodyWidth * .42, Math.min(bodyWidth * .46, bodyHeight * .15));
  contours[innerIndex] = roundedContour({ ...hole, x0: mid - w / 2, x1: mid + w / 2 }, w / 2, w / 2);
}

function alignFlatTerminals(contours) {
  for (const contour of contours) {
    for (const segment of contour) {
      for (let i = 2; i < segment.length; i += 2) {
        if (Math.abs(segment[i]) <= 3) segment[i] = 0;
        else if (Math.abs(segment[i] - CAP) <= 3) segment[i] = CAP;
      }
    }
  }
}

function refineOutline(path, char) {
  const contours = contoursOf(path);
  if (!contours.length || contours.some(c => c.some(s => !'MLCQZ'.includes(s[0])))) return path;
  if (/^[VX]$/.test(char)) alignFlatTerminals(contours);
  for (const contour of contours) {
    removeStraightJoins(contour);
    smoothCurveJoins(contour);
  }
  if (/^[oO][\u0300\u0301\u0303\u0309\u0323]?$/u.test(char.normalize('NFD'))) fitCondensedO(contours);
  return fixWinding(serialize(contours));
}

function serialize(contours) {
  return contours.map(contour => contour.map(([command, ...coords]) => command + coords.join(' ')).join('')).join('');
}

function aParts(glyph) {
  const contours = contoursOf(glyph.d);
  if (!contours.length) return null;
  const boxes = contours.map(bounds);
  const tallest = boxes.reduce((best, box, i) => box.y1 - box.y0 > boxes[best].y1 - boxes[best].y0 ? i : best, 0);
  const body = boxes[tallest];
  const inside = box => box.x0 > body.x0 && box.x1 < body.x1 && box.y0 > body.y0 && box.y1 < body.y1;
  const count = boxes.filter(inside).length;
  if (count !== 1) return null;
  const marks = contours.filter((_, i) => i !== tallest && !inside(boxes[i]));
  if (marks.length !== [...glyph.char.normalize('NFD')].length - 1) return null;
  return { glyph, body, marks, base: contours.filter((_, i) => i === tallest || inside(boxes[i])) };
}

function unifyReferenceA(glyphs) {
  const family = glyphs.filter(g => /^a[\u0300-\u036f]*$/u.test(g.char.normalize('NFD')))
    .map(aParts).filter(Boolean);
  if (family.length < 2) return glyphs;
  // Prefer a direct base sample, otherwise the tallest traced body.
  family.sort((a, b) => a.marks.length && b.marks.length
    ? (b.body.y1 - b.body.y0) - (a.body.y1 - a.body.y0)
    : a.marks.length - b.marks.length);
  const { glyph: master, base, body } = family[0];
  const width = body.x1 - body.x0, height = body.y1 - body.y0;
  const updates = new Map();
  for (const target of family.slice(1)) {
    const other = target.body;
    // Separate styles or sizes in the same photo must retain their own design.
    if (Math.abs(other.x1 - other.x0 - width) > .27 * width
      || Math.abs(other.y1 - other.y0 - height) > .15 * height) continue;
    const dx = (body.x0 + body.x1 - other.x0 - other.x1) / 2;
    const dy = body.y0 - other.y0;
    const marks = svgpath(serialize(target.marks)).translate(dx, dy).toString();
    updates.set(target.glyph, { ...target.glyph, advance: master.advance, d: fixWinding(serialize(base) + marks) });
  }
  return glyphs.map(glyph => updates.get(glyph) ?? glyph);
}

module.exports = { refineOutline, unifyReferenceA };
