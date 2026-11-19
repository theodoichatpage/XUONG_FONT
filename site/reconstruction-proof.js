import opentype from 'opentype.js';
import { compareSilhouettes } from './reconstruction-metrics.js';
import { rgbaMask, proofReferenceMask, validateCutoff } from './reference-mask.js';

function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,h);return c;}
function mask(canvas){return rgbaMask(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));}
export async function reconstructionProof(image,glyph,fontBytes,options={}){
  const threshold=validateCutoff(options.threshold??glyph.processing?.threshold??128);
  if(!glyph.placement||!glyph.pixelCrop)throw Error('Glyph cũ chưa lưu phép đặt từ pixel. Hãy phục dựng lại từ ảnh gốc.');
  const font=opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset,fontBytes.byteOffset+fontBytes.byteLength));
  if(!font.charToGlyphIndex(glyph.char))throw Error('File font thiếu ký tự; không dùng font dự phòng.');
  const crop=glyph.pixelCrop,pad=6,zoom=Math.min(4,900/Math.max(crop.w+pad*2,crop.h+pad*2));
  const w=Math.ceil((crop.w+pad*2)*zoom),h=Math.ceil((crop.h+pad*2)*zoom);
  const original=makeCanvas(w,h),vector=makeCanvas(w,h),exported=makeCanvas(w,h),overlay=makeCanvas(w,h);
  original.getContext('2d').drawImage(image,crop.x,crop.y,crop.w,crop.h,pad*zoom,pad*zoom,crop.w*zoom,crop.h*zoom);
  const {scale,baseline,lsb,sourceY}=glyph.placement;
  const x=pad*zoom-lsb/scale*zoom,y=pad*zoom+(baseline-sourceY)*zoom,unit=zoom/scale;
  const ctx=vector.getContext('2d');ctx.translate(x,y);ctx.scale(unit,-unit);ctx.fillStyle='#000';ctx.fill(new Path2D(glyph.d));
  // The third proof uses the browser's real font rasterizer, after cmap readback.
  const face=new FontFace('glyph-proof-'+crypto.randomUUID(),fontBytes);
  await face.load();document.fonts.add(face);
  try{const context=exported.getContext('2d');context.font=(1000*unit)+'px "'+face.family+'"';context.fontKerning='none';context.textBaseline='alphabetic';context.fillStyle='#000';context.fillText(glyph.char,x,y);}finally{document.fonts.delete(face);}
  const sourcePixels=image.getContext('2d').getImageData(crop.x,crop.y,crop.w,crop.h);
  const nativeMask=rgbaMask(sourcePixels,{threshold,light:!!glyph.processing?.light});
  const ref=proofReferenceMask(nativeMask,sourcePixels.width,sourcePixels.height,w,h,zoom,pad),v=mask(vector),out=mask(exported);
  const vectorResult=compareSilhouettes(ref,v,w,h,options),fontResult=compareSilhouettes(ref,out,w,h,options);
  const o=overlay.getContext('2d'),pixels=o.createImageData(w,h);
  for(let i=0;i<ref.length;i++){const color=ref[i]&&out[i]?[30,30,30]:ref[i]?[210,45,45]:out[i]?[0,150,200]:[255,255,255];pixels.data.set([...color,255],i*4);}o.putImageData(pixels,0,0);
  return {original,vector,exported,overlay,vectorResult,fontResult,zoom,threshold,alignment:'Một phép scale đồng nhất lấy từ nguồn; không fit riêng bounding box. Baseline chưa được xác minh quang học.'};
}
