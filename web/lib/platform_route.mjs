// 기존 승강장 양 끝을 그대로 두고 기본 지도 노선의 역 주변만 연결해요.
export function platformRoute(coords,start,end,offset=0,zoom=16){
  if(!start||!end||coords.length<2)return coords;
  const origin=coords[0],kx=111320*Math.cos(origin[1]*Math.PI/180),ky=111320;
  const xy=p=>[(p[0]-origin[0])*kx,(p[1]-origin[1])*ky];
  const ll=p=>[origin[0]+p[0]/kx,origin[1]+p[1]/ky];
  const mpp=p=>40075016.686*Math.cos(p[1]*Math.PI/180)/(512*2**zoom);
  const shiftRect=rect=>{
    const [a,b]=rect.coords.map(xy),dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;
    return {...rect,coords:rect.coords.map(p=>{const q=xy(p),m=mpp(p)*rect.offset;return ll([q[0]+dy/d*m,q[1]-dx/d*m])})};
  };
  start=shiftRect(start);end=shiftRect(end);
  const raw=coords.map(xy);
  const pts=raw.map((p,i)=>{
    if(!offset)return p;
    let a=i,b=i;
    while(a>0&&Math.hypot(raw[a][0]-p[0],raw[a][1]-p[1])<.01)a--;
    while(b<raw.length-1&&Math.hypot(raw[b][0]-p[0],raw[b][1]-p[1])<.01)b++;
    const dx=raw[b][0]-raw[a][0],dy=raw[b][1]-raw[a][1],d=Math.hypot(dx,dy)||1,m=mpp(coords[i])*offset;
    return [p[0]+dy/d*m,p[1]-dx/d*m];
  }),len=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+len(pts[i-1],pts[i]));
  const total=cum.at(-1);
  const at=d=>{let i=1;while(i<cum.length-1&&cum[i]<d)i++;const u=(d-cum[i-1])/(cum[i]-cum[i-1]||1);return pts[i-1].map((v,j)=>v+(pts[i][j]-v)*u)};
  const endpoint=(rect,reverse)=>{
    const a=xy(rect.coords[0]),b=xy(rect.coords[1]),center=a.map((v,i)=>(v+b[i])/2),half=len(a,b)/2;
    const probe=at(reverse?Math.max(0,total-half-150):Math.min(total,half+150));
    const sign=(probe[0]-center[0])*(b[0]-a[0])+(probe[1]-center[1])*(b[1]-a[1])>=0?1:-1;
    const out=sign>0?b:a,inside=sign>0?a:b,dir=out.map((v,i)=>(v-center[i])/(half||1));
    return {out,inside,dir,half};
  };
  const A=endpoint(start,false),B=endpoint(end,true);
  const reach=e=>Math.max(e.half+150,e.half*2);
  const spare=Math.max(0,total-A.half-B.half);
  const da=Math.min(reach(A),A.half+spare*.45),db=Math.min(reach(B),B.half+spare*.45);
  const curve=(e,d,reverse)=>{
    const join=at(reverse?total-d:d),near=at(reverse?Math.min(total,total-d+5):Math.max(0,d-5)),tangent=join.map((v,i)=>v-near[i]),norm=Math.hypot(...tangent)||1;
    const span=len(e.out,join),handle=span/3,p1=e.out.map((v,i)=>v+e.dir[i]*handle),p2=join.map((v,i)=>v-tangent[i]/norm*handle),n=Math.max(2,Math.ceil((span+2*handle)/4)),out=[];
    for(let i=0;i<=n;i++){const t=i/n,u=1-t;out.push(e.out.map((v,j)=>u*u*u*v+3*u*u*t*p1[j]+3*u*t*t*p2[j]+t*t*t*join[j]))}
    return out;
  };
  // 양 끝 모두 막대 전체를 지나므로 종착역과 분기역도 빠뜨리지 않아요.
  const middle=pts.filter((p,i)=>cum[i]>da&&cum[i]<total-db);
  return [A.inside,...curve(A,da,false),...middle,...curve(B,db,true).reverse(),B.inside].map(ll);
}
