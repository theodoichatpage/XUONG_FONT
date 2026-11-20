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
const {cleanOutline}=bundle('actual-sharp-clean','site/outline-cleanup.js');
(async()=>{
 const image=await loadImage(process.argv[2]||path.join(root,'tests/fixtures/bebas-reference.png')),canvas=blank(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);
 assert.equal(image.width,600);assert.equal(image.height,239);
 // Annotated A region from the user's actual BEBAS reference, not a system font.
 const raw=reference.alignReferenceGlyphs([[await trace(canvas,{x0:365,y0:20,x1:481,y1:228},'A')]])[0];
 const cleaned=cleanOutline(raw);assert(cleaned.stats.protectedCorners>=3);const g={...raw,d:cleaned.d};
 const p=await proof(canvas,g,bytesFor([g]),{threshold:g.processing.threshold});assert(p.fontResult.iou>.95);
 const sheet=blank(1000,420),ctx=sheet.getContext('2d');for(const [i,part]of [p.original,p.vector,p.exported].entries())ctx.drawImage(part,10+i*330,30,310,370);
 fs.writeFileSync(path.join(tmp,'actual-bebas-corners.png'),sheet.toBuffer('image/png'));console.log(JSON.stringify({stats:cleaned.stats,fontIoU:p.fontResult.iou,holes:p.fontResult.candidateHoles.count,findings:p.fontResult.findings},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
