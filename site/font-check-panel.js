import {assessFont,makeQualitySVG} from './font-quality.js';
const labels={present:'Có glyph',missing:'Thiếu glyph',blank:'Glyph rỗng',components:'Có thành phần ghép; chưa xác minh vị trí dấu'};
const statuses={fail:'Lỗi',warning:'Cần xem lại',pass:'Đã kiểm',manual:'Duyệt bằng mắt',info:'Thông tin'};
export function createFontCheckPanel(root,{getCurrent,onSelect,onOpen,onInspect,onMarks,onRepair,standalone=false}={}){
  let results=[],running=false,filter='all';
  const ns='http://www.w3.org/2000/svg';
  if(standalone)root.classList.add('checker-showcase');
  root.innerHTML=`<div class="check-toolbar"><h3>${standalone?'Chọn file để kiểm tra':'Tự động sửa font'}</h3><div class="tool-row">${getCurrent?'<button class="primary" type="button" data-action="current">Tự động kiểm tra và đề xuất sửa</button>':''}${standalone?'<label class="check-file-button primary">Chọn file font<input type="file" multiple accept=".ttf,.otf,.woff,.woff2" data-role="files" class="visually-hidden"></label>':''}<a href="https://colorme.vn/tools/vietnamese-font-check" target="_blank" rel="noopener noreferrer">Đối chiếu trên ColorME</a></div><div class="check-thresholds" ${standalone?"":"hidden"}><label>Khoảng hở dưới<input type="number" min="0" max="100" value="16" data-role="gap"> / 1000 em</label><label>Chênh đỉnh râu trên<input type="number" min="0" max="100" value="20" data-role="horn"> / 1000 em</label></div><p class="help">${standalone?'TTF, OTF, WOFF · chọn nhiều file hoặc kéo thả vào đây · tối đa 30 MB/file. WOFF2 chưa được bộ đọc này hỗ trợ; dùng TTF/OTF tương ứng. Không cần cài font. ':''}File được đọc trong trình duyệt. Các ngưỡng là mức rà soát tùy chọn của Xưởng, chưa phải chuẩn số được chuyên gia duyệt.</p><p data-role="status" role="status" aria-live="polite">${standalone?'Chọn file để xem bảng 146 ký tự tiếng Việt và kết quả kỹ thuật.':'Xưởng tự kiểm tra khi bạn bấm nút. Thay đổi nét và chi tiết đặc trưng chỉ thực hiện sau khi bạn duyệt.'}</p></div><div data-role="report" ${standalone?"hidden":"hidden"}><label>Font trong lần kiểm tra<select data-role="font"></select></label><p data-role="summary" class="check-summary"></p><div class="tool-row check-result-actions" ${standalone?"":"hidden"}><button type="button" data-action="open">Mở font này để chỉnh sửa</button>${onMarks?'<button type="button" data-action="marks">Chỉnh dấu</button>':''}</div><section class="coverage-section" ${standalone?"":"hidden"}><h4>Bảng 146 ký tự tiếng Việt</h4><p data-role="coverage-summary"></p><label>Lọc bảng chữ<select data-role="filter"><option value="all">Tất cả ký tự</option><option value="missing">Chỉ chữ thiếu / rỗng</option><option value="components">Chữ có thành phần ghép</option><option value="present">Chữ có glyph</option></select></label><div class="coverage-legend"><span>● Có glyph</span><span>○ Thiếu / rỗng</span><span>△ Có thành phần ghép, chưa xác minh</span></div><div data-role="coverage" class="coverage-grid"></div><p class="help">Có glyph chưa chứng minh hình chữ đúng hoặc đẹp. Chữ có thành phần ghép vẫn cần thử định vị dấu và shaping; không tự tính là đạt.</p></section><label ${standalone?"":"hidden"}>Câu xem thử<textarea data-role="sample" rows="2">Đường về quê hương — Nguyễn Hữu Đạt — ă â ê ô ơ ư đ</textarea></label><div data-role="proof" class="check-vector-sample" ${standalone?"":"hidden"}></div><p data-role="proof-note" class="help"></p><p data-role="measurement" class="help"></p><div class="tool-row" data-role="repair-actions" ${standalone?"":"hidden"}><button type="button" data-action="repair" ${onRepair?"":"disabled"}>Đề xuất sửa an toàn</button><span class="help" data-role="repair-hint">Chỉ tạo bản xem trước; không tự thay nét chữ.</span></div><div class="quality-table-wrap" ${standalone?"":"hidden"}><table class="quality-table"><thead><tr><th>Trạng thái</th><th>Chữ / cặp</th><th>Kết quả</th></tr></thead><tbody data-role="findings"></tbody></table></div><p class="help">Kết quả của file tại thời điểm kiểm tra. Sau khi sửa hoặc xuất lại cần kiểm lại. Duyệt thị giác và thử trong ứng dụng vẫn cần thiết.</p></div>`;
  if(standalone){
    root.insertAdjacentHTML('afterbegin',`<div class="checker-hero"><span class="checker-eyebrow">XƯỞNG FONT · KIỂM TRA TRỰC TUYẾN</span><h2>Kiểm tra font <em>tiếng Việt</em></h2><p>Tải font lên để xem ngay bộ 146 ký tự tiếng Việt, phát hiện chữ thiếu và kiểm tra đường nét. Font chỉ được xử lý trong trình duyệt.</p><div class="checker-hero-actions"><label class="checker-upload-button">⇧ &nbsp; Tải file font<input type="file" accept=".ttf,.otf,.woff" multiple data-role="hero-files"></label><button type="button" data-role="google-toggle">⌕ &nbsp; Tìm font Google</button></div></div><div class="checker-showcase-grid"><div class="checker-paper-zone" data-role="dropzone" tabindex="0" role="button" aria-label="Kéo thả hoặc chọn file font"><div class="checker-paper-top"><span>146 &nbsp; KÝ TỰ CÓ DẤU, HOA VÀ THƯỜNG</span><span>✓ &nbsp; Không cần cài font</span></div><div class="checker-paper"><div class="checker-paper-head"><span>BẢN SOÁT CHỮ</span><strong data-role="paper-name">FONT CỦA BẠN</strong></div><div class="checker-paper-glyphs"><div><strong>Ặ</strong><small>Ă + NẶNG</small></div><div><strong>ẫ</strong><small>Â + NGÃ</small></div><div><strong>Ỡ</strong><small>Ơ + NGÃ</small></div><div><strong>ự</strong><small>Ư + NẶNG</small></div></div><p>Đường về quê hương đẹp tựa bức tranh thủy mặc, gió thổi nhẹ qua hàng tre xanh.</p><div class="checker-paper-stamp">✓ &nbsp; Kiểm tra tiếng Việt</div></div><p class="checker-drop-hint">Thả file font vào đây · .ttf / .otf / .woff</p></div><div class="checker-showcase-right"><div class="checker-search-card"><div class="checker-card-head"><span>FONT GOOGLE</span><span>hoặc thả file vào khay</span></div><label class="checker-google-input"><span>⌕</span><input data-role="google-query" type="search" placeholder="Tìm tên font Google" autocomplete="off"></label><div class="checker-google-options" data-role="google-options"></div><p class="checker-google-note" data-role="google-note">Chọn font Google để xem thử. Để kiểm tra đủ 146 ký tự, hãy tải file font tương ứng.</p></div><div class="checker-result-card"><div class="checker-card-head"><span>KẾT QUẢ</span><span data-role="showcase-badge">Chưa chọn font</span></div><div class="checker-result-inner"><strong data-role="showcase-name">Chọn font để bắt đầu</strong><p data-role="showcase-description">Kết quả kiểm tra và tỷ lệ ký tự có glyph sẽ xuất hiện tại đây.</p><div class="checker-progress"><span data-role="showcase-progress"></span></div><p data-role="showcase-count">0 / 146 ký tự đã kiểm tra</p></div></div></div></div>`);
    const fontNames=['Be Vietnam Pro','Montserrat','Inter','Playfair Display','Roboto','Lora','Oswald','Bebas Neue','Pacifico','Poppins'];
    const options=root.querySelector('[data-role=google-options]'),query=root.querySelector('[data-role=google-query]');
    function showGoogleOptions(){
      options.replaceChildren();
      for(const name of fontNames.filter(name=>name.toLowerCase().includes(query.value.trim().toLowerCase()))){
        const button=document.createElement('button');button.type='button';button.textContent=name;
        button.addEventListener('click',()=>{
          query.value=name;
          root.querySelector('[data-role=showcase-name]').textContent=name;
          root.querySelector('[data-role=paper-name]').textContent=name.toUpperCase();
          root.querySelector('[data-role=showcase-description]').textContent='Xem trước font Google. Chưa kiểm tra được độ phủ Unicode từ tên font; tải TTF/OTF/WOFF để kiểm tra chính xác.';
          root.querySelector('[data-role=showcase-badge]').textContent='Chưa kiểm định';
          root.querySelector('[data-role=google-note]').textContent='Bạn đã chọn '+name+'. Hãy tải file font để chạy kiểm tra kỹ thuật.';
          const family=encodeURIComponent(name).replace(/%20/g,'+');
          let link=document.getElementById('checker-google-font-css');
          if(!link){link=document.createElement('link');link.id='checker-google-font-css';link.rel='stylesheet';document.head.append(link);}
          link.href='https://fonts.googleapis.com/css2?family='+family+'&display=swap';
          root.querySelector('.checker-paper').style.fontFamily='"'+name.replace(/"/g,'')+'",sans-serif';
        });
        options.append(button);
      }
    }
    query.addEventListener('input',showGoogleOptions);showGoogleOptions();
    root.querySelector('[data-role=google-toggle]').addEventListener('click',()=>{query.focus();query.scrollIntoView({block:'center',behavior:'smooth'});});
    root.querySelector('[data-role=hero-files]').addEventListener('change',event=>{
      const upload=root.querySelector('[data-role=files]');
      if(event.target.files.length){const dt=new DataTransfer();for(const file of event.target.files)dt.items.add(file);upload.files=dt.files;upload.dispatchEvent(new Event('change',{bubbles:true}));}
      event.target.value='';
    });
    const zone=root.querySelector('[data-role=dropzone]');
    zone.addEventListener('click',()=>root.querySelector('[data-role=hero-files]').click());
    zone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();root.querySelector('[data-role=hero-files]').click();}});
  }
  const $=role=>root.querySelector('[data-role="'+role+'"]');
  const selected=()=>results[Number($('font').value)];
  const currentButton=root.querySelector('[data-action=current]');
  async function run(records){
    if(running)return;
    const minGap=Number($('gap').value),hornTolerance=Number($('horn').value);
    if(![minGap,hornTolerance].every(n=>Number.isFinite(n)&&n>=0&&n<=100)){$('status').textContent='Ngưỡng phải từ 0 đến 100.';return;}
    running=true;results=[];$('report').hidden=true;
    root.setAttribute('aria-busy','true');if(currentButton)currentButton.disabled=true;
    const upload=$('files');if(upload)upload.disabled=true;
    const errors=[];
    try{
      for(const [i,record]of records.entries()){
        $('status').textContent=`Đang kiểm ${i+1} / ${records.length}: ${record.name}…`;
        try{
          if(record.blob.size>30*1024*1024)throw Error('File vượt 30 MB.');
          if(/\.woff2$/i.test(record.filename||''))throw Error('WOFF2 chưa được bộ đọc hỗ trợ; dùng file TTF/OTF tương ứng.');
          results.push(await assessFont(record,{minGap,hornTolerance}));
        }catch(error){errors.push(record.name+': '+error.message);}
      }
      $('font').replaceChildren();results.forEach((r,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${r.record.name} · ${r.coverage.counts.present}/146 glyph`; $('font').append(option);});
      if(results.length){render();if(!standalone&&onRepair){const r=selected();const candidates=r.findings.filter(f=>f.rule==='mark-gap'&&f.status==='warning'&&[...f.chars].length===1);if(candidates.length)await onRepair(r,candidates);else $('status').textContent='Đã kiểm tự động. Không có lỗi khoảng cách dấu rời có thể sửa an toàn; những nét đặc trưng được giữ nguyên.';}}
      $('status').textContent=`Đã kiểm ${results.length} / ${records.length} font.`+(errors.length?' Không đọc được: '+errors.join('; '):'');
    }finally{running=false;root.removeAttribute('aria-busy');if(currentButton)currentButton.disabled=false;if(upload)upload.disabled=false;}
  }
  function renderCoverage(){
    const r=selected();if(!r)return;
    $('coverage').replaceChildren();
    const entries=r.coverage.entries.filter(item=>filter==='all'||filter==='missing'&&['missing','blank'].includes(item.status)||filter===item.status);
    for(const item of entries){
      const button=document.createElement('button');button.type='button';button.className='coverage-char';button.dataset.status=item.status;
      button.title=item.char+' · '+item.code+' · '+labels[item.status];button.setAttribute('aria-label',button.title);
      if(item.status==='present'){
        const path=document.createElementNS(ns,'path'),svg=document.createElementNS(ns,'svg'),g=r.font.charToGlyph(item.char),b=g.getBoundingBox(),pad=r.font.unitsPerEm*.07;
        svg.setAttribute('viewBox',`${b.x1-pad} ${-b.y2-pad} ${Math.max(1,b.x2-b.x1)+pad*2} ${Math.max(1,b.y2-b.y1)+pad*2}`);
        path.setAttribute('d',g.path.toPathData(3));path.setAttribute('transform','scale(1,-1)');svg.append(path);button.append(svg);
      }else{const mark=document.createElement('span');mark.textContent=item.status==='components'?'△':'○';button.append(mark);}
      const label=document.createElement('small');label.textContent=item.char;button.append(label);
      button.addEventListener('click',()=>{ $('sample').value=item.char;renderProof();onInspect?.(item.char,r); });
      $('coverage').append(button);
    }
    if(!entries.length){const p=document.createElement('p');p.textContent='Không có ký tự trong nhóm này.';$('coverage').append(p);}
  }
  function renderProof(){const r=selected();if(!r)return;const {svg,missing}=makeQualitySVG(r.font,$('sample').value);$('proof').replaceChildren(svg);$('proof-note').textContent=missing.length?'Thiếu glyph trong câu: '+missing.join(' '):'Outline của file đang kiểm; không dùng font dự phòng để che ký tự thiếu.';}
  function render(){
    const r=selected();if(!r)return;
    $('report').hidden=false;
    $('summary').textContent=`${r.record.name}: ${r.counts.fail} lỗi kỹ thuật, ${r.counts.warning} cảnh báo, ${r.counts.manual} mục cần duyệt bằng mắt.`;
    const c=r.coverage.counts;
    $('coverage-summary').textContent=`${c.present} có glyph · ${c.missing} thiếu · ${c.blank} rỗng · ${c.components} có thành phần ghép chưa xác minh.`;
    if(standalone){
      root.querySelector('[data-role=showcase-name]').textContent=r.record.name;
      root.querySelector('[data-role=paper-name]').textContent=r.record.name.toUpperCase();
      root.querySelector('[data-role=showcase-description]').textContent=r.counts.fail+' lỗi kỹ thuật · '+r.counts.warning+' cảnh báo · '+r.counts.manual+' mục cần duyệt';
      root.querySelector('[data-role=showcase-badge]').textContent=c.missing+c.blank?'Thiếu ký tự':'Đủ ký tự đã kiểm';
      root.querySelector('[data-role=showcase-count]').textContent=c.present+' / 146 ký tự có glyph';
      root.querySelector('[data-role=showcase-progress]').style.width=Math.max(0,Math.min(100,c.present/146*100))+'%';
      root.querySelector('.checker-paper').style.fontFamily='';
    }
    $('measurement').textContent=`Đã đo dấu rời ở ${r.tested} chữ và giao outline ở ${r.checkedPairs} cặp. Đường cong được xấp xỉ để đo; không phải chứng nhận chất lượng thương mại.`;
    const tbody=$('findings');tbody.replaceChildren();const order={fail:0,warning:1,manual:2,pass:3,info:4};
    for(const finding of [...r.findings].sort((a,b)=>order[a.status]-order[b.status]).slice(0,250)){
      const row=document.createElement('tr');row.dataset.status=finding.status;
      for(const value of [statuses[finding.status],finding.chars||'—',finding.message]){const td=document.createElement('td');td.textContent=value;row.append(td);}
      if(finding.chars&&!/^U\+/.test(finding.chars)){
        const button=document.createElement('button');button.type='button';button.className='check-inspect';button.textContent='Xem chữ';
        button.addEventListener('click',()=>{$('sample').value=finding.chars.slice(0,160);renderProof();onInspect?.(finding.chars,r);});row.children[1].append(button);
      }tbody.append(row);
    }
    renderCoverage();renderProof();if(standalone)onSelect?.(r);
  }
  $('font').addEventListener('change',render);$('filter').addEventListener('change',()=>{filter=$('filter').value;renderCoverage();});$('sample').addEventListener('input',renderProof);
  currentButton?.addEventListener('click',async()=>{const record=getCurrent();if(!record){$('status').textContent='Chưa có file xuất để kiểm. Mở hoặc dựng font, đợi xuất xong rồi kiểm lại.';return;}await run([record]);});
  root.querySelector('[data-action=open]').addEventListener('click',async()=>{const r=selected();if(r)await onOpen?.(r);});
  root.querySelector('[data-action=marks]')?.addEventListener('click',()=>onMarks(selected()));
  root.querySelector('[data-action=repair]')?.addEventListener('click',async()=>{
    const r=selected();if(!r||!onRepair)return;
    const candidates=r.findings.filter(f=>f.rule==='mark-gap'&&f.status==='warning'&&[...f.chars].length===1);
    if(!candidates.length){$('repair-hint').textContent='Không có cảnh báo khoảng hở dấu rời phù hợp để đề xuất. Các cảnh báo giao nét cần duyệt bằng mắt.';return;}
    await onRepair(r,candidates);
  });
  function files(records){return [...records].map(file=>({name:file.name.replace(/\.(ttf|otf|woff2?)$/i,''),filename:file.name,blob:file}));}
  $('files')?.addEventListener('change',async event=>{const records=files(event.target.files);event.target.value='';if(records.length)await run(records);});
  if(standalone){root.addEventListener('dragover',event=>{event.preventDefault();root.classList.add('drag-over');});root.addEventListener('dragleave',()=>root.classList.remove('drag-over'));root.addEventListener('drop',async event=>{event.preventDefault();event.stopPropagation();root.classList.remove('drag-over');if(event.dataTransfer.files.length)await run(files(event.dataTransfer.files));});}
  return {run,setResults(value){results=value;$('font').replaceChildren();results.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.record.name;$('font').append(o);});render();},getResult:selected};
}
