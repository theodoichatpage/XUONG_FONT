import {assessFont,makeQualitySVG} from './font-quality.js';
import {vietnameseCheckCharacters} from './font-coverage.js';
const labels={present:'Có glyph',missing:'Thiếu glyph',blank:'Glyph rỗng',components:'Có thành phần ghép; chưa xác minh vị trí dấu'};
const statuses={fail:'Lỗi',warning:'Cần xem lại',pass:'Đã kiểm',manual:'Duyệt bằng mắt',info:'Thông tin'};
export function createFontCheckPanel(root,{getCurrent,onSelect,onOpen,onInspect,onMarks,onRepair,standalone=false}={}){
  let results=[],running=false,filter='all';
  const ns='http://www.w3.org/2000/svg';
  if(standalone)root.classList.add('checker-showcase');
  root.innerHTML=`<div class="check-toolbar"><h3>${standalone?'Chọn file để kiểm tra':'Tự động sửa font'}</h3><div class="tool-row">${getCurrent?'<button class="primary" type="button" data-action="current">Tự động kiểm tra và đề xuất sửa</button>':''}${standalone?'<label class="check-file-button primary">Chọn file font<input type="file" multiple accept=".ttf,.otf,.woff,.woff2" data-role="files" class="visually-hidden"></label>':''}<a href="https://colorme.vn/tools/vietnamese-font-check" target="_blank" rel="noopener noreferrer">Đối chiếu trên ColorME</a></div><div class="check-thresholds" ${standalone?"":"hidden"}><label>Khoảng hở dưới<input type="number" min="0" max="100" value="16" data-role="gap"> / 1000 em</label><label>Chênh đỉnh râu trên<input type="number" min="0" max="100" value="20" data-role="horn"> / 1000 em</label></div><p class="help">${standalone?'TTF, OTF, WOFF · chọn nhiều file hoặc kéo thả vào đây · tối đa 30 MB/file. WOFF2 chưa được bộ đọc này hỗ trợ; dùng TTF/OTF tương ứng. Không cần cài font. ':''}File được đọc trong trình duyệt. Các ngưỡng là mức rà soát tùy chọn của Xưởng, chưa phải chuẩn số được chuyên gia duyệt.</p><p data-role="status" role="status" aria-live="polite">${standalone?'Chọn file để xem bảng 146 ký tự tiếng Việt và kết quả kỹ thuật.':'Xưởng tự kiểm tra khi bạn bấm nút. Thay đổi nét và chi tiết đặc trưng chỉ thực hiện sau khi bạn duyệt.'}</p></div><div data-role="report" ${standalone?"hidden":"hidden"}><label>Font trong lần kiểm tra<select data-role="font"></select></label><p data-role="summary" class="check-summary"></p><div class="tool-row check-result-actions" ${standalone?"":"hidden"}><button type="button" data-action="open">Mở font này để chỉnh sửa</button>${onMarks?'<button type="button" data-action="marks">Chỉnh dấu</button>':''}</div><section class="coverage-section" ${standalone?"":"hidden"}><h4>Bảng 146 ký tự tiếng Việt</h4><p data-role="coverage-summary"></p><label>Lọc bảng chữ<select data-role="filter"><option value="all">Tất cả ký tự</option><option value="missing">Chỉ chữ thiếu / rỗng</option><option value="components">Chữ có thành phần ghép</option><option value="present">Chữ có glyph</option></select></label><div class="coverage-legend"><span>● Có glyph</span><span>○ Thiếu / rỗng</span><span>△ Có thành phần ghép, chưa xác minh</span></div><div data-role="coverage" class="coverage-grid"></div><p class="help">Có glyph chưa chứng minh hình chữ đúng hoặc đẹp. Chữ có thành phần ghép vẫn cần thử định vị dấu và shaping; không tự tính là đạt.</p></section><label ${standalone?"":"hidden"}>Câu xem thử<textarea data-role="sample" rows="2">Đường về quê hương — Nguyễn Hữu Đạt — ă â ê ô ơ ư đ</textarea></label><div data-role="proof" class="check-vector-sample" ${standalone?"":"hidden"}></div><p data-role="proof-note" class="help"></p><p data-role="measurement" class="help"></p><div class="tool-row" data-role="repair-actions" ${standalone?"":"hidden"}><button type="button" data-action="repair" ${onRepair?"":"disabled"}>Đề xuất sửa an toàn</button><span class="help" data-role="repair-hint">Chỉ tạo bản xem trước; không tự thay nét chữ.</span></div><div class="quality-table-wrap" ${standalone?"":"hidden"}><table class="quality-table"><thead><tr><th>Trạng thái</th><th>Chữ / cặp</th><th>Kết quả</th></tr></thead><tbody data-role="findings"></tbody></table></div><p class="help">Kết quả của file tại thời điểm kiểm tra. Sau khi sửa hoặc xuất lại cần kiểm lại. Duyệt thị giác và thử trong ứng dụng vẫn cần thiết.</p></div>`;
  if(standalone){
    root.insertAdjacentHTML('afterbegin',`<div class="checker-hero"><h2>Kiểm tra font tiếng Việt</h2><p>Tải file font để kiểm tra 146 ký tự, xem outline thật và phát hiện chữ thiếu. Không cần cài font vào máy.</p><div class="checker-hero-actions"><label class="checker-upload-button">Tải file TTF / OTF / WOFF<input type="file" accept=".ttf,.otf,.woff,.woff2" data-role="hero-files"></label><a class="checker-google-link" href="#font-google-search">Tìm font Google</a></div><p class="checker-live-status" data-role="live-status" role="status" aria-live="polite"></p></div><div class="checker-showcase-grid"><div class="checker-paper-zone" data-role="dropzone" tabindex="0" role="button" aria-label="Chọn file font để kiểm tra"><div class="checker-paper-top"><span>146 KÝ TỰ TIẾNG VIỆT</span><span data-role="paper-state">MẪU MINH HỌA · CHƯA TẢI FONT</span></div><div class="checker-paper" data-role="live-paper"><div class="checker-paper-head"><span>BẢN SOÁT CHỮ</span><strong data-role="paper-name">CHƯA CHỌN FONT</strong></div><div class="checker-paper-glyphs" data-role="paper-glyphs"><div><strong>Ặ</strong><small>Ă + NẶNG</small></div><div><strong>ẫ</strong><small>Â + NGÃ</small></div><div><strong>Ỡ</strong><small>Ơ + NGÃ</small></div><div><strong>ự</strong><small>Ư + NẶNG</small></div></div><div class="checker-paper-sentence" data-role="paper-sentence">Đường về quê hương đẹp tựa bức tranh thủy mặc, gió thổi nhẹ qua hàng tre xanh.</div></div><div class="checker-paper-stamp" data-role="paper-stamp">Chưa kiểm tra</div><p class="checker-drop-hint">Nhấn để chọn hoặc kéo thả file .ttf / .otf / .woff / .woff2</p></div><div class="checker-showcase-right"><div class="checker-search-card"><div class="checker-card-head"><span>FONT GOOGLE</span><span>Chọn font để tải và kiểm tra</span></div><label class="checker-google-input"><span>⌕</span><input type="search" data-role="google-search" placeholder="Tìm font Google"></label><div class="checker-google-options" data-role="google-options"></div><p class="checker-google-note">Chọn một font phổ biến hoặc nhập tên Google Font và nhấn Enter để kiểm tra ngay.</p></div><div class="checker-result-card"><div class="checker-card-head"><span>KẾT QUẢ</span><span data-role="showcase-badge">Chưa kiểm định</span></div><div class="checker-result-inner"><strong data-role="showcase-name">Chưa chọn font</strong><p data-role="showcase-description">Chọn TTF / OTF / WOFF để bắt đầu kiểm tra.</p><div class="checker-progress"><span data-role="showcase-progress"></span></div><p data-role="showcase-count">0 / 146 ký tự đã kiểm tra</p><p data-role="missing-characters" class="checker-missing-list" hidden></p></div></div></div></div>`);

    const picker=root.querySelector('[data-role=hero-files]');
    const zone=root.querySelector('[data-role=dropzone]');
    const loadFiles=files=>{const file=files?.[0];if(file)checkUploadedFont(file);};
    picker.addEventListener('change',event=>{loadFiles(event.target.files);event.target.value='';});
    zone.addEventListener('click',event=>{if(!event.target.closest('[data-role=live-paper]'))picker.click();});
    zone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();picker.click();}});
    for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('is-dragover');});
    zone.addEventListener('dragleave',event=>{event.preventDefault();zone.classList.remove('is-dragover');});
    zone.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();zone.classList.remove('is-dragover');loadFiles(event.dataTransfer.files);});
    const popular=['Be Vietnam Pro','Montserrat','Inter','Playfair Display','Roboto','Lora','Oswald','Bebas Neue','Pacifico','Poppins'];
    const search=root.querySelector('[data-role=google-search]');
    const options=root.querySelector('[data-role=google-options]');
    const updateOptions=()=>{
      options.replaceChildren();
      const q=search.value.trim().toLocaleLowerCase();
      for(const name of popular.filter(name=>name.toLocaleLowerCase().includes(q))){
        const button=document.createElement('button');button.type='button';button.textContent=name;
        button.classList.toggle('is-selected',name.toLocaleLowerCase()===q);
        button.addEventListener('click',()=>{search.value=name;updateOptions();checkGoogleFont(name);});
        options.append(button);
      }
    };
    search.addEventListener('input',updateOptions);
    search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();checkGoogleFont(search.value.trim());}});
    root.querySelector('.checker-google-link').addEventListener('click',event=>{event.preventDefault();search.focus();search.scrollIntoView({block:'center',behavior:'smooth'});});
    updateOptions();
    search.value='Be Vietnam Pro';updateOptions();
    queueMicrotask(()=>checkGoogleFont('Be Vietnam Pro'));
  }
  let browserRequest=0;
  const browserChars=vietnameseCheckCharacters;
  const browserSample='Đường về quê hương đẹp tựa bức tranh thủy mặc, gió thổi nhẹ qua hàng tre xanh.';
  function hasBrowserGlyph(char,family){
    const samples=['monospace','serif'].map(fallback=>{
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw Error('Canvas không khả dụng.');
      ctx.clearRect(0,0,128,128);ctx.font='64px "'+family.replace(/"/g,'')+'", '+fallback;
      ctx.textBaseline='middle';ctx.fillStyle='#000';ctx.fillText(char,12,64);
      return ctx.getImageData(0,0,128,128).data;
    });
    for(let i=3;i<samples[0].length;i+=4)if(samples[0][i]!==samples[1][i])return false;
    return true;
  }
  async function displayBrowserFont(family,label,source,request){
    await document.fonts.load('64px "'+family+'"',browserChars.join(''));
    await document.fonts.ready;
    if(request!==browserRequest)return;
    if(!hasBrowserGlyph('a',family)&&!hasBrowserGlyph('A',family))throw Error('Không tải được font hoặc font không có chữ Latin.');
    const missing=browserChars.filter(ch=>!hasBrowserGlyph(ch,family));
    const count=browserChars.length-missing.length;
    const $r=role=>root.querySelector('[data-role="'+role+'"]');
    $r('showcase-name').textContent=label;
    $r('paper-name').textContent=label.toUpperCase();
    $r('showcase-description').textContent=source+' · kiểm tra hiển thị 146 ký tự trong trình duyệt.';
    $r('showcase-badge').textContent=missing.length?'✕ Thiếu '+missing.length+' ký tự':'✓ Đủ dấu tiếng Việt';
    $r('showcase-count').textContent=count+' / '+browserChars.length+' ký tự tiếng Việt hiển thị được';
    $r('showcase-progress').style.width=(count/browserChars.length*100).toFixed(1)+'%';
    $r('paper-stamp').textContent=missing.length?'Thiếu '+missing.length:'Đạt';
    $r('paper-state').textContent='ĐÃ KIỂM TRA FONT';
    const missingList=$r('missing-characters');
    missingList.hidden=!missing.length;missingList.textContent=missing.length?'Chữ thiếu: '+missing.join(' '):'';
    const glyphs=$r('paper-glyphs');glyphs.replaceChildren();
    for(const [ch,caption] of [['Ặ','Ă + NẶNG'],['ẫ','Â + NGÃ'],['Ỡ','Ơ + NGÃ'],['ự','Ư + NẶNG']]){
      const cell=document.createElement('div'),glyph=document.createElement('strong'),desc=document.createElement('small');
      glyph.textContent=ch;glyph.style.fontFamily='"'+family+'",sans-serif';
      if(missing.includes(ch))glyph.classList.add('checker-glyph-missing');
      desc.textContent=missing.includes(ch)?'THIẾU':caption;
      cell.append(glyph,desc);glyphs.append(cell);
    }
    const sentence=$r('paper-sentence');
    sentence.replaceChildren();sentence.textContent=browserSample;
    sentence.style.fontFamily='"'+family+'",sans-serif';
    $r('live-status').textContent='';
  }
  async function checkGoogleFont(name){
    if(!standalone||!name)return;
    const request=++browserRequest;
    const status=root.querySelector('[data-role=live-status]');
    status.textContent='Đang kiểm tra '+name+'…';
    try{
      const safeName=name.trim().slice(0,100);
      const family=safeName;
      const id='xuong-google-'+safeName.replace(/[^a-z0-9]/gi,'-');
      if(!document.getElementById(id)){
        const link=document.createElement('link');link.id=id;link.rel='stylesheet';
        link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(safeName).replace(/%20/g,'+')+'&display=swap';
        document.head.append(link);
        await new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error('Google Fonts không tải được stylesheet.'));});
      }
      await displayBrowserFont(family,safeName,'Google Fonts',request);
    }catch(error){if(request===browserRequest)status.textContent='Không kiểm tra được '+name+': '+error.message;}
  }
  async function checkUploadedFont(file){
    if(!standalone)return;
    const request=++browserRequest,status=root.querySelector('[data-role=live-status]');
    if(file.size>30*1024*1024){status.textContent='File vượt quá 30 MB.';return;}
    if(!/\.(ttf|otf|woff|woff2)$/i.test(file.name)){status.textContent='Hãy chọn file TTF, OTF, WOFF hoặc WOFF2.';return;}
    status.textContent='Đang đọc '+file.name+'…';
    try{
      const family='XuongUploadCheck'+request;
      const face=new FontFace(family,await file.arrayBuffer());
      await face.load();document.fonts.add(face);
      if(request!==browserRequest)return;
      await displayBrowserFont(family,file.name.replace(/\.[^.]+$/,''),'File '+file.name.split('.').pop().toUpperCase(),request);
    }catch(error){if(request===browserRequest)status.textContent='Không đọc được file font: '+error.message;}
  }
  const $=role=>root.querySelector('[data-role="'+role+'"]');
  const selected=()=>results[Number($('font').value)];
  const currentButton=root.querySelector('[data-action=current]');
  async function run(records){
    if(running)return;
    const minGap=Number($('gap').value),hornTolerance=Number($('horn').value);
    if(![minGap,hornTolerance].every(n=>Number.isFinite(n)&&n>=0&&n<=100)){$('status').textContent='Ngưỡng phải từ 0 đến 100.';return;}
    running=true;results=[];$('report').hidden=true;
    root.setAttribute('aria-busy','true');if(standalone)root.querySelector('[data-role=live-status]').textContent='Đang kiểm tra font…';if(currentButton)currentButton.disabled=true;
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
      $('status').textContent=`Đã kiểm ${results.length} / ${records.length} font.`+(errors.length?' Không đọc được: '+errors.join('; '):'');if(standalone)root.querySelector('[data-role=live-status]').textContent=errors.length?errors.join('; '):results.length?'Đã kiểm tra '+results.length+' font.':'Không có font nào được đọc.';
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
      const missingEntries=r.coverage.entries.filter(entry=>entry.status==='missing'||entry.status==='blank');
      const missingCount=missingEntries.length;
      root.querySelector('[data-role=showcase-badge]').textContent=missingCount?'✕ Thiếu '+missingCount+' ký tự':'✓ Đủ 146 ký tự';
      root.querySelector('[data-role=paper-stamp]').textContent=missingCount?'Thiếu '+missingCount:'✓ Đủ ký tự';
      root.querySelector('[data-role=paper-state]').textContent='OUTLINE FONT THỰC TẾ';
      const missingList=root.querySelector('[data-role=missing-characters]');
      missingList.hidden=!missingCount;
      missingList.textContent=missingCount?'Chữ thiếu hoặc rỗng: '+missingEntries.map(entry=>entry.char).join(' '):'';

      const paperGlyphs=root.querySelector('[data-role=paper-glyphs]');paperGlyphs.replaceChildren();
      for(const char of ['Ặ','ẫ','Ỡ','ự']){
        const cell=document.createElement('div');
        const glyph=r.font.charToGlyph(char);
        if(r.font.charToGlyphIndex(char)&&glyph.path.commands.length){
          const box=glyph.getBoundingBox(),pad=r.font.unitsPerEm*.08;
          const svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
          svg.setAttribute('viewBox',`${box.x1-pad} ${-box.y2-pad} ${Math.max(1,box.x2-box.x1)+2*pad} ${Math.max(1,box.y2-box.y1)+2*pad}`);
          path.setAttribute('d',glyph.path.toPathData(3));path.setAttribute('transform','scale(1,-1)');
          svg.append(path);cell.append(svg);
        }else{const absent=document.createElement('strong');absent.textContent='—';cell.append(absent);}
        const label=document.createElement('small');label.textContent=char;cell.append(label);paperGlyphs.append(cell);
      }
      const sentence=root.querySelector('[data-role=paper-sentence]');sentence.replaceChildren(makeQualitySVG(r.font,'Đường về quê hương đẹp tựa bức tranh thủy mặc, gió thổi nhẹ qua hàng tre xanh.').svg);
      root.querySelector('[data-role=showcase-count]').textContent=c.present+' / 146 ký tự có glyph · '+missingCount+' thiếu hoặc rỗng';
      root.querySelector('[data-role=showcase-progress]').style.width=Math.max(0,Math.min(100,c.present/146*100))+'%';
      root.querySelector('.checker-paper').style.fontFamily='inherit';
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
  if(standalone){root.addEventListener('dragover',event=>{event.preventDefault();root.classList.add('drag-over');});root.addEventListener('dragleave',()=>root.classList.remove('drag-over'));root.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();root.classList.remove('drag-over');if(event.target.closest('[data-role=dropzone]'))return;if(event.dataTransfer.files.length)checkUploadedFont(event.dataTransfer.files[0]);});}
  return {run,setResults(value){results=value;$('font').replaceChildren();results.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.record.name;$('font').append(o);});render();},getResult:selected};
}
