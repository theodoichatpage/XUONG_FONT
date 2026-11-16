'use strict';

const svgpath = require('svgpath');

function fitLetterU(image, pad, traced) {
  const w = image.width - 2 * pad, h = image.height - 2 * pad;
  if (h < 2.1 * w || w < 12) return traced;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const edges = [];
    let previous = false;
    for (let x = 0; x <= w; x++) {
      const ink = x < w && image.data[((y + pad) * image.width + x + pad) * 4] < 128;
      if (ink !== previous) edges.push(x);
      previous = ink;
    }
    rows.push(edges);
  }

  const mid = rows.slice(Math.floor(h * .38), Math.ceil(h * .69));
  const stems = mid.filter(row => row.length === 4);
  if (stems.length < .9 * mid.length) return traced;
  const [left, innerLeft, innerRight, right] = stems[0].map((_, i) => {
    const xs = stems.map(row => row[i]).sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)];
  });
  const width = right - left, stroke = innerLeft - left;
  if (innerRight - innerLeft > .30 * width || stroke < .22 * width
    || right - innerRight < .22 * width || width < .68 * w) return traced;

  const matching = row => row.length === 4 && Math.abs(row[1] - innerLeft) <= .10 * width
    && Math.abs(row[2] - innerRight) <= .12 * width
    && Math.abs(row[3] - right) <= .12 * width;
  let top = Math.floor(h * .42), join = Math.floor(h * .62);
  if (!matching(rows[top]) || !matching(rows[join])) return traced;
  while (top > 0 && matching(rows[top - 1])) top--;
  while (join < h - 1 && matching(rows[join + 1])) join++;
  const leftCap = Math.min(left, ...rows.slice(top, top + 4).filter(matching).map(row => row[0]));
  const rightCap = Math.min(innerRight, ...rows.slice(top, top + 4).filter(matching).map(row => row[2]));
  let bottom = join + 1;
  while (bottom < h && rows[bottom].length === 2
    && Math.abs(rows[bottom][1] - right) <= .12 * width) bottom++;
  const base = rows[bottom - 2];
  if (bottom - join < .22 * stroke || join - top < 1.7 * width || base.length !== 2
    || left - leftCap < .06 * width || base[0] - left < .15 * width) return traced;

  const contours = [];
  for (const segment of svgpath(traced).abs().unshort().segments) {
    if (segment[0] === 'M') contours.push([]);
    contours.at(-1)?.push(segment);
  }
  const spans = contours.map(contour => {
    const ys = contour.flatMap(segment => segment.filter((_, i) => i > 0 && i % 2 === 0));
    return { top: Math.min(...ys) - pad, bottom: Math.max(...ys) - pad };
  });
  const body = spans.findIndex(span => span.top <= top + .10 * width && span.bottom >= bottom - .10 * width);
  if (body < 0 || spans.some((span, i) => i !== body && span.bottom > top - .04 * width)) return traced;

  const bend = Math.min(join, bottom - 1.10 * stroke);
  const foot = Math.min(innerLeft, Math.max(left + .56 * stroke, base[0]));
  const curve = .56 * stroke;
  const points = [
    ['M', leftCap, top], ['L', innerLeft, top], ['L', innerLeft, join + 1],
    ['L', innerRight, join + 1], ['L', innerRight, top + .25 * stroke],
    ['C', innerRight, top + .12 * stroke, rightCap, top + .06 * stroke, rightCap, top],
    ['L', right, top], ['L', right, bottom], ['L', foot, bottom],
    ['C', foot - .48 * (foot - left), bottom, left, bend + curve, left, bend],
    ['L', left, top + .53 * stroke],
    ['C', left, top + .27 * stroke, leftCap + .45 * (left - leftCap), top, leftCap, top],
    ['Z']
  ];
  contours[body] = points.map(([command, ...coords]) => [command, ...coords.map(n => n + pad)]);
  return contours.flat().map(([command, ...coords]) => command + coords.join(' ')).join('');
}

module.exports = { fitLetterU };
