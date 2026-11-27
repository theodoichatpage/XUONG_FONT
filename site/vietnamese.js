import svgpath from 'svgpath';
import { glyphBounds } from './glyph-review.js';
import { MARK_STANDARDS as STD, STROKE_PER_MEASURED } from './mark-standards.js';
import { sampleOutline } from './outline-cleanup.js';
import { hornFromLetter, seatHorn, strokeTerminal } from './horn-from-letters.js';

export const core = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
export const lowercase = [...'abcdefghijklmnopqrstuvwxyzđ'];
export const punctuation = [...'.,:;!?-–—()“”‘’/+<>', ...`"'@#$%^&*[]{}_=~\\|`, '₫'];
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
  const ownSize = sample.nativeSize || sample.source === 'Font gốc' || !!sample.fromLetter;   // dấu tách từ chữ có dấu trong ảnh: giữ cỡ người dùng vẽ
  const standalone = ownSize ? source.height : STD.height[key][0] * body.xHeight * (isCapital ? STD.capHeightRatio : 1);
  // Đỉnh cả cụm không vượt mức font chuyên nghiệp dùng: chữ hoa 1.0 em, chữ thường 0.9 em.
  // Vượt thì thu dấu thanh (tối đa còn 65%), rồi hạ dấu sát mũ/trăng hơn (tối đa 25% chiều cao mũ).
  const limit = 1000 * (isCapital ? STD.stackTop.cap[2] : .9);
  let y = mark.y + rule.bottom * mark.height + (rule.lift || 0) * body.xHeight;
  let k = standalone * rule.scale / source.height;
  // Dấu thanh đặt trên mũ/trăng (ngã trên mũ, mọi dấu trên trăng): font chuyên nghiệp không hạ đáy dấu thanh xuống dưới
  // 1.04 chiều cao mũ (tier_Ẫ.bottom 1.04–1.39), mà thu nhỏ dấu thanh thêm (tối đa còn 50%) để vừa dòng.
  const above = rule.bottom >= .95, floor = above ? mark.y + Math.max(rule.bottom, 1.04) * mark.height : y - .25 * mark.height;
  if (above) y = Math.max(y, floor);
  if (y + source.height * k > limit) k = Math.max(k * (above ? .5 : .65), (limit - y) / source.height);
  if (y + source.height * k > limit) y = Math.max(floor, limit - source.height * k);
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
// Chữ có thể do Xưởng ghép khi font đã Việt hóa rồi mở lại (nhãn Font gốc): khối U+1EA0–1EF9 và ơ ư Ơ Ư. Chữ Latin có
// dấu khác (á à ã â ă ê…) là nét nhà thiết kế, giữ nguyên (mark-standards.md, Dấu font đã có).
export const mayBeXuongMade = char => { const code = char.codePointAt(0); return code >= 0x1EA0 && code <= 0x1EF9 || 'ơưƠƯ'.includes(char); };
function designerMark(glyphs, mark, capital, cache) {
  const key = mark + (capital ? 'C' : 'c');
  if (cache.has(key)) return cache.get(key);
  let found;
  if (mark !== '̛') {
    const donors = [];
    for (const glyph of glyphs.values()) {
      if (glyph.source !== 'Font gốc' || !glyph.d || !glyph.char) continue;
      const code = glyph.char.codePointAt(0);
      if (mayBeXuongMade(glyph.char)) continue;
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
  // i không có chấm (font toàn chữ hoa như Bebas: ô i là hình I): dùng nguyên chữ làm thân.
  if (contours.length === 1) return glyph;
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
  const body = measureBody(glyphs), bodyStem = measureStem(glyphs), capMarks = new Map(), made = new Map();
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
    // Font dựng từ ảnh: chỉ ghép bằng dấu của chính font — dấu tách từ ảnh, dấu của font gốc, hoặc dấu Xưởng dựng từ nét
    // của chính font (Dựng từ nét chữ). Không dùng hình dấu mặc định (khi chưa có dấu mẫu nào).
    if (requireReferenceMarks && marks.some(mark=>{const sample=glyphs.get(mark);return !sample?.d || !(sample.origin==='direct'||sample.manualEdit||['Ảnh mẫu','Ảnh làm sạch','Font gốc','Dựng từ nét chữ'].includes(sample.source));})) continue;   // dấu mẫu sửa tay trong Font Lab cũng là dấu của chính font
    // Hai tầng dấu (ấ ầ ẩ ẫ, ắ ằ ẳ ẵ và chữ hoa): xếp theo cách đo được ở 20 font đã Việt hóa,
    // giữ nguyên mũ/trăng như ở â/ă, dấu thanh lệch cạnh mũ thay vì chồng thẳng lên trên.
    const tone = marks.find(mark => TWO_TIER[mark]);
    if (structural && tone && marks.filter(mark => mark !== structural).length === 1) {
      const tier = glyphs.get(structuredChar)?.d && (useStructured || !made.has(structuredChar)) ? glyphs.get(structuredChar) : made.get(structuredChar);
      const plainRoot = glyphs.get(root);
      const isCapital = root !== root.toLowerCase() || body.allCaps;
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
    const isCap = root !== root.toLowerCase() || body.allCaps;
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
          if (mark === '\u031b') {
            // Skill (design-rules.md, mark-standards.md "Râu ơ ư"): râu nối vào thân ở vùng trên bên phải o/u. Tìm mép phải
            // thật của nét tại độ cao nối (o cong vào trong, U có chân serif nên không dùng khung chữ nhật), cắm gốc râu vào
            // trong nét để liền khối; chân râu nằm gọn trong thân (mép trên chân không cao hơn đỉnh thân); độ vươn phải và
            // độ cao đầu râu theo chuẩn đo. Áp cho mọi râu: râu Xưởng dựng từ nét và râu mẫu lấy từ ảnh/bảng dấu/font gốc
            // (râu mẫu giữ hình người vẽ, chỉ co giãn đều cho khớp chuẩn). Không dùng cỡ cố định (lỗi cũ: râu ảnh cao 130,
            // lùi 12% vào giữa thân U nên mọc từ giữa nét, đè ngang chân serif).
            const stem = sample.stem || bodyStem || bounds.width * .2, inset = .45 * stem;
            // Mép phải lấy lớn nhất trong dải từ độ cao nối tới đỉnh thân: U có chân serif thì râu mọc từ đầu chân serif
            // (như Times), không mọc từ giữa nét dưới chân serif rồi vắt ngang qua nó. o cong vào trong nên mép lớn nhất
            // nằm ở đáy dải, giữ như cũ.
            const { edge, edgeY } = topRightEdge(original.d, bounds, root, stem);
            const attachY = Math.min(edgeY, bodyTop - .5 * stem);
            const key = 'oOuU'.includes(root) ? root : /[oO]/u.test(root) ? 'o' : 'u';
            const reach = STD.horn.reach[key] * bounds.width, tip = STD.horn.tip[key] * body.xHeight;
            const right = bounds.x + bounds.width, rsb = original.advance - right;
            let placedHorn;
            // caseStrict: râu sửa tay trong Font Lab chỉ dùng cho cùng cỡ chữ (râu Ơ không gắn sang ư thường).
            const own = sample.byRoot && (sample.byRoot[root] || [...(isCap ? 'UO' : 'uo')].map(r => sample.byRoot[r]).find(Boolean)
              || (!sample.caseStrict && Object.values(sample.byRoot)[0]));
            if (own) {
              // Râu người dùng vẽ trong chữ ư/ơ của ảnh: giữ nguyên hình và cỡ (cùng tỉ lệ ảnh với thân chữ), đặt cùng
              // khoảng so với mép phải vùng trên và đỉnh thân như trong ảnh. Không co giãn theo chuẩn chung.
              const hb = glyphBounds({ d: own.d });
              placedHorn = seatHorn(original.d, svgpath(own.d).translate(edge + own.anchor.dx - hb.x, bodyTop + own.anchor.dy - hb.y).round(1).toString(), stem);
            } else if (sample.nativeSize) {
              // Đầu râu theo nét của chính font (hornEnds); dấu mẫu cũ chưa có thông tin thì đo lại.
              const ends = sample.hornEnd?.v === HORN_END_VERSION ? sample.hornEnd : hornEnds(glyphs, stem, Math.max(.2, Math.min(1, 1.1 * body.contrast - .1)));
              const ballUp = ends.ball ? .7 * ends.ball.height : 0;
              // Độ vươn tính từ mép phải thân; chữ viết có nét nối chìa sang phải (u, o của Segoe Script) thì khung chữ rộng
              // hơn thân nhiều: râu không vươn quá 0.45 độ rộng chữ tính từ chỗ nối.
              let hw = Math.min(right + reach - (edge - inset), .45 * bounds.width + inset), hh = Math.max(.6 * stem, bodyTop + tip - attachY - ballUp);
              let footX = edge - inset, footY = attachY;
              if (ends.terminal === 'blade') {
                // Râu đầu vát (font chân vát sắc như Migra; người dùng 25/11/2026 đối chiếu font mẫu): ư và ơ dùng CÙNG một
                // nét râu (Ư Ơ cũng vậy), chỉ khác chỗ gắn — không đo độ vươn từ khung chữ (khung u gồm cả đuôi chân phải
                // nên râu ư dài hơn râu ơ). Chân râu ở mép phải nét ngay dưới đỉnh thân; đầu râu cao hơn đỉnh thân
                // 0.24 x-height (hoa 0.17, trong khoảng chuẩn cả ơ và ư); râu xiên dốc: ngang = 0.6 × cao.
                // Chân râu ở mép phải xa nhất của vùng trên (quy tắc Chỗ nối râu: vai phải của o, mép thân u). o cong vào
                // trong nên chân râu ơ thấp hơn một chút, nhưng đầu râu cùng độ cao và cùng chiều ngang với ư.
                const rise = (isCap ? .17 : .24) * body.xHeight, bite = Math.min(inset, .25 * stem);
                footY = Math.min(edgeY, bodyTop - .6 * stem);
                footX = edge - bite;
                hh = bodyTop + rise - footY;
                hw = .6 * (rise + .6 * stem) + bite;
              }
              const lean = d => body.slant ? svgpath(d).skewX(Math.atan(body.slant) * 180 / Math.PI).toString() : d;
              const shape = hornShape(hw, hh, .9 * stem, ends.round, ends.endRatio, ends.footRatio ?? 1, ends);
              let horn = sameDirection(lean(shape), original.d);
              if (ends.ball) {
                // Giọt nước lấy nguyên từ đầu tay r. Ở r giọt nước rủ xuống cuối tay ngang; râu vươn lên nên lật dọc cho
                // bầu giọt ở trên: cổ giọt chồng lên đầu râu, đỉnh giọt chạm độ cao đầu râu chuẩn.
                const [tx, ty] = hornTip(hw, hh, .9 * stem, ends.round, ends.endRatio);
                const drop = svgpath(ends.ball.d).scale(1, -1).translate(tx, ty + .2 * ends.ball.height).toString();
                horn += ' ' + sameDirection(lean(drop), original.d);
              }
              placedHorn = svgpath(horn).translate(footX, footY).round(1).toString();
            } else {
              // Râu mẫu (nét người vẽ, bề dày tùy hình): đáy chân râu ngay dưới chỗ có mép phải xa nhất (đầu chân serif của U,
              // vai phải của o) để chân chồng lên nét; mép trái cắm vào nét một đoạn inset. Co giãn cho đầu râu đúng độ cao chuẩn
              // và mép phải đúng độ vươn chuẩn (lỗi cũ: râu mảnh treo dưới chân serif, rời thân).
              const foot = edgeY - .15 * stem, left = edge - inset;
              // Co theo chiều cao và độ vươn chuẩn; tỉ lệ ngang/dọc lệch nhau không quá 1.6 lần để giữ hình người vẽ.
              const ky = (bodyTop + tip - foot) / source.height, kx = Math.min(1.6 * ky, Math.max(ky / 1.6, (right + reach - left) / source.width));
              placedHorn = svgpath(sample.d).translate(-source.x, -source.y).scale(kx, ky).translate(left, foot).round(1).toString();
            }
            paths.push(placedHorn);
            // Râu lấn sang lề phải như font chuyên nghiệp; chỉ cộng một phần nhỏ của đoạn chìa ra (đo cả độ nghiêng).
            const hornBox = glyphBounds({ d: placedHorn }), hornRight = hornBox.x + hornBox.width;
            // Giới hạn phần lấn: lề phải mới không âm quá 0.15 độ rộng chữ so với lề gốc (tránh râu đâm vào N, n kế bên);
            // chữ nghiêng cho lấn thêm theo độ nghiêng vì chữ kế bên cũng nghiêng tránh ra (Italic: ~0.25).
            const limit = hornRight + Math.min(rsb, 0) - (.15 + .5 * Math.abs(body.slant)) * bounds.width;
            advance = Math.max(advance, Math.round(original.advance + STD.horn.advance[key] * Math.max(0, hornRight - right)), Math.ceil(limit));
            continue;
          }
          if (sample.nativeSize && mark !== '\u0323') { stack.push({ mark, sample, source }); continue; }
          const targetHeight = mark === '\u0309' ? 122 : mark === '\u0323' ? 80 : 95;
          const ownSize = sample.nativeSize || sample.source === 'Font gốc' || !!sample.fromLetter;   // dấu lấy từ chính font, kể cả dấu tách từ chữ có dấu trong ảnh: giữ cỡ gốc
          // Nặng không rộng quá khoảng font chuẩn dùng so với chữ mang dấu (ọ ≤ 0.38, Ọ ≤ 0.267 độ rộng chữ):
          // chữ hẹp (font mono, Black) sẽ có nặng nhỏ lại thay vì to bằng dấu chấm.
          const dotLimit = mark === '̣' ? (isCap ? .26 : .36) * bounds.width / source.width : Infinity;
          // Nhưng nặng không nhỏ hơn 0.9 nét thân (chuẩn đo: 0.9–1.75): chữ hẹp đậm (UTM Bebas Bold) giới hạn theo độ rộng
          // làm chấm nhỏ hơn cả nét chữ.
          const dotMin = mark === '̣' && bodyStem ? .9 * bodyStem / Math.max(source.width, source.height) : 0;
          const scale = Math.max(dotMin, Math.min(ownSize ? 1 : targetHeight / source.height, bounds.width * 1.2 / source.width, dotLimit));
          const height = source.height * scale;
          if (mark === '\u0323') y = bounds.y - gapBelow - height;
          else top += height + gapUpper;
          // Skill design-rules.md, hàng "Nặng": canh theo khối thân; với y (chữ có đuôi xuống), xem lại vị trí ngang để
          // tránh đuôi, không ép tâm hình học. Đặt chấm cùng độ sâu như chữ không đuôi (dưới đường chân), rồi dời ngang
          // ra khỏi đuôi đủ khoảng hở dấu–thân, nhưng vẫn nằm dưới khung chữ.
          if (mark === '\u0323' && bounds.y < -.1 * body.xHeight) {
            const w = source.width * scale;
            const level = ['u', 'v', 'o'].map(c => glyphs.get(c)).find(g => g?.d);   // đáy chữ không đuôi (có vượt dòng)
            y = (level ? Math.min(0, glyphBounds(level).y) : 0) - gapBelow - height;
            const right = inkRightIn(plain.d, y - gapBelow, y + height + gapBelow);
            if (right !== null) x = Math.min(bounds.x + bounds.width - w / 2, Math.max(x, right + gapBelow + w / 2));
          }
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
// Trục nét: hướng nét ở chỗ mảnh nhất của o (đo như strokeContrast). Bút nét thanh-đậm vẽ mảnh khi đi theo hướng này,
// đậm khi đi vuông góc; dấu dựng từ nét (hỏi, ngã) theo đúng trục đó (mark-standards.md, Kiểu đầu nét: góc nét của
// chính font). Trả về góc (radian, trục y lên) hoặc null khi không đo được.
export function strokeAxis(glyphs) {
  const glyph = glyphs.get('o') || glyphs.get('O');
  if (!glyph?.d) return null;
  const contours = flattenOutline(glyph.d).filter(c => c.length >= 3);
  const area = c => c.reduce((sum, p, i) => { const q = c[(i + 1) % c.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  const [outer, inner] = [...contours].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  if (!outer || !inner) return null;
  const distance = p => {
    let d = Infinity;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i], b = outer[(i + 1) % outer.length], dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    return d;
  };
  // Làm mượt theo vài điểm lân cận để mẩu gấp khúc của viền không quyết định hướng.
  const widths = inner.map(distance), n = inner.length;
  let best = 0, bestValue = Infinity;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) sum += widths[(i + k + n) % n];
    if (sum < bestValue) { bestValue = sum; best = i; }
  }
  const a = inner[(best - 3 + n) % n], b = inner[(best + 3) % n];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
export function strokeContrast(glyphs) {
  // Độ tương phản = bề dày mảnh nhất / dày nhất của nét o, đo theo pháp tuyến của nét (khoảng cách từ mỗi điểm viền
  // trong tới viền ngoài), không chỉ cắt dọc/ngang ở giữa: font có trục nét nghiêng (Migra, chỗ mảnh nhất ở góc ~−57°)
  // cắt ở giữa sẽ đo nhầm thành nét đều (Migra Extralight 0.99, đúng là 0.29). Kết quả khớp bảng chuẩn: Times 0.32,
  // Arial 0.80, Segoe 0.82, Courier 0.98, Palatino 0.32.
  const glyph = glyphs.get('o') || glyphs.get('O');
  if (!glyph?.d) return .8;
  const contours = flattenOutline(glyph.d).filter(c => c.length >= 3);
  const area = c => c.reduce((sum, p, i) => { const q = c[(i + 1) % c.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  const [outer, inner] = [...contours].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  if (!outer || !inner) return .8;
  const segment = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  let thin = Infinity, thick = 0;
  for (const p of inner) {
    let d = Infinity;
    for (let i = 0; i < outer.length; i++) d = Math.min(d, segment(p, outer[i], outer[(i + 1) % outer.length]));
    thin = Math.min(thin, d); thick = Math.max(thick, d);
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
// Mép phải của nét chữ trong dải ngang [y0, y1] (cắt từng cạnh outline theo dải), null nếu dải trống.
function inkRightIn(d, y0, y1) {
  let right = null;
  const take = value => { right = right === null ? value : Math.max(right, value); };
  try {
    for (const contour of sampleOutline(d, .5)) for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      const lo = Math.max(y0, Math.min(a[1], b[1])), hi = Math.min(y1, Math.max(a[1], b[1]));
      if (lo > hi) continue;
      if (a[1] === b[1]) { take(Math.max(a[0], b[0])); continue; }
      for (const yy of [lo, hi]) take(a[0] + (b[0] - a[0]) * (yy - a[1]) / (b[1] - a[1]));
    }
  } catch { return null; }
  return right;
}
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
// Kiểu đầu nét: đo đầu trên và chân thân l (hoặc i). Đầu tròn: ở độ sâu 0.15 bề dày tính từ đỉnh, mặt cắt chỉ còn ~0.7 bề dày;
// đầu cắt phẳng (Poppins, Arial...) hoặc có chân serif: ≥ 0.85. Râu dựng theo đúng kiểu này.
export function roundTerminals(glyphs) {
  for (const char of ['l', 'i']) {
    const glyph = glyphs.get(char);
    if (!glyph?.d) continue;
    const contours = flattenOutline(glyph.d).map(c => ({ c, top: Math.max(...c.map(p => p[1])), bottom: Math.min(...c.map(p => p[1])) }))
      .sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom));
    const { c, top, bottom } = contours[0] || {};
    if (!c) continue;
    const widthAt = y => {
      const xs = [];
      for (let i = 0; i < c.length; i++) { const [ax, ay] = c[i], [bx, by] = c[(i + 1) % c.length]; if ((ay <= y) !== (by <= y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax)); }
      xs.sort((a, b) => a - b);
      return xs.length >= 2 ? xs.at(-1) - xs[0] : 0;
    };
    const mid = widthAt((top + bottom) / 2);
    if (!(mid > 0)) continue;
    // Chỉ đo được khi l là một nét đơn: cách đầu một bề dày, mặt cắt vẫn gần bằng giữa thân. Chữ viết có l là vòng nét,
    // nét vuốt nhọn dần thì mặt cắt lệch xa: không coi là đầu tròn (lỗi cũ: font viết tay đầu nhọn bị râu bo tròn).
    const simple = [top - mid, bottom + mid].every(y => { const w = widthAt(y) / mid; return w > .8 && w < 1.25; });
    // Cả đầu trên và chân thân đều tròn mới coi là font đầu tròn (đầu xiên của serif chỉ nhỏ ở đầu trên, chân có serif rộng).
    return simple && widthAt(top - .15 * mid) / mid < .85 && widthAt(bottom + .15 * mid) / mid < .85
      && widthAt(top - .5 * mid) / mid > .85 && widthAt(bottom + .5 * mid) / mid > .85;
  }
  return false;
}

export function measureBody(glyphs) {
  const box = char => { const g = glyphs.get(char); return g?.d ? glyphBounds(g) : null; };
  const top = chars => { for (const c of chars) { const b = box(c); if (b) return b.y + b.height; } };
  const rawX = top(['x', 'z', 'v', 'u', 'n']) ?? (top(['o']) ?? 520) * .97;
  const capHeight = top(['H', 'I', 'E', 'T']) ?? rawX / .72;
  // Font toàn chữ hoa (Bebas...): ô chữ thường là hình chữ hoa. Cỡ dấu tính theo x-height quy đổi (chữ hoa ≈ 1.4 x-height
  // ở font chuẩn), nếu không dấu to gấp 1.4 lần; và mọi chữ dùng luật dấu chữ hoa (đối chiếu quy tắc phát hiện).
  const allCaps = rawX / capHeight > .9, xHeight = allCaps ? capHeight / 1.4 : rawX;
  const width = chars => { for (const c of chars) { const b = box(c); if (b) return b.width; } };
  const oWidth = width(['o', 'e', 'a', 'u']) ?? .95 * xHeight;
  return { allCaps, xHeight, capHeight, oWidth, OWidth: width(['O', 'U', 'A']) ?? oWidth * 1.3, contrast: strokeContrast(glyphs), slant: measureSlant(glyphs), roundEnds: roundTerminals(glyphs) };
}

export function deriveMarkSamples(glyphs) {
  // Kích thước theo MARK_STANDARDS (đo từ 20 font đã Việt hóa): cao theo x-height, rộng theo chữ o,
  // độ dày theo nét thân với đường cong của font chuyên nghiệp (font đậm có dấu nhẹ hơn thân).
  const stem = measureStem(glyphs), { xHeight: xH, oWidth: oW, contrast } = measureBody(glyphs);
  // Độ thon theo độ tương phản (đo 20 font): đầu mảnh / đầu dày của sắc ≈ 0.15 + 0.85 × tương phản.
  // Courier 0.98 → 1.0, Segoe 0.82 → 0.83, Times 0.33 → 0.32. Font nét đều cho dấu nét đều, font thanh-đậm cho dấu thon.
  const taper = Math.max(.2, Math.min(1, 1.1 * contrast - .1)), highContrast = contrast < .5;
  const t = STROKE_PER_MEASURED * STD.thickness(stem);
  // Nét cong của dấu (hỏi, ngã) dày mỏng theo trục nét của chính font như chữ e s g o: đi theo hướng mảnh nhất của o
  // thì bằng nét mảnh (tương phản × nét đậm), vuông góc thì bằng nét đậm. Font nét đều (tương phản ~1) giữ nét đều.
  // Lỗi cũ (27/11/2026, Migra): hỏi chỉ thon ở đầu móc, còn lại dày đều nên lạc kiểu giữa chữ thanh-đậm.
  const axis = strokeAxis(glyphs);
  const pen = (points, thick, floor = .12) => {
    const thin = Math.max(floor, contrast) * thick;
    const raw = points.map((point, i) => {
      if (axis == null || contrast > .9) return thick;
      const a = points[Math.max(0, i - 2)], b = points[Math.min(points.length - 1, i + 2)];
      return thin + (thick - thin) * Math.abs(Math.sin(Math.atan2(b[1] - a[1], b[0] - a[0]) - axis));
    });
    // Dày mỏng đổi dần như nét bút, không đổi gấp giữa hai điểm (đổi gấp làm viền khấc ở chỗ uốn).
    const reach = Math.max(1, Math.round(points.length / 8));
    const smooth = raw.map((_, i) => {
      let sum = 0, count = 0;
      for (let k = -reach; k <= reach; k++) { const j = i + k; if (j < 0 || j >= raw.length) continue; sum += raw[j]; count++; }
      return sum / count;
    });
    // Chỗ đậm nhất vẫn bằng nét đậm của dấu (làm mượt không được làm dấu nhẹ đi), chỗ mảnh không dưới nét mảnh.
    const low = Math.min(...smooth), high = Math.max(...smooth);
    return smooth.map(w => high - low < 1e-6 ? thick : thin + (thick - thin) * (w - low) / (high - low));
  };
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
  const wave = Array.from({ length: 49 }, (_, i) => {
    const phase = -.25 * Math.PI + waveSpan * i / 48;
    return [-waveW / 2 + waveW * i / 48, amplitude * Math.sin(phase)];
  });
  // Ngã font thanh-đậm: hai đầu mảnh 0.54–0.74 giữa (bảng trên), nên trục nét chỉ đổi dày mỏng vừa phải (sàn 0.6).
  const tildePen = highContrast ? pen(wave, 1.1 * tildeT, .6) : null;
  add('̃', strokeAlong(wave, s => { const end = highContrast ? .5 : .86, ends = end + (1 - end) * Math.sin(Math.PI * s);
    return tildePen ? Math.min(tildePen[Math.round(s * 48)], 1.1 * tildeT * ends) : tildeT * ends; }));

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
  // Thanh-đậm: dày mỏng theo trục nét (đầu móc đi lên theo hướng mảnh, lưng phải đi xuống đậm như lưng s, g),
  // đầu móc vuốt về nét mảnh của font.
  const hookPen = highContrast ? pen(hookPath, hookT) : null;
  add('̉', strokeAlong(hookPath, s => hookPen
    ? hookPen[Math.round(s * (hookPath.length - 1))] * (hookStart + (1 - hookStart) * Math.min(1, s * 4))
    : hookT * (hookStart + (1 - hookStart) * Math.min(1, s * 3))));

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
  // Đầu râu và độ thon theo nét của chính font (mark-standards.md, Kiểu đầu nét): đầu tay chữ r là giọt nước thì gắn
  // đúng giọt nước đó vào đầu râu; vuốt nhọn thì râu thon nhọn; đầu tròn (đo ở l, nét đơn) thì bo tròn; còn lại cắt bằng.
  // Độ thon theo độ tương phản như sắc/huyền: font thanh-đậm có râu thon dần, font nét đều có râu gần đều.
  const ends = hornEnds(glyphs, stem, taper);
  add('̛', hornShape(.09 * oW + .45 * stem, .35 * xH, .9 * stem, ends.round, ends.endRatio, ends.footRatio ?? 1, ends));
  marks.get('̛').hornEnd = ends;
  return { marks, stem, thickness: t };
}

// Phiên bản cách đo đầu râu. Dấu mẫu lưu trong dự án mang kết quả đo cũ (khác phiên bản) thì đo lại khi ghép,
// để Hoàn thiện cũng dựng râu theo quy tắc mới (lỗi 25/11/2026: râu Migra vẫn dài theo trung vị vì dấu mẫu cũ).
export const HORN_END_VERSION = 2;

// Râu: gốc nằm ngang cắm vào thân, vươn sang phải rồi cong lên; dày gần bằng nét chữ, thon nhẹ về đầu.
// Kiểu đầu râu theo nét của chính font. Thứ tự: đầu tay r (giọt nước / vuốt nhọn / thường) → đầu tròn đo ở l (nét đơn).
export function hornEnds(glyphs, stem, taper) {
  return { ...measureHornEnds(glyphs, stem, taper), v: HORN_END_VERSION };
}

function measureHornEnds(glyphs, stem, taper) {
  const term = strokeTerminal(glyphs, stem, topRightEdge);
  const round = !term?.ball && term?.terminal !== 'taper' && roundTerminals(glyphs);
  // Tay r kết thúc bằng mũi vát sắc (Migra): râu đầu trên đậm, chân thanh — chân mảnh bằng nét mảnh của font (theo độ
  // tương phản), dày dần tới đầu bằng nét đậm, đầu cắt vát chéo (cut: mép trong dừng sớm hơn mép ngoài) như đầu nét vát
  // của chính font. Không vuốt nhọn đầu (người dùng 25/11/2026: "nhọn hoắt ... là vector trẻ con vẽ"), không bo tròn.
  if (term?.terminal === 'taper') return { terminal: 'blade', round: false, footRatio: Math.max(.25, taper), endRatio: 1, cut: .08, ball: null };
  // Đầu râu / chân râu: thanh-đậm theo độ thon sắc/huyền (≥ 0.35); nét thường 0.82 như râu font chuẩn.
  const endRatio = taper < .6 ? Math.max(.35, taper) : .82;
  return { terminal: term?.terminal || (round ? 'round' : 'plain'), round, footRatio: 1, endRatio, ball: term?.ball || null };
}

// Tâm đầu râu (điểm cuối đường tâm) của hornShape cùng tham số: chỗ gắn giọt nước.
export function hornTip(width, height, thickness, round = false, endRatio = .82) {
  const end = thickness * endRatio;
  return [Math.max(.6 * thickness, width - .45 * thickness), Math.max(.3 * height, height - (round ? end / 2 : 0))];
}

export function hornShape(width, height, thickness, round = false, endRatio = .82, footRatio = 1, { peak = 0, cut = 0 } = {}) {
  // Đường tâm râu: đi ngang ra rồi cong lên, tới đầu thì dựng đứng. Đầu râu theo kiểu đầu nét của bộ chữ:
  // font đầu vuông (Poppins, Arial, Segoe...) cắt phẳng ngang như râu font chuyên nghiệp; font đầu tròn thì bo tròn.
  // Đỉnh ngoài của đầu râu chạm đúng chiều cao yêu cầu, nên chữ đậm (nét dày) có đường tâm thấp hơn tương ứng.
  const end = thickness * endRatio, w = Math.max(.6 * thickness, width - .45 * thickness);
  const h = Math.max(.3 * height, height - (round ? end / 2 : 0));
  // Râu đầu vát (cut): nét xiên dốc lên phải, uốn chữ S nhẹ (ra – dựng – ra) như nét vuốt của font, không chạy ngang
  // rồi mới cong lên. Còn lại: đi ngang ra rồi cong lên, tới đầu thì dựng đứng.
  const sweep = Math.PI / 2;
  const points = Array.from({ length: 25 }, (_, i) => { const s = i / 24;
    return cut ? [w * (s + .05 * Math.sin(2 * Math.PI * s)), h * s] : [w * Math.sin(s * sweep) / Math.sin(sweep), h * Math.pow(s, 1.8)]; });
  const left = [], right = [];
  points.forEach((point, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    // Nét móc (peak > 0): chân mảnh → dày nhất ở peak → thu về endRatio ở đầu. Còn lại: đổi đều từ chân tới đầu.
    const s = i / 24, ratio = peak ? (s < peak ? footRatio + (1 - footRatio) * Math.sin(s / peak * Math.PI / 2)
      : 1 + (endRatio - 1) * Math.pow((s - peak) / (1 - peak), 1.3))
      : footRatio + (endRatio - footRatio) * Math.pow(s, footRatio < 1 && !cut ? 1.4 : 1);
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1, half = thickness * ratio / 2;
    left.push([point[0] - dy / length * half, point[1] + dx / length * half]);
    right.push([point[0] + dy / length * half, point[1] - dx / length * half]);
  });
  const cap = [];
  if (round) {
    const [ex, ey] = points.at(-1), [px, py] = points.at(-2), angle = Math.atan2(ey - py, ex - px);
    for (let k = 1; k < 12; k++) { const t = angle + Math.PI / 2 - k * Math.PI / 12; cap.push([ex + Math.cos(t) * end / 2, ey + Math.sin(t) * end / 2]); }
  }
  // Cạnh vát xiên: mép trong (phía thân chữ) dừng sớm hơn một đoạn cut, mép ngoài chạm đỉnh → mũi nhọn sắc.
  if (cut) left.splice(left.length - Math.max(1, Math.round(cut * 24)));
  return polygon([...left, ...cap, ...right.reverse()]);
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
// Mép phải xa nhất của phần trên chữ gốc o/u (chỗ nối râu): từ độ cao nối (0.8 chiều cao với o, 0.9 với u, và thấp
// hơn đỉnh ít nhất nửa nét) tới đỉnh thân. U có chân serif thì là đầu chân serif.
export function topRightEdge(d, bounds, root, stem) {
  const bodyTop = bounds.y + bounds.height;
  const low = Math.min(bounds.y + bounds.height * (/[oO]/u.test(root) ? .8 : .9), bodyTop - .5 * stem);
  let edge = null, edgeY = low;
  for (let n = 0; n <= 12; n++) {
    const y = low + (bodyTop - 2 - low) * n / 12, x = rightEdgeAt(d, y);
    if (x !== null && (edge === null || x > edge + 1)) { edge = x; edgeY = y; }
  }
  // Chữ viết tay: nét trái của u cao hơn nét phải, dải trên chỉ có nét trái nên mép tìm được nằm ở nửa trái. Dò thấp
  // xuống (tới nửa chiều cao) để nối râu vào nét phải, không kéo râu ngang qua cả chữ.
  if (edge !== null && edge < bounds.x + .55 * bounds.width) {
    for (let n = 0; n <= 16; n++) {
      const y = bodyTop - 2 - (bodyTop - 2 - (bounds.y + bounds.height * .5)) * n / 16, x = rightEdgeAt(d, y);
      if (x !== null && x > bounds.x + .55 * bounds.width) { edge = x; edgeY = Math.min(y, bodyTop - .5 * stem); break; }
    }
  }
  return { edge: edge ?? bounds.x + bounds.width, edgeY };
}

export function rightEdgeAt(d, y) {
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

// Dấu mẫu lấy từ chính chữ có dấu đã tách từ ảnh (người dùng vẽ, ví dụ hỏi ở ẩ/ỏ, mũ ở ê): tách phần dấu (contour nằm hẳn
// trên đỉnh hoặc dưới chân chữ gốc cùng ảnh) làm mẫu để ghép các chữ còn thiếu, thay cho dấu Xưởng dựng. Ưu tiên chữ
// chỉ có một dấu, chữ gốc a o e u i y. Trả về Map dấu → mẫu (chưa ghi vào bộ chữ).
export function marksFromImageLetters(glyphs) {
  const fromImage = g => g?.d && (g.origin === 'direct' || g.source === 'Ảnh mẫu' || g.source === 'Ảnh làm sạch');
  const rank = char => { const i = 'aoeuiynAOEUIYN'.indexOf(char.normalize('NFD')[0]); return i < 0 ? 99 : i; };
  const out = new Map();
  for (const mark of toneSamples.keys()) {
    if (mark === '\u031b') {
      // Râu liền thân: tách bằng cách trừ chữ gốc cùng ảnh (horn-from-letters.js). Mỗi chữ gốc giữ râu riêng (ư cho u,
      // Ư cho U...), để ghép chữ còn thiếu bằng râu cùng kiểu chữ trước.
      let stem = 0; try { stem = measureStem(glyphs) || 0; } catch { /* chưa đo được */ }
      const byRoot = {};
      for (const [root, horned] of [['u', 'ư'], ['o', 'ơ'], ['U', 'Ư'], ['O', 'Ơ']]) {
        if (!fromImage(glyphs.get(horned)) || !glyphs.get(root)?.d) continue;
        const horn = hornFromLetter(glyphs.get(horned), glyphs.get(root), stem, topRightEdge);
        if (horn) byRoot[root] = horn;
      }
      const first = Object.entries(byRoot)[0];
      if (first) out.set(mark, { char: mark, d: first[1].d, advance: 0, source: 'Ảnh mẫu', origin: 'direct', fromLetter: { u: 'ư', o: 'ơ', U: 'Ư', O: 'Ơ' }[first[0]],
        byRoot, approved: false, locked: false });
      continue;
    }
    const donors = [...glyphs.values()].filter(g => {
      if (!fromImage(g) || [...g.char].length !== 1) return false;
      const [root, ...marks] = g.char.normalize('NFD');
      return marks.length === 1 && marks[0] === mark && glyphs.get(root)?.d;
    }).sort((a, b) => rank(a.char) - rank(b.char));
    for (const donor of donors) {
      const root = glyphs.get(donor.char.normalize('NFD')[0]), rootBox = glyphBounds(root);
      const contours = [];
      for (const segment of svgpath(donor.d).abs().unshort().unarc().segments) { if (segment[0] === 'M') contours.push([]); contours.at(-1)?.push(segment.join(' ')); }
      // Chữ gốc i có chấm, chữ có dấu thanh thì không: so theo đỉnh thân thật (bỏ chấm i).
      const bodyTop = root.char === 'i' ? rootBox.y + rootBox.height * .7 : rootBox.y + rootBox.height;
      const parts = contours.map(c => c.join(' ')).filter(d => {
        const box = glyphBounds({ d });
        return mark === '\u0323' ? box.y + box.height < rootBox.y + 2 : box.y >= bodyTop - 8 && box.height < rootBox.height * .6;
      });
      if (!parts.length) continue;
      out.set(mark, { char: mark, d: parts.join(' '), advance: donor.advance, source: 'Ảnh mẫu', origin: 'direct', fromLetter: donor.char, approved: false, locked: false });
      break;
    }
  }
  return out;
}
