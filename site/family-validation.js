import { analyzeVietnameseCoverage } from './font-coverage.js';

// Weight classes describe a design; they are not stroke thicknesses.
export function familyPreflight(font, { baseWeight } = {}) {
  const coverage = analyzeVietnameseCoverage(font);
  const problems = [];
  const absent = coverage.entries.filter(item => item.status !== 'present');
  if (absent.length) problems.push('Chưa đủ glyph tiếng Việt có nét: ' + absent.map(item => item.char).join(' '));
  if (font.tables.fvar) problems.push('Cần chọn một kiểu tĩnh.');
  if (font.tables.post?.italicAngle || (font.tables.os2?.fsSelection & (1 | 512))) problems.push('Cần chọn kiểu đứng.');
  const weight = font.tables.os2?.usWeightClass;
  if (!weight || weight < 1 || weight > 1000) problems.push('Metadata độ đậm không hợp lệ.');
  if (baseWeight != null && Number(baseWeight) !== weight) problems.push('Mức gốc đã chọn không khớp weight trong file (' + weight + '). Không đổi nhãn để giả lập độ đậm.');
  for (let i = 0; i < font.glyphs.length; i++) {
    const glyph = font.glyphs.get(i);
    if (!Number.isFinite(glyph.advanceWidth) || glyph.advanceWidth < 0 || glyph.path.commands.some(command =>
      Object.entries(command).some(([key, value]) => key !== 'type' && typeof value === 'number' && !Number.isFinite(value)))) {
      problems.push('Outline hoặc advance không hợp lệ tại glyph #' + i); break;
    }
  }
  return { coverage, weight, problems, ready: !problems.length };
}

export function missingFamilyStyles(styles, existing) {
  const occupied = new Set(existing);
  return [...new Set(styles)].filter(style => !occupied.has(style));
}
