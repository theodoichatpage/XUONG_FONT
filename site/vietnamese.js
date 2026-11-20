import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';
import { MARK_STANDARDS as STD, STROKE_PER_MEASURED } from './mark-standards.js';

export const core = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
export const lowercase = [...'abcdefghijklmnopqrstuvwxyzđ'];
export const punctuation = [...'.,:;!?-–—()“”‘’/+<>', ...`"'@#$%^&*[]{}_=~\\|`];
export const toneSamples = new Map([
  ['\u0301', 'Sắc'], ['\u0300', 'Huyền'], ['\u0323', 'Nặng'],
  ['\u0303', 'Ngã'], ['\u0309', 'Hỏi'], ['\u0306', 'Trăng'], ['\u0302', 'Mũ'], ['\u031b', 'Râu']
]);

const vowels = [...'AĂÂEÊIOÔƠUƯYaăâeêioôơuưy'];
const tones = ['', '\u0300', '\u0301', '\u0309', '\u0303', '\u0323'];
export const accented = [...new Set(vowels.flatMap(vowel => tones.map(tone => (vowel + tone).normalize('NFC'))))]
  .filter(char => !core.includes(char) && !lowercase.includes(char));
export const charset = [...core, 'Đ', ...lowercase, ...accented, ...punctuation];

const templates = {
  '\u0300': 'M-73 94 L-20 94 L62 0 L18 0 Z',
  '\u0301': 'M73 94 L20 94 L-62 0 L-18 0 Z',
  '\u0309': 'M-53 55 C-50 120 71 113 66 60 C64 35 20 29 20 0 L-17 0 C-17 40 28 49 28 66 C28 83 -16 83 -17 55 Z',
  '\u0303': 'M-106 15 C-75 124 14 18 47 57 Q66 62 78 83 L103 77 C73 -26 -15 77 -50 39 Q-67 35 -77 8 Z',
  '\u0302': 'M-113 4 L-21 100 L22 100 L113 4 L67 4 L0 60 L-67 4 Z',
  '\u0306': 'M-113 92 L-78 92 Q0 7 78 92 L113 92 Q83 0 0 0 Q-83 0 -113 92 Z',
  '\u031b': 'M-48 0 Q31 0 54 112 L90 112 Q78 -28 -19 -35 Z',
  '\u0323': 'M41 0 A41 41 0 1 0 -41 0 A41 41 0 1 0 41 0 Z'
};

// Short curved neck and round terminal from the approved uppercase design.
const compactHorn = 'M0 5 C17 10 31 20 39 34 C25 40 20 49 20 62 C20 80 34 94 52 94 C70 94 84 80 84 62 C84 40 69 26 47 15 L4 0 Z';

// Vị trí dấu thanh ở tầng hai, đo từ 20 font đã Việt hóa (trung vị). Theo bề rộng (cw) và chiều cao (ch) của mũ/trăng:
// left = mép trái dấu thanh tính từ tâm mũ (mép phải với huyền), bottom = đáy dấu thanh theo chiều cao mũ
// (1 = ngang đỉnh mũ), lift = hở thêm trên đỉnh theo x-height, scale = cỡ so với dấu đứng một mình.
const TWO_TIER = {
  '́': { circumflex: { name: 'sắc bên phải mũ', left: .38, bottom: .62, scale: .8 }, breve: { name: 'sắc trên trăng', center: .15, bottom: 1, lift: .02, scale: .8 } },
  '̀': { circumflex: { name: 'huyền bên trái mũ', right: -.38, bottom: .62, scale: .8 }, breve: { name: 'huyền trên trăng', center: -.1, bottom: 1, lift: .02, scale: .8 } },
  '̉': { circumflex: { name: 'hỏi bên phải mũ', left: .32, bottom: .61, scale: 1 }, breve: { name: 'hỏi trên trăng', center: .02, bottom: .95, lift: 0, scale: 1 } },
  '̃': { circumflex: { name: 'ngã trên mũ', center: 0, bottom: 1, lift: .06, scale: .9 }, breve: { name: 'ngã trên trăng', center: 0, bottom: 1, lift: .04, scale: .9 } },
};

function contourList(d) {
  const parts = [];
  for (const segment of svgpath(d).abs().unshort().unarc().segments) { if (segment[0] === 'M') parts.push([]); parts.at(-1)?.push(segment.join(' ')); }
  return parts.map(part => part.join(' '));
}
// Đặt dấu thanh cạnh/trên mũ hoặc trăng đã có trong chữ (tier = â, Â, ă... đã dựng hoặc của font gốc).
function placeSecondTier(tier, plainRoot, sample, tone, structural, isCapital, body) {
  const rootBox = glyphBounds(plainRoot), rootTop = rootBox.y + rootBox.height;
  const markParts = contourList(tier.d).filter(d => { const b = glyphBounds({ d }); return b.y >= rootTop - 8 && b.height < rootBox.height * .6; });
  if (!markParts.length) return null;
  const mark = glyphBounds({ d: markParts.join(' ') }), cx = mark.x + mark.width / 2;
  const rule = TWO_TIER[tone][structural === '̂' ? 'circumflex' : 'breve'];
  const source = glyphBounds(sample);
  if (!(source.width > 0 && source.height > 0)) return null;
  const key = { '́': 'acute', '̀': 'grave', '̉': 'hook', '̃': 'tilde' }[tone];
  const ownSize = sample.nativeSize || sample.source === 'Font gốc';
  const standalone = ownSize ? source.height : STD.height[key][0] * body.xHeight * (isCapital ? STD.capHeightRatio : 1);
  // Đỉnh cả cụm không vượt mức font chuyên nghiệp dùng: chữ hoa 1.0 em, chữ thường 0.9 em.
  // Vượt thì thu dấu thanh (tối đa còn 65%), rồi hạ dấu sát mũ/trăng hơn (tối đa 25% chiều cao mũ).
  const limit = 1000 * (isCapital ? STD.stackTop.cap[2] : .9);
  let y = mark.y + rule.bottom * mark.height + (rule.lift || 0) * body.xHeight;
  let k = standalone * rule.scale / source.height;
  if (y + source.height * k > limit) k = Math.max(k * .65, (limit - y) / source.height);
  if (y + source.height * k > limit) y = Math.max(y - .25 * mark.height, limit - source.height * k);
  const w = source.width * k;
  const x = rule.left !== undefined ? cx + rule.left * mark.width
    : rule.right !== undefined ? cx + rule.right * mark.width - w
    : cx + rule.center * mark.width - w / 2;
  const top = Math.max(mark.y + mark.height, y + source.height * k), h = source.height * k;
  const shift = body.slant * (y + h / 2 - (mark.y + mark.height / 2));
  const local = leanMark(svgpath(sample.d).translate(-source.x, -source.y).scale(k).toString(), sample, body.slant, h);
  return { d: tier.d + ' ' + svgpath(local).translate(x + shift, y).round(1).toString(),
    factor: Math.round(k / (standalone * rule.scale / source.height) * 100) / 100, top: Math.round(top), fits: top <= 1000 };
}

const isReal = glyph => !!glyph?.d && (glyph.locked || glyph.origin === 'direct' || ['Ảnh mẫu', 'Ảnh làm sạch', 'Font gốc'].includes(glyph.source));

// Dấu do nhà thiết kế font vẽ: tách từ chữ Latin có sẵn chỉ mang đúng dấu đó, theo thứ tự cố định
// (ã õ ñ ũ..., chữ hoa Ã Õ Ñ Ũ...). Bỏ qua khối chữ tiếng Việt U+1EA0–1EF9 và ơ ư: trong font đã Việt hóa rồi
// lưu lại, các chữ đó có thể do Xưởng ghép, nên lấy chúng làm mẫu sẽ làm dấu không đồng nhất (ễ khác Ữ).
const DONOR_ROOTS = 'aoeuiynAOEUIYN';
function designerMark(glyphs, mark, capital, cache) {
  const key = mark + (capital ? 'C' : 'c');
  if (cache.has(key)) return cache.get(key);
  let found;
  if (mark !== '̛') {
    const donors = [];
    for (const glyph of glyphs.values()) {
      if (glyph.source !== 'Font gốc' || !glyph.d || !glyph.char) continue;
      const code = glyph.char.codePointAt(0);
      if (code >= 0x1EA0 && code <= 0x1EF9) continue;
      const [root, ...marks] = glyph.char.normalize('NFD');
      if (marks.length !== 1 || marks[0] !== mark || (root !== root.toLowerCase()) !== capital || !glyphs.get(root)?.d) continue;
      const rank = DONOR_ROOTS.indexOf(root);
      donors.push({ glyph, root, rank: rank < 0 ? 99 : rank });
    }
    donors.sort((a, b) => a.rank - b.rank || a.glyph.char.codePointAt(0) - b.glyph.char.codePointAt(0));
    for (const { glyph, root } of donors) {
      const rootBox = glyphBounds(glyphs.get(root)), parts = [];
      for (const segment of svgpath(glyph.d).abs().unshort().unarc().segments) {
        if (segment[0] === 'M') parts.push([]);
        parts.at(-1)?.push(segment.join(' '));
      }
      const picked = parts.map(part => part.join(' ')).filter(d => {
        const box = glyphBounds({ d });
        return mark === '̣' ? box.y + box.height < rootBox.y : box.y >= rootBox.y + rootBox.height - 8 && box.height < rootBox.height * .5;
      });
      if (picked.length) { found = { char: mark, d: picked.join(' '), advance: 0, source: 'Font gốc', donor: glyph.char }; break; }
    }
  }
  cache.set(key, found);
  return found;
}
// Mẫu dấu cho một chữ: dấu người dùng đưa từ ảnh → dấu nhà thiết kế (cùng hoa/thường) → dấu đang có → dấu dựng từ nét.
function pickMark(glyphs, mark, capital, cache, derive) {
  const own = glyphs.get(mark)?.d ? glyphs.get(mark) : undefined;
  if (own && (own.origin === 'direct' || own.source === 'Ảnh mẫu' || own.source === 'Ảnh làm sạch' || own.locked)) return own;
  return designerMark(glyphs, mark, capital, cache) || (capital ? designerMark(glyphs, mark, false, cache) : undefined) || own || derive().get(mark);
}

function undotI(glyph) {
  const contours = [];
  for (const segment of svgpath(glyph.d).abs().segments) {
    if (segment[0] === 'M') contours.push([]);
    contours.at(-1)?.push(segment);
  }
  if (contours.length !== 2) return null;
  const parts = contours.map(contour => {
    const shape = { d: contour.map(([command, ...coordinates]) => command + coordinates.join(' ')).join('') };
    return { shape, bounds: glyphBounds(shape) };
  }).sort((a, b) => b.bounds.height - a.bounds.height);
  const [stem, dot] = parts;
  if (dot.bounds.y <= stem.bounds.y + stem.bounds.height || dot.bounds.height > stem.bounds.height * .35) return null;
  return { ...glyph, d: stem.shape.d };
}

export function composeVietnamese(glyphs, replace = () => false, { replaceHorn = false, requireReferenceMarks = false } = {}) {
  const result = [];
  const body = measureBody(glyphs), capMarks = new Map(), made = new Map();
  let derivedTwoTier;
  for (const char of accented) {
    if (['Ảnh mẫu', 'Ảnh làm sạch', 'Font gốc'].includes(glyphs.get(char)?.source) && !replace(char)) continue;
    const [root, ...marks] = char.normalize('NFD');
    const horn = '\u031b';
    const horned = (root + horn).normalize('NFC');
    const useHornedSample = !replaceHorn && marks.length > 1 && marks.includes(horn) && isReal(glyphs.get(horned));
    const useCompactHorn = !replaceHorn && marks.includes(horn) && glyphs.get(horned)?.hornStyle === 'compact';
    // Chữ có mũ/trăng kèm dấu thanh (Ộ, Ấ, ặ...): nếu font đã có Ô, Â, Ă... do nhà thiết kế vẽ thì dùng làm gốc,
    // chỉ thêm dấu thanh, không vẽ lại mũ/trăng.
    const structural = marks.find(mark => mark === '̂' || mark === '̆');
    const structuredChar = structural ? (root + structural).normalize('NFC') : null;
    const useStructured = !!structural && marks.length > 1 && isReal(glyphs.get(structuredChar)) && !replace(structuredChar);
    const base = useHornedSample ? horned : useStructured ? structuredChar : root;
    if (useHornedSample) marks.splice(marks.indexOf(horn), 1);
    if (useStructured) marks.splice(marks.indexOf(structural), 1);
    if (requireReferenceMarks && marks.some(mark=>{const sample=glyphs.get(mark);return !sample?.d || !(sample.origin==='direct'||sample.source==='Ảnh mẫu'||sample.source==='Font gốc');})) continue;
    // Hai tầng dấu (ấ ầ ẩ ẫ, ắ ằ ẳ ẵ và chữ hoa): xếp theo cách đo được ở 20 font đã Việt hóa,
    // giữ nguyên mũ/trăng như ở â/ă, dấu thanh lệch cạnh mũ thay vì chồng thẳng lên trên.
    const tone = marks.find(mark => TWO_TIER[mark]);
    if (structural && tone && marks.filter(mark => mark !== structural).length === 1) {
      const tier = glyphs.get(structuredChar)?.d && (useStructured || !made.has(structuredChar)) ? glyphs.get(structuredChar) : made.get(structuredChar);
      const plainRoot = glyphs.get(root);
      const isCapital = root !== root.toLowerCase();
      const sample = pickMark(glyphs, tone, isCapital, capMarks, () => (derivedTwoTier ??= deriveMarkSamples(glyphs).marks));
      const placed = tier?.d && plainRoot?.d && sample?.d ? placeSecondTier(tier, plainRoot, sample, tone, structural, isCapital, body) : null;
      if (placed) {
        const entry = { char, d: placed.d, advance: tier.advance, source: 'Ghép dấu', origin: 'inferred', approved: false, locked: false, base: structuredChar,
          markFit: { layout: TWO_TIER[tone][structural === '̂' ? 'circumflex' : 'breve'].name, factor: placed.factor, top: placed.top, fits: placed.fits } };
        result.push(entry); made.set(char, entry);
        continue;
      }
    }
    let original = glyphs.get(base);
    if (original && base === 'i' && !marks.includes('\u0323')) original = undotI(original);
    if (!original) continue;
    // Râu nhô cao bên phải: canh dấu theo thân o/u, không theo khung có râu.
    const plain = useHornedSample && glyphs.get(root)?.d ? glyphs.get(root) : original;
    const bounds = glyphBounds(plain);
    if (plain !== original) { const full = glyphBounds(original); bounds.y = Math.min(bounds.y, full.y); }
    const bodyTop = bounds.y + bounds.height;
    const isCap = root !== root.toLowerCase();
    // Khoảng hở chuẩn đo từ font đã Việt hóa: dấu trên chữ thường 0.136 x-height, chữ hoa 0.105, nặng 0.093.
    const gapUpper = (isCap ? STD.gap.cap : STD.gap.lower)[0] * body.xHeight, gapBelow = STD.gap.below[0] * body.xHeight;
    let top = bodyTop + gapUpper;
    let advance = original.advance;
    const paths = [original.d];
    // Dấu dựng từ nét (nativeSize) được xếp theo quy tắc skill sau vòng lặp: chữ hoa dấu nhỏ và sát hơn,
    // mũ/trăng không rộng quá nguyên âm, cả chồng dấu phải nằm trong chiều cao dòng.
    const stack = [];
    let fit, derived;
    for (const mark of [...marks].sort((a, b) => Number(b === '\u0302' || b === '\u0306') - Number(a === '\u0302' || a === '\u0306'))) {
      let x = bounds.x + bounds.width / 2;
      let y = top;
      if (mark === horn && useCompactHorn) {
        const scale = Math.min(.9, bounds.width * .38 / 84);
        const overlap = bounds.width * (root === 'o' ? .23 : .15);
        const right = bounds.x + bounds.width;
        paths.push(svgpath(compactHorn).scale(scale).translate(right - overlap, bodyTop - 35).round(1).toString());
        advance += Math.max(0, Math.ceil(84 * scale - overlap));
        continue;
      }
      // Dấu chưa có trong font (ví dụ font gốc chỉ có á à ã â ă, thiếu râu, nặng, hỏi): dựng theo nét của
      // chính bộ chữ thay vì dùng hình mẫu cố định, để độ dày khớp kiểu chữ (Thin, Bold...).
      const sample = toneSamples.has(mark) ? pickMark(glyphs, mark, isCap, capMarks, () => (derived ??= deriveMarkSamples(glyphs).marks)) : undefined;
      if (sample) {
        const source = glyphBounds(sample);
        if (source.width > 0 && source.height > 0) {
          if (mark === '\u031b' && sample.nativeSize) {
            // Skill: r\u00e2u n\u1ed1i v\u00e0o th\u00e2n \u1edf v\u00f9ng tr\u00ean b\u00ean ph\u1ea3i o/u. T\u00ecm m\u00e9p ph\u1ea3i th\u1eadt c\u1ee7a n\u00e9t t\u1ea1i \u0111\u1ed9 cao n\u1ed1i
            // (o cong v\u00e0o trong n\u00ean kh\u00f4ng d\u00f9ng khung ch\u1eef nh\u1eadt), c\u1eafm g\u1ed1c r\u00e2u v\u00e0o trong n\u00e9t \u0111\u1ec3 li\u1ec1n kh\u1ed1i.
            const attachY = bounds.y + bounds.height * (/[oO]/u.test(root) ? .8 : .9);
            const edge = rightEdgeAt(original.d, attachY) ?? bounds.x + bounds.width;
            const stem = sample.stem || bounds.width * .2, inset = .45 * stem;
            // Chuẩn đo: độ vươn phải theo độ rộng chữ gốc, đầu râu cao hơn đỉnh thân theo x-height.
            const key = 'oOuU'.includes(root) ? root : /[oO]/u.test(root) ? 'o' : 'u';
            const reach = STD.horn.reach[key] * bounds.width, tip = STD.horn.tip[key] * body.xHeight;
            const shape = hornShape(bounds.x + bounds.width + reach - (edge - inset), Math.max(.6 * stem, bodyTop + tip - attachY), .9 * stem);
            const horn = sameDirection(body.slant ? svgpath(shape).skewX(Math.atan(body.slant) * 180 / Math.PI).toString() : shape, original.d);
            paths.push(svgpath(horn).translate(edge - inset, attachY).round(1).toString());
            const hornRight = bounds.x + bounds.width + reach;
            advance = Math.max(advance, Math.ceil(hornRight + 25));
            continue;
          }
          if (mark === '\u031b') {
            const scale = sample.nativeSize ? Math.min(1, bounds.width * .60 / source.width)
              : Math.min(130 / source.height, bounds.width * .60 / source.width);
            const width = source.width * scale, height = source.height * scale;
            const overlap = Math.min(width * .32, bounds.width * .12);
            const right = bounds.x + bounds.width;
            // The left base of the horn seats inside the upper-right stem.
            paths.push(svgpath(sample.d).translate(-source.x, -source.y).scale(scale)
              .translate(right - overlap, bodyTop - height * .62).round(1).toString());
            advance += Math.max(0, Math.ceil(width - overlap));
            continue;
          }
          if (sample.nativeSize && mark !== '\u0323') { stack.push({ mark, sample, source }); continue; }
          const targetHeight = mark === '\u0309' ? 122 : mark === '\u0323' ? 80 : 95;
          const ownSize = sample.nativeSize || sample.source === 'Font gốc';   // dấu lấy từ chính font: giữ cỡ gốc
          const scale = Math.min(ownSize ? 1 : targetHeight / source.height, bounds.width * 1.2 / source.width);
          const height = source.height * scale;
          if (mark === '\u0323') y = bounds.y - gapBelow - height;
          else top += height + gapUpper;
          const shift = body.slant * (y + height / 2 - (bounds.y + bounds.height / 2));   // theo trục nghiêng
          const local = svgpath(sample.d).translate(-source.x - source.width / 2, -source.y).scale(scale).toString();
          // Nặng lấy từ dấu chấm/chấm i của font (đã nghiêng sẵn) nên không nghiêng thêm.
          paths.push(svgpath(mark === DOT_BELOW ? local : leanMark(local, sample, body.slant, height)).translate(x + shift, y).round(1).toString());
          continue;
        }
      }
      if (mark === '\u0323') y = bounds.y - 69;
      else if (mark === '\u031b') {
        x = bounds.x + bounds.width;
        y = bodyTop - 72;
        advance += 60;
      } else top += 123;
      paths.push(svgpath(templates[mark]).unarc().translate(x, y).round(1).toString());
    }
    if (stack.length) {
      // Quy tắc skill mục 8 (chữ hoa) và "Các mức số": dấu hoa 90%, khoảng hở hoa chặt hơn thường.
      const sizeRule = isCap ? STD.capHeightRatio : 1, gapRule = gapUpper, minGap = .06 * body.xHeight;
      const widthRule = isCap ? .7 : .8;   // mũ, trăng: kiểm độ rộng theo nguyên âm
      const items = stack.map(({ mark, sample, source }) => {
        const wide = mark === '̂' || mark === '̆';
        const limit = bounds.width * (wide ? widthRule : 1.1) / source.width;
        return { mark, sample, source, scale: Math.min(sizeRule, limit) };
      });
      // Cả chồng dấu phải vừa chiều cao dòng (ascender 1000, chừa 20).
      const base = top - gapUpper;   // trên các dấu đã đặt trước (dấu lấy từ font gốc)
      // Đỉnh cả chồng dấu: chữ thường tới ~0.89 em, chữ hoa tới ~0.98 em (đo từ font đã Việt hóa).
      const room = 1000 * (isCap ? STD.stackTop.cap[0] : STD.stackTop.lower[2]) - base;
      const need = (factor, gap) => items.reduce((sum, item) => sum + gap + item.source.height * item.scale * factor, 0);
      let factor = 1, gap = gapRule;
      if (need(1, gapRule) > room) {
        gap = Math.max(minGap, gapRule - (need(1, gapRule) - room) / items.length);
        factor = Math.max(.7, Math.min(1, (room - gap * items.length) / need(1, 0)));
      }
      let y = base;
      for (const item of items) {
        const scale = item.scale * factor;
        y += gap;
        const height = item.source.height * scale, shift = body.slant * (y + height / 2 - (bounds.y + bounds.height / 2));
        const local = svgpath(item.sample.d).translate(-item.source.x - item.source.width / 2, -item.source.y).scale(scale).toString();
        paths.push(svgpath(leanMark(local, item.sample, body.slant, height)).translate(bounds.x + bounds.width / 2 + shift, y).round(1).toString());
        y += item.source.height * scale;
      }
      fit = { factor: Math.round(factor * 100) / 100, gap: Math.round(gap), top: Math.round(y), fits: y <= 1000 };
    }
    const entry = { char, d: paths.join(' '), advance, source: 'Ghép dấu', origin:'inferred', approved:false, locked:false, base,
      ...(fit ? { markFit: fit } : {}),
      ...(useCompactHorn && char === horned ? { hornStyle: 'compact' } : {}) };
    result.push(entry); made.set(char, entry);
  }
  return result;
}

// Explicit application only replaces existing variants that can use an imported mark.
export function applyReferenceMarks(glyphs, selection) {
  const selectedMarks = Array.isArray(selection) ? selection.filter(mark => toneSamples.has(mark) && glyphs.has(mark))
    : toneSamples.has(selection) ? [selection].filter(mark => glyphs.has(mark)) : undefined;
  const base = selectedMarks ? undefined : selection?.normalize('NFD')[0];
  if (selectedMarks ? !selectedMarks.length : !base || !glyphs.has(base)) return [];
  const targets = new Set(accented.filter(char => {
    if (!glyphs.has(char)) return false;
    const [root, ...marks] = char.normalize('NFD');
    return selectedMarks ? marks.some(mark => selectedMarks.includes(mark)) : root === base
      && marks.some(mark => toneSamples.has(mark) && glyphs.has(mark));
  }));
  return composeVietnamese(glyphs, char => targets.has(char), {
    replaceHorn: selectedMarks?.includes('\u031b')
  }).filter(glyph => targets.has(glyph.char));
}

export function applyCompactLowercaseHorns(glyphs) {
  const drafts = new Map(glyphs);
  const selected = new Set();
  for (const [base, horned] of [['o', 'ơ'], ['u', 'ư']]) {
    if (!glyphs.has(base)) continue;
    selected.add(base);
    drafts.set(horned, { ...drafts.get(horned), source: 'Ghép dấu', hornStyle: 'compact' });
  }
  const matches = char => {
    const [base, ...marks] = char.normalize('NFD');
    return selected.has(base) && marks.includes('\u031b');
  };
  return composeVietnamese(drafts, matches).filter(glyph => matches(glyph.char));
}

// ---------- Dựng dấu mẫu và Đ/đ từ nét chữ đã có ----------
// Theo quy tắc trong skill design-vietnamese-fonts: sắc/huyền thon dần về đầu dưới, mũ là chevron
// (không dùng caron), trăng là cung cong với hai đầu bằng, nặng đối chiếu dấu chấm, hỏi gọn và khác
// dấu chấm hỏi, gạch Đ nằm giữa cap-height, gạch đ nằm giữa x-height và ascender.
// Độ dày lấy từ thân chữ l/I của chính bộ font. Kết quả luôn là "suy luận" và cần duyệt.

const round1 = value => Math.round(value * 10) / 10;
export const polygon = points => 'M' + points.map(([x, y]) => round1(x) + ' ' + round1(y)).join(' L') + ' Z';

// Nét dày đều dọc theo một đường tâm, hai đầu bằng.
export function strokeAlong(points, width) {
  // width: số, hoặc hàm (vị trí 0..1) → độ dày, để nét thon dần như quy tắc skill.
  const at = typeof width === 'function' ? width : () => width;
  const left = [], right = [];
  points.forEach((point, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1, w = at(i / (points.length - 1));
    const nx = -dy / length * w / 2, ny = dx / length * w / 2;
    left.push([point[0] + nx, point[1] + ny]);
    right.push([point[0] - nx, point[1] - ny]);
  });
  return polygon([...left, ...right.reverse()]);
}

// Làm phẳng outline thành polyline để đo (chạy được cả trong trình duyệt và node).
function flattenOutline(d, steps = 12) {
  const contours = [];
  let cur = null;
  svgpath(d).abs().unshort().unarc().iterate((s, i, px, py) => {
    const c = s[0];
    if (c === 'M') { cur = [[s[1], s[2]]]; contours.push(cur); return; }
    if (!cur || c === 'Z') return;
    if (c === 'L') cur.push([s[1], s[2]]);
    else if (c === 'H') cur.push([s[1], py]);
    else if (c === 'V') cur.push([px, s[1]]);
    else if (c === 'Q' || c === 'C') {
      const P = c === 'C' ? [[px, py], [s[1], s[2]], [s[3], s[4]], [s[5], s[6]]] : [[px, py], [s[1], s[2]], [s[3], s[4]]];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps; let q = P;
        while (q.length > 1) q = q.slice(1).map((p, j) => [q[j][0] + (p[0] - q[j][0]) * t, q[j][1] + (p[1] - q[j][1]) * t]);
        cur.push(q[0]);
      }
    }
  });
  return contours.filter(c => c.length > 2);
}
// Bề dày thân đứng: đo ngang ở 40–60% chiều cao (bỏ chân serif, móc đầu l của font mono), lấy trung vị đoạn hẹp nhất.
function stemThickness(d) {
  const contours = flattenOutline(d);
  let y0 = Infinity, y1 = -Infinity;
  for (const c of contours) for (const p of c) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const widths = [];
  for (let k = 0; k <= 10; k++) {
    const y = y0 + (y1 - y0) * (.4 + .02 * k), xs = [];
    for (const c of contours) for (let i = 0; i < c.length; i++) {
      const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
      if ((ay <= y) !== (by <= y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    const spans = []; for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > .5) spans.push(xs[i + 1] - xs[i]);
    if (spans.length) widths.push(Math.min(...spans));
  }
  widths.sort((a, b) => a - b);
  return widths.length ? widths[Math.floor(widths.length / 2)] : null;
}
// Độ tương phản nét: nét ngang mảnh nhất ở đỉnh/đáy chữ o chia nét đứng dày nhất ở hai bên.
// Nét đều (Courier, Poppins) ≈ 0.9–1; sans thường 0.7–0.85; nét thanh-đậm (Times, Palatino) 0.2–0.35.
export function strokeContrast(glyphs) {
  const glyph = glyphs.get('o') || glyphs.get('O');
  if (!glyph?.d) return .8;
  const contours = flattenOutline(glyph.d);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cross = (axis, at) => {
    const hits = [];
    for (const c of contours) for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length], u = axis ? 1 : 0, v = 1 - u;
      if ((a[u] <= at) !== (b[u] <= at)) hits.push(a[v] + (at - a[u]) / (b[u] - a[u]) * (b[v] - a[v]));
    }
    hits.sort((p, q) => p - q);
    const spans = []; for (let i = 0; i + 1 < hits.length; i += 2) spans.push(hits[i + 1] - hits[i]);
    return spans;
  };
  let thin = Infinity, thick = 0;
  for (let k = -3; k <= 3; k++) {
    const vertical = cross(0, (x0 + x1) / 2 + k * (x1 - x0) * .02);       // đo dọc ở giữa: nét ngang trên và dưới
    if (vertical.length >= 2) thin = Math.min(thin, ...vertical);
    const horizontal = cross(1, (y0 + y1) / 2 + k * (y1 - y0) * .02);     // đo ngang ở giữa: nét đứng hai bên
    if (horizontal.length >= 2) thick = Math.max(thick, ...horizontal);
  }
  return Number.isFinite(thin) && thick > 0 ? Math.max(.1, Math.min(1, thin / thick)) : .8;
}
// Độ nghiêng của chữ (kiểu Italic/Oblique): tâm nét thân l/I ở 75% chiều cao lệch so với ở 25%, chia khoảng cao.
// Chữ đứng ≈ 0; Italic thường 0.15–0.25 (8–14°). Dấu dựng thêm phải nghiêng theo và đặt theo trục nghiêng.
export function measureSlant(glyphs) {
  for (const char of ['l', 'I', 'i']) {
    const glyph = glyphs.get(char);
    if (!glyph?.d) continue;
    const contours = flattenOutline(glyph.d);
    let y0 = Infinity, y1 = -Infinity;
    for (const c of contours) for (const [, y] of c) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const centerAt = f => {
      const y = y0 + (y1 - y0) * f, xs = [];
      for (const c of contours) for (let i = 0; i < c.length; i++) {
        const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length];
        if ((ay <= y) !== (by <= y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      let best = null;
      for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] < best[1] - best[0]) best = [xs[i], xs[i + 1]];
      return best ? { x: (best[0] + best[1]) / 2, y } : null;
    };
    const a = centerAt(.3), b = centerAt(.7);
    if (!a || !b || b.y === a.y) continue;
    const slant = (b.x - a.x) / (b.y - a.y);
    return Math.abs(slant) < .03 ? 0 : Math.max(-.5, Math.min(.5, slant));
  }
  return 0;
}
// Dấu Xưởng tự dựng (đứng) được nghiêng theo chữ quanh giữa chiều cao của dấu; dấu lấy từ font đã nghiêng sẵn.
const DOT_BELOW = String.fromCharCode(0x323);
const isDrawn = sample => sample?.nativeSize || sample?.source === 'Dựng từ nét chữ';
function leanMark(d, sample, slant, height) {
  if (!slant || !isDrawn(sample)) return d;
  return svgpath(d).translate(0, -height / 2).skewX(Math.atan(slant) * 180 / Math.PI).translate(0, height / 2).toString();
}

export function measureStem(glyphs) {
  for (const char of ['l', 'I', 'i']) {
    const glyph = glyphs.get(char);
    if (!glyph?.d) continue;
    const box = glyphBounds(glyph);
    if (!(box.width > 0 && box.height > 0)) continue;
    const width = stemThickness(glyph.d);
    if (width && box.height / width >= 3) return width;
  }
  return 90;
}
// Các số đo nền của bộ chữ để đặt kích thước dấu theo chuẩn: x-height, chiều cao hoa, độ rộng o và O.
export function measureBody(glyphs) {
  const box = char => { const g = glyphs.get(char); return g?.d ? glyphBounds(g) : null; };
  const top = chars => { for (const c of chars) { const b = box(c); if (b) return b.y + b.height; } };
  const xHeight = top(['x', 'z', 'v', 'u', 'n']) ?? (top(['o']) ?? 520) * .97;
  const capHeight = top(['H', 'I', 'E', 'T']) ?? xHeight / .72;
  const width = chars => { for (const c of chars) { const b = box(c); if (b) return b.width; } };
  const oWidth = width(['o', 'e', 'a', 'u']) ?? .95 * xHeight;
  return { xHeight, capHeight, oWidth, OWidth: width(['O', 'U', 'A']) ?? oWidth * 1.3, contrast: strokeContrast(glyphs), slant: measureSlant(glyphs) };
}

export function deriveMarkSamples(glyphs) {
  // Kích thước theo MARK_STANDARDS (đo từ 20 font đã Việt hóa): cao theo x-height, rộng theo chữ o,
  // độ dày theo nét thân với đường cong của font chuyên nghiệp (font đậm có dấu nhẹ hơn thân).
  const stem = measureStem(glyphs), { xHeight: xH, oWidth: oW, contrast } = measureBody(glyphs);
  // Độ thon theo độ tương phản (đo 20 font): đầu mảnh / đầu dày của sắc ≈ 0.15 + 0.85 × tương phản.
  // Courier 0.98 → 1.0, Segoe 0.82 → 0.83, Times 0.33 → 0.32. Font nét đều cho dấu nét đều, font thanh-đậm cho dấu thon.
  const taper = Math.max(.2, Math.min(1, 1.1 * contrast - .1)), highContrast = contrast < .5;
  const t = STROKE_PER_MEASURED * STD.thickness(stem);
  const H = key => STD.height[key][0] * xH, W = key => STD.width[key][0] * oW;
  const marks = new Map();
  const add = (mark, d) => marks.set(mark, { char: mark, d, advance: 0, source: 'Dựng từ nét chữ', origin: 'inferred',
    nativeSize: true, stem, approved: false, locked: false });

  // Sắc và huyền: nét xiên, đầu trên rộng hơn đầu dưới.
  const acuteH = H('acute');
  let span = .5 * acuteH, slope, wide, narrow;
  for (let k = 0; k < 3; k++) {   // độ rộng tổng (span + đầu rộng) theo chuẩn
    slope = Math.sin(Math.atan2(acuteH, span)); wide = 1.84 / (1 + taper) * t / slope; narrow = taper * wide;
    span = Math.max(.18 * acuteH, W('acute') - wide);
  }
  add('́', polygon([[0, 0], [narrow, 0], [span + wide, acuteH], [span, acuteH]]));
  add('̀', polygon([[span + wide, 0], [span + wide - narrow, 0], [0, acuteH], [wide, acuteH]]));   // ảnh gương của sắc

  // Mũ: chevron đỉnh bằng, nét nhẹ hơn thân và hẹp hơn nguyên âm (skill: kiểm độ rộng theo nguyên âm).
  const capT = .84 * t, capH = Math.max(H('circumflex'), 1.6 * capT), half = Math.max(W('circumflex') / 2, .9 * capH), angle = Math.atan2(capH, half);
  // Font thanh-đậm: chân trái mảnh hơn chân phải (Times 0.78); nét đều: hai chân bằng nhau.
  const leg = capT / Math.sin(angle), notch = capH - capT / Math.cos(angle), flat = .3 * capT, legL = leg * (highContrast ? .78 : 1);
  add('̂', polygon([[-half, 0], [-half + legL, 0], [0, notch], [half - leg, 0], [half, 0], [flat, capH], [-flat, capH]]));

  // Trăng: lưỡi liềm giữa hai cung tròn, đáy đậm nhất, hai đầu thon và cắt ngang bằng nhau, đối xứng.
  // Dùng cung tròn (không phải nửa elip) để mép trong không tự gập thành khấc ở hai đầu.
  const breveT = t, breveHalf = .44 * W('breve'), breveH = Math.max(H('breve'), 1.5 * breveT), breveEnd = (.3 + .55 * taper) * breveT;   // nét đều: hai đầu gần bằng đáy
  const outerR = (breveHalf ** 2 + breveH ** 2) / (2 * breveH);
  const innerHalf = breveHalf - breveEnd, innerH = breveH - breveT, innerR = (innerHalf ** 2 + innerH ** 2) / (2 * innerH);
  const arcPoints = (r, cy, half, steps, reverse) => {
    const end = Math.asin(Math.min(1, half / r)), list = [];
    for (let i = 0; i <= steps; i++) { const a = -end + 2 * end * i / steps; list.push([r * Math.sin(a), cy - r * Math.cos(a)]); }
    return reverse ? list.reverse() : list;
  };
  add('̆', polygon([...arcPoints(outerR, outerR, breveHalf, 40, false), ...arcPoints(innerR, breveT + innerR, innerHalf, 40, true)]));

  // Ngã: sóng một nhịp mềm. Bán kính cong của đường tâm luôn lớn hơn nửa độ dày nét
  // để mép không tự gập thành răng cưa (skill: giữ nhịp uốn và nét sạch).
  const tildeT = .9 * t, waveW = Math.max(W('tilde') - .3 * tildeT, 3 * tildeT), waveSpan = 2.5 * Math.PI;
  const curvature = (waveSpan / waveW) ** 2;
  const amplitude = Math.max(.15 * tildeT, Math.min((H('tilde') - tildeT) / 2, 1 / (curvature * .62 * tildeT)));
  add('̃', strokeAlong(Array.from({ length: 49 }, (_, i) => {
    const phase = -.25 * Math.PI + waveSpan * i / 48;
    return [-waveW / 2 + waveW * i / 48, amplitude * Math.sin(phase)];
  }), s => { const end = highContrast ? .5 : .86; return tildeT * (end + (1 - end) * Math.sin(Math.PI * s)); }));

  // Hỏi: móc gọn, lòng mở, khác dấu chấm hỏi (skill). Đầu móc thon, cung tròn đều, cuối cung uốn mềm về giữa
  // rồi thành chân ngắn thẳng đứng, đầu chân cắt ngang. Nét nhẹ hơn thân chữ.
  // Rộng = cung từ 160° đến 20° (~1.94R) cộng độ dày; cao = chân + uốn + cung.
  const hookT = .8 * t, hookR = Math.max(.75 * hookT, (W('hook') - hookT) / 1.94), hookBendDrop = .25 * hookR;
  const hookTail = Math.max(.2 * hookR, H('hook') - hookR - hookT / 2 - 1.16 * hookR - hookBendDrop);
  const hookC = 1.16 * hookR + hookBendDrop + hookTail;
  const hookArc = Array.from({ length: 25 }, (_, i) => {
    const a = Math.PI * (160 - 220 * i / 24) / 180;
    return [Math.cos(a) * hookR, hookC + Math.sin(a) * hookR];
  });
  // Từ cuối cung (đang đi xuống trái) uốn bằng Bézier bậc hai: điểm điều khiển trên trục giữa, kết thúc ngay dưới nó
  // nên tiếp tuyến liền ở cả hai đầu; sau đó là chân thẳng đứng.
  const [ex, ey] = hookArc.at(-1), control = [0, hookC - 1.16 * hookR], foot = [0, hookTail];
  const hookBend = Array.from({ length: 8 }, (_, i) => {
    const s = (i + 1) / 8, q = 1 - s;
    return [q * q * ex + 2 * q * s * control[0] + s * s * foot[0], q * q * ey + 2 * q * s * control[1] + s * s * foot[1]];
  });
  const hookPath = [...hookArc, ...hookBend, [0, 0]];
  const hookStart = Math.max(.45, Math.min(1, taper * .9));   // đầu móc: nét đều gần bằng thân, thanh-đậm thon nhọn
  add('̉', strokeAlong(hookPath, s => hookT * (hookStart + (1 - hookStart) * Math.min(1, s * 3))));

  // Nặng: dùng đúng dấu chấm của bộ chữ nếu có.
  // Hình dấu nặng: dấu chấm thật của font trước, rồi chấm chữ i, cuối cùng mới tới dấu chấm do Xưởng tự dựng
  // (có thể chỉ là ô vuông thay thế). Không có gì thì dùng chấm tròn.
  const dotOfI = () => {
    const i = glyphs.get('i');
    if (!i?.d) return null;
    const parts = [];
    for (const segment of svgpath(i.d).abs().unshort().unarc().segments) { if (segment[0] === 'M') parts.push([]); parts.at(-1)?.push(segment.join(' ')); }
    const boxes = parts.map(part => { const d = part.join(' '); return { d, box: glyphBounds({ d }) }; }).sort((a, b) => b.box.y - a.box.y);
    return boxes.length >= 2 && boxes[0].box.height < glyphBounds(i).height * .35 ? { d: boxes[0].d } : null;
  };
  const realPeriod = glyphs.get('.')?.d && glyphs.get('.').source !== 'Dựng từ nét chữ' ? glyphs.get('.') : null;
  const period = realPeriod || dotOfI() || (glyphs.get('.')?.d ? glyphs.get('.') : null);
  if (period?.d) {
    // Chuẩn đo: nặng ≈ 0.88 dấu chấm, trong khoảng 0.9–1.75 lần nét thân (kiểu mảnh có dấu chấm to 2–3 lần nét).
    const box = glyphBounds(period), size = Math.max(box.width, box.height), [, lo, hi] = STD.dotBelow.stem;
    const k = Math.min(hi * stem, Math.max(lo * stem, STD.dotBelow.vsPeriod[0] * size)) / size;
    add('̣', svgpath(period.d).translate(-box.x, -box.y).scale(k).round(1).toString());
  }
  else {
    const r = Math.min(STD.dotBelow.stem[2], Math.max(STD.dotBelow.stem[1], STD.dotBelow.stem[0])) * stem / 2;
    add('̣', polygon(Array.from({ length: 32 }, (_, i) => [Math.cos(i * Math.PI / 16) * r, Math.sin(i * Math.PI / 16) * r])));
  }

  // Râu: gốc nằm ngang cắm vào thân, vươn sang phải rồi cong lên; dày gần bằng nét chữ,
  // thon nhẹ về đầu và cắt bằng theo kiểu đầu nét của bộ chữ.
  // Khi ghép, râu được vẽ lại theo độ vươn và độ cao đầu râu chuẩn của từng chữ (o, u, O, U).
  add('̛', hornShape(.09 * oW + .45 * stem, .35 * xH, .9 * stem));
  return { marks, stem, thickness: t };
}

// Râu: gốc nằm ngang cắm vào thân, vươn sang phải rồi cong lên; dày gần bằng nét chữ, thon nhẹ về đầu.
export function hornShape(width, height, thickness) {
  const w = Math.max(.6 * thickness, width - .45 * thickness);
  return strokeAlong(Array.from({ length: 25 }, (_, i) => {
    const s = i / 24;
    return [w * Math.sin(s * Math.PI / 2), height * Math.pow(s, 1.8)];
  }), s => thickness * (1 - .18 * s));
}

// Chiều của contour lớn nhất trong glyph: gạch phải cùng chiều để chỗ chồng lên thân được tô, không bị khoét.
export function outerDirection(d) {
  let best = 0, contour = [];
  const close = () => {
    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const [x0, y0] = contour[i], [x1, y1] = contour[(i + 1) % contour.length];
      area += x0 * y1 - x1 * y0;
    }
    if (Math.abs(area) > Math.abs(best)) best = area;
    contour = [];
  };
  for (const segment of svgpath(d).abs().unarc().segments) {
    if (segment[0] === 'M' && contour.length) close();
    if (segment.length >= 3) contour.push(segment.slice(-2));
  }
  if (contour.length) close();
  return Math.sign(best) || 1;
}

function addBar(glyph, char, center, x0, x1, stem) {
  const half = .39 * stem, offset = Math.max(0, 40 - x0);
  const corners = [[x0, center - half], [x1, center - half], [x1, center + half], [x0, center + half]];
  const bar = polygon(outerDirection(glyph.d) > 0 ? corners : corners.reverse());
  return { char, d: svgpath(glyph.d + ' ' + bar).translate(offset, 0).round(1).toString(),
    advance: Math.max(glyph.advance + offset, Math.ceil(x1 + offset + 40)),
    source: 'Dựng từ nét chữ', origin: 'inferred', approved: false, locked: false, base: glyph.char };
}

export function deriveBarredD(glyphs, stem = measureStem(glyphs)) {
  const result = [];
  const upper = glyphs.get('D'), lower = glyphs.get('d');
  if (upper?.d) {
    const b = glyphBounds(upper);
    result.push(addBar(upper, 'Đ', b.y + b.height * .47, b.x - .55 * stem, b.x + stem + Math.min(b.width * .3, 1.4 * stem), stem));
  }
  if (lower?.d) {
    const b = glyphBounds(lower), o = glyphs.get('o');
    const xHeight = o?.d ? glyphBounds(o).y + glyphBounds(o).height : b.y + b.height * .75;
    const right = b.x + b.width;
    result.push(addBar(lower, 'đ', (xHeight + b.y + b.height) / 2, right - stem - Math.min(b.width * .35, 1.4 * stem), right + .45 * stem, stem));
  }
  return result;
}

// Mép phải thật của các contour tại độ cao y (đơn vị font, trục y hướng lên).
function rightEdgeAt(d, y) {
  let best = null, x0 = 0, y0 = 0, sx = 0, sy = 0;
  const cross = (ax, ay, bx, by) => {
    if ((ay - y) * (by - y) > 0 || ay === by) return;
    const x = ax + (bx - ax) * (y - ay) / (by - ay);
    if (best === null || x > best) best = x;
  };
  for (const [command, ...v] of svgpath(d).abs().unarc().unshort().segments) {
    if (command === 'M') { [x0, y0] = v; sx = x0; sy = y0; continue; }
    const points = [];
    if (command === 'L') points.push(v);
    else if (command === 'H') points.push([v[0], y0]);
    else if (command === 'V') points.push([x0, v[0]]);
    else if (command === 'Z') points.push([sx, sy]);
    else for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t, [ex, ey] = v.slice(-2);
      points.push(command === 'Q'
        ? [u * u * x0 + 2 * u * t * v[0] + t * t * ex, u * u * y0 + 2 * u * t * v[1] + t * t * ey]
        : [u ** 3 * x0 + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t ** 3 * ex, u ** 3 * y0 + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t ** 3 * ey]);
    }
    for (const [x, py] of points) { cross(x0, y0, x, py); x0 = x; y0 = py; }
  }
  return best;
}

// Đảo chiều đa giác dấu nếu ngược chiều contour ngoài của thân, để phần chồng lên thân được tô liền.
export function sameDirection(markD, bodyD) {
  if (outerDirection(markD) === outerDirection(bodyD)) return markD;
  const points = svgpath(markD).abs().segments.filter(([c]) => c === 'M' || c === 'L').map(([, x, y]) => [x, y]);
  return polygon(points.reverse());
}
