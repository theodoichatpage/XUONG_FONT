import svgpath from 'svgpath';
const { fixWinding } = require('../src/winding');
const median = values => { const a=values.filter(Number.isFinite).sort((a,b)=>a-b); return a.length ? a[Math.floor(a.length/2)] : NaN; };
export function placeReferenceAt(glyph,placement){
  const {scale,baseline,lsb}=placement;
  return {d:fixWinding(svgpath(glyph.pixelOutline).scale(scale,-scale).translate(lsb,(baseline-glyph.pixelCrop.y)*scale).round(4).toString()),advance:Math.ceil(glyph.pixelCrop.w*scale+2*lsb)};
}

// One uniform pixel-to-UPM scale, never independent x/y stretching or stem fitting.
export function placeReferenceWords(words) {
  const all=words.flat(), caps=all.filter(g=>/^[A-ZĐ0-9]$/u.test(g.char)&&g.pixelCrop);
  const lower=all.filter(g=>/^[acenosuvwxz]$/u.test(g.char)&&g.pixelCrop);
  const anchors=caps.length?caps:lower.length?lower:all;
  const height=median(anchors.map(g=>g.pixelCrop.h));
  if(!height||!all.length)return [];
  const scale=(caps.length?700:lower.length?550:700)/height;
  return words.flatMap(word=>{
    const stable=word.filter(g=>!/[gjpqy]/u.test(g.char.normalize('NFD')[0])&&!g.char.normalize('NFD').includes('\u0323'));
    const baseline=median((stable.length?stable:word).map(g=>g.pixelCrop.y+g.pixelCrop.h));
    return word.map(g=>{
      const crop=g.pixelCrop, bearing=30;
      const d=fixWinding(svgpath(g.pixelOutline).scale(scale,-scale).translate(bearing,(baseline-crop.y)*scale).round(4).toString());
      return {...g,d,advance:Math.ceil(crop.w*scale+2*bearing),origin:'direct',preserveOutline:true,
        placement:{scale,baseline,lsb:bearing,sourceY:crop.y,method:'uniform-reference',metricsVerified:false},
        reconstructionStatus:'needs-review',approved:false,locked:false};
    });
  });
}
