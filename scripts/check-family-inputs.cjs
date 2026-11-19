const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const temp=path.join(__dirname,'../.qa');fs.mkdirSync(temp,{recursive:true});const out=path.join(temp,'family-inputs.cjs');require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../site/family-inputs.js')],bundle:true,platform:'node',format:'cjs',outfile:out});
const {parseFamilyInput,resolveNamedStyle,readableStyle,digestReference}=require(out);
(async()=>{
assert.deepEqual(parseFamilyInput('XFVN Migra ExtraLight'),{name:'XFVN Migra ExtraLight',family:'XFVN Migra',style:'ExtraLight'});
assert.equal(parseFamilyInput('Sử Việt Kiêu Hùng').style,null);
assert.equal(parseFamilyInput('XFVN Migra Ultra Light Italic').family,'XFVN Migra');assert.equal(parseFamilyInput('XFVN Migra Ultra Light Italic').style,'ExtraLight Italic');
assert.equal(parseFamilyInput('UTM Bebas Semi Bold').style,'SemiBold');assert.equal(parseFamilyInput('UTM Bebas ExtraBold').style,'ExtraBold');assert.throws(()=>parseFamilyInput(' '));
const image={style:'ExtraLight',confidence:.8,basis:'visual',needsConfirmation:true};assert(resolveNamedStyle(image,'ExtraLight').confirmed);assert(!resolveNamedStyle(image,null).confirmed);
assert(!resolveNamedStyle({...image,style:'Bold',basis:'label',needsConfirmation:false},'ExtraLight').confirmed,'conflicting style was silently accepted');
assert(!resolveNamedStyle({...image,basis:'uncertain'},'ExtraLight').confirmed);assert(!resolveNamedStyle({...image,confidence:.2},'ExtraLight').confirmed);
assert(readableStyle('ExtraLight').includes('Rất mảnh'));assert(readableStyle('Bold Italic').includes('chữ nghiêng'));
assert.equal(await digestReference(new Blob(['same'])),await digestReference(new Blob(['same'])));assert.notEqual(await digestReference(new Blob(['same'])),await digestReference(new Blob(['different'])));
console.log('PASS: one name produces family/style, aliases and Vietnamese names, ambiguous/conflicting images stay pending, stable source digest for resume');
})().catch(e=>{console.error(e);process.exitCode=1});
