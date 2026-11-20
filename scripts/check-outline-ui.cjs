// DOM adapter tests event/state/persistence wiring, not browser layout.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),esbuild=require('esbuild');
const tmp=path.resolve(__dirname,'../.qa');fs.mkdirSync(tmp,{recursive:true});
class Element{constructor(){this.style={};this.hidden=false;this.disabled=false;this.checked=true;this.value='1.5';this.children=[];this.attrs={};}setAttribute(k,v){this.attrs[k]=v;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}remove(){}getBBox(){return {x:0,y:0,width:500,height:700};}}
const ids=new Map();global.document={getElementById:id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);},createElementNS:()=>new Element(),body:new Element()};
esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../site/outline-cleanup-ui.js')],bundle:true,platform:'node',format:'cjs',outfile:path.join(tmp,'outline-ui.cjs')});
const {setupOutlineCleanup}=require(path.join(tmp,'outline-ui.cjs'));const $=id=>document.getElementById(id),pause=()=>new Promise(r=>setTimeout(r,30));
(async()=>{let current={char:'A',advance:510,d:'M20 0L20.3 350L20 700L120 700L120.2 350L120 0Z',version:2,approved:true,proof:{old:true}},commits=0,fail=false,repair=false;
const original=current;const ui=setupOutlineCleanup({getGlyph:()=>current,prepareGlyph:async glyph=>repair?{...glyph,borrowedJoin:'miter-v1'}:glyph,commit:async(old,next)=>{if(fail)throw Error('Storage failure');assert.equal(old,current);commits++;current=next;}});
ui.reset();$('outline-cleanup-open').onclick();await pause();assert(!$('outline-cleanup-apply').disabled);assert.equal(commits,0);assert.equal(current,original);
$('outline-cleanup-cancel').onclick();assert.equal(commits,0);assert($('outline-cleanup-panel').hidden);
$('outline-cleanup-open').onclick();await pause();await $('outline-cleanup-apply').onclick();assert.equal(commits,1);assert.equal(current.advance,510);assert.equal(current.approved,false);assert.equal(current.proof,undefined);assert.equal(current.outlineUndo.d,original.d);
// Simulate the JSON snapshot loaded on a later page load.
current=JSON.parse(JSON.stringify(current));ui.reset();assert(!$('outline-cleanup-undo').disabled);await $('outline-cleanup-undo').onclick();assert.equal(current.d,original.d);assert.equal(commits,2);
current={...current,locked:true};ui.reset();assert($('outline-cleanup-open').disabled);assert($('outline-cleanup-undo').disabled);
current={...current,locked:false};$('outline-cleanup-open').onclick();await pause();fail=true;await $('outline-cleanup-apply').onclick();assert.equal(commits,2);assert.equal(current.d,original.d);assert($('outline-cleanup-message').textContent.includes('Storage failure'));
fail=false;$('outline-cleanup-open').onclick();await pause();current={...current};await $('outline-cleanup-apply').onclick();assert.equal(commits,2,'stale preview wrote a changed glyph');
repair=true;$('outline-cleanup-open').onclick();await pause();await $('outline-cleanup-apply').onclick();assert.equal(current.borrowedJoin,'miter-v1');assert(current.outlineUndo);
console.log('PASS: preview/cancel do not commit; apply invalidates approval/proof; JSON reload preserves undo; lock/stale/storage-error guards');
})().catch(e=>{console.error(e);process.exitCode=1;});
