import opentype from 'opentype.js';
import { analyzeVietnameseCoverage } from './font-coverage.js';
export { analyzeVietnameseCoverage, vietnameseCheckCharacters } from './font-coverage.js';
import ClipperLib from 'clipper-lib';
import { familyStyles } from './family-styles.js';
const S = 32;
export const qualityProofs = {
  position:'ấ ầ ẩ ẫ ế ề ố ồ', collision:'Bất đồng', kerning:'Vì Kỳ Tù',
  'horn-spacing':'ƯT ƠT ưt ơt', 'horn-pair':'ƯƠ ươ', weight:'Tuổi đã buồn', harmony:'Hãy cố chờ',
  capitals:'ĐỂ GIÓ CUỐN ĐI', 'dotted-i':'Dĩ Chí Vì', 'acute-grave':'Á À á à',
  circumflex:'Â Ê Ô ấ ể ỗ', breve:'Ă ă ắ ẳ ẵ', horn:'Ơ Ư ơ ư', hook:'ả ẩ ể ỷ ?',
  tilde:'ũ ữ ỗ ỹ', underdot:'ạ ẹ ị ọ ụ ỵ', dyet:'D Đ d đ', dong:'20₫ 100₫'
};
const VOWELS='aăâeêioôơuưyAĂÂEÊIOÔƠUƯY';
const MARKS=['','\u0300','\u0301','\u0309','\u0303','\u0323'];
const required = [...new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789Đđ',
  ...[...VOWELS].flatMap(v=>MARKS.map(m=>(v+m).normalize('NFC')))])];
export function flattenQualityPath(path, shift=0) {
  const result=[]; let points, current, start;
  for(const c of path.commands){
    if(c.type==='M'){points=[];result.push(points);current=start={x:c.x+shift,y:c.y};points.push({X:Math.round(current.x*S),Y:Math.round(current.y*S)});continue;}
    if(c.type==='Z'){current=start;continue;}
    if(!points || !current)continue;
    const end={x:c.x+shift,y:c.y}, origin=current;
    const steps=c.type==='L'?1:24;
    for(let i=1;i<=steps;i++){
      const t=i/steps,u=1-t;let x=end.x,y=end.y;
      if(c.type==='Q'){x=u*u*origin.x+2*u*t*(c.x1+shift)+t*t*end.x;y=u*u*origin.y+2*u*t*c.y1+t*t*end.y;}
      if(c.type==='C'){x=u*u*u*origin.x+3*u*u*t*(c.x1+shift)+3*u*t*t*(c.x2+shift)+t*t*t*end.x;y=u*u*u*origin.y+3*u*u*t*c.y1+3*u*t*t*c.y2+t*t*t*end.y;}
      points.push({X:Math.round(x*S),Y:Math.round(y*S)});
    }current=end;
  }return result.filter(p=>p.length>=3);
}
function union(paths){return ClipperLib.Clipper.SimplifyPolygons(paths,ClipperLib.PolyFillType.pftNonZero);}
function box(poly){const xs=poly.map(p=>p.X/S),ys=poly.map(p=>p.Y/S);return{x1:Math.min(...xs),x2:Math.max(...xs),y1:Math.min(...ys),y2:Math.max(...ys)};}
function intersectionArea(a,b){
  const c=new ClipperLib.Clipper(),out=new ClipperLib.Paths();
  c.AddPaths(a,ClipperLib.PolyType.ptSubject,true);c.AddPaths(b,ClipperLib.PolyType.ptClip,true);
  c.Execute(ClipperLib.ClipType.ctIntersection,out,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
  return Math.abs(out.reduce((sum,p)=>sum+ClipperLib.Clipper.Area(p),0))/(S*S);
}
function pointSegment(p,a,b){const dx=b.X-a.X,dy=b.Y-a.Y;const t=Math.max(0,Math.min(1,((p.X-a.X)*dx+(p.Y-a.Y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.X-a.X-t*dx,p.Y-a.Y-t*dy)/S;}
function distance(a,b){
  let d=Infinity;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)d=Math.min(d,pointSegment(a[i],b[j],b[(j+1)%b.length]),pointSegment(b[j],a[i],a[(i+1)%a.length]));
  return d;
}
export async function assessFont(record,{minGap=16,hornTolerance=20}={}){
  const font=opentype.parse(await record.blob.arrayBuffer()), upm=font.unitsPerEm;
  const scale=1000/upm, findings=[], measured=[], cache=new Map();
  const add=(status,rule,chars,message,value)=>findings.push({status,rule,chars,message,...(value==null?{}:{value})});
  const has=char=>!!font.charToGlyphIndex(char);
  const polygons=char=>{if(!cache.has(char))cache.set(char,union(flattenQualityPath(font.charToGlyph(char).path)));return cache.get(char);};
  const coverage=analyzeVietnameseCoverage(font);
  const blank=coverage.entries.filter(item=>item.status==='blank');
  if(blank.length)add('fail','blank-glyph',blank.map(item=>item.char).join(' '),'Có mã trong cmap nhưng glyph không có đường nét.');
  const missing=required.filter(char=>!has(char));
  add(missing.length?'fail':'pass','coverage',missing.join(' '),missing.length?'Thiếu '+missing.length+' ký tự trong bộ chữ Việt và Latin cơ bản.':'Đủ '+required.length+' ký tự trong bộ thử chữ Việt và Latin.');
  const expected=familyStyles.find(item=>item.style===record.style);
  if(expected){const actualItalic=!!(font.tables.os2?.fsSelection&1);add(font.tables.os2?.usWeightClass===expected.weight&&actualItalic===expected.italic?'pass':'fail','metadata',record.style,'Metadata: weight '+font.tables.os2?.usWeightClass+', '+(actualItalic?'nghiêng':'đứng')+'.');}
  const over=[],invalid=[];
  for(let i=0;i<font.glyphs.length;i++){
    const g=font.glyphs.get(i),p=g.path;
    if(!Number.isFinite(g.advanceWidth)||g.advanceWidth<0||p.commands.some(c=>Object.entries(c).some(([k,v])=>k!=='type'&&typeof v==='number'&&!Number.isFinite(v))))invalid.push(g.name||'#'+i);
    if(p.commands.length){const b=p.getBoundingBox();if(b.y2>font.ascender+1||b.y1<font.descender-1)over.push(g.unicode?String.fromCodePoint(g.unicode):g.name||'#'+i);}
    if(i%100===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  add(invalid.length?'fail':'pass','outline',invalid.slice(0,20).join(' '),invalid.length?'Outline hoặc advance không hợp lệ.':'Không phát hiện tọa độ vô hạn hoặc advance âm trong các glyph đã đọc.');
  add(over.length?'warning':'pass','vertical',over.slice(0,30).join(' '),over.length?over.length+' glyph vượt ascender/descender; kiểm nguy cơ cắt dấu trong ứng dụng thực tế.':'Outline nằm trong ascender/descender đã khai báo.');
  const accented=required.filter(c=>[...c.normalize('NFD')].length>1&&has(c));
  let tested=0,unresolved=0;
  for(const char of accented){
    const [root,...marks]=char.normalize('NFD');if(!marks.some(m=>m!=='\u031b')||!has(root))continue;
    const basePolys=polygons(root).filter(p=>ClipperLib.Clipper.Orientation(p));
    if(!basePolys.length)continue;
    let bb=font.charToGlyph(root).getBoundingBox();
    if(root==='i'){const largest=basePolys.reduce((a,b)=>Math.abs(ClipperLib.Clipper.Area(a))>Math.abs(ClipperLib.Clipper.Area(b))?a:b);bb=box(largest);}
    const all=polygons(char),outer=all.filter(p=>ClipperLib.Clipper.Orientation(p));
    const candidates=outer.filter(p=>{const b=box(p);return b.y2-b.y1<(bb.y2-bb.y1)*.65&&(b.y1>=bb.y2-2/scale||b.y2<=bb.y1+2/scale);});
    const body=outer.filter(p=>!candidates.includes(p));
    if(!candidates.length||!body.length){unresolved++;continue;}
    tested++;
    const gap=Math.min(...candidates.flatMap(m=>body.map(b=>distance(m,b))))*scale;
    measured.push({char,gap:Math.round(gap*10)/10});
    if(gap<minGap)add('warning','mark-gap',char,'Khoảng gần nhất dấu–thân khoảng '+gap.toFixed(1)+' / 1000 em, dưới mức cảnh báo đã chọn.',Math.round(gap*10)/10);
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
      const d=distance(candidates[i],candidates[j])*scale;
      if(d<minGap)add('warning','mark-stack',char,'Hai contour dấu rời cách khoảng '+d.toFixed(1)+' / 1000 em; kiểm các tầng dấu.',Math.round(d*10)/10);
    }
    if(tested%20===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(tested)add('info','mark-measured','',tested+' chữ đo được dấu rời; '+unresolved+' chữ chưa tách được để đo.');
  else add('manual','mark-measured','','Chưa tách được dấu rời để đo; cần xem outline và các chữ gốc.');
  if(unresolved)add('manual','mark-joined','',unresolved+' chữ có thể có dấu dính thân, thiếu contour độc lập hoặc không phù hợp cách nhận diện hiện tại. Không kết luận tự động là lỗi.');
  const pairs=new Set();for(const text of Object.values(qualityProofs))for(let i=0;i<text.length-1;i++)if(text[i]!==' '&&text[i+1]!==' ')pairs.add(text.slice(i,i+2));
  let checkedPairs=0;
  for(const pair of pairs){const [a,b]=[...pair];if(!has(a)||!has(b))continue;const ga=font.charToGlyph(a),gb=font.charToGlyph(b);const shift=ga.advanceWidth+font.getKerningValue(ga,gb);
    const area=intersectionArea(polygons(a),union(flattenQualityPath(gb.path,shift)))*scale*scale;
    if(area>.5)add('warning','pair-collision',pair,'Hai outline chồng nét khoảng '+area.toFixed(1)+' đơn vị vuông trên UPM 1000; duyệt xem có chủ ý hay không.',Math.round(area*10)/10);
    checkedPairs++;
  }
  add('info','pair-count','',checkedPairs+' cặp trong bộ thử được kiểm giao outline; dùng glyph và kerning cơ bản, chưa thay thế shaping thực tế.');
  for(const pair of ['ƠƯ','ơư']){const [a,b]=[...pair];if(!has(a)||!has(b)){add('manual','horn-pair',pair,'Thiếu glyph để đối chiếu râu.');continue;}
    const d=Math.abs(font.charToGlyph(a).getBoundingBox().y2-font.charToGlyph(b).getBoundingBox().y2)*scale;
    add(d>hornTolerance?'warning':'info','horn-pair',pair,'Chênh đỉnh outline '+d.toFixed(1)+' / 1000 em. Đây là chỉ báo hình học; cần nhìn vị trí và hình râu thực tế.',Math.round(d*10)/10);
  }
  const combining=[...'\u0300\u0301\u0309\u0303\u0323\u0302\u0306\u031b'].filter(c=>!has(c));
  add('manual','nfd',combining.map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase()).join(' '),combining.length?'Thiếu '+combining.length+' mã dấu kết hợp trong cmap; chưa xác minh hiển thị NFD.':'Có mã dấu kết hợp; vẫn cần kiểm vị trí dấu và shaping NFD trong ứng dụng thực tế.');
  add('manual','optical','','Cần duyệt bằng mắt: hòa hợp nét, hình râu, hỏi/ngã, chấm i, độ rõ ở cỡ nhỏ, thiết kế Italic và hai dòng.');
  return {record,font,coverage,findings,measured,tested,checkedPairs,threshold:{minGap,hornTolerance},time:new Date().toISOString(),counts:{fail:findings.filter(f=>f.status==='fail').length,warning:findings.filter(f=>f.status==='warning').length,manual:findings.filter(f=>f.status==='manual').length}};
}
export function makeQualitySVG(font,text){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),group=document.createElementNS(ns,'g');
  const paths=[],missing=[];let x=0,previous;
  let top=font.ascender,bottom=font.descender;
  for(const char of text){if(char===' '&&!font.charToGlyphIndex(char)){x+=font.unitsPerEm*.3;previous=undefined;continue;}if(!font.charToGlyphIndex(char)&&char!==' '){missing.push(char);x+=font.unitsPerEm*.45;previous=undefined;continue;}
    const glyph=font.charToGlyph(char);if(previous)x+=font.getKerningValue(previous,glyph);
    if(glyph.path.commands.length){const path=document.createElementNS(ns,'path');path.setAttribute('d',glyph.path.toPathData(3));path.setAttribute('transform',`translate(${x},0)`);paths.push(path);const b=glyph.getBoundingBox();top=Math.max(top,b.y2);bottom=Math.min(bottom,b.y1);}
    x+=glyph.advanceWidth;previous=glyph;
  }
  const pad=font.unitsPerEm*.08;svg.setAttribute('viewBox',`${-pad} ${-top-pad} ${x+2*pad} ${top-bottom+2*pad}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Outline vector của font đang kiểm: '+text);
  group.setAttribute('transform','scale(1,-1)');group.append(...paths);svg.append(group);
  const cap=font.charToGlyphIndex('H') ? font.charToGlyph('H').getBoundingBox().y2 : font.ascender*.8;
  for(const [value,label]of [[0,'baseline'],[cap,'cap-height']]){const line=document.createElementNS(ns,'line');line.setAttribute('x1',0);line.setAttribute('x2',x);line.setAttribute('y1',-value);line.setAttribute('y2',-value);line.setAttribute('vector-effect','non-scaling-stroke');line.setAttribute('class','quality-guide');line.setAttribute('aria-label',label);svg.append(line);}
  return {svg,missing:[...new Set(missing)]};
}
