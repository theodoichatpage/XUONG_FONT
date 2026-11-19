const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),tmp=path.join(root,'.qa');fs.mkdirSync(tmp,{recursive:true});
const {createCanvas,ImageData,Path2D,loadImage,GlobalFonts}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'@napi-rs/canvas'):'@napi-rs/canvas');
global.require=require;global.__dirname=tmp;global.ImageData=ImageData;global.Path2D=Path2D;
global.FontFace=class{constructor(family,bytes){this.family=family;this.bytes=bytes;}async load(){return this;}};
global.document={createElement:()=>createCanvas(1,1),fonts:{add:face=>{assert(GlobalFonts.register(Buffer.from(face.bytes),face.family));},delete:()=>{}}};
const bundle=(name,file)=>{const output=path.join(tmp,name+'.cjs');esbuild.buildSync({entryPoints:[path.join(root,file)],bundle:true,platform:'node',format:'cjs',outfile:output,external:['wawoff2','esm-potrace-wasm']});return require(output);};
const reference=bundle('fidelity-reference','site/reference-image.js');
const proof=bundle('fidelity-proof','site/reconstruction-proof.js').reconstructionProof;
const masks=bundle('fidelity-mask','site/reference-mask.js');
const {compareSilhouettes}=bundle('fidelity-metrics','site/reconstruction-metrics.js');
const {reuseReferenceComponents}=bundle('fidelity-components','site/reference-components.js');
const {canApproveProof,proofMetricVersion}=bundle('proof-approval','site/proof-approval.js');
const {buildTTF}=require('../src/assemble');
function blank(w,h,color='#fff'){const c=createCanvas(w,h),x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);return c;}
async function trace(c,box,char,settings){const mask=reference.wordInk(c,box,settings);return reference.traceSymbol(mask,box,char);}
function bytesFor(glyphs){return new Uint8Array(buildTTF('Fidelity test',glyphs,{weight:400}));}
(async()=>{
  assert.deepEqual([...masks.rgbaMask({width:2,height:1,data:Uint8Array.from([0,0,0,255,255,255,255,255])},{threshold:0})],[1,0]);
  assert.deepEqual([...masks.rgbaMask({width:2,height:1,data:Uint8Array.from([0,0,0,255,255,255,255,255])},{threshold:254,light:true})],[0,1]);
  const checked={version:2,processing:{threshold:0},proof:{metricVersion:proofMetricVersion,version:2,threshold:0,minIoU:.96,maxContourDistance:1,maxContourDeviation:4,vectorResult:{pass:true},fontResult:{pass:true}}};
  assert(canApproveProof(checked));assert(!canApproveProof({...checked,processing:{threshold:128}}));assert(!canApproveProof({...checked,proof:{...checked.proof,metricVersion:1}}));assert(!canApproveProof({...checked,version:3}));
  assert.throws(()=>compareSilhouettes(new Uint8Array(9),new Uint8Array(9),3,3,{minIoU:NaN}));
  const diagonal=new Uint8Array(49),shifted=new Uint8Array(49);diagonal[2*7+4]=1;shifted[3*7+3]=1;
  const d=compareSilhouettes(diagonal,shifted,7,7,{minIoU:0,maxAspectError:1,maxContourDistance:10});assert(Math.abs(d.contourMean-Math.SQRT2)<1e-5,'diagonal distance was anisotropic');
  const withSerif=new Uint8Array(400),lostSerif=new Uint8Array(400);for(let y=4;y<17;y++)for(let x=8;x<12;x++)withSerif[y*20+x]=lostSerif[y*20+x]=1;for(let x=2;x<18;x++)withSerif[16*20+x]=1;
  assert(compareSilhouettes(withSerif,lostSerif,20,20,{minIoU:0,maxContourDistance:10,maxAspectError:10,maxContourDeviation:2}).findings.some(f=>f.includes('cục bộ')));
  for(const light of [false,true]){
    const c=blank(100,120,light?'#000':'#fff'),x=c.getContext('2d');x.fillStyle=light?'#fff':'#000';x.fillRect(45,40,4,60);x.fillRect(44,20,6,6);x.fillRect(35,98,25,2);
    const g=reference.alignReferenceGlyphs([[await trace(c,{x0:0,y0:0,x1:100,y1:120},'i')]])[0];
    assert.equal(g.processing.threshold,0);assert.equal(g.processing.light,light);
    const r=await proof(c,g,bytesFor([g]),{threshold:g.processing.threshold});assert(r.vectorResult.iou>.95&&r.fontResult.iou>.95);
    const repeated=await trace(c,{x0:0,y0:0,x1:100,y1:120},'i',masks.retraceSettings(g,g.processing.threshold));assert.deepEqual(repeated.processing,g.processing,'retrace changed polarity/cutoff');
  }
  console.log('PASS: native threshold 0, light polarity, retrace parity, invalid options, diagonal distance, local serif loss and actual TTF rasterizer');
  const file=process.argv[2];if(!file){console.log('NOT TESTED: actual supplied lowercase reference image missing');return;}
  const image=await loadImage(file),canvas=createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);
  // Ground-truth crop annotations from the supplied “Ba tên Việt...” image, not OCR or invented glyphs.
  const annotations=[['ị',176,205],['c',480,526],['C',953,1001],['ă',1014,1064],['n',1067,1127],['N',1246,1321],['g',1324,1373],['u',1376,1430],['y',1433,1488],['H',1628,1686],['Đ',1840,1893],['ạ',1901,1947],['t',1949,1986]];
  const raw=[];for(const [char,x0,x1]of annotations)raw.push(await trace(canvas,{x0,y0:190,x1,y1:470},char));
  const glyphs=reference.alignReferenceGlyphs([raw]).map(g=>({...g,sourceImageId:'caption-reference',version:1,styleId:'Regular',weight:400}));
  const inferred=reuseReferenceComponents(new Map(glyphs.map(g=>[g.char,g])));assert.equal(inferred.length,1);assert.equal(inferred[0].char,'i');assert.equal(inferred[0].origin,'inferred');assert(inferred[0].inference.bodyUnchanged);glyphs.push(inferred[0]);
  assert.equal(reuseReferenceComponents(new Map(glyphs.map(g=>[g.char,g]))).length,0,'existing i was replaced');
  const bytes=bytesFor(glyphs),rows=[],sheet=blank(1100,glyphs.length*250),ctx=sheet.getContext('2d');
  for(const [index,g]of glyphs.entries()){
    const p=await proof(canvas,g,bytes,{threshold:g.processing.threshold,maxContourDeviation:4});
    rows.push({char:g.char,origin:g.origin,threshold:g.processing.threshold,vectorIoU:p.vectorResult.iou,fontIoU:p.fontResult.iou,inkRatio:p.fontResult.areaRatio,maxDeviation:p.fontResult.contourMax,pass:p.vectorResult.pass&&p.fontResult.pass,findings:p.fontResult.findings});
    ctx.fillStyle='#000';ctx.font='18px sans-serif';ctx.fillText(g.char+' · '+g.origin+' · native pixels / vector / TTF',15,index*250+22);for(const [column,part]of [p.original,p.vector,p.exported].entries())ctx.drawImage(part,column*360+10,index*250+35,330,205);
  }
  const i=rows.find(r=>r.char==='i');assert(i.vectorIoU>.95&&i.fontIoU>.95,'component i differs from actual reference pixels');
  fs.writeFileSync(path.join(root,'reports/lowercase-reference.png'),sheet.toBuffer('image/png'));
  fs.writeFileSync(path.join(tmp,'lowercase-results.json'),JSON.stringify(rows,null,2));
  const report='# Đối chiếu bổ sung: chữ thường và glyph i\n\nNguồn: ảnh “Ba tên Việt trên nền trắng(4).png” do người dùng cung cấp. Weight/Style không có nhãn để xác minh; 400 chỉ là metadata kiểm serialization, không phải kết luận đây là Regular hay ExtraLight.\n\n13 glyph được crop theo chú giải để kiểm contour trực tiếp. Chữ nhìn thấy là ị, không phải i. i được tạo bằng cách bỏ duy nhất contour dấu nặng rời của ị; giữ nguyên thân, chấm trên, advance và phép đặt. i luôn được đánh dấu inferred, không gọi là mẫu trực tiếp.\n\n| Glyph | Nguồn | Cutoff gốc | IoU vector | IoU TTF | Diện tích TTF/nguồn | Lệch contour lớn nhất | Qua ngưỡng |\n|---|---|---:|---:|---:|---:|---:|---|\n'+rows.map(r=>'| '+r.char+' | '+r.origin+' | '+r.threshold+' | '+r.vectorIoU.toFixed(4)+' | '+r.fontIoU.toFixed(4)+' | '+r.inkRatio.toFixed(4)+' | '+r.maxDeviation.toFixed(3)+' | '+(r.pass?'Có':'Chưa')+' |').join('\n')+'\n\n![Ảnh crop, vector và glyph từ TTF](lowercase-reference.png)\n\nĐo bằng hàm reconstructionProof dùng trong sản phẩm, với rasterizer font thực của @napi-rs/canvas trong harness Node (FontFace adapter). Không sử dụng font hệ thống thay thế. Chưa chạy lại giao diện/browser ở giai đoạn này. Crop được chú giải cho kiểm thử, không tuyên bố Gemini tự nhận diện đúng chúng.\n\nNgưỡng rà soát: IoU ≥0.96, contour trung bình ≤1 px soát, lệch cục bộ ≤4 px soát, tỷ lệ ≤2%, số lòng kín không đổi. Không chứng nhận serif, baseline quang học hay độ giống tuyệt đối. Chưa nghiệm thu đúng Style ExtraLight Roman vì nguồn không xác minh Weight.\n';
  fs.writeFileSync(path.join(root,'reports/lowercase-reference-2026-11-19.md'),report);console.log(JSON.stringify(rows,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
