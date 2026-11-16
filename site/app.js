import { segmentImage, makeGlyph, exportFont, MAX_SIDE } from './engine.js';
import { core, lowercase, charset, composeVietnamese } from './vietnamese.js';
import { createOcrWorker, referenceCanvas, detectWords, wordThumbnail, wordInk, splitWordByGaps, traceSymbol, locateWordsWithGemini } from './ocr.js';
import { loadReferences, saveReferences } from './reference-storage.js';
import { prepareGlyphReview } from './glyph-review.js';

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
    review: reviewGroups.map(group => ({
      index: group.index, settings: group.settings,
      rows: group.rows.map(row => ({
        word: row.word, thumbnail: row.thumbnail, text: row.input.value, checked: row.include.checked,
        ai: row.ai, done: row.done
      }))
    }))
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
    glyphs = new Map(saved.glyphs.map(glyph => [glyph.char, glyph]));
    $('name').value = saved.name;
    $('sample').value = saved.sample;
    $('spacing').value = saved.spacing;
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
  $('scan').disabled = busy || loading || !references.length;
  $('ai-scan').disabled = busy || loading || !references.length || !connectedGeminiModel || !!connectionRequest;
  $('ai-scan-help').textContent = connectedGeminiModel
    ? 'Gemini đọc trực tiếp ảnh mẫu. Bạn chỉ duyệt những vùng chưa chắc chắn.'
    : 'Kiểm tra kết nối Gemini thành công để bật nút AI.';
  $('previous-reference').disabled = busy || loading || activeReference <= 0;
  $('next-reference').disabled = busy || loading || activeReference + 1 >= references.length;
}

function rememberReference() {
  const entry = references[activeReference];
  if (!entry) return;
  entry.settings = {
    crop, chars: $('chars').value, polarity: $('polarity').value,
    threshold: $('threshold').value, used: entry.settings?.used ?? false
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
  if (!removed) return;
  activeReference = -1;
  source = crop = undefined;
  $('stage').hidden = true;
  $('filename').textContent = 'PNG, JPG, WebP';
  $('chars').value = '';
  reviewGroups = reviewGroups.filter(group => {
    if (group.index === index) {
      group.element.remove();
      return false;
    }
    if (group.index > index) group.index--;
    for (const row of group.rows) row.index = group.index;
    group.element.querySelector('legend').textContent =
      `Ảnh ${group.index + 1} · ${references[group.index].file.name}`;
    return true;
  });
  reviewedWords = reviewGroups.flatMap(group => group.rows);
  $('ocr-review').hidden = !reviewGroups.length;
  $('ocr-status').textContent = '';
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
    showGlyphProof(prepareGlyphReview(image, box, glyph));
    $('retrace-actions').hidden = false;
    $('ai-reference-note').textContent = label + ' Hai hình được căn theo khung nét. Hãy xác nhận ảnh gốc chỉ chứa chữ ' + glyph.char + '.';
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
    if (origin) glyph.reference = origin;
    retraceCandidate = glyph;
    showGlyphProof(prepareGlyphReview(image, box, glyph));
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
  showGlyphProof(prepareGlyphReview(retraceSource.image, retraceSource.box, reviewGlyph));
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
  const glyph = glyphs.get(char);
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

async function trace(single) {
  if (busy || loading) return;
  const chars = [...$('chars').value.normalize('NFC').replace(/\s/g, '')];
  if (!source || !chars.length) return status('Hãy chọn ảnh và nhập chữ trong vùng đã khoanh.');
  if (chars.some(char => !charset.includes(char))) return status('Bản này hỗ trợ chữ hoa, chữ thường tiếng Việt, số và dấu câu trong bảng.');
  if (single && chars.length !== 1) return status('Hãy khoanh một chữ và nhập đúng một ký tự.');
  busy = true;
  $('trace').disabled = $('single').disabled = true;
  renderReferences();
  try {
    const { ink, blobs, width } = segmentation();
    const boxes = single ? inkBounds(ink, width) : blobs;
    if (boxes.length !== chars.length) {
      throw new Error(`Tìm được ${boxes.length} cụm nét, bạn nhập ${chars.length} ký tự. Hãy chỉnh ngưỡng hoặc khoanh từng chữ và bấm “Thêm một chữ”.`);
    }
    const traced = new Map();
    for (const [i, char] of chars.entries()) {
      if (traced.has(char)) continue;
      status(`Đang dựng nét chữ ${i + 1}/${chars.length}…`);
      const box = boxes[i];
      const glyph = await makeGlyph(ink, width, box, char);
      if (activeReference >= 0) {
        const area = selection();
        glyph.reference = { index: activeReference, crop: {
          x: area.x + box.x0, y: area.y + box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1
        } };
      }
      traced.set(char, glyph);
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
    const glyph = glyphs.get(char);
    tile.className = 'glyph' + (glyph ? glyph.source === 'Ảnh mẫu' ? ' ready' : ' generated' : '');
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
  $('count').textContent = `${glyphs.size} / ${charset.length} ký tự`;
  $('selected').textContent = selected ? `${selected} · ${glyphs.get(selected)?.source ?? 'Còn thiếu'}` : 'Chọn một ô để nhập ký tự đó.';
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
    if (!/\s/u.test(char) && !glyphs.has(char)) {
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
    if (!glyphs.size) {
      if (fontFace) document.fonts.delete(fontFace);
      fontFace = undefined;
      $('preview').style.removeProperty('font-family');
      return;
    }
    try {
      const name = $('name').value.trim() || 'Xuong Font';
      const ttf = exportFont(name, [...glyphs.values()], Number($('spacing').value));
      const face = new FontFace('xuong-preview-' + turn, ttf);
      await face.load();
      if (turn !== revision) return;
      if (fontFace) document.fonts.delete(fontFace);
      fontFace = face;
      document.fonts.add(face);
      $('preview').style.fontFamily = face.family + ', Georgia, serif';
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

let reviewedWords = [];
let reviewGroups = [];

function setScanBusy(value) {
  busy = value;
  $('trace').disabled = $('single').disabled = value;
  $('apply-scan').disabled = value || !reviewedWords.length;
  renderReferences();
}

const recropDialog = $('recrop-dialog');
const recropCanvas = $('recrop-canvas');
const recropContext = recropCanvas.getContext('2d');
let recropEntry;
let recropImage;
let recropBox;
let recropStart;

function drawRecrop() {
  recropContext.drawImage(recropImage, 0, 0);
  recropContext.lineWidth = Math.max(1, recropCanvas.width / 400);
  recropContext.strokeStyle = '#ff4b3a';
  recropContext.strokeRect(recropBox.x0, recropBox.y0, recropBox.x1 - recropBox.x0, recropBox.y1 - recropBox.y0);
}

async function openRecrop(entry) {
  if (busy || loading || recropDialog.open || !references[entry.index]) return;
  recropEntry = entry;
  recropImage = recropBox = undefined;
  $('apply-recrop').disabled = true;
  $('recrop-help').textContent = `Kéo khung ôm trọn “${entry.input.value}”, gồm cả dấu và chân chữ. Tránh chạm dòng bên dưới.`;
  $('recrop-status').textContent = 'Đang mở ảnh mẫu…';
  recropCanvas.hidden = true;
  recropDialog.showModal();
  try {
    const image = await referenceCanvas(references[entry.index].file, entry.settings?.crop);
    if (!recropDialog.open || recropEntry !== entry) return;
    recropImage = image;
    recropCanvas.width = image.width;
    recropCanvas.height = image.height;
    recropCanvas.hidden = false;
    recropBox = { ...entry.word.bbox };
    drawRecrop();
    $('recrop-status').textContent = '';
  } catch {
    $('recrop-status').textContent = 'Chưa mở được ảnh cho dòng này.';
  }
}

function recropPoint(event) {
  const area = recropCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(recropCanvas.width, Math.round((event.clientX - area.left) * recropCanvas.width / area.width))),
    y: Math.max(0, Math.min(recropCanvas.height, Math.round((event.clientY - area.top) * recropCanvas.height / area.height)))
  };
}

recropCanvas.addEventListener('pointerdown', event => {
  if (!recropImage || event.button !== 0) return;
  recropCanvas.setPointerCapture(event.pointerId);
  recropStart = recropPoint(event);
});
recropCanvas.addEventListener('pointermove', event => {
  if (!recropStart) return;
  const { x, y } = recropPoint(event);
  if (Math.abs(x - recropStart.x) < 3 || Math.abs(y - recropStart.y) < 3) return;
  recropBox = { x0: Math.min(x, recropStart.x), x1: Math.max(x, recropStart.x),
    y0: Math.min(y, recropStart.y), y1: Math.max(y, recropStart.y) };
  drawRecrop();
  $('apply-recrop').disabled = false;
});
for (const event of ['pointerup', 'pointercancel']) recropCanvas.addEventListener(event, () => { recropStart = undefined; });
recropDialog.addEventListener('close', () => { recropEntry = recropImage = recropBox = recropStart = undefined; });
$('apply-recrop').addEventListener('click', async () => {
  const entry = recropEntry;
  if (!entry || !recropImage || !recropBox || busy || loading) return;
  entry.word = { ...entry.word, bbox: recropBox, symbols: [] };
  entry.thumbnail = wordThumbnail(recropImage, recropBox).toDataURL();
  entry.preview.src = entry.thumbnail;
  entry.done = false;
  entry.include.checked = true;
  persistReferences();
  recropDialog.close();
  const result = await applyReviewedWords(false, entry);
  if (result && entry.ai) summarizeGeminiScan(result);
});

function addReviewGroup(index, settings, rows) {
  const entry = references[index];
  if (!entry) return;
  const reviewed = { index, settings, rows: [], element: null };
  reviewGroups.push(reviewed);
  const group = document.createElement('fieldset');
  reviewed.element = group;
  const title = document.createElement('legend');
  title.textContent = `Ảnh ${index + 1} · ${entry.file.name}`;
  group.append(title);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'help';
    empty.textContent = 'Chưa đọc được chữ. Bạn có thể khoanh sát chữ hơn hoặc lấy nét thủ công.';
    group.append(empty);
  }
  for (const { word, thumbnail, text, checked, ai, done } of rows) {
    const row = document.createElement('div');
    row.className = 'ocr-word';
    const include = document.createElement('input');
    include.type = 'checkbox';
    include.checked = checked ?? (word.confidence >= 70 && [...word.text.normalize('NFC')].length === word.symbols.length);
    include.setAttribute('aria-label', 'Dùng từ ' + word.text);
    const input = document.createElement('input');
    input.value = text ?? word.text.normalize('NFC');
    input.setAttribute('aria-label', 'Sửa từ ' + word.text);
    input.spellcheck = false;
    const score = document.createElement('small');
    score.textContent = ai ? (ai.clear ? 'Gemini đọc rõ' : 'Cần bạn điền hoặc xác nhận chữ') : 'OCR ' + Math.round(word.confidence) + '%';
    const preview = document.createElement('img');
    preview.alt = '';
    preview.src = thumbnail;
    input.addEventListener('input', () => {
      item.done = false;
      if (ai) include.checked = !!input.value.trim();
      refreshReviewVisibility();
      persistReferences();
    });
    include.addEventListener('change', () => persistReferences());
    const enlarge = document.createElement('button');
    enlarge.type = 'button';
    enlarge.className = 'ocr-thumbnail';
    enlarge.setAttribute('aria-label', 'Phóng to ảnh của từ ' + word.text);
    enlarge.addEventListener('click', () => {
      if (preview.naturalWidth) openViewer(preview.src, preview.naturalWidth, preview.naturalHeight, 'Ảnh chữ · ' + input.value);
    });
    enlarge.append(preview);
    const recrop = document.createElement('button');
    recrop.type = 'button';
    recrop.className = 'quiet recrop-button';
    recrop.textContent = 'Khoanh lại vùng';
    recrop.addEventListener('click', () => openRecrop(item));
    row.append(include, enlarge, input, score, recrop);
    group.append(row);
    const item = { index, word, thumbnail, input, include, settings, ai, done: done ?? false, element: row, preview };
    reviewed.rows.push(item);
    reviewedWords.push(item);
  }
  $('ocr-results').append(group);
}

function refreshReviewVisibility() {
  const showAll = $('show-processed').checked;
  $('show-processed-row').hidden = !reviewedWords.some(entry => entry.done);
  for (const group of reviewGroups) {
    for (const entry of group.rows) entry.element.hidden = entry.done && !showAll;
    group.element.hidden = !!group.rows.length && group.rows.every(entry => entry.element.hidden);
  }
  $('apply-scan').disabled = busy || !reviewedWords.some(entry => !entry.done);
}

$('show-processed').addEventListener('change', refreshReviewVisibility);

function showScanReport(message, pending = false) {
  $('ai-scan-report').hidden = false;
  $('ai-scan-result').textContent = message;
  $('jump-to-review').hidden = !pending;
}

function summarizeGeminiScan({ added = [], existing = [] } = {}) {
  const total = reviewedWords.length;
  if (!total) return showScanReport('Gemini chưa tìm thấy vùng chữ. Thử khoanh sát phần chữ của ảnh rồi chạy lại.');
  const pending = reviewedWords.filter(entry => !entry.done).length;
  const start = 'Gemini đã đọc ' + total + ' vùng.';
  const changes = added.length ? ` Đã thêm ${added.length} ký tự: ${added.join(' ')}.`
    : existing.length ? ' Các ký tự xử lý được đã có trong bộ font: ' + existing.join(' ') + '.'
      : ' Chưa thêm ký tự nào.';
  const next = pending ? ` Còn ${pending} vùng cần duyệt.`
    : ' Kết quả đã có trong Bộ ký tự. Không cần bấm tách thủ công.';
  showScanReport(start + changes + next, !!pending);
  if (added.some(char => document.getElementById('lower-glyphs').contains(tiles.get(char)))) {
    $('lower-glyphs').closest('details').open = true;
  }
  if (added.some(char => document.getElementById('more-glyphs').contains(tiles.get(char)))) {
    $('more-glyphs').closest('details').open = true;
  }
}

$('jump-to-review').addEventListener('click', () => {
  $('ocr-review').focus({ preventScroll: true });
  $('ocr-review').scrollIntoView({ block: 'start' });
});

async function scanReferences(useAI = false) {
  if (busy || loading || !references.length) return;
  const key = useAI ? geminiKey.value.trim() : '';
  if (useAI && (!key || !connectedGeminiModel || connectionRequest)) {
    status('Hãy kiểm tra kết nối Gemini thành công trước khi chạy AI.');
    return;
  }
  rememberReference();
  const prepared = [];
  const failures = [];
  let worker;
  let model = connectedGeminiModel;
  setScanBusy(true);
  connectionButton.disabled = true;
  status(useAI ? 'Đang chuẩn bị ảnh mẫu cho Gemini…' : 'Đang tải bộ nhận diện tiếng Việt…');
  if (useAI) showScanReport('Đang chuẩn bị ảnh mẫu cho Gemini…');
  else $('ai-scan-report').hidden = true;
  try {
    if (!useAI) worker = await createOcrWorker();
    for (const [index, entry] of references.entries()) {
      const progress = `Đang ${useAI ? 'đọc ảnh bằng Gemini' : 'quét OCR'} ${index + 1}/${references.length}…`;
      status(progress);
      if (useAI) showScanReport(progress);
      let image;
      try {
        image = await referenceCanvas(entry.file, entry.settings?.crop);
      } catch {
        failures.push(index + 1);
        continue;
      }
      let words;
      if (useAI) {
        if (geminiKey.value.trim() !== key) throw new Error('Khóa đã đổi. Kiểm tra kết nối rồi chạy lại.');
        const result = await locateWordsWithGemini(image, key, model);
        words = result.words;
        model = result.model ?? model;
      } else {
        try { words = await detectWords(worker, image); }
        catch {
          failures.push(index + 1);
          continue;
        }
      }
      const rows = words.map(({ text, confidence, bbox, symbols, clear }) => ({
        word: { text, confidence, bbox, symbols: symbols.map(symbol => ({ bbox: symbol.bbox, confidence: symbol.confidence })) },
        thumbnail: wordThumbnail(image, bbox).toDataURL(),
        ...(useAI ? { text, ai: { clear }, checked: clear && !!text } : {})
      }));
      prepared.push({ index, settings: entry.settings, rows });
    }
    if (useAI && geminiKey.value.trim() !== key) throw new Error('Khóa đã đổi. Kiểm tra kết nối rồi chạy lại.');
    if (!prepared.length) throw new Error('Không mở hoặc đọc được ảnh nào.');
    if (useAI) { connectedGeminiModel = model; saveGeminiPreference(); }
    reviewedWords = [];
    reviewGroups = [];
    $('ocr-results').replaceChildren();
    $('ocr-status').textContent = '';
    $('show-processed').checked = false;
    for (const group of prepared) addReviewGroup(group.index, group.settings, group.rows);
    $('ocr-review').hidden = false;
    persistReferences();
    const suffix = failures.length ? ' Không mở hoặc đọc được ảnh ' + failures.join(', ') + '.' : '';
    status(`Tìm được ${reviewedWords.length} vùng chữ trong ${prepared.length}/${references.length} ảnh.` + suffix);
    if (useAI) {
      if (reviewedWords.some(entry => entry.include.checked)) {
        setScanBusy(false);
        showScanReport('Gemini đã đọc xong. Đang lấy nét từ ảnh gốc…');
        summarizeGeminiScan(await applyReviewedWords(true));
      } else summarizeGeminiScan();
    }
  } catch (error) {
    if (useAI) {
      connectedGeminiModel = undefined;
      saveGeminiPreference();
      connectionStatus.textContent = 'Cần kiểm tra lại kết nối trước khi chạy AI.';
      showScanReport('Đã dừng Gemini. ' + error.message);
    }
    status((useAI ? 'Đã dừng Gemini. ' : 'Quét OCR chưa hoàn tất. ') + error.message);
  } finally {
    try { await worker?.terminate(); } finally {
      setScanBusy(false);
      connectionButton.disabled = !geminiKey.value.trim();
      refreshReviewVisibility();
    }
  }
}

async function applyReviewedWords(automatic = false, onlyEntry) {
  if (busy || loading) return;
  const chosen = reviewedWords.filter(entry => entry.include.checked && !entry.done && (!onlyEntry || entry === onlyEntry) && (!automatic || entry.ai?.clear));
  const message = $('ocr-status');
  if (!chosen.length) {
    message.textContent = 'Chọn ít nhất một từ để lấy nét.';
    return;
  }
  const groups = new Map();
  const skipped = [];
  for (const entry of chosen) {
    const chars = [...entry.input.value.normalize('NFC').replace(/\s/g, '')];
    if (!chars.length || chars.some(char => !charset.includes(char))) {
      skipped.push(`Ảnh ${entry.index + 1}: “${entry.input.value}” (ký tự ngoài bảng hoặc ô trống)`);
      continue;
    }
    const group = groups.get(entry.index) ?? [];
    group.push({ entry, chars });
    groups.set(entry.index, group);
  }
  setScanBusy(true);
  const added = new Map();
  const scores = new Map();
  const failed = new Set();
  const imported = new Set();
  const mapped = [];
  const existing = new Set();
  try {
    for (const [index, group] of groups) {
      let image;
      try {
        image = await referenceCanvas(references[index].file, group[0].entry.settings?.crop);
      } catch {
        skipped.push(`Ảnh ${index + 1}: không mở được ảnh`);
        continue;
      }
      for (const { entry, chars } of group) {
        const mask = wordInk(image, entry.word.bbox, entry.settings);
        const matching = chars.length === entry.word.symbols.length;
        const agreesWithOcr = entry.word.confidence >= 70 && chars.join('') === entry.word.text.normalize('NFC');
        const separated = splitWordByGaps(mask, entry.word.bbox, chars.length);
        const boxes = separated.length ? separated
          : matching && (!automatic || agreesWithOcr) ? entry.word.symbols.map(symbol => symbol.bbox) : [];
        if (!boxes.length) {
          skipped.push(`Ảnh ${index + 1}: “${chars.join('')}” (chưa tách được ${chars.length} chữ; bấm “Khoanh lại vùng”)`);
          continue;
        }
        mapped.push({ entry, chars });
        for (const [i, char] of chars.entries()) {
          if (glyphs.get(char)?.source === 'Ảnh mẫu') {
            existing.add(char);
            continue;
          }
          const score = matching ? entry.word.symbols[i].confidence ?? entry.word.confidence : 0;
          if (scores.has(char) && scores.get(char) >= score) continue;
          try {
            message.textContent = `Đang lấy nét chữ ${char}…`;
            const box = boxes[i];
            const area = entry.settings?.crop;
            const glyph = await traceSymbol(mask, box, char, entry.word.bbox);
            glyph.reference = { index, crop: {
              x: (area?.x ?? 0) + box.x0, y: (area?.y ?? 0) + box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0
            } };
            added.set(char, glyph);
            scores.set(char, score);
            imported.add(index);
          } catch {
            failed.add(char);
          }
        }
      }
    }
    for (const [char, glyph] of added) glyphs.set(char, glyph);
    for (const { entry, chars } of mapped) {
      if (chars.join('') === entry.input.value.normalize('NFC').replace(/\s/g, '') && chars.every(char => glyphs.has(char))) {
        entry.done = true;
        entry.include.checked = false;
      }
    }
    for (const index of imported) {
      const entry = references[index];
      entry.settings = { ...entry.settings, used: true };
    }
    persistReferences();
    updateComposed();
    refresh();
    const missing = [...failed].filter(char => !added.has(char));
    message.textContent = added.size ? `Đã thêm ${added.size} ký tự từ ảnh gốc. Xem bộ ký tự và tải .TTF bên dưới.` : 'Chưa có ký tự mới để thêm.';
    if (missing.length) message.textContent += ' Cần khoanh lại: ' + missing.join(' ');
    if (automatic) {
      const pending = reviewedWords.filter(entry => !entry.done);
      // Leave only unambiguous matches imported. Remaining rows need an explicit choice.
      pending.forEach(entry => { entry.include.checked = false; });
      message.textContent += ` Còn ${pending.length} vùng cần duyệt.`;
      persistReferences();
    } else if (skipped.length) message.textContent += '\nChưa lấy nét từ ' + skipped.length + ' vùng:\n' + skipped.join('\n');
    return { added: [...added.keys()], existing: [...existing] };
  } finally {
    setScanBusy(false);
    refreshReviewVisibility();
  }
}

$('ai-scan').addEventListener('click', () => scanReferences(true));
$('scan').addEventListener('click', () => scanReferences());
$('apply-scan').addEventListener('click', async () => {
  const result = await applyReviewedWords();
  if (result && reviewedWords.some(entry => entry.ai)) summarizeGeminiScan(result);
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
    for (const group of state.review ?? []) addReviewGroup(group.index, group.settings, group.rows);
    $('ocr-review').hidden = !reviewGroups.length;
    refreshReviewVisibility();
    const index = state.activeReference >= 0 && state.activeReference < references.length ? state.activeReference : 0;
    await showReference(index);
    if (reviewedWords.some(entry => entry.ai)) {
      const existing = [...new Set(reviewedWords.filter(entry => entry.done)
        .flatMap(entry => [...entry.input.value.normalize('NFC')]).filter(char => glyphs.has(char)))];
      summarizeGeminiScan({ existing });
    }
    $('reference-storage').textContent = `Đã khôi phục ${images.length} ảnh và phần duyệt đã lưu.`;
  } catch {
    $('reference-storage').textContent = 'Không đọc được ảnh đã lưu trên trình duyệt này.';
  } finally {
    restoring = false;
    renderReferences();
  }
}

restoreReferenceProject();
