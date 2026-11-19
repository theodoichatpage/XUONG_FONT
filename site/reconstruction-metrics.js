function bounds(mask,w,h){let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {x0,y0,x1,y1,width:x1-x0+1,height:y1-y0+1};}
function edge(mask,w,h){return mask.map((p,i)=>p&&(!(i%w)||i%w===w-1||i<w||i>=w*(h-1)||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w])?1:0);}
function distances(mask,w,h){const d=Float32Array.from(mask,v=>v?0:1e6),diag=Math.SQRT2;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y)d[i]=Math.min(d[i],d[i-w]+1);if(x&&y)d[i]=Math.min(d[i],d[i-w-1]+diag);if(y&&x<w-1)d[i]=Math.min(d[i],d[i-w+1]+diag);}for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x<w-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<h-1)d[i]=Math.min(d[i],d[i+w]+1);if(x<w-1&&y<h-1)d[i]=Math.min(d[i],d[i+w+1]+diag);if(y<h-1&&x)d[i]=Math.min(d[i],d[i+w-1]+diag);}return d;}
function holes(mask,w,h){const seen=new Uint8Array(mask.length);let count=0,area=0;for(let i=0;i<mask.length;i++){if(mask[i]||seen[i])continue;const queue=[i];seen[i]=1;let border=false,size=0;for(let head=0;head<queue.length;head++){const p=queue[head],x=p%w,y=Math.floor(p/w);size++;if(!x||!y||x===w-1||y===h-1)border=true;for(const n of [x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}}if(!border){count++;area+=size;}}return {count,area};}
function runs(mask,w,h){const values=[];for(let y=0;y<h;y++){let n=0;for(let x=0;x<=w;x++){if(x<w&&mask[y*w+x])n++;else if(n){values.push(n);n=0;}}}values.sort((a,b)=>a-b);return {thin:values[Math.floor(values.length*.1)]||0,thick:values[Math.floor(values.length*.9)]||0};}
export function compareSilhouettes(reference,candidate,w,h,{minIoU=.96,maxContourDistance=1,maxAspectError=.02,maxContourDeviation=4}={}){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0||![minIoU,maxContourDistance,maxAspectError,maxContourDeviation].every(Number.isFinite)||minIoU<0||minIoU>1||maxContourDistance<0||maxAspectError<0||maxContourDeviation<0)throw Error('Ngưỡng hoặc kích thước đối chiếu không hợp lệ.');
  if(reference.length!==w*h||candidate.length!==w*h)throw Error('Sai kích thước mask.');
  let intersection=0,union=0,referenceArea=0,candidateArea=0;
  for(let i=0;i<reference.length;i++){if(reference[i])referenceArea++;if(candidate[i])candidateArea++;if(reference[i]&&candidate[i])intersection++;if(reference[i]||candidate[i])union++;}
  const a=bounds(reference,w,h),b=bounds(candidate,w,h),ae=edge(reference,w,h),be=edge(candidate,w,h),ad=distances(ae,w,h),bd=distances(be,w,h);
  let sum=0,n=0,max=0;for(let i=0;i<ae.length;i++){if(ae[i]){sum+=bd[i];n++;max=Math.max(max,bd[i]);}if(be[i]){sum+=ad[i];n++;max=Math.max(max,ad[i]);}}
  const iou=union?intersection/union:0,aspectError=a.width&&a.height&&b.height?Math.abs((b.width/b.height)/(a.width/a.height)-1):1;
  const referenceHoles=holes(reference,w,h),candidateHoles=holes(candidate,w,h);
  const findings=[];
  if(!referenceArea||!candidateArea)findings.push('Mask trống; cần ảnh hoặc outline thật.');
  if(iou<minIoU)findings.push('Silhouette lệch: kiểm ngưỡng hoặc vùng cắt; không tăng nét tự động.');
  if(sum/(n||1)>maxContourDistance)findings.push('Contour lệch: giảm làm mượt hoặc cần ảnh rõ hơn.');
  if(max>maxContourDeviation)findings.push('Chi tiết cục bộ lệch quá ngưỡng: kiểm chân chữ, đầu nét hoặc dấu trên overlay.');
  if(aspectError>maxAspectError)findings.push('Sai tỷ lệ rộng/cao; kiểm phép scale và vùng glyph.');
  if(referenceHoles.count!==candidateHoles.count)findings.push('Số vùng trắng kín thay đổi; có thể mất lòng chữ.');
  return {iou,xorPixels:union-intersection,referenceArea,candidateArea,areaRatio:referenceArea?candidateArea/referenceArea:0,
    contourMean:sum/(n||1),contourMax:max,aspectError,referenceBounds:a,candidateBounds:b,referenceHoles,candidateHoles,
    referenceRuns:runs(reference,w,h),candidateRuns:runs(candidate,w,h),findings,pass:!findings.length,
    limits:'Contour là xấp xỉ khoảng cách raster. Thống kê độ dài đoạn quét không phải phép đo serif hay độ tương phản nét đã được chuyên gia xác nhận. Baseline, vị trí dấu và serif cần duyệt riêng.'};
}
