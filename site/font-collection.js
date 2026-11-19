import { createFontFamily } from './font-family.js';
// Store the original font files so downloads preserve the imported bytes.
let database;

function accessFonts(mode, action) {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('xuong-font-collection', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('fonts', { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    database = undefined;
    throw error;
  });

  return database.then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction('fonts', mode);
    const request = action(transaction.objectStore('fonts'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('Lưu trữ bị gián đoạn.'));
  }));
}

async function fontDigest(blob) {
  const bytes = await blob.arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

async function cleanDuplicates() {
  const records = await accessFonts('readonly', store => store.getAll());
  const legacy = records.filter(record => !record.digest);
  if (!legacy.length) return 0;
  const digests = new Map(await Promise.all(legacy.map(async record => [record.id, await fontDigest(record.blob)])));
  let removed = 0;
  await accessFonts('readwrite', store => {
    const request = store.getAll();
    request.onsuccess = () => {
      const existing = new Set(request.result.map(record => record.digest).filter(Boolean));
      for (const record of request.result) {
        const digest = digests.get(record.id);
        if (record.digest || !digest) continue;
        if (existing.has(digest)) {
          store.delete(record.id);
          removed++;
        } else {
          store.put({ ...record, digest });
          existing.add(digest);
        }
      }
    };
    return request;
  });
  return removed;
}

function isHungFont(record) {
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['suvietkieuhung', 'vietsukieuhung'].includes(normalize(record.name))
    && ['suvietkieuhung', 'vietsukieuhung'].includes(normalize(record.filename.replace(/\.(ttf|otf)$/i, '')));
}

function cleanHungCopies() {
  let removed = 0;
  return accessFonts('readwrite', store => {
    const request = store.getAll();
    request.onsuccess = () => {
      const copies = request.result.filter(isHungFont);
      for (const copy of copies.slice(0, -1)) {
        store.delete(copy.id);
        removed++;
      }
    };
    return request;
  }).then(() => removed);
}

async function addFont(record) {
  const digest = await fontDigest(record.blob);
  let result;
  await accessFonts('readwrite', store => {
    const request = store.getAll();
    request.onsuccess = () => {
      const existing = request.result.find(item => item.digest === digest);
      if (existing) {
        result = { id: existing.id, duplicate: true };
      } else {
        const previous = isHungFont(record) ? request.result.findLast(isHungFont) : undefined;
        const add = previous ? store.put({ ...record, digest, id: previous.id }) : store.add({ ...record, digest });
        add.onsuccess = () => { result = { id: add.result, duplicate: false }; };
      }
    };
    return request;
  });
  return result;
}

// Prefer the typographic family, which groups weights across legacy Windows families.
function fontFamilyFromBytes(bytes) {
  const data = new DataView(bytes);
  if (data.byteLength < 12) return '';
  const tables = data.getUint16(4);
  for (let i = 0; i < tables; i++) {
    const entry = 12 + i * 16;
    if (entry + 16 > data.byteLength) break;
    if (data.getUint32(entry) !== 0x6e616d65) continue;
    const start = data.getUint32(entry + 8);
    const end = start + data.getUint32(entry + 12);
    if (end > data.byteLength || end - start < 6) return '';
    const count = data.getUint16(start + 2);
    const strings = start + data.getUint16(start + 4);
    let best = '', priority = -1;
    for (let j = 0; j < count; j++) {
      const row = start + 6 + j * 12;
      if (row + 12 > Math.min(end, strings)) break;
      const platform = data.getUint16(row);
      const language = data.getUint16(row + 4);
      const nameId = data.getUint16(row + 6);
      if (![16, 1].includes(nameId) || ![0, 3].includes(platform)) continue;
      const length = data.getUint16(row + 8);
      const offset = strings + data.getUint16(row + 10);
      if (length % 2 || offset + length > end) continue;
      const value = new TextDecoder('utf-16be').decode(new Uint8Array(bytes, offset, length)).trim();
      const rank = (nameId === 16 ? 10 : 0) + (language === 0x409 ? 2 : 0) + (platform === 3 ? 1 : 0);
      if (value && rank > priority) {
        best = value;
        priority = rank;
      }
    }
    return best;
  }
  return '';
}

function familyName(value) {
  // Some legacy fonts include the weight in the family field itself.
  return value.replace(/(?:[\s_-]+(?:extra[\s_-]*light|xlight|ultra[\s_-]*light|thin|light|book|regular|medium|semi[\s_-]*bold|demi[\s_-]*bold|extra[\s_-]*bold|x[\s_-]*bold|ultra[\s_-]*bold|bold|black|heavy|italic|oblique|roman))+$/iu, '').trim() || value;
}

const nameOrder = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

export function setupFontCollection(getCurrentFont, vietnamize) {
  const $ = id => document.getElementById(id);
  const dialog = $('font-collection');
  const files = $('collection-files');
  const fonts = $('collection-families');
  const name = $('collection-name');
  const sample = $('collection-sample');
  const preview = $('collection-preview');
  const download = $('collection-download');
  const saveCurrent = $('collection-save-current');
  const status = $('collection-status');
  let records = [];
  let selectedId;
  let page = 0;
  let groups = [];
  const expandedFamilies = new Set();
  const previousPage = $('collection-previous');
  const nextPage = $('collection-next');
  const familiesByDigest = new Map();
  let objectURL;
  let previewFace;
  let previewRevision = 0;
  let working = false;

  function clearPreview() {
    previewRevision++;
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = undefined;
    if (previewFace) document.fonts.delete(previewFace);
    previewFace = undefined;
    download.removeAttribute('href');
    preview.style.removeProperty('font-family');
  }

  async function showSelection() {
    clearPreview();
    const revision = previewRevision;
    const record = records.find(item => item.id === selectedId);
    $('collection-editor').hidden = !record;
    if (!record) return;
    name.value = record.name;
    preview.textContent = sample.value;
    objectURL = URL.createObjectURL(record.blob);
    download.href = objectURL;
    download.download = record.filename;
    try {
      const face = new FontFace('collection-preview-' + revision, await record.blob.arrayBuffer());
      await face.load();
      if (revision !== previewRevision || !dialog.open) return;
      document.fonts.add(face);
      previewFace = face;
      preview.style.fontFamily = face.family + ', serif';
    } catch {
      if (revision === previewRevision && dialog.open) status.textContent = 'Trình duyệt chưa xem thử được font này.';
    }
  }

  async function refresh(preferred = selectedId) {
    records = await accessFonts('readonly', store => store.getAll());
    selectedId = records.some(record => record.id === preferred) ? preferred : undefined;
    const grouped = new Map();
    for (const record of records) {
      let family = familiesByDigest.get(record.digest);
      if (!family) {
        const raw = fontFamilyFromBytes(await record.blob.arrayBuffer());
        family = familyName(raw || record.filename.replace(/\.(ttf|otf)$/i, '') || record.name);
        familiesByDigest.set(record.digest, family);
      }
      const key = family.normalize('NFC').toLocaleLowerCase('vi');
      if (!grouped.has(key)) grouped.set(key, { key, family, members: [] });
      grouped.get(key).members.push(record);
    }
    groups = [...grouped.values()].sort((a, b) => nameOrder.compare(a.family, b.family));
    for (const group of groups) {
      group.members.sort((a, b) => nameOrder.compare(a.name, b.name));
      if (group.members.some(record => record.id === selectedId)) expandedFamilies.add(group.key);
    }
    $('collection-fonts').hidden = !records.length;
    $('collection-count').textContent = '(' + records.length + ')';
    renderFamilies(true);
    if (dialog.open) await showSelection();
  }

  function renderFamilies(revealSelected = false, focusKey) {
    const rows = groups.flatMap(group => expandedFamilies.has(group.key)
      ? [{ group }, ...group.members.map(record => ({ group, record }))] : [{ group }]);
    const pageSize = 3;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const selectedRow = rows.findIndex(row => row.record?.id === selectedId && row.record);
    if (revealSelected && selectedRow >= 0) page = Math.floor(selectedRow / pageSize);
    page = Math.min(page, pages - 1);
    fonts.replaceChildren();
    for (const { group, record } of rows.slice(page * pageSize, (page + 1) * pageSize)) {
      const button = document.createElement('button');
      button.type = 'button';
      if (record) {
        button.className = 'collection-variant';
        button.textContent = record.name;
        button.setAttribute('aria-pressed', String(record.id === selectedId));
        button.addEventListener('click', () => {
          if (working) return;
          fonts.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-pressed', 'true');
          selectedId = record.id;
          showSelection();
        });
      } else {
        const expanded = expandedFamilies.has(group.key);
        button.className = 'collection-family';
        button.textContent = (expanded ? '▾ ' : '▸ ') + group.family + ' (' + group.members.length + ')';
        button.setAttribute('aria-expanded', String(expanded));
        button.addEventListener('click', () => {
          if (expanded) expandedFamilies.delete(group.key);
          else expandedFamilies.add(group.key);
          renderFamilies(false, group.key);
        });
      }
      fonts.append(button);
      if (!record && focusKey === group.key) button.focus();
    }
    $('collection-page').textContent = (page + 1) + ' / ' + pages;
    previousPage.disabled = page === 0;
    nextPage.disabled = page + 1 >= pages;
  }

  previousPage.addEventListener('click', () => { page--; renderFamilies(); });
  nextPage.addEventListener('click', () => { page++; renderFamilies(); });

  async function run(action) {
    if (working) return;
    working = true;
    files.disabled = saveCurrent.disabled = true;
    fonts.setAttribute('aria-busy', 'true');
    status.textContent = '';
    try {
      await action();
    } catch (error) {
      status.textContent = 'Không thể cập nhật bộ sưu tập. ' + error.message;
    } finally {
      working = false;
      files.disabled = false;
      fonts.removeAttribute('aria-busy');
      saveCurrent.disabled = !getCurrentFont();
    }
  }

  $('open-font-collection').addEventListener('click', () => {
    dialog.showModal();
    run(async () => {
      const removed = await cleanHungCopies() + await cleanDuplicates();
      await refresh();
      if (removed) status.textContent = 'Đã xóa ' + removed + ' bản trùng font. Mỗi file chỉ giữ một bản.';
      else if (!records.length) status.textContent = 'Bạn chưa lưu font nào.';
    });
  });
  dialog.addEventListener('close', clearPreview);
  sample.addEventListener('input', () => { preview.textContent = sample.value; });

  files.addEventListener('change', () => {
    const batch = [...files.files];
    files.value = '';
    if (!batch.length) return;
    run(async () => {
      let saved = 0, last;
      const invalid = [], duplicates = [];
      for (const file of batch) {
        try {
          if (!/\.(ttf|otf)$/i.test(file.name)) throw new Error();
          const test = new FontFace('collection-validation', await file.arrayBuffer());
          await test.load();
        } catch {
          invalid.push(file.name);
          continue;
        }
        const record = { name: file.name.replace(/\.(ttf|otf)$/i, '').slice(0, 100), filename: file.name, blob: file };
        const result = await addFont(record);
        last = result.id;
        if (result.duplicate) duplicates.push(file.name);
        else saved++;
      }
      await refresh(last);
      status.textContent = `Đã lưu ${saved} font.` + (duplicates.length ? '\nTrùng font, đã bỏ qua: ' + duplicates.join(', ') : '')
        + (invalid.length ? '\nKhông đọc được: ' + invalid.join(', ') : '');
    });
  });

  saveCurrent.addEventListener('click', () => run(async () => {
    const record = getCurrentFont();
    if (!record) return;
    const { id, duplicate } = await addFont(record);
    await refresh(id);
    status.textContent = duplicate ? 'Trùng font: ' + record.name + ' đã có trong bộ sưu tập.' : 'Đã lưu ' + record.name + '.';
  }));

  $('collection-rename').addEventListener('submit', event => {
    event.preventDefault();
    const record = records.find(item => item.id === selectedId);
    const next = name.value.trim();
    if (!record || !next) return;
    run(async () => {
      await accessFonts('readwrite', store => store.put({ ...record, name: next }));
      await refresh(record.id);
      status.textContent = 'Đã lưu tên font.';
    });
  });

  $('collection-vietnamize').addEventListener('click', () => {
    const record = records.find(item => item.id === selectedId);
    if (!record) return;
    run(async () => {
      if (await vietnamize(record)) dialog.close();
    });
  });


  const familyDialog = $('family-dialog');
  let familyRecord;
  let familyRunning = false;
  const familyAssets = [];
  $('collection-family-open').addEventListener('click', () => {
    if (working) return;
    familyRecord = records.find(record => record.id === selectedId);
    if (!familyRecord) return;
    $('family-source').textContent = 'Font gốc: ' + familyRecord.name;
    familyDialog.showModal();
  });
  familyDialog.addEventListener('cancel', event => { if (familyRunning) event.preventDefault(); });
  familyDialog.addEventListener('close', () => {
    for (const asset of familyAssets) { URL.revokeObjectURL(asset.url); document.fonts.delete(asset.face); }
    familyAssets.length = 0;
    $('family-results').replaceChildren();
  });
  $('family-create').addEventListener('click', async () => {
    if (familyRunning || !familyRecord) return;
    const styles = [['family-medium','Medium'],['family-semibold','SemiBold'],['family-bold','Bold']]
      .filter(([id]) => $(id).checked).map(([,style]) => style);
    if (!styles.length) { $('family-status').textContent = 'Chọn ít nhất một kiểu chữ.'; return; }
    familyRunning = true;
    $('family-create').disabled = $('family-close').disabled = true;
    for (const asset of familyAssets) { URL.revokeObjectURL(asset.url); document.fonts.delete(asset.face); }
    familyAssets.length = 0;
    $('family-results').replaceChildren();
    $('family-status').textContent = 'Đang tạo family…';
    try {
      await createFontFamily(familyRecord, styles, $('family-text').value, async result => {
        const face = new FontFace('family-proof-' + crypto.randomUUID(), await result.blob.arrayBuffer());
        await face.load();
        document.fonts.add(face);
        const url = URL.createObjectURL(result.blob);
        familyAssets.push({ face, url });
        const row = document.createElement('section');
        row.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--line)';
        const label = document.createElement('strong');
        label.textContent = result.style;
        const proof = document.createElement('p');
        proof.style.cssText = 'font-size:32px;overflow-wrap:anywhere;white-space:pre-wrap';
        proof.style.fontFamily = face.family;
        proof.textContent = result.text;
        const link = document.createElement('a');
        link.className = 'download'; link.href = url; link.download = result.filename; link.textContent = 'Tải ' + result.style;
        const saveButton = document.createElement('button');
        saveButton.type = 'button'; saveButton.textContent = 'Lưu bộ sưu tập';
        saveButton.addEventListener('click', async () => {
          saveButton.disabled = true;
          try {
            const added = await addFont(result);
            saveButton.textContent = added.duplicate ? 'Đã có trong bộ sưu tập' : 'Đã lưu';
            await refresh(added.id);
          } catch (error) { saveButton.disabled = false; $('family-status').textContent = error.message; }
        });
        const actions = document.createElement('div'); actions.className = 'tool-row'; actions.append(link,saveButton);
        row.append(label,proof,actions); $('family-results').append(row);
        $('family-status').textContent = 'Đã tạo ' + result.style + '.';
      });
      $('family-status').textContent = 'Đã tạo family. So sánh các kiểu bên dưới rồi tải hoặc lưu.';
    } catch (error) { $('family-status').textContent = 'Tạo family chưa hoàn tất: ' + error.message; }
    finally { familyRunning = false; $('family-create').disabled = $('family-close').disabled = false; }
  });

  $('collection-remove').addEventListener('click', () => {
    const record = records.find(item => item.id === selectedId);
    if (working || !record || !window.confirm('Xóa “' + record.name + '” khỏi bộ sưu tập?')) return;
    run(async () => {
      await accessFonts('readwrite', store => store.delete(record.id));
      await refresh();
      status.textContent = 'Đã xóa khỏi bộ sưu tập.';
    });
  });
}
