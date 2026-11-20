const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const {createCanvas,Path2D,GlobalFonts}=require('@napi-rs/canvas');
const tmp=path.resolve(__dirname,'../.qa');fs.mkdirSync(tmp,{recursive:true});
esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../site/outline-cleanup.js')],bundle:true,platform:'node',format:'cjs',outfile:path.join(tmp,'outline-cleanup.cjs')});
const {cleanOutline,sampleOutline}=require(path.join(tmp,'outline-cleanup.cjs'));
function polygon(p){return 'M'+p.map(v=>v.join(' ')).join('L')+'Z';}
function jitter(p){const q=[];p.forEach((a,i)=>{const b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),n=Math.ceil(len/3);for(let j=0;j<n;j++){const noise=j&&j<n-2?.6*Math.sin(j*1.7):0;q.push([a[0]+dx*j/n-dy/len*noise,a[1]+dy*j/n+dx/len*noise]);}});return q;}
const outerA=[[20,0],[210,700],[290,700],[480,0],[400,0],[345,200],[155,200],[100,0]],innerA=[[180,290],[320,290],[250,550]];
const a={char:'A',advance:510,d:polygon(jitter(outerA))+polygon(jitter(innerA))};
function loop(rx,ry,reverse=false){const p=[];for(let i=0;i<400;i++){const t=(reverse?-1:1)*i/400*Math.PI*2,r=.6*Math.sin(i*1.7);p.push([250+(rx+r)*Math.cos(t)+3*Math.sin(3*t),350+(ry+r)*Math.sin(t)]);}return p;}
const o={char:'O',advance:520,d:polygon(loop(240,350))+polygon(loop(165,270,true))};
const results=[];
for(const glyph of [a,o]){const before=glyph.d;const result=cleanOutline(glyph);assert.equal(glyph.d,before,'preview mutated original');assert(result.stats.after<result.stats.before/3);assert(result.stats.maxDeviation<=1.7);assert.equal(sampleOutline(result.d).length,2);assert(result.d.includes('C')||glyph.char==='A');assert(Math.abs(result.stats.areaChange)<=.02);results.push({glyph,result});}
const ap=sampleOutline(results[0].result.d);assert(ap[0].some(p=>Math.hypot(p[0]-20,p[1])<1),'A corner lost');
assert.throws(()=>cleanOutline({...a,locked:true}),/khóa/);assert.throws(()=>cleanOutline({...a,d:'M0 0L10 10'}),/khép kín/);assert.throws(()=>cleanOutline(a,{tolerance:NaN}));
const {buildTTF}=require('../src/assemble');const opentype=require('opentype.js');
const bytes=buildTTF('Outline cleanup test',results.map(({glyph,result})=>({...glyph,d:result.d})),{weight:600});
const font=opentype.parse(new Uint8Array(bytes).buffer);assert(font.charToGlyphIndex('A'));assert(font.charToGlyphIndex('O'));assert.equal(font.charToGlyph('A').advanceWidth,a.advance);
assert(GlobalFonts.register(Buffer.from(bytes),'Cleanup test'));
const canvas=createCanvas(1000,900),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1000,900);ctx.fillStyle='#111';ctx.font='14px sans-serif';['Original','Cleaned','Actual TTF'].forEach((t,i)=>ctx.fillText(t,15+i*330,16));
results.forEach(({glyph,result},row)=>{
 [glyph.d,result.d].forEach((d,col)=>{ctx.save();ctx.translate(15+col*330,410+row*440);ctx.scale(.55,-.55);ctx.fillStyle='#000';ctx.fill(new Path2D(d));ctx.restore();});
 ctx.font='550px "Cleanup test"';ctx.fillStyle='#000';ctx.fillText(glyph.char,675,410+row*440);
 const vector=createCanvas(530,750),render=createCanvas(530,750),v=vector.getContext('2d'),r=render.getContext('2d');v.translate(10,720);v.scale(1,-1);v.fill(new Path2D(result.d));r.font='1000px "Cleanup test"';r.fillText(glyph.char,10,720);
 const vp=v.getImageData(0,0,530,750).data,rp=r.getImageData(0,0,530,750).data;let both=0,either=0;for(let i=3;i<vp.length;i+=4){if(vp[i]>127||rp[i]>127)either++;if(vp[i]>127&&rp[i]>127)both++;}assert(both/either>.97,'TTF raster differs from cleaned path');
});
fs.writeFileSync(path.join(tmp,'outline-cleanup-before-after.png'),canvas.toBuffer('image/png'));
console.log('PASS: jittered A/O, sharp A corner, counter/winding, bounded deviation/area, nonmutation, locked/open/invalid rejection, real TTF raster/cmap/advance');
console.log(JSON.stringify(results.map(({glyph,result})=>({char:glyph.char,...result.stats})),null,2));
