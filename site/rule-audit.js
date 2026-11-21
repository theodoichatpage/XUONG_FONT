// Tự đối chiếu quy tắc skill sau mỗi lần dựng: đo dấu của bộ chữ đang làm bằng đúng phép đo đã dùng để lập
// chuẩn (scripts/lib/mark-metrics.cjs), rồi so với khoảng [min–max] của 20 font chuyên nghiệp (site/mark-ranges.js).
// Chỉ báo chữ do Xưởng ghép/dựng; nét gốc của nhà thiết kế và nét lấy từ ảnh không bị chấm.
import outline from '../scripts/lib/outline-metrics.cjs';
import metrics from '../scripts/lib/mark-metrics.cjs';
import { MARK_RANGES } from './mark-ranges.js';

const markChar = { sac: 'ó', huyen: 'ò', hoi: 'ỏ', nga: 'õ', mu: 'ô', trang: 'ă', nang: 'ọ' };
const label = { h: 'chiều cao', w: 'độ rộng', t: 'độ dày nét', gap: 'khoảng hở dấu–thân', taper: 'độ thon', size: 'cỡ theo nét thân',
  vsPeriod: 'cỡ so với dấu chấm', reach: 'độ vươn râu', tip: 'độ cao đầu râu', side: 'vị trí ngang dấu thanh', bottom: 'độ cao dấu thanh', top: 'đỉnh cụm dấu' };
const real = glyph => !glyph || glyph.locked || glyph.origin === 'direct' || ['Ảnh mẫu', 'Ảnh làm sạch', 'Font gốc'].includes(glyph.source);

function charOf(key) {
  if (key.startsWith('rau_')) return key.slice(4) === 'o' ? 'ơ' : key.slice(4) === 'u' ? 'ư' : key.slice(4) === 'O' ? 'Ơ' : 'Ư';
  if (key.startsWith('tier_')) return key.slice(5);
  if (key === 'stack') return 'ẩ';
  const cap = key.endsWith('Cap'), ch = markChar[cap ? key.slice(0, -3) : key];
  return ch && cap ? ch.toUpperCase() : ch;
}

// glyphs: Map ký tự → { d, source... } (UPM 1000, y lên). madeOnly: chỉ chấm chữ do Xưởng ghép.
// Trả về { checked, passed, issues: [{ char, metric, text }] }; null nếu thiếu l, x, H để đo.
export function auditMarks(glyphs, { madeOnly = true, slant = 0 } = {}) {
  const get = ch => glyphs.get(ch)?.d ? outline.flatten(glyphs.get(ch).d) : null;
  const font = { name: 'đang làm', weight: 400, get: ch => get(ch) || (ch === '.' ? get('i') || get('l') : null) };
  let measured;
  try { measured = metrics.measureFont(font); } catch { return null; }
  if (!measured) return null;
  // Font toàn chữ hoa (Bebas...): ô chữ thường là hình chữ hoa (x-height ≈ chiều cao hoa) nên chấm theo chuẩn chữ hoa.
  const allCaps = measured.xH / measured.capH > .9;
  const rangeKey = key => {
    if (!allCaps) return key;
    if (key.startsWith('tier_')) return 'tier_' + key.slice(5).toUpperCase();
    if (key.startsWith('rau_')) return 'rau_' + key.slice(4).toUpperCase();
    return markChar[key] ? key + 'Cap' : key;
  };
  const issues = [];
  let checked = 0;
  for (const [key, values] of Object.entries(measured)) {
    if (!values || typeof values !== 'object') continue;
    const char = charOf(key);
    if (!char || (madeOnly && real(glyphs.get(char)))) continue;
    for (let [metric, value] of Object.entries(values)) {
      const range = MARK_RANGES[rangeKey(key) + '.' + metric];
      // dx (lệch tâm) đổi theo độ nghiêng chữ; cỡ so với dấu chấm chỉ có nghĩa khi font có dấu chấm thật.
      if (!range || !Number.isFinite(value) || metric === 'dx' || (metric === 'vsPeriod' && !glyphs.get('.')?.d)) continue;
      if (slant && (metric === 'side' || metric === 'reach')) continue;
      // Chuẩn chữ hoa đo theo x-height của font có chữ thường (hoa ≈ 1.4 x-height); font toàn hoa đo theo chiều cao hoa nên quy đổi.
      if (allCaps && (metric === 'h' || metric === 'gap') && !key.startsWith('tier_')) value *= 1.4;
      checked++;
      const [min, , max] = range, pad = (max - min) * .1;
      if (value < min - pad || value > max + pad) issues.push({ char, metric, value, range,
        text: `${char} ${label[metric] || metric} ${value.toFixed(2)} (chuẩn ${min.toFixed(2)}–${max.toFixed(2)})` });
    }
  }
  return { checked, passed: checked - issues.length, issues };
}

export function auditMessage(result) {
  if (!result) return '';
  if (!result.checked) return ' Tự đối chiếu quy tắc skill: không có chữ do Xưởng ghép để chấm.';
  return ` Tự đối chiếu quy tắc skill với 20 font chuẩn: đạt ${result.passed}/${result.checked} chỉ số.`
    + (result.issues.length ? ' CẦN XEM: ' + result.issues.slice(0, 8).map(issue => issue.text).join('; ') + (result.issues.length > 8 ? '; …' : '') + '.' : ' Không có chỉ số nào lệch khỏi khoảng chuẩn.');
}
