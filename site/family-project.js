import { familyStyles } from './family-styles.js';
import { charset } from './vietnamese.js';

export const projectFormat='xuong-font-family-v1';
export function createFamilyProject(name) {
  const now=new Date().toISOString();
  return {format:projectFormat,id:crypto.randomUUID(),name:name.trim()||'Family mới',version:1,createdAt:now,updatedAt:now,images:[],
    styles:familyStyles.map(({style,weight,italic})=>({id:style,name:style,weight,italic,glyphs:[],profile:{},status:'Chưa dựng',history:[]})),history:[]};
}
export function styleStatus(style) {
  if(!style.glyphs.length)return 'Chưa dựng';
  if(charset.some(char=>!style.glyphs.some(g=>g.char===char&&g.d)))return 'Cần bổ sung';
  if(style.glyphs.some(g=>!g.approved)||!style.verification?.rendering)return 'Chờ kiểm tra';
  return style.verification?.technical ? 'Hoàn thiện' : 'Chờ kiểm tra';
}
export function replaceProjectGlyph(style,glyph,{unlock=false}={}) {
  const previous=style.glyphs.find(g=>g.char===glyph.char);
  if(previous?.locked&&!unlock)return false;
  const history=previous ? [...(previous.history||[]),{...previous,history:undefined}].slice(-10) : [];
  const next={...glyph,approved:false,locked:false,version:(previous?.version||0)+1,history};
  style.glyphs=style.glyphs.filter(g=>g.char!==glyph.char).concat(next); style.verification=undefined;style.status=styleStatus(style);return true;
}
export function validateProject(project) {
  // Mẫu family nay có 18 vị trí (9 độ đậm × đứng/nghiêng). Dự án lưu theo mẫu 16 vị trí cũ được bổ sung vị trí còn thiếu
  // thay vì báo "không hợp lệ" (lỗi cũ: mọi dự án mới bị chặn vì vẫn so với 16).
  if(Array.isArray(project?.styles))for(const {style,weight,italic} of familyStyles)if(!project.styles.some(s=>s.id===style))project.styles.push({id:style,name:style,weight,italic,glyphs:[],profile:{},status:'Chưa dựng',history:[]});
  if(project?.format!==projectFormat||typeof project.name!=='string'||project.name.length>100||!Array.isArray(project.styles)||project.styles.length!==familyStyles.length||!Array.isArray(project.images)||project.images.length>100)throw Error('Dự án Family không hợp lệ.');
  const slots=new Set();
  for(const style of project.styles){
    const expected=familyStyles.find(s=>s.style===style.id);
    if(!expected||slots.has(style.id)||style.weight!==expected.weight||style.italic!==expected.italic||!Array.isArray(style.glyphs)||style.glyphs.length>5000)throw Error('Style trong dự án không hợp lệ.');
    slots.add(style.id);
    for(const glyph of style.glyphs)if(typeof glyph.char!=='string'||[...glyph.char].length!==1||typeof glyph.d!=='string'||glyph.d.length>2_000_000||!Number.isFinite(glyph.advance))throw Error('Glyph trong dự án không hợp lệ.');
  }
  return project;
}

let database;
function open(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open('xuong-font-family-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('families',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=undefined;reject(r.error);};});}
async function transaction(mode,action){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('families',mode),r=action(tx.objectStore('families'));tx.oncomplete=()=>resolve(r.result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('Không lưu được Family.'));});}
export const listFamilyProjects=()=>transaction('readonly',store=>store.getAll());
export const loadFamilyProject=id=>transaction('readonly',store=>store.get(id));
export function saveFamilyProject(project){validateProject(project);project.updatedAt=new Date().toISOString();return transaction('readwrite',store=>store.put(project));}

function blobData(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
export async function backupFamilyProject(project){return JSON.stringify({...project,images:await Promise.all(project.images.map(async image=>({...image,blob:undefined,data:await blobData(image.blob)})))});}
export async function restoreFamilyProject(text){
  const project=validateProject(JSON.parse(text));
  let total=0;
  for(const image of project.images){
    if(typeof image.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image.data)||image.data.length>21_000_000)throw Error('Ảnh backup không hợp lệ.');
    total+=image.data.length;if(total>130_000_000)throw Error('Backup quá lớn.');
    const [header,content]=image.data.split(',');const binary=atob(content);
    image.blob=new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:header.slice(5,header.indexOf(';'))});delete image.data;
  }
  // Import as a new project; never overwrite a browser's existing work.
  project.id=crypto.randomUUID();project.name+=' (khôi phục)';return project;
}
