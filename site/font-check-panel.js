import {assessFont,makeQualitySVG} from './font-quality.js';
const labels={present:'Có glyph',missing:'Thiếu glyph',blank:'Glyph rỗng',components:'Có thành phần ghép; chưa xác minh vị trí dấu'};
const statuses={fail:'Lỗi',warning:'Cần xem lại',pass:'Đã kiểm',manual:'Duyệt bằng mắt',info:'Thông tin'};
export function createFontCheckPanel(root,{getCurrent,onSelect,onOpen,onInspect,onMarks,standalone=false}={}){
  let results=[],running=false,filter='all';
  const ns='http://www.w3.org/2000/svg';
  root.innerHTML=`<div class="check-toolbar"><h3>${standalone?'Chọn file để kiểm tra':'Đánh giá font đang làm'}</h3><div class="tool-row">${getCurrent?'<button class="primary" type="button" data-action="current">Đánh giá font đang làm</button>':''}${standalone?'<label class="check-file-button primary">Chọn file font<input type="file" multiple accept=".ttf,.otf,.woff,.woff2" data-role="files" class="visually-hidden"></label>':''}<a href="https://colorme.vn/tools/vietnamese-font-check" target="_blank" rel="noopener noreferrer">Đối chiếu trên ColorME</a></div><div class="check-thresholds"><label>Khoảng hở dưới<input type="number" min="0" max="100" value="16" data-role="gap"> / 1000 em</label><label>Chênh đỉnh râu trên<input type="number" min="0" max="100" value="20" data-role="horn"> / 1000 em</label></div><p class="help">${standalone?'TTF, OTF, WOFF · chọn nhiều file hoặc kéo thả vào đây · tối đa 30 MB/file. WOFF2 chưa được bộ đọc này hỗ trợ; dùng TTF/OTF tương ứng. Không cần cài font. ':''}File được đọc trong trình duyệt. Các ngưỡng là mức rà soát tùy chọn của Xưởng, chưa phải chuẩn số được chuyên gia duyệt.</p><p data-role="status" role="status" aria-live="polite">${standalone?'Chọn file để xem bảng 146 ký tự tiếng Việt và kết quả kỹ thuật.':'Bấm đánh giá để nhận kết quả và xử lý ngay tại đây.'}</p></div><div data-role="report" hidden><label>Font trong lần kiểm tra<select data-role="font"></select></label><p data-role="summary" class="check-summary"></p><div class="tool-row check-result-actions"><button type="button" data-action="open">Mở font này để chỉnh sửa</button>${onMarks?'<button type="button" data-action="marks">Chỉnh dấu</button>':''}</div><section class="coverage-section"><h4>Bảng 146 ký tự tiếng Việt</h4><p data-role="coverage-summary"></p><label>Lọc bảng chữ<select data-role="filter"><option value="all">Tất cả ký tự</option><option value="missing">Chỉ chữ thiếu / rỗng</option><option value="components">Chữ có thành phần ghép</option><option value="present">Chữ có glyph</option></select></label><div class="coverage-legend"><span>● Có glyph</span><span>○ Thiếu / rỗng</span><span>△ Có thành phần ghép, chưa xác minh</span></div><div data-role="coverage" class="coverage-grid"></div><p class="help">Có glyph chưa chứng minh hình chữ đúng hoặc đẹp. Chữ có thành phần ghép vẫn cần thử định vị dấu và shaping; không tự tính là đạt.</p></section><label>Câu xem thử<textarea data-role="sample" rows="2">Đường về quê hương — Nguyễn Hữu Đạt — ă â ê ô ơ ư đ</textarea></label><div data-role="proof" class="check-vector-sample"></div><p data-role="proof-note" class="help"></p><p data-role="measurement" class="help"></p><div class="quality-table-wrap"><table class="quality-table"><thead><tr><th>Trạng thái</th><th>Chữ / cặp</th><th>Kết quả</th></tr></thead><tbody data-role="findings"></tbody></table></div><p class="help">Kết quả của file tại thời điểm kiểm tra. Sau khi sửa hoặc xuất lại cần kiểm lại. Duyệt thị giác và thử trong ứng dụng vẫn cần thiết.</p></div>`;
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
      if(results.length)render();
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
    renderCoverage();renderProof();onSelect?.(r);
  }
  $('font').addEventListener('change',render);$('filter').addEventListener('change',()=>{filter=$('filter').value;renderCoverage();});$('sample').addEventListener('input',renderProof);
  currentButton?.addEventListener('click',async()=>{const record=getCurrent();if(!record){$('status').textContent='Chưa có file xuất để kiểm. Mở hoặc dựng font, đợi xuất xong rồi kiểm lại.';return;}await run([record]);});
  root.querySelector('[data-action=open]').addEventListener('click',async()=>{const r=selected();if(r)await onOpen?.(r);});
  root.querySelector('[data-action=marks]')?.addEventListener('click',()=>onMarks(selected()));
  function files(records){return [...records].map(file=>({name:file.name.replace(/\.(ttf|otf|woff2?)$/i,''),filename:file.name,blob:file}));}
  $('files')?.addEventListener('change',async event=>{const records=files(event.target.files);event.target.value='';if(records.length)await run(records);});
  if(standalone){root.addEventListener('dragover',event=>{event.preventDefault();root.classList.add('drag-over');});root.addEventListener('dragleave',()=>root.classList.remove('drag-over'));root.addEventListener('drop',async event=>{event.preventDefault();event.stopPropagation();root.classList.remove('drag-over');if(event.dataTransfer.files.length)await run(files(event.dataTransfer.files));});}
  return {run,setResults(value){results=value;$('font').replaceChildren();results.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.record.name;$('font').append(o);});render();},getResult:selected};
}
