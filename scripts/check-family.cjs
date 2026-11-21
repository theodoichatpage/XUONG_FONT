const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),svg2ttf=require('svg2ttf'),opentype=require('opentype.js');
const dir=path.join(__dirname,'../.qa');fs.mkdirSync(dir,{recursive:true});
function moduleFor(name,file){const output=path.join(dir,name+'.cjs');esbuild.buildSync({entryPoints:[path.join(__dirname,'..',file)],bundle:true,platform:'node',format:'cjs',outfile:output,external:['wawoff2','esm-potrace-wasm'],inject:[path.join(__dirname,'lib','dom-bbox-shim.mjs')]});return require(output);}
const {familyPreflight,missingFamilyStyles}=moduleFor('family-validation','site/family-validation.js');
const {createFontFamily}=moduleFor('family-generator','site/font-family.js');
const {vietnameseCheckCharacters}=moduleFor('coverage','site/font-coverage.js');
const {importFontFile}=moduleFor('import','site/font-import.js');
const {applyStyleMetadata}=require('../src/font-style-metadata');
function fixture({missing='',blank='',hole=false}={}){const chars=[...new Set([...vietnameseCheckCharacters,...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'])].filter(c=>c!==missing);const shape=hole?'M0 0H100V700H0Z M45 100V600H55V100Z':'M0 0H200V700H0Z';const xml='<svg xmlns="http://www.w3.org/2000/svg"><defs><font id="Fixture"><font-face font-family="Fixture" units-per-em="1000" ascent="1000" descent="-250"/><missing-glyph/>'+chars.map(c=>'<glyph unicode="&#'+c.codePointAt(0)+';" horiz-adv-x="260" d="'+(c===blank?'':shape)+'"/>').join('')+'</font></defs></svg>';return applyStyleMetadata(svg2ttf(xml).buffer,{weight:400});}
const parse=b=>opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
(async()=>{
assert(familyPreflight(parse(fixture())).ready);assert(!familyPreflight(parse(fixture({missing:'Đ'}))).ready);assert(!familyPreflight(parse(fixture({blank:'ệ'}))).ready);assert(!familyPreflight(parse(fixture()),{baseWeight:200}).ready);assert.deepEqual(missingFamilyStyles(['Bold','Regular','Bold'],['Regular']),['Bold']);
const original=fixture();let results=[];const record={name:'Fixture',family:'Fixture',blob:new Blob([original])};await createFontFamily(record,['Regular','Bold'],'proof',r=>results.push(r),{baseWeight:400,existingStyles:['Regular','Bold']});assert.equal(results.length,0,'occupied slots were overwritten');
await assert.rejects(createFontFamily({...record,fromImages:true},['Bold'],'',()=>{},{}),/ảnh riêng/);
await assert.rejects(createFontFamily({...record,blob:new Blob([fixture({missing:'Đ'})])},['Bold'],'',()=>{},{baseWeight:400}),/Đ/);
results=[];await createFontFamily(record,['Bold'],'',r=>results.push(r),{baseWeight:400});assert.equal(results.length,1);const exported=parse(new Uint8Array(await results[0].blob.arrayBuffer()));assert.equal(exported.tables.os2.usWeightClass,700);assert(exported.charToGlyph('Đ').path.commands.length);assert.equal(results[0].draft,true);
await assert.rejects(createFontFamily({...record,blob:new Blob([fixture({hole:true})])},['Black'],'',()=>{},{baseWeight:400}),/lòng chữ/);
const imported=await importFontFile(record);assert(imported.glyphs.has('Đ'));assert(imported.glyphs.has('đ'));assert.equal(imported.styleMetrics.weight,400);
const {validateFamilyAnalysis}=await import('../src/family-analysis.mjs');const base={style:'ExtraLight',confidence:.95,basis:'visual',evidence:'Nét mảnh, không có nhãn',profile:{},words:[{text:'i',box:[0,0,1000,1000]}]};assert(validateFamilyAnalysis(base).needsConfirmation);assert(!validateFamilyAnalysis({...base,basis:'label'}).needsConfirmation);assert.throws(()=>validateFamilyAnalysis({...base,style:'Invented'}));
const {validateRepairDecisions}=await import('../src/repair-plan.mjs');assert.throws(()=>validateRepairDecisions({decisions:[{char:'A',action:'approve',reason:'ok'}]},[{char:'i'}]));
const {POST}=await import('../api/glyph-review.mjs');let calls=0;const realFetch=global.fetch;global.fetch=async(url,opts)=>{calls++;const request=JSON.parse(opts.body);assert(request.systemInstruction.parts[0].text.includes('top,left,bottom,right'));assert(!JSON.stringify(request).includes('AIza'));return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({...base,basis:'visual'})}]}}]});};
const request=data=>new Request('http://localhost/api/glyph-review',{method:'POST',headers:{'Content-Type':'application/json','x-gemini-key':'test-only'},body:JSON.stringify(data)});
let response=await POST(request({mode:'family-analysis',image:'/9j/'}));assert.equal(response.status,200);assert((await response.json()).needsConfirmation);response=await POST(request({mode:'family-analysis',image:'not-image'}));assert.equal(response.status,400);assert.equal(calls,1);global.fetch=realFetch;
console.log('PASS: missing/blank Đ, weight mismatch, occupied-slot protection, image-family offset block, output cmap/weight, lost-counter rejection, import, AI confidence/response validation and mocked API route');
})().catch(e=>{console.error(e);process.exitCode=1});
