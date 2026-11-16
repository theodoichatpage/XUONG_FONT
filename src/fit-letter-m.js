'use strict';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Fit the condensed display m with a shared cap, a pointed middle foot,
// and a descending last stroke. Other m styles keep the traced outline.
function fitLetterM(image, pad) {
  const width = image.width - 2 * pad, height = image.height - 2 * pad;
  const ink = (x, y) => image.data[((y + pad) * image.width + x + pad) * 4] < 128;
  if (height < 1.4 * width || width < 12) return null;
  const scan = y => {
    const edges = [];
    for (let x = 0; x <= width; x++) {
      if ((x < width && ink(x, y)) !== (x > 0 && ink(x - 1, y))) edges.push(x);
    }
    return edges;
  };
  const middle = [];
  for (let y = Math.floor(height * .28); y < height * .63; y++) {
    const edges = scan(y);
    if (edges.length === 6) middle.push(edges);
  }
  if (middle.length < .29 * height) return null;
  const [a, b, c, d, e, f] = middle[0].map((_, i) => median(middle.map(row => row[i])));
  const widths = [b - a, d - c, f - e];
  if (Math.min(...widths) < .09 * width || Math.max(...widths) > .32 * width
    || c - b < .055 * width || e - d < .055 * width) return null;
  let split = 0;
  for (let y = Math.floor(height * .06); y < .28 * height; y++) {
    if (scan(y).length === 6) { split = y; break; }
  }
  if (!split || !ink(Math.floor((b + c) / 2), Math.floor(split / 2))
    || !ink(Math.floor((d + e) / 2), Math.floor(split / 2))) return null;
  function foot(left, right) {
    for (let y = height - 1; y >= .65 * height; y--) {
      for (let x = Math.floor(left); x < right; x++) {
        if (ink(x, y)) return y + 1;
      }
    }
    return 0;
  }
  const first = foot(a, (b + c) / 2);
  const second = foot((b + c) / 2, (d + e) / 2);
  const tail = foot((d + e) / 2, width);
  if (first < .72 * height || second < .74 * height || Math.abs(first - second) > .07 * height
    || tail - Math.max(first, second) < .10 * height) return null;
  const cap = [...Array(Math.max(1, Math.floor(split / 2)))].map((_, y) => scan(y)[0]).filter(Number.isFinite);
  const leftCap = Math.min(a, median(cap) ?? a);
  const toe = (scan(tail - 1).at(-1) ?? width);
  if (toe < f + .045 * width) return null;
  const wa = b - a, wm = d - c, wr = f - e;
  const shoulder = Math.max(split * 1.65, .16 * width);
  const flare = Math.min(.14 * wa, a - leftCap);
  const stemEnd = tail - (tail - second) * .69;
  const innerEnd = second - .25 * wr;
  const middleStart = second - .88 * wm;
  const firstStart = first - .53 * wa;

  const points = [
    ['M', leftCap, 0], ['L', f - .90 * wr, 0],
    ['C', f - .24 * wr, 0, f, shoulder * .42, f, shoulder],
    ['L', f, stemEnd],
    ['C', f, stemEnd + (tail - stemEnd) * .46, f + (toe - f) * .30, tail - .13 * wr, toe, tail],
    ['C', toe - .74 * wr, tail, e + .44 * wr, tail - .69 * wr, e - .16 * wr, innerEnd + .39 * wr],
    ['C', e - .04 * wr, innerEnd + .32 * wr, e, innerEnd + .21 * wr, e, innerEnd],
    ['L', e, shoulder],
    ['C', e, split + .24 * wr, e - .22 * wr, split, e - .47 * wr, split],
    ['L', d, split], ['L', d, middleStart],
    ['C', d, middleStart + .25 * wm, d + .12 * wm, middleStart + .34 * wm, d + .12 * wm, middleStart + .43 * wm],
    ['C', d + .12 * wm, middleStart + .57 * wm, c + .71 * wm, second - .23 * wm, c + .50 * wm, second],
    ['C', c + .29 * wm, second - .23 * wm, c - .12 * wm, middleStart + .57 * wm, c - .12 * wm, middleStart + .43 * wm],
    ['C', c - .12 * wm, middleStart + .34 * wm, c, middleStart + .25 * wm, c, middleStart],
    ['L', c, shoulder],
    ['C', c, split + .24 * wm, c - .22 * wm, split, c - .47 * wm, split],
    ['L', b, split], ['L', b, firstStart],
    ['C', b, firstStart + .27 * wa, b + .08 * wa, first, b + .17 * wa, first],
    ['L', a - .17 * wa, first],
    ['C', a - .08 * wa, first, a, firstStart + .27 * wa, a, firstStart],
    ['L', a, split * .66],
    ['C', a, split * .40, a - flare, split * .19, leftCap, 0], ['Z']
  ];
  return points.map(([command, ...coords]) => command + coords.map(n => (n + pad).toFixed(2)).join(' ')).join('');
}

module.exports = { fitLetterM };
