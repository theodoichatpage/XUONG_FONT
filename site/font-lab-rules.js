// Đường kẻ và phép đối chiếu quy tắc dấu cho Font Lab. Số chuẩn lấy từ MARK_STANDARDS (mark-standards.js: 20 font
// chuyên nghiệp đã Việt hóa, cùng nguồn với tab Quy tắc font Việt và references/mark-standards.md của skill). Mọi số đo
// theo chính font đang làm: x-height, chiều cao chữ hoa, độ rộng o/O, nét thân, độ tương phản nét o, kiểu đầu nét r.
import { MARK_STANDARDS as STD } from './mark-standards.js';
import { MARK_RANGES } from './mark-ranges.js';
import { samples, contourBox } from './font-lab-geometry.js';

const MARKS = {
  '́': { key: 'acute', name: 'Dấu sắc' }, '̀': { key: 'grave', name: 'Dấu huyền' },
  '̉': { key: 'hook', name: 'Dấu hỏi' }, '̃': { key: 'tilde', name: 'Dấu ngã' },
  '̂': { key: 'circumflex', name: 'Dấu mũ' }, '̆': { key: 'breve', name: 'Dấu trăng' },
  '̣': { key: 'dotBelow', name: 'Dấu nặng' }, '̛': { key: 'horn', name: 'Râu' },
};

function polygon(contour) {
  return contour.flatMap((node, i) => samples(node, contour[(i + 1) % contour.length], 10).slice(1));
}
const area = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
const perimeter = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + Math.hypot(q.x - p.x, q.y - p.y); }, 0);

// Bề dày nét theo cùng cách lập chuẩn: 2·diện tích / chu vi.
function thickness(contours) {
  const polys = contours.map(polygon);
  const a = Math.abs(polys.reduce((s, p) => s + area(p), 0)), p = polys.reduce((s, q) => s + perimeter(q), 0);
  return p ? 2 * a / p : 0;
}

// Độ thon dấu sắc/huyền: bề ngang nét ở 25% và 75% chiều dài theo trục chính của dấu; thon = mảnh / dày.
function taper(contours) {
  const pts = contours.flatMap(polygon);
  if (pts.length < 6) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my); }
  const angle = Math.atan2(2 * sxy, sxx - syy) / 2, ax = { x: Math.cos(angle), y: Math.sin(angle) }, nx = { x: -ax.y, y: ax.x };
  const proj = pts.map(p => ({ t: (p.x - mx) * ax.x + (p.y - my) * ax.y, n: (p.x - mx) * nx.x + (p.y - my) * nx.y }));
  const t0 = Math.min(...proj.map(p => p.t)), t1 = Math.max(...proj.map(p => p.t)), length = t1 - t0;
  const widthAt = f => { const t = t0 + f * length, near = proj.filter(p => Math.abs(p.t - t) < length * .04); return near.length >= 2 ? Math.max(...near.map(p => p.n)) - Math.min(...near.map(p => p.n)) : null; };
  const a = widthAt(.25), b = widthAt(.75);
  return a && b ? Math.min(a, b) / Math.max(a, b) : null;
}

const contrastClass = c => c >= .9 ? 'monoline' : c >= .5 ? 'sans' : 'highContrast';
const classLabel = { monoline: 'nét đều', sans: 'tương phản vừa', highContrast: 'tương phản cao' };
const terminalLabel = { ball: 'giọt nước', taper: 'vuốt nhọn', blade: 'vát sắc', plain: 'cắt bằng' };

// char: ký tự đang sửa; contours: nét hiện tại; font: { glyphBox(char), xH, capH, o, O, stem, contrast, terminal, period }.
// Trả về { guides: [{ kind, ... }], checks: [{ name, value, range, ok, note }], harmony: [...] }.
export function markRules(char, contours, font) {
  const [root, ...marks] = char.normalize('NFD');
  const out = { guides: [], checks: [], harmony: [] };
  const known = marks.map(m => MARKS[m]).filter(Boolean);
  if (!known.length || !contours.length || !font.xH) return out;
  const upper = root !== root.toLowerCase();
  const xH = font.xH, scale = upper ? STD.capHeightRatio : 1;
  const base = font.glyphBox(root);
  if (!base) return out;
  const baseTop = base.y1, center = (base.x0 + base.x1) / 2, oWidth = (upper ? font.O : font.o) || (base.x1 - base.x0);
  const parts = contours.map(c => ({ c, b: contourBox(c) }));
  const above = parts.filter(p => p.b.y0 > baseTop - .03 * xH).map(p => p.c);
  const below = parts.filter(p => p.b.y1 < .03 * xH && p.b.y0 < -.02 * xH).map(p => p.c);
  const range = (name, value, [mid, min, max], unit = '', note = '') => {
    const pad = (max - min) * .1, ok = value >= min - pad && value <= max + pad;
    out.checks.push({ name, value, range: [min, max], mid, ok, unit, note });
  };

  out.guides.push({ kind: 'h', y: baseTop, label: 'Đỉnh ' + root });
  out.guides.push({ kind: 'v', x: center, label: 'Tâm ' + root });

  const top = known.filter(m => !['dotBelow', 'horn'].includes(m.key));
  if (top.length && above.length) {
    const gap = upper ? STD.gap.cap : STD.gap.lower;
    out.guides.push({ kind: 'band', y0: baseTop + gap[1] * xH, y1: baseTop + gap[2] * xH, label: 'Đáy dấu: hở ' + Math.round(gap[1] * xH) + '–' + Math.round(gap[2] * xH) });
    const boxes = above.map(contourBox), mb = { x0: Math.min(...boxes.map(b => b.x0)), x1: Math.max(...boxes.map(b => b.x1)), y0: Math.min(...boxes.map(b => b.y0)), y1: Math.max(...boxes.map(b => b.y1)) };
    range('Khoảng hở dấu – thân', (mb.y0 - baseTop) / xH, gap, ' x-height', 'Tránh dấu chạm chữ; Vị trí dấu');
    if (top.length === 1) {
      const m = top[0], h = STD.height[m.key], w = STD.width[m.key];
      if (h) {
        out.guides.push({ kind: 'band', y0: mb.y0 + h[1] * scale * xH, y1: mb.y0 + h[2] * scale * xH, label: 'Đỉnh ' + m.name.toLowerCase() });
        range(m.name + ': chiều cao', (mb.y1 - mb.y0) / (scale * xH), h, ' x-height', 'Kích thước và độ đậm của dấu');
      }
      if (w) {
        const mc = (mb.x0 + mb.x1) / 2;
        out.guides.push({ kind: 'vband', x0: mc - w[2] * oWidth / 2, x1: mc + w[2] * oWidth / 2, inner0: mc - w[1] * oWidth / 2, inner1: mc + w[1] * oWidth / 2, y0: mb.y0, y1: mb.y1, label: 'Rộng ' + m.name.toLowerCase() });
        range(m.name + ': độ rộng', (mb.x1 - mb.x0) / oWidth, w, ' × rộng ' + (upper ? 'O' : 'o'), 'Kích thước và độ đậm của dấu');
      }
      if (['circumflex', 'breve', 'tilde'].includes(m.key)) {
        const dx = ((mb.x0 + mb.x1) / 2 - center) / oWidth;
        out.checks.push({ name: m.name + ': lệch tâm', value: dx, range: [-.06, .06], ok: Math.abs(dx) <= .06, unit: ' × rộng o', note: 'Vị trí dấu: mũ, trăng, ngã đặt giữa chữ' });
      }
      const target = STD.thickness(font.stem), t = thickness(above);
      out.checks.push({ name: m.name + ': độ dày nét', value: t, range: [target * .8, target * 1.2], ok: t >= target * .8 && t <= target * 1.2, unit: ' đơn vị', note: 'Theo nét thân ' + Math.round(font.stem) + ': chuẩn ' + Math.round(target) });
      if (['acute', 'grave'].includes(m.key)) {
        const cls = contrastClass(font.contrast), want = STD.acuteTaper[cls], tp = taper(above);
        if (tp != null) out.checks.push({ name: m.name + ': độ thon', value: tp, range: want, ok: tp >= want[0] - .05 && tp <= want[1] + .05, unit: '', note: 'Sự hòa hợp: font ' + classLabel[cls] + ' (nét o ' + font.contrast.toFixed(2) + ')' });
      }
    } else {
      const stack = upper ? STD.stackTop.cap : STD.stackTop.lower;
      range('Đỉnh cụm hai tầng dấu', mb.y1 / 1000, stack, ' em', 'Hai tầng dấu (ấ ầ ẩ ẫ, ắ ằ ẳ ẵ)');
      out.guides.push({ kind: 'band', y0: stack[1] * 1000, y1: stack[2] * 1000, label: 'Đỉnh cụm dấu' });
    }
  }

  if (known.some(m => m.key === 'dotBelow') && below.length) {
    const b = contourBox(below[0]), gap = STD.gap.below;
    const bodyBottom = Math.min(0, base.y0);
    out.guides.push({ kind: 'band', y0: bodyBottom - gap[2] * xH, y1: bodyBottom - gap[1] * xH, label: 'Đỉnh dấu nặng: hở ' + Math.round(gap[1] * xH) + '–' + Math.round(gap[2] * xH) });
    range('Dấu nặng: khoảng hở', (bodyBottom - b.y1) / xH, gap, ' x-height', 'Dấu nặng; Nặng tránh đuôi y');
    if (font.period) {
      const size = Math.max(b.x1 - b.x0, b.y1 - b.y0) / font.period;
      range('Dấu nặng: cỡ so với dấu chấm', size, STD.dotBelow.vsPeriod, '', 'Dấu nặng bằng hoặc nhỏ hơn dấu chấm');
    }
    out.guides.push({ kind: 'v', x: center, label: '' });
  }

  if (known.some(m => m.key === 'horn')) {
    // Đo như scripts/lib/mark-metrics.cjs: vươn = (mép phải cả chữ − mép phải chữ gốc) / bề rộng chữ gốc;
    // đầu râu = (đỉnh cả chữ − đỉnh chữ gốc) / x-height. Khoảng [min, trung vị, max] của 20 font trong mark-ranges.js.
    const kind = root.toLowerCase() === 'o' ? (upper ? 'O' : 'o') : (upper ? 'U' : 'u');
    const w = base.x1 - base.x0, [r0, rm, r1] = MARK_RANGES['rau_' + kind + '.reach'], [t0, tm, t1] = MARK_RANGES['rau_' + kind + '.tip'];
    const all = parts.map(p => p.b), gx1 = Math.max(...all.map(b => b.x1)), gy1 = Math.max(...all.map(b => b.y1));
    out.guides.push({ kind: 'v', x: base.x1, label: 'Mép phải ' + root });
    out.guides.push({ kind: 'xband', x0: base.x1 + r0 * w, x1: base.x1 + r1 * w, mid: base.x1 + rm * w,
      label: 'Râu vươn ' + Math.round(r0 * w) + '–' + Math.round(r1 * w) + ' (giữa ' + Math.round(rm * w) + ')' });
    out.guides.push({ kind: 'band', y0: baseTop + t0 * xH, y1: baseTop + t1 * xH, label: 'Đầu râu cao ' + Math.round(t0 * xH) + '–' + Math.round(t1 * xH) + ' trên đỉnh (giữa ' + Math.round(tm * xH) + ')' });
    range('Râu: độ vươn', (gx1 - base.x1) / w, [rm, r0, r1], ' × rộng ' + root, 'Phần râu chìa quá mép phải ' + root + ': khoảng 20 font, không bắt buộc đúng mức giữa');
    range('Râu: độ cao đầu râu', (gy1 - baseTop) / xH, [tm, t0, t1], ' x-height', 'Đầu râu cao hơn đỉnh ' + root);
    const extra = parts.filter(p => p.b.x1 > base.x1 + 2 && p.b.y0 > base.y0 + .3 * (base.y1 - base.y0) && p.b.y1 - p.b.y0 < .6 * (base.y1 - base.y0)).map(p => p.c);
    if (extra.length) {
      const target = STD.thickness(font.stem), t = thickness(extra);
      out.checks.push({ name: 'Râu: độ dày nét', value: t, range: [target * .8, target * 1.2], ok: t >= target * .8 && t <= target * 1.2, unit: ' đơn vị', note: 'Theo nét thân ' + Math.round(font.stem) + ': chuẩn ' + Math.round(target) });
    }
  }

  // Sự hòa hợp: đặc điểm nét của chính font để đối chiếu khi chỉnh dấu.
  const cls = contrastClass(font.contrast);
  out.harmony.push('Nét thân ' + Math.round(font.stem) + ' → dấu dày khoảng ' + Math.round(STD.thickness(font.stem)));
  out.harmony.push('Độ tương phản nét o ' + font.contrast.toFixed(2) + ' (' + classLabel[cls] + ') → dấu sắc/huyền thon ' + STD.acuteTaper[cls].join('–'));
  if (font.terminal) out.harmony.push('Đầu nét tay r: ' + (terminalLabel[font.terminal] || font.terminal) + ' → đầu dấu, đầu râu cùng kiểu');
  return out;
}
