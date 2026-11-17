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
        const add = store.add({ ...record, digest });
        add.onsuccess = () => { result = { id: add.result, duplicate: false }; };
      }
    };
    return request;
  });
  return result;
}

export function setupFontCollection(getCurrentFont) {
  const $ = id => document.getElementById(id);
  const dialog = $('font-collection');
  const files = $('collection-files');
  const fonts = $('collection-fonts');
  const name = $('collection-name');
  const sample = $('collection-sample');
  const preview = $('collection-preview');
  const download = $('collection-download');
  const saveCurrent = $('collection-save-current');
  const status = $('collection-status');
  let records = [];
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
    const record = records.find(item => String(item.id) === fonts.value);
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

  async function refresh(preferred = fonts.value) {
    records = (await accessFonts('readonly', store => store.getAll())).reverse();
    fonts.replaceChildren(...records.map(record => new Option(record.name, record.id)));
    fonts.size = Math.max(2, Math.min(5, records.length));
    $('collection-count').textContent = '(' + records.length + ')';
    // A listbox does not automatically select its first option.
    fonts.selectedIndex = Math.max(0, records.findIndex(record => String(record.id) === String(preferred)));
    if (dialog.open) await showSelection();
  }

  async function run(action) {
    if (working) return;
    working = true;
    files.disabled = fonts.disabled = saveCurrent.disabled = true;
    status.textContent = '';
    try {
      await action();
    } catch (error) {
      status.textContent = 'Không thể cập nhật bộ sưu tập. ' + error.message;
    } finally {
      working = false;
      files.disabled = fonts.disabled = false;
      saveCurrent.disabled = !getCurrentFont();
    }
  }

  $('open-font-collection').addEventListener('click', () => {
    dialog.showModal();
    run(async () => {
      const removed = await cleanDuplicates();
      await refresh();
      if (removed) status.textContent = 'Đã xóa ' + removed + ' bản trùng font. Mỗi file chỉ giữ một bản.';
      else if (!records.length) status.textContent = 'Bạn chưa lưu font nào.';
    });
  });
  dialog.addEventListener('close', clearPreview);
  fonts.addEventListener('change', showSelection);
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
    const record = records.find(item => String(item.id) === fonts.value);
    const next = name.value.trim();
    if (!record || !next) return;
    run(async () => {
      await accessFonts('readwrite', store => store.put({ ...record, name: next }));
      await refresh(record.id);
      status.textContent = 'Đã lưu tên font.';
    });
  });

  $('collection-remove').addEventListener('click', () => {
    const record = records.find(item => String(item.id) === fonts.value);
    if (working || !record || !window.confirm('Xóa “' + record.name + '” khỏi bộ sưu tập?')) return;
    run(async () => {
      await accessFonts('readwrite', store => store.delete(record.id));
      await refresh();
      status.textContent = 'Đã xóa khỏi bộ sưu tập.';
    });
  });
}
