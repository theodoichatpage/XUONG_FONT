// Match extraction exactly, including Otsu's valid cutoff of zero.
export const referenceLuminance = (rgba, offset) => (rgba[offset]*77+rgba[offset+1]*150+rgba[offset+2]*29)>>8;
export function validateCutoff(threshold) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 254) throw Error('Ngưỡng ảnh cần từ 0 đến 254.');
  return threshold;
}
export const isReferenceInk = (value, threshold, light=false) => Number(light ? value > threshold : value <= threshold);
export function rgbaMask({data,width,height},{threshold=128,light=false}={}) {
  validateCutoff(threshold);
  if(data.length!==width*height*4)throw Error('Dữ liệu ảnh không khớp kích thước.');
  return Uint8Array.from({length:width*height},(_,i)=>isReferenceInk(referenceLuminance(data,4*i),threshold,light));
}
// Threshold native pixels first. Resizing before thresholding would alter hairlines,
// especially at cutoff 0, and would let the proof disagree with the extraction.
export function proofReferenceMask(nativeMask,sourceWidth,sourceHeight,width,height,zoom,pad) {
  const output=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.floor((x+.5)/zoom-pad),sy=Math.floor((y+.5)/zoom-pad);
    if(sx>=0&&sy>=0&&sx<sourceWidth&&sy<sourceHeight)output[y*width+x]=nativeMask[sy*sourceWidth+sx];
  }
  return output;
}
export function retraceSettings(glyph, threshold) {
  validateCutoff(threshold);
  const light=!!glyph.processing?.light;
  // wordInk's light UI value is a lower inclusive boundary; its stored cutoff is exclusive.
  return {polarity:light?'light':'dark',threshold:light?threshold+1:threshold};
}
