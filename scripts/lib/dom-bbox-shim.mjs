import svgpath from 'svgpath';
function bbox(d){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,cx=0,cy=0;const add=(x,y)=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);};
svgpath(d).abs().unshort().unarc().iterate((s,i,x,y)=>{const c=s[0];if(c==='M'||c==='L'){add(s[1],s[2]);}else if(c==='H')add(s[1],y);else if(c==='V')add(x,s[1]);else if(c==='C'||c==='Q'){const P=c==='C'?[[x,y],[s[1],s[2]],[s[3],s[4]],[s[5],s[6]]]:[[x,y],[s[1],s[2]],[s[3],s[4]]];for(let k=0;k<=40;k++){const t=k/40;let q=P.map(p=>[...p]);while(q.length>1)q=q.slice(1).map((p,j)=>[q[j][0]+(p[0]-q[j][0])*t,q[j][1]+(p[1]-q[j][1])*t]);add(...q[0]);}}});
return {x:x0,y:y0,width:x1-x0,height:y1-y0};}
const el=()=>({style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},append(){},remove(){},getBBox(){return bbox(this.attrs.d);}});
globalThis.document={createElementNS:()=>el(),body:{append(){}}};
