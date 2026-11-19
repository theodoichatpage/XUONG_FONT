import { assessFont, makeQualitySVG, qualityProofs } from './font-quality.js';
import { digestReference } from './family-inputs.js';
import { setupFamilyWorkspace } from './family-workspace.js';
import { createFontCheckPanel } from './font-check-panel.js';
import { reviewMarkRepairs } from './ai-mark-repair.js';
import { adjustGlyphMarks } from './mark-spacing.js';
import { importFontFile, importAccentSamples } from './font-import.js';
import { setupFontCollection } from './font-collection.js';
import { segmentImage, makeGlyph, exportFont, MAX_SIDE } from './engine.js';
import { core, lowercase, punctuation, charset, toneSamples, composeVietnamese, applyReferenceMarks, applyCompactLowercaseHorns } from './vietnamese.js';
import { referenceCanvas, wordInk, splitCleanWord, splitWordByGaps, traceSymbol, pixelBox, expandWordBox, inkBox, inkCrossesBox, completeTildeO, alignReferenceGlyphs } from './reference-image.js';
import { loadReferences, saveReferences } from './reference-storage.js';
import { glyphBounds, prepareGlyphReview } from './glyph-review.js';
import { balanceGlyphSpacing, fitLowercaseT, fitLowercaseQ, fitLowercaseUStems, fontKerning, measureLeftStem, matchLeftStem, balanceFontStrokes } from './font-layout.js';

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
    $('sample').value = saved.sample;
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
  $('ai-scan').disabled = busy || loading || !references.length || !connectedGeminiModel || !!connectionRequest;
  $('auto-draw').disabled = busy || loading;
  $('ai-scan-help').textContent = connectedGeminiModel
    ? 'Thêm ảnh có các ký tự bạn muốn đưa vào bộ font.'
    : 'Kiểm tra kết nối Gemini thành công để bật bước dựng chữ.';
  $('previous-reference').disabled = busy || loading || activeReference <= 0;
  $('next-reference').disabled = busy || loading || activeReference + 1 >= references.length;
}

function rememberReference() {
  const entry = references[activeReference];
  if (!entry) return;
  entry.settings = {
    crop, chars: $('chars').value, polarity: $('polarity').value,
    threshold: $('threshold').value, used: entry.settings?.used ?? false,
    detectedWords: entry.settings?.detectedWords
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
      activeReference = index;
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
  refreshReviewVisibility();
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

function updateComposed() {
  const composed = composeVietnamese(glyphs,()=>false,{requireReferenceMarks:[...glyphs.values()].some(g=>g.origin==='direct')});
  for (const [char, glyph] of glyphs) {
    if (glyph.source === 'Ghép dấu' && !glyphs.has(glyph.base)) glyphs.delete(char);
  }
  for (const glyph of composed) {
    const active = [...glyph.char.normalize('NFD')].slice(1).some(mark => toneSamples.has(mark) && glyphs.has(mark));
    if (glyphs.get(glyph.char)?.origin !== 'direct' && !glyphs.get(glyph.char)?.locked && glyphs.get(glyph.char)?.source !== 'Font gốc' && (glyphs.get(glyph.char)?.source === 'Ghép dấu' || active)) glyphs.set(glyph.char, glyph);
  }
}

function splitReferenceWord(mask, area, chars) {
  if (chars.length === 1) return [area];
  const separated = splitCleanWord(mask, area, chars);
  if (separated.length) return separated;
  if (chars.some(char => /^[õÕ]$/u.test(char))) {
    const byBody = splitWordByGaps(mask, area, chars.length, true);
    if (byBody.length) return byBody;
  }
  return splitWordByGaps(mask, area, chars.length);
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
    const area = selection();
    const image = document.createElement('canvas');
    image.width = area.w;
    image.height = area.h;
    image.getContext('2d').putImageData(source, -area.x, -area.y);
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
    if (replacements.length && !window.confirm(`Thay nét ảnh mẫu của ${replacements.join(', ')}?`)) {
      return status('Đã hủy thay nét.');
    }
    for (const [char, glyph] of traced) if (!glyphs.get(char)?.locked) glyphs.set(char, glyph);
    rememberReference();
    if (references[activeReference]) references[activeReference].settings.used = true;
    persistReferences();
    updateComposed();
    refresh();
    status(`Đã thêm ${traced.size} ký tự từ ảnh mẫu.`);
  } catch (error) { status(error.message); }
  finally {
    busy = false;
    $('trace').disabled = $('single').disabled = false;
    renderReferences();
  }
}

const tiles = new Map();
for (const char of [...toneSamples.keys(), ...charset]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'glyph';
  button.addEventListener('click', () => {
    selected = char;
    $('chars').value = char;
    persistReferences();
    renderGlyphs();
    zoomGlyph(char);
  });
  const grid = toneSamples.has(char) ? 'tone-samples' : lowercase.includes(char) ? 'lower-glyphs' : core.includes(char) || char === 'Đ' ? 'glyphs' : 'more-glyphs';
  $(grid).append(button);
  tiles.set(char, button);
}

function renderGlyphs() {
  for (const [char, tile] of tiles) {
    const glyph = usableGlyph(char);
    tile.className = 'glyph' + (glyph ? (['Ảnh mẫu', 'Ảnh làm sạch'].includes(glyph.source)) ? ' ready' : ' generated' : '');
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
      const balanced = importedMetrics ? active : balanceGlyphSpacing(active, Number($('spacing').value));
      const ttf = exportFont(name, balanced, 0, { italic: importedMetrics?.italic, angle: importedMetrics?.angle, familyName: importedMetrics?.familyName, styleName: importedMetrics?.styleName, weight: importedMetrics?.weight, ascent, descent, kerning: importedMetrics?.kerning ?? fontKerning(balanced), wordSpace: importedMetrics?.wordSpace });
      const face = new FontFace('xuong-preview-' + turn, ttf);
      await face.load();
      if (turn !== revision) return;
      if (fontFace) document.fonts.delete(fontFace);
      fontFace = face;
      document.fonts.add(face);
      $('preview').style.fontFamily = face.family + ', Georgia, serif';
      $('preview').style.lineHeight = String((ascent - descent) / UPM);
      const blob = new Blob([ttf], { type: 'font/ttf' });
      downloadURL = URL.createObjectURL(blob);
      download.href = downloadURL;
      download.download = (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '') || 'Xuong Font') + '.ttf';
      currentFontExport = { name, filename: download.download, blob, sourceId: importedMetrics?.sourceRecordId, fromImages:[...glyphs.values()].some(g=>g.origin==='direct'||g.source==='Ảnh mẫu') };
      download.setAttribute('aria-disabled', 'false');
      if (repairRecheckPending) { repairRecheckPending = false; await editorFontCheck.run([currentFontExport], { propose: false }); }
    } catch (error) {
      if (turn === revision) $('missing').textContent = 'Không xuất được font · ' + error.message;
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

async function traceDetectedWords(image, detectedWords, signal, index, settings) {
  const words = detectedWords.map(({ text, box }) => ({ text, area: pixelBox(box, image) }));
  const neighbors = words.map(word => word.area);
  const imageGlyphs = [], diagnostics=[];
  for (const { text, area: original } of words) {
    const chars = [...fontText(text)];
    if (chars.some(char => !charset.includes(char))) {diagnostics.push({text,box:original,status:'unsupported-character'});continue;}
    const expanded = expandWordBox(original, neighbors, image);
    let area = expanded;
    let mask = wordInk(image, area, settings);
    let parts = splitReferenceWord(mask, area, chars);
    if (!parts.length || inkCrossesBox(mask, area)) {
      area = original;
      mask = wordInk(image, area, settings);
      if (inkCrossesBox(mask, area)) {diagnostics.push({text,box:original,status:'ink-crosses-box'});continue;}
      parts = splitReferenceWord(mask, area, chars);
    }
    const wordGlyphs = [];
    diagnostics.push({text,box:original,status:parts.length?'segmented':'no-safe-separation',expected:chars.length,parts:parts.length});
    for (const [offset, part] of parts.entries()) {
      signal.throwIfAborted();
      const char = chars[offset];
      try {
        const glyph = await traceSymbol(mask, part, char, area);
        if (Number.isInteger(index)) glyph.reference = { index, crop: glyph.pixelCrop };
        wordGlyphs.push(glyph);
      } catch { /* Keep the letter listed as observed even if tracing fails. */ }
    }
    if (wordGlyphs.length) imageGlyphs.push(wordGlyphs);
  }
  const result=alignReferenceGlyphs(imageGlyphs);result.diagnostics=diagnostics;return result;
}

$('ai-scan').addEventListener('click', async()=>{
  if(busy||loading)return;
  if(!references.length){status('Thêm ảnh mẫu rồi bấm Tạo bộ font.');return;}
  if(!geminiKey.value.trim()){status('Nhập khóa Gemini ở thanh trên để tạo bộ font.');return;}
  const controller=new AbortController();designRun=controller;busy=true;$('name').disabled=true;renderReferences();
  $('stop-design').hidden=false;$('stop-design').disabled=false;
  try{await familyWorkspace.createFromCurrent({...currentFamilyInput(),signal:controller.signal});}
  finally{busy=false;$('name').disabled=false;designRun=undefined;$('stop-design').hidden=true;renderReferences();}
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

$('demo').addEventListener('click', () => {
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
    glyphs = new ProtectedGlyphMap(next);
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

$('apply-lowercase-horns').addEventListener('click', () => {
  if (busy || loading) return;
  const generated = applyCompactLowercaseHorns(glyphs);
  if (!generated.length) return status('Cần có chữ o hoặc u thường trước khi ghép râu.');
  for (const glyph of generated) glyphs.set(glyph.char, glyph);
  refresh();
  const message = `Đã ghép râu đầu tròn cho: ${generated.map(glyph => glyph.char).join(' ')}.`;
  status(message);
  reportDesign(message);
});

$('apply-tone-samples').addEventListener('click', () => {
  if (busy || loading) return;
  const generated = applyReferenceMarks(glyphs, selected);
  if (!generated.length) return status('Chọn một chữ gốc có biến thể, hoặc chọn một dấu mẫu đã thêm.');
  for (const glyph of generated) glyphs.set(glyph.char, glyph);
  const message = `Đã áp dụng dấu mẫu cho: ${generated.map(glyph => glyph.char).join(' ')}.`;
  refresh();
  status(message);
  reportDesign(message);
});

$('accents').addEventListener('click', () => {
  if (busy) return;
  const generated = composeVietnamese(glyphs,()=>false,{requireReferenceMarks:[...glyphs.values()].some(g=>g.origin==='direct')});
  if (!generated.length) return status('Hãy thêm chữ nguyên âm gốc trước, ví dụ A, E hoặc O.');
  for (const glyph of generated) glyphs.set(glyph.char, glyph);
  refresh();
  status(`Đã ghép ${generated.length} ký tự có dấu từ nguyên âm hiện có. Bạn có thể thay bằng nét lấy từ ảnh.`);
});
$('remove').addEventListener('click', () => {
  if (busy || !glyphs.has(selected)) return;
  glyphs.delete(selected);
  updateComposed();
  refresh();
});
$('reset').addEventListener('click', () => {
  if (busy || !window.confirm('Xóa tất cả ký tự trong bộ đang làm?')) return;
  glyphs.clear();
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

const fontCollection = setupFontCollection(() => currentFontExport, async (record, { editOnly = false } = {}) => {
  if (busy || loading) throw new Error('Hãy đợi tác vụ đang chạy hoàn tất.');
  if (glyphs.size && !confirm('Mở font này để chỉnh sửa? Bộ chữ đang làm sẽ được thay bằng font đã chọn.')) return false;
  const imported = await importFontFile(record);
  const missingBefore = charset.filter(char => !imported.glyphs.has(char));
  const drafts = new Map(imported.glyphs);
  if (!editOnly) {
    importAccentSamples(drafts);
    for (const glyph of composeVietnamese(drafts)) {
      if (!drafts.has(glyph.char)) drafts.set(glyph.char, glyph);
    }
  }
  auditRepairPending=false; markCandidates=[];
  glyphs = new ProtectedGlyphMap(drafts);
  importedMetrics = { ...imported.metrics, sourceRecordId: editOnly ? record.id : undefined, ...(editOnly ? imported.styleMetrics : {}) };
  loadedSourceBlob = record.blob;
  $('name').value = (record.name + (editOnly ? '' : ' Việt hóa')).slice(0, 40);
  $('sample').value = 'Tiếng Việt · Trường học · Nguyễn Hữu Đạt · ă â ê ô ơ ư đ';
  $('spacing').value = 0;
  refresh();
  const added = missingBefore.filter(char => glyphs.has(char));
  const missing = charset.filter(char => !glyphs.has(char));
  status((editOnly ? 'Đang chỉnh sửa ' + record.name + '. Chỉnh xong mở Bộ sưu tập Font và bấm Lưu font đang làm để cập nhật. ' : 'Đã thêm ' + added.length + ' ký tự. ') + (missing.length ? 'Còn thiếu: ' + missing.join(' ') : 'Đã đủ bộ ký tự tiếng Việt.')
    + '\nDấu mẫu có thể thay trong Bộ ký tự. Xuất mới dựng lại đường nét, các bảng OpenType nâng cao cần kiểm tra sau xuất.');
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
$('open-mark-spacing').addEventListener('click', () => {
  auditRepairPending=false;
  $('mark-spacing-tools').hidden = false;
  $('mark-spacing-scope').value = selected && [...selected.normalize('NFD')].length > 1 ? 'selected' : 'all';
  previewMarkSpacing();
  $('mark-spacing-tools').scrollIntoView({ block: 'nearest' });
});
$('close-mark-spacing').addEventListener('click', () => { auditRepairPending=false; markCandidates=[]; $('mark-spacing-tools').hidden = true; });
for (const id of ['mark-gap','mark-scale','mark-spacing-scope']) $(id).addEventListener('input', () => { auditRepairPending=false; previewMarkSpacing(); });
$('apply-mark-spacing').addEventListener('click', () => {
  if (!auditRepairPending) previewMarkSpacing();
  if (!markCandidates.length) return;
  auditRepairPending = false;
  lastMarkChange = markCandidates.slice();
  if (lastMarkChange.some(({char,before}) => glyphs.get(char) !== before)) { status('Bộ chữ đã thay đổi. Hãy đánh giá lại trước khi áp dụng.'); return; }
  for (const {char, after} of lastMarkChange) glyphs.set(char, after);
  repairRecheckPending = true;
  refresh();
  $('mark-gap').value = 0; $('mark-scale').value = 100;
  previewMarkSpacing();
  $('undo-mark-spacing').disabled = false;
  status('Đã chỉnh dấu cho ' + lastMarkChange.length + ' chữ. Thân chữ và khoảng cách giữa các chữ được giữ nguyên.');
});
$('undo-mark-spacing').addEventListener('click', () => {
  for (const {char, before, after} of lastMarkChange) if (glyphs.get(char) === after) glyphs.set(char, before);
  lastMarkChange = []; repairRecheckPending = true; refresh(); previewMarkSpacing(); $('undo-mark-spacing').disabled = true;
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
const editorFontCheck = createFontCheckPanel($('editor-font-check'), {
  getCurrent: () => currentFontExport, onSelect: renderRuleQuality, onOpen: openQualityFont, onInspect: inspectQualityText,
  onMarks: result => {
    if (!isQualityEditorSource(result)) { status('Hãy bấm Mở font này để chỉnh sửa trước khi chỉnh dấu.'); return; }
    $('open-mark-spacing').click();
  },
  onAIRepair: (result,candidates) => proposeQualityRepairs(result,candidates,{ai:true}),
  onRepair: proposeQualityRepairs
});
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
    $('open-font-workspace').click();
    $('mark-spacing-tools').hidden = false;
    $('mark-spacing-scope').value = 'selected';
    selected = proposals[0].char;
    // Reuse the established before/after proof and explicit apply/undo workflow.
    previewMarkSpacing();
    markCandidates = proposals;
    auditRepairPending = true;
    const proof = $('mark-spacing-proof');
    proof.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    for (const {char,before,after,aiReason} of proposals) {
      const a=glyphBounds(before),b=glyphBounds(after),left=Math.min(a.x,b.x)-30;
      const bottom=Math.min(a.y,b.y)-30,right=Math.max(a.x+a.width,b.x+b.width)+30;
      const top=Math.max(a.y+a.height,b.y+b.height)+30;
      const card=document.createElement('div'),title=document.createElement('strong');
      title.textContent=char+(aiReason?' · '+aiReason:'');card.append(title);
      for(const [label,glyph] of [['Trước',before],['Sau',after]]) {
        const figure=document.createElement('figure'),caption=document.createElement('figcaption');
        caption.textContent=label;
        const svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
        svg.setAttribute('viewBox',left+' '+(-top)+' '+(right-left)+' '+(top-bottom));
        path.setAttribute('d',glyph.d);path.setAttribute('transform','scale(1,-1)');
        svg.append(path);figure.append(svg,caption);card.append(figure);
      }
      const actions=document.createElement('div');
      actions.className='tool-row';
      const accept=document.createElement('button'),reject=document.createElement('button');
      accept.type=reject.type='button';
      accept.textContent='Áp dụng chữ này';reject.textContent='Từ chối';
      accept.addEventListener('click',()=>{
        const proposal=markCandidates.find(item=>item.char===char);
        if(!proposal || glyphs.get(char)!==proposal.before){status('Glyph đã thay đổi; hãy chạy lại sửa tự động.');return;}
        glyphs.set(char,proposal.after);
        markCandidates=markCandidates.filter(item=>item.char!==char);
        auditRepairPending=markCandidates.length>0;
        lastMarkChange=[proposal];
        repairRecheckPending=true;
        card.remove();
        refresh();
        $('undo-mark-spacing').disabled=false;
        status('Đã áp dụng riêng chữ '+char+'. Có thể hoàn tác.');
      });
      reject.addEventListener('click',()=>{
        markCandidates=markCandidates.filter(item=>item.char!==char);
        card.remove();
        $('apply-mark-spacing').disabled=!markCandidates.length;
        status('Đã từ chối thay đổi cho chữ '+char+'. Glyph gốc được giữ nguyên.');
      });
      actions.append(accept,reject);card.append(actions);
      proof.append(card);
    }
    $('mark-spacing-report').textContent='Đã kiểm file TTF'+(ai?' và đối chiếu AI':'')+': '+proposals.length+' bản sửa dấu. Bỏ qua: '+(skipped.join(', ')||'không')+'. Xem trước rồi Áp dụng; Xưởng sẽ tự kiểm lại sau sửa. Chữ thiếu và các lỗi khác vẫn cần xử lý riêng.';
    $('apply-mark-spacing').disabled=false;
    $('mark-spacing-tools').scrollIntoView({block:'nearest'});
    status('Đã chuẩn bị '+proposals.length+' đề xuất sửa dấu. Chưa thay đổi font. Duyệt hình trước/sau rồi bấm Áp dụng.');
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
  return {name:$('name').value,images:references.map(entry=>entry.file),
    composeMissing:$('auto-draw').checked,workspace:{name:$('name').value,glyphs:[...glyphs.values()],importedMetrics,sample:$('sample').value,spacing:$('spacing').value}};
}
const familyWorkspace = setupFamilyWorkspace($('family-image-workspace'), {
  traceWords: (image,words,signal,settings) => traceDetectedWords(image,words,signal,undefined,settings),
  getCurrentInput:currentFamilyInput,
  onProgress:message=>{status(message);reportDesign(message);},
  onResult:async(project,style)=>{
    $('name').value=project.name+(style.id==='Regular'?'':' '+style.id);
    const indices=new Map();for(const [index,entry]of references.entries())indices.set(await digestReference(entry.file),index);
    glyphs=new ProtectedGlyphMap(style.glyphs.map(g=>{
      const image=project.images.find(i=>i.id===g.sourceImageId),index=image?indices.get(image.digest):undefined;
      return [g.char,{...g,...(index!=null?{reference:{index,crop:g.pixelCrop}}:{})}];
    }));
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
$('review-source-glyph').addEventListener('click',()=>void familyWorkspace.reviewGlyph(selected,importedMetrics));
$('open-image-family').addEventListener('click',()=>{$('open-font-workspace').click();familyWorkspace.open();});

// Keep the normal name/image/create workflow first. Advanced proofing stays below it.
$('font-workspace').append($('family-image-workspace'));
