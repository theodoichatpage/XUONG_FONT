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
const direct=bundle('clean-direct','site/direct-reconstruction.js');
(async()=>{
const file=process.argv[2]||path.join(root,'tests/fixtures/co-tet-clean.png');
const image=await loadImage(file),canvas=blank(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);
assert.equal(canvas.width,1234);assert.equal(canvas.height,1274);assert(reference.isCleanReference(canvas));
const annotations=[['Cỗ Tết Hà Nội xưa đa',40,220],['dạng hương vị, màu',230,390],['sắc. Tùy từng điều',390,565],['kiện gia đình, mâm',580,737],['cỗ ngày Tết cũng được',740,912],['thực theo từng mức',930,1088],['độ khác nhau.',1100,1250]];
// Known line transcription/vertical annotations test local segmentation. They
// are not a claim that the live Gemini API recognized these regions correctly.
const lines=annotations.map(([text,y0,y1])=>({text,box:[y0/canvas.height*1000,0,y1/canvas.height*1000,1000]}));
const glyphs=await direct.traceDetectedWords(canvas,[],new AbortController().signal,undefined,{lines});
const unique=[...new Map(glyphs.map(g=>[g.char,g])).values()];assert(unique.length>=10);assert(unique.some(g=>g.char==='i'));assert(unique.some(g=>g.char==='C'));assert(unique.some(g=>g.char==='ộ'));
const bytes=bytesFor(unique),rows=[];fs.writeFileSync(path.join(tmp,'clean-font.ttf'),bytes);const reviewChars=['i','a','đ','C','T','H','N','ộ','ỗ','ư','o','u'];const sheet=blank(900,reviewChars.length*210),sx=sheet.getContext('2d');
for(const g of unique){const p=await proof(canvas,g,bytes,{threshold:g.processing.threshold});if(reviewChars.includes(g.char)){const row=reviewChars.indexOf(g.char);sx.fillStyle='#000';sx.font='18px sans-serif';sx.fillText(g.char+' — source / vector / TTF',10,row*210+20);[p.original,p.vector,p.exported].forEach((part,col)=>sx.drawImage(part,10+col*300,row*210+30,280,170));}
rows.push({char:g.char,vectorIoU:p.vectorResult.iou,fontIoU:p.fontResult.iou,inkRatio:p.fontResult.areaRatio,pass:p.vectorResult.pass&&p.fontResult.pass});}
const i=rows.find(r=>r.char==='i');assert(i.vectorIoU>.95&&i.fontIoU>.95,'actual direct i must survive vector/TTF export');
fs.writeFileSync(path.join(tmp,'clean-proof.png'),sheet.toBuffer('image/png'));
const passing=rows.filter(r=>r.pass);assert(passing.length>=10);
fs.writeFileSync(path.join(tmp,'clean-results.json'),JSON.stringify({rows,diagnostics:glyphs.diagnostics},null,2));
console.log(JSON.stringify({unique:unique.length,passing:passing.length,i,rows,diagnostics:glyphs.diagnostics},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
