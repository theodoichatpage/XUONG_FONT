import svgpath from 'svgpath';
import { outlineDefects } from './outline-quality.js';

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
  if(points.length<3||points.every(p=>segmentDistance(p,first,last)<=tolerance*.75)){
    // Đoạn gần thẳng trên đường cong vẫn vẽ bằng C theo tiếp tuyến: nối nhiều L sẽ thành gãy. Cạnh thẳng thật được dựng riêng.
    if(length<2)out.push(['L',...last]);
    else out.push(['C',...add(first,t0,length/3),...add(last,t1,length/3),...last]);
    return;
  }
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
// ---- Nắn thẳng cạnh, dựng lại góc nhọn, làm mượt phần cong ----
// Cạnh gần thẳng (chỉ gồ ghề do dò ảnh) được thay bằng một đường thẳng; hai cạnh thẳng gặp nhau qua một
// đoạn bo nhỏ được nối lại tại giao điểm (góc nhọn như chữ in); phần cong thật được khớp Bézier trên
// điểm đã làm mịn. Không bo tròn góc, không đổi O thành hình tròn chuẩn.
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function lineFit(points){
  let mx=0,my=0;for(const p of points){mx+=p[0];my+=p[1];}mx/=points.length;my/=points.length;
  let xx=0,xy=0,yy=0;for(const p of points){const x=p[0]-mx,y=p[1]-my;xx+=x*x;xy+=x*y;yy+=y*y;}
  const angle=.5*Math.atan2(2*xy,xx-yy);let d=[Math.cos(angle),Math.sin(angle)];
  if(dot(sub(points.at(-1),points[0]),d)<0)d=[-d[0],-d[1]];
  const c=[mx,my];let max=0;for(const p of points)max=Math.max(max,Math.abs(cross(sub(p,c),d)));
  return {c,d,max};
}
const projectOn=(line,p)=>add(line.c,line.d,dot(sub(p,line.c),line.d));
function intersect(a,b){const den=cross(a.d,b.d);if(Math.abs(den)<1e-9)return null;return add(a.c,a.d,cross(sub(b.c,a.c),b.d)/den);}
// Độ võng có hệ thống (đường cong lớn) tách khỏi nhiễu răng cưa: khớp parabol phần dư theo trục đường thẳng.
function bow(points,line){
  let s0=0,s1=0,s2=0,s3=0,s4=0,r0=0,r1=0,r2=0,lo=Infinity,hi=-Infinity;
  for(const p of points){const t=dot(sub(p,line.c),line.d),r=cross(sub(p,line.c),line.d),t2=t*t;lo=Math.min(lo,t);hi=Math.max(hi,t);s0++;s1+=t;s2+=t2;s3+=t2*t;s4+=t2*t2;r0+=r;r1+=r*t;r2+=r*t2;}
  const m=[[s4,s3,s2,r2],[s3,s2,s1,r1],[s2,s1,s0,r0]];
  for(let i=0;i<3;i++){let k=i;for(let j=i+1;j<3;j++)if(Math.abs(m[j][i])>Math.abs(m[k][i]))k=j;[m[i],m[k]]=[m[k],m[i]];if(Math.abs(m[i][i])<1e-12)return 0;for(let j=0;j<3;j++)if(j!==i){const f=m[j][i]/m[i][i];for(let c=i;c<4;c++)m[j][c]-=f*m[i][c];}}
  return Math.abs(m[0][3]/m[0][0])*((hi-lo)/2)**2;
}
function smoothClosed(p,k){if(k<1)return p.map(x=>[...x]);const n=p.length;return p.map((_,i)=>{let x=0,y=0;for(let j=-k;j<=k;j++){const q=p[(i+j+n)%n];x+=q[0];y+=q[1];}return [x/(2*k+1),y/(2*k+1)];});}
function smoothOpen(p,k){return p.map((_,i)=>{if(i===0||i===p.length-1)return p[i];const r=Math.min(k,i,p.length-1-i);let x=0,y=0;for(let j=-r;j<=r;j++){x+=p[i+j][0];y+=p[i+j][1];}return [x/(2*r+1),y/(2*r+1)];});}
const arcLength=p=>p.reduce((n,x,i)=>n+(i?dist(x,p[i-1]):0),0);

function straightenContour(p,level,givenRuns,cache,protectedPoints=[],sharpenRounded=false,force=false){
  const straightTol=2.5*level+2,cornerRadius=10*level+10,curveTol=level+1,step=Math.max(.5,arcLength(p)/p.length);
  const smoothK=Math.max(1,Math.round((3*level+4)/step));
  // Góc đo trên nét đã làm mịn khoảng 10 đơn vị và cửa sổ 20 đơn vị: răng cưa không bị tính là góc.
  const s=smoothClosed(p,Math.max(smoothK,Math.round(10/step))),n=p.length,w=Math.max(2,Math.round(20/step));
  const turn=s.map((_,i)=>{const a=unit(sub(s[i],s[(i-w+n)%n])),b=unit(sub(s[(i+w)%n],s[i]));return Math.acos(Math.max(-1,Math.min(1,dot(a,b))));});
  let start=0;for(let i=1;i<n;i++)if(turn[i]>turn[start])start=i;
  const P=[...p.slice(start),...p.slice(0,start)],S=[...s.slice(start),...s.slice(0,start)],T=[...turn.slice(start),...turn.slice(0,start)];
  const near=smoothClosed(P,Math.max(1,Math.round(3/step))),offsets=P.map((q,i)=>dist(q,near[i])).sort((a,b)=>a-b),noisyFine=offsets[Math.floor(offsets.length/2)]>.3;   // đo răng cưa trên cửa sổ hẹp: đường cong sạch không bị coi là nhiễu
  // Nét sạch: mọi điểm gãy hướng > 15° là góc thật (như hai đầu cắt của dấu trăng), giữ nguyên.
  const kinkList=P.filter((q,i)=>{const a=unit(sub(q,P[(i-1+n)%n])),b=unit(sub(P[(i+1)%n],q));return dot(a,b)<Math.cos(.26);});
  // Răng cưa thưa (bước vài chục đơn vị) không lộ trên cửa sổ hẹp nhưng tạo rất nhiều điểm gãy: vẫn là nét dò ảnh.
  const noisy=noisyFine||kinkList.length>Math.max(12,arcLength(P)/80),kinks=noisy||sharpenRounded?[]:kinkList;   // chữ dò ảnh: điểm gãy là đoạn nối của bước dò, không khóa
  // Nét sạch không phải dò từ ảnh (dấu, ký hiệu Xưởng dựng; font vẽ sẵn): không có gì để nắn, giữ nguyên đường gốc.
  if(!noisy&&!sharpenRounded&&!givenRuns&&!force)return {keep:true,lines:0,corners:0};   // force: đường cong bị vẽ bằng nhiều đoạn thẳng (gấp khúc), cần dựng lại đường cong
  const minPts=Math.ceil(36/step),longPts=Math.ceil(110/step),cornerPts=Math.ceil(2*cornerRadius/step);
  const edgeTol=noisy?straightTol:Math.min(straightTol,.75);   // nét sạch không có nhiễu: cạnh thẳng phải thẳng thật
  const straight=(i,j)=>{const line=lineFit(P.slice(i,j+1));return line.max<=edgeTol&&bow((noisy?S:P).slice(i,j+1),line)<=(line.max>1.5?Math.max(1,.15*straightTol):Math.max(.3,.5*line.max));};   // nét sạch: cung nhẹ không bị coi là cạnh thẳng
  const sharpNear=(from,dir)=>{for(let k=0;k<=cornerPts;k++){const i=from+dir*k;if(i<0||i>=n)break;if(T[i]>.6)return true;}return false;};
  let runs=[];
  if(givenRuns)runs=givenRuns;else for(let i=0;i<n-minPts;){
    // Không bắt đầu cạnh trong chỗ bo góc; nhưng outline đã thẳng tuyệt đối (góc sắc thật) thì bắt đầu ngay sau góc.
    if(T[i]>.35&&lineFit(P.slice(i,Math.min(n,i+minPts+1))).max>.5){i++;continue;}
    let j=i+minPts;if(!straight(i,j)){i++;continue;}
    for(let stride=8;;){const k=Math.min(n-1,j+stride);if(k>j&&straight(i,k)){j=k;if(k===n-1)break;}else if(stride>1)stride>>=1;else break;}
    runs.push([i,j]);i=j+1;
  }
  // Đoạn thẳng thật của chữ: dài, hoặc kết thúc ở một góc. Mặt cong thoải không bị bẻ thành nhiều cạnh.
  runs=runs.filter(([i,j])=>j-i>=longPts||sharpNear(i,-1)||sharpNear(j,1));
  // Hai đoạn gần như cùng một đường (bị tách vì một chỗ gồ ghề) được gộp lại thành một cạnh.
  for(let k=0;k+1<runs.length;){
    const [i0,j0]=runs[k],[i1,j1]=runs[k+1],a=lineFit(P.slice(i0,j0+1)),b=lineFit(P.slice(i1,j1+1));
    if(dot(a.d,b.d)>Math.cos(.25)&&arcLength(P.slice(j0,i1+1))<60&&straight(i0,j1)){runs.splice(k,2,[i0,j1]);}else k++;
  }
  // Nét dò ảnh gồm nhiều đoạn gãy dài: làm mịn phần cong theo độ dài đoạn gãy thật, không theo cửa sổ cố định.
  const kinkAt=P.map((q,i)=>i).filter(i=>{const a=unit(sub(P[i],P[(i-1+n)%n])),b=unit(sub(P[(i+1)%n],P[i]));return dot(a,b)<Math.cos(.12);});
  const spans=kinkAt.map((i,k)=>((kinkAt[(k+1)%kinkAt.length]-i+n)%n||n)*step).sort((a,b)=>a-b),facet=spans.length>3?spans[Math.floor(spans.length/2)]:0;
  const curveK=Math.max(1,Math.round(Math.max(6*level+6,noisy||sharpenRounded?Math.min(.6*facet,45):0)/step)),Sm=smoothClosed(P,curveK);
  // Góc gốc chỉ được khóa khi outline sạch; trên nét dò ảnh còn răng cưa, các "góc" đó chỉ là nhiễu.
  if(!runs.length)return {segments:smoothCurveOnly(noisy||sharpenRounded?Sm:P,level,curveTol,noisy||sharpenRounded?[]:[...protectedPoints,...kinks]),lines:0,corners:0};
  const lines=runs.map(([i,j])=>{const trim=Math.floor((j-i)*.15),line=lineFit(P.slice(i+trim,j-trim+1));return {i,j,line,a:projectOn(line,P[i]),b:projectOn(line,P[j])};});
  const gaps=lines.map((A,k)=>{const B=lines[(k+1)%lines.length],end=k+1<lines.length?B.i:B.i+n;const pts=[];for(let i=A.j;i<=end;i++)pts.push(P[i%n]);return {A,B,pts,corner:false};});
  for(const g of gaps){
    const angle=Math.acos(Math.max(-1,Math.min(1,dot(g.A.line.d,g.B.line.d))));
    if(angle<.5||arcLength(g.pts)>2.5*cornerRadius)continue;   // chỗ nối các đoạn gãy trên đường cong (dưới ~29°) không phải góc thật
    // Outline sạch (cạnh thẳng tuyệt đối, như font vẽ sẵn): góc bo ở đó là cố ý, giữ nguyên; chỉ nối góc khi nét gốc đã nhọn.
    // Cạnh còn răng cưa (dò từ ảnh): chỗ bo là do dò ảnh, dựng lại góc nhọn.
    g.clean=!sharpenRounded&&g.A.line.max<.5&&g.B.line.max<.5;
    if(g.clean&&!g.pts.every(q=>Math.min(Math.abs(cross(sub(q,g.A.line.c),g.A.line.d)),Math.abs(cross(sub(q,g.B.line.c),g.B.line.d)))<.5))continue;
    const x=intersect(g.A.line,g.B.line),mid=g.pts[Math.floor(g.pts.length/2)];
    if(x&&dist(x,mid)<=Math.max(2*cornerRadius,1.5*arcLength(g.pts))){g.corner=true;g.A.b=x;g.B.a=x;}   // góc nhọn hẹp (đỉnh A, đáy V) có điểm giao xa hơn
  }
  // Đoạn thẳng ngắn không chạm góc nào thì là một phần đường cong: bỏ, để phần cong liền mạch, không gãy.
  const keep=lines.filter((L,k)=>L.j-L.i>=longPts||gaps[k].corner||gaps[(k-1+gaps.length)%gaps.length].corner);
  if(keep.length<lines.length)return straightenContour(p,level,runs.filter(([i])=>keep.some(L=>L.i===i)).map(([i,j])=>[i,j]),{P,S,T,start},protectedPoints,sharpenRounded,force);
  // Góc dựng lại không được làm cạnh thẳng đảo chiều; nếu có thì nối cong như cũ.
  for(const [k,L]of lines.entries())if(dot(sub(L.b,L.a),L.line.d)<=1){for(const g of [gaps[k],gaps[(k-1+gaps.length)%gaps.length]])if(g.corner){g.corner=false;g.A.b=projectOn(g.A.line,P[g.A.j]);g.B.a=projectOn(g.B.line,P[g.B.i]);}}
  const segments=[['M',...lines[0].a]];let corners=0;
  for(const [k,L]of lines.entries()){
    segments.push(['L',...L.b]);const g=gaps[k];
    if(g.corner){corners++;continue;}
    const raw=g.pts.map((q,i)=>{   // đầu đoạn cong hòa dần vào cạnh thẳng kề, không để răng cưa tạo khấc ở chỗ nối
      const m=Math.min(2*curveK,Math.floor(g.pts.length/3));let r=q;
      if(i<m&&!g.corner){const w=1-i/m;r=add(r,sub(projectOn(g.A.line,q),r),w);}
      const k=g.pts.length-1-i;if(k<m){const w=1-k/m;r=add(r,sub(projectOn(g.B.line,q),r),w);}
      return r;});
    const pts=smoothOpen(raw,g.clean?0:curveK);pts[0]=g.A.b;pts[pts.length-1]=g.B.a;   // đường cong vẽ sạch không cần làm mịn
    if(pts.length<3||arcLength(pts)<3){segments.push(['L',...g.B.a]);continue;}
    const reach=Math.min(Math.max(12,cornerRadius),arcLength(pts)/3);
    const along=fromStart=>{let j=fromStart?0:pts.length-1,d=0;while(d<reach&&(fromStart?j<pts.length-1:j>0)){const nx=j+(fromStart?1:-1);d+=dist(pts[j],pts[nx]);j=nx;}return unit(sub(pts[j],fromStart?pts[0]:pts.at(-1)));};
    // Nối cạnh thẳng sang phần cong: giữ liền tiếp tuyến, trừ khi chỗ nối thật sự là góc (lệch > 30°).
    const a0=along(true),a1=along(false),l0=g.A.line.d,l1=g.B.line.d.map(v=>-v);
    const t0=sharpNear(g.A.j,1)&&dot(a0,l0)<Math.cos(.52)?a0:l0,t1=sharpNear(g.B.i,-1)&&dot(a1,l1)<Math.cos(.52)?a1:l1;
    fit(pts,t0,t1,curveTol,segments);
  }
  segments.push(['Z']);
  return {segments,lines:lines.length,corners};
}
function smoothCurveOnly(S,level,curveTol,protectedPoints=[]){
  const nodes=anchors(S,Math.max(24,level*8),protectedPoints),segments=[['M',...S[nodes[0].i]]];   // cửa sổ rộng: gợn nhỏ không thành góc
  for(let k=0;k<nodes.length;k++){
    const a=nodes[k],b=nodes[(k+1)%nodes.length],points=[S[a.i]];let i=a.i;do{i=(i+1)%S.length;points.push(S[i]);}while(i!==b.i);
    const reach=Math.min(Math.max(12,level*8),arcLength(points)/3);
    const endpoint=start=>{let j=start?0:points.length-1,d=0;while(d<reach&&(start?j<points.length-1:j>0)){const nx=j+(start?1:-1);d+=dist(points[j],points[nx]);j=nx;}return unit(sub(points[j],start?points[0]:points.at(-1)));};
    fit(points,a.corner?endpoint(true):tangent(S,a.i,reach),b.corner?endpoint(false):tangent(S,b.i,reach).map(v=>-v),curveTol,segments);
  }
  segments.push(['Z']);return segments;
}
export function fromImage(glyph){
  const source=String(glyph?.source||'');
  if(source==='Font gốc'||source==='Dựng từ nét chữ')return false;
  return !!(glyph?.processing||glyph?.reference||glyph?.pixelCrop||glyph?.origin==='direct'||glyph?.borrowedFrom||/^(Ảnh mẫu|Ghép dấu|Mượn từ|Tái sử dụng)/.test(source));
}
export function cleanOutline(glyph,{tolerance=1.5}={}){
  if(glyph?.locked)throw Error('Chữ đã khóa. Hãy chủ động mở khóa trước khi chỉnh outline.');
  if(!glyph?.d||!Number.isFinite(tolerance)||tolerance<.25||tolerance>3)throw Error('Mức chỉnh outline không hợp lệ.');
  // Góc sắc có sẵn trong outline (điểm gãy tiếp tuyến) được giữ chính xác; góc bị bo khi dò ảnh được dựng lại từ hai cạnh thẳng.
  const original=sampleOutline(glyph.d,.15),protectedPoints=hardCorners(glyph.d),result=[];let lines=0,corners=0;
  // Chữ dò từ ảnh (và chữ mượn, ghép dấu dựa trên chữ dò ảnh): góc bo là do dò ảnh, dựng lại góc nhọn.
  // Font vẽ sẵn và dấu/ký hiệu Xưởng tự dựng: góc bo là cố ý, giữ nguyên.
  const sharpenRounded=fromImage(glyph);
  // Contour có đường cong gấp khúc (chuỗi đoạn thẳng quay 3–35°, như chữ dựng từ bộ phận hay nét đổi độ đậm): dựng lại đường cong.
  const faceted=[];{let k=-1;for(const seg of svgpath(glyph.d).abs().unshort().unarc().segments){if(seg[0]==='M'){k++;faceted[k]=[];}faceted[k]?.push(seg.join(' '));}}
  for(let i=0;i<faceted.length;i++)faceted[i]=outlineDefects(faceted[i].join(' ')).kinks>0;
  // Đường gốc của từng contour (tọa độ tuyệt đối) để giữ nguyên phần không cần nắn.
  const originalParts=[];for(const seg of svgpath(glyph.d).abs().unshort().unarc().segments){if(seg[0]==='M')originalParts.push([]);originalParts.at(-1)?.push(seg[0]==='z'?['Z']:seg);}
  const allY=original.flat().map(q=>q[1]),glyphHeight=Math.max(...allY)-Math.min(...allY);
  const boxes=original.map(p=>{const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};});
  const main=boxes.reduce((m,b)=>(b.x1-b.x0)*(b.y1-b.y0)>(m.x1-m.x0)*(m.y1-m.y0)?b:m,boxes[0]);
  for(const [index,p] of original.entries()){
    // Phần nhỏ (dấu, chấm, móc) trong chữ ghép dấu là nét Xưởng dựng: không áp cách nắn của chữ dò ảnh.
    const b=boxes[index],apart=b.y0>=main.y1||b.y1<=main.y0;   // dấu trên/dưới, chấm chữ i: tách hẳn khỏi thân chính
    const small=original.length>1&&b!==main&&(apart||Math.max(b.x1-b.x0,b.y1-b.y0)<.4*glyphHeight);
    const r=straightenContour(p,tolerance,undefined,undefined,protectedPoints[index]||[],sharpenRounded&&!small,faceted[index]);
    if(r.keep){result.push(originalParts[index]);continue;}result.push(r.segments);lines+=r.lines;corners+=r.corners;}
  const d=serialize(result),after=sampleOutline(d,.12);let maxDeviation=0,areaBefore=0,areaAfter=0;
  // Giới hạn: cạnh lệch tối đa bằng độ gồ ghề cho phép cộng bán kính bo được làm nhọn lại.
  const limit=2.5*tolerance+2+3*(10*tolerance+10)+2;
  if(after.length!==original.length)throw Error('Outline mới đổi số contour; giữ nguyên nét gốc.');
  for(let i=0;i<original.length;i++){
    const a=original[i],b=after[i],sa=area(a),sb=area(b);areaBefore+=sa;areaAfter+=sb;
    maxDeviation=Math.max(maxDeviation,maxDistance(a,b,limit),maxDistance(b,a,limit));
    if(Math.sign(sa)!==Math.sign(sb)||Math.abs(sb-sa)>Math.max(2,Math.abs(sa)*.08))throw Error('Mức chỉnh làm đổi lòng chữ hoặc chi tiết nhỏ; hãy chọn mức Nhẹ. Chưa thay nét gốc.');
    if(intersections(b,b,true)>intersections(a,a,true))throw Error('Outline mới tự cắt; giữ nguyên nét gốc.');
    for(let j=0;j<i;j++)if(intersections(b,after[j],false)>intersections(a,original[j],false))throw Error('Outline mới làm các contour giao nhau; giữ nguyên nét gốc.');
  }
  if(maxDeviation>limit||Math.abs(areaAfter-areaBefore)>Math.max(2,Math.abs(areaBefore)*.04))throw Error('Mức chỉnh làm lệch nét quá giới hạn; hãy giảm mức chỉnh. Chưa thay nét gốc.');
  return {d,stats:{tolerance,protectedCorners:corners,exactSourceCorners:protectedPoints.reduce((n,p)=>n+p.length,0),maxDeviation,areaChange:areaBefore?(areaAfter-areaBefore)/areaBefore:0,contours:original.length,lines,corners,before:svgpath(glyph.d).segments.length,after:svgpath(d).segments.length}};
}
