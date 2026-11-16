import { segmentImage, makeGlyph, exportFont, MAX_SIDE } from './engine.js';
import { core, lowercase, charset, composeVietnamese } from './vietnamese.js';
import { createOcrWorker, referenceCanvas, detectWords, wordThumbnail, wordInk, splitWordByGaps, traceSymbol } from './ocr.js';
import { loadReferences, saveReferences } from './reference-storage.js';

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
  if (restoring || !references.length) return;
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
        word: row.word, thumbnail: row.thumbnail, text: row.input.value, checked: row.include.checked
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
  $('scan').disabled = busy || loading || !references.length;
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

function setZoom(value) {
  zoom = Math.max(0.25, Math.min(12, value));
  viewerImage.style.width = Math.round(zoomWidth * zoom) + 'px';
  $('zoom-value').textContent = Math.round(zoom * 100) + '%';
  $('zoom-in').disabled = zoom >= 12;
  $('zoom-out').disabled = zoom <= 0.25;
}

function openViewer(url, width, height, title) {
  if (viewer.open) return;
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
  openViewer('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(outline), width, height, `Ký tự ${char} · ${glyph.source}`);
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
      traced.set(char, await makeGlyph(ink, width, boxes[i], char));
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

function addReviewGroup(index, settings, rows) {
  const entry = references[index];
  if (!entry) return;
  const reviewed = { index, settings, rows: [] };
  reviewGroups.push(reviewed);
  const group = document.createElement('fieldset');
  const title = document.createElement('legend');
  title.textContent = `Ảnh ${index + 1} · ${entry.file.name}`;
  group.append(title);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'help';
    empty.textContent = 'Chưa đọc được chữ. Bạn có thể khoanh sát chữ hơn hoặc lấy nét thủ công.';
    group.append(empty);
  }
  for (const { word, thumbnail, text, checked } of rows) {
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
    score.textContent = 'Độ tin cậy ' + Math.round(word.confidence) + '%';
    const preview = document.createElement('img');
    preview.alt = '';
    preview.src = thumbnail;
    input.addEventListener('input', () => persistReferences());
    include.addEventListener('change', () => persistReferences());
    const enlarge = document.createElement('button');
    enlarge.type = 'button';
    enlarge.className = 'ocr-thumbnail';
    enlarge.setAttribute('aria-label', 'Phóng to ảnh của từ ' + word.text);
    enlarge.addEventListener('click', () => {
      if (preview.naturalWidth) openViewer(preview.src, preview.naturalWidth, preview.naturalHeight, 'Ảnh chữ · ' + input.value);
    });
    enlarge.append(preview);
    row.append(include, enlarge, input, score);
    group.append(row);
    const item = { index, word, thumbnail, input, include, settings };
    reviewed.rows.push(item);
    reviewedWords.push(item);
  }
  $('ocr-results').append(group);
}

async function scanReferences() {
  if (busy || loading || !references.length) return;
  rememberReference();
  reviewedWords = [];
  reviewGroups = [];
  $('ocr-results').replaceChildren();
  $('ocr-status').textContent = '';
  $('ocr-review').hidden = true;
  setScanBusy(true);
  status('Đang tải bộ nhận diện tiếng Việt…');
  let worker;
  let failures = 0;
  try {
    worker = await createOcrWorker();
    for (const [index, entry] of references.entries()) {
      status(`Đang quét ảnh ${index + 1}/${references.length}…`);
      try {
        const image = await referenceCanvas(entry.file, entry.settings?.crop);
        const words = await detectWords(worker, image);
        const rows = words.map(({ text, confidence, bbox, symbols }) => ({
          word: { text, confidence, bbox, symbols: symbols.map(symbol => ({ bbox: symbol.bbox, confidence: symbol.confidence })) },
          thumbnail: wordThumbnail(image, bbox).toDataURL()
        }));
        addReviewGroup(index, entry.settings, rows);
      } catch {
        failures++;
        const note = document.createElement('p');
        note.className = 'help';
        note.textContent = `Không quét được ảnh ${index + 1} · ${entry.file.name}`;
        $('ocr-results').append(note);
      }
    }
    $('ocr-review').hidden = false;
    persistReferences();
    status(`Tìm được ${reviewedWords.length} từ trong ${references.length - failures}/${references.length} ảnh đã quét. Hãy duyệt kết quả bên dưới.`);
  } catch (error) {
    status('Quét ảnh chưa hoàn tất. ' + error.message);
  } finally {
    try { await worker?.terminate(); } finally { setScanBusy(false); }
  }
}

async function applyReviewedWords() {
  if (busy || loading) return;
  const chosen = reviewedWords.filter(entry => entry.include.checked);
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
        const separated = splitWordByGaps(mask, entry.word.bbox, chars.length);
        const boxes = separated.length ? separated
          : matching ? entry.word.symbols.map(symbol => symbol.bbox) : [];
        if (!boxes.length) {
          skipped.push(`Ảnh ${index + 1}: “${chars.join('')}” (${entry.word.symbols.length} vùng OCR cho ${chars.length} chữ)`);
          continue;
        }
        for (const [i, char] of chars.entries()) {
          if (glyphs.get(char)?.source === 'Ảnh mẫu') continue;
          const score = matching ? entry.word.symbols[i].confidence ?? entry.word.confidence : 0;
          if (scores.has(char) && scores.get(char) >= score) continue;
          try {
            message.textContent = `Đang lấy nét chữ ${char}…`;
            added.set(char, await traceSymbol(mask, boxes[i], char, entry.word.bbox));
            scores.set(char, score);
            imported.add(index);
          } catch {
            failed.add(char);
          }
        }
      }
    }
    for (const [char, glyph] of added) glyphs.set(char, glyph);
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
    if (skipped.length) message.textContent += '\nChưa lấy nét từ ' + skipped.length + ' vùng:\n' + skipped.join('\n');
  } finally {
    setScanBusy(false);
  }
}

$('scan').addEventListener('click', scanReferences);
$('apply-scan').addEventListener('click', applyReviewedWords);

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
    $('apply-scan').disabled = !reviewedWords.length;
    const index = state.activeReference >= 0 && state.activeReference < references.length ? state.activeReference : 0;
    await showReference(index);
    $('reference-storage').textContent = `Đã khôi phục ${images.length} ảnh và phần duyệt đã lưu.`;
  } catch {
    $('reference-storage').textContent = 'Không đọc được ảnh đã lưu trên trình duyệt này.';
  } finally {
    restoring = false;
    renderReferences();
  }
}

restoreReferenceProject();
