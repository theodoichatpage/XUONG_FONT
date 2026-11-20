import svgpath from 'svgpath';

const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const unit=v=>{const n=Math.hypot(...v);return n?[v[0]/n,v[1]/n]:[1,0];};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const add=(a,v,s)=>[a[0]+v[0]*s,a[1]+v[1]*s];
function segmentDistance(p,a,b){const v=sub(b,a),n=dot(v,v),t=n?Math.max(0,Math.min(1,dot(sub(p,a),v)/n)):0;return dist(p,add(a,v,t));}
function cubic(c,t){const u=1-t;return [0,1].map(k=>u*u*u*c[0][k]+3*u*u*t*c[1][k]+3*u*t*t*c[2][k]+t*t*t*c[3][k]);}
function flattenCubic(c,error,out,depth=0){
  if(depth>=16||Math.max(segmentDistance(c[1],c[0],c[3]),segmentDistance(c[2],c[0],c[3]))<=error){out.push(c[3]);return;}
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],a=mid(c[0],c[1]),b=mid(c[1],c[2]),d=mid(c[2],c[3]),e=mid(a,b),f=mid(b,d),g=mid(e,f);
  flattenCubic([c[0],a,e,g],error,out,depth+1);flattenCubic([g,f,d,c[3]],error,out,depth+1);
}
export function sampleOutline(d,error=.15){
  const parsed=svgpath(d).abs().unshort().unarc();
  if(parsed.err||parsed.segments.length>12000)throw Error('Outline không hợp lệ hoặc quá phức tạp để chỉnh an toàn.');
  const contours=[];let points,current,start;
  for(const s of parsed.segments){
    if(s.some((v,i)=>i&&(!Number.isFinite(v)||Math.abs(v)>100000)))throw Error('Tọa độ outline không hợp lệ.');
    if(s[0]==='M'){if(points)throw Error('Outline có đường chưa khép kín.');current=start=s.slice(1);points=[current];}
    else if(!points)throw Error('Outline thiếu điểm bắt đầu.');
    else if(s[0]==='L'||s[0]==='H'||s[0]==='V'){
      current=s[0]==='L'?s.slice(1):s[0]==='H'?[s[1],current[1]]:[current[0],s[1]];points.push(current);
    }else if(s[0]==='C'){const c=[current,s.slice(1,3),s.slice(3,5),s.slice(5,7)];flattenCubic(c,error,points);current=c[3];}
    else if(s[0]==='Q'){const q=s.slice(1,3),end=s.slice(3,5);flattenCubic([current,add(current,sub(q,current),2/3),add(end,sub(q,end),2/3),end],error,points);current=end;}
    else if(s[0]==='Z'){
      if(dist(points.at(-1),start)<1e-8)points.pop();
      points=points.filter((p,i)=>!i||dist(p,points[i-1])>1e-8);
      if(points.length<3)throw Error('Outline có contour quá nhỏ hoặc suy biến.');
      // Preserve every original vertex, with extra samples on long edges.
      const dense=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],n=Math.max(1,Math.ceil(dist(a,b)/2));for(let j=0;j<n;j++)dense.push(add(a,sub(b,a),j/n));}
      if(dense.length>8000)throw Error('Contour quá phức tạp; chưa thay nét gốc.');
      contours.push(dense);points=undefined;current=start;
    }else throw Error('Lệnh outline chưa được hỗ trợ.');
  }
  if(points||!contours.length)throw Error('Chỉ chỉnh outline đã khép kín.');
  return contours;
}
const area=p=>p.reduce((a,b,i)=>{const c=p[(i+1)%p.length];return a+b[0]*c[1]-b[1]*c[0];},0)/2;
function walk(p,i,direction,length){let j=i,travel=0;do{const k=(j+direction+p.length)%p.length;travel+=dist(p[j],p[k]);j=k;}while(travel<length&&j!==i);return j;}
function tangent(p,i,window){return unit(sub(p[walk(p,i,1,window)],p[walk(p,i,-1,window)]));}
function hardCorners(d){
  const parts=[];let edges,start,current;
  const end=s=>s.slice(-2),nonzero=(list)=>list.find(v=>Math.hypot(...v)>1e-6)||[0,0];
  for(const s of svgpath(d).abs().unshort().unarc().segments){
    if(s[0]==='M'){edges=[];parts.push(edges);start=current=end(s);continue;}
    const to=s[0]==='Z'?start:s[0]==='H'?[s[1],current[1]]:s[0]==='V'?[current[0],s[1]]:end(s);
    if(dist(to,current)<1e-8&&s[0]==='Z')continue;
    const controls=s[0]==='C'?[s.slice(1,3),s.slice(3,5)]:s[0]==='Q'?[s.slice(1,3)]:[];
    edges.push({point:current,begin:nonzero([...controls,to].map(p=>sub(p,current))),end:nonzero([...controls.slice().reverse(),current].map(p=>sub(to,p)))});current=to;
  }
  return parts.map(edges=>edges.filter((e,i)=>{const before=edges[(i+edges.length-1)%edges.length];return Math.hypot(...before.end)>=4&&Math.hypot(...e.begin)>=4&&dot(unit(before.end),unit(e.begin))<Math.cos(Math.PI/6);}).map(e=>e.point));
}
function anchors(p,window,protectedPoints=[]){
  const candidates=[];
  for(let i=0;i<p.length;i++){const a=p[walk(p,i,-1,window)],b=p[i],c=p[walk(p,i,1,window)];const score=1-dot(unit(sub(b,a)),unit(sub(c,b)));if(score>.24)candidates.push({i,score});}
  for(const point of protectedPoints){let i=0;for(let j=1;j<p.length;j++)if(dist(p[j],point)<dist(p[i],point))i=j;candidates.push({i,score:Infinity,protected:true});}
  candidates.sort((a,b)=>b.score-a.score);const chosen=[];
  for(const c of candidates)if(c.protected?!chosen.some(x=>x.i===c.i):!chosen.some(x=>{let d=0,j=x.i;while(j!==c.i&&d<window){const k=(j+1)%p.length;d+=dist(p[j],p[k]);j=k;}let e=0;j=c.i;while(j!==x.i&&e<window){const k=(j+1)%p.length;e+=dist(p[j],p[k]);j=k;}return Math.min(d,e)<window;}))chosen.push({...c,corner:true});
  // Extrema bound closed smooth loops without replacing them by ellipses.
  if(chosen.length<2){for(const [axis,sign]of [[0,1],[0,-1],[1,1],[1,-1]]){let i=0;for(let j=1;j<p.length;j++)if(sign*p[j][axis]>sign*p[i][axis])i=j;if(!chosen.some(c=>c.i===i))chosen.push({i,corner:false});}}
  return chosen.sort((a,b)=>a.i-b.i);
}
function fit(points,t0,t1,tolerance,out,depth=0){
  const first=points[0],last=points.at(-1),chord=sub(last,first),length=dist(first,last);
  if(points.length<3||points.every(p=>segmentDistance(p,first,last)<=tolerance*.75)) {out.push(['L',...last]);return;}
  const u=[0];for(let i=1;i<points.length;i++)u.push(u.at(-1)+dist(points[i],points[i-1]));const total=u.at(-1);for(let i=1;i<u.length;i++)u[i]/=total;
  let c00=0,c01=0,c11=0,x0=0,x1=0;
  points.forEach((p,i)=>{const t=u[i],v=1-t,b0=v*v*v,b1=3*v*v*t,b2=3*v*t*t,b3=t*t*t,a=t0.map(x=>x*b1),b=t1.map(x=>x*b2),r=p.map((x,k)=>x-first[k]*(b0+b1)-last[k]*(b2+b3));c00+=dot(a,a);c01+=dot(a,b);c11+=dot(b,b);x0+=dot(a,r);x1+=dot(b,r);});
  const det=c00*c11-c01*c01;let a=det?(x0*c11-x1*c01)/det:length/3,b=det?(x1*c00-x0*c01)/det:length/3;
  if(a<length*.001||b<length*.001||a>total*2||b>total*2)a=b=length/3;
  const curve=[first,add(first,t0,a),add(last,t1,b),last];let error=0,split=Math.floor(points.length/2);
  points.forEach((p,i)=>{if(i&&i<points.length-1){const e=dist(p,cubic(curve,u[i]));if(e>error){error=e;split=i;}}});
  if(error<=tolerance*.8||depth>=18){out.push(['C',...curve[1],...curve[2],...last]);return;}
  let k=split,j=split,n=0;const window=Math.max(8,tolerance*6);
  while(k>0&&n<window){n+=dist(points[k],points[k-1]);k--;}
  n=0;while(j<points.length-1&&n<window){n+=dist(points[j],points[j+1]);j++;}
  const center=unit(sub(points[j],points[k]));
  fit(points.slice(0,split+1),t0,center.map(x=>-x),tolerance,out,depth+1);fit(points.slice(split),center,t1,tolerance,out,depth+1);
}
function serialize(contours){return contours.map(c=>c.map(s=>s[0]+s.slice(1).map(n=>Math.round(n*10000)/10000).join(' ')).join('')).join('');}
function maxDistance(a,b,limit){let maximum=0;for(const p of a){let nearest=Infinity;for(let i=0;i<b.length;i++){nearest=Math.min(nearest,segmentDistance(p,b[i],b[(i+1)%b.length]));if(nearest<.02)break;}maximum=Math.max(maximum,nearest);if(maximum>limit)return maximum;}return maximum;}
function crossing(a,b,c,d){const cross=(x,y,z)=>(y[0]-x[0])*(z[1]-x[1])-(y[1]-x[1])*(z[0]-x[0]);return cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;}
function intersections(a,b,same){let count=0;for(let i=0;i<a.length;i++)for(let j=same?i+2:0;j<b.length;j++){if(same&&i===0&&j===b.length-1)continue;if(crossing(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))count++;}return count;}
export function cleanOutline(glyph,{tolerance=1.5}={}){
  if(glyph?.locked)throw Error('Chữ đã khóa. Hãy chủ động mở khóa trước khi chỉnh outline.');
  if(!glyph?.d||!Number.isFinite(tolerance)||tolerance<.25||tolerance>3)throw Error('Mức chỉnh outline không hợp lệ.');
  const original=sampleOutline(glyph.d,Math.min(.15,tolerance/8)),protectedPoints=hardCorners(glyph.d),result=[];let cornerCount=0;
  for(const [index,p] of original.entries()){
    const nodes=anchors(p,Math.max(8,tolerance*6),protectedPoints[index]);cornerCount+=nodes.filter(n=>n.corner).length;const segments=[['M',...p[nodes[0].i]]];
    for(let k=0;k<nodes.length;k++){
      const a=nodes[k],b=nodes[(k+1)%nodes.length],points=[p[a.i]];let i=a.i;do{i=(i+1)%p.length;points.push(p[i]);}while(i!==b.i);
      const reach=Math.min(Math.max(12,tolerance*8),points.reduce((n,x,j)=>n+(j?dist(x,points[j-1]):0),0)/3);
      const endpoint=(start)=>{let j=start?0:points.length-1,n=0;while(n<reach&&(start?j<points.length-1:j>0)){const next=j+(start?1:-1);n+=dist(points[j],points[next]);j=next;}return unit(sub(points[j],start?points[0]:points.at(-1)));};
      fit(points,a.corner?endpoint(true):tangent(p,a.i,reach),b.corner?endpoint(false):tangent(p,b.i,reach).map(v=>-v),tolerance,segments);
    }
    segments.push(['Z']);result.push(segments);
  }
  const d=serialize(result),after=sampleOutline(d,Math.min(.12,tolerance/10));let maxDeviation=0,areaBefore=0,areaAfter=0;
  for(let i=0;i<original.length;i++){
    const a=original[i],b=after[i],sa=area(a),sb=area(b);areaBefore+=sa;areaAfter+=sb;
    maxDeviation=Math.max(maxDeviation,maxDistance(a,b,tolerance+0.2),maxDistance(b,a,tolerance+0.2));
    if(Math.sign(sa)!==Math.sign(sb)||Math.abs(sb-sa)>Math.max(1,Math.abs(sa)*.05))throw Error('Mức chỉnh làm đổi lòng chữ hoặc chi tiết nhỏ; hãy chọn mức Nhẹ. Chưa thay nét gốc.');
    if(intersections(b,b,true)>intersections(a,a,true))throw Error('Outline mới tự cắt; giữ nguyên nét gốc.');
    for(let j=0;j<i;j++)if(intersections(b,after[j],false)>intersections(a,original[j],false))throw Error('Outline mới làm các contour giao nhau; giữ nguyên nét gốc.');
  }
  if(maxDeviation>tolerance+.2||Math.abs(areaAfter-areaBefore)>Math.max(1,Math.abs(areaBefore)*.02))throw Error('Mức chỉnh làm lệch nét quá giới hạn; hãy giảm mức chỉnh. Chưa thay nét gốc.');
  return {d,stats:{tolerance,protectedCorners:cornerCount,exactSourceCorners:protectedPoints.reduce((n,p)=>n+p.length,0),maxDeviation,areaChange:areaBefore?(areaAfter-areaBefore)/areaBefore:0,contours:original.length,before:svgpath(glyph.d).segments.length,after:svgpath(d).segments.length}};
}
