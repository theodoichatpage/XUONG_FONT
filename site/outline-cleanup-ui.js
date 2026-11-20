import {cleanOutline} from './outline-cleanup.js';
import {glyphBounds} from './glyph-review.js';
const ns='http://www.w3.org/2000/svg';
export function setupOutlineCleanup({getGlyph,commit,prepareGlyph}){
  const $=id=>document.getElementById(id);let candidate,original,running=false,turn=0;
  function flags(){const g=getGlyph();$('outline-cleanup-open').hidden=!g;$('outline-cleanup-open').disabled=!!g?.locked;$('outline-cleanup-open').title=g?.locked?'Chữ đã khóa; mở khóa trước khi chỉnh outline':'Xem trước nắn cạnh thẳng và làm mượt đường cong';$('outline-cleanup-apply').disabled=!candidate||running;$('outline-cleanup-undo').disabled=!g?.outlineUndo||!!g?.locked||running;}
  function reset(){turn++;candidate=original=undefined;$('outline-cleanup-before').replaceChildren();$('outline-cleanup-after').replaceChildren();$('outline-cleanup-overlay').replaceChildren();$('outline-cleanup-panel').hidden=true;$('outline-cleanup-message').textContent='';flags();}
  function picture(paths,box){const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',[box.x-10,-box.y-box.height-10,box.width+20,box.height+20].join(' '));for(const [d,color,opacity]of paths){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('transform','scale(1 -1)');path.setAttribute('fill',color);if(opacity)path.setAttribute('opacity',opacity);svg.append(path);}return svg;}
  function preview(){
    if(running)return;const glyph=getGlyph();if(!glyph)return;
    candidate=undefined;original=glyph;$('outline-cleanup-panel').hidden=false;$('viewer-scroll').hidden=true;$('ai-review').hidden=true;
    $('outline-cleanup-message').textContent='Đang nắn outline…';flags();const generation=++turn;
    setTimeout(async()=>{if(generation!==turn)return;try{
      const prepared=prepareGlyph?await prepareGlyph(glyph):glyph;
      if(generation!==turn||getGlyph()!==glyph)return;
      const result=cleanOutline(prepared,{tolerance:Number($('outline-cleanup-level').value)}),box=glyphBounds(glyph);result.glyph=prepared;
      candidate=result;$('outline-cleanup-before').replaceChildren(picture([[glyph.d,'#592f29']],box));$('outline-cleanup-after').replaceChildren(picture([[result.d,'#592f29']],box));$('outline-cleanup-overlay').replaceChildren(picture([[glyph.d,'#d43c3c','.65'],[result.d,'#008db5','.6']],box));
      $('outline-cleanup-message').textContent=(prepared!==glyph?'Đã dựng lại mối nối góc từ '+glyph.borrowedFrom+'. ':glyph.borrowedFrom&&!glyph.borrowedJoin?'Không tìm thấy kiểu gốc để khôi phục góc đã mất; chỉ giữ góc còn có trong outline. ':'')+'Bản xem trước: '+result.stats.before+' → '+result.stats.after+' lệnh vẽ. Diện tích nét đổi '+(result.stats.areaChange*100).toFixed(2)+'%. Giữ '+result.stats.protectedCorners+' góc sắc có trong outline. Chưa áp dụng. Kiểm các góc, chân nét và lòng chữ trước khi dùng.';
    }catch(error){if(generation!==turn)return;$('outline-cleanup-message').textContent=error.message;$('outline-cleanup-after').replaceChildren();$('outline-cleanup-overlay').replaceChildren();}flags();},0);
  }
  $('outline-cleanup-open').onclick=preview;$('outline-cleanup-level').onchange=preview;
  $('outline-cleanup-show-overlay').onchange=()=>{$('outline-cleanup-overlay-figure').hidden=!$('outline-cleanup-show-overlay').checked;};
  $('outline-cleanup-cancel').onclick=()=>{reset();$('viewer-scroll').hidden=false;};
  $('outline-cleanup-apply').onclick=async()=>{
    if(running||!candidate||getGlyph()!==original)return;running=true;flags();
    try{
      const {outlineUndo,...snapshot}=original;
      const next={...original,...candidate.glyph,d:candidate.d,outlineUndo:snapshot,outlineCleanup:{...candidate.stats,time:new Date().toISOString()},version:(original.version||0)+1,approved:false,proof:undefined,identityVersion:undefined,pixelOutline:undefined};
      await commit(original,next);candidate=undefined;original=next;$('outline-cleanup-message').textContent='Đã áp dụng và lưu nét mới cho '+next.char+'. Có thể Hoàn tác; cần đối chiếu lại trước khi duyệt.';
    }catch(error){$('outline-cleanup-message').textContent=error.message;}finally{running=false;flags();}
  };
  $('outline-cleanup-undo').onclick=async()=>{
    const current=getGlyph();if(running||!current?.outlineUndo||current.locked)return;running=true;flags();
    try{const next={...current.outlineUndo,version:(current.version||0)+1,approved:false,proof:undefined,identityVersion:undefined};await commit(current,next);candidate=undefined;original=next;$('outline-cleanup-message').textContent='Đã khôi phục outline trước khi nắn và lưu lại.';$('outline-cleanup-after').replaceChildren(picture([[next.d,'#592f29']],glyphBounds(next)));}
    catch(error){$('outline-cleanup-message').textContent=error.message;}finally{running=false;flags();}
  };
  return {reset};
}
