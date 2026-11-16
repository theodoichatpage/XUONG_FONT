import { segmentImage, makeGlyph, exportFont, MAX_SIDE } from './engine.js';
import { core, lowercase, charset, composeVietnamese } from './vietnamese.js';
import { referenceCanvas, wordInk, splitCleanWord, splitWordByGaps, traceSymbol, pixelBox, expandWordBox, inkBox, inkCrossesBox, completeTildeO, alignReferenceGlyphs } from './reference-image.js';
import { inventoryImage } from './ai-design.js';
import { loadReferences, saveReferences } from './reference-storage.js';
import { glyphBounds, prepareGlyphReview } from './glyph-review.js';

const { UPM, ASCENT, DESCENT } = require('../src/metrics');

const $ = id => document.getElementById(id);
const canvas = $('image');
const ctx = canvas.getContext('2d');
const storageKey = 'xuong-font-project-v1';
let glyphs = new Map();
let source;
let crop;
let dragStart;
let selected;
let fontFace;
let downloadURL;
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
    glyphs = new Map(saved.glyphs.filter(glyph => !['AI suy đoán', 'AI theo ảnh'].includes(glyph.source))
      .map(glyph => [glyph.char, glyph]));
    for (const [char, glyph] of glyphs) {
      if (glyph.source === 'Ghép dấu' && !glyphs.has(glyph.base ?? char.normalize('NFD')[0])) glyphs.delete(char);
    }
    $('name').value = saved.name;
    $('sample').value = saved.sample;
    $('spacing').value = saved.spacing;
    if (glyphs.size < saved.glyphs.length) save();
  }
} catch {
  // A project can still be used when local storage is unavailable.
}

function status(message) { $('status').textContent = message; }

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      glyphs: [...glyphs.values()], name: $('name').value,
      sample: $('sample').value, spacing: $('spacing').value
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
  const composed = composeVietnamese(glyphs);
  for (const [char, glyph] of glyphs) {
    if (glyph.source === 'Ghép dấu' && !glyphs.has(glyph.base)) glyphs.delete(char);
  }
  for (const glyph of composed) {
    if (glyphs.get(glyph.char)?.source === 'Ghép dấu') glyphs.set(glyph.char, glyph);
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
  if (chars.some(char => !charset.includes(char))) return status('Bản này hỗ trợ chữ hoa, chữ thường tiếng Việt, số và dấu câu trong bảng.');
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
    const mask = wordInk(image, rect);
    const parts = mask.preserveOutline ? splitReferenceWord(mask, rect, chars) : [];
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
      for (const glyph of alignReferenceGlyphs(groups)) traced.set(glyph.char, glyph);
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
        const glyph = await makeGlyph(ink, width, box, char);
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
    for (const [char, glyph] of traced) glyphs.set(char, glyph);
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
for (const char of charset) {
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
  const grid = lowercase.includes(char) ? 'lower-glyphs' : core.includes(char) || char === 'Đ' ? 'glyphs' : 'more-glyphs';
  $(grid).append(button);
  tiles.set(char, button);
}

function renderGlyphs() {
  for (const [char, tile] of tiles) {
    const glyph = usableGlyph(char);
    tile.className = 'glyph' + (glyph ? (glyph.source === 'Ảnh mẫu') ? ' ready' : ' generated' : '');
    tile.setAttribute('aria-pressed', String(char === selected));
    tile.setAttribute('aria-label', char + ' · ' + (glyph?.source ?? 'Còn thiếu'));
    tile.title = tile.getAttribute('aria-label');
    tile.replaceChildren();
    if (!glyph) { tile.textContent = char; continue; }
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 -1000 ${glyph.advance} 1240`);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', glyph.d);
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('transform', 'scale(1 -1)');
    svg.append(path);
    const label = document.createElement('small');
    label.textContent = char;
    tile.append(svg, label);
  }
  $('count').textContent = `${charset.filter(char => usableGlyph(char)).length} / ${charset.length} ký tự`;
  $('selected').textContent = selected ? `${selected} · ${usableGlyph(selected)?.source ?? 'Còn thiếu'}` : 'Chọn một ô để nhập ký tự đó.';
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
  download.removeAttribute('href');
  download.setAttribute('aria-disabled', 'true');
  debounce = setTimeout(async () => {
    const active = charset.map(usableGlyph).filter(Boolean);
    if (!active.length) {
      if (fontFace) document.fonts.delete(fontFace);
      fontFace = undefined;
      $('preview').style.removeProperty('font-family');
      $('preview').style.removeProperty('line-height');
      return;
    }
    try {
      const name = $('name').value.trim() || 'Xuong Font';
      let ascent = ASCENT, descent = DESCENT;
      for (const glyph of active) {
        const { y, height } = glyphBounds(glyph);
        ascent = Math.max(ascent, Math.ceil(y + height + 24));
        descent = Math.min(descent, Math.floor(y - 24));
      }
      const ttf = exportFont(name, active, Number($('spacing').value), { ascent, descent });
      const face = new FontFace('xuong-preview-' + turn, ttf);
      await face.load();
      if (turn !== revision) return;
      if (fontFace) document.fonts.delete(fontFace);
      fontFace = face;
      document.fonts.add(face);
      $('preview').style.fontFamily = face.family + ', Georgia, serif';
      $('preview').style.lineHeight = String((ascent - descent) / UPM);
      downloadURL = URL.createObjectURL(new Blob([ttf], { type: 'font/ttf' }));
      download.href = downloadURL;
      download.download = (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '') || 'Xuong Font') + '.ttf';
      download.setAttribute('aria-disabled', 'false');
    } catch (error) {
      if (turn === revision) $('missing').textContent = 'Không xuất được font · ' + error.message;
    }
  }, 120);
}

function refresh() {
  save();
  renderGlyphs();
  renderPreview();
  scheduleFont();
}


function reportDesign(message) {
  $('ai-scan-report').hidden = false;
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

async function runFontJob() {
  if (busy || loading || !references.length || !connectedGeminiModel || connectionRequest) return;
  const key = geminiKey.value.trim();
  if (!key) return;
  const controller = new AbortController();
  designRun = controller;
  busy = true;
  renderReferences();
  $('trace').disabled = $('single').disabled = true;
  connectionButton.disabled = true;
  $('stop-design').hidden = false;
  $('stop-design').disabled = false;
  let model = connectedGeminiModel;
  let accepted = 0;
  try {
    const observed = new Set();
    const traced = new Map();
    const skipped = [];
    for (const [index, entry] of references.entries()) {
      controller.signal.throwIfAborted();
      if (geminiKey.value.trim() !== key) throw new Error('Khóa đã đổi. Kiểm tra kết nối rồi chạy lại.');
      const progress = `Ảnh ${index + 1}/${references.length}`;
      const saved = () => `Đã cập nhật ${accepted} ký tự.`;
      const started = performance.now();
      const waiting = () => reportDesign(`${progress} · Chờ Gemini ${Math.floor((performance.now() - started) / 1000)} giây. ${saved()}`);
      let image, detectedWords = entry.settings?.detectedWords;
      try {
        image = await referenceCanvas(entry.file);
        controller.signal.throwIfAborted();
        if (!detectedWords?.length) {
          waiting();
          const timer = setInterval(waiting, 1000);
          try {
            const result = await inventoryImage(image, key, model, controller.signal);
            model = result.model ?? model;
            detectedWords = result.words;
            if (detectedWords.length) {
              entry.settings = { ...entry.settings, detectedWords };
              persistReferences();
            }
          } finally {
            clearInterval(timer);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (error.status && error.status < 500) throw new Error(`${progress} · ${error.message}`);
        skipped.push(`${progress} · ${error.message}`);
        continue;
      }
      reportDesign(`${progress} · Đang dựng nét từ ảnh. ${saved()}`);
      const words = detectedWords.map(({ text, box }) => ({ text, area: pixelBox(box, image) }));
      const neighbors = words.map(word => word.area);
      const imageGlyphs = [];
      for (const { text, area: original } of words) {
        const chars = [...text.normalize('NFC').replace(/\s/g, '')];
        for (const char of chars) if (charset.includes(char)) observed.add(char);
        if (chars.some(char => !charset.includes(char))) continue;
        const expanded = expandWordBox(original, neighbors, image);
        let area = expanded;
        let mask = wordInk(image, area);
        let parts = splitReferenceWord(mask, area, chars);
        if (!parts.length || inkCrossesBox(mask, area)) {
          area = original;
          mask = wordInk(image, area);
          if (inkCrossesBox(mask, area)) continue;
          parts = splitReferenceWord(mask, area, chars);
        }
        const wordGlyphs = [];
        for (const [offset, part] of parts.entries()) {
          controller.signal.throwIfAborted();
          const char = chars[offset];
          try {
            const glyph = await traceSymbol(mask, part, char, area);
            glyph.reference = { index, crop: glyph.pixelCrop };
            wordGlyphs.push(glyph);
          } catch { /* Keep the letter listed as observed even if tracing fails. */ }
        }
        if (wordGlyphs.length) imageGlyphs.push(wordGlyphs);
      }
      controller.signal.throwIfAborted();
      for (const glyph of alignReferenceGlyphs(imageGlyphs)) {
        const { char, pixelCrop } = glyph;
        const pixels = pixelCrop.w * pixelCrop.h;
        if ((traced.get(char)?.pixels ?? 0) >= pixels) continue;
        traced.set(char, { glyph, pixels });
        glyphs.set(char, glyph);
      }
      updateComposed();
      accepted = traced.size;
      refresh();
    }
    if (skipped.length) {
      reportDesign(`Đã cập nhật ${accepted} ký tự. ${skipped.join(' ')} Thử lại, hoặc khoanh vùng chữ và nhập nội dung để dựng trực tiếp.`);
      return;
    }
    if (geminiKey.value.trim() !== key) throw new Error('Khóa đã đổi. Kiểm tra kết nối rồi chạy lại.');
    inventory = { id: crypto.randomUUID(), observed: [...observed], traced: [...traced.keys()] };
    persistReferences();
    refresh();
    inventoryReport();
    if (geminiKey.value.trim() === key) {
      connectedGeminiModel = model;
      saveGeminiPreference();
    }
  } catch (error) {
    const detail = controller.signal.aborted ? 'Đã dừng theo yêu cầu.' : error.message;
    reportDesign(`Đã cập nhật ${accepted} ký tự. ${detail}`);
  } finally {
    designRun = undefined;
    busy = false;
    $('stop-design').hidden = true;
    $('trace').disabled = $('single').disabled = false;
    connectionButton.disabled = !geminiKey.value.trim();
    renderReferences();
  }
}

$('ai-scan').addEventListener('click', runFontJob);
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

$('accents').addEventListener('click', () => {
  if (busy) return;
  const generated = composeVietnamese(glyphs);
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
  selected = undefined;
  refresh();
  status('Đã xóa bộ ký tự.');
});
$('sample').addEventListener('input', () => { save(); renderPreview(); });
$('size').addEventListener('input', renderPreview);
$('name').addEventListener('input', () => { save(); scheduleFont(); });
$('spacing').addEventListener('input', () => { save(); renderPreview(); scheduleFont(); });
renderGlyphs();
renderPreview();
scheduleFont();

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
