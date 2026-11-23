const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temp=path.join(root,'.qa');fs.mkdirSync(temp,{recursive:true});
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const canvasLib=require(runtime?path.join(runtime,'@napi-rs/canvas'):'@napi-rs/canvas');
const {createCanvas,ImageData,Path2D,loadImage,GlobalFonts}=canvasLib;
// The browser WASM package has a Node-only require guard inside ESM.
global.require=require;global.__dirname=temp;
global.ImageData=ImageData;global.document={createElement:()=>createCanvas(1,1)};
const bundle=(name,entry)=>{const output=path.join(temp,name+'.cjs');require('esbuild').buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',outfile:output,external:['esm-potrace-wasm','wawoff2']});return require(output);};
const reference=bundle('reference',path.join(root,'site/reference-image.js'));
const metrics=bundle('metrics',path.join(root,'site/reconstruction-metrics.js'));
const projects=bundle('projects',path.join(root,'site/family-project.js'));
const {buildTTF}=require('../src/assemble');const opentype=require('opentype.js');
function mask(c){const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return Uint8Array.from({length:c.width*c.height},(_,i)=>data[i*4]<128?1:0);}
function drawPath(d,x,transform){x.save();x.setTransform(...transform);x.fillStyle='#000';x.fill(new Path2D(d));x.restore();}
function blank(w,h){const c=createCanvas(w,h),x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);return c;}
function proof(source,glyph,ttf,family){const crop=glyph.pixelCrop,pad=6,z=4,w=(crop.w+pad*2)*z,h=(crop.h+pad*2)*z;
const a=blank(w,h),b=blank(w,h),c=blank(w,h),ax=a.getContext('2d'),bx=b.getContext('2d'),cx=c.getContext('2d');ax.drawImage(source,crop.x,crop.y,crop.w,crop.h,pad*z,pad*z,crop.w*z,crop.h*z);
const p=glyph.placement,s=z/p.scale,x=pad*z-p.lsb*s,y=pad*z+(p.baseline-p.sourceY)*z;
drawPath(glyph.d,bx,[s,0,0,-s,x,y]);GlobalFonts.register(ttf,family);cx.font=(1000*s)+'px "'+family+'"';cx.textBaseline='alphabetic';cx.fillStyle='#000';cx.fillText(glyph.char,x,y);
return {a,b,c,vector:metrics.compareSilhouettes(mask(a),mask(b),w,h),font:metrics.compareSilhouettes(mask(a),mask(c),w,h)};}
(async()=>{
const project=projects.createFamilyProject('QA preservation');assert.equal(project.styles.length,18);assert.equal(new Set(project.styles.map(s=>s.id)).size,18);projects.validateProject(project);const legacy=projects.createFamilyProject('QA cũ');legacy.styles=legacy.styles.slice(0,16);projects.validateProject(legacy);assert.equal(legacy.styles.length,18);
const style=project.styles.find(s=>s.id==='ExtraLight');projects.replaceProjectGlyph(style,{char:'i',d:'M0 0L1 1Z',advance:10});style.glyphs[0].locked=true;assert.equal(projects.replaceProjectGlyph(style,{char:'i',d:'M0 0L5 1Z',advance:10}),false);assert.equal(style.glyphs[0].d,'M0 0L1 1Z');assert.equal(projects.styleStatus(style),'Cần bổ sung');
const empty=new Uint8Array(100);assert.equal(metrics.compareSilhouettes(empty,empty,10,10).pass,false);
const ring=new Uint8Array(100),solid=new Uint8Array(100);for(let y=2;y<8;y++)for(let x=2;x<8;x++){solid[y*10+x]=1;if(x===2||x===7||y===2||y===7)ring[y*10+x]=1;}assert.equal(metrics.compareSilhouettes(ring,solid,10,10).referenceHoles.count,1);assert.equal(metrics.compareSilhouettes(ring,solid,10,10).pass,false);
const synthetic=blank(100,120),sx=synthetic.getContext('2d');sx.fillStyle='#000';sx.fillRect(45,40,4,60);sx.fillRect(44,20,6,6);sx.fillRect(35,98,25,2);
const rect={x0:0,y0:0,x1:100,y1:120},ink=reference.wordInk(synthetic,rect);assert.equal(ink.ink.reduce((s,v)=>s+v,0),4*58+50+36,'threshold-only path changed pixel area');
const raw=await reference.traceSymbol(ink,rect,'i',rect),iGlyph=reference.alignReferenceGlyphs([[raw]])[0];const iBytes=buildTTF('Synthetic Thin i',[iGlyph],{weight:200}),iProof=proof(synthetic,iGlyph,iBytes,'QASyntheticThinI');assert(iProof.vector.iou>.95);assert(iProof.font.iou>.95);assert(Math.abs(iProof.font.areaRatio-1)<.05);assert.equal(opentype.parse(iBytes.buffer.slice(iBytes.byteOffset,iBytes.byteOffset+iBytes.byteLength)).tables.os2.usWeightClass,200);
console.log('PASS: 16 slots, locked glyph protection, incomplete status, blank-mask rejection, counter loss, thin-i raster/vector/TTF and weight 200');
const screenshot=process.argv[2];if(!screenshot){console.log('NOT TESTED: user image (pass screenshot path as argument); synthetic i is not the user font.');return;}
const image=await loadImage(screenshot),source=createCanvas(image.width,image.height);source.getContext('2d').drawImage(image,0,0);
const columns=[[67,94],[100,118],[123,157],[174,223],[227,243],[248,277],[281,311],[327,356],[359,392],[394,423],[441,473],[478,509]],chars=[...'GIAMIÊUPHÒĐẾ'];
const rawGlyphs=[];for(let index=0;index<columns.length;index++){const [x0,x1]=columns[index],char=chars[index],box={x0,y0:char==='U'?529:510,x1,y1:638};const m=reference.wordInk(source,box,{threshold:128,polarity:'dark'});rawGlyphs.push(await reference.traceSymbol(m,box,char));}
const glyphs=reference.alignReferenceGlyphs([rawGlyphs]);const unique=[...new Map(glyphs.map(g=>[g.char,g])).values()];assert(unique.length>=10);const ttf=buildTTF('QA User Reference',unique,{weight:400});const parsed=opentype.parse(ttf.buffer.slice(ttf.byteOffset,ttf.byteOffset+ttf.byteLength));
const rows=[];const sheet=createCanvas(1000,unique.length*240),sheetCtx=sheet.getContext('2d');sheetCtx.fillStyle='#fff';sheetCtx.fillRect(0,0,sheet.width,sheet.height);
const baselineEntry=process.argv[3];let oldReference;if(baselineEntry)oldReference=bundle('baseline',path.resolve(baselineEntry));
for(const [index,g]of unique.entries()){assert(parsed.charToGlyphIndex(g.char));assert(parsed.charToGlyph(g.char).path.commands.length);const result=proof(source,g,ttf,'QAUserReference');let oldIoU=null;
if(oldReference){const originalIndex=chars.indexOf(g.char),[x0,x1]=columns[originalIndex],box={x0,y0:g.char==='U'?529:510,x1,y1:638};const oldMask=oldReference.wordInk(source,box);const before=await oldReference.traceSymbol(oldMask,box,g.char);const beforeAligned=oldReference.alignReferenceGlyphs([[before]])[0];oldIoU=proof(source,{...beforeAligned,placement:g.placement,pixelCrop:g.pixelCrop},ttf,'QABefore').vector.iou;}
rows.push({char:g.char,beforeIoU:oldIoU,vectorIoU:result.vector.iou,fontIoU:result.font.iou,areaRatio:result.font.areaRatio,contourMean:result.font.contourMean,pass:result.vector.pass&&result.font.pass,findings:result.font.findings});
sheetCtx.fillStyle='#000';sheetCtx.font='16px sans-serif';sheetCtx.fillText(g.char+' · source / vector / exported TTF',10,index*240+20);for(const [col,c]of [result.a,result.b,result.c].entries())sheetCtx.drawImage(c,col*325,index*240+28,300,200);
g.sourceImageId='user-screenshot';g.styleId='Regular';g.weight=400;g.italic=false;g.version=1;g.proof={version:1,threshold:128,minIoU:.96,maxContourDistance:1,vectorResult:result.vector,fontResult:result.font};}
fs.writeFileSync(path.join(root,'reports/reconstruction-reference.png'),sheet.toBuffer('image/png'));
fs.writeFileSync(path.join(temp,'reference.ttf'),ttf);
for(const slot of project.styles)slot.glyphs=[];project.name='QA ảnh serif — weight chưa xác minh';project.styles.find(s=>s.id==='Regular').glyphs=unique;
project.images=[{id:'user-screenshot',name:'Ảnh chụp giao diện do người dùng cung cấp — không xác minh weight',styleId:'Regular',confirmed:false,data:'data:image/png;base64,'+fs.readFileSync(screenshot).toString('base64')}];
fs.writeFileSync('/workspace/shared/font-qa/reference-project.json',JSON.stringify(project));
const report='# Kiểm thử phục dựng từ ảnh thật\n\nNguồn: ảnh chụp giao diện người dùng gửi (1903 × 1008), vùng chữ GIA MIÊU PHÒ ĐẾ. Các vùng glyph được chú giải thủ công cho kiểm thử; không phải kết quả phân loại Gemini. Weight và Style gốc chưa được xác minh. Không có chữ i thường ExtraLight để nghiệm thu.\n\nPipeline: threshold 128 → Potrace WASM, alphamax 0.35, opticurve 0 → một scale đồng nhất → svg2ttf → đọc cmap → render bằng rasterizer font thực. Không dilation/erosion, không AI vẽ lại.\n\n| Glyph | IoU vector trước | IoU vector sau | IoU TTF | Diện tích TTF/nguồn | Contour TB (px ở 4×) | Qua ngưỡng rà soát |\n|---|---:|---:|---:|---:|---:|---|\n'+rows.map(r=>'| '+r.char+' | '+(r.beforeIoU==null?'chưa kiểm':r.beforeIoU.toFixed(4))+' | '+r.vectorIoU.toFixed(4)+' | '+r.fontIoU.toFixed(4)+' | '+r.areaRatio.toFixed(4)+' | '+r.contourMean.toFixed(3)+' | '+(r.pass?'Có':'Chưa')+' |').join('\n')+'\n\nNgưỡng do Xưởng chọn: IoU ≥ 0.96, contour TB ≤ 1 pixel ở 4×, sai tỷ lệ ≤ 2%, số lòng kín không đổi. Không phải chứng nhận thẩm mỹ hay giống 100%.\n\n![Ảnh gốc, vector và glyph xuất TTF](reconstruction-reference.png)\n\nKiểm i: fixture tổng hợp với thân 4 pixel và chân 2 pixel, weight metadata 200; IoU vector '+iProof.vector.iou.toFixed(4)+', IoU TTF '+iProof.font.iou.toFixed(4)+'. Fixture này chỉ kiểm hồi quy giữ nét mảnh, không đại diện cho i gốc của người dùng.\n\nCác mục chưa đạt ngưỡng vẫn là needs-review. Serif, vị trí dấu và baseline quang học chưa được xác nhận tự động. Không nghiệm thu ExtraLight Roman từ ảnh này.\n';
fs.writeFileSync(path.join(root,'reports/reconstruction-2026-11-19.md'),report);console.log(JSON.stringify(rows,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
