
    window.ToolsHelpers = {
        _track: (window.CMToolCtx || {}).track || null,
        signedIn: !!(window.CMToolCtx || {}).signed_in,
        _toolName: "Ki\u1ec3m tra font ti\u1ebfng Vi\u1ec7t",
        _lib: null,
        // Ve thu vien (2 gio) de trinh duyet goi thang Cloudflare Worker; dung lai cho toi khi gan het han
        async libraryToken() {
            if (this._lib && this._lib.until > Date.now()) return this._lib;
            const res = await fetch('/tools/library/token', { method: 'POST', headers: { 'X-CSRF-TOKEN': ((document.querySelector('meta[name="csrf-token"]') || {}).content || ''), Accept: 'application/json' } });
            if (!res.ok) throw new Error('token');
            const data = await res.json();
            this._lib = { url: data.url.replace(/\/$/, ''), token: data.token, until: Date.now() + (data.expires_in - 120) * 1000 };
            return this._lib;
        },
        // Luu ket qua vao lich su cua nguoi dung (Cloudflare R2), chi khi da dang nhap; loi thi bo qua
        async save(tool, blob, name) {
            if (!this.signedIn || !blob) return null;
            try {
                // Video: kiem duyet 18+ tren 3 khung truoc khi luu (anh duoc Worker kiem khi nhan). Khong qua -> khong luu.
                if (/^video\//.test(blob.type || '')) {
                    const frames = await this.videoFrames(blob, 3).catch(() => []);
                    if (!frames.length || !(await this.guard(frames, 'output', { tool, silent: true })).ok) return null;
                }
                const { url, token } = await this.libraryToken();
                const res = await fetch(`${url}/items?tool=${encodeURIComponent(tool)}&name=${encodeURIComponent(name || 'file')}`, {
                    method: 'POST', body: blob, headers: { Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'image/png' },
                });
                if (res.ok && window.ToolsLibrary) ToolsLibrary.refresh();
                return res.ok ? (await res.json()).id : null;
            } catch (e) { return null; }
        },
        // Lay n khung hinh rai deu tu 1 video (Blob / File) de kiem duyet: tra ve mang canvas (toi da 5)
        videoFrames(blob, n = 3) {
            return new Promise((resolve, reject) => {
                const v = document.createElement('video'), url = URL.createObjectURL(blob), out = [];
                v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
                const done = (err) => { URL.revokeObjectURL(url); err ? reject(err) : resolve(out); };
                const timer = setTimeout(() => done(out.length ? null : new Error('video-timeout')), 15000);
                v.onerror = () => { clearTimeout(timer); done(new Error('video-read')); };
                v.onloadedmetadata = () => {
                    const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
                    const times = Array.from({ length: Math.min(5, Math.max(1, n)) }, (_, i) => d * (i + 1) / (Math.min(5, Math.max(1, n)) + 1));
                    let i = 0;
                    v.onseeked = () => {
                        const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight, 1));
                        const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k) || 1; c.height = Math.round(v.videoHeight * k) || 1;
                        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.push(c);
                        if (++i < times.length) v.currentTime = times[i]; else { clearTimeout(timer); done(); }
                    };
                    v.currentTime = times[0];
                };
            });
        },
        // Kiem duyet 18+ (POST /tools/guard-check -> Worker colorme-guard). input: File / Blob / canvas / ImageBitmap,
        // hoac mang toi da 5 khung video (lay 3-5 khung rai deu). stage: 'input' (truoc khi xu ly) | 'output' (ket qua AI).
        // Tra ve { ok, message }; bi chan thi tu hien toast. Loi mang / he thong: ok = false (fail closed).
        async guard(input, stage = 'input', opts = {}) {
            const MAX_SIDE = 1280;
            const toBlob = async (src) => {
                let canvas = null;
                if (src instanceof Blob) {
                    if (src.size <= 1.5 * 1024 * 1024 && /^image\/(jpeg|png|webp|gif)$/.test(src.type)) return src;
                    try { src = await createImageBitmap(src); } catch (e) { return src; }
                }
                const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
                if (!w || !h) throw new Error('guard-input');
                const k = Math.min(1, MAX_SIDE / Math.max(w, h));
                canvas = document.createElement('canvas');
                canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
                canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
                return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('guard-blob'))), 'image/jpeg', 0.85));
            };
            const fail = (message) => {
                if (!opts.silent && window.customToastr) customToastr('error', message, 'This content is not allowed.');
                return { ok: false, message };
            };
            try {
                const items = Array.isArray(input) ? input.slice(0, 5) : [input];
                const form = new FormData();
                const blobs = await Promise.all(items.map(toBlob));
                if (Array.isArray(input)) blobs.forEach((b, i) => form.append('frames[]', b, `frame-${i}.jpg`));
                else form.append('image', blobs[0], 'image.jpg');
                form.append('stage', stage === 'output' ? 'output' : 'input');
                const slug = opts.tool || (location.pathname.match(/^\/tools\/([a-z0-9-]+)/) || [])[1];
                if (slug) form.append('tool', slug);
                const res = await fetch('/tools/guard-check', { method: 'POST', body: form, headers: { 'X-CSRF-TOKEN': ((document.querySelector('meta[name="csrf-token"]') || {}).content || ''), Accept: 'application/json' } });
                if (res.status === 429) return fail('Bạn thao tác quá nhanh, thử lại sau ít phút nhé.');
                const data = await res.json().catch(() => null);
                if (!data || data.action !== 'allow') return fail((data && data.message) || 'Hệ thống kiểm duyệt đang bận, bạn thử lại sau nhé.');
                return { ok: true, message: '' };
            } catch (e) {
                return fail('Hệ thống kiểm duyệt đang bận, bạn thử lại sau nhé.');
            }
        },
        // Gan keo-tha, chon file va dan (Ctrl/Cmd + V) anh vao 1 vung; onFile(file) duoc goi voi file anh
        bindImageDrop(drop, input, onFile) {
            input.addEventListener('change', () => input.files[0] && onFile(input.files[0]));
            ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (e) => {
                e.preventDefault();
                drop.classList.add('is-dragover');
            }));
            ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, (e) => {
                e.preventDefault();
                drop.classList.remove('is-dragover');
            }));
            drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]));
            document.addEventListener('paste', (e) => {
                const target = e.target;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
                const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
                if (item) onFile(item.getAsFile());
            });
            // Anh Labs chuyen sang (chi co tren cung host voi Labs): nhan nhu khi tha anh, sau khi cong cu khoi tao xong
            setTimeout(() => this.takeHandoff(onFile), 0);
        },
        // Anh Labs chuyen sang (sessionStorage 'labsImg', data URL, cung host): doc 1 lan, xoa ngay, goi cb(file) nhu khi nguoi dung tha anh.
        // Chi nhan JPG/PNG/WebP base64, toi da 8 MB sau giai ma; khong gui anh di dau, khong ghi log.
        takeHandoff(cb) {
            let url = null;
            try { url = sessionStorage.getItem('labsImg'); sessionStorage.removeItem('labsImg'); } catch (e) { return false; }
            const m = typeof url === 'string' && url.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
            if (!m || m[2].length * 0.75 > 8 * 1024 * 1024) return false;
            try {
                const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
                cb(new File([bytes], 'labs.' + ext, { type: 'image/' + m[1] }));
                return true;
            } catch (e) { return false; }
        },
        loadImage(file) {
            return new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Không đọc được ảnh này.'));
                img.src = url;
            });
        },
        formatBytes(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1024 / 1024).toFixed(2) + ' MB';
        },
        async copy(text, label) {
            try {
                await navigator.clipboard.writeText(text);
            } catch (e) {
                const area = document.createElement('textarea');
                area.value = text;
                document.body.appendChild(area);
                area.select();
                document.execCommand('copy');
                area.remove();
            }
            if (window.customToastr) customToastr('success', `Đã sao chép ${label || text}`, `Copied ${label || text}`);
        },
        // Bao ColorME moi luot dung (kem file ket qua); loi thi bo qua, khong anh huong nguoi dung
        // Bao 1 lan cho moi "key" trong phien trang (vd moi anh / moi loai am thanh), tranh gui trung lap khi nguoi dung chinh lien tuc
        _tracked: new Set(),
        trackOnce(key, tool, details, files) {
            if (this._tracked.has(tool + '|' + key)) return;
            this._tracked.add(tool + '|' + key);
            this.track(tool, details, files);
        },
        track(tool, details, files = []) {
            // Moi luot dung that: dem de hoi danh gia dung luc (xem ToolsHelpers.feedback)
            try { if (this.feedback) this.feedback.used(tool); } catch (e) {}
            // Loi moi gop y "Ban muon cong cu nay lam them gi?" (xem ToolsHelpers.fbPrompt)
            try { if (this.fbPrompt) this.fbPrompt.used(tool); } catch (e) {}
            // Su kien chung cho trang (vd loi nhac them SĐT hien sau lan dung cong cu dau tien)
            try { document.dispatchEvent(new CustomEvent('cm:tooluse', { detail: { tool } })); } catch (e) {}
            const build = () => {
                const form = new FormData();
                form.append('tool', tool);
                if (window.ToolsHelpers && ToolsHelpers._toolName) form.append('toolName', ToolsHelpers._toolName);
                form.append('details', (details || '').slice(0, 1500));
                files.slice(0, 5).forEach((f) => f && f.blob && form.append('files[]', f.blob, f.name));
                return form;
            };
            (async () => {
                // Khach: chi kem pass Turnstile da co san; do luot dung KHONG duoc bat nguoi dung xac minh (khong hien hop "Verify you are human")
                const human = window.CMHuman && window.CMHuman.peekHeaders ? window.CMHuman.peekHeaders() : {};
                const viaLaravel = () => fetch('/tools/track', {
                    method: 'POST', body: build(), keepalive: files.length === 0,
                    // Trang moi (khung New Web) khong co the csrf: khong duoc nem loi lam hong cong cu
                    headers: { 'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') || {}).content || '', 'Accept': 'application/json', ...human },
                }).catch(() => {});
                try {
                    // Gui thang Cloudflare Worker; Worker loi / khong toi duoc thi du phong qua may chu web
                    if (!this._track) return viaLaravel();
                    fetch(this._track.url + '/track', { method: 'POST', body: build(), keepalive: files.length === 0, headers: { Authorization: 'Bearer ' + this._track.token, ...human } })
                        .then((res) => { if (!res.ok) viaLaravel(); })
                        .catch(viaLaravel);
                } catch (e) { viaLaravel(); }
            })();
        },
        // Can khung anh vua voi container va toi da 62% chieu cao man hinh
        fitStage(stage, w, h) {
            const container = stage.closest('.container') || document.body;
            const cs = getComputedStyle(container);
            // clientWidth gom ca padding: tru ra de khung khong rong hon cho that (tren mobile bi hop anh)
            const maxW = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), maxH = Math.max(260, innerHeight * 0.62);
            const s = Math.min(maxW / w, maxH / h);
            stage.style.width = Math.round(w * s) + 'px';
            stage.style.height = Math.round(h * s) + 'px';
        },
        // Thanh so sanh truoc/sau: keo tren khung de doi vi tri
        bindCompare(stage, after, divider) {
            let dragging = false;
            const set = (x) => {
                const r = stage.getBoundingClientRect();
                const pct = Math.max(0, Math.min(100, (x - r.left) / r.width * 100));
                after.style.clipPath = `inset(0 0 0 ${pct}%)`;
                divider.style.left = pct + '%';
            };
            stage.addEventListener('pointerdown', (e) => { dragging = true; stage.setPointerCapture(e.pointerId); set(e.clientX); });
            stage.addEventListener('pointermove', (e) => dragging && set(e.clientX));
            ['pointerup', 'pointercancel'].forEach((t) => stage.addEventListener(t, () => { dragging = false; }));
            return () => { after.style.clipPath = 'inset(0 0 0 50%)'; divider.style.left = '50%'; };
        },
        // tool: luu them 1 ban vao lich su (khi da dang nhap)
        download(blob, fileName, tool) {
            if (tool) this.save(tool, blob, fileName);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 10000);
            this.done(tool || "vietnamese-font-check", blob);
        },
        // Khung trang moi (new.colorme.vn): bao "co ket qua" de goi y buoc tiep theo; anh ket qua thu nho toi da 1600 px, chi o trong trinh duyet
        async done(slug, blob) {
            // Chi o trang moi (chu: "only on the new site"): colorme.vn khong ve lai anh ket qua sau moi lan tai ve
            if (location.hostname !== 'new.colorme.vn') return;
            let image = null;
            try {
                if (blob && /^image\/(png|jpeg|webp)$/.test(blob.type)) {
                    const bmp = await createImageBitmap(blob), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
                    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
                    image = c.toDataURL(blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.88);
                }
            } catch (e) { image = null; }
            try { document.dispatchEvent(new CustomEvent('cm:tool-done', { detail: { slug, image } })); } catch (e) {}
        },
    };
    // Khung trang moi: [data-tool-body] co class has-input khi o tha anh [data-slot="empty"] da an (cong cu tu an/hien o nay nhu hien nay)
    (function () {
        const sync = () => document.querySelectorAll('[data-tool-body]').forEach((root) => {
            const empty = root.querySelector('[data-slot="empty"]');
            root.classList.toggle('has-input', !empty || !!empty.closest('[hidden]'));
        });
        const start = () => { sync(); document.querySelectorAll('[data-tool-body]').forEach((root) => new MutationObserver(sync).observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden'] })); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
                // Hoi danh gia cong cu (1-5 sao + gop y): the nho goc phai, khong che trang, khong lam phien
        // - chi hien sau luot dung thanh cong thu 2 cua cong cu, tre 2,5 giay, khi tab dang mo, khong go chu, khong co popup khac
        // - da danh gia: khong hoi lai; "De sau": 14 ngay; toi da 1 lan / ngay cho moi cong cu; khong hien trong 20 giay dau
        ToolsHelpers.feedback = (function () {
            const SLUG = "vietnamese-font-check", NAME = "Ki\u1ec3m tra font ti\u1ebfng Vi\u1ec7t", KEY = 'cm-feedback';
            const DAY = 86400000, pageStart = Date.now();
            const LABELS = ['Tệ', 'Chưa tốt', 'Tạm ổn', 'Tốt', 'Tuyệt vời'];
            const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
            const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
            let box = null, stars = 0, shownThisPage = false, retried = false, timer = null;
            let lastKey = 0;
            document.addEventListener('keydown', (e) => { if (!box || !box.contains(e.target)) lastKey = Date.now(); }, true);

            function eligible(d) {
                const now = Date.now();
                if ((d.rated || {})[SLUG]) return false;
                if (now - ((d.snooze || {})[SLUG] || 0) < 14 * DAY) return false;
                if (now - (d.last || 0) < DAY) return false;
                return ((d.uses || {})[SLUG] || 0) >= 2;
            }
            function blocked() {
                if (document.visibilityState !== 'visible') return true;
                // Dang go chu (phim bam trong 4 giay gan day) thi chua hien
                if (Date.now() - lastKey < 4000) return true;
                // O xac minh Cloudflare (khach) dang hien thi
                const human = document.getElementById('cm-human');
                if (human && human.offsetHeight > 0) return true;
                // Popup khac dang mo that (popup dang nhap luon co class show du dang an, nen xet display)
                return [...document.querySelectorAll('.modal.show, .lb-view:not([hidden])')].some((m) => getComputedStyle(m).display !== 'none');
            }
            function schedule(delay) {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    if (shownThisPage || !eligible(load())) return;
                    const age = Date.now() - pageStart;
                    if (age < 20000) return schedule(20000 - age + 500);
                    if (blocked()) { if (!retried) { retried = true; schedule(20000); } return; }
                    open(true);
                }, delay);
            }
            function used(tool) {
                if (tool !== SLUG) return;
                const d = load();
                d.uses = d.uses || {};
                d.uses[SLUG] = (d.uses[SLUG] || 0) + 1;
                save(d);
                if (!shownThisPage && eligible(d)) schedule(2500);
            }

            function build() {
                if (box) return box;
                box = document.createElement('div');
                box.className = 'cm-fbk group/fb fixed inset-0 z-[1000] grid place-items-center p-4 bg-[rgba(245,245,247,.6)] backdrop-blur-[10px] opacity-0 transition-opacity duration-300 [&.is-in]:opacity-100 dark:bg-black/45 motion-reduce:transition-none';
                box.setAttribute('role', 'dialog');
                box.setAttribute('aria-labelledby', 'cm-fb-title');
                box.hidden = true;
                box.innerHTML = `<div class="relative w-[min(420px,100%)] rounded-[28px] bg-white px-7 pt-8 pb-6 text-center shadow-[0_0_0_1px_rgba(16,24,40,.05),0_2px_6px_rgba(16,24,40,.05),0_40px_80px_-24px_rgba(16,24,40,.4)] translate-y-4 scale-[.96] transition-transform duration-[450ms] ease-[cubic-bezier(.2,.9,.25,1.15)] group-[.is-in]/fb:translate-y-0 group-[.is-in]/fb:scale-100 dark:bg-[#1c1c1e] max-sm:px-5 motion-reduce:transition-none">
                    <button type="button" class="absolute right-3.5 top-3.5 size-8 grid place-items-center rounded-full border-0 bg-transparent text-[#86868b] cursor-pointer transition hover:bg-[#f5f5f7] hover:text-ink active:scale-90 dark:hover:bg-white/10 [&_svg]:size-4" data-fb-later aria-label="Đóng">${cmIcon('x')}</button>
                    <div class="cm-fbk-body">
                        <div class="cm-fbk-title px-3 [text-wrap:balance] text-[20px] font-semibold leading-[1.3] tracking-[-.02em] text-ink" id="cm-fb-title"></div>
                        <div class="cm-fbk-sub mt-1.5 text-[14px] leading-[1.5] text-[#6e6e73] [text-wrap:balance]">Đánh giá giúp ColorME làm công cụ tốt hơn.</div>
                        <div class="cm-fbk-stars mt-5 flex justify-center gap-2" role="radiogroup" aria-label="Chọn số sao">
                            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} sao, ${LABELS[n - 1]}" class="size-12 grid place-items-center rounded-[14px] border-0 bg-[#f5f5f7] text-[#c7c7cc] cursor-pointer transition-[transform,background-color,color] duration-200 ease-[cubic-bezier(.2,.9,.25,1.4)] hover:-translate-y-0.5 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#1d1d1f] [&.is-on]:bg-[#fff4d6] [&.is-on]:text-[#ffb800] dark:bg-white/10 [&_svg]:size-[22px] [&.is-on_svg]:fill-current [&.is-pop_svg]:animate-fb-pop motion-reduce:transition-none motion-reduce:[&.is-pop_svg]:animate-none">${cmIcon('star')}</button>`).join('')}
                        </div>
                        <div class="cm-fbk-label mt-2 h-5 text-[13px] font-medium text-ink" aria-live="polite">&nbsp;</div>
                        <div class="cm-fbk-more mt-2 text-left" hidden>
                            <textarea maxlength="500" rows="3" placeholder="Góp ý thêm (không bắt buộc)" class="block w-full min-h-[84px] resize-none !rounded-2xl !border-0 !bg-[#f5f5f7] px-3.5 py-3 text-[14px] leading-[1.5] text-ink placeholder:text-[#86868b] outline-none transition-shadow focus:shadow-[0_0_0_2px_#1d1d1f] dark:bg-white/10"></textarea>
                            <div class="mt-4 grid grid-cols-2 gap-2">
                                <button type="button" class="h-11 px-4 rounded-[14px] border-0 bg-[#f5f5f7] text-[15px] font-medium text-ink cursor-pointer transition hover:bg-[#ebebef] active:scale-[.98] dark:bg-white/10 dark:hover:bg-white/15" data-fb-later>Để sau</button>
                                <button type="button" class="cm-fbk-send h-11 px-5 rounded-[14px] text-[15px] border-0 bg-[#1d1d1f] text-white font-medium cursor-pointer inline-flex items-center justify-center transition hover:bg-[#3a3a3c] active:scale-[.98] disabled:opacity-60 dark:bg-white dark:text-[#1d1d1f]">Gửi</button>
                            </div>
                        </div>
                    </div>
                    <div class="cm-fbk-done [&:not([hidden])]:flex flex-col items-center gap-2.5 py-5 text-[15px] font-medium text-ink" hidden><span class="size-12 grid place-items-center rounded-full bg-[#e8f8ee] text-[#34c759] animate-fb-pop motion-reduce:animate-none [&_svg]:size-6">${cmIcon('circle-check')}</span>Cảm ơn bạn! ColorME đã nhận góp ý.</div></div>`;
                (document.querySelector('[data-tool-body]') || document.body).appendChild(box);
                const label = box.querySelector('.cm-fbk-label');
                const paint = (n) => box.querySelectorAll('[data-star]').forEach((b) => b.classList.toggle('is-on', +b.dataset.star <= n));
                box.querySelectorAll('[data-star]').forEach((b) => {
                    b.addEventListener('mouseenter', () => { paint(+b.dataset.star); label.textContent = LABELS[b.dataset.star - 1]; });
                    b.addEventListener('mouseleave', () => { paint(stars); label.innerHTML = stars ? LABELS[stars - 1] : '&nbsp;'; });
                    b.addEventListener('click', () => {
                        stars = +b.dataset.star;
                        paint(stars);
                        box.querySelectorAll('[data-star]').forEach((x) => { x.classList.remove('is-pop'); if (+x.dataset.star <= stars) { x.querySelector('svg').style.animationDelay = (x.dataset.star - 1) * 45 + 'ms'; void x.offsetWidth; x.classList.add('is-pop'); } });
                        label.textContent = LABELS[stars - 1];
                        box.querySelectorAll('[data-star]').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.star === stars)));
                        const more = box.querySelector('.cm-fbk-more');
                        if (more.hidden) { more.hidden = false; box.querySelector('textarea').focus(); }
                    });
                });
                box.querySelectorAll('[data-fb-later]').forEach((b) => b.addEventListener('click', later));
                box.querySelector('.cm-fbk-send').addEventListener('click', send);
                box.addEventListener('keydown', (e) => { if (e.key === 'Escape') later(); });
                box.addEventListener('click', (e) => { if (e.target === box) later(); });
                return box;
            }
            // ask: mo tu loi moi "Ban muon cong cu nay lam them gi?" -> hien san o gop y, van can chon sao (Worker /rate bat buoc)
            // note: mo tu lien ket "Góp ý cho công cụ này" o cuoi moi cong cu -> chi can viet gop y, sao khong bat buoc
            let noteMode = false;
            function open(auto, ask) {
                build();
                shownThisPage = true;
                stars = 0;
                noteMode = ask === 'note';
                box.querySelector('.cm-fbk-title').textContent = noteMode ? 'Góp ý cho công cụ này' : ask ? `Bạn muốn ${NAME || 'công cụ này'} làm thêm gì?` : `Bạn thấy ${NAME || 'công cụ này'} thế nào?`;
                box.querySelector('.cm-fbk-sub').textContent = noteMode ? 'Viết điều bạn muốn sửa hoặc thêm; chấm sao nếu muốn. Chỉ đội ColorME đọc góp ý.' : ask ? 'Chấm sao và viết điều bạn cần, ColorME đọc mọi góp ý.' : 'Đánh giá giúp ColorME làm công cụ tốt hơn.';
                box.querySelector('textarea').placeholder = noteMode ? 'Ví dụ: kết quả bị lỗi khi..., mong có thêm...' : ask ? 'Ví dụ: thêm tuỳ chỉnh..., xuất thêm định dạng...' : 'Góp ý thêm (không bắt buộc)';
                box.querySelectorAll('[data-star]').forEach((b) => { b.classList.remove('is-on'); b.setAttribute('aria-checked', 'false'); });
                box.querySelector('.cm-fbk-label').innerHTML = '&nbsp;';
                box.querySelector('.cm-fbk-more').hidden = !ask;
                box.querySelector('textarea').value = '';
                box.querySelector('.cm-fbk-body').hidden = false;
                box.querySelector('.cm-fbk-done').hidden = true;
                box.querySelector('.cm-fbk-send').disabled = false;
                box.hidden = false;
                requestAnimationFrame(() => box.classList.add('is-in'));
                if (auto) { const d = load(); d.last = Date.now(); save(d); }
                // Tu mo: khong cuop focus cua nguoi dung; mo bang nut: dua focus vao sao dau tien
                if (!auto) setTimeout(() => box.querySelector(ask ? 'textarea' : '[data-star]').focus(), 50);
            }
            function close() {
                if (!box) return;
                box.classList.remove('is-in');
                setTimeout(() => { box.hidden = true; }, 250);
            }
            function later() {
                const d = load();
                d.snooze = d.snooze || {};
                d.snooze[SLUG] = Date.now();
                save(d);
                close();
            }
            async function send() {
                const typed = box.querySelector('textarea').value.trim();
                if (noteMode && !typed) { box.querySelector('.cm-fbk-label').textContent = 'Bạn viết góp ý trước khi gửi nhé'; box.querySelector('textarea').focus(); return; }
                if (!stars && !noteMode) {
                    box.querySelector('.cm-fbk-label').textContent = 'Bạn chọn số sao trước khi gửi nhé';
                    box.querySelector('[data-star]').focus();
                    return;
                }
                const btn = box.querySelector('.cm-fbk-send');
                btn.disabled = true;
                btn.innerHTML = '<span class="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin dark:border-black/20 dark:border-t-black"></span>';
                const comment = box.querySelector('textarea').value.trim().slice(0, 500);
                try {
                    const T = ToolsHelpers._track;
                    if (!T) throw new Error('track');
                    const res = await fetch(T.url + '/rate', { method: 'POST', headers: { Authorization: 'Bearer ' + T.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: SLUG, toolName: NAME, stars, comment }) });
                    // 400 / 429: may chu tu choi (noi dung khong phu hop, gui qua nhieu): hien dung loi cua may chu
                    if (res.status === 400 || res.status === 429) { const m = await res.json().catch(() => ({})); const err = new Error('refused'); err.msg = m.message || m.error; throw err; }
                    if (!res.ok) throw new Error('rate');
                } catch (e) {
                    btn.disabled = false;
                    btn.textContent = 'Gửi';
                    if (e.msg) { box.querySelector('.cm-fbk-label').textContent = e.msg; return; }
                    if (window.customToastr) customToastr('error', 'Chưa gửi được góp ý, bạn thử lại nhé.', 'Could not send your feedback.');
                    return;
                }
                const d = load();
                // Gop y khong cham sao khong tinh la da danh gia: loi moi danh gia van co the hien sau
                if (stars) { d.rated = d.rated || {}; d.rated[SLUG] = Date.now(); }
                save(d);
                box.querySelector('.cm-fbk-body').hidden = true;
                box.querySelector('.cm-fbk-done').hidden = false;
                btn.textContent = 'Gửi';
                setTimeout(close, 1800);
            }
            return {
                used, open: () => open(false), ask: () => open(false, true), note: () => open(false, 'note'),
                isOpen: () => !!box && !box.hidden,
                // Loi moi gop y dang duoc hien o trang nay: khong tu mo the danh gia nua (tranh 2 loi moi chong nhau)
                hold() { shownThisPage = true; clearTimeout(timer); },
                // Loi moi da hien: tinh nhu 1 lan hoi (toi da 1 lan / ngay); bam x: "De sau" 14 ngay cho cong cu nay
                prompted(dismissed) {
                    const d = load();
                    d.last = Date.now();
                    if (dismissed) { d.snooze = d.snooze || {}; d.snooze[SLUG] = Date.now(); }
                    save(d);
                },
            };
        })();

        // Loi moi gop y sau ket qua: the nho "Ban muon cong cu nay lam them gi?" + nut Gop y (mo the danh gia o tren).
        // Giao dien o public/js/tool-feedback-prompt.js, chi nap khi du dieu kien. Tan suat (localStorage cm-fbp):
        // - tu lan dung thanh cong thu 2 (tinh moi cong cu; lan dau tien cua lan ghe dau tien thi khong hoi)
        // - toi da 1 lan / cong cu / 14 ngay va 1 lan / phien; chi sau khi nguoi dung da thao tac tren trang
        // - doi nguoi dung ngung thao tac (trinh soan thao toan khung: lau hon), khong co popup / loi nhac SĐT dang mo
        ToolsHelpers.fbPrompt = (function () {
            const SLUG = "vietnamese-font-check", NAME = "Ki\u1ec3m tra font ti\u1ebfng Vi\u1ec7t", KEY = 'cm-fbp', DAY = 86400000;
            const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
            const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
            const session = () => { try { return !!sessionStorage.getItem(KEY); } catch (e) { return true; } };
            let lastInput = 0, acted = false, pending = false;
            ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastInput = Date.now(); acted = true; }, { capture: true, passive: true }));
            function used(tool) {
                if (tool !== SLUG) return;
                const d = load(), now = Date.now();
                // 1 ket qua co the goi track nhieu lan (ket qua + tai ve): cach nhau < 5 giay tinh la 1
                if (now - (d.at || 0) > 5000) { d.n = (d.n || 0) + 1; d.at = now; save(d); }
                if (pending || !acted || session() || (d.n || 0) < 2) return;
                if (now - ((d.t || {})[SLUG] || 0) < 14 * DAY) return;
                const fb = ToolsHelpers.feedback;
                if (fb && fb.isOpen()) return;
                pending = true;
                if (fb) fb.hold();
                const run = () => window.CMFeedbackPrompt && CMFeedbackPrompt.run({
                    slug: SLUG, name: NAME, signedIn: ToolsHelpers.signedIn,
                    lastInput: () => lastInput,
                    shown() {
                        const x = load(); x.t = x.t || {}; x.t[SLUG] = Date.now(); save(x);
                        try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
                        if (fb) fb.prompted(false);
                    },
                    dismissed() { if (fb) fb.prompted(true); },
                    ask() { if (fb) fb.ask(); },
                    // Khong tim duoc luc ranh (nguoi dung lam lien tuc): cho lan ket qua sau thu lai
                    gaveUp() { pending = false; },
                });
                if (window.CMFeedbackPrompt) return run();
                const s = document.createElement('script');
                s.src = '/js/tool-feedback-prompt.js?v=2';
                s.async = true;
                s.onload = run;
                s.onerror = () => { pending = false; };
                document.head.appendChild(s);
            }
            return { used };
        })();
    
    // Chuan 18/10 (owner: "remove this part now ... a clean subtle one for all"): bo duong dan, dong tieu de cua khung trang
    // thanh mot dong chu xam nho phia tren tieu de (so nguoi dung · Luu · Chia se). CSS cong cu khong cham duoc khung trang
    // (.cmt) nen dat style truc tiep; cac nut giu nguyen su kien cua khung trang.
    (function quietToolHeader() {
        const ICON = { save: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>' };
        const svg = (d) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none">${d}</svg>`;
        const run = () => {
            const head = document.querySelector('.ctx-tool-h');
            if (!head || head.dataset.quiet) return;
            head.dataset.quiet = '1';
            const crumb = document.querySelector('nav[aria-label="Đường dẫn"]');
            if (crumb) crumb.style.display = 'none';
            const meta = head.querySelector('.m'), h1 = head.querySelector('h1'), toolTitle = document.querySelector('[data-std-title]');
            const hero = !!toolTitle || !!(h1 && h1.classList.contains('sr-only')); // cong cu tu ve tieu de = trang hero
            if (meta) {
                Object.assign(meta.style, { display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', fontSize: '13px', color: '#86868b', opacity: '1' });
                meta.querySelectorAll('.num').forEach((n) => { Object.assign(n.style, { fontSize: '13px', padding: '0 4px', color: 'inherit' }); n.insertAdjacentHTML('afterend', '<i aria-hidden="true" style="width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.6;margin:0 4px"></i>'); });
                meta.querySelectorAll('button, a').forEach((b) => {
                    const key = b.hasAttribute('data-share') ? 'share' : (b.hasAttribute('data-save') ? 'save' : null);
                    if (key && !b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', svg(ICON[key]));
                    Object.assign(b.style, { display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', minHeight: '0', padding: '0 6px', borderRadius: '8px', background: 'none', boxShadow: 'none', fontSize: '13px', fontWeight: '400', color: 'inherit', transition: 'color .15s, background-color .15s' });
                    b.addEventListener('mouseenter', () => { b.style.color = 'var(--ink, #1d1d1f)'; b.style.background = 'rgba(127,127,127,.1)'; });
                    b.addEventListener('mouseleave', () => { b.style.color = 'inherit'; b.style.background = 'none'; });
                });
            }
            if (hero && toolTitle) {
                // Cong cu tu ve tieu de: dong nho nam ngay tren tieu de, o giua; bo han dong tieu de cua khung trang (h1 van con cho SEO)
                if (meta) { meta.style.marginBottom = '14px'; toolTitle.parentNode.insertBefore(meta, toolTitle); }
                if (h1) { h1.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'; document.body.appendChild(h1); }
                head.style.display = 'none';
                return;
            }
            Object.assign(head.style, { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px', paddingTop: '36px', paddingBottom: '20px' });
            const title = head.querySelector('.t'); if (title) title.style.flex = 'none';
            if (meta) { meta.style.justifyContent = 'flex-start'; meta.style.marginLeft = '-6px'; head.insertBefore(meta, head.firstChild); }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
    })();
