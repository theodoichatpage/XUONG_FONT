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
for(const glyph of [a,o]){const before=glyph.d;const result=cleanOutline(glyph);assert.equal(glyph.d,before,'preview mutated original');assert(result.stats.after<result.stats.before/3);assert(result.stats.maxDeviation<=(glyph.char==='A'?2:5));assert.equal(sampleOutline(result.d).length,2);assert(result.d.includes('C')||glyph.char==='A');assert(Math.abs(result.stats.areaChange)<=.02);results.push({glyph,result});}
// Cạnh thẳng của A thành đúng các đoạn L, O không bị bẻ thành cạnh thẳng.
assert.equal(results[0].result.stats.lines,11,'A edges');assert.equal(results[0].result.stats.corners,11,'A corners');assert.equal(results[1].result.stats.lines,0,'O must stay curved');
// Góc bị bo khi dò ảnh (bán kính 16) và cạnh gồ ghề ±3 đơn vị: nắn thẳng và dựng lại góc nhọn tại giao điểm hai cạnh.
function rounded(poly,r){const pts=[],n=poly.length;for(let i=0;i<n;i++){const A=poly[(i-1+n)%n],B=poly[i],C=poly[(i+1)%n],u=[A[0]-B[0],A[1]-B[1]],v=[C[0]-B[0],C[1]-B[1]],lu=Math.hypot(...u),lv=Math.hypot(...v),ua=[u[0]/lu,u[1]/lu],va=[v[0]/lv,v[1]/lv],t=Math.min(r/Math.tan(Math.acos(ua[0]*va[0]+ua[1]*va[1])/2),lu/3,lv/3),p0=[B[0]+ua[0]*t,B[1]+ua[1]*t],p1=[B[0]+va[0]*t,B[1]+va[1]*t];for(let k=0;k<=8;k++){const s=k/8,q=1-s;pts.push([q*q*p0[0]+2*q*s*B[0]+s*s*p1[0],q*q*p0[1]+2*q*s*B[1]+s*s*p1[1]]);}}return pts;}
function rough(p,amp){const q=[];let carry=0,k=0;for(let i=0;i<p.length;i++){const A=p[i],B=p[(i+1)%p.length],len=Math.hypot(B[0]-A[0],B[1]-A[1]);if(!len)continue;let s=carry;while(s<len){const e=amp*Math.sin(k*.9)*Math.cos(k*.23);k++;q.push([A[0]+(B[0]-A[0])*s/len-(B[1]-A[1])/len*e,A[1]+(B[1]-A[1])*s/len+(B[0]-A[0])/len*e]);s+=3;}carry=s-len;}return q;}
const roundA={char:'A',advance:510,d:polygon(rough(rounded(outerA,16),3))+polygon(rough(rounded(innerA,16),3))};
for(const level of [.75,1.5,3]){const r=cleanOutline(roundA,{tolerance:level}),pts=sampleOutline(r.d);assert.equal(r.stats.lines,11,'rounded A edges '+level);assert.equal(r.stats.corners,11,'rounded A corners '+level);
  for(const corner of [...outerA,...innerA])assert(pts.some(c=>c.some(p=>Math.hypot(p[0]-corner[0],p[1]-corner[1])<4)),'corner not sharpened at '+corner+' level '+level);}
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
console.log('PASS: jittered A/O, rounded+rough A gets straight edges and sharp corners at every level, O stays curved, sharp A corner, counter/winding, bounded deviation/area, nonmutation, locked/open/invalid rejection, real TTF raster/cmap/advance');
console.log(JSON.stringify(results.map(({glyph,result})=>({char:glyph.char,...result.stats})),null,2));
