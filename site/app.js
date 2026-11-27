import svgpath from 'svgpath';
import { xuongFontFile } from './font-rename.js';
import { ask } from './ask.js';
import { auditMarks, auditMessage } from './rule-audit.js';
import {setupOutlineCleanup} from './outline-cleanup-ui.js';
import { setupFontLab } from './font-lab.js';
import {cleanOutline,fromImage,sampleOutline} from './outline-cleanup.js';
import { normalizeHeights, normalizePunctuation, normalizeDotBelow } from './font-heights.js';
import { placePunctuation as placePunctuationIn } from './punctuation-rules.js';
import { checkRules, ruleMessage, fixRules } from './rule-check.js';
const placePunctuation = (glyph, map = glyphs) => placePunctuationIn(glyph, map);
import { outlineDefects } from './outline-quality.js';
import {traceDetectedWords,splitReferenceWord} from './direct-reconstruction.js';
import { assessFont, makeQualitySVG, qualityProofs } from './font-quality.js';
import { digestReference, readableStyle } from './family-inputs.js';
import { familyStyles } from './family-styles.js';
import { setupFamilyWorkspace } from './family-workspace.js';
import { createFontCheckPanel } from './font-check-panel.js';
import { reviewMarkRepairs } from './ai-mark-repair.js';
import { adjustGlyphMarks, autoFixMarks } from './mark-spacing.js';
import { importFontFile, importAccentSamples } from './font-import.js';
import { setupFontCollection, getFontRecord } from './font-collection.js';
import { segmentImage, makeGlyph, exportFont, MAX_SIDE } from './engine.js';
import { borrowMissing,restoreBorrowedCorners } from './borrow-glyphs.js';
import { deriveSymbols } from './derive-symbols.js';
import { deriveLetters } from './derive-letters.js';
import { redrawFontImage } from './ai-design.js';
import { measureSlant, core, lowercase, punctuation, charset, toneSamples, composeVietnamese, applyReferenceMarks, applyCompactLowercaseHorns, deriveMarkSamples, deriveBarredD, measureStem, marksFromImageLetters, strokeContrast, topRightEdge } from './vietnamese.js';
import { strokeTerminal, hornFromLetter, apartFrom } from './horn-from-letters.js';
import { referenceCanvas, wordInk, splitCleanWord, splitWordByGaps, traceSymbol, pixelBox, expandWordBox, inkBox, inkCrossesBox, completeTildeO, alignReferenceGlyphs } from './reference-image.js';
import { loadReferences, saveReferences } from './reference-storage.js';
import { glyphBounds, prepareGlyphReview } from './glyph-review.js';
import { balanceGlyphSpacing, fitLowercaseT, fitLowercaseQ, fitLowercaseUStems, fontKerning, vietnameseKerning, measureLeftStem, matchLeftStem, balanceFontStrokes } from './font-layout.js';

const { UPM, ASCENT, DESCENT } = require('../src/metrics');

const $ = id => document.getElementById(id);
const canvas = $('image');
const ctx = canvas.getContext('2d');
const storageKey = 'xuong-font-project-v1';
class ProtectedGlyphMap extends Map {
  set(char,glyph){if(this.get(char)?.locked&&this.get(char)!==glyph)return this;return super.set(char,glyph);}
  delete(char){return this.get(char)?.locked?false:super.delete(char);}
  clear(){for(const [char,glyph]of this)if(!glyph.locked)super.delete(char);}
}
let glyphs = new ProtectedGlyphMap();
// Dựng lại cả bộ chữ từ một bản nháp (Map thường): chữ đã khóa (sửa tay trong Font Lab, đã duyệt) giữ nguyên, không bị
// bản nháp ghép đè. Chỉ dùng khi bản nháp dựng từ bộ chữ đang làm; mở font khác thì tạo ProtectedGlyphMap mới như cũ.
function keepLocked(next) {
  for (const [char, glyph] of glyphs) if (glyph.locked) Map.prototype.set.call(next, char, glyph);
  return new ProtectedGlyphMap(next);
}
let markCandidates = [], lastMarkChange = [], auditRepairPending = false;
let importedMetrics;
let loadedSourceBlob;
let source;
let crop;
let dragStart;
let selected;
let fontFace;
let downloadURL;
let currentFontExport;
let repairRecheckPending = false;
let revision = 0;
let loadingRevision = 0;
const references = [];
let legacyReview = [];
let designRun;
let inventory;
let activeReference = -1;
let loading = false;
let busy = false;
let debounce;
let restoring = true;
let storageRevision = 0;

function persistReferences(withImages = false) {
  if (restoring || (!references.length && !withImages)) return;
  rememberReference();
  withImages ||= referenceImagesNeedSave;
  const turn = ++storageRevision;
  const indicator = $('reference-storage');
  indicator.textContent = 'Đang lưu ảnh và phần duyệt…';
  const state = {
    activeReference,
    settings: references.map(entry => entry.settings),
    review: legacyReview, inventory
  };
  saveReferences(state, withImages ? references.map(entry => entry.file) : undefined)
    .then(() => {
      if (withImages) referenceImagesNeedSave = false;
      if (turn === storageRevision && !referenceImagesNeedSave) indicator.textContent = `Đã lưu ${references.length} ảnh trên trình duyệt này.`;
    })
    .catch(() => {
      // A later metadata write cannot confirm a failed image write.
      if (withImages) referenceImagesNeedSave = true;
      if (turn === storageRevision || withImages) {
        indicator.textContent = 'Không lưu được ảnh và phần duyệt. Hãy giữ tab này mở.';
      }
    });
}

let referenceImagesNeedSave = false;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved) {
    glyphs = new ProtectedGlyphMap(saved.glyphs.filter(glyph => !['AI suy đoán', 'AI theo ảnh'].includes(glyph.source))
      .map(glyph => [glyph.char, glyph]));
    for (const [char, glyph] of glyphs) {
      if (glyph.source === 'Ghép dấu' && !glyphs.has(glyph.base ?? char.normalize('NFD')[0])) glyphs.delete(char);
    }
    importedMetrics = saved.importedMetrics;
    $('name').value = saved.name;
    const previousDefaults=['Đường về quê hương đẹp tựa bức tranh thủy mặc, gió thổi nhẹ qua hàng tre xanh.','HÀO KHÍ LAM SƠN','Sử Việt Kiêu Hùng · Tiếng Việt 123','Tiếng Việt · Trường học · Nguyễn Hữu Đạt · ă â ê ô ơ ư đ'];
    $('sample').value = typeof saved.sample==='string'&&!previousDefaults.includes(saved.sample.trim())?saved.sample:$('sample').defaultValue;
    if (saved.spacing != null) $('spacing').value = saved.spacing;
    // Never overwrite the only saved project during restoration: keep its original payload for recovery.
    if (glyphs.size < saved.glyphs.length) status('Một số glyph đã bị lọc khi khôi phục. Bản lưu gốc được giữ nguyên; hãy mở Bộ sưu tập Font hoặc nhập lại TTF đã xuất.');
  }
} catch {
  // A project can still be used when local storage is unavailable.
}

function status(message) { $('status').textContent = message; }

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      glyphs: [...glyphs.values()], name: $('name').value,
      sample: $('sample').value, spacing: $('spacing').value, importedMetrics
    }));
  } catch {
    status('Trình duyệt không lưu được bộ chữ. Hãy tải font trước khi đóng trang.');
  }
}

function selection() {
  return crop ?? { x: 0, y: 0, w: canvas.width, h: canvas.height };
}

function selectedImage() {
  const { x, y, w, h } = selection();
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const off = offscreen.getContext('2d');
  off.putImageData(source, -x, -y);
  return off.getImageData(0, 0, w, h);
}

function segmentation() {
  return segmentImage(selectedImage(), Number($('threshold').value), $('polarity').value);
}

function renderSource() {
  if (!source) return;
  ctx.putImageData(source, 0, 0);
  const { x, y, w, h } = selection();
  if ($('mask').checked) {
    try {
      const { ink } = segmentation();
      const mask = new ImageData(w, h);
      mask.data.fill(255);
      for (let i = 0; i < ink.length; i++) {
        if (ink[i]) mask.data.fill(0, i * 4, i * 4 + 3);
      }
      ctx.putImageData(mask, x, y);
    } catch (error) { status(error.message); }
  }
  if (crop) {
    ctx.lineWidth = Math.max(2, canvas.width / 250);
    ctx.strokeStyle = '#dc5c4f';
    ctx.strokeRect(x, y, w, h);
  }
}

function useImage(image, name) {
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  ctx.fillStyle = $('polarity').value === 'light' ? '#000' : '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  crop = undefined;
  $('stage').hidden = false;
  $('filename').textContent = name;
  status('Khoanh vùng chữ hoặc dùng cả ảnh, rồi nhập chữ theo thứ tự đọc.');
  renderSource();
}

function renderReferences() {
  $('references').hidden = references.length === 0;
  const select = $('reference');
  select.replaceChildren(...references.map(({ file, settings }, index) =>
    new Option((settings?.used ? '✓ ' : '') + file.name, index)
  ));
  select.value = String(activeReference);
  $('reference-count').textContent = activeReference >= 0
    ? `${activeReference + 1}/${references.length}` : `${references.length} ảnh`;
  select.disabled = busy || loading;
  $('remove-reference').hidden = activeReference < 0;
  $('remove-reference').disabled = busy || loading;
  const state = connectionRequest ? 'loading' : connectedGeminiModel ? 'ready' : 'idle';
  $('gemini-badge').dataset.state = state;
  $('gemini-badge-label').textContent = 'Gemini: ' + (state === 'ready' ? 'Đã kết nối' : state === 'loading' ? 'Đang kiểm tra' : 'Chưa kết nối');
  const localReady = localLayoutReady();
  $('ai-scan').disabled = busy || loading || !references.length || (!localReady && (!connectedGeminiModel || !!connectionRequest));
  $('auto-draw').disabled = busy || loading;
  $('layout-text').disabled = $('layout-style').disabled = busy || loading;
  $('ai-scan-help').textContent = localReady
    ? 'Mọi ảnh đã có nội dung chữ: Xưởng dựng trên máy, không cần Gemini.'
    : connectedGeminiModel
      ? 'Thêm ảnh có các ký tự bạn muốn đưa vào bộ font. Gõ nội dung chữ dưới ảnh để dựng không cần Gemini.'
      : 'Gõ nội dung chữ dưới mỗi ảnh để dựng không cần Gemini, hoặc kết nối Gemini để AI đọc ảnh.';
  $('previous-reference').disabled = busy || loading || activeReference <= 0;
  $('next-reference').disabled = busy || loading || activeReference + 1 >= references.length;
}

// Ô nội dung trống nhưng bộ font đã có nội dung gõ trước đó cho đúng ảnh này: điền lại.
async function restoreLayoutText(index) {
  try {
    const entry = references[index];
    const stored = entry && await familyWorkspace.storedLayout(entry.file);
    if (!stored?.text || activeReference !== index || $('layout-text').value.trim()) return;
    $('layout-text').value = stored.text;
    if (stored.style) $('layout-style').value = stored.style;
    rememberReference(); renderReferences(); persistReferences();
  } catch { /* Không có dự án: giữ ô trống. */ }
}

// Ảnh đang mở đọc nội dung từ ô nhập; các ảnh khác dùng nội dung đã lưu.
function localLayoutReady() {
  return references.length > 0 && references.every((entry, index) =>
    (index === activeReference ? $('layout-text').value : entry.settings?.layoutText || '').trim());
}

// Lỗi khi dựng mà còn ảnh chưa gõ nội dung chữ: mở ảnh đó và tô đỏ ô cần gõ (cách dựng không cần Gemini).
function markMissingLayoutText() {
  const index = references.findIndex((entry, i) =>
    !(i === activeReference ? $('layout-text').value : entry.settings?.layoutText || '').trim());
  if (index < 0) return;
  if (index !== activeReference) showReference(index);
  const box = $('layout-text');
  box.classList.add('needs-text');
  box.placeholder = 'Gõ đúng các ký tự trong ảnh "' + references[index].file.name + '", ví dụ: !@#$%^&*?{}';
  box.scrollIntoView({ block: 'center' });
  box.focus();
}

function rememberReference() {
  const entry = references[activeReference];
  if (!entry) return;
  entry.settings = {
    crop, chars: $('chars').value, polarity: $('polarity').value,
    threshold: $('threshold').value, used: entry.settings?.used ?? false,
    detectedWords: entry.settings?.detectedWords,
    layoutText: $('layout-text').value, layoutStyle: $('layout-style').value
  };
}

async function showReference(index) {
  const entry = references[index];
  if (!entry || busy || index === activeReference) return;
  rememberReference();
  const request = ++loadingRevision;
  loading = true;
  renderReferences();
  try {
    const image = await createImageBitmap(entry.file);
    try {
      if (request !== loadingRevision) return;
      const settings = entry.settings;
      $('polarity').value = settings?.polarity ?? 'adaptive';
      setThreshold();
      if (settings) {
        $('threshold').value = settings.threshold;
        $('threshold-value').value = settings.threshold;
      }
      $('chars').value = settings?.chars ?? '';
      $('layout-text').value = settings?.layoutText ?? '';
      $('layout-style').value = settings?.layoutStyle || 'Regular';
      activeReference = index;
      if (!$('layout-text').value.trim()) void restoreLayoutText(index);
      useImage(image, entry.file.name);
      crop = settings?.crop;
      renderSource();
    } finally { image.close(); }
  } catch {
    if (request === loadingRevision) status('Không mở được ảnh “' + entry.file.name + '”. Hãy chọn một ảnh khác trong danh sách.');
  } finally {
    if (request === loadingRevision) {
      loading = false;
      renderReferences();
      persistReferences();
    }
  }
}

async function removeActiveReference() {
  if (busy || loading || restoring || activeReference < 0) return;
  const index = activeReference;
  const [removed] = references.splice(index, 1);
  inventory = undefined;
  if (!removed) return;
  activeReference = -1;
  source = crop = undefined;
  $('stage').hidden = true;
  $('filename').textContent = 'PNG, JPG, WebP';
  $('chars').value = '';
  legacyReview = legacyReview.filter(group => group.index !== index)
    .map(group => ({ ...group, index: group.index > index ? group.index - 1 : group.index }));
  $('ai-scan-report').hidden = true;
  for (const glyph of glyphs.values()) {
    if (glyph.reference?.index === index) delete glyph.reference;
    else if (glyph.reference?.index > index) glyph.reference.index--;
  }
  save();
  renderReferences();
  persistReferences(true);
  if (references.length) await showReference(Math.min(index, references.length - 1));
  status('Đã bỏ ảnh “' + removed.file.name + '” khỏi danh sách.');
}

$('remove-reference').addEventListener('click', removeActiveReference);

function addFiles(files) {
  if (restoring) return status('Đang khôi phục ảnh. Hãy thử lại sau khi hoàn tất.');
  if (busy) return;
  const images = [...files].filter(file => /\.(png|jpe?g|webp)$/i.test(file.name)
    || ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
  if (!images.length) return status('Hãy chọn ảnh PNG, JPG hoặc WebP.');
  const firstNew = references.length;
  references.push(...images.map(file => ({ file })));
  inventory = undefined;
  $('ai-scan-report').hidden = true;
  refresh();
  persistReferences(true);
  showReference(firstNew);
}

const viewer = $('image-viewer');
const viewerImage = $('viewer-image');
let zoom = 1;
let zoomWidth = 0;
let reviewGlyph;
let reviewProof;
let reviewRequest;
let reviewVersion = 0;
let retraceSource;
let retraceCandidate;
const outlineCleanup=setupOutlineCleanup({getGlyph:()=>reviewGlyph,prepareGlyph:async glyph=>glyph.borrowedFrom&&glyph.borrowedJoin!=='miter-v1'?(restoreBorrowedCorners(glyph,glyph.borrowedOriginal?[]:await familyWorkspace.projectStyles({...importedMetrics,requireMatch:true}))||glyph):glyph,commit:async(previous,next)=>{
  if(previous.locked||glyphs.get(previous.char)!==previous)throw Error('Chữ đã khóa hoặc đã đổi. Đóng rồi mở lại ký tự để chỉnh.');
  const state={glyphs:[...glyphs.values()].map(g=>g===previous?next:g),name:$('name').value,sample:$('sample').value,spacing:$('spacing').value,importedMetrics};
  const priorState=localStorage.getItem(storageKey);
  localStorage.setItem(storageKey,JSON.stringify(state));
  // Bản trong dự án Family khác bản đang mở (ví dụ vừa Tạo dấu tiếng Việt): không ghi đè Family, nhưng vẫn lưu chữ đã nắn trong bộ chữ đang mở.
  try{await familyWorkspace.saveOutlineEdit(previous,next,importedMetrics);}catch{/* giữ thay đổi trong bộ chữ đang mở */}
  glyphs.set(next.char,next);reviewGlyph=next;refresh();
  const width=Math.max(1,next.advance),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="270" height="320" viewBox="-30 -1025 ${width+60} 1290"><rect x="-30" y="-1025" width="${width+60}" height="1290" fill="#fffaf1"/><path transform="scale(1 -1)" d="${next.d}" fill="#592f29"/></svg>`;
  viewerImage.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  retraceCandidate=undefined;$('accept-retrace').hidden=$('cancel-retrace').hidden=true;
  reviewProof=undefined;$('ai-proof').hidden=true;$('ai-review-run').disabled=true;
}});

// Font Lab (nháy đúp ô chữ): chữ sửa tay được khóa để Tạo dấu, Hoàn thiện và các bước dựng tự động không ghi đè.
// Bảng chữ chặn ghi đè chữ khóa, nên ở đây ghi thẳng vào Map (chỉ khi người dùng tự lưu hoặc mở khóa trong Font Lab).
async function commitLabEdit(previous, next) {
  // Font Lab là hộp thoại chặn: người dùng không đổi được chữ này ở chỗ khác lúc đang mở. Bản trong bộ chữ khác bản
  // Font Lab giữ (bước chạy nền thay object, hay lần lưu trước lỗi giữa chừng) thì nét sửa tay vẫn thắng, không chặn
  // lưu (lỗi cũ: báo "Chữ đã đổi trong lúc chỉnh" ở mọi lần bấm, tải lại trang thì mất hết nét đã sửa).
  const current = glyphs.get(previous.char);
  if (current && current !== previous) {
    if (current.d !== previous.d) console.warn('Font Lab: ' + previous.char + ' đổi nét trong lúc chỉnh; giữ nét sửa tay.');
    previous = current;
  }
  const state = { glyphs: [...glyphs.values()].map(g => g === previous ? next : g), name: $('name').value, sample: $('sample').value, spacing: $('spacing').value, importedMetrics };
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { throw Error('Trình duyệt hết chỗ lưu bộ chữ nên chưa lưu được ' + next.char + '. Bấm "Lưu font đang làm" trong Bộ sưu tập để giữ font, rồi thử lại.'); }
  try { await familyWorkspace.saveOutlineEdit(previous, next, importedMetrics); } catch { /* giữ thay đổi trong bộ chữ đang mở */ }
  Map.prototype.set.call(glyphs, next.char, next);
  recentGlyphs.add(next.char);
  // Chữ đã ghi xong ở trên: lỗi khi ghép lại các chữ liên quan không được làm hỏng lần lưu (lỗi cũ: Font Lab giữ
  // bản trước khi lưu, bấm Lưu lần nữa thì báo "Chữ đã đổi trong lúc chỉnh" và không lưu được).
  let spread = [];
  if (next.locked) {
    try { spread = spreadLabEdit(next.char, previous); }
    catch (error) { console.error(error); spread = Object.assign([], { error: error?.message || String(error) }); }
  }
  refresh();
  return spread;
}
// Sửa tay một chữ gốc hay dấu mẫu (ơ, â, o, dấu sắc…) thì các chữ Xưởng ghép từ nó (ớ ờ ở ỡ ợ, ấ ầ…) ghép lại ngay theo
// nét vừa lưu, rồi sửa theo bảng quy tắc như mọi bước dựng. Chữ của nhà thiết kế (Font gốc, ảnh) và chữ đã khóa giữ nguyên.
function spreadLabEdit(char, previous) {
  const key = char.normalize('NFD'), isMark = toneSamples.has(char), HORN = '̛';
  const free = c => (!glyphs.get(c) || glyphs.get(c).source === 'Ghép dấu') && !glyphs.get(c)?.locked;
  const related = new Set(charset.filter(c => c !== char && (isMark ? c.normalize('NFD').includes(char) : c.normalize('NFD').startsWith(key)) && free(c)));
  // Sửa râu ở ơ/ư/Ơ/Ư: tách râu vừa vẽ làm râu mẫu chung cho cả bốn chữ (skill: ư ơ cùng một nét râu), rồi ghép lại
  // mọi chữ có râu dùng râu mẫu đó.
  const [root, ...marks] = key;
  const before = new Map([[char, previous]]);
  const horn = marks.length === 1 && marks[0] === HORN && 'oOuU'.includes(root) && !glyphs.get(HORN)?.locked
    ? hornFromLetter(glyphs.get(char), glyphs.get(root), measureStem(glyphs), topRightEdge) : null;
  if (horn) {
    // Một nét râu dùng chung cho ơ ư Ơ Ư (người dùng 26/11/2026: chữ thường dùng chung râu với Ơ hoa). Chữ có râu đã
    // sửa tay riêng giữ râu của nó.
    const sample = glyphs.get(HORN), byRoot = { ...(sample?.byRoot || {}), [root]: horn };
    for (const other of 'oOuU') {
      const horned = (other + HORN).normalize('NFC');
      if (other === root || glyphs.get(horned)?.manualEdit) continue;
      byRoot[other] = horn; before.set(horned, glyphs.get(horned));
    }
    glyphs.set(HORN, { ...(sample || {}), char: HORN, d: horn.d, advance: 0, source: 'Ảnh mẫu', origin: 'direct', fromLetter: char, byRoot, caseStrict: true, approved: false, locked: false });
    for (const c of charset) { const nfd = c.normalize('NFD'); if (c !== char && nfd.includes(HORN) && byRoot[nfd[0]] === horn && free(c)) related.add(c); }
  }
  // Sửa dấu thanh ngay trên một chữ (ỏ, ả, ở, Ấ...): tách dấu vừa vẽ (contour không chạm khung contour nào của chữ gốc)
  // làm dấu mẫu, rồi ghép lại mọi chữ mang dấu đó. Dùng khi ô Dấu mẫu trống hoặc khó sửa.
  const tone = marks.at(-1), toneBase = tone && tone !== HORN && toneSamples.has(tone) ? glyphs.get((root + marks.slice(0, -1).join('')).normalize('NFC')) : null;
  if (toneBase?.d && !glyphs.get(tone)?.locked) {
    // Dấu vừa vẽ: contour nằm ngoài thân chữ gốc (so diện tích chồng, không so khung bao: chữ nghiêng có khung chồng nhau).
    const drawn = apartFrom(glyphs.get(char).d, toneBase.d, { outer: true });
    if (drawn.length) {
      const sample = glyphs.get(tone);
      glyphs.set(tone, { ...(sample || {}), char: tone, d: drawn.join(' '), advance: sample?.advance || 0, source: 'Ảnh mẫu', origin: 'direct', fromLetter: char,
        nativeSize: undefined, approved: true, locked: true, manualEdit: { time: new Date().toISOString(), fromLetter: char } });
      for (const c of charset) if (c !== char && c.normalize('NFD').includes(tone) && free(c)) related.add(c);
    }
  }
  if (!related.size) return [];
  const made = composeVietnamese(glyphs, c => related.has(c), { requireReferenceMarks: [...glyphs.values()].some(g => g.origin === 'direct') }).filter(g => related.has(g.char));
  for (const glyph of made) glyphs.set(glyph.char, glyph);
  // Chữ ghép không dựng lại được (dấu thanh mẫu không thuộc nguồn được dùng để ghép, ví dụ dấu hỏi của ở, ử): giữ nguyên
  // dấu thanh đang có, chỉ thay phần thân và râu bằng chữ gốc mới (ơ, ư...). Dấu là những contour không chạm khung contour
  // nào của chữ gốc cũ hay mới.
  const done = new Set(made.map(g => g.char));
  for (const c of related) {
    if (done.has(c)) continue;
    const baseChar = [...before.keys()].find(b => c.normalize('NFD').startsWith(b.normalize('NFD')));
    const old = before.get(baseChar), fresh = glyphs.get(baseChar), current = glyphs.get(c);
    if (!old?.d || !fresh?.d || !current?.d || current.d.startsWith(fresh.d)) continue;
    // Dấu thanh: nằm ngoài cả chữ có râu cũ lẫn mới, và rời thân o/u (râu cũ khác hình râu mới vẫn cắm vào thân).
    const body = glyphs.get(c.normalize('NFD')[0])?.d;
    const tone = apartFrom(current.d, old.d + ' ' + fresh.d, { outer: true }).filter(part => !body || apartFrom(part, body, { share: .02 }).length);
    if (!tone.length) continue;
    glyphs.set(c, { ...current, d: fresh.d + ' ' + tone.join(' '), advance: fresh.advance, version: (current.version || 0) + 1, proof: undefined });
    done.add(c);
  }
  if (done.size) enforceRules([...done]);
  return [...done];
}
const fontLab = setupFontLab({
  getGlyph: char => glyphs.get(char),
  commit: commitLabEdit,
  unlock: async glyph => { const next = { ...glyph, locked: false, approved: false, version: (glyph.version || 0) + 1 }; await commitLabEdit(glyph, next); return next; },
  recompose: char => composeVietnamese(glyphs, c => c === char, { requireReferenceMarks: [...glyphs.values()].some(g => g.origin === 'direct') }).find(g => g.char === char)?.d,
  // Số đo của chính font cho đường kẻ quy tắc dấu và phép đối chiếu hòa hợp (không dùng số của font khác).
  metrics: () => {
    const box = char => { const g = glyphs.get(char); if (!g?.d) return null; const b = glyphBounds(g); return b.width > 0 ? { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height } : null; };
    const top = char => box(char) && Math.round(box(char).y1), width = char => box(char) && box(char).x1 - box(char).x0;
    const stem = measureStem(glyphs);
    let terminal = null;
    try { terminal = strokeTerminal(glyphs, stem, topRightEdge)?.terminal ?? null; } catch { /* thiếu r hoặc i */ }
    return { ascent: importedMetrics?.ascent ?? ASCENT, descent: importedMetrics?.descent ?? DESCENT, capH: top('H'), xH: top('x'),
      o: width('o'), O: width('O'), stem, contrast: strokeContrast(glyphs), terminal, period: box('.') && Math.max(width('.'), box('.').y1 - box('.').y0),
      overshoot: box('o')?.y0 ?? 0, overshootUpper: box('O')?.y0 ?? 0, glyphBox: box };
  },
  label: char => toneSamples.get(char) ?? char,
  onStatus: status
});


function showGlyphProof(proof) {
  reviewProof = proof;
  $('ai-reference').src = proof.reference;
  $('ai-rendered').src = proof.rendered;
  $('ai-overlay').src = proof.overlay;
  $('ai-proof').hidden = false;
  $('ai-review-run').disabled = false;
}

function resetGlyphReview(glyph) {
  $('gemini-key-home').append($('gemini-key-field'));
  reviewVersion++;
  reviewRequest?.abort();
  reviewRequest = undefined;
  reviewGlyph = glyph;
  outlineCleanup.reset();
  reviewProof = retraceSource = retraceCandidate = undefined;
  $('retrace-actions').hidden = true;
  $('retrace-glyph').disabled = false;
  $('accept-retrace').hidden = $('cancel-retrace').hidden = true;
  $('retrace-status').textContent = '';
  $('viewer-scroll').hidden = false;
  $('ai-review').hidden = true;
  $('ai-proof').hidden = true;
  $('ai-review-open').hidden = !glyph;
  $('ai-review-run').disabled = true;
  $('ai-review-status').textContent = '';
  $('ai-review-findings').replaceChildren();
  $('ai-review-action').textContent = '';
}

function proofForSource(image, box, glyph) {
  const rect = { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h };
  const measured = inkBox(wordInk(image, rect), rect);
  return prepareGlyphReview(image, measured ?? box, glyph);
}

async function openGlyphReview() {
  if (!reviewGlyph) return;
  outlineCleanup.reset();
  $('viewer-scroll').hidden = true;
  $('ai-review').hidden = false;
  $('gemini-key-review').append($('gemini-key-field'));
  $('ai-reference-note').textContent = 'Đang chuẩn bị ảnh đối chiếu…';
  const glyph = reviewGlyph;
  const turn = reviewVersion;
  try {
    let image;
    let box;
    let label;
    let origin;
    if (source && crop) {
      image = document.createElement('canvas');
      image.width = source.width;
      image.height = source.height;
      image.getContext('2d').putImageData(source, 0, 0);
      box = crop;
      if (activeReference >= 0) origin = { index: activeReference, crop: { ...crop } };
      label = 'Đang dùng vùng khoanh trên ảnh đang mở.';
    } else if (glyph.reference && references[glyph.reference.index]) {
      const entry = references[glyph.reference.index];
      image = await referenceCanvas(entry.file, glyph.reference.crop);
      box = { x: 0, y: 0, w: image.width, h: image.height };
      origin = glyph.reference;
      label = 'Đang dùng vùng ảnh đã lưu khi lấy nét.';
    }
    if (turn !== reviewVersion) return;
    if (!image) {
      $('ai-reference-note').textContent = 'Hãy đóng cửa sổ này, khoanh sát một chữ trên ảnh mẫu rồi mở lại ký tự để đối chiếu.';
      return;
    }
    retraceSource = { image, box, origin };
    showGlyphProof(proofForSource(image, box, glyph));
    $('retrace-actions').hidden = false;
    $('ai-reference-note').textContent = label + ' Hai hình được căn theo phần có nét, bỏ khoảng nền trống. Hãy xác nhận ảnh gốc chỉ chứa chữ ' + glyph.char + '.';
    $('ai-review-run').disabled = false;
  } catch (error) {
    if (turn === reviewVersion) $('ai-reference-note').textContent = error.message;
  }
}

$('retrace-glyph').addEventListener('click', async () => {
  if (!reviewGlyph || !retraceSource || reviewRequest) return;
  const turn = reviewVersion;
  const { image, box, origin } = retraceSource;
  const char = reviewGlyph.char;
  const bounds = { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h };
  $('retrace-glyph').disabled = true;
  try {
    const glyph = await traceSymbol(wordInk(image, bounds), bounds, char);
    if (turn !== reviewVersion) return;
    if (origin) glyph.reference = { index: origin.index, crop: {
      ...glyph.pixelCrop,
      x: origin.crop.x + glyph.pixelCrop.x - box.x, y: origin.crop.y + glyph.pixelCrop.y - box.y
    } };
    retraceCandidate = glyph;
    showGlyphProof(proofForSource(image, box, glyph));
    $('accept-retrace').hidden = $('cancel-retrace').hidden = false;
    $('retrace-status').textContent = 'Đang xem nét mới. So sánh với ảnh gốc trước khi thay.';
  } catch (error) {
    if (turn === reviewVersion) $('retrace-status').textContent = error.message;
  } finally {
    if (turn === reviewVersion) $('retrace-glyph').disabled = false;
  }
});
$('accept-retrace').addEventListener('click', () => {
  if (!retraceCandidate) return;
  glyphs.set(retraceCandidate.char, retraceCandidate);
  reviewGlyph = retraceCandidate;
  retraceCandidate = undefined;
  $('accept-retrace').hidden = $('cancel-retrace').hidden = true;
  $('retrace-status').textContent = 'Đã cập nhật nét cho chữ ' + reviewGlyph.char + '.';
  updateComposed();
  refresh();
});
$('cancel-retrace').addEventListener('click', () => {
  retraceCandidate = undefined;
  $('accept-retrace').hidden = $('cancel-retrace').hidden = true;
  $('retrace-status').textContent = 'Đang xem nét cũ.';
  showGlyphProof(proofForSource(retraceSource.image, retraceSource.box, reviewGlyph));
});

async function runGlyphReview() {
  if (!reviewProof || !reviewGlyph || reviewRequest) return;
  const key = $('gemini-key').value.trim();
  if (!key || !connectedGeminiModel || connectionRequest) {
    $('ai-review-status').textContent = 'Nhập khóa rồi bấm Kiểm tra kết nối trước.';
    $('gemini-key').focus();
    return;
  }
  const request = new AbortController();
  reviewRequest = request;
  $('ai-review-run').disabled = true;
  $('ai-review-status').textContent = 'Đang đối chiếu với Gemini…';
  $('ai-review-findings').replaceChildren();
  $('ai-review-action').textContent = '';
  try {
    const response = await fetch('/api/glyph-review', {
      method: 'POST', signal: request.signal,
      headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
      body: JSON.stringify({ preferredModel: connectedGeminiModel, char: reviewGlyph.char, reference: reviewProof.reference.split(',')[1], rendered: reviewProof.rendered.split(',')[1] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (reviewRequest !== request) return;
    const labels = { close: 'Hình dáng gần mẫu', needs_retrace: 'Cần lấy nét lại', unclear: 'Chưa đủ rõ để kết luận' };
    $('ai-review-status').textContent = labels[data.verdict];
    for (const detail of data.findings) {
      const item = document.createElement('li');
      item.textContent = detail;
      $('ai-review-findings').append(item);
    }
    $('ai-review-action').textContent = data.action;
  } catch (error) {
    if (reviewRequest === request) $('ai-review-status').textContent = error.message || 'Chưa kết nối được với Gemini.';
  } finally {
    if (reviewRequest === request) {
      reviewRequest = undefined;
      $('ai-review-run').disabled = false;
    }
  }
}

const geminiKey = $('gemini-key');
const rememberGemini = $('gemini-remember');
const geminiStorageKey = 'xuong-font-gemini-v1';
const connectionButton = $('gemini-check');
const connectionStatus = $('gemini-connection');
let connectionRequest;
let connectedGeminiModel;

function saveGeminiPreference({ clearKey = false } = {}) {
  try {
    const key = geminiKey.value.trim();
    const previous = JSON.parse(localStorage.getItem(geminiStorageKey) ?? 'null');
    // Keep an already saved key through a temporary connection failure, with verification reset.
    const canStore = rememberGemini.checked && !clearKey && key
      && (connectedGeminiModel || previous?.key === key);
    localStorage.setItem(geminiStorageKey, JSON.stringify({
      remember: rememberGemini.checked,
      ...(canStore ? { key, model: connectedGeminiModel ?? null } : {})
    }));
    return true;
  } catch { return false; }
}

function restoreGeminiPreference() {
  try {
    const saved = JSON.parse(localStorage.getItem(geminiStorageKey) ?? 'null');
    if (!saved) return;
    rememberGemini.checked = saved.remember === true;
    if (!rememberGemini.checked || typeof saved.key !== 'string' || !saved.key.trim()) return;
    geminiKey.value = saved.key;
    connectedGeminiModel = typeof saved.model === 'string' && saved.model ? saved.model : undefined;
    connectionStatus.textContent = connectedGeminiModel
      ? 'Đã khôi phục khóa đã xác nhận. Bạn có thể dùng AI đọc ảnh và dựng chữ.'
      : 'Đã điền khóa đã lưu. Bấm Kiểm tra kết nối để bật AI.';
  } catch {
    connectionStatus.textContent = 'Không đọc được khóa đã lưu trên trình duyệt này.';
  }
}

function resetConnection() {
  connectionRequest?.abort();
  connectionRequest = undefined;
  connectedGeminiModel = undefined;
  connectionButton.disabled = !geminiKey.value.trim();
  connectionStatus.textContent = '';
  saveGeminiPreference({ clearKey: true });
  renderReferences();
}

async function checkGeminiConnection() {
  const key = geminiKey.value.trim();
  if (!key || connectionRequest || busy) return;
  connectedGeminiModel = undefined;
  saveGeminiPreference();
  const request = new AbortController();
  connectionRequest = request;
  connectionButton.disabled = true;
  connectionStatus.textContent = 'Đang kiểm tra Gemini…';
  renderReferences();
  try {
    const response = await fetch('/api/glyph-review', {
      method: 'POST',
      signal: request.signal,
      headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
      body: JSON.stringify({ check: true })
    });
    const data = await response.json();
    if (!response.ok || data.connected !== true) throw new Error(data.error ?? 'Gemini chưa xác nhận kết nối.');
    if (connectionRequest === request) {
      connectedGeminiModel = data.model;
      const saved = saveGeminiPreference();
      if (saved) $('gemini-settings').open = false;
      connectionStatus.textContent = 'Đã kết nối Gemini (' + data.model + ').'
        + (rememberGemini.checked ? saved ? ' Đã lưu khóa trên trình duyệt này.' : ' Trình duyệt không lưu được khóa.' : ' Khóa dùng trong tab này.');
    }
  } catch (error) {
    if (connectionRequest === request) connectionStatus.textContent = error.message || 'Chưa kết nối được với Gemini.';
  } finally {
    if (connectionRequest === request) {
      connectionRequest = undefined;
      connectionButton.disabled = false;
      renderReferences();
    }
  }
}

geminiKey.addEventListener('input', resetConnection);
geminiKey.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    checkGeminiConnection();
  }
});
connectionButton.addEventListener('click', checkGeminiConnection);
rememberGemini.addEventListener('change', () => {
  const saved = saveGeminiPreference();
  if (!saved) connectionStatus.textContent = 'Trình duyệt không lưu được thay đổi này.';
  else if (!rememberGemini.checked) connectionStatus.textContent = 'Đã xóa khóa lưu trên trình duyệt. Khóa vẫn dùng được trong tab này.';
  else if (connectedGeminiModel) connectionStatus.textContent = 'Đã lưu khóa trên trình duyệt này.';
  else connectionStatus.textContent = 'Kiểm tra kết nối để ghi nhớ khóa.';
});
restoreGeminiPreference();
connectionButton.disabled = !geminiKey.value.trim();
renderReferences();

$('ai-review-open').addEventListener('click', openGlyphReview);
$('ai-review-run').addEventListener('click', runGlyphReview);
viewer.addEventListener('close', () => resetGlyphReview());

function setZoom(value) {
  zoom = Math.max(0.25, Math.min(12, value));
  viewerImage.style.width = Math.round(zoomWidth * zoom) + 'px';
  $('zoom-value').textContent = Math.round(zoom * 100) + '%';
  $('zoom-in').disabled = zoom >= 12;
  $('zoom-out').disabled = zoom <= 0.25;
}

function openViewer(url, width, height, title, glyph) {
  if (viewer.open) return;
  resetGlyphReview(glyph);
  zoomWidth = width;
  viewerImage.src = url;
  $('viewer-title').textContent = title;
  viewer.showModal();
  const viewport = $('viewer-scroll');
  setZoom(Math.max(1, Math.min(4, (viewport.clientWidth - 24) / width, (window.innerHeight * 0.66) / height)));
  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
}

function zoomGlyph(char) {
  const glyph = usableGlyph(char);
  if (!glyph) return;
  const width = 270, height = 320;
  const viewWidth = Math.max(1, glyph.advance);
  const viewHeight = 1240;
  const outline = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="-30 -1025 ${viewWidth + 60} ${viewHeight + 50}">
    <rect x="-30" y="-1025" width="${viewWidth + 60}" height="${viewHeight + 50}" fill="#fffaf1"/>
    <path transform="scale(1 -1)" d="${glyph.d}" fill="#592f29"/>
  </svg>`;
  openViewer('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(outline), width, height, `Ký tự ${char} · ${glyph.source}`, glyph);
}

function zoomSource() {
  if (!source) return;
  const original = document.createElement('canvas');
  original.width = source.width;
  original.height = source.height;
  original.getContext('2d').putImageData(source, 0, 0);
  openViewer(original.toDataURL(), source.width, source.height, 'Ảnh mẫu');
}

canvas.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  zoomSource();
});
$('zoom-in').addEventListener('click', () => setZoom(zoom * 1.3));
$('zoom-out').addEventListener('click', () => setZoom(zoom / 1.3));

function point(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width, Math.round((event.clientX - bounds.left) * canvas.width / bounds.width))),
    y: Math.max(0, Math.min(canvas.height, Math.round((event.clientY - bounds.top) * canvas.height / bounds.height)))
  };
}

canvas.addEventListener('pointerdown', event => {
  if (busy || loading || event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  dragStart = { ...point(event), clientX: event.clientX, clientY: event.clientY, moved: false };
});
canvas.addEventListener('pointermove', event => {
  if (!dragStart || busy) return;
  const p = point(event);
  if (Math.hypot(event.clientX - dragStart.clientX, event.clientY - dragStart.clientY) >= 4) dragStart.moved = true;
  if (!dragStart.moved) return;
  const w = Math.abs(p.x - dragStart.x), h = Math.abs(p.y - dragStart.y);
  if (w < 4 || h < 4) return;
  crop = { x: Math.min(p.x, dragStart.x), y: Math.min(p.y, dragStart.y), w, h };
  renderSource();
});
canvas.addEventListener('pointerup', () => {
  if (!dragStart) return;
  const { moved } = dragStart;
  dragStart = undefined;
  if (moved) persistReferences();
  else zoomSource();
});
canvas.addEventListener('pointercancel', () => {
  if (dragStart?.moved) persistReferences();
  dragStart = undefined;
});

function inkBounds(ink, width) {
  const height = ink.length / width;
  const bounds = { x0: width, y0: height, x1: -1, y1: -1 };
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    bounds.x0 = Math.min(bounds.x0, x);
    bounds.y0 = Math.min(bounds.y0, y);
    bounds.x1 = Math.max(bounds.x1, x);
    bounds.y1 = Math.max(bounds.y1, y);
  }
  return bounds.x1 >= 0 ? [bounds] : [];
}

// Ghép lại chữ có dấu theo chữ gốc/dấu mẫu vừa đổi. Trả về các chữ vừa ghép để bảng quy tắc sửa và đối chiếu cả chúng.
function updateComposed() {
  const composed = composeVietnamese(glyphs,()=>false,{requireReferenceMarks:[...glyphs.values()].some(g=>g.origin==='direct')});
  for (const [char, glyph] of glyphs) {
    if (glyph.source === 'Ghép dấu' && !glyphs.has(glyph.base)) glyphs.delete(char);
  }
  const changed = [];
  for (const glyph of composed) {
    const active = [...glyph.char.normalize('NFD')].slice(1).some(mark => toneSamples.has(mark) && glyphs.has(mark));
    if (glyphs.get(glyph.char)?.origin !== 'direct' && !glyphs.get(glyph.char)?.locked && glyphs.get(glyph.char)?.source !== 'Font gốc' && (glyphs.get(glyph.char)?.source === 'Ghép dấu' || active)) { glyphs.set(glyph.char, glyph); changed.push(glyph.char); }
  }
  return changed;
}


function trimEdgeFragments(area) {
  // Mẩu nét chữ bên cạnh lọt vào vùng khoanh thường dính sát dấu câu qua vài điểm ảnh mờ: bào mòn dần (1–3 px) cho
  // tới khi tách được phần nằm trọn trong vùng (dấu câu) khỏi phần chạm mép (mẩu chữ bên cạnh). Trả về vùng mới bao
  // phần bên trong và danh sách điểm ảnh của mẩu chạm mép để xóa trắng trước khi tách nét.
  try {
    // Mực của vùng khoanh theo ngưỡng Otsu trên chính vùng (không dùng tách nền thích ứng: vùng nhỏ chỉ có một dấu câu
    // thì nền ước lượng bị tối theo dấu và không còn mực nào — lỗi 25/11).
    const { data, width, height } = selectedImage();
    const gray = new Uint8Array(width * height), histogram = new Uint32Array(256);
    for (let p = 0; p < gray.length; p++) { const v = Math.round(.299 * data[p * 4] + .587 * data[p * 4 + 1] + .114 * data[p * 4 + 2]); gray[p] = v; histogram[v]++; }
    let total = 0, sumAll = 0; for (let v = 0; v < 256; v++) { total += histogram[v]; sumAll += v * histogram[v]; }
    let left = 0, sum = 0, best = -1, cut = 127;
    for (let v = 0; v < 255; v++) { left += histogram[v]; sum += v * histogram[v]; const right = total - left; if (!left || !right) continue; const d = sum / left - (sumAll - sum) / right, score = left * right * d * d; if (score > best) { best = score; cut = v; } }
    const light = $('polarity').value === 'light';
    const ink = Uint8Array.from(gray, v => light ? v > cut : v <= cut);
    const label = source => {
      const seen = new Int32Array(source.length).fill(-1), comps = [];
      for (let start = 0; start < source.length; start++) {
        if (!source[start] || seen[start] >= 0) continue;
        const id = comps.length, stack = [start], pixels = []; seen[start] = id;
        let edge = false, edgePixels = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
        while (stack.length) {
          const p = stack.pop(), x = p % width, y = (p - x) / width; pixels.push(p);
          if (x <= 2 || y <= 2 || x >= width - 3 || y >= height - 3) { edge = true; edgePixels++; }   // tách nền thích ứng chừa viền 1–2 px
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1])
            if (q >= 0 && source[q] && seen[q] < 0) { seen[q] = id; stack.push(q); }
        }
        comps.push({ pixels, edge, edgePixels, x0, y0, x1, y1 });
      }
      return { comps, seen };
    };
    let cutBottom = false;
    // Không bào mòn: bào làm đứt nét tóc (tay chữ r mảnh) rồi bị xóa như mẩu chữ bên cạnh (lỗi 25/11).
    for (const r of [0]) {
      let eroded = ink;
      if (r) {
        eroded = new Uint8Array(ink.length);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          let keep = 1;
          for (let dy = -r; dy <= r && keep; dy++) for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            if (!ink[yy * width + xx]) { keep = 0; break; }
          }
          eroded[y * width + x] = keep && ink[y * width + x] ? 1 : 0;
        }
      }
      const { comps } = label(eroded);
      // Hạt nhiễu nhỏ (dưới 15% mảng lớn nhất) không phải ký tự: không được chọn làm dấu câu (lỗi cũ: chọn hạt 9 đơn vị).
      const biggest = Math.max(0, ...comps.map(c => c.pixels.length)), solid = c => c.pixels.length >= Math.max(4, .15 * biggest);
      let inside = comps.filter(c => !c.edge && solid(c)), outside = comps.filter(c => c.edge || !solid(c));
      // Khoanh sát quá nên cả dấu câu cũng chạm mép: giữ mảng gần tâm vùng khoanh nhất, bỏ các mẩu chạm mép còn lại.
      if (!inside.length && outside.filter(solid).length >= 1 && outside.length > 1) {
        const centre = c => { let sx = 0, sy = 0; for (const p of c.pixels) { sx += p % width; sy += Math.floor(p / width); } return Math.hypot(sx / c.pixels.length - width / 2, sy / c.pixels.length - height / 2); };
        // Mẩu chữ bên cạnh bị mép vùng khoanh cắt ngang theo cả một đoạn dài; dấu câu chỉ chạm mép vài điểm.
        // Chọn mảng có tỉ lệ điểm chạm mép nhỏ nhất, hòa thì mảng gần tâm.
        const ratio = c => c.edgePixels / c.pixels.length;
        const best = outside.filter(solid).sort((a, b) => ratio(a) - ratio(b) || centre(a) - centre(b))[0];
        if (best) { inside = [best]; outside = outside.filter(c => c !== best); }
      }
      if (!inside.length) { const main = comps.filter(solid).sort((a, b) => b.pixels.length - a.pixels.length)[0]; if (r === 0 && main && main.y1 >= height - 3) cutBottom = true; continue; }
      if (!outside.length) return cutBottom ? { ...area, cutBottom } : area;
      // Điểm ảnh gốc thuộc mẩu chạm mép: điểm mực gần mẩu đó (≤ r+1) hơn là gần phần bên trong.
      const owner = new Int8Array(ink.length);   // 1 = bên trong, 2 = mẩu mép
      const grow = (list, tag) => { for (const c of list) for (const p of c.pixels) owner[p] = tag; };
      grow(inside, 1); grow(outside, 2);
      for (let pass = 0; pass <= r + 1; pass++) {
        const next = owner.slice();
        for (let p = 0; p < ink.length; p++) {
          if (!ink[p] || owner[p]) continue;
          const x = p % width;
          for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) if (q >= 0 && q < ink.length && owner[q]) { next[p] = owner[q]; break; }
        }
        owner.set(next);
      }
      const erase = [];
      for (let p = 0; p < ink.length; p++) if (ink[p] && owner[p] !== 1) erase.push(p);
      const u = { x0: Math.min(...inside.map(c => c.x0)) - r, y0: Math.min(...inside.map(c => c.y0)) - r, x1: Math.max(...inside.map(c => c.x1)) + r, y1: Math.max(...inside.map(c => c.y1)) + r };
      const m = 2, x0 = Math.max(0, u.x0 - m), y0 = Math.max(0, u.y0 - m);
      const next = { x: area.x + x0, y: area.y + y0, w: Math.min(width, u.x1 + m + 1) - x0, h: Math.min(height, u.y1 + m + 1) - y0 };
      next.erase = erase.map(p => ({ x: area.x + p % width, y: area.y + Math.floor(p / width) }));
      next.cutBottom = inside.some(c => c.y1 >= height - 3);
      return next;
    }
    return cutBottom ? { ...area, cutBottom } : area;
  } catch (error) { console.warn('trimEdgeFragments', error); return area; }
}
// Dấu câu tách từ ảnh: CỠ theo tỉ lệ chữ của chính ảnh đó (đơn vị font/điểm ảnh đo từ các chữ đã tách cùng ảnh),
// VỊ TRÍ theo quy tắc trên thông số của chính font (không đoán đường chân từ ảnh, dễ sai khi chữ lấy từ dự án Family
// có toạ độ khác): . , : ; ! ? ngồi trên đường chân (dấu phẩy: đầu chấm ngồi trên đường chân, đuôi xuống dưới);
// ngoặc kép, nháy đơn: đỉnh ngang chiều cao chữ hoa. Đối chiếu lại sau khi đặt: lệch quy tắc thì đặt lại.
function fitToReferenceScale(glyph) {
  const crop = glyph.reference?.crop, index = glyph.reference?.index;
  if (!crop || index == null || !glyph.d) return placePunctuation(glyph);
  const median = list => { const v = [...list].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  // Chỉ chữ tách tay từ chính ảnh này (toạ độ crop tính theo ảnh gốc); chữ nhận từ dự án Family có toạ độ khác.
  const peers = [...glyphs.values()].filter(g => g?.d && g.reference?.index === index && g.reference.crop && !g.sourceImageId && /^[\p{L}\p{N}]$/u.test(g.char));
  if (peers.length < 3) return placePunctuation(glyph);
  const unit = median(peers.map(g => glyphBounds(g).height / g.reference.crop.h));
  const box = glyphBounds(glyph), k = crop.h * unit / box.height;
  if (!(k > 0) || k > 3 || k < .2) return placePunctuation(glyph);
  const lsb = Math.max(20, Math.round(box.x));
  const d = svgpath(glyph.d).translate(-box.x, -box.y).scale(k).translate(lsb, 0).round(1).toString();
  return placePunctuation({ ...glyph, d, advance: Math.round(2 * lsb + box.width * k), referenceScale: { unit: Math.round(unit * 1000) / 1000 } });
}
async function trace(single) {
  if (busy || loading) return;
  const text = $('chars').value.normalize('NFC').trim();
  const words = text.split(/\s+/u).map(word => [...word]);
  const chars = words.flat();
  if (!source || !chars.length) return status('Hãy chọn ảnh và nhập chữ trong vùng đã khoanh.');
  if (chars.some(char => !charset.includes(char) && !toneSamples.has(char))) return status('Bản này hỗ trợ chữ hoa, chữ thường tiếng Việt, số và dấu câu trong bảng.');
  if (single && chars.length !== 1) return status('Hãy khoanh một chữ và nhập đúng một ký tự.');
  busy = true;
  $('trace').disabled = $('single').disabled = true;
  renderReferences();
  try {
    let area = selection();
    // Khoanh một ký tự mà vùng chọn chạm phải góc chữ bên cạnh (dấu phẩy sát chữ ó): bỏ các mẩu nét chạm mép vùng
    // chọn, chỉ giữ phần nằm trọn bên trong. Không còn gì bên trong thì giữ nguyên vùng chọn.
    if (single) { const trimmed = trimEdgeFragments(area); if (trimmed !== area) { area = trimmed; crop = { x: trimmed.x, y: trimmed.y, w: trimmed.w, h: trimmed.h }; } }
    const image = document.createElement('canvas');
    image.width = area.w;
    image.height = area.h;
    image.getContext('2d').putImageData(source, -area.x, -area.y);
    if (area.erase?.length) {   // xóa trắng mẩu chữ bên cạnh lọt vào vùng khoanh
      const g = image.getContext('2d'), data = g.getImageData(0, 0, area.w, area.h);
      const paper = $('polarity').value === 'light' ? 0 : 255;
      for (const { x, y } of area.erase) { const xx = x - area.x, yy = y - area.y; if (xx < 0 || yy < 0 || xx >= area.w || yy >= area.h) continue; const k = (yy * area.w + xx) * 4; data.data[k] = data.data[k + 1] = data.data[k + 2] = paper; }
      g.putImageData(data, 0, 0);
    }
    const rect = { x0: 0, y0: 0, x1: image.width, y1: image.height };
    const mask = wordInk(image, rect, {polarity: $('polarity').value, threshold: Number($('threshold').value)});
    const tone = chars.length === 1 && toneSamples.has(chars[0]);
    const parts = tone ? [rect] : mask.preserveOutline ? splitReferenceWord(mask, rect, chars) : [];
    const traced = new Map();

    if (parts.length === chars.length) {
      const word = [];
      for (const [i, char] of chars.entries()) {
        status(`Đang dựng nét chữ ${i + 1}/${chars.length}…`);
        const glyph = await traceSymbol(mask, parts[i], char, rect);
        if (activeReference >= 0) {
          const { x, y, w, h } = glyph.pixelCrop;
          glyph.reference = { index: activeReference, crop: { x: area.x + x, y: area.y + y, w, h } };
        }
        word.push(glyph);
      }
      let start = 0;
      const groups = words.map(chars => {
        const group = word.slice(start, start + chars.length);
        start += chars.length;
        return group;
      });
      for (const glyph of tone ? word : alignReferenceGlyphs(groups)) traced.set(glyph.char, glyph);
    } else {
      const { ink, blobs, width } = segmentation();
      for (const { x, y } of area.erase || []) { const xx = x - area.x, yy = y - area.y; if (xx >= 0 && yy >= 0 && xx < width && yy < ink.length / width) ink[yy * width + xx] = 0; }
      const boxes = single ? inkBounds(ink, width) : blobs;
      if (boxes.length !== chars.length) {
        throw new Error(`Tìm được ${boxes.length} cụm nét, bạn nhập ${chars.length} ký tự. Hãy khoanh từng từ hoặc chọn một chữ.`);
      }
      for (const [i, char] of chars.entries()) {
        if (traced.has(char)) continue;
        status(`Đang dựng nét chữ ${i + 1}/${chars.length}…`);
        const box = boxes[i];
        const glyph = await makeGlyph(ink, width, box, char, undefined, true);
        if (activeReference >= 0) {
          glyph.reference = { index: activeReference, crop: {
            x: area.x + box.x0, y: area.y + box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1
          } };
        }
        traced.set(char, glyph);
      }
    }
    const replacements = [...traced.keys()].filter(char => glyphs.get(char)?.source === 'Ảnh mẫu');
    if (replacements.length && !(await ask(`Thay nét ảnh mẫu của ${replacements.join(', ')}?`, { ok: 'Thay nét' }))) {
      return status('Đã hủy thay nét.');
    }
    // Dấu câu khoanh tay: cỡ và độ cao theo đúng tỉ lệ chữ của chính ảnh này (chữ đã tách từ cùng ảnh), không phóng
    // cho đầy khung như chữ cái (dấu phẩy thành to bằng nửa chữ).
    // Bỏ hạt lẻ (contour ngoài nhỏ hơn 2% contour lớn nhất, đứng tách khỏi nét): nhiễu nén ảnh hoặc mẩu sót của chữ bên cạnh.
    if (single) for (const [char, glyph] of traced) {
      const parts = svgpath(glyph.d).abs().toString().split(/(?=M)/).filter(x => x.trim()).map(d => ({ d, b: glyphBounds({ d }) }));
      const big = Math.max(...parts.map(p => p.b.width * p.b.height));
      const kept = parts.filter(p => p.b.width * p.b.height >= .02 * big || parts.some(q => q !== p && q.b.width * q.b.height > p.b.width * p.b.height && p.b.x >= q.b.x && p.b.x + p.b.width <= q.b.x + q.b.width && p.b.y >= q.b.y && p.b.y + p.b.height <= q.b.y + q.b.height));
      if (kept.length < parts.length) traced.set(char, { ...glyph, d: kept.map(p => p.d).join(' ') });
    }
    for (const [char, glyph] of traced) if (punctuation.includes(char)) traced.set(char, fitToReferenceScale(glyph));
    // Dấu phẩy phải có đuôi: phần mực chính chạm mép dưới vùng khoanh nghĩa là khung cắt ngang đuôi (không đoán theo
    // tỉ lệ cao/rộng: dấu phẩy mỗi font một dáng).
    for (const char of traced.keys()) if ((char === ',' || char === ';') && single && area.cutBottom)
      throw new Error('Chưa lưu ' + char + ': mép dưới vùng khoanh cắt ngang đuôi dấu phẩy. Hãy kéo khung xuống thấp hơn để bao trọn cả đuôi; lẹm sang chữ bên cạnh cũng được.');
    const rejected = [...traced.values()].filter(glyph => glyph.punctuationRejected).map(glyph => glyph.char + ' (đầu chấm ' + glyph.punctuationRejected.head + ', chấm i ' + glyph.punctuationRejected.dot + ')');
    if (rejected.length) throw new Error('Chưa lưu ' + rejected.join(' ') + ': nét tách ra lệch quá 10 lần so với chấm chữ i của font, tức là vùng khoanh chưa lấy trọn dấu câu (có thể chỉ được một mẩu nhỏ hoặc nhầm sang chữ bên cạnh). Hãy khoanh rộng hơn một chút, bao trọn cả đầu và đuôi dấu câu; lẹm sang chữ bên cạnh cũng được, Xưởng sẽ tự bỏ phần đó.');
    for (const [char, glyph] of traced) if (!glyphs.get(char)?.locked) glyphs.set(char, glyph);
    rememberReference();
    if (references[activeReference]) references[activeReference].settings.used = true;
    persistReferences();
    // Chữ có dấu ghép lại theo nét vừa tách cũng là chữ vừa dựng: sửa và đối chiếu cả chúng.
    const recomposed = updateComposed();
    refresh();
    const ruleNote = enforceRules([...traced.keys(), ...recomposed]);
    refresh();
    status(`Đã thêm ${traced.size} ký tự từ ảnh mẫu.` + ruleNote);
  } catch (error) { status(error.message); }
  finally {
    busy = false;
    $('trace').disabled = $('single').disabled = false;
    renderReferences();
  }
}

const tiles = new Map();
let recentGlyphs = new Set();
let glyphReview;
let glyphReviewPending;
let glyphReviewError = false;
// Ký tự đang xem ở Soát ký tự. Theo Glyphs Set Overview của trang Migra: rê chuột lên ô là xem ngay ô đó và giữ nguyên
// khi rời chuột (không quay lại). Ở Xưởng, ô đang chọn để chỉnh (selected) chỉ đổi khi bấm.
let inspected;

function setProofMode(inspecting) {
  $('title-proof').hidden = inspecting;
  $('glyph-proof').hidden = !inspecting;
  $('show-title-proof').setAttribute('aria-pressed', String(!inspecting));
  $('show-glyph-proof').setAttribute('aria-pressed', String(inspecting));
  inspected = inspecting ? selected : undefined;
  markInspected();
  if (inspecting) {
    renderGlyphInspection();
    requestGlyphReview();
  }
}

function markInspected() {
  for (const [char, tile] of tiles) tile.classList.toggle('inspecting', !$('glyph-proof').hidden && char === inspected);
}

function inspectGlyph(char) {
  if ($('glyph-proof').hidden || inspected === char) return;
  inspected = char;
  markInspected();
  renderGlyphInspection();
}

// Khung xem ký tự. Cách vẽ theo đúng component Glyphs View của trang Migra (index-D6-4TZZw.js, đối tượng Alpine
// fontGlyphs: setupCanvas, drawBg, drawGlyph, drawHLine): hai lớp canvas (đường chuẩn, chữ) theo devicePixelRatio;
// lề 80 px; tỉ lệ = min(rộng/(rộng + 1000), cao/(sTypoAscender − sTypoDescender)); đường chân cách mép trên
// lề + cao × sTypoAscender/(sTypoAscender − sTypoDescender); đường chuẩn lấy từ bảng OS/2 của file TTF; nét đứt [2,2],
// dày 1, chữ 12 px; tên đường bên trái, giá trị bên phải; Baseline/Ascender/Descender ghi phía trên đường, Cap Height và
// x-height ghi phía dưới; chữ đặt giữa theo bước chữ (advanceWidth). Màu theo Xưởng.
// Lề 80 px là của khung Migra rộng ~616 px; cột phải của Xưởng hẹp hơn nên lề co theo cùng tỉ lệ (0.13 bề rộng, tối đa 80).
const glyphViewMargin = width => Math.min(80, width * .13);
function setupGlyphCanvas(canvas) {
  const { width, height } = $('glyph-proof-figure').getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawGlyphView(char) {
  const back = setupGlyphCanvas($('glyph-proof-bg')), front = setupGlyphCanvas($('glyph-proof-glyph'));
  const font = glyphReview?.font, unicode = char ? 'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') : '';
  const index = font && char ? font.charToGlyphIndex(char) : 0;
  $('glyph-proof-unicode').textContent = unicode && (unicode + ' (' + (index || 'chưa có trong TTF') + ')');
  $('glyph-proof-glyph').setAttribute('aria-label', char ? (toneSamples.get(char) ?? char) + ' phóng lớn' : 'Chưa chọn ký tự');
  if (!font || !back.width) return;
  const os2 = font.tables.os2 || {}, ascender = os2.sTypoAscender ?? font.ascender, descender = os2.sTypoDescender ?? font.descender;
  const margin = glyphViewMargin(back.width);
  const width = back.width - margin * 2, height = back.height - margin * 2, span = ascender - descender;
  const scale = Math.min(width / (width + 1000), height / span);
  const baseline = margin + height * ascender / span;
  if ($('glyph-proof-guides').checked) {
    const { context } = back, color = '#a89a8b';
    context.font = '12px ' + getComputedStyle(document.body).fontFamily;
    context.fillStyle = context.strokeStyle = color;
    context.lineWidth = 1;
    context.lineCap = 'round';
    context.setLineDash([2, 2]);
    const line = (label, value, above = false) => {
      if (!Number.isFinite(value)) return;
      const y = baseline - value * scale, textY = above ? y - 10 : y + 20;
      context.textAlign = 'left';
      context.fillText(label, 10, textY);
      context.textAlign = 'right';
      context.fillText(String(value), back.width - 10, textY);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(back.width, y);
      context.stroke();
    };
    line('Đường chân chữ', 0, true);
    line('Nét vươn trên', ascender, true);
    line('Nét xuống', descender, true);
    line('Chữ hoa', os2.sCapHeight);
    line('x-height', os2.sxHeight);
  }
  const { context } = front;
  if (!index || !font.glyphs.get(index).path.commands.length) {
    context.fillStyle = '#fffcf5';
    context.textAlign = 'center';
    context.font = '600 15px ' + getComputedStyle(document.body).fontFamily;
    context.fillText(char ? 'Còn thiếu ' + (toneSamples.get(char) ?? char) + ' trong TTF' : '', front.width / 2, front.height / 2);
    return;
  }
  const glyph = font.glyphs.get(index), x = (front.width - glyph.advanceWidth * scale) / 2;
  const path = glyph.getPath(x, baseline, scale * font.unitsPerEm, {}, font);
  path.fill = '#fffcf5';
  path.draw(context);
}

let glyphViewResize;
new ResizeObserver(() => {
  clearTimeout(glyphViewResize);
  glyphViewResize = setTimeout(() => { if (!$('glyph-proof').hidden) drawGlyphView(inspected ?? selected); }, 200);
}).observe($('glyph-proof-figure'));

function requestGlyphReview() {
  const record = currentFontExport;
  if (!record || glyphReviewPending === record) return;
  glyphReviewPending = record;
  assessFont(record).then(result => {
    if (record !== currentFontExport) return;
    const warnings = new Map();
    for (const finding of result.findings) {
      if (!['fail', 'warning'].includes(finding.status) || finding.rule === 'coverage') continue;
      const pair = ['pair-collision', 'horn-pair'].includes(finding.rule);
      const chars = pair ? [...finding.chars] : finding.chars.split(/\s+/u);
      for (const char of chars) {
        if ([...char].length !== 1 || !usableGlyph(char)) continue;
        if (!warnings.has(char)) warnings.set(char, []);
        warnings.get(char).push(pair ? finding.chars + ' · ' + finding.message : finding.message);
      }
    }
    glyphReview = { ...result, warnings };
    renderGlyphs();
  }).catch(() => {
    if (record !== currentFontExport) return;
    glyphReviewError = true;
    renderGlyphs();
  });
}

function renderGlyphInspection() {
  if ($('glyph-proof').hidden) return;
  const vector = $('glyph-proof-vector'), context = $('glyph-proof-context');
  const metrics = $('glyph-proof-metrics'), results = $('glyph-proof-results');
  vector.replaceChildren();
  context.replaceChildren();
  metrics.textContent = '';
  results.replaceChildren();
  // Ký tự đang xem: ô vừa rê chuột (như trang Migra), không có thì ô đang chọn.
  const viewed = inspected ?? selected;
  const selectedTitle = viewed ? (toneSamples.get(viewed) ?? viewed) + ' · ' + (usableGlyph(viewed)?.source ?? 'Còn thiếu') : 'Rê chuột hoặc chọn ký tự trong bảng giữa';
  $('glyph-proof-title').textContent = selectedTitle;
  drawGlyphView(viewed);
  const glyph = viewed && usableGlyph(viewed);
  const marks = [...(viewed || '').normalize('NFD')].slice(1);
  $('glyph-proof-adjust').disabled = !glyph || !marks.some(mark => mark !== '\u031b');
  $('glyph-proof-next').disabled = !glyphReview?.warnings.size;
  const note = message => {
    const row = document.createElement('li');
    row.textContent = message;
    results.append(row);
  };
  if (!viewed) return;
  if (!glyph) { note('Còn thiếu ký tự trong bộ chữ.'); return; }
  if (toneSamples.has(viewed)) { note('Đây là dấu mẫu dùng để ghép chữ.'); return; }
  if (!glyphReview) {
    note(glyphReviewError ? 'Chưa đọc được TTF để soát.' : 'Đang chuẩn bị TTF để soát…');
    return;
  }
  const { font, warnings, measured } = glyphReview;
  if (!font.charToGlyphIndex(viewed)) { note('Còn thiếu ký tự trong TTF.'); return; }
  if (!font.charToGlyph(viewed).path.commands.length) { note('Ký tự có mã nhưng thiếu nét trong TTF.'); return; }
  const guides = $('glyph-proof-guides').checked;
  const exported = font.charToGlyph(viewed), box = exported.getBoundingBox();
  metrics.textContent = [font.getEnglishName('fontSubfamily'), glyph.source,
    'Lề trái ' + Math.round(box.x1), 'Lề phải ' + Math.round(exported.advanceWidth - box.x2),
    'Bước chữ ' + exported.advanceWidth, 'UPM ' + font.unitsPerEm].filter(Boolean).join(' · ');
  const root = viewed.normalize('NFD')[0];
  const structural = marks.find(mark => ['\u0302', '\u0306', '\u031b'].includes(mark));
  const compare = [...new Set([root, structural && (root + structural).normalize('NFC'), viewed])]
    .filter(char => char && font.charToGlyphIndex(char));
  if (compare.length > 1) {
    const caption = document.createElement('strong');
    caption.textContent = compare.join(' – ');
    context.append(caption, makeQualitySVG(font, compare.join('  '), { guides }).svg);
  }
  const words = $('sample').value.normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
  const proofWords = [...new Set(words.filter(word => word.includes(viewed) &&
    [...word].every(char => font.charToGlyphIndex(char))))].slice(0, 2);
  if (proofWords.length) context.append(makeQualitySVG(font, proofWords.join('  '), { guides: false }).svg);
  const findings = warnings.get(viewed) || [];
  for (const finding of findings) note('Cần xem · ' + finding);
  const gap = measured.find(item => item.char === viewed)?.gap;
  if (gap !== undefined && gap >= glyphReview.threshold.minGap) note('Đạt ngưỡng khoảng hở dấu–thân · ' + gap + ' / 1000 em.');
  else if (gap === undefined && marks.length) note('Chưa đo được khoảng hở dấu–thân cho chữ này.');
}

$('show-title-proof').onclick = () => setProofMode(false);
$('show-glyph-proof').onclick = () => setProofMode(true);
$('glyph-proof-guides').onchange = renderGlyphInspection;
$('glyph-filter').onchange = () => {
  renderGlyphs();
  if ($('glyph-filter').value === 'review') requestGlyphReview();
};
$('glyph-proof-next').onclick = () => {
  const chars = charset.filter(char => glyphReview?.warnings.has(char));
  const next = chars[(chars.indexOf(selected) + 1) % chars.length];
  if (!next) return;
  $('glyph-filter').value = 'review';
  tiles.get(next).click();
  renderGlyphs();
  tiles.get(next).scrollIntoView({ block: 'nearest' });
};
$('glyph-proof-adjust').onclick = () => {
  if (inspected && inspected !== selected) tiles.get(inspected)?.click();
  auditRepairPending = false;
  completionPending = false;
  $('mark-spacing-tools').hidden = false;
  $('mark-spacing-scope').value = 'selected';
  previewMarkSpacing();
  $('mark-spacing-tools').scrollIntoView({ block: 'nearest' });
};
for (const char of [...toneSamples.keys(), ...charset]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'glyph';
  // Bấm một lần: chọn ký tự. Nháy đúp (hoặc Enter khi đang chọn bằng bàn phím): mở xem chi tiết phóng to.
  const choose = () => {
    inspected = $('glyph-proof').hidden ? inspected : char;
    if (selected === char) { markInspected(); renderGlyphInspection(); return; }
    selected = char;
    $('chars').value = char;
    persistReferences();
    renderGlyphs();
  };
  button.addEventListener('click', choose);
  // Soát ký tự: rê chuột lên ô là xem ngay (Migra: @mouseover="activeGlyphIndex = glyph.index").
  button.addEventListener('mouseover', () => inspectGlyph(char));
  button.addEventListener('dblclick', () => { choose(); fontLab.open(char); });
  const grid = toneSamples.has(char) ? 'tone-samples' : lowercase.includes(char) ? 'lower-glyphs' : core.includes(char) || char === 'Đ' ? 'glyphs' : 'more-glyphs';
  $(grid).append(button);
  tiles.set(char, button);
}

function renderGlyphs() {
  const filter = $('glyph-filter').value;
  let visible = 0;
  for (const [char, tile] of tiles) {
    const glyph = usableGlyph(char);
    tile.hidden = filter === 'recent' ? !glyph || !recentGlyphs.has(char)
      : filter === 'missing' ? !!glyph : filter === 'review' ? !glyphReview?.warnings.has(char) : false;
    if (!tile.hidden && !toneSamples.has(char)) visible++;
    tile.className = 'glyph' + (glyph ? (['Ảnh mẫu', 'Ảnh làm sạch'].includes(glyph.source)) ? ' ready' : ' generated' : '')
      + (!$('glyph-proof').hidden && char === inspected ? ' inspecting' : '');
    tile.setAttribute('aria-pressed', String(char === selected));
    const name = toneSamples.get(char) ?? char;
    tile.setAttribute('aria-label', name + ' · ' + (glyph?.source ?? 'Còn thiếu'));
    tile.title = tile.getAttribute('aria-label');
    tile.replaceChildren();
    if (!glyph) { tile.textContent = name; continue; }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    if (char === '\u0309') {
      const { x, y, width, height } = glyphBounds(glyph);
      const pad = .20 * Math.max(width, height);
      svg.setAttribute('viewBox', `${x - pad} ${-y - height - pad} ${width + 2 * pad} ${height + 2 * pad}`);
    } else svg.setAttribute('viewBox', `0 -1000 ${glyph.advance} 1240`);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', glyph.d);
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('transform', 'scale(1 -1)');
    svg.append(path);
    const label = document.createElement('small');
    label.textContent = name;
    tile.append(svg, label);
  }
  $('count').textContent = `${charset.filter(char => usableGlyph(char)).length} / ${charset.length} ký tự`;
  $('selected').textContent = selected ? `${toneSamples.get(selected) ?? selected} · ${usableGlyph(selected)?.source ?? 'Còn thiếu'}` : 'Chọn một ô để nhập ký tự đó.';
  $('remove').disabled = !glyphs.has(selected);
  $('reset').disabled = !glyphs.size;
  for (const id of ['glyphs', 'lower-glyphs', 'more-glyphs']) {
    const group = $(id);
    group.hidden = filter !== 'all' && ![...group.children].some(tile => !tile.hidden);
    group.previousElementSibling.hidden = group.hidden;
  }
  $('tone-samples').closest('details').hidden = filter !== 'all';
  $('glyph-filter-status').textContent = filter === 'all' ? ''
    : filter === 'review' && !glyphReview && glyphs.size ? (glyphReviewError ? 'Chưa đọc được TTF' : 'Đang soát TTF…') : visible + ' ký tự';
  renderGlyphInspection();
}

function renderPreview() {
  const sample = $('sample').value.normalize('NFC');
  const absent = new Set();
  const output = $('preview');
  output.style.fontSize = Number($('size').value) + 'px';
  $('size-value').value = $('size').value;
  $('spacing-value').value = $('spacing').value;
  output.replaceChildren();
  for (const char of sample) {
    if (!/\s/u.test(char) && !usableGlyph(char)) {
      absent.add(char);
      const marker = document.createElement('span');
      marker.className = 'missing-glyph';
      marker.textContent = char;
      output.append(marker);
    } else output.append(document.createTextNode(char));
  }
  $('missing').textContent = absent.size ? 'Chữ còn thiếu trong tiêu đề · ' + [...absent].join(' ') : '';
}

function scheduleFont() {
  clearTimeout(debounce);
  const turn = ++revision;
  const download = $('download');
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = undefined;
  currentFontExport = undefined;
  glyphReview = undefined;
  glyphReviewError = false;
  if (!$('glyph-proof').hidden || $('glyph-filter').value === 'review') renderGlyphs();
  download.removeAttribute('href');
  download.setAttribute('aria-disabled', 'true');
  debounce = setTimeout(async () => {
    const savedGlyphs = importedMetrics ? [...glyphs.values()].filter(glyph => !toneSamples.has(glyph.char)) : charset.map(usableGlyph).filter(Boolean);
    if (!savedGlyphs.length) {
      if (fontFace) document.fonts.delete(fontFace);
      fontFace = undefined;
      $('preview').style.removeProperty('font-family');
      $('preview').style.removeProperty('line-height');
      return;
    }
    try {
      const active = importedMetrics ? savedGlyphs : savedGlyphs.map(g=>g.preserveOutline?g:fitLowercaseUStems(fitLowercaseQ(fitLowercaseT(g))));
      const name = $('name').value.trim() || 'Xuong Font';
      let ascent = importedMetrics?.ascent ?? ASCENT, descent = importedMetrics?.descent ?? DESCENT;
      for (const glyph of active) {
        const { y, height } = glyphBounds(glyph);
        ascent = Math.max(ascent, Math.ceil(y + height + 24));
        descent = Math.min(descent, Math.floor(y - 24));
      }
      // Font mở từ bộ sưu tập giữ nguyên khoảng cách gốc; thanh "Khoảng cách chữ" cộng đều vào mỗi chữ
      // (nửa bên trái, nửa bên phải), không đụng dấu rời có advance 0.
      const tracking = Number($('spacing').value);
      const balanced = importedMetrics ? active.map(glyph => !tracking || !(glyph.advance > 0) ? glyph
        : { ...glyph, d: svgpath(glyph.d).translate(tracking / 2, 0).round(1).toString(), advance: Math.max(1, glyph.advance + tracking) })
        : balanceGlyphSpacing(active, tracking);
      const ttf = exportFont(name, balanced, 0, { italic: importedMetrics?.italic, angle: importedMetrics?.angle, familyName: importedMetrics?.familyName, styleName: importedMetrics?.styleName, weight: importedMetrics?.weight, ascent, descent, kerning: importedMetrics?.kerning ?? fontKerning(balanced), wordSpace: importedMetrics?.wordSpace });
      const face = new FontFace('xuong-preview-' + turn, ttf);
      await face.load();
      if (turn !== revision) return;
      if (fontFace) document.fonts.delete(fontFace);
      fontFace = face;
      document.fonts.add(face);
      $('preview').style.fontFamily = face.family + ', Georgia, serif';
      $('preview').style.lineHeight = String((ascent - descent) / UPM);
      // File tải về và bản lưu vào bộ sưu tập mang tiền tố XFVN (tên trong file và tên hiển thị).
      const branded = xuongFontFile(ttf, name);
      const blob = new Blob([branded.buffer], { type: 'font/ttf' });
      downloadURL = URL.createObjectURL(blob);
      download.href = downloadURL;
      download.download = (branded.label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '') || 'Xuong Font') + '.ttf';
      currentFontExport = { name: branded.label, filename: download.download, blob, sourceId: importedMetrics?.sourceRecordId, fromImages:[...glyphs.values()].some(g=>g.origin==='direct'||g.source==='Ảnh mẫu'), manualChars:[...glyphs.values()].filter(g=>g.manualEdit&&g.locked).map(g=>g.char) };
      download.setAttribute('aria-disabled', 'false');
      if (!$('glyph-proof').hidden || $('glyph-filter').value === 'review') requestGlyphReview();
      if (repairRecheckPending) { const options = repairRecheckPending === true ? { propose: false } : repairRecheckPending; repairRecheckPending = false; await editorFontCheck.run([currentFontExport], options); }
    } catch (error) {
      if (turn === revision) {
        $('missing').textContent = 'Không xuất được font · ' + error.message;
        glyphReviewError = true;
        renderGlyphs();
      }
    }
  }, 120);
}

function refresh() {
  previewMarkSpacing();
  save();
  renderGlyphs();
  renderPreview();
  scheduleFont();
}


function reportDesign(message) {
  $('ai-scan-report').hidden = false;
  $('ai-scan-summary').textContent = message.split('\n')[0];
  $('ai-scan-result').textContent = message;
}

function usableGlyph(char) {
  const glyph = glyphs.get(char);
  if (!glyph || (glyph.source === 'Ảnh mẫu' && !completeTildeO(glyph))) return undefined;
  return glyph;
}

function inventoryReport(prefix = '') {
  const present = inventory.observed.length;
  const missing = charset.length - present;
  const unresolved = present - inventory.traced.length;
  reportDesign(prefix + `Có mẫu: ${present} ký tự. Đã dựng từ ảnh: ${inventory.traced.length}.`
    + (unresolved ? ` Chưa tách được: ${inventory.observed.filter(char => !inventory.traced.includes(char)).join(' ')}.` : '')
    + ` Chưa thấy mẫu: ${missing}.`);
}

function fontText(value) {
  return value.normalize('NFC').replace(/\s/gu, '');
}

function detectedText(words) {
  return words.map(word => fontText(word.text)).join('');
}


$('ai-scan').addEventListener('click', async()=>{
  if(busy||loading)return;
  if(!references.length){status('Thêm ảnh mẫu rồi bấm Tạo bộ font.');return;}
  if(!localLayoutReady()&&!geminiKey.value.trim()){status('Gõ nội dung chữ dưới mỗi ảnh, hoặc nhập khóa Gemini ở thanh trên để tạo bộ font.');return;}
  const controller=new AbortController();designRun=controller;busy=true;$('name').disabled=true;renderReferences();
  $('stop-design').hidden=false;$('stop-design').disabled=false;
  const before = new Map(glyphs);
  let result;
  try{result=await familyWorkspace.createFromCurrent({...currentFamilyInput(),signal:controller.signal});}
  finally{busy=false;$('name').disabled=false;designRun=undefined;$('stop-design').hidden=true;renderReferences();}
  if (result?.ok) {
    recentGlyphs = new Set([...glyphs].filter(([char, glyph]) => {
      const previous = before.get(char);
      return previous?.d !== glyph.d || previous?.advance !== glyph.advance || previous?.source !== glyph.source;
    }).map(([char]) => char));
    $('glyph-filter').value = 'all';
    setProofMode(false);
    renderGlyphs();
  } else if (!controller.signal.aborted) markMissingLayoutText();
});
$('stop-design').addEventListener('click', () => {
  if (!designRun) return;
  designRun.abort();
  $('stop-design').disabled = true;
  reportDesign('Đang dừng…');
});

document.addEventListener('paste', event => {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const isImage = file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
  const files = [...clipboard.files].filter(isImage);
  const images = files.length ? files : [...clipboard.items]
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter(file => file && isImage(file));
  if (!images.length) return;
  event.preventDefault();
  if (busy) return status('Đang dựng nét. Hãy dán lại ảnh khi hoàn tất.');
  addFiles(images);
});

$('file').addEventListener('change', event => {
  addFiles(event.target.files);
  event.target.value = '';
});
$('drop').addEventListener('dragover', event => { event.preventDefault(); $('drop').classList.add('over'); });
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('over'));
$('drop').addEventListener('drop', event => {
  event.preventDefault();
  $('drop').classList.remove('over');
  addFiles(event.dataTransfer.files);
});

$('reference').addEventListener('change', event => showReference(Number(event.target.value)));
$('previous-reference').addEventListener('click', () => showReference(activeReference - 1));
$('next-reference').addEventListener('click', () => showReference(activeReference + 1));

$('demo')?.addEventListener('click', () => {
  if (busy || loading || restoring) return;
  rememberReference();
  activeReference = -1;
  renderReferences();
  persistReferences();
  const demo = document.createElement('canvas');
  demo.width = 720;
  demo.height = 170;
  const context = demo.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, demo.width, demo.height);
  context.fillStyle = '#211a16';
  context.textAlign = 'center';
  context.font = 'bold 100px Georgia, serif';
  [...'HAOLMSNKYUTI'].forEach((char, i) => {
    const row = Math.floor(i / 6);
    context.font = 'bold 65px Georgia, serif';
    context.fillText(char, 62 + (i % 6) * 116, 66 + row * 85);
  });
  $('polarity').value = 'dark';
  setThreshold();
  $('chars').value = 'HAOLMSNKYUTI';
  useImage(demo, 'Mẫu chữ serif');
});

function setThreshold() {
  const adaptive = $('polarity').value === 'adaptive';
  const threshold = $('threshold');
  threshold.min = adaptive ? 5 : 1;
  threshold.max = adaptive ? 120 : 254;
  threshold.value = adaptive ? 40 : $('polarity').value === 'light' ? 192 : 128;
  $('threshold-value').value = threshold.value;
}
$('polarity').addEventListener('change', () => { setThreshold(); renderSource(); persistReferences(); });
$('threshold').addEventListener('input', () => { $('threshold-value').value = $('threshold').value; renderSource(); persistReferences(); });
$('mask').addEventListener('change', renderSource);
$('clear-crop').addEventListener('click', () => { crop = undefined; renderSource(); persistReferences(); });
$('chars').addEventListener('input', () => persistReferences());
$('trace-form').addEventListener('submit', event => { event.preventDefault(); trace(false); });
$('single').addEventListener('click', () => trace(true));

$('import-tone-sheet').addEventListener('click', async () => {
  if (busy || loading || activeReference < 0) return status('Hãy mở ảnh bảng dấu trước.');
  const index = activeReference;
  const entry = references[index];
  busy = true;
  $('import-tone-sheet').disabled = true;
  renderReferences();
  try {
    const image = await referenceCanvas(entry.file);
    const area = { x0: 0, y0: 0, x1: image.width, y1: image.height };
    const mask = wordInk(image, area);
    const parts = splitWordByGaps(mask, area, 10);
    if (!parts.length) parts.push(...splitWordByGaps(mask, area, 8));
    if (!parts.length) throw new Error('Cần ảnh một hàng theo thứ tự: trăng, mũ, chấm, hỏi, ngã, nặng, sắc, huyền. Có thể có : và ; ở cuối.');
    const order = ['\u0306', '\u0302', null, '\u0309', '\u0303', '\u0323', '\u0301', '\u0300'];
    const samples = new Map();
    for (const [i, mark] of order.entries()) {
      if (!mark) continue;
      const glyph = await traceSymbol(mask, parts[i], mark);
      glyph.reference = { index, crop: glyph.pixelCrop };
      samples.set(mark, glyph);
    }
    const next = new Map([...glyphs, ...samples]);
    const generated = applyReferenceMarks(next, [...samples.keys()]);
    for (const glyph of generated) next.set(glyph.char, glyph);
    glyphs = keepLocked(next);
    refresh();
    const message = `Đã nhập ${samples.size} dấu mẫu và cập nhật ${generated.length} chữ có dấu.`;
    status(message);
    reportDesign(message);
  } catch (error) {
    status(error.message);
    reportDesign(error.message);
  } finally {
    busy = false;
    $('import-tone-sheet').disabled = false;
    renderReferences();
  }
});

// Ô còn trống (ví dụ số 0–9) lấy từ kiểu gần nhất trong cùng bộ font, làm dày/mỏng theo chênh lệch độ đậm.
$('borrow-glyphs').addEventListener('click', async () => {
  if (busy || loading) return;
  const weight = importedMetrics?.weight, italic = !!importedMetrics?.italic;
  if (!Number.isFinite(weight)) return status('Mở một kiểu trong bộ font trước (bấm Tạo bộ font hoặc mở từ Bộ sưu tập).');
  const styles = await familyWorkspace.projectStyles();
  const { added, rejected, donors } = borrowMissing({ styles, target: glyphs, weight, italic, chars: charset });
  if (!donors.length) return status('Bộ font chưa có kiểu nào khác có chữ để lấy. Hãy dựng kiểu kia từ ảnh trước, ví dụ ảnh số ở kiểu Medium.');
  for (const glyph of added) glyphs.set(glyph.char, glyph);
  const ruleNote = enforceRules(added.map(glyph => glyph.char));
  refresh();
  const groups = new Map();
  for (const glyph of added) groups.set(glyph.borrowedFrom, [...(groups.get(glyph.borrowedFrom) || []), glyph]);
  const message = (added.length ? 'Đã lấy ' + added.length + ' chữ: ' + [...groups].map(([name, list]) =>
    list.map(g => g.char).join(' ') + ' từ ' + name + ' (' + (list[0].weightShift >= 0 ? 'làm dày ' : 'làm mỏng ') + Math.abs(list[0].weightShift) + ' đơn vị mỗi bên nét)').join('; ') + '. Đây là nét suy luận, hãy xem lại.'
    : 'Không có chữ còn thiếu nào có sẵn ở kiểu khác (' + donors.join(', ') + ').')
    + (rejected.length ? ' Bỏ qua ' + rejected.join(' ') + ' vì làm dày sẽ bít lòng chữ hoặc làm đứt nét.' : '') + ruleNote;
  status(message);
  reportDesign(message);
});

// Không có ảnh dấu: dựng dấu mẫu và Đ/đ theo độ dày nét của chính bộ chữ. Không thay nét lấy từ ảnh.
$('derive-marks').addEventListener('click', () => {
  if (busy || loading) return;
  const real = glyph => glyph && (glyph.locked || glyph.origin === 'direct' || ['Ảnh mẫu', 'Ảnh làm sạch', 'Font gốc'].includes(glyph.source));
  if (!['A', 'E', 'O', 'a', 'e', 'o'].some(char => glyphs.get(char)?.d)) return status('Cần có chữ nguyên âm gốc trước, ví dụ A, E, O hoặc a, e, o.');
  const { marks, stem } = deriveMarkSamples(glyphs);
  const next = new Map(glyphs);
  // Dấu người dùng vẽ trong chữ có dấu lấy từ ảnh được dùng trước; chỉ loại dấu ảnh chưa có mới dựng từ nét.
  const fromLetters = marksFromImageLetters(glyphs);
  for (const [mark, sample] of fromLetters) if (!glyphs.get(mark)?.locked) next.set(mark, sample);
  const madeMarks = [...marks].filter(([mark]) => !real(glyphs.get(mark)) && !fromLetters.has(mark));
  for (const [mark, glyph] of madeMarks) next.set(mark, glyph);
  const barred = deriveBarredD(next, stem).filter(glyph => !real(glyphs.get(glyph.char)));
  for (const glyph of barred) next.set(glyph.char, glyph);
  // Chữ cái gốc còn trống: dựng từ bộ phận chữ đã có (n → h m u r, o → b d p q c e, E → F L …).
  const letters = deriveLetters(next).filter(glyph => charset.includes(glyph.char));
  for (const glyph of letters) next.set(glyph.char, glyph);
  const generated = composeVietnamese(next);
  for (const glyph of generated) next.set(glyph.char, glyph);
  // Dấu câu, ký hiệu còn trống: dựng từ nét chữ (chỉ điền ô trống).
  const symbols = deriveSymbols(next);
  for (const glyph of symbols) next.set(glyph.char, glyph);
  glyphs = keepLocked(next);
  refresh();
  // Tự kiểm quy tắc dấu của skill ngay sau khi ghép.
  const fitted = generated.filter(glyph => glyph.markFit);
  const squeezed = fitted.filter(glyph => glyph.markFit.factor < 1).map(glyph => glyph.char);
  const overflow = fitted.filter(glyph => !glyph.markFit.fits).map(glyph => glyph.char);
  const ruleReport = ` Dấu dựng theo chuẩn đo từ 20 font đã Việt hóa: cao theo x-height, rộng theo chữ o, dày theo nét thân, khoảng hở dấu–thân như font chuyên nghiệp; dấu hoa gần bằng dấu thường và sát thân hơn; hai tầng dấu xếp như font chuyên nghiệp (sắc, hỏi lệch phải mũ, huyền lệch trái, ngã trên mũ, dấu thanh giữa trên trăng), đỉnh cụm trong chiều cao dòng`
    + (squeezed.length ? ` (thu nhỏ thêm để vừa dòng: ${squeezed.join(' ')})` : '') + '.'
    + (overflow.length ? ` CẦN XEM: ${overflow.join(' ')} vẫn vượt chiều cao dòng.` : '');
  const message = `Đã dựng ${madeMarks.length} dấu mẫu theo độ dày nét ${Math.round(stem)} đơn vị`
    + (barred.length ? `, ${barred.map(glyph => glyph.char).join(' ')}` : '')
    + ` và ghép ${generated.length} chữ có dấu.` + ruleReport
    + (letters.length ? ` Dựng ${letters.length} chữ cái còn thiếu từ bộ phận chữ đã có: ${letters.map(g => g.char + '←' + g.derivedFrom).join(' ')}.` : '')
    + (symbols.length ? ` Dựng thêm ${symbols.length} dấu câu, ký hiệu còn thiếu: ${symbols.map(g => g.char).join(' ')}.` : '')
    + auditMessage(auditMarks(glyphs, { slant: measureSlant(glyphs) }))
    + ' Đây là nét suy luận: hãy xem lại trong Thử tiêu đề, chỉnh bằng Chỉnh dấu hoặc thay bằng ảnh bảng dấu nếu có.'
    // SKILL.md (Bảng quy tắc): sau mọi thao tác dựng, sửa những gì sửa được an toàn trên chữ vừa dựng rồi đối chiếu cả bảng
    // (lỗi cũ: bước này chỉ đối chiếu, không sửa).
    + enforceRules([...madeMarks.map(([mark]) => mark), ...barred, ...letters, ...generated, ...symbols].map(item => item.char || item));
  refresh();
  status(message);
  reportDesign(message);
});

$('apply-lowercase-horns').addEventListener('click', () => {
  if (busy || loading) return;
  const generated = applyCompactLowercaseHorns(glyphs);
  if (!generated.length) return status('Cần có chữ o hoặc u thường trước khi ghép râu.');
  for (const glyph of generated) glyphs.set(glyph.char, glyph);
  const message = `Đã ghép râu đầu tròn cho: ${generated.map(glyph => glyph.char).join(' ')}.` + enforceRules(generated.map(glyph => glyph.char));
  refresh();
  status(message);
  reportDesign(message);
});

$('apply-tone-samples').addEventListener('click', () => {
  if (busy || loading) return;
  const generated = applyReferenceMarks(glyphs, selected);
  if (!generated.length) return status('Chọn một chữ gốc có biến thể, hoặc chọn một dấu mẫu đã thêm.');
  for (const glyph of generated) glyphs.set(glyph.char, glyph);
  const message = `Đã áp dụng dấu mẫu cho: ${generated.map(glyph => glyph.char).join(' ')}.` + enforceRules(generated.map(glyph => glyph.char));
  refresh();
  status(message);
  reportDesign(message);
});

$('accents').addEventListener('click', () => {
  if (busy) return;
  // Chưa có dấu mẫu nào từ ảnh: dựng dấu từ nét chữ đã có thay vì báo lỗi.
  const hasMarkSamples = [...toneSamples.keys()].some(mark => glyphs.get(mark)?.d && !glyphs.get(mark).nativeSize);
  if (!hasMarkSamples) { $('derive-marks').click(); return; }
  const generated = composeVietnamese(glyphs,()=>false,{requireReferenceMarks:[...glyphs.values()].some(g=>g.origin==='direct')});
  if (!generated.length) return status('Hãy thêm chữ nguyên âm gốc trước, ví dụ A, E hoặc O.');
  for (const glyph of generated) glyphs.set(glyph.char, glyph);
  // Bảng quy tắc skill chạy sau mọi thao tác dựng, cả nhánh ghép bằng dấu mẫu đã có (lỗi cũ: nhánh này chỉ đối chiếu số đo).
  const ruleNote = enforceRules(generated.map(glyph => glyph.char));
  refresh();
  status(`Đã ghép ${generated.length} ký tự có dấu từ nguyên âm hiện có. Bạn có thể thay bằng nét lấy từ ảnh.` + auditMessage(auditMarks(glyphs, { slant: measureSlant(glyphs) })) + ruleNote);
});
$('remove').addEventListener('click', () => {
  if (busy || !glyphs.has(selected)) return;
  glyphs.delete(selected);
  updateComposed();
  refresh();
});
$('reset').addEventListener('click', async () => {
  if (busy || !(await ask('Xóa tất cả ký tự trong bộ đang làm?', { ok: 'Xóa bộ chữ' }))) return;
  glyphs.clear();
  recentGlyphs.clear();
  importedMetrics = undefined;
  loadedSourceBlob = undefined;
  selected = undefined;
  refresh();
  status('Đã xóa bộ ký tự.');
});
function compareStrokes(apply) {
  if (busy || loading) return;
  const result = $('stroke-result');
  const [first, second] = [...$('stroke-letters').value.normalize('NFC').replace(/\s+/gu, '')];
  const target = usableGlyph(first), reference = usableGlyph(second);
  if (!target || !reference || first === second) {
    result.textContent = 'Nhập hai chữ khác nhau đã có trong bộ font, ví dụ E F.';
    return;
  }
  const a = measureLeftStem(fitLowercaseT(target)), b = measureLeftStem(fitLowercaseT(reference));
  if (!a || !b) {
    result.textContent = 'Không đo được hai nét dọc để so. Thử các chữ có thân đứng như E, F hoặc H.';
    return;
  }
  if (!apply) {
    const difference = Math.round((a.width / b.width - 1) * 100);
    result.textContent = `${first}: ${a.width} · ${second}: ${b.width} đơn vị font. ${difference
      ? `${first} ${difference > 0 ? 'dày' : 'mảnh'} hơn ${second} khoảng ${Math.abs(difference)}%.`
      : 'Hai nét có độ dày bằng nhau theo phép đo.'}`;
    return;
  }
  const updated = matchLeftStem(target, reference);
  if (!updated) {
    result.textContent = 'Hai nét đã gần bằng nhau hoặc chữ đầu không phù hợp để cân tự động.';
    return;
  }
  glyphs.set(first, { ...updated, source: 'Ảnh mẫu' });
  updateComposed();
  refresh();
  result.textContent = `Đã cân nét dọc của ${first} theo ${second}. Bấm Đo nét để kiểm tra lại.`;
}

$('balance-font-strokes')?.addEventListener('click', () => {
  if (busy || loading) return;
  const result = $('stroke-result');
  const active = charset.map(usableGlyph).filter(Boolean);
  const { updates, measured } = balanceFontStrokes(active);
  if (!updates.length) {
    result.textContent = `Đã đo ${measured} chữ có nét đứng ổn định. Chưa có nét phù hợp để cân tự động.`;
    return;
  }
  for (const glyph of updates) glyphs.set(glyph.char, glyph);
  updateComposed();
  refresh();
  result.textContent = `Đã đo ${measured} chữ và cân nét ${updates.length} chữ: ${updates.map(glyph => glyph.char).join(' ')}.`;
});
$('measure-strokes')?.addEventListener('click', () => compareStrokes(false));
$('match-strokes')?.addEventListener('click', () => compareStrokes(true));
$('sample').addEventListener('input', () => { save(); renderPreview(); });
$('size').addEventListener('input', renderPreview);
$('name').addEventListener('input', () => { save(); scheduleFont(); });
$('spacing').addEventListener('input', () => { save(); renderPreview(); scheduleFont(); });
renderGlyphs();
renderPreview();
scheduleFont();
if (!glyphs.size) {
  const recovery=document.createElement('div');
  recovery.className='panel';
  recovery.setAttribute('role','status');
  recovery.style.marginBottom='12px';
  const heading=document.createElement('h3');heading.textContent='Chưa tải bộ font đang làm';
  const explanation=document.createElement('p');
  explanation.textContent='Các ô chữ trống vì trình duyệt chưa có glyph trong dự án hiện tại. Chữ trong ô Thử tiêu đề có thể là font dự phòng. Đừng dựng lại từ đầu nếu bạn đã lưu font.';
  const open=document.createElement('button');open.type='button';open.className='primary';
  open.textContent='Mở Bộ sưu tập Font';open.addEventListener('click',()=>$('open-font-collection').click());
  const note=document.createElement('p');note.className='help';
  note.textContent='Trong Bộ sưu tập, chọn font đã lưu để mở lại; hoặc Nhập TTF / OTF đã xuất. Dữ liệu dự án được lưu riêng trong từng trình duyệt.';
  recovery.append(heading,explanation,open,note);
  $('editor-font-check').replaceChildren(recovery);
}

async function restoreReferenceProject() {
  try {
    const { images, state } = await loadReferences();
    if (!images.length) return;
    references.push(...images.map((file, index) => ({ file, settings: state.settings?.[index] })));
    legacyReview = Array.isArray(state.review) ? state.review : [];
    inventory = state.inventory;
    const index = state.activeReference >= 0 && state.activeReference < references.length ? state.activeReference : 0;
    await showReference(index);
    if (inventory) inventoryReport();
    refresh();
    $('reference-storage').textContent = `Đã khôi phục ${images.length} ảnh và phần duyệt đã lưu.`;
  } catch {
    $('reference-storage').textContent = 'Không đọc được ảnh đã lưu trên trình duyệt này.';
  } finally {
    restoring = false;
    renderReferences();
  }
}

restoreReferenceProject();

$('expand-preview').addEventListener('click', () => {
  const preview = $('preview');
  const dialog = $('full-preview');
  const copy = dialog.querySelector('.preview-copy');
  copy.style.cssText = preview.style.cssText;
  copy.replaceChildren(...Array.from(preview.childNodes, node => node.cloneNode(true)));
  dialog.showModal();
  copy.scrollTop = 0;
});

const fixedWorkspace = matchMedia('(min-width:1024px) and (min-height:520px)');
$('sample').addEventListener('wheel', event => {
  if (fixedWorkspace.matches) event.preventDefault();
}, { passive: false });

const fontCollection = setupFontCollection(() => currentFontExport, async (record, { editOnly = false, original } = {}) => {
  if (busy || loading) throw new Error('Hãy đợi tác vụ đang chạy hoàn tất.');
  if (glyphs.size && !(await ask('Mở font này để chỉnh sửa? Bộ chữ đang làm sẽ được thay bằng font đã chọn.', { ok: 'Mở font' }))) throw new Error('Chưa mở: bạn đã chọn Hủy, bộ chữ đang làm giữ nguyên.');
  const imported = await importFontFile(record);
  const missingBefore = charset.filter(char => !imported.glyphs.has(char));
  const drafts = new Map(imported.glyphs);
  if (!editOnly) {
    importAccentSamples(drafts);
    for (const glyph of composeVietnamese(drafts)) {
      if (!drafts.has(glyph.char)) drafts.set(glyph.char, glyph);
    }
  }
  // Mở lại bản Việt hóa: chữ font gốc không có là do Xưởng ghép trước đây. Đánh dấu là chữ ghép (không phải nét nhà
  // thiết kế) và bỏ dấu mẫu Xưởng đã dựng, để Tạo dấu tiếng Việt dựng lại theo chuẩn mới nhất.
  let regenerable = 0;
  const manual = new Set(editOnly ? record.manualChars || [] : []);
  if (editOnly && original) {
    const base = (await importFontFile(original)).glyphs;
    for (const [char, glyph] of [...drafts]) {
      if (base.has(char)) continue;
      if (toneSamples.has(char)) { drafts.delete(char); continue; }
      if (manual.has(char)) continue;
      if ([...char.normalize('NFD')].length > 1 || char === 'Đ' || char === 'đ') { drafts.set(char, { ...glyph, source: 'Ghép dấu', origin: 'inferred' }); regenerable++; }
    }
  }
  // Chữ đã sửa tay trong Font Lab trước khi lưu vào Bộ sưu tập: khóa lại để Tạo dấu tiếng Việt, Hoàn thiện font không ghép đè.
  for (const char of manual) { const glyph = drafts.get(char); if (glyph?.d) drafts.set(char, { ...glyph, locked: true, approved: true, manualEdit: { restored: true } }); }
  auditRepairPending=false; markCandidates=[];
  recentGlyphs.clear();
  glyphs = new ProtectedGlyphMap(drafts);
  // Font do chính người dùng dựng từ ảnh trong Xưởng rồi lưu lại (không phải file font của nhà thiết kế khác):
  // fromImages đã từng đúng, hoặc bản lưu từ trình sửa mang tên riêng (không phải bản Việt hóa XFVN của font khác).
  const ownFont = editOnly && await isOwnRecord(record, original);
  importedMetrics = { ...imported.metrics, sourceRecordId: editOnly ? record.id : undefined, ...(editOnly ? imported.styleMetrics : {}), ...(ownFont ? { ownFont: true } : {}) };
  loadedSourceBlob = record.blob;
  $('name').value = (record.name + (editOnly ? '' : ' Việt hóa')).slice(0, 40);
  $('sample').value = $('sample').defaultValue;
  $('spacing').value = 0;
  refresh();
  const added = missingBefore.filter(char => glyphs.has(char));
  const missing = charset.filter(char => !glyphs.has(char));
  const audit = editOnly ? '' : auditMessage(auditMarks(glyphs, { slant: measureSlant(glyphs) }));
  // Chữ còn thiếu xem bằng bộ lọc Còn thiếu ở Bộ ký tự; ở đây chỉ báo việc cần làm.
  status(editOnly
    ? (regenerable ? regenerable + ' chữ có dấu do Xưởng ghép (so với ' + original.name + '); bấm Tạo dấu tiếng Việt để ghép lại theo chuẩn mới.'
      : record.name.startsWith('XFVN - ') && !original ? 'Không thấy font gốc trong Bộ sưu tập nên mọi chữ được giữ như nét gốc; thêm font gốc vào Bộ sưu tập để ghép lại dấu.' : '')
    : 'Đã thêm ' + added.length + ' ký tự.' + (missing.length ? '' : ' Đã đủ bộ ký tự tiếng Việt.') + audit);
  return true;
}, runFontQuality);

// Accent changes are previewed from the current outlines, then committed once.

function previewMarkSpacing() {
  if (auditRepairPending) return;
  if ($('mark-spacing-tools').hidden) return;
  auditRepairPending = false;
  const gap = Number($('mark-gap').value), scale = Number($('mark-scale').value) / 100;
  $('mark-gap-value').textContent = gap;
  $('mark-scale-value').textContent = Math.round(scale * 100);
  const scope = $('mark-spacing-scope').value;
  markCandidates = [];
  let skipped = 0;
  for (const [char, glyph] of glyphs) {
    const decomposition = [...char.normalize('NFD')];
    if (decomposition.length < 2 || !decomposition.slice(1).some(mark => mark !== '\u031b')) continue;
    if (scope === 'selected' && char !== selected) continue;
    if (scope === 'upper' && char !== char.toUpperCase()) continue;
    if (scope === 'lower' && char !== char.toLowerCase()) continue;
    const root = decomposition[0];
    const baseChar = decomposition.includes('\u031b') ? (root + '\u031b').normalize('NFC') : root;
    const adjusted = adjustGlyphMarks(glyph, glyphs.get(baseChar), { gap, scale });
    if (adjusted) markCandidates.push({ char, before: glyph, after: adjusted });
    else skipped++;
  }
  const proof = $('mark-spacing-proof'); proof.replaceChildren();
  const examples = markCandidates.filter(item => item.char === selected);
  for (const item of markCandidates) if (examples.length < 6 && !examples.includes(item)) examples.push(item);
  const ns = 'http://www.w3.org/2000/svg';
  for (const { char, before, after } of examples.slice(0, 6)) {
    const a = glyphBounds(before), b = glyphBounds(after);
    const left = Math.min(a.x,b.x)-30, bottom = Math.min(a.y,b.y)-30;
    const right = Math.max(a.x+a.width,b.x+b.width)+30, top = Math.max(a.y+a.height,b.y+b.height)+30;
    const card = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = char; card.append(title);
    for (const [label, glyph] of [['Trước', before], ['Sau', after]]) {
      const figure = document.createElement('figure'), caption = document.createElement('figcaption'); caption.textContent = label;
      const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `${left} ${-top} ${right-left} ${top-bottom}`);
      const path = document.createElementNS(ns, 'path'); path.setAttribute('d', glyph.d); path.setAttribute('transform','scale(1,-1)');
      svg.append(path); figure.append(svg, caption); card.append(figure);
    }
    proof.append(card);
  }
  $('mark-spacing-report').textContent = `${markCandidates.length} chữ có thể chỉnh.` + (skipped ? ` Bỏ qua ${skipped} chữ do dấu dính thân hoặc thiếu chữ gốc.` : '')
    + (!markCandidates.length ? ' Hãy chọn chữ có dấu hoặc đổi phạm vi.' : ' Xem trước tối đa 6 chữ; chỉ thay đổi khi bấm Áp dụng.');
  $('apply-mark-spacing').disabled = !markCandidates.length || (gap === 0 && scale === 1);
}
// Bấm Chỉnh dấu: tự chỉnh theo quy tắc dấu trong skill trước, thanh trượt chỉ để tinh chỉnh thêm nếu muốn.
// Chỉ chỉnh chữ ghép/suy luận; chữ lấy từ ảnh giữ nguyên nét gốc.
function autoFixAllMarks() {
  const changed = [], counts = { gap: 0, fit: 0, side: 0 };
  let kept = 0, real = 0;
  for (const [char, glyph] of glyphs) {
    const parts = [...char.normalize('NFD')];
    if (parts.length < 2 || !parts.slice(1).some(mark => mark !== '̛')) continue;
    if (glyph.locked || glyph.origin === 'direct' || ['Ảnh mẫu', 'Ảnh làm sạch', 'Font gốc'].includes(glyph.source)) { real++; continue; }
    const baseChar = parts.includes('̛') ? (parts[0] + '̛').normalize('NFC') : parts[0];
    const result = autoFixMarks(glyph, glyphs.get(baseChar));
    if (!result) continue;
    if (!result.changes.length) { kept++; continue; }
    for (const change of result.changes) counts[change]++;
    changed.push({ char, before: glyph, after: result.glyph });
  }
  for (const { char, after } of changed) glyphs.set(char, after);
  if (changed.length) { lastMarkChange = changed; $('undo-mark-spacing').disabled = false; repairRecheckPending = true; refresh(); }
  const message = 'Đã tự chỉnh dấu theo quy tắc trong skill: ' + changed.length + ' chữ được chỉnh'
    + (counts.gap ? ', ' + counts.gap + ' chữ đưa khoảng hở dấu về chuẩn (chữ thường 28, chữ hoa 22, dấu nặng 28)' : '')
    + (counts.fit ? ', ' + counts.fit + ' chữ thu dấu cho vừa chiều cao dòng' : '')
    + (counts.side ? ', ' + counts.side + ' chữ nới lề vì dấu tràn sang chữ bên cạnh' : '')
    + '. ' + kept + ' chữ đã đạt sẵn.' + (real ? ' Giữ nguyên ' + real + ' chữ lấy từ ảnh.' : '')
    + (changed.length ? ' Bấm Hoàn tác chỉnh dấu nếu muốn quay lại. Thanh trượt bên dưới chỉ dùng khi bạn muốn chỉnh thêm.' : '');
  status(message); reportDesign(message);
  return message;
}

$('open-mark-spacing').addEventListener('click', () => {
  auditRepairPending=false;
  const autoMessage = autoFixAllMarks();
  $('mark-spacing-tools').hidden = false;
  $('mark-spacing-scope').value = selected && [...selected.normalize('NFD')].length > 1 ? 'selected' : 'all';
  previewMarkSpacing();
  $('mark-spacing-report').textContent = autoMessage;
  $('mark-spacing-tools').scrollIntoView({ block: 'nearest' });
});
$('close-mark-spacing').addEventListener('click', () => { auditRepairPending=false; completionPending=false; markCandidates=[]; $('mark-spacing-tools').hidden = true; });
for (const id of ['mark-gap','mark-scale','mark-spacing-scope']) $(id).addEventListener('input', () => { auditRepairPending=false; completionPending=false; previewMarkSpacing(); });
$('apply-mark-spacing').addEventListener('click', () => {
  if (!auditRepairPending) previewMarkSpacing();
  if (!markCandidates.length) return;
  auditRepairPending = false;
  lastMarkChange = markCandidates.slice();
  if (lastMarkChange.some(({char,before}) => glyphs.get(char) !== before)) { status('Bộ chữ đã thay đổi. Hãy đánh giá lại trước khi áp dụng.'); return; }
  for (const {char, after} of lastMarkChange) glyphs.set(char, after);
  const completion = completionPending;
  completionPending = false; completionRun = completion;
  // Lượt Hoàn thiện: sau khi áp dụng thì kiểm file và tự dời dấu quá sát thân (gộp vào cùng một lần Hoàn tác).
  repairRecheckPending = completion ? { propose: true } : true;
  if (completion) $('mark-spacing-proof').replaceChildren();
  refresh();
  $('mark-gap').value = 0; $('mark-scale').value = 100;
  previewMarkSpacing();
  $('undo-mark-spacing').disabled = false;
  status(completion ? 'Đã áp dụng ' + lastMarkChange.length + ' thay đổi của lượt Hoàn thiện font. Đang kiểm file font… Bấm Hoàn tác chỉnh dấu để quay lại toàn bộ.'
    : 'Đã chỉnh dấu cho ' + lastMarkChange.length + ' chữ. Thân chữ và khoảng cách giữa các chữ được giữ nguyên.');
});
$('undo-mark-spacing').addEventListener('click', () => {
  for (const {char, before, after} of lastMarkChange) if (glyphs.get(char) === after) { if (before) glyphs.set(char, before); else glyphs.delete(char); }
  lastMarkChange = []; completionRun = false; repairRecheckPending = true; refresh(); previewMarkSpacing(); $('undo-mark-spacing').disabled = true;
});

$('rule-search').addEventListener('input', () => {
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');
  const query = normalize($('rule-search').value.trim());
  let visible = 0;
  for (const card of document.querySelectorAll('.rule-card')) {
    card.hidden = !normalize(card.textContent).includes(query);
    if (!card.hidden) visible++;
  }
  $('rule-search-status').textContent = query ? visible + ' mục phù hợp.' : '';
});
for (const link of document.querySelectorAll('.rules-index a')) link.addEventListener('click', event => {
  event.preventDefault();
  $('rule-search').value = ''; $('rule-search').dispatchEvent(new Event('input'));
  document.querySelector(link.getAttribute('href'))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});


function renderRuleQuality(result) {
  for (const proof of document.querySelectorAll('.quality-vector-proof')) proof.remove();
  for (const [key,text] of Object.entries(qualityProofs)) {
    const card = document.getElementById('rule-' + key); if (!card) continue;
    const figure = document.createElement('figure'); figure.className = 'quality-vector-proof';
    const title = document.createElement('strong'); title.textContent = 'Font đang kiểm: ' + result.record.name;
    const {svg,missing} = makeQualitySVG(result.font,text);
    const caption = document.createElement('figcaption'); caption.textContent = text + (missing.length ? ' · Thiếu: ' + missing.join(' ') : '') + ' · Đường đỏ: chân chữ; nét đứt: cao chữ hoa.';
    figure.append(title,svg,caption); card.insertBefore(figure,card.querySelector('.rule-illustration'));
  }
}
function isQualityEditorSource(result) {
  return result && (result.record.blob === currentFontExport?.blob || result.record.blob === loadedSourceBlob
    || result.record.id != null && result.record.id === importedMetrics?.sourceRecordId);
}
function inspectQualityText(text,result) {
  if (!isQualityEditorSource(result)) return;
  $('sample').value = text.slice(0,240);
  const char = [...text].find(char => glyphs.has(char));
  if (char) selected = char;
  save(); renderGlyphs(); renderPreview();
}
async function openQualityFont(result) {
  if (isQualityEditorSource(result)) { $('open-font-workspace').click(); return; }
  if (await fontCollection.editRecord(result.record)) editorFontCheck.setResults([result]);
}
// Ký tự không quy tắc nào dựng được (@ & ...): nhờ Gemini vẽ theo đúng nét của chính font, rồi tách nét như ảnh mẫu.
// Ảnh tham chiếu dựng từ chữ đang có trong font (không lấy font khác). Kết quả là ảnh mẫu mới trong danh sách ảnh,
// chữ tách ra đánh dấu "AI vẽ" để duyệt; Hoàn tác chỉnh dấu không gỡ phần này (xóa ký tự nếu không dùng).
const AI_DRAWABLE = '@&#$%*^~_=|\\[]{}<>?!';
function renderFontSample(map, text) {
  const canvas = document.createElement('canvas'), scale = .16, pad = 40;
  const list = [...text].map(char => map.get(char)).filter(g => g?.d);
  canvas.width = Math.ceil(pad * 2 + list.reduce((w, g) => w + (g.advance || 500) * scale, 0));
  canvas.height = Math.ceil(1250 * scale + pad * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#000';
  let x = pad;
  for (const glyph of list) {
    ctx.save(); ctx.translate(x, pad + 1000 * scale); ctx.scale(scale, -scale); ctx.fill(new Path2D(glyph.d)); ctx.restore();
    x += (glyph.advance || 500) * scale;
  }
  return canvas;
}
async function drawMissingWithAI(missing) {
  const chars = missing.filter(char => AI_DRAWABLE.includes(char)).slice(0, 9);
  const key = geminiKey.value.trim();
  if (!chars.length) return;
  if (!key || !connectedGeminiModel) { status($('status').textContent + ' Kết nối Gemini để Xưởng nhờ AI vẽ ' + chars.join(' ') + ' theo nét của font.'); return; }
  const present = [...'ABCDEGHKMNORSabdegkmnorsy0123456789?!'].filter(char => glyphs.get(char)?.d).join('');
  if (present.length < 6) return;
  try {
    status('Hoàn thiện font: đang nhờ Gemini vẽ ' + chars.join(' ') + ' theo nét của font…');
    const sample = renderFontSample(glyphs, present);
    const drawn = await redrawFontImage([sample], { mode: 'row', chars }, key, new AbortController().signal);
    const blob = await new Promise(resolve => drawn.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'ai-' + chars.length + '-ky-tu.png', { type: 'image/png' });
    const index = references.length;
    addFiles([file]);
    for (let i = 0; i < 100 && (activeReference !== index || loading || !source); i++) await new Promise(r => setTimeout(r, 100));
    if (activeReference !== index || !source) throw new Error('chưa mở được ảnh AI vẽ');
    $('chars').value = chars.join(' ');
    crop = null;
    await trace(false);
    const made = chars.filter(char => glyphs.get(char)?.d);
    for (const char of made) { const g = glyphs.get(char); if (!g.aiDrawn) glyphs.set(char, { ...g, aiDrawn: true, approved: false }); }
    refresh();
    status('Gemini đã vẽ ' + (made.join(' ') || 'chưa tách được ký tự nào') + ' theo nét của font (ảnh AI ở danh sách ảnh mẫu). Đây là nét AI vẽ: hãy xem ở Thử tiêu đề; không dùng thì xóa ký tự đó.'
      + (made.length < chars.length ? ' Chưa tách được: ' + chars.filter(c => !made.includes(c)).join(' ') + ' — khoanh từng ký tự trong ảnh AI rồi bấm Thêm một chữ.' : ''));
  } catch (error) {
    status('Gemini chưa vẽ được ' + chars.join(' ') + ': ' + error.message + '. Font vẫn giữ nguyên.');
  }
}
// Sau mỗi thao tác dựng: sửa theo bảng quy tắc (rule-check.js) những chữ vừa dựng, rồi đối chiếu toàn bộ bảng quy tắc.
// Trả về câu báo kết quả để nối vào dòng trạng thái.
function enforceRules(chars) {
  const editable = glyph => glyph && !glyph.locked && !glyph.approved && (importedMetrics?.ownFont || glyph.source !== 'Font gốc');
  const { map, changed } = fixRules(glyphs, { editable, chars: chars ? new Set(chars) : undefined });
  if (changed.length) glyphs = keepLocked(map);
  const result = checkRules(glyphs, { editable });
  return (changed.length ? ' Sửa theo quy tắc: ' + changed.join(' ') + '.' : '') + ruleMessage(result, { only: ['dot-i', 'colon-dots', 'dot-below', 'punct-place', 'heights', 'horn', 'horn-pair', 'marks'] });
}
// Font do chính người dùng dựng trong Xưởng (không phải nét của nhà thiết kế khác):
// - file Xưởng xuất mang mô tả "Made with draw-your-font" (src/assemble.js), kể cả khi được Nhập TTF vào Bộ sưu tập;
// - bản Việt hóa / kiểu family sinh ra (tên XFVN, "Việt hóa") cũng mang dấu đó, nên xét font gốc của nó
//   (generatedFrom, hoặc bản gốc được ghép cặp) — ví dụ "XFVN - Sử Việt Kiêu Hùng Regular Italic" sinh từ "Sử Việt Kiêu Hùng".
async function isOwnRecord(record, original, depth = 0) {
  if (!record?.blob || depth > 4) return false;
  if (record.fromImages === true) return true;
  if (/^XFVN - /.test(record.name) || /Việt hóa/i.test(record.name)) {
    const source = record.generatedFrom != null ? await getFontRecord(record.generatedFrom) : original;
    return source && source.id !== record.id ? isOwnRecord(source, undefined, depth + 1) : false;
  }
  return (await importFontFile(record)).madeByXuong;
}
// Nút "Hoàn thiện font chữ": chạy lần lượt mọi bước sửa theo quy tắc skill, áp dụng luôn rồi kiểm file; một lần Hoàn tác.
// Chữ đã khóa, đã duyệt giữ nguyên.
let completionRun = false, completionPending = false;
async function fixByRules() {
  if (busy || loading || !glyphs.size) return false;
  busy = true;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const real = glyph => glyph && (glyph.locked || glyph.origin === 'direct' || ['Ảnh mẫu', 'Ảnh làm sạch', 'Font gốc'].includes(glyph.source));
    const editable = glyph => glyph && !glyph.locked && !glyph.approved;
    const slant = measureSlant(glyphs), before = auditMarks(glyphs, { slant });
    const snapshot = new Map(glyphs), next = new Map(glyphs);
    // 1. Chiều cao: chân đúng đường chân, đỉnh cùng nhóm bằng nhau.
    status('Hoàn thiện font: chuẩn hóa chiều cao…'); await pause();
    // Font mở từ Bộ sưu tập trước khi có nhận diện (thông tin lưu trong trình duyệt không có ownFont): đọc lại file đã lưu.
    if (importedMetrics && !importedMetrics.ownFont && importedMetrics.sourceRecordId != null) {
      try { if (await isOwnRecord(await getFontRecord(importedMetrics.sourceRecordId))) importedMetrics = { ...importedMetrics, ownFont: true }; }
      catch { /* không đọc được: giữ như font nhà thiết kế khác */ }
    }
    const own = !!importedMetrics?.ownFont;   // font người dùng tự dựng, mở lại từ Bộ sưu tập: sửa như nét dò ảnh
    const ours = glyph => own || glyph.source !== 'Font gốc';
    const heights = normalizeHeights(next, glyph => editable(glyph) && (own || fromImage(glyph) || glyph.origin === 'inferred'));
    for (const glyph of heights.changed) next.set(glyph.char, glyph);
    // 2. Viền không xù, đường cong không gấp khúc (đo bằng outlineDefects: xù, đoạn ngắn, gần đứng/ngang, gấp khúc).
    // Áp cho mọi nét không phải font vẽ sẵn: dò ảnh, chữ dựng từ bộ phận, ký tự dựng. Thử mức Nhẹ → Vừa → Mạnh,
    // lấy mức đầu tiên hết lỗi (hoặc ít lỗi nhất); cleanOutline giữ góc thật, lòng chữ và diện tích (lệch ≤ 4%).
    const cleaned = [], rough = [], time = new Date().toISOString();
    const smooth = async list => {
      for (const [index, glyph] of list.entries()) {
        if (index % 8 === 0) { status('Hoàn thiện font: làm mượt nét ' + (index + 1) + '/' + list.length + '…'); await pause(); }
        const before = outlineDefects(glyph.d);
        if (!before.total) continue;
        let best = null;
        for (const tolerance of [.75, 1.5, 3]) {
          try {
            const result = cleanOutline(glyph, { tolerance }), q = outlineDefects(result.d);
            if (!best || q.total < best.q.total) best = { result, q };
            if (!q.total) break;
          } catch { /* mức này lệch quá giới hạn: thử mức khác */ }
        }
        if (!best || best.q.total >= before.total) { rough.push(glyph.char); continue; }
        const { outlineUndo, ...previous } = glyph;
        next.set(glyph.char, { ...glyph, d: best.result.d, outlineUndo: previous, outlineCleanup: { ...best.result.stats, time, batch: true },
          version: (glyph.version || 0) + 1, proof: undefined, identityVersion: undefined, pixelOutline: undefined });
        if (!cleaned.includes(glyph.char)) cleaned.push(glyph.char);
        if (best.q.total) rough.push(glyph.char);
      }
    };
    const smoothable = glyph => glyph?.d && editable(glyph) && ours(glyph) && glyph.source !== 'Ghép dấu';
    status('Hoàn thiện font: bổ sung chữ, dấu và ký tự…'); await pause();
    // 3. Dấu mẫu, Đ, chữ cái gốc từ bộ phận, chữ có dấu, dấu câu và ký tự đặc biệt.
    const hasVowel = ['A', 'E', 'O', 'a', 'e', 'o'].some(char => next.get(char)?.d);
    // Dấu mẫu của chính font, theo thứ tự: dấu người dùng vẽ trong chữ có dấu lấy từ ảnh (ẩ, ỏ, ê…) → dấu Xưởng dựng từ
    // nét của font theo quy tắc skill (chỉ loại dấu ảnh chưa có). Không dùng dấu, chữ của font khác.
    const markChanged = new Set();
    if (hasVowel) {
      for (const [mark, sample] of marksFromImageLetters(next)) {
        const current = next.get(mark);
        if (current?.locked || current?.fromLetter === sample.fromLetter && current?.d === sample.d) continue;
        if (current?.d && current.source !== 'Dựng từ nét chữ' && !current.fromLetter) continue;   // dấu mẫu từ bảng dấu, font gốc: giữ
        next.set(mark, sample); markChanged.add(mark);
      }
      // Dấu còn thiếu, và dấu Xưởng đã dựng từ nét (chưa khóa, chưa duyệt) nay dựng ra khác: dựng lại theo quy tắc hiện
      // hành, để dấu theo đúng kiểu nét của font (nét đều / thanh-đậm, đầu nét). Lỗi 25/11/2026: dấu Migra dựng khi còn
      // đo nhầm tương phản vẫn nét đều sau Hoàn thiện vì chỉ dấu thiếu mới được dựng.
      const stale = mark => { const current = next.get(mark);
        return current?.d && current.source === 'Dựng từ nét chữ' && !current.locked && !current.approved && !current.fromLetter; };
      const missing = [...toneSamples.keys()].filter(mark => !next.get(mark)?.d || stale(mark));
      if (missing.length) {
        const { marks, stem } = deriveMarkSamples(next);
        for (const mark of missing) if (marks.get(mark) && marks.get(mark).d !== next.get(mark)?.d) { next.set(mark, marks.get(mark)); markChanged.add(mark); }
        for (const glyph of deriveBarredD(next, stem)) if (!glyphs.get(glyph.char)?.d) next.set(glyph.char, glyph);
      }
    }
    const letters = deriveLetters(next).filter(glyph => charset.includes(glyph.char) && !real(glyphs.get(glyph.char)));
    for (const glyph of letters) next.set(glyph.char, glyph);
    // Chữ dựng từ bộ phận theo quy tắc cũ nay đã bỏ (ví dụ I chép từ l): gỡ khỏi bộ chữ để ô trống chờ ảnh mẫu.
    for (const [char, glyph] of [...next]) if (glyph?.source === 'Dựng từ bộ phận' && !glyph.locked && !glyph.approved && !letters.some(l => l.char === char)) next.delete(char);
    await smooth([...next.values()].filter(smoothable));   // chữ gốc (cả chữ vừa dựng) trước khi ghép dấu
    const failing = new Set((before?.issues || []).map(issue => issue.char).filter(char => glyphs.get(char)?.d && !real(glyphs.get(char))));
    // Bảng quy tắc skill: râu Xưởng ghép lệch chỗ nối (mọc giữa nét, vắt qua chân serif) hoặc rời thân thì ghép lại cả
    // nhóm chữ có râu do Xưởng ghép, theo quy tắc nối râu hiện tại.
    const hornRow = checkRules(glyphs).rows.find(row => row.id === 'horn');
    if (hornRow?.issues.some(issue => glyphs.get(issue.char)?.source === 'Ghép dấu'))
      for (const [char, glyph] of glyphs) if (glyph?.source === 'Ghép dấu' && char.normalize('NFD').includes('̛')) failing.add(char);
    const reshaped = new Set([...heights.changed.map(g => g.char), ...cleaned]);
    const generated = hasVowel ? composeVietnamese(next, char => failing.has(char)
      || (reshaped.has(char.normalize('NFD')[0]) && glyphs.get(char)?.source === 'Ghép dấu')
      // ỵ do Xưởng ghép trước khi có luật "nặng tránh đuôi y" (design-rules.md): ghép lại theo luật mới.
      || (char === 'ỵ' && glyphs.get(char)?.source === 'Ghép dấu')
      // Dấu mẫu vừa đổi (lấy từ chữ trong ảnh thay cho dấu dựng): ghép lại các chữ Xưởng ghép bằng dấu đó.
      || (glyphs.get(char)?.source === 'Ghép dấu' && [...char.normalize('NFD')].some(mark => markChanged.has(mark))),
      { requireReferenceMarks: [...glyphs.values()].some(g => g.origin === 'direct') }) : [];
    for (const glyph of generated) next.set(glyph.char, glyph);
    const symbols = deriveSymbols(next).filter(glyph => !real(glyphs.get(glyph.char)) && !(glyphs.get(glyph.char)?.d && glyphs.get(glyph.char).source !== 'Dựng từ nét chữ'));
    for (const glyph of symbols) next.set(glyph.char, glyph);
    await smooth(symbols.map(g => next.get(g.char)).filter(smoothable));
    // Cỡ dấu câu theo chấm chữ i của chính font (cả dấu câu theo ảnh; font vẽ sẵn giữ nguyên).
    const punctFix = normalizePunctuation(next, measureStem(next), glyph => editable(glyph) && ours(glyph));
    for (const glyph of punctFix.changed) next.set(glyph.char, glyph);
    // Dấu nặng bằng dấu chấm của chính font, cả chữ theo ảnh (chỉ co/giãn chấm tại chỗ).
    const dotBelow = normalizeDotBelow(next, measureStem(next), glyph => editable(glyph) && ours(glyph));
    for (const glyph of dotBelow.changed) next.set(glyph.char, glyph);
    // Chữ đã khóa không đổi (ProtectedGlyphMap từ chối ghi đè).
    const draft = keepLocked(next);   // chữ đã khóa (sửa tay trong Font Lab) không bị ghép lại
    // Kerning tiếng Việt: font Xưởng dựng tự tính khi xuất. Font nhập giữ nguyên kerning gốc (SKILL.md: khi sửa dấu
    // trong file nhập, giữ nguyên thân chữ, baseline, advance và kerning).
    const kerned = importedMetrics ? 0 : vietnameseKerning([...draft.values()].filter(g => g?.d)).length;
    // Chỉ tính chữ thật sự đổi hình hoặc độ rộng (dựng lại ra y hệt thì không đưa vào bản xem trước).
    const shape = g => svgpath(g.d).round(0).toString();
    const same = (a, b) => a === b || (!!a && !!b && Math.round(a.advance) === Math.round(b.advance) && (a.d === b.d || shape(a) === shape(b)));
    const changed = [...new Set([...snapshot.keys(), ...draft.keys()])].filter(char => !same(snapshot.get(char), draft.get(char)))
      .map(char => ({ char, before: snapshot.get(char), after: draft.get(char) }));
    const after = auditMarks(draft, { slant: measureSlant(draft) });
    const rebuilt = changed.filter(item => item.before && failing.has(item.char)).map(item => item.char);
    const special = new Set([...letters, ...symbols].map(g => g.char));
    const newSymbols = changed.filter(item => symbols.some(g => g.char === item.char)).map(item => item.char);
    const added = changed.filter(item => !item.before && !special.has(item.char)).map(item => item.char).filter(char => charset.includes(char));
    const missing = charset.filter(char => !draft.get(char)?.d);
    const list = chars => chars.slice(0, 30).join(' ') + (chars.length > 30 ? ' …' : '');
    const parts = [
      heights.changed.length && 'chuẩn chiều cao ' + heights.changed.length + ' chữ (' + list(heights.changed.map(g => g.char)) + ')',
      markChanged.size && 'dấu mẫu của chính font: ' + [...markChanged].map(m => (next.get(m)?.fromLetter ? 'lấy từ ' + next.get(m).fromLetter : 'dựng từ nét') + ' (' + toneSamples.get(m) + ')').join(', '),
      cleaned.length && 'làm mượt viền và đường cong ' + cleaned.length + ' chữ (' + list(cleaned) + ')',
      letters.length && 'dựng ' + letters.length + ' chữ cái từ bộ phận (' + list(letters.map(g => g.char + '←' + g.derivedFrom)) + ')',
      rebuilt.length && 'dựng lại ' + rebuilt.length + ' chữ có dấu lệch chuẩn (' + list(rebuilt) + ')',
      added.length && 'ghép thêm ' + added.length + ' chữ có dấu (' + list(added) + ')',
      dotBelow.changed.length && 'chỉnh cỡ dấu nặng ' + dotBelow.changed.length + ' chữ bằng dấu chấm (' + list(dotBelow.changed.map(g => g.char + ' ' + g.dotBelowFix)) + ')',
      punctFix.changed.length && 'chỉnh cỡ ' + punctFix.changed.length + ' dấu câu' + (punctFix.factor !== 1 ? ' theo chấm chữ i của font (×' + punctFix.factor.toFixed(2) + ')' : '') + ', chấm của : ; ! ? bằng dấu chấm (' + list(punctFix.changed.map(g => g.char)) + ')',
      newSymbols.length && 'dựng ' + newSymbols.length + ' dấu câu, ký tự (' + list(newSymbols) + ')',
    ].filter(Boolean);
    const tail = (rough.length ? ' Còn lỗi viền/đường cong sau khi nắn (cần chỉnh tay hoặc thay ảnh): ' + list([...new Set(rough)]) + '.' : '') + (heights.held.length ? ' Lệch lớn, coi là cố ý nên giữ: ' + list(heights.held) + '.' : '')
      + (missing.length ? ' CẦN ẢNH MẪU (Xưởng không tự dựng được): ' + list(missing) + '.' : ' Đủ bộ ký tự.')
      + (kerned ? ' Kerning ' + kerned + ' cặp tiếng Việt được tính khi xuất.' : importedMetrics ? ' Font mở từ Bộ sưu tập: giữ nguyên kerning đã lưu.' : '')
      + (importedMetrics && !own ? ' Font của nhà thiết kế khác: chỉ sửa chữ Xưởng ghép/dựng, giữ nguyên nét gốc.' : '')
      + (before?.checked ? ' Trước khi sửa: đạt ' + before.passed + '/' + before.checked + ' chỉ số.' : '')
      + auditMessage(after) + ruleMessage(checkRules(draft, { editable: glyph => glyph && !glyph.locked && (importedMetrics?.ownFont || glyph.source !== 'Font gốc') }), { only: ['dot-i', 'colon-dots', 'dot-below', 'punct-place', 'heights', 'horn', 'horn-pair', 'outline'] });
    if (!changed.length) {
      status('Hoàn thiện font: không có gì cần sửa theo quy tắc.' + tail + ' Đang kiểm file font…');
      if (missing.length) setTimeout(() => drawMissingWithAI(missing), 0);
      return false;   // kiểm file luôn
    }
    // Người dùng (22/11/2026): bấm Hoàn thiện là áp dụng luôn, không hiện bảng xem trước; Hoàn tác chỉnh dấu quay lại cả lượt.
    glyphs = draft;
    lastMarkChange = changed; completionRun = true;
    $('undo-mark-spacing').disabled = false;
    repairRecheckPending = { propose: true };
    status('Hoàn thiện font: ' + parts.join('; ') + '.' + tail + ' Bấm Hoàn tác chỉnh dấu để quay lại toàn bộ. Đang kiểm file font…');
    busy = false;
    refresh();
    drawMissingWithAI(missing);
    return true;
  } finally { busy = false; }
}
// Bảng "Tự động sửa font" đã ẩn; nút Hoàn thiện font chữ nằm ở Bộ ký tự và chạy đúng nút của bảng đó.
// Thông báo của bảng chuyển ra dòng trạng thái chung.
$('finish-font').addEventListener('click', () => $('editor-font-check').querySelector('[data-action=current]')?.click());
const editorFontCheck = createFontCheckPanel($('editor-font-check'), {
  getCurrent: () => currentFontExport, beforeCheck: fixByRules, onSelect: renderRuleQuality, onOpen: openQualityFont, onInspect: inspectQualityText,
  onMarks: result => {
    if (!isQualityEditorSource(result)) { status('Hãy bấm Mở font này để chỉnh sửa trước khi chỉnh dấu.'); return; }
    $('open-mark-spacing').click();
  },
  onAIRepair: (result,candidates) => proposeQualityRepairs(result,candidates,{ai:true}),
  onRepair: proposeQualityRepairs
});
{
  const panelStatus = $('editor-font-check').querySelector('[data-role=status]');
  if (panelStatus) new MutationObserver(() => { if (panelStatus.textContent.trim()) status(panelStatus.textContent.trim()); })
    .observe(panelStatus, { childList: true, characterData: true, subtree: true });
}
async function verifyMarkRepairDraft(snapshot, proposals, threshold) {
  const makeRecord = entries => {
    const active=[...entries.values()].filter(g=>!toneSamples.has(g.char));
    let ascent=importedMetrics?.ascent ?? ASCENT, descent=importedMetrics?.descent ?? DESCENT;
    for(const glyph of active){const b=glyphBounds(glyph);ascent=Math.max(ascent,Math.ceil(b.y+b.height+24));descent=Math.min(descent,Math.floor(b.y-24));}
    const bytes=exportFont($('name').value||'Xuong Font',active,0,{...importedMetrics,ascent,descent,kerning:importedMetrics?.kerning??[],wordSpace:importedMetrics?.wordSpace});
    return {name:'Bản kiểm sửa dấu',blob:new Blob([bytes],{type:'font/ttf'})};
  };
  const baseline=await assessFont(makeRecord(snapshot),{minGap:threshold});
  const key=f=>f.rule+'|'+f.chars;
  const baselineProblems=new Set(baseline.findings.filter(f=>f.status==='fail'||f.rule==='pair-collision'||f.rule==='mark-stack').map(key));
  let accepted=proposals.slice(); const skipped=[];
  for(let round=0;round<3&&accepted.length;round++) {
    status('Đang kiểm file TTF bản sửa, lượt '+(round+1)+' / 3…');
    const draft=new Map(snapshot);for(const p of accepted)draft.set(p.char,p.after);
    const report=await assessFont(makeRecord(draft),{minGap:threshold});
    const newProblems=report.findings.filter(f=>(f.status==='fail'||f.rule==='pair-collision'||f.rule==='mark-stack')&&!baselineProblems.has(key(f)));
    const rejected=accepted.filter(p=>!report.measured.some(m=>m.char===p.char&&m.gap>=threshold)||newProblems.some(f=>!f.chars||f.chars.includes(p.char)));
    if(!rejected.length)return {accepted,skipped};
    skipped.push(...rejected.map(p=>p.char+' (chưa vượt kiểm tra file xuất)'));
    accepted=accepted.filter(p=>!rejected.includes(p));
  }
  return {accepted:[],skipped:[...skipped,...accepted.map(p=>p.char+' (chưa kiểm xong)')]};
}
async function proposeQualityRepairs(result, candidates, {ai=false} = {}) {
    if (!isQualityEditorSource(result)) await openQualityFont(result);
    if (!isQualityEditorSource(result)) {
      status('Hãy mở font vào trình chỉnh sửa rồi đánh giá lại trước khi sửa.');
      return;
    }
    const threshold = result.threshold?.minGap ?? 16; // Fixed conservative review threshold; automatic proposals never edit outlines until approval.
    let proposals = [];
    const skipped = [];
    const snapshot = new Map(glyphs);
    for (const finding of candidates) {
      const char = finding.chars;
      const before = glyphs.get(char);
      const parts = [...char.normalize('NFD')];
      const root = parts[0];
      const baseChar = parts.includes('\u031b') ? (root + '\u031b').normalize('NFC') : root;
      const base = glyphs.get(baseChar);
      const measured = Number(finding.value);
      if (!before || !base || !Number.isFinite(measured) || measured < 0) { skipped.push(char); continue; }
      const gap = Math.max(2, Math.min(140, Math.ceil((threshold - measured + 2) / 2) * 2));
      const after = adjustGlyphMarks(before, base, { gap, scale: 1 });
      if (!after || after.d === before.d) { skipped.push(char); continue; }
      proposals.push({ char, before, after, gap, measured });
    }
    if (!proposals.length) {
      status('Chưa có dấu rời đủ điều kiện sửa tự động. Dấu liền thân và các nét giao nhau cần duyệt bằng mắt.');
      return;
    }
    if (ai) {
      const key = geminiKey.value.trim();
      if (!key) { status('Nhập khóa Gemini và kiểm tra kết nối trước khi yêu cầu AI đối chiếu.'); return; }
      try {
        const review = await reviewMarkRepairs(proposals,key,connectedGeminiModel,status);
        proposals = review.accepted;
        skipped.push(...review.skipped.map(item=>item.char+' ('+item.reason+')'));
      } catch(error) { status('AI chưa duyệt được bản sửa: '+error.message+'. Font vẫn giữ nguyên.'); return; }
    }
    // Read the actual proposed TTF before allowing an edit. Drop changes that
    // leave the gap unresolved or introduce a measured collision/technical error.
    if (proposals.length) {
      let checked;
      try { checked = await verifyMarkRepairDraft(snapshot,proposals,threshold); }
      catch(error) { status('Chưa kiểm được bản sửa: '+error.message+'. Giữ nguyên font.'); return; }
      skipped.push(...checked.skipped);
      proposals = checked.accepted;
    }
    if (snapshot.size !== glyphs.size || [...snapshot].some(([char,glyph])=>glyphs.get(char)!==glyph)) {
      status('Font đã thay đổi trong khi kiểm tra. Hãy đánh giá lại.'); return;
    }
    if (!proposals.length) { status('Chưa có bản sửa vượt qua kiểm tra'+(ai?' và đối chiếu AI':'')+'. Giữ nguyên font. Bỏ qua: '+skipped.join(', ')); return; }
    // Proposals already passed the exported-TTF re-check, so apply them at once.
    // Only mark positions move; locked glyphs stay protected by the glyph map.
    const applied = proposals.filter(p => glyphs.get(p.char) === p.before && glyphs.set(p.char, p.after).get(p.char) === p.after);
    for (const p of proposals) if (!applied.includes(p)) skipped.push(p.char + ' (đã khóa)');
    if (!applied.length) { status('Không áp dụng được bản sửa nào. Bỏ qua: ' + skipped.join(', ')); return; }
    if (completionRun) {
      const merged = new Map(lastMarkChange.map(item => [item.char, item]));
      for (const p of applied) merged.set(p.char, { char: p.char, before: merged.get(p.char)?.before ?? p.before, after: p.after });
      lastMarkChange = [...merged.values()];
    } else lastMarkChange = applied;
    completionRun = false;
    markCandidates = []; auditRepairPending = false;
    repairRecheckPending = true;
    $('undo-mark-spacing').disabled = false;
    refresh();
    status('Đã sửa dấu ' + applied.map(p => p.char).join(', ') + (ai ? ' (AI đã duyệt)' : '') + '; đang tự kiểm lại file. Bỏ qua: ' + (skipped.join(', ') || 'không') + '. Bấm "Hoàn tác chỉnh dấu" để quay lại.');
}
// Licensed ColorME checker runs as a same-origin, locally hosted isolated page.
const standaloneCheckerMount = $('standalone-font-check');
if (standaloneCheckerMount) {
  standaloneCheckerMount.replaceChildren();
  const frame = document.createElement('iframe');
  frame.src = './colorme-check/index.html';
  frame.title = 'Kiểm tra font tiếng Việt — ColorME';
  frame.className = 'colorme-check-frame';
  frame.loading = 'eager';
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  standaloneCheckerMount.append(frame);
  // Match the iframe height to its actual content so it never has a nested scrollbar.
  // The checker is hosted on our own origin, so measuring its document is safe.
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.documentElement.style.overflowY = 'hidden';
    doc.body.style.overflowY = 'hidden';
    doc.body.style.margin = '0';
    const resize = () => {
      const root = doc.documentElement;
      const body = doc.body;
      const height = Math.max(root.scrollHeight, body.scrollHeight, body.offsetHeight);
      if (height > 0) frame.style.height = height + 'px';
    };
    resize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resize);
      observer.observe(doc.body);
      observer.observe(doc.documentElement);
    }
    if (doc.fonts?.ready) doc.fonts.ready.then(resize);
    frame.contentWindow?.addEventListener('resize', resize);
  });
}
async function runFontQuality(records) { await editorFontCheck.run(records); }

// Family projects use their own additive IndexedDB database. Existing fonts and references stay intact.
let familyEditorToken;
function currentFamilyInput(){
  rememberReference();
  return {name:$('name').value,images:references.map(entry=>entry.file),
    layouts:references.map(entry=>({text:entry.settings?.layoutText||'',style:entry.settings?.layoutStyle||'Regular'})),
    composeMissing:$('auto-draw').checked,workspace:{name:$('name').value,glyphs:[...glyphs.values()],importedMetrics,sample:$('sample').value,spacing:$('spacing').value}};
}
// Ô nội dung chữ dưới ảnh: dựng chữ trên máy, không cần Gemini.
$('layout-style').replaceChildren(...familyStyles.map(s => new Option(readableStyle(s.style), s.style)));
$('layout-style').value = 'Regular';
let layoutSaveTimer;
$('layout-text').addEventListener('input', () => { if ($('layout-text').value.trim()) { $('layout-text').classList.remove('needs-text'); $('layout-text').placeholder = 'Gõ đúng chữ có trong ảnh, mỗi dòng ảnh một dòng, đủ dấu'; } });
for (const id of ['layout-text', 'layout-style']) $(id).addEventListener('input', () => {
  rememberReference(); renderReferences();
  clearTimeout(layoutSaveTimer); layoutSaveTimer = setTimeout(() => persistReferences(), 600);
});
const familyWorkspace = setupFamilyWorkspace($('family-image-workspace'), {
  traceWords: (image,words,signal,settings) => traceDetectedWords(image,words,signal,undefined,settings),
  getCurrentInput:currentFamilyInput,
  onProgress:message=>{status(message);reportDesign(message);},
  onResult:async(project,style)=>{
    const indices=new Map();for(const [index,entry]of references.entries())indices.set(await digestReference(entry.file),index);
    const withReference=g=>{const image=project.images.find(i=>i.id===g.sourceImageId),index=image?indices.get(image.digest):undefined;
      return {...g,...(index!=null?{reference:{index,crop:g.pixelCrop}}:{})};};
    // Đang sửa một kiểu của cùng bộ font: chỉ bổ sung chữ từ ảnh vào kiểu đang mở, giữ nguyên tên, độ đậm
    // và mọi chữ đã có (kể cả chữ mượn, chữ có dấu, ký hiệu đã dựng). Chữ suy luận được thay bằng chữ lấy từ ảnh.
    const sameFamily=glyphs.size&&importedMetrics?.familyName&&importedMetrics.familyName.trim().toLocaleLowerCase()===project.name.trim().toLocaleLowerCase();
    if(sameFamily){
      const added=[],replaced=[];
      for(const g of style.glyphs){
        const existing=glyphs.get(g.char),fromImage=g.origin==='direct'||g.source==='Ảnh mẫu';
        if(!existing){glyphs.set(g.char,placePunctuation(withReference(g)));added.push(g.char);}
        else if(fromImage&&existing.origin==='inferred'&&!existing.locked&&!existing.approved){glyphs.set(g.char,placePunctuation(withReference(g)));replaced.push(g.char);}
      }
      selected=added[0]??replaced[0]??selected;auditRepairPending=false;markCandidates=[];refresh();
      const message='Đã thêm '+added.length+' chữ từ ảnh vào '+($('name').value.trim()||project.name)+(added.length?': '+added.join(' '):'')
        +(replaced.length?'. Thay '+replaced.length+' chữ dựng tạm bằng chữ từ ảnh: '+replaced.join(' '):'')
        +'. Giữ nguyên các chữ đã có; nhớ bấm Lưu font đang làm trong Bộ sưu tập để cập nhật.'+enforceRules([...added,...replaced]);
      refresh();
      setTimeout(()=>{status(message);reportDesign(message);},0);
      return;
    }
    $('name').value=project.name+(style.id==='Regular'?'':' '+style.id);
    { const loaded=new Map(style.glyphs.map(g=>[g.char,withReference(g)])); for(const [c,g] of loaded) if(punctuation.includes(c)) loaded.set(c,placePunctuation(g,loaded)); glyphs=new ProtectedGlyphMap(loaded); }
    importedMetrics={familyName:project.name,styleName:style.name,weight:style.weight,italic:style.italic,angle:style.metrics?.angle??0,
      ascent:ASCENT,descent:DESCENT,kerning:style.metrics?.kerning??[],wordSpace:style.metrics?.wordSpace??300,sourceProjectId:project.id};
    loadedSourceBlob=undefined;selected=glyphs.has('i')?'i':style.glyphs[0]?.char;
    auditRepairPending=false;markCandidates=[];$('spacing').value=0;refresh();
  },
  getKey: () => geminiKey.value.trim(), getModel: () => connectedGeminiModel,
  exportStyle: async (family,style) => {
    let ascent=ASCENT,descent=DESCENT;
    for(const glyph of style.glyphs){const b=glyphBounds(glyph);ascent=Math.max(ascent,Math.ceil(b.y+b.height+24));descent=Math.min(descent,Math.floor(b.y-24));}
    const bytes=exportFont(family+' '+style.name,style.glyphs,0,{familyName:family,styleName:style.name,weight:style.weight,italic:style.italic,angle:style.metrics?.angle??0,ascent,descent,kerning:style.metrics?.kerning??[],wordSpace:style.metrics?.wordSpace??300});
    return new Blob([bytes],{type:'font/ttf'});
  },
  openStyle: async (family,style,{capture=false}={}) => {
    if(capture) return importedMetrics?.familyEditorToken===familyEditorToken ? [...glyphs.values()] : null;
    const byChar=new Map(style.glyphs.map(g=>[g.char,g]));
    const bytes=exportFont(family+' '+style.name,style.glyphs,0,{familyName:family,styleName:style.name,weight:style.weight,italic:style.italic,angle:style.metrics?.angle??0});
    const opened=await fontCollection.editRecord({name:family+' '+style.name,family,style:style.name,weight:style.weight,italic:style.italic,filename:family+'.ttf',blob:new Blob([bytes],{type:'font/ttf'})});
    if(!opened)throw Error('Chưa mở Style trong trình sửa.');
    for(const [char,g]of glyphs){const original=byChar.get(char);if(original)glyphs.set(char,{...original,...g,approved:original.approved,locked:original.locked});}
    familyEditorToken=crypto.randomUUID();importedMetrics.familyEditorToken=familyEditorToken;refresh();
  },
  saveCollection: record=>fontCollection.storeProjectStyle(record)
});
// Nắn thẳng hàng loạt: mọi chữ chưa khóa, chưa duyệt. Mỗi chữ giữ bản trước để Hoàn tác riêng trong khung xem chữ,
// hoặc Hoàn tác cả lượt bằng một nút.
let lastStraighten;
let familyNotSynced = 0;
async function saveStraightened(previous, next) {
  if (glyphs.get(previous.char) !== previous || previous.locked) return false;
  glyphs.set(next.char, next);
  // Family có bản khác bản đang mở: không ghi đè Family, chữ trong bộ chữ đang mở vẫn được nắn.
  try { await familyWorkspace.saveOutlineEdit(previous, next, importedMetrics); } catch { familyNotSynced++; }
  return true;
}
$('straighten-all').addEventListener('click', async () => {
  if (busy || loading) return;
  const button = $('straighten-all'); button.disabled = true;
  const level = Number($('outline-cleanup-level').value) || 1.5, time = new Date().toISOString();
  const done = [], held = [], failed = [], changes = [];
  let already = 0; familyNotSynced = 0;
  let styles = [];
  try { styles = await familyWorkspace.projectStyles({ ...importedMetrics, requireMatch: true }); } catch { /* không có Family: chỉ nắn trên outline */ }
  try {
    const list = [...glyphs.values()].filter(g => g?.d && !toneSamples.has(g.char));
    for (const [index, glyph] of list.entries()) {
      if (index % 8 === 0) { status('Đang nắn ' + (index + 1) + '/' + list.length + '…'); await new Promise(r => setTimeout(r, 0)); }
      if (glyph.locked || glyph.approved) { held.push(glyph.char); continue; }
      if (glyph.outlineCleanup) { already++; continue; }   // đã nắn: không nắn chồng để Hoàn tác vẫn về nét gốc
      try {
        const source = glyph.borrowedFrom && glyph.borrowedJoin !== 'miter-v1'
          ? restoreBorrowedCorners(glyph, glyph.borrowedOriginal ? [] : styles) || glyph : glyph;
        const result = cleanOutline(source, { tolerance: level });
        if (result.d === glyph.d) continue;
        const { outlineUndo, ...snapshot } = glyph;
        const next = { ...glyph, ...source, d: result.d, outlineUndo: snapshot, outlineCleanup: { ...result.stats, time, batch: true },
          version: (glyph.version || 0) + 1, approved: false, proof: undefined, identityVersion: undefined, pixelOutline: undefined };
        if (await saveStraightened(glyph, next)) { done.push(glyph.char); changes.push([glyph, next]); } else failed.push(glyph.char);
      } catch { failed.push(glyph.char); }
    }
  } finally { button.disabled = false; }
  if (changes.length) lastStraighten = changes;   // lượt không đổi gì thì vẫn giữ được Hoàn tác lượt trước
  $('straighten-undo').hidden = !lastStraighten?.length;
  save(); refresh();
  status('Đã nắn thẳng ' + done.length + ' chữ (mức ' + $('outline-cleanup-level').selectedOptions[0].textContent.split(' —')[0] + ').'
    + (already ? ' Bỏ qua ' + already + ' chữ đã nắn trước đó.' : '')
    + (held.length ? ' Giữ nguyên ' + held.length + ' chữ đã khóa hoặc đã duyệt.' : '')
    + (familyNotSynced ? ' ' + familyNotSynced + ' chữ khác bản trong dự án Family nên chỉ lưu trong bộ chữ đang mở (Family giữ nguyên).' : '')
    + (failed.length ? ' Không nắn được ' + failed.length + ' chữ vì lệch quá giới hạn an toàn: ' + failed.join(' ') + '.' : '')
    + ' Chữ nào chưa ưng: mở chữ đó, bấm Nắn thẳng và làm mượt outline rồi Hoàn tác nắn outline. Hoặc bấm Hoàn tác nắn hàng loạt để trả lại tất cả.');
});
$('straighten-undo').addEventListener('click', async () => {
  if (busy || loading || !lastStraighten?.length) return;
  let restored = 0, changed = 0;
  for (const [previous, next] of lastStraighten) {
    if (glyphs.get(next.char) !== next) { changed++; continue; }   // chữ đã sửa tiếp sau lượt nắn: không ghi đè
    if (await saveStraightened(next, { ...previous, version: (next.version || 0) + 1 })) restored++; else changed++;
  }
  lastStraighten = undefined; $('straighten-undo').hidden = true; save(); refresh();
  status('Đã hoàn tác nắn thẳng cho ' + restored + ' chữ.' + (changed ? ' ' + changed + ' chữ đã được sửa tiếp sau đó nên giữ nguyên.' : ''));
});
$('review-source-glyph').addEventListener('click',()=>void familyWorkspace.reviewGlyph(selected,importedMetrics));
$('open-image-family').addEventListener('click',()=>{$('open-font-workspace').click();familyWorkspace.open();});

// Keep the normal name/image/create workflow first. Advanced proofing stays below it.
$('font-workspace').append($('family-image-workspace'));
