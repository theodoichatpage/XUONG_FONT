
            (function () {
                const $ = (id) => document.getElementById(id);
                const SLUG = 'vietnamese-font-check';
                // Toan bo nguyen am co dau + Đ/đ (chu thuong va chu hoa)
                const BASE = 'aăâeêioôơuưy';
                const TONES = ['', '̀', '́', '̉', '̃', '̣'];
                const lower = [...BASE].flatMap((v) => TONES.map((t) => (v + t).normalize('NFC'))).concat('đ');
                const CHARS = lower.concat(lower.map((c) => c.toLocaleUpperCase('vi')));
                const POPULAR = ['Be Vietnam Pro', 'Montserrat', 'Inter', 'Playfair Display', 'Roboto', 'Lora', 'Oswald', 'Bebas Neue', 'Pacifico', 'Poppins'];
                let fonts = null, pre = null, uploadedCount = 0, current = null;

                async function loadList() {
                    if (fonts) return fonts;
                    try {
                        const res = await fetch('/js/vendor/google-fonts-list-2026.10/fonts.json');
                        fonts = (await res.json()).fonts;
                    } catch (e) { fonts = []; }
                    return fonts;
                }

                // Chu dung san (precomposed) ma font Google khong co, dung truoc bang work/vfcheck/build.py: { m: { family: bitmask base64 theo thu tu CHARS } }
                async function noPreGoogle(family) {
                    try {
                        if (!pre) pre = (await (await fetch('/js/vendor/google-fonts-list-2026.10/precomposed.json')).json()).m;
                    } catch (e) { return null; }
                    const b = pre[family] ? atob(pre[family]) : '';
                    return new Set(CHARS.filter((ch, i) => (b.charCodeAt(i >> 3) || 0) & (1 << (i & 7))));
                }

                // ---- Doc bang ma ky tu (cmap) cua file font: TTF/OTF/TTC, WOFF (zlib), WOFF2 (wasm, tai khi can) ----
                const WANT = CHARS.map((ch) => ch.codePointAt(0));
                const tag4 = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
                function readCmap(dv, o) {
                    const has = new Set(), cnt = dv.getUint16(o + 2);
                    for (let i = 0; i < cnt; i++) {
                        const s = o + dv.getUint32(o + 8 + 8 * i), fmt = dv.getUint16(s);
                        if (fmt === 4) {
                            const seg = dv.getUint16(s + 6) / 2, e = s + 14, st = e + 2 * seg + 2, dl = st + 2 * seg, ro = dl + 2 * seg;
                            for (let k = 0; k < seg; k++) {
                                const a = dv.getUint16(st + 2 * k), z = dv.getUint16(e + 2 * k), d = dv.getInt16(dl + 2 * k), r = dv.getUint16(ro + 2 * k);
                                for (const c of WANT) {
                                    if (c < a || c > z) continue;
                                    let g = r ? dv.getUint16(ro + 2 * k + r + 2 * (c - a)) : c;
                                    if (g) g = (g + d) & 0xffff;
                                    if (g) has.add(c);
                                }
                            }
                        } else if (fmt === 12) {
                            for (let k = 0, n = dv.getUint32(s + 12); k < n; k++) {
                                const a = dv.getUint32(s + 16 + 12 * k), z = dv.getUint32(s + 20 + 12 * k);
                                for (const c of WANT) if (c >= a && c <= z) has.add(c);
                            }
                        }
                    }
                    return has;
                }
                function sfntCmap(u8) {
                    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
                    const base = tag4(u8, 0) === 'ttcf' ? dv.getUint32(12) : 0; // bo font .ttc: doc font dau tien
                    for (let i = 0, n = dv.getUint16(base + 4); i < n; i++) if (tag4(u8, base + 12 + 16 * i) === 'cmap') return readCmap(dv, dv.getUint32(base + 20 + 16 * i));
                    return null;
                }
                async function woffCmap(u8) {
                    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
                    for (let i = 0, n = dv.getUint16(12); i < n; i++) {
                        const e = 44 + 20 * i;
                        if (tag4(u8, e) !== 'cmap') continue;
                        const off = dv.getUint32(e + 4), len = dv.getUint32(e + 8), orig = dv.getUint32(e + 12);
                        let t = u8.subarray(off, off + len);
                        if (len < orig) t = new Uint8Array(await new Response(new Blob([t]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
                        return readCmap(new DataView(t.buffer, t.byteOffset, t.byteLength), 0);
                    }
                    return null;
                }
                function woff2ToSfnt(u8) {
                    const src = `self.Module = { onRuntimeInitialized() { postMessage({ ready: true }); } };
                        importScripts(${JSON.stringify(location.origin + '/js/vendor/wawoff2-2.0.1/decompress_binding.js')});
                        onmessage = (e) => { try { const out = new Uint8Array(self.Module.decompress(new Uint8Array(e.data))); postMessage(out.buffer, [out.buffer]); } catch (err) { postMessage(null); } };`;
                    return new Promise((resolve) => {
                        const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
                        const done = (v) => { w.terminate(); resolve(v); };
                        w.onerror = () => done(null);
                        w.onmessage = (e) => { if (e.data && e.data.ready) w.postMessage(u8.slice().buffer); else done(e.data ? new Uint8Array(e.data) : null); };
                    });
                }
                // Tra ve Set cac chu dung san ma file KHONG co (null = khong doc duoc, bo qua trang thai "tu ghep")
                async function noPreFile(buf) {
                    try {
                        let u8 = new Uint8Array(buf);
                        const t = tag4(u8, 0);
                        if (t === 'wOF2') u8 = await woff2ToSfnt(u8);
                        const has = !u8 ? null : t === 'wOFF' ? await woffCmap(u8) : sfntCmap(u8);
                        return has && new Set(CHARS.filter((ch) => !has.has(ch.codePointAt(0))));
                    } catch (e) { return null; }
                }

                // Ky tu co trong font khi 2 lan ve voi 2 font du phong khac nhau cho ra cung 1 hinh
                const CV = [document.createElement('canvas'), document.createElement('canvas')];
                CV.forEach((c) => { c.width = 72; c.height = 72; });
                function hasGlyph(ch, family) {
                    const data = CV.map((c, i) => {
                        const g = c.getContext('2d', { willReadFrequently: true });
                        g.clearRect(0, 0, 72, 72);
                        g.font = `48px "${family}", ${i ? 'serif' : 'monospace'}`;
                        g.textBaseline = 'middle'; g.fillStyle = '#000';
                        g.fillText(ch, 12, 36);
                        return g.getImageData(0, 0, 72, 72).data;
                    });
                    for (let i = 3; i < data[0].length; i += 4) if (data[0][i] !== data[1][i]) return false;
                    return true;
                }

                async function check(family, label, sub, quiet, noPre) {
                    current = { family, label };
                    $('vf-status').hidden = false; $('vf-status').innerHTML = '<span class="cm-spin"></span>Đang kiểm tra font...';
                    try {
                        await document.fonts.load(`48px "${family}"`, 'Aa' + CHARS.join(''));
                        await document.fonts.ready;
                    } catch (e) {}
                    if (!hasGlyph('a', family) && !hasGlyph('A', family)) {
                        $('vf-result').hidden = true;
                        $('vf-status').textContent = 'Không đọc được font này. Hãy thử tên khác hoặc file font khác.';
                        return;
                    }
                    const missing = CHARS.filter((ch) => !hasGlyph(ch, family));
                    // Hien duoc nhung font khong co chu dung san: trinh duyet tu ghep tu dau roi, ngoai web (Photoshop, Canva...) co the lech dau
                    const composed = noPre ? CHARS.filter((ch) => noPre.has(ch) && !missing.includes(ch)) : [];
                    const ok = CHARS.length - missing.length;
                    $('vf-status').hidden = true; $('vf-result').hidden = false;
                    $('vf-name').innerHTML = `${esc(label)}<small>${esc(sub)}</small>`;
                    const level = !missing.length ? (composed.length ? 'mid' : 'good') : missing.length <= 12 ? 'mid' : 'bad';
                    const pill = $('vf-pill');
                    pill.className = 'vf-pill inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface pl-1 pr-2.5 text-[12.5px] font-medium text-ink shadow-[0_0_0_1px_rgba(16,24,40,.06),0_6px_14px_-8px_rgba(16,24,40,.3)] animate-std-in [animation-duration:.3s] motion-reduce:!animate-none ' + level;
                    const icon = { good: ['bg-[#34c759]', '✓'], mid: ['bg-[#f5a623]', '!'], bad: ['bg-[#d93a2f]', '×'] }[level];
                    pill.innerHTML = `<i class="grid size-5 place-items-center rounded-full not-italic text-[11px] font-semibold leading-none text-white ${icon[0]}">${icon[1]}</i>` + (!missing.length ? (composed.length ? `${composed.length} chữ ghép dấu` : 'Đủ dấu tiếng Việt') : ok === 0 || missing.length > CHARS.length * .8 ? 'Không hỗ trợ tiếng Việt' : `Thiếu ${missing.length} ký tự`);
                    $('vf-sample').style.fontFamily = `"${family}", sans-serif`;
                    $('vf-count').textContent = `${ok}/${CHARS.length} ký tự tiếng Việt có dấu hiển thị đúng` + (composed.length ? `, trong đó ${composed.length} chữ do trình duyệt tự ghép từ dấu rời (có thể lệch dấu trong Photoshop, Canva)` : '');
                    const meter = $('vf-meter');
                    meter.classList.toggle('is-mid', level === 'mid'); meter.classList.toggle('is-bad', level === 'bad');
                    meter.style.width = (ok / CHARS.length * 100).toFixed(1) + '%';
                    // To soat chu: doi font, chu dau chong thieu thi to do, but do cham lai
                    const sheet = $('vf-sheet');
                    sheet.style.setProperty('--vf-f', `"${family}", sans-serif`);
                    $('vf-sheet-name').textContent = label;
                    const miss = new Set(missing), comp = new Set(composed);
                    document.querySelectorAll('[data-vf-glyph]').forEach((g) => g.classList.toggle('is-missing', miss.has(g.dataset.vfGlyph)));
                    const mark = $('vf-mark');
                    mark.classList.toggle('is-fail', missing.length > 0);
                    $('vf-mark-text').textContent = missing.length ? `Thiếu ${missing.length}` : composed.length ? `Ghép ${composed.length}` : 'Đạt';
                    [sheet, mark].forEach((el, i) => { const c = i ? 'is-draw' : 'is-settle'; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); });
                    $('vf-grid').innerHTML = CHARS.map((ch) => `<div class="vf-cell${miss.has(ch) ? ' is-missing' : comp.has(ch) ? ' is-composed' : ''} group/c relative flex aspect-square items-center justify-center rounded-[12px] bg-surface text-[24px] leading-none text-ink shadow-[inset_0_0_0_1px_rgba(16,24,40,.05)] [&.is-missing]:bg-[rgba(217,58,47,.06)] [&.is-missing]:text-[#d93a2f] [&.is-composed]:bg-[rgba(245,166,35,.1)] [&.is-composed]:text-[#b26a00] dark:[&.is-composed]:text-[#f5a623] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] max-sm:text-[20px]" style="font-family: '${family.replace(/'/g, '')}', sans-serif" title="${ch}${miss.has(ch) ? ' · thiếu' : comp.has(ch) ? ' · trình duyệt tự ghép từ dấu rời' : ''}">${ch}`
                        + `<i class="pointer-events-none absolute inset-[6px] hidden -rotate-6 rounded-[50%] border-[1.5px] border-solid border-[#d93a2f] group-[.is-missing]/c:block"></i></div>`).join('');
                    document.querySelectorAll('#vf-popular [data-name]').forEach((b) => b.classList.toggle('on', b.dataset.name === label));
                    filter();
                    // Font mac dinh tu hien khi mo trang khong phai luot dung cua nguoi xem
                    if (!quiet) ToolsHelpers.trackOnce(label, SLUG, `Kiểm tra font "${sub.startsWith('File ') ? 'font tải lên' : label}": ${ok}/${CHARS.length} ký tự tiếng Việt${missing.length ? ' · thiếu ' + missing.slice(0, 20).join(' ') : ''}${composed.length ? ' · tự ghép ' + composed.length : ''}`);
                }
                const filter = () => {
                    const only = $('vf-only').checked, cells = $('vf-grid').querySelectorAll('.vf-cell');
                    cells.forEach((c) => { c.hidden = only && !c.matches('.is-missing, .is-composed'); });
                    $('vf-none').hidden = !(only && !$('vf-grid').querySelector('.vf-cell.is-missing, .vf-cell.is-composed'));
                };
                const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

                async function checkGoogle(name, quiet) {
                    const list = await loadList();
                    const f = list.find((x) => x[0].toLowerCase() === name.trim().toLowerCase());
                    if (!f) { $('vf-status').hidden = false; $('vf-status').textContent = `Không tìm thấy "${name}" trên Google Fonts.`; $('vf-result').hidden = true; return; }
                    $('vf-q').value = f[0];
                    // Chi tai dung 1 do dam co san; trinh duyet tu tai phan tieng Viet khi can
                    const r = typeof f[3] === 'string' ? f[3].split('..').map(Number) : null; // "min..max" (variable) hoac mang do dam; mang rong = chi co nghieng
                    const weight = r ? (r[0] <= 400 && 400 <= r[1] ? 400 : r[0]) : (!f[3].length || f[3].includes(400) ? 400 : f[3][0]);
                    const axis = !r && !f[3].length ? `ital,wght@1,${weight}` : `wght@${weight}`;
                    const id = 'vf-gf-' + f[0].replace(/\W+/g, '-');
                    if (!document.getElementById(id)) {
                        const link = document.createElement('link');
                        link.id = id; link.rel = 'stylesheet';
                        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f[0]).replace(/%20/g, '+')}:${axis}&display=swap`;
                        document.head.appendChild(link);
                        await new Promise((r) => { link.onload = r; link.onerror = r; });
                    }
                    check(f[0], f[0], f[2] ? 'Google Fonts · có bộ ký tự tiếng Việt' : 'Google Fonts · không có bộ ký tự tiếng Việt', quiet, await noPreGoogle(f[0]));
                }

                async function checkFile(file) {
                    if (!file) return;
                    if (file.size > 30 * 1024 * 1024) { $('vf-status').hidden = false; $('vf-status').textContent = 'File font quá lớn (tối đa 30 MB).'; return; }
                    const family = 'VFUpload' + (++uploadedCount);
                    try {
                        const buf = await file.arrayBuffer(), face = new FontFace(family, buf);
                        await face.load();
                        document.fonts.add(face);
                        check(family, file.name.replace(/\.[^.]+$/, ''), `File ${file.name.split('.').pop().toUpperCase()} · ${ToolsHelpers.formatBytes(file.size)}`, false, await noPreFile(buf));
                    } catch (e) {
                        $('vf-status').hidden = false; $('vf-status').textContent = 'File này không phải font hợp lệ (TTF, OTF, WOFF, WOFF2).'; $('vf-result').hidden = true;
                    }
                }

                // Goi y ten font (tu dinh nghia, khong dung select)
                const rank = (name, q) => (name.toLowerCase() === q ? 0 : name.toLowerCase().startsWith(q) ? 1 : 2);
                let sel = -1;
                async function suggest() {
                    const q = $('vf-q').value.trim().toLowerCase();
                    const box = $('vf-suggest');
                    if (!q) { box.hidden = true; return; }
                    const list = await loadList();
                    const hits = list.filter((f) => f[0].toLowerCase().includes(q)).sort((a, b) => rank(a[0], q) - rank(b[0], q) || a[0].length - b[0].length).slice(0, 8); // dung ten truoc, roi ten bat dau bang chu da go
                    sel = -1;
                    box.innerHTML = hits.map((f) => `<button type="button" data-name="${esc(f[0])}"><span>${esc(f[0])}</span><small>${f[2] ? 'Có tiếng Việt' : 'Không có tiếng Việt'}</small></button>`).join('') || '<div class="px-4 py-2 text-[.875em] text-[#6c757d]">Không có font phù hợp</div>';
                    box.hidden = false;
                    clearTimeout(exactT); // go dung ten font (khong bam goi y) -> tu kiem tra khi ngung go (03/11)
                    const ex = hits.find((f) => f[0].toLowerCase() === q);
                    if (ex) exactT = setTimeout(() => { if ($('vf-q').value.trim().toLowerCase() === q && (!current || current.label !== ex[0])) { box.hidden = true; checkGoogle(ex[0]); } }, 700);
                }
                let exactT = 0;
                $('vf-q').addEventListener('input', suggest);
                $('vf-q').addEventListener('keydown', (e) => {
                    const items = [...$('vf-suggest').querySelectorAll('button')];
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((b, i) => b.classList.toggle('is-active', i === sel)); }
                    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(exactT); const v = $('vf-q').value, exact = (fonts || []).find((f) => f[0].toLowerCase() === v.trim().toLowerCase()); const name = items[sel] ? items[sel].dataset.name : exact ? exact[0] : items[0] ? items[0].dataset.name : v; $('vf-suggest').hidden = true; if (name.trim()) checkGoogle(name); }
                    if (e.key === 'Escape') $('vf-suggest').hidden = true;
                });
                $('vf-suggest').addEventListener('click', (e) => { const b = e.target.closest('[data-name]'); if (!b) return; $('vf-suggest').hidden = true; checkGoogle(b.dataset.name); });
                document.addEventListener('click', (e) => { if (!e.target.closest('.vf-search')) $('vf-suggest').hidden = true; });
                $('vf-popular').innerHTML = POPULAR.map((n) => `<button type="button" class="vf-chip h-8 cursor-pointer whitespace-nowrap rounded-[10px] border-0 bg-surface px-3 text-[13px] font-medium text-ink shadow-[inset_0_0_0_1px_rgba(16,24,40,.07)] transition duration-200 hover:-translate-y-px active:scale-95 [&.on]:bg-ink [&.on]:text-surface [&.on]:shadow-none dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)] motion-reduce:transition-none" data-name="${n}">${n}</button>`).join('');
                $('vf-popular').addEventListener('click', (e) => { const b = e.target.closest('[data-name]'); if (b) checkGoogle(b.dataset.name); });

                // Nut "Tim font Google": dua toi o tim
                $('vf-find').addEventListener('click', () => { const q = $('vf-q'); if (q.getBoundingClientRect().top < 0 || q.getBoundingClientRect().bottom > innerHeight) q.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); q.focus({ preventScroll: true }); q.select(); });
                $('vf-pick').addEventListener('click', () => $('vf-file').click());
                // Bam vao khay (ngoai to giay soat chu de go thu) thi mo hop chon file
                $('vf-drop').addEventListener('click', (e) => { if (!e.target.closest('#vf-sheet')) $('vf-file').click(); });
                $('vf-file').addEventListener('change', () => { checkFile($('vf-file').files[0]); $('vf-file').value = ''; });
                ['dragenter', 'dragover'].forEach((t) => $('vf-drop').addEventListener(t, (e) => { e.preventDefault(); $('vf-drop').classList.add('is-dragover'); }));
                $('vf-drop').addEventListener('dragleave', (e) => { e.preventDefault(); if (!$('vf-drop').contains(e.relatedTarget)) $('vf-drop').classList.remove('is-dragover'); });
                $('vf-drop').addEventListener('drop', (e) => { e.preventDefault(); $('vf-drop').classList.remove('is-dragover'); });
                $('vf-drop').addEventListener('drop', (e) => checkFile(e.dataTransfer.files[0]));
                $('vf-only').addEventListener('change', filter);
                // Doan "Tat ca / Chi chu thieu": moi nut dat dung mot gia tri
                document.querySelectorAll('[data-vf-only]').forEach((l) => l.addEventListener('click', (e) => { e.preventDefault(); const v = l.dataset.vfOnly === '1'; if ($('vf-only').checked !== v) { $('vf-only').checked = v; filter(); } }));
                // ?font=<ten font Google> (link tu trang khac): kiem tra luon font do
                const asked = (new URLSearchParams(location.search).get('font') || '').slice(0, 80).trim();
                checkGoogle(asked || 'Be Vietnam Pro', !asked);
            })();
        