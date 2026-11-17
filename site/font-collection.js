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
      await refresh();
      if (!records.length) status.textContent = 'Bạn chưa lưu font nào.';
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
      const invalid = [];
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
        last = await accessFonts('readwrite', store => store.add(record));
        saved++;
      }
      await refresh(last);
      status.textContent = `Đã lưu ${saved} font.` + (invalid.length ? '\nKhông đọc được: ' + invalid.join(', ') : '');
    });
  });

  saveCurrent.addEventListener('click', () => run(async () => {
    const record = getCurrentFont();
    if (!record) return;
    const id = await accessFonts('readwrite', store => store.add(record));
    await refresh(id);
    status.textContent = 'Đã lưu ' + record.name + '.';
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
