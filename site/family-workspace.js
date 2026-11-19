import {parseFamilyInput,resolveNamedStyle,readableStyle,digestReference} from './family-inputs.js';
import {familyStyles} from './family-styles.js';
import {charset,composeVietnamese} from './vietnamese.js';
import {createFamilyProject,saveFamilyProject,listFamilyProjects,loadFamilyProject,replaceProjectGlyph,styleStatus,backupFamilyProject,restoreFamilyProject} from './family-project.js';
import {redrawFontImage} from './ai-design.js';
import {referenceCanvas,isCleanReference} from './reference-image.js';
import {canApproveProof,proofMetricVersion} from './proof-approval.js';
import {reuseReferenceComponents} from './reference-components.js';
import {retraceSettings} from './reference-mask.js';
import {reconstructionProof} from './reconstruction-proof.js';
import {assessFont} from './font-quality.js';
import {validateFamilyAnalysis} from '../src/family-analysis.mjs';

const sourceCanvas=blob=>referenceCanvas(blob,undefined,{native:true});
const fileName=s=>s.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,120);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
const labelNames={serif:'Serif',contrast:'Tương phản nét',terminals:'Đầu nét',stress:'Trục nét',proportion:'Tỷ lệ',capHeight:'Cao chữ hoa',xHeight:'Cao chữ thường',ascender:'Nét vươn',descender:'Nét xuống',slant:'Độ nghiêng',spacing:'Khoảng chữ',diacritics:'Dấu Việt'};
export function setupFamilyWorkspace(root,{traceWords,getKey,getModel,exportStyle,openStyle,saveCollection,getCurrentInput,onResult,onProgress}){
  root.innerHTML=`<summary>Chỉnh sửa và soát chữ (nâng cao)</summary><p class="help">Dùng ô tên và vùng ảnh ở màn hình chính rồi bấm Tạo bộ font. Phần này dành cho xem lại kết quả và sửa khi cần.</p><div class="family-project-body">
    <div class="tool-row"><label>Bản font đã lưu<select data-fp="projects"><option value="">Chọn dự án đã lưu</option></select></label><button type="button" data-fp="new">Tạo dự án Family</button><label>Tên Family<input data-fp="name" maxlength="100" placeholder="Ví dụ: Sử Việt Kiêu Hùng"></label><button type="button" data-fp="save">Lưu bản nháp</button><button type="button" data-fp="backup">Backup dự án</button><label class="check-file-button">Khôi phục backup<input data-fp="restore" type="file" accept=".json" class="visually-hidden"></label></div>
    <p data-fp="status" class="help" role="status" aria-live="polite">Family và ảnh được lưu riêng trên trình duyệt. Backup gồm ảnh, outline và lịch sử; giữ file backup trước khi xóa dữ liệu trang.</p>
    <div data-fp="content" hidden><p data-fp="quick-status" class="help"></p><button type="button" data-fp="continue" class="primary" hidden>Tiếp tục tạo bộ font</button><section hidden class="fp-upload" data-fp="drop" tabindex="0"><label>Chọn nhiều ảnh PNG/JPG/WEBP<input data-fp="files" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p>Kéo thả hoặc Ctrl+V tại khu vực Family. Tối đa 15 MB/ảnh, 40 triệu pixel/ảnh và 100 ảnh/dự án.</p><button type="button" data-fp="analyze">AI phân tích và phân loại ảnh mới</button><button type="button" data-fp="trace">Phục dựng Style đang chọn từ ảnh gốc</button></section>
    <button type="button" data-fp="show-images">Xem / đổi phân loại ảnh</button><div data-fp="images" class="fp-images"></div><details data-fp="advanced"><summary>Chi tiết từng chữ, kiểu chữ và xuất nâng cao</summary><div data-fp="matrix" class="family-matrix"></div>
    <div class="tool-row"><label>Tên Style<input data-fp="style-name" maxlength="80"></label><button type="button" data-fp="rename-style">Lưu tên Style</button><button type="button" data-fp="open">Mở Style trong trình sửa</button><button type="button" data-fp="capture">Lưu phần sửa từ trình sửa về Style</button><button type="button" data-fp="compose">Ghép glyph thiếu từ thành phần có mẫu</button><button type="button" data-fp="export">Xuất TTF bản nháp Style</button><button type="button" data-fp="collection">Lưu TTF vào Bộ sưu tập</button><button type="button" data-fp="export-family">Xuất các Style đã hoàn thiện</button></div>
    <details><summary>Vùng ảnh chưa tách được</summary><p data-fp="trace-diagnostics" class="help"></p></details><p data-fp="style-state" class="help"></p><details><summary>Hồ sơ thiết kế theo bằng chứng ảnh</summary><div data-fp="profile"></div></details>
    <div class="tool-row"><label>Lọc glyph<select data-fp="filter"><option value="all">Tất cả</option><option value="missing">Chưa có dữ liệu</option><option value="direct">Tham chiếu trực tiếp</option><option value="inferred">Suy luận</option><option value="error">Cần xem lại / bị từ chối</option><option value="approved">Đã duyệt và khóa</option></select></label><button type="button" data-fp="proof-all">Đối chiếu toàn Style từ ảnh gốc</button><button type="button" data-fp="approve-batch">Duyệt và khóa các glyph đã vượt đối chiếu</button></div><div data-fp="glyphs" class="fp-glyphs"></div>
    <section data-fp="proof-section"><h3>Đối chiếu glyph gốc</h3><label>Chữ đã tách<select data-fp="review-char"></select></label><p class="help">Trước hết kiểm tra ảnh gốc có đúng ký tự đang chọn không. Điểm trùng nét chỉ đo vector so với vùng ảnh, không xác nhận AI đã đọc đúng chữ.</p><p data-fp="glyph-name"></p><label class="check"><input type="checkbox" data-fp="identity"> Tôi đã xem ảnh gốc: đúng ký tự đang chọn, không cắt nhầm chữ hoặc dấu</label><div class="tool-row"><label>Ngưỡng ảnh<input type="number" min="0" max="254" value="128" data-fp="threshold"></label><label>IoU tối thiểu<input type="number" min="0" max="1" step=".01" value=".96" data-fp="iou"></label><label>Sai lệch contour trung bình tối đa (pixel hiển thị)<input type="number" min="0" max="10" step=".1" value="1" data-fp="contour"></label><label>Lệch chi tiết tối đa (pixel soát)<input type="number" min="0" max="20" step=".1" value="4" data-fp="edge"></label><label class="check"><input type="checkbox" data-fp="overlay">Overlay</label><button type="button" data-fp="retrace">Vector hóa lại glyph này</button><button type="button" data-fp="approve">Duyệt và khóa</button><button type="button" data-fp="reject">Từ chối</button><button type="button" data-fp="unlock">Mở khóa để sửa</button><button type="button" data-fp="previous">Khôi phục phiên bản trước</button></div><div data-fp="proof" class="fp-proof"></div><div data-fp="metrics" class="fp-metrics"></div><p class="help">Đen: phần trùng. Đỏ: nét nguồn bị thiếu. Xanh: nét xuất thừa. Chỉ một phép scale chung, không kéo giãn riêng để che sai lệch. Không tự loại watermark nằm trên nét chữ.</p></section>
    <label class="check"><input type="checkbox" data-fp="rendering">Tôi đã kiểm Style này trong ứng dụng sử dụng font, ở nhiều cỡ và hai dòng</label><button type="button" data-fp="verify">Kiểm điều kiện hoàn thiện Style</button></details>
    </div></div>`;
  const confirmation=document.getElementById('image-style-confirmation'),confirmationCards=document.getElementById('image-style-cards');
  const $=name=>root.querySelector('[data-fp="'+name+'"]');
  let project,styleId='Regular',selectedChar='i',busy=false,urls=[],proofRevision=0,lastProof,editorBinding;
  let queue=Promise.resolve(),flowSignal,flowTarget,flowRunning=false;
  const say=text=>{$('status').textContent=text;onProgress?.(text);};
  const activeStyle=()=>project?.styles.find(s=>s.id===styleId);
  const activeGlyph=()=>activeStyle()?.glyphs.find(g=>g.char===selectedChar);
  const release=()=>{urls.forEach(URL.revokeObjectURL);urls=[];};
  async function persist(message){
    if(!project)return;project.version++;project.history=[...(project.history||[]),{version:project.version,time:new Date().toISOString(),action:message}].slice(-100);
    const snapshot=structuredClone(project);queue=queue.catch(()=>{}).then(()=>saveFamilyProject(snapshot));
    try{await queue;localStorage.setItem('xuong-font-active-family',project.id);say(message+' · Đã lưu bản '+snapshot.version+'.');await renderProjects();}
    catch(error){say('CHƯA LƯU ĐƯỢC: '+error.message+'. Giữ tab mở và thử Backup dự án.');throw error;}
  }
  async function run(task){if(busy)return false;busy=true;root.setAttribute('aria-busy','true');try{await task();return true;}catch(error){say(error.message);return false;}finally{busy=false;root.removeAttribute('aria-busy');}}
  async function renderProjects(){const rows=await listFamilyProjects();$('projects').replaceChildren(new Option('Chọn dự án đã lưu',''));for(const p of rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))$('projects').append(new Option(p.name+' · '+p.styles.filter(s=>s.glyphs.length).length+' Style có glyph',p.id));$('projects').value=project?.id||'';}
  function touchStyle(style){style.status=styleStatus(style);style.verification=undefined;}
  async function makeFont(style){
    if(!style?.glyphs.some(g=>g.d))throw Error('Style chưa có outline vector.');
    const blob=await exportStyle(project.name,style);
    // No classification or preview image substitutes for a font file.
    const report=await assessFont({name:project.name+' '+style.name,style:style.id,blob});
    if(report.findings.some(f=>f.status==='fail'&&['metadata','outline'].includes(f.rule)))throw Error('File xuất lỗi metadata hoặc outline; chưa cho tải.');
    return {blob,report};
  }
  const proofOptions=()=>({minIoU:Number($('iou').value),maxContourDistance:Number($('contour').value),maxContourDeviation:Number($('edge').value)});
  const glyphPass=glyph=>glyph?.identityVersion===glyph?.version&&canApproveProof(glyph,proofOptions());
  function recordProof(glyph,proof,options=proofOptions()){return {metricVersion:proofMetricVersion,version:glyph.version,threshold:proof.threshold,...options,vectorResult:proof.vectorResult,fontResult:proof.fontResult,time:new Date().toISOString()};}
  async function showProof(){
    const turn=++proofRevision;lastProof=undefined;$('proof').replaceChildren();$('metrics').textContent='';
    const style=activeStyle(),glyph=activeGlyph();$('glyph-name').textContent=selectedChar+' · '+(glyph?glyph.origin==='inferred'?'Suy luận · chưa có ảnh tham chiếu trực tiếp':glyph.locked?'Đã duyệt và khóa':'Trực tiếp · cần duyệt':'Chưa có dữ liệu');
    $('review-char').value=selectedChar;
    $('identity').checked=!!glyph&&glyph.identityVersion===glyph.version;
    if(!glyph)return;
    const image=project.images.find(i=>i.id===glyph.sourceImageId);
    if(!image){$('metrics').textContent='Glyph suy luận hoặc nhập từ trình sửa: chưa có ảnh nguồn để xác minh độ giống.';return;}
    try{
      const canvas=await sourceCanvas(image.blob),{blob}=await makeFont(style);
      const proof=await reconstructionProof(canvas,glyph,new Uint8Array(await blob.arrayBuffer()),{threshold:Number($('threshold').value),minIoU:Number($('iou').value),maxContourDistance:Number($('contour').value),maxContourDeviation:Number($('edge').value)});
      if(turn!==proofRevision||activeGlyph()!==glyph)return;
      lastProof=proof;
      if(image.parentImageId){const parent=project.images.find(i=>i.id===image.parentImageId);if(parent){const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent='Ảnh tham chiếu ban đầu — AI có thể đổi nét; cần kiểm lại';figure.append(await sourceCanvas(parent.blob),caption);$('proof').append(figure);}}
      for(const [caption,key]of [[image.parentImageId?'Vùng ảnh Gemini dựng lại':'Ảnh glyph gốc','original'],['Outline vector','vector'],['Glyph từ file TTF','exported']]){const figure=document.createElement('figure'),label=document.createElement('figcaption');label.textContent=caption;figure.append(proof[key],label);$('proof').append(figure);}
      if($('overlay').checked){const figure=document.createElement('figure'),label=document.createElement('figcaption');label.textContent='Overlay ảnh gốc / TTF';figure.append(proof.overlay,label);$('proof').append(figure);}
      const table=document.createElement('table');table.className='quality-table';
      const header=document.createElement('tr');for(const text of ['Phép đối chiếu','Vector','TTF']){const cell=document.createElement('th');cell.textContent=text;header.append(cell);}table.append(header);
      const rows=[['Trùng silhouette (IoU)',r=>(100*r.iou).toFixed(2)+'%'],['Contour trung bình',r=>r.contourMean.toFixed(3)+' px soát'],['Lệch chi tiết lớn nhất',r=>r.contourMax.toFixed(3)+' px soát'],['Sai tỷ lệ rộng/cao',r=>(r.aspectError*100).toFixed(2)+'%'],['Diện tích nét / nguồn',r=>(r.areaRatio*100).toFixed(2)+'%'],['Vùng trắng kín: nguồn → kết quả',r=>r.referenceHoles.count+' → '+r.candidateHoles.count],['Đánh giá ngưỡng',r=>r.pass?'Qua ngưỡng rà soát':r.findings.join(' ')]];
      for(const [label,format]of rows){const row=document.createElement('tr');for(const text of [label,format(proof.vectorResult),format(proof.fontResult)]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}table.append(row);}
      const note=document.createElement('p');note.textContent='Ảnh soát ×'+proof.zoom.toFixed(2)+'. '+proof.alignment+' Chưa tự xác minh serif, stress angle, baseline quang học và vị trí dấu. Ngưỡng do Xưởng chọn; không phải tỷ lệ giống tuyệt đối.';
      $('metrics').replaceChildren(table,note);
      glyph.proof=recordProof(glyph,proof);
      await persist('Đã lưu kết quả đối chiếu '+glyph.char);
    }catch(error){if(turn===proofRevision)$('metrics').textContent='Chưa đối chiếu được: '+error.message;}
  }
  function renderGlyphs(){
    const style=activeStyle();$('glyphs').replaceChildren();if(!style)return;
    const filter=$('filter').value;
    const chars=[...new Set([...charset,...style.glyphs.map(g=>g.char)])];
    for(const char of chars){const glyph=style.glyphs.find(g=>g.char===char);if(filter==='missing'&&glyph||filter==='direct'&&glyph?.origin!=='direct'||filter==='inferred'&&glyph?.origin!=='inferred'||filter==='approved'&&!glyph?.approved||filter==='error'&&(!glyph||glyph.approved))continue;
      const button=document.createElement('button');button.type='button';button.textContent=char+' '+(!glyph?'○':glyph.locked?'🔒':glyph.origin==='inferred'?'△':'●');button.title=char+' · '+(!glyph?'Chưa có dữ liệu':glyph.origin||'Chưa rõ nguồn');button.setAttribute('aria-pressed',String(char===selectedChar));button.addEventListener('click',()=>{if(busy)return;selectedChar=char;const chosen=activeGlyph();$('threshold').value=String(chosen?.processing?.threshold??128);renderGlyphs();void showProof();});$('glyphs').append(button);
    }
  }
  function render(){
    release();confirmationCards?.replaceChildren();if(confirmation)confirmation.hidden=true;$('content').hidden=!project;if(!project)return;
    if(root.classList.contains('fp-guided')){const count=project.images.filter(i=>!i.confirmed&&!i.excluded).length;$('quick-status').textContent=count?'Còn '+count+' ảnh cần chọn kiểu chữ hoặc Bỏ qua ảnh này.':'Đã xác nhận ảnh. Bấm Tạo bộ font ở vùng ảnh mẫu để tiếp tục.';}
    $('name').value=project.name;$('projects').value=project.id;const style=activeStyle();$('threshold').value=String(activeGlyph()?.processing?.threshold??128);$('style-name').value=style.name;$('rendering').checked=!!style.verification?.rendering;
    $('style-state').textContent=project.name+' '+style.name+' · weight '+style.weight+' · '+styleStatus(style)+' · '+style.glyphs.length+' glyph vector. Vị trí trống không phải font đã tạo.';
    $('matrix').replaceChildren();for(const weight of familyStyles.filter(s=>!s.italic)){const label=document.createElement('strong');label.textContent=weight.style+' '+weight.weight;$('matrix').append(label);for(const italic of [false,true]){const slot=project.styles.find(s=>s.id===weight.style+(italic?' Italic':'')),button=document.createElement('button');button.type='button';button.textContent=(italic?'Italic':'Roman')+' · '+styleStatus(slot);button.setAttribute('aria-pressed',String(slot.id===styleId));button.addEventListener('click',()=>{if(busy)return;styleId=slot.id;selectedChar=slot.glyphs[0]?.char||'i';render();void showProof();});$('matrix').append(button);}}
    $('images').replaceChildren();for(const image of project.images){const card=document.createElement('section'),img=document.createElement('img'),url=URL.createObjectURL(image.blob);urls.push(url);img.src=url;img.alt=image.name;img.tabIndex=0;img.addEventListener('click',()=>{const dialog=document.createElement('dialog'),large=document.createElement('img'),close=document.createElement('button');large.src=url;large.style.maxWidth='90vw';large.style.maxHeight='80vh';close.textContent='Đóng';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(large,close);document.body.append(dialog);dialog.showModal();});
      const title=document.createElement('strong');title.textContent=image.name;const info=document.createElement('p');info.textContent=image.analysis?(image.confirmed?'Đã xác nhận':'Cần xác nhận')+' · AI '+Math.round(image.analysis.confidence*100)+'% · '+image.analysis.quality+' · '+image.analysis.evidence:'Chưa phân tích';
      const select=document.createElement('select');select.append(new Option('Chưa phân loại',''));for(const s of project.styles)select.append(new Option(readableStyle(s.id),s.id));select.value=image.styleId||image.analysis?.style||'';select.addEventListener('change',()=>run(async()=>{image.styleId=select.value;image.confirmed=!!select.value;await persist('Đã xác nhận kiểu chữ. Bấm Tạo bộ font để tiếp tục');render();}));
      const confirm=document.createElement('button');confirm.textContent='Dùng kiểu này';confirm.type='button';confirm.onclick=()=>run(async()=>{if(!select.value)throw Error('Chọn Style hoặc để ảnh chưa phân loại.');image.styleId=select.value;image.confirmed=true;await persist('Đã xác nhận kiểu chữ. Bấm Tạo bộ font để tiếp tục');render();});
      const remove=document.createElement('button');remove.type='button';remove.textContent='Xóa ảnh';remove.onclick=()=>run(async()=>{if(project.styles.some(s=>s.glyphs.some(g=>g.sourceImageId===image.id)))throw Error('Ảnh đang làm bằng chứng cho glyph; giữ ảnh để đối chiếu. Có thể thêm ảnh thay thế.');project.images=project.images.filter(i=>i!==image);await persist('Đã xóa ảnh chưa dùng');render();});
      const replace=document.createElement('input');replace.type='file';replace.accept='image/png,image/jpeg,image/webp';replace.setAttribute('aria-label','Thay ảnh '+image.name);replace.onchange=()=>run(async()=>{if(replace.files.length){await addImages(replace.files);say('Đã thêm ảnh thay thế như nguồn mới. Ảnh cũ được giữ nếu đang dùng cho glyph.');}});
      const skip=document.createElement('button');skip.type='button';skip.textContent=image.excluded?'Dùng lại ảnh này':'Bỏ qua ảnh này';skip.onclick=()=>run(async()=>{image.excluded=!image.excluded;await persist('Đã cập nhật ảnh dùng để tạo font');render();});card.dataset.confirmed=String(image.confirmed||image.excluded);card.append(img,title,info,select,confirm,skip,remove,replace);if(!image.confirmed&&!image.excluded&&confirmationCards){confirmationCards.append(card);confirmation.hidden=false;}else $('images').append(card);
    }
    $('profile').replaceChildren();for(const evidence of project.images.filter(i=>i.styleId===styleId&&i.confirmed&&i.analysis)){const paragraph=document.createElement('p');paragraph.textContent=evidence.name+' · AI mô tả, chưa phải phép đo đã xác minh: '+Object.entries(evidence.analysis.profile).filter(([,v])=>v).map(([k,v])=>labelNames[k]+': '+v).join(' · ');$('profile').append(paragraph);}
    $('trace-diagnostics').textContent=project.images.filter(i=>i.styleId===styleId).flatMap(i=>(i.traceDiagnostics||[]).filter(d=>d.status!=='segmented').map(d=>i.name+' — '+d.text+': '+({'unsupported-character':'có ký tự chưa hỗ trợ','ink-crosses-box':'vùng AI khoanh cắt ngang nét chữ','no-safe-separation':'chưa tìm được ranh giới an toàn giữa các chữ'}[d.status]||d.status))).join('\n')||'Chưa có báo cáo vùng bị bỏ qua. Vẫn cần kiểm đúng ký tự bằng ảnh gốc.';
    $('review-char').replaceChildren(...style.glyphs.map(g=>new Option(g.char+' · '+(g.locked?'Đã khóa':'Chưa duyệt'),g.char)));$('review-char').value=selectedChar;
    renderGlyphs();
  }
  async function addImages(files){
    if(!project)throw Error('Tạo hoặc mở Family trước khi nhập ảnh.');
    const batch=[...files];if([...project.images.map(i=>i.blob),...batch].reduce((sum,b)=>sum+b.size,0)>80*1024*1024)throw Error('Tổng ảnh mỗi Family tối đa 80 MB để có thể backup.');if(project.images.length+batch.length>100)throw Error('Tối đa 100 ảnh mỗi Family.');
    for(const file of batch){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('Ảnh không hỗ trợ hoặc vượt 15 MB: '+file.name);const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>40_000_000)throw Error('Ảnh quá 40 triệu pixel.');}
    for(const file of batch)project.images.push({id:crypto.randomUUID(),name:file.name||'Ảnh dán',blob:file,styleId:'',confirmed:false});
    await persist('Đã nhập '+batch.length+' ảnh');render();
  }
  $('new').onclick=()=>run(async()=>{project=createFamilyProject($('name').value);styleId='Regular';await persist('Đã tạo Family 16 vị trí');render();});
  $('projects').onchange=()=>run(async()=>{if(!$('projects').value)return;project=await loadFamilyProject($('projects').value);styleId='Regular';render();void showProof();});
  $('name').onchange=()=>run(async()=>{if(!project)return;project.name=$('name').value.trim()||project.name;await persist('Đã đổi tên Family');render();});
  $('save').onclick=()=>run(()=>persist('Đã lưu bản nháp Family'));
  $('backup').onclick=()=>run(async()=>{if(!project)throw Error('Chưa có Family.');download(new Blob([await backupFamilyProject(project)],{type:'application/json'}),project.name+'.xuong-family.json');say('Đã tạo backup gồm ảnh và glyph. Kiểm tra file tải xuống.');});
  $('restore').onchange=()=>run(async()=>{const file=$('restore').files[0];if(!file)return;if(file.size>130_000_000)throw Error('Backup vượt giới hạn 130 MB.');project=await restoreFamilyProject(await file.text());styleId='Regular';await persist('Đã khôi phục thành dự án riêng');render();$('restore').value='';});
  $('files').onchange=()=>run(async()=>{await addImages($('files').files);$('files').value='';});
  for(const type of ['dragover','drop'])$('drop').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();if(type==='drop')void run(()=>addImages(e.dataTransfer.files));});

  $('analyze').onclick=()=>run(async()=>{
    const key=getKey();if(!key)throw Error('Nhập khóa Gemini ở thanh trên để phân tích ảnh.');
    for(const [index,image]of project.images.filter(i=>(!i.analysis||i.analysisVersion!==2)&&!i.excluded).entries()){
      say('Đang phân tích ảnh '+(index+1)+': '+image.name);
      const canvas=await sourceCanvas(image.blob),preview=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(canvas.width,canvas.height));preview.width=Math.round(canvas.width*scale);preview.height=Math.round(canvas.height*scale);preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
      const response=await fetch('/api/glyph-review',{method:'POST',headers:{'Content-Type':'application/json','x-gemini-key':key},body:JSON.stringify({mode:'family-analysis',image:preview.toDataURL('image/jpeg',.88).split(',')[1],preferredModel:getModel()}),signal:flowSignal?AbortSignal.any([flowSignal,AbortSignal.timeout(33000)]):AbortSignal.timeout(33000)});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'AI phân tích thất bại; những ảnh đã lưu được giữ lại.');if(image.analysis)image.analysisHistory=[...(image.analysisHistory||[]),image.analysis].slice(-3);image.analysis=validateFamilyAnalysis(data);image.analysisVersion=2;if(!image.confirmed)Object.assign(image,resolveNamedStyle(image.analysis,flowTarget));
      await persist('Đã phân tích '+image.name);render();
    }
  });
  $('trace').onclick=()=>run(async()=>{
    const style=activeStyle(),images=project.images.filter(i=>i.styleId===styleId&&i.confirmed&&!i.excluded&&!i.preparedImageId);
    if(!images.length)throw Error('Style chưa có ảnh đã xác nhận. Phân tích và xác nhận ảnh trước.');
    let count=0;for(const image of images){if(!image.analysis?.words.length&&!image.analysis?.lines?.length)throw Error('Ảnh chưa có vùng ký tự được AI xác định. Hãy phân tích ảnh.');say('Đang truy vết trực tiếp: '+image.name);style.status='Đang dựng';const canvas=await sourceCanvas(image.blob),glyphs=await traceWords(canvas,image.analysis.words,flowSignal||new AbortController().signal,{lines:image.analysis.lines});
      image.traceDiagnostics=glyphs.diagnostics||[];
      for(const glyph of glyphs){const saved={...glyph,sourceImageId:image.id,styleId,weight:style.weight,italic:style.italic,origin:image.parentImageId?'inferred':'direct',inference:image.parentImageId?{method:'ai-redraw',originalImageId:image.parentImageId}:undefined,source:image.parentImageId?'Ảnh Gemini dựng lại':'Ảnh mẫu',processing:glyph.processing||{method:'threshold-only',threshold:128},reconstructionStatus:glyph.pixelCrop.h<(/[\p{L}\p{N}]/u.test(glyph.char)?24:4)||image.analysis.quality==='needs-better-image'?'needs-better-image':'needs-review'};const previous=style.glyphs.find(g=>g.char===saved.char);if(previous?.origin==='direct'&&previous.pixelCrop&&previous.sourceImageId!==saved.sourceImageId&&previous.sourceImageId!==image.parentImageId&&previous.pixelCrop.w*previous.pixelCrop.h>saved.pixelCrop.w*saved.pixelCrop.h)continue;if(replaceProjectGlyph(style,saved))count++;}
      style.profile={...style.profile,sourceImages:images.map(i=>i.id),metrics:'relative-unverified'};await persist('Đã lưu glyph trực tiếp từ '+image.name);
    }touchStyle(style);selectedChar=style.glyphs.find(g=>g.char==='i')?.char||style.glyphs[0]?.char||'i';render();await showProof();say('Đã phục dựng '+count+' glyph thành vector; chưa tự duyệt. Glyph khóa được giữ nguyên.');
  });
  $('rename-style').onclick=()=>run(async()=>{activeStyle().name=$('style-name').value.trim()||activeStyle().id;await persist('Đã đổi tên Style');render();});
  $('identity').onchange=()=>run(async()=>{const g=activeGlyph();if(!g)return;if(g.locked)throw Error('Chữ đã khóa; mở khóa trước khi đổi xác nhận.');g.identityVersion=$('identity').checked?g.version:undefined;await persist('Đã cập nhật xác nhận đúng ký tự '+g.char);});
  $('review-char').onchange=()=>{selectedChar=$('review-char').value;renderGlyphs();void showProof();};
  $('filter').onchange=renderGlyphs;
  for(const field of ['overlay','threshold','iou','contour','edge'])$(field).onchange=()=>{void showProof();};
  $('approve').onclick=()=>run(async()=>{const g=activeGlyph();if(!glyphPass(g))throw Error('Cần xác nhận ảnh gốc đúng ký tự và đối chiếu đạt ngưỡng đã dùng khi phục dựng. Nếu đổi ngưỡng ảnh, hãy vector hóa lại trước khi duyệt.');g.approved=true;g.locked=true;g.reconstructionStatus='approved';await persist('Đã duyệt và khóa '+g.char);render();});
  $('proof-all').onclick=()=>run(async()=>{
    const options=proofOptions(),style=activeStyle(),{blob}=await makeFont(style),bytes=new Uint8Array(await blob.arrayBuffer());
    const candidates=style.glyphs.filter(g=>!g.locked).sort((a,b)=>String(a.sourceImageId).localeCompare(String(b.sourceImageId)));
    let cachedId,canvas,passed=0;const skipped=[];
    for(const [index,glyph]of candidates.entries()){
      flowSignal?.throwIfAborted();
      say('Đối chiếu '+(index+1)+' / '+candidates.length+': '+glyph.char+'…');
      const image=project.images.find(i=>i.id===glyph.sourceImageId);
      if(!image||!glyph.placement){skipped.push(glyph.char+' (thiếu ảnh hoặc phép đặt)');continue;}
      try{
        if(cachedId!==image.id){canvas=await sourceCanvas(image.blob);cachedId=image.id;}
        const result=await reconstructionProof(canvas,glyph,bytes,{threshold:glyph.processing?.threshold??128,...options});
        glyph.proof=recordProof(glyph,result,options);if(canApproveProof(glyph,options))passed++;
      }catch(error){glyph.proof=undefined;skipped.push(glyph.char+' ('+error.message+')');}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    await persist('Đã đối chiếu toàn Style: '+passed+' / '+candidates.length+' glyph chưa khóa qua ngưỡng. Bỏ qua: '+(skipped.join(', ')||'không'));
    renderGlyphs();
  });
  $('approve-batch').onclick=()=>run(async()=>{let count=0;for(const g of activeStyle().glyphs)if(glyphPass(g)){g.approved=true;g.locked=true;g.reconstructionStatus='approved';count++;}await persist('Đã duyệt và khóa '+count+' glyph có kết quả đối chiếu');render();});
  $('reject').onclick=()=>run(async()=>{const g=activeGlyph();if(!g)return;if(g.locked)throw Error('Mở khóa trước khi từ chối glyph đã duyệt.');g.approved=false;g.reconstructionStatus='rejected';await persist('Đã từ chối '+g.char);render();});
  $('unlock').onclick=()=>run(async()=>{const g=activeGlyph();if(!g)return;g.locked=false;g.approved=false;g.reconstructionStatus='needs-review';g.proof=undefined;await persist('Đã mở khóa '+g.char);render();});
  $('previous').onclick=()=>run(async()=>{const style=activeStyle(),g=activeGlyph();if(g?.locked)throw Error('Mở khóa trước khi khôi phục outline.');const previous=g?.history?.at(-1);if(!previous)throw Error('Chưa có phiên bản trước.');const history=g.history.slice(0,-1);style.glyphs=style.glyphs.map(item=>item===g?{...previous,history,approved:false,locked:false,version:g.version+1,proof:undefined}:item);touchStyle(style);await persist('Đã khôi phục outline trước của '+g.char);render();await showProof();});
  $('retrace').onclick=()=>run(async()=>{
    const style=activeStyle(),g=activeGlyph();if(!g||g.locked)throw Error('Chọn glyph chưa khóa.');if(g.origin==='inferred'&&!g.inference?.originalImageId)throw Error('Đây là glyph tái sử dụng thành phần. Hãy sửa glyph nguồn hoặc dùng ảnh tham chiếu đúng ký tự để thay thế.');const image=project.images.find(i=>i.id===g.sourceImageId);if(!image||!g.pixelCrop)throw Error('Glyph chưa có ảnh nguồn trực tiếp.');
    const canvas=await sourceCanvas(image.blob),crop=g.pixelCrop;const next=await traceWords(canvas,[{text:g.char,box:[crop.y/canvas.height*1000,crop.x/canvas.width*1000,(crop.y+crop.h)/canvas.height*1000,(crop.x+crop.w)/canvas.width*1000]}],new AbortController().signal,retraceSettings(g,Number($('threshold').value)));
    if(next.length!==1)throw Error('Vùng glyph không còn tách được chắc chắn; cần ảnh tốt hơn.');
    const replacement={...next[0],sourceImageId:image.id,styleId,weight:style.weight,italic:style.italic,origin:'direct',source:'Ảnh mẫu',reconstructionStatus:g.reconstructionStatus==='needs-better-image'?'needs-better-image':'needs-review',processing:next[0].processing};
    // Reuse the established scale and baseline; retracing cannot normalize a new shape into a false match.
    if(g.placement){replacement.placement={...g.placement,sourceY:replacement.pixelCrop.y};const {placeReferenceAt}=await import('./reference-placement.js');Object.assign(replacement,placeReferenceAt(replacement,g.placement));}
    replaceProjectGlyph(style,replacement);await persist('Đã vector hóa lại '+g.char);render();await showProof();
  });
  $('compose').onclick=()=>run(async()=>{const style=activeStyle(),map=new Map(style.glyphs.map(g=>[g.char,g]));let count=0;for(const g of [...reuseReferenceComponents(map),...composeVietnamese(map,()=>false,{requireReferenceMarks:true})])if(!map.has(g.char)){replaceProjectGlyph(style,{...g,origin:'inferred',source:'Ghép dấu suy luận',styleId,weight:style.weight});count++;}await persist('Đã ghép '+count+' glyph từ contour có mẫu; đánh dấu suy luận. Còn thiếu thành phần thì giữ trống, không thay glyph đã có');render();});
  $('export').onclick=()=>run(async()=>{const style=activeStyle(),{blob,report}=await makeFont(style);download(blob,project.name+'-'+style.name+'-DRAFT.ttf');say('Đã xuất bản nháp '+style.name+' · '+report.coverage.counts.present+'/146 chữ Việt. Chưa đánh dấu hoàn thiện.');});
  $('collection').onclick=()=>run(async()=>{const style=activeStyle(),{blob}=await makeFont(style);await saveCollection({name:project.name+' '+style.name,family:project.name,style:style.id,weight:style.weight,italic:style.italic,filename:fileName(project.name+'-'+style.name+'.ttf'),blob,draft:styleStatus(style)!=='Hoàn thiện',projectId:project.id});say('Đã lưu file Style vào Bộ sưu tập; dự án Family vẫn giữ đầy đủ ảnh và glyph.');});
  $('export-family').onclick=()=>run(async()=>{const styles=project.styles.filter(s=>styleStatus(s)==='Hoàn thiện');if(!styles.length)throw Error('Chưa có Style hoàn thiện. Có thể xuất riêng TTF bản nháp để thử.');for(const style of styles){const {blob}=await makeFont(style);download(blob,project.name+'-'+style.name+'.ttf');}say('Đã xuất '+styles.length+' Style hoàn thiện; các vị trí khác giữ bản nháp.');});
  $('verify').onclick=()=>run(async()=>{const style=activeStyle(),{report}=await makeFont(style);style.verification={technical:!report.counts.fail,rendering:$('rendering').checked,checkedAt:new Date().toISOString()};style.status=styleStatus(style);await persist('Kiểm Style: '+style.status+' · '+report.counts.fail+' lỗi kỹ thuật');render();});
  $('open').onclick=()=>run(async()=>{const style=activeStyle();if(!style.glyphs.length)throw Error('Style chưa có glyph.');await openStyle(project.name,style);editorBinding={projectId:project.id,styleId};say('Đã mở '+style.name+' trong trình sửa. Sau khi sửa, bấm Lưu phần sửa từ trình sửa về Style.');});
  // The capture callback only accepts the exact project/style that was opened.
  $('capture').onclick=()=>run(async()=>{if(!editorBinding||editorBinding.projectId!==project.id||editorBinding.styleId!==styleId)throw Error('Mở đúng Style trong trình sửa trước.');const edited=await openStyle(null,null,{capture:true});if(!edited)throw Error('Trình sửa không còn đúng Style đã mở.');const style=activeStyle();let count=0;for(const g of edited){const previous=style.glyphs.find(item=>item.char===g.char);if(previous?.d===g.d&&previous?.advance===g.advance)continue;if(replaceProjectGlyph(style,{...previous,...g,styleId,weight:style.weight,italic:style.italic,proof:undefined}))count++;}await persist('Đã lưu '+count+' glyph từ trình sửa, giữ nguyên glyph khóa');render();});
  $('name').parentElement.hidden=true;$('new').hidden=true;
  $('show-images').onclick=()=>root.classList.toggle('fp-guided');
  $('continue').onclick=()=>{const input=getCurrentInput?.();if(input)void createFromCurrent(input);};
  async function createFromCurrent({name,images,workspace,signal,composeMissing=false}){
    if(flowRunning||busy)return {ok:false};
    flowRunning=true;await restoration;flowSignal=signal;root.classList.add('fp-guided');$('continue').hidden=true;
    try{
      const input=parseFamilyInput(name);flowTarget=input.style;
      if(!images?.length)throw Error('Thêm ảnh vào vùng Ảnh mẫu ở màn hình chính trước.');
      signal?.throwIfAborted();
      if(!project||project.name.toLocaleLowerCase()!==input.family.toLocaleLowerCase()){
        const saved=await listFamilyProjects();project=saved.find(p=>p.name.toLocaleLowerCase()===input.family.toLocaleLowerCase())||createFamilyProject(input.family);
      }
      // Preserve the previous mixed/legacy working set without importing its glyphs into the new family.
      if(workspace&&!project.legacyWorkspace)project.legacyWorkspace=structuredClone(workspace);
      for(const existing of project.images)if(!existing.digest)existing.digest=await digestReference(existing.blob);
      const incoming=[],seen=new Set(project.images.map(i=>i.digest));
      for(const file of images){const digest=await digestReference(file);if(!seen.has(digest)){incoming.push({file,digest});seen.add(digest);}}
      if(incoming.length){if(!await run(()=>addImages(incoming.map(i=>i.file))))return {ok:false};for(const {file,digest}of incoming){const entry=project.images.findLast(i=>i.blob===file);if(entry)entry.digest=digest;}}
      await persist('Đã dùng tên và ảnh đang có; không cần nhập lại');
      if(!await $('analyze').onclick())return {ok:false};
      for(const image of project.images){if(image.analysis&&!image.confirmed&&!image.excluded)Object.assign(image,resolveNamedStyle(image.analysis,input.style));}
      // An explicit style in the user's name is their choice, not an AI guess.
      if(input.style)for(const image of project.images.filter(i=>!i.confirmed&&!i.excluded)){image.styleId=input.style;image.confirmed=true;image.styleChosenBy='family-name';}
      const pending=project.images.filter(i=>!i.confirmed&&!i.excluded);
      if(pending.length){render();$('quick-status').textContent='Có '+pending.length+' ảnh cần xác nhận kiểu chữ ngay dưới ảnh mẫu. Chọn kiểu đúng rồi bấm lại Tạo bộ font.';say($('quick-status').textContent);confirmation?.scrollIntoView({block:'nearest'});return {ok:false,pending:true};}
      for(const image of project.images.filter(i=>i.confirmed&&!i.excluded&&!i.parentImageId&&!i.preparedImageId)){
        signal?.throwIfAborted();const canvas=await sourceCanvas(image.blob);
        if(isCleanReference(canvas))continue;
        say('Gemini đang dựng chữ đen trên nền trắng: '+image.name+'…');
        const prepared=await redrawFontImage([canvas],{mode:'clean'},getKey(),signal||new AbortController().signal);
        const blob=await new Promise(resolve=>prepared.toBlob(resolve,'image/png'));if(!blob)throw Error('Chưa lưu được ảnh Gemini trả về.');
        if(blob.size>15*1024*1024||project.images.length>=100||project.images.reduce((sum,i)=>sum+i.blob.size,0)+blob.size>80*1024*1024)throw Error('Ảnh Gemini vượt giới hạn lưu dự án; ảnh gốc vẫn được giữ.');
        const child={id:crypto.randomUUID(),name:'Nền trắng — '+image.name,blob,digest:await digestReference(blob),parentImageId:image.id,styleId:image.styleId,confirmed:true,role:'ai-redrawn'};
        image.preparedImageId=child.id;project.images.push(child);await persist('Đã lưu riêng ảnh gốc và ảnh Gemini nền trắng');
      }
      if(!await $('analyze').onclick())return {ok:false};
      const styles=[...new Set(project.images.filter(i=>i.confirmed&&!i.excluded).map(i=>i.styleId))];
      if(!styles.length)throw Error('Chưa có ảnh nào được chọn để dựng chữ.');
      let total=0;
      for(const id of styles){signal?.throwIfAborted();styleId=id;say('Đang dựng '+readableStyle(id)+' từ ảnh gốc…');if(!await $('trace').onclick())return {ok:false};if(!activeStyle().glyphs.length)continue;if(composeMissing&&!await $('compose').onclick())return {ok:false};if(!await $('proof-all').onclick())return {ok:false};total+=activeStyle().glyphs.length;}
      styleId=styles.includes(input.style)?input.style:styles.find(id=>project.styles.find(s=>s.id===id)?.glyphs.length)||styles[0];
      const style=activeStyle();if(!style.glyphs.length)throw Error('Ảnh đã lưu nhưng chưa tách được chữ đáng tin cậy. Cần ảnh rõ hơn; Xưởng chưa tạo font.');
      await persist('Đã dựng và kiểm '+total+' chữ trong '+styles.length+' kiểu; giữ bản nháp để bạn xem');
      await onResult?.(project,style);root.open=false;render();
      say('Bản nháp có '+style.glyphs.length+' chữ chưa duyệt cho '+readableStyle(styleId)+'. Bấm Đối chiếu chữ đã tách để kiểm đúng ký tự và đường nét. Chữ thiếu không được tự bịa.');
      return {ok:true,projectId:project.id};
    }catch(error){say(signal?.aborted?'Đã dừng. Ảnh và phần đã dựng vẫn được giữ.':error.message);return {ok:false};}
    finally{flowRunning=false;flowSignal=undefined;flowTarget=undefined;}
  }
  const restoration=(async()=>{try{await renderProjects();const id=localStorage.getItem('xuong-font-active-family');if(id){project=await loadFamilyProject(id);if(project)render();}}catch(error){say('Không mở được dự án đã lưu: '+error.message);}})();
  return {createFromCurrent,async reviewGlyph(char,metrics){await restoration;const matching=project?.styles.find(s=>s.glyphs.length&&s.weight===metrics?.weight&&s.italic===!!metrics?.italic)||project?.styles.find(s=>s.glyphs.length);if(matching)styleId=matching.id;if(!project||!activeStyle()?.glyphs.length){say('Chưa có chữ phục dựng trong bản font đang mở để đối chiếu.');return;}selectedChar=activeStyle().glyphs.some(g=>g.char===char)?char:activeStyle().glyphs[0].char;root.open=true;$('advanced').open=true;render();await showProof();$('proof-section').scrollIntoView({block:'start'});},open:()=>{root.open=true;root.scrollIntoView({block:'start'});},async refresh(){await renderProjects();}};
}
