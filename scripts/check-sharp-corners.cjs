const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),tmp=path.join(root,'.qa');fs.mkdirSync(tmp,{recursive:true});
const build=(name,file,round=false)=>{const outfile=path.join(tmp,name+'.cjs');const input=round?{stdin:{contents:fs.readFileSync(path.join(root,file),'utf8').replace('JoinType.jtMiter','JoinType.jtRound'),resolveDir:path.dirname(path.join(root,file)),loader:'js'}}:{entryPoints:[path.join(root,file)]};esbuild.buildSync({...input,bundle:true,format:'cjs',platform:'node',outfile});return require(outfile);};
const borrow=build('sharp-borrow','site/borrow-glyphs.js');
const legacy=build('round-borrow','site/borrow-glyphs.js',true);
const {cleanOutline,sampleOutline}=build('sharp-clean','site/outline-cleanup.js');
const svgpath=require('svgpath');
const source={char:'A',advance:510,d:'M20 0L210 700L290 700L480 0L400 0L345 200L155 200L100 0Z M180 290L320 290L250 550Z'};
const style={name:'SemiBold',glyphs:[source]};
const rounded=legacy.adjustWeight(source,-12),fixed=borrow.adjustWeight(source,-12);assert(rounded&&fixed);assert.notEqual(rounded.d,fixed.d);
const old={...rounded,borrowedFrom:'SemiBold',weightShift:-12};const repaired=borrow.restoreBorrowedCorners(old,[style]);assert.equal(repaired.d,fixed.d);assert.equal(repaired.advance,old.advance);assert.equal(repaired.borrowedJoin,'miter-v1');assert.equal(old.d,rounded.d,'repair preview mutated old glyph');assert.equal(borrow.restoreBorrowedCorners(old,[]),null);assert.throws(()=>borrow.restoreBorrowedCorners({...old,locked:true},[style]),/khóa/);
for(const tolerance of [.75,1.5,3]){
 const result=cleanOutline(repaired,{tolerance});assert(result.stats.protectedCorners>=8);assert(!result.d.includes('C'),'polygonal A was rounded');
 const vertices=svgpath(repaired.d).abs().segments.filter(s=>s[0]==='M'||s[0]==='L').map(s=>s.slice(-2));
 const after=svgpath(result.d).abs().segments.filter(s=>s[0]==='M'||s[0]==='L').map(s=>s.slice(-2));
 for(const p of vertices)assert(after.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.0002),'exact source corner moved');
 assert.equal(sampleOutline(result.d).length,2);
}
// A rounded source stays rounded. No source-independent "sharpen every A" template.
const roundedRect={char:'O',advance:230,d:'M20 0L180 0Q200 0 200 20L200 180Q200 200 180 200L20 200Q0 200 0 180L0 20Q0 0 20 0Z'};
assert(/[CQ]/.test(cleanOutline(roundedRect).d));
const {createCanvas,Path2D}=require('@napi-rs/canvas'),canvas=createCanvas(900,470),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,900,470);
[source,rounded,fixed].forEach((g,i)=>{ctx.fillStyle='#000';ctx.font='14px sans-serif';ctx.fillText(['Donor outline','Legacy round join','Corrected corner join'][i],i*300+12,20);ctx.save();ctx.translate(i*300+10,445);ctx.scale(.58,-.58);ctx.fill(new Path2D(g.d));ctx.restore();});fs.writeFileSync(path.join(tmp,'sharp-corner-recovery.png'),canvas.toBuffer('image/png'));
console.log('PASS: reproduced old round-offset A; donor recovery with miter preserves all sharp vertices at all 3 strengths; counter/advance/lock/no-donor guards; deliberately rounded source stays curved');
