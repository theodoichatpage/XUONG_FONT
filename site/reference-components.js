import svgpath from 'svgpath';
import opentype from 'opentype.js';

function contourBounds(segments){
  const path=new opentype.Path();
  for(const [command,...p]of segments){
    if(command==='M')path.moveTo(...p);else if(command==='L')path.lineTo(...p);
    else if(command==='C')path.curveTo(...p);else if(command==='Q')path.quadTo(...p);
    else if(command==='Z')path.close();else throw Error('Contour có lệnh chưa hỗ trợ.');
  }
  return path.getBoundingBox();
}

// One evidence-backed construction, never a replacement font or a drawn stem:
// ị already contains i's stem and upper dot. Remove only its detached underdot.
export function reuseReferenceComponents(glyphs){
  if(glyphs.has('i'))return [];
  const source=glyphs.get('ị');
  if(!source?.d||source.origin!=='direct'||!source.placement||!source.pixelCrop||!source.sourceImageId)return [];
  const contours=[];
  for(const segment of svgpath(source.d).abs().unshort().unarc().segments){if(segment[0]==='M')contours.push([]);contours.at(-1)?.push(segment);}
  if(contours.length!==3)return []; // joined/ambiguous dots are never cut out.
  const parts=contours.map(segments=>({segments,bounds:contourBounds(segments)}));
  const lower=parts.filter(p=>p.bounds.y2<0);
  if(lower.length!==1)return [];
  const kept=parts.filter(p=>p!==lower[0]);
  const body=kept.reduce((a,b)=>a.bounds.y2-a.bounds.y1>b.bounds.y2-b.bounds.y1?a:b);
  const upper=kept.find(p=>p!==body);
  if(!upper||upper.bounds.y1<=body.bounds.y2||upper.bounds.y2-upper.bounds.y1>(body.bounds.y2-body.bounds.y1)*.4)return [];
  const {scale,baseline}=source.placement;
  const bottom=Math.max(...kept.map(p=>baseline-p.bounds.y1/scale));
  const crop={...source.pixelCrop,h:Math.ceil(bottom-source.pixelCrop.y)};
  if(crop.h<=0||crop.h>=source.pixelCrop.h)return [];
  return [{...source,char:'i',d:kept.map(p=>svgpath(p.segments.map(segment=>segment.join(' ')).join(' ')).round(4).toString()).join(' '),
    origin:'inferred',source:'Tái sử dụng contour ị',sourceChar:'ị',sourceVersion:source.version,
    inference:{method:'remove-detached-underdot',keptContours:2,removedContours:1,bodyUnchanged:true},
    pixelCrop:crop,pixelOutline:undefined,approved:false,locked:false,proof:undefined,history:[],version:undefined,
    reconstructionStatus:'needs-review'}];
}
