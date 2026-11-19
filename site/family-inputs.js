import {familyStyles} from './family-styles.js';
const aliases=[['ultra[\\s_-]*light','ExtraLight'],['extra[\\s_-]*light','ExtraLight'],['extra[\\s_-]*bold','ExtraBold'],['ultra[\\s_-]*bold','ExtraBold'],['semi[\\s_-]*bold','SemiBold'],['demi[\\s_-]*bold','SemiBold'],['regular','Regular'],['medium','Medium'],['light','Light'],['bold','Bold'],['black','Black'],['heavy','Black']];
export function parseFamilyInput(value){
  const original=String(value||'').trim();if(!original)throw Error('Nhập tên bộ font ở thanh trên.');
  let family=original,italic=false,explicit=false,weightName;
  if(/(?:[\s_-]+)(italic|oblique)$/i.test(family)){italic=true;explicit=true;family=family.replace(/(?:[\s_-]+)(italic|oblique)$/i,'').trim();}
  for(const [pattern,name]of aliases){const expression=new RegExp('(?:[\\s_-]+)'+pattern+'$','i');if(expression.test(family)){weightName=name;explicit=true;family=family.replace(expression,'').trim();break;}}
  return {name:original,family:family||original,style:explicit?(weightName||'Regular')+(italic?' Italic':''):null};
}
export function resolveNamedStyle(analysis,target){
  // A user-entered style is evidence, but never overrides conflicting image evidence.
  if(target&&analysis.style===target&&analysis.basis!=='uncertain'&&analysis.confidence>=.65)return {styleId:target,confirmed:true,confirmation:'user-name-and-image'};
  if(target&&analysis.style&&analysis.style!==target)return {styleId:analysis.style,confirmed:false,confirmation:'name-image-conflict'};
  return {styleId:analysis.style||target||'',confirmed:!analysis.needsConfirmation,confirmation:analysis.needsConfirmation?'pending':'image-label'};
}
export function readableStyle(id){
  const found=familyStyles.find(s=>s.style===id);if(!found)return 'Chưa xác định kiểu chữ';
  const names={ExtraLight:'Rất mảnh',Light:'Mảnh',Regular:'Thông thường',Medium:'Vừa',SemiBold:'Hơi đậm',Bold:'Đậm',ExtraBold:'Rất đậm',Black:'Đậm nhất'};
  return names[found.name]+' · '+(found.italic?'chữ nghiêng':'chữ đứng')+' ('+id+')';
}
export async function digestReference(blob){
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
