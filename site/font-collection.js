import { familyWeights, familyStyles, identifyFamilyStyle } from './family-styles.js';
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
        if (record.generatedFrom != null) store.put({ ...existing, ...record, id: existing.id, digest });
        result = { id: existing.id, duplicate: true };
      } else {
        const previous = record.generatedFrom != null
          ? request.result.find(item => item.family === record.family && identifyFamilyStyle(item) === identifyFamilyStyle(record))
          : isHungFont(record) ? request.result.findLast(isHungFont) : undefined;
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
  let editingRecord;
  const workspace = $('font-workspace');
  const createTab = $('open-font-workspace');
  const collectionTab = $('open-font-collection');
  const rulesTab = $('open-font-rules');
  const rulesPanel = $('font-rules');
  const collectionVisible = () => !dialog.hidden;
  const tabs = [createTab, collectionTab, rulesTab];
  function selectTab(value) {
    const active = value === 'rules' ? rulesTab : value ? collectionTab : createTab;
    workspace.hidden = active !== createTab;
    dialog.hidden = active !== collectionTab;
    rulesPanel.hidden = active !== rulesTab;
    for (const tab of tabs) {
      tab.setAttribute('aria-selected', String(tab === active));
      tab.tabIndex = tab === active ? 0 : -1;
    }
    if (active !== collectionTab) clearPreview();
  }
  createTab.addEventListener('click', () => selectTab(false));
  rulesTab.addEventListener('click', () => selectTab('rules'));
  for (const tab of tabs) tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
      : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.click(); next.focus();
  });

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
    $('collection-empty').hidden = !!record;
    if (!record) return;
    name.value = record.name;
    renderFamilyMatrix(record);
    preview.textContent = sample.value;
    objectURL = URL.createObjectURL(record.blob);
    download.href = objectURL;
    download.download = record.filename;
    try {
      const face = new FontFace('collection-preview-' + revision, await record.blob.arrayBuffer());
      await face.load();
      if (revision !== previewRevision || !collectionVisible()) return;
      document.fonts.add(face);
      previewFace = face;
      preview.style.fontFamily = face.family + ', serif';
    } catch {
      if (revision === previewRevision && collectionVisible()) status.textContent = 'Trình duyệt chưa xem thử được font này.';
    }
  }

  async function refresh(preferred = selectedId) {
    records = await accessFonts('readonly', store => store.getAll());
    selectedId = records.some(record => record.id === preferred) ? preferred : undefined;
    const grouped = new Map();
    for (const record of records) {
      let family = record.family || familiesByDigest.get(record.digest);
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
      group.members.sort((a, b) => familyStyles.findIndex(style => style.style === identifyFamilyStyle(a)) - familyStyles.findIndex(style => style.style === identifyFamilyStyle(b)) || nameOrder.compare(a.name,b.name));
      if (group.members.some(record => record.id === selectedId)) expandedFamilies.add(group.key);
    }
    $('collection-fonts').hidden = !records.length;
    $('collection-count').textContent = '(' + records.length + ')';
    renderFamilies(true);
    if (collectionVisible()) await showSelection();
  }

  function renderFamilyMatrix(selectedRecord) {
    const group = groups.find(group => group.members.some(item => item.id === selectedRecord.id));
    const matrix = $('collection-family-matrix'); matrix.replaceChildren();
    if (!group) return;
    const title = document.createElement('h3');
    const slots = new Set(group.members.map(identifyFamilyStyle).filter(style => familyStyles.some(item => item.style === style)));
    title.textContent = group.family + ' · ' + slots.size + ' / 16 vị trí'; matrix.append(title);
    const grid = document.createElement('div'); grid.className = 'family-matrix';
    for (const weight of familyWeights) {
      const label = document.createElement('strong'); label.textContent = weight.name; grid.append(label);
      for (const italic of [false,true]) {
        const style = weight.name + (italic ? ' Italic' : '');
        const member = group.members.find(item => identifyFamilyStyle(item) === style);
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = (italic ? 'Nghiêng' : 'Đứng') + ' · ' + (member ? member.draft ? 'Bản nháp' : 'Đã có' : 'Còn thiếu');
        button.title = style; button.disabled = !member;
        button.setAttribute('aria-pressed', String(member?.id === selectedRecord.id));
        button.addEventListener('click', () => {
          if (working || familyRunning) return;
          selectedId = member.id; renderFamilies(true); showSelection();
        });
        grid.append(button);
      }
    }
    matrix.append(grid);
  }

  function renderFamilies(revealSelected = false, focusKey) {
    const rows = groups.flatMap(group => expandedFamilies.has(group.key)
      ? [{ group }, ...group.members.map(record => ({ group, record }))] : [{ group }]);
    const pageSize = 12;
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
          if (working || familyRunning) return;
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
    selectTab(true);
    run(async () => {
      const removed = await cleanHungCopies() + await cleanDuplicates();
      await refresh();
      if (removed) status.textContent = 'Đã xóa ' + removed + ' bản trùng font. Mỗi file chỉ giữ một bản.';
      else if (!records.length) status.textContent = 'Bạn chưa lưu font nào.';
    });
  });

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
    let result;
    if (editingRecord && record.name === editingRecord.name.slice(0, 40)) {
      const updated = { ...editingRecord, ...record, digest: await fontDigest(record.blob) };
      await accessFonts('readwrite', store => store.put(updated));
      editingRecord = updated;
      result = { id: updated.id, duplicate: false };
    } else result = await addFont(record);
    const { id, duplicate } = result;
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
      if (await vietnamize(record)) { editingRecord = undefined; selectTab(false); }
    });
  });


  $('collection-edit').addEventListener('click', () => {
    const record = records.find(item => item.id === selectedId);
    if (!record) return;
    run(async () => {
      if (await vietnamize(record, { editOnly: true })) {
        editingRecord = record;
        selectedId = record.id;
        selectTab(false);
      }
    });
  });

  const familyDialog = $('family-dialog');
  let familyRecord;
  let familyRunning = false;
  const familyAssets = [];
  const picker = $('family-style-picker');
  for (const weight of familyWeights) {
    const row = document.createElement('div'); row.className = 'family-picker-row';
    const title = document.createElement('strong'); title.textContent = weight.name + ' · ' + weight.weight; row.append(title);
    for (const italic of [false, true]) {
      const style = weight.name + (italic ? ' Italic' : '');
      const label = document.createElement('label'); label.className = 'check';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = true; check.value = style; check.name = 'family-style';
      label.append(check, document.createTextNode(style)); row.append(label);
    }
    picker.append(row);
  }
  function updateFamilyCount() {
    $('family-selection-count').textContent = picker.querySelectorAll('input:checked').length + ' / 16 kiểu';
  }
  picker.addEventListener('change', updateFamilyCount);
  for (const [id, condition] of [['family-select-all', () => true],['family-select-none', () => false],['family-select-upright', input => !input.value.endsWith(' Italic')]]) $(id).addEventListener('click', () => {
    if (familyRunning) return;
    picker.querySelectorAll('input').forEach(input => { input.checked = condition(input); }); updateFamilyCount();
  });
  $('collection-family-open').addEventListener('click', () => {
    if (working || familyRunning) return;
    familyRecord = records.find(record => record.id === selectedId);
    if (!familyRecord) return;
    const group = groups.find(group => group.members.some(record => record.id === familyRecord.id));
    familyRecord = { ...familyRecord, family: group?.family || familyRecord.name };
    $('family-status').textContent = '';
    $('family-source').textContent = 'Font gốc: ' + familyRecord.name + '. Chọn đúng độ đậm gốc trước khi tạo.';
    const anchor = familyStyles.find(style => style.style === identifyFamilyStyle(familyRecord));
    $('family-base-weight').value = String(anchor?.weight || 400);
    familyDialog.hidden = false;
    $('family-title').focus();
    familyDialog.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('family-close').addEventListener('click', () => {
    if (familyRunning) return;
    familyDialog.hidden = true;
    for (const asset of familyAssets) { URL.revokeObjectURL(asset.url); document.fonts.delete(asset.face); }
    familyAssets.length = 0;
    $('family-results').replaceChildren();
  });
  $('family-create').addEventListener('click', async () => {
    if (familyRunning || !familyRecord) return;
    if (familyRecord.italic || identifyFamilyStyle(familyRecord).endsWith(' Italic')) { $('family-status').textContent = 'Chọn một kiểu đứng làm font gốc để tránh nghiêng chữ hai lần.'; return; }
    const styles = [...picker.querySelectorAll('input:checked')].map(input => input.value);
    if (!styles.length) { $('family-status').textContent = 'Chọn ít nhất một kiểu chữ.'; return; }
    familyRunning = true;
    $('family-create').disabled = $('family-close').disabled = true;
    for (const input of familyDialog.querySelectorAll('input,select')) input.disabled = true;
    for (const asset of familyAssets) { URL.revokeObjectURL(asset.url); document.fonts.delete(asset.face); }
    familyAssets.length = 0;
    $('family-results').replaceChildren();
    $('family-status').textContent = 'Đang tạo family…';
    let savedCount = 0;
    const failures = [];
    const anchor = familyWeights.find(item => item.weight === Number($('family-base-weight').value));
    const sourceId = familyRecord.id;
    try {
      // Record the source slot without altering the original file.
      await accessFonts('readwrite', store => store.put({ ...familyRecord, style: anchor.name, weight: anchor.weight, italic: false }));
      for (const member of records) {
        if (member.id !== sourceId && groups.find(group => group.family === familyRecord.family)?.members.some(item => item.id === member.id)) {
          await accessFonts('readwrite', store => store.put({ ...member, family: familyRecord.family, style: identifyFamilyStyle(member) }));
        }
      }
      await createFontFamily(familyRecord, styles, $('family-text').value, async result => {
        const face = new FontFace('family-proof-' + crypto.randomUUID(), await result.blob.arrayBuffer());
        let previewLoaded = false;
        try { await face.load(); document.fonts.add(face); previewLoaded = true; }
        catch { /* Preview failure must not discard a validated exported font. */ }
        const url = URL.createObjectURL(result.blob);
        familyAssets.push({ face, url });
        const row = document.createElement('section');
        row.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--line)';
        const label = document.createElement('strong');
        label.textContent = result.style + (result.draft ? result.italic ? ' · Bản nháp nghiêng' : ' · Bản nháp' : ' · Font gốc');
        const proof = document.createElement('p');
        proof.style.cssText = 'font-size:32px;line-height:1.6;font-weight:400;font-style:normal;font-synthesis:none;letter-spacing:0;margin:8px 0;overflow-wrap:anywhere;white-space:pre-wrap';
        if (previewLoaded) proof.style.fontFamily = face.family;
        else proof.title = 'Trình duyệt chưa xem thử được kiểu này. Bạn vẫn có thể tải font để kiểm tra.';
        proof.textContent = result.text;
        const link = document.createElement('a');
        link.className = 'download'; link.href = url; link.download = result.filename; link.textContent = 'Tải ' + result.style;
        // Regular already exists as the selected source. Save only new styles.
        if (!result.isSource) {
          const { text, ...saved } = result;
          await addFont({ ...saved, generatedFrom: familyRecord.generatedFrom ?? familyRecord.id });
        }
        const savedLabel = document.createElement('span');
        savedCount++;
        savedLabel.textContent = result.isSource ? 'Font gốc trong bộ sưu tập' : 'Đã tự lưu vào ' + result.family;
        const editButton = document.createElement('button');
        editButton.disabled = true;
        editButton.dataset.familyEdit = '';
        editButton.type = 'button'; editButton.textContent = 'Chỉnh sửa ' + result.style;
        editButton.addEventListener('click', () => run(async () => {
          const target = result.isSource ? records.find(item => item.id === sourceId)
            : records.find(item => item.family === result.family && identifyFamilyStyle(item) === result.style);
          if (target && await vietnamize(target, { editOnly: true })) { editingRecord = target; selectedId = target.id; selectTab(false); }
        }));
        const actions = document.createElement('div'); actions.className = 'tool-row'; actions.append(link,editButton,savedLabel);
        row.append(label,proof,actions); $('family-results').append(row);
        $('family-status').textContent = 'Đã hoàn tất ' + savedCount + ' / ' + styles.length + ': ' + result.style + '.';
      }, { baseWeight: anchor.weight, angle: Number($('family-italic-angle').value), onError: (style, error) => { failures.push(style + ': ' + error.message); } });
      await refresh(familyRecord.id);
      $('family-status').textContent = 'Hoàn tất ' + savedCount + ' / ' + styles.length + ' kiểu trong family ' + familyRecord.family + '.' + (failures.length ? '\nChưa tạo được: ' + failures.join('\n') : ' Các kiểu mới đã tự lưu; hãy duyệt dấu và lòng chữ.');
    } catch (error) {
      await refresh(familyRecord.id);
      $('family-status').textContent = 'Tạo family chưa hoàn tất: ' + error.message + '. Các kiểu đã lưu vẫn có trong bộ sưu tập.';
    }
    finally { familyRunning = false; $('family-create').disabled = $('family-close').disabled = false;
      for (const input of familyDialog.querySelectorAll('input,select')) input.disabled = false;
      familyDialog.querySelectorAll('[data-family-edit]').forEach(button => { button.disabled = false; });
    }
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
