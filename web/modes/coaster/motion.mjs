// 롤코 주행: 체인으로 끌어올리고 그다음은 제 힘으로 구르는 속도(ridePace), 언덕 · 루프를 따라 잰 탄 거리 ↔ 땅 거리(toRide · fromRide).
// 다른 화면 파일을 import 하지 않는다: 길 · 높이(geom · coasterAt)는 본체가 넘기고, 모드는 isCoaster 로 읽는다.
export function createCoasterMotion({geom,coasterAt,isCoaster}){
  // Coaster pace as a real coaster runs: a chain lift pulls the car up at RIDE_LIFT m/s, and from there it rolls on its energy,
  // ½mv² + mgh = const (mass cancels, every car alike): v = √(2g(E − h)), E the height its energy reaches — a drop speeds it
  // up, a climb slows it until the lift takes over again (no friction; trim brakes hold it to RIDE_TRIM m/s). Only the pace within a run changes (scaled to the
  // run's time), so every phase still starts and ends when the feed says (the stations' times are kept).
  // rideClock(line,from,to): the share of a run's time spent by each point (k, the way the train runs), every 5 m.
  const RIDE_G=9.81,RIDE_LIFT=5,RIDE_TRIM=35,rideClocks=new Map();
  function rideClock(line,from,to){
    const id=`${line}:${from}:${to}`;let T=rideClocks.get(id);if(T)return T;
    const lo=Math.min(from,to),hi=Math.max(from,to),fw=from<to,g=geom(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),L=g.total/mu,n=Math.max(2,Math.ceil(L/5)),v=new Float32Array(n+1);
    const lift=RIDE_LIFT*RIDE_LIFT/(2*RIDE_G);let E=lift;
    for(let i=0;i<=n;i++){const k=i/n,h=coasterAt(line,lo,hi,(fw?k:1-k)*g.total)[1]/mu;if(E-h<lift)E=h+lift;v[i]=Math.sqrt(2*RIDE_G*(E-h));if(v[i]>RIDE_TRIM){v[i]=RIDE_TRIM;E=h+RIDE_TRIM*RIDE_TRIM/(2*RIDE_G)}}   // E − h < lift: the lift has it; over RIDE_TRIM the trim brakes take the rest (the tower's 500 m drop came to 100 m/s)
    T=new Float32Array(n+1);for(let i=1;i<=n;i++)T[i]=T[i-1]+2/(v[i-1]+v[i]);
    for(let i=1;i<=n;i++)T[i]/=T[n];
    rideClocks.set(id,T);return T;
  }
  // k (from k0 to k1 as e goes 0..1) on the coaster's pace
  function ridePace(line,from,to,k0,k1,e){
    if(k0===k1)return k0;const T=rideClock(line,from,to),n=T.length-1,at=k=>{const x=Math.max(0,Math.min(n,k*n)),i=Math.min(n-1,Math.floor(x));return T[i]+(T[i+1]-T[i])*(x-i)};
    const t=at(k0)+(at(k1)-at(k0))*e;let i=0,j=n;while(j-i>1){const m=(i+j)>>1;if(T[m]<=t)i=m;else j=m}
    return (i+(T[j]>T[i]?(t-T[i])/(T[j]-T[i]):0))/n;
  }
  // Cars are spaced by ride distance, the length along the track as built (hills, loop, corkscrew), not by ground
  // distance: spaced by ground distance they were stretched over a quarter of the loop each and crossed (it looked
  // smashed), and pulled apart on the steep hills. edgeArc: ride from lo at every 2 m of s along the edge.
  const edgeArcs=new Map();
  function edgeArc(line,lo,hi){
    const id=`${line}:${lo}:${hi}`;let E=edgeArcs.get(id);if(E)return E;
    const g=geom(line,lo,hi),mu=g.pts[0].meterInMercatorCoordinateUnits(),n=Math.max(1,Math.ceil(g.total/(2*mu))),A=new Float64Array(n+1);
    const at=s=>{const [sg,h,lat]=coasterAt(line,lo,hi,s);let i=1,j=g.pts.length-1;while(i<j){const m=(i+j)>>1;if(g.cum[m]<sg)i=m+1;else j=m}
      const P=g.pts[i-1],Q=g.pts[i],l=(g.cum[i]-g.cum[i-1])||1,u=Math.max(0,Math.min(1,(sg-g.cum[i-1])/l)),fx=(Q.x-P.x)/l,fy=(Q.y-P.y)/l;
      return [P.x+(Q.x-P.x)*u-fy*lat,P.y+(Q.y-P.y)*u+fx*lat,h]};
    let q=at(0);for(let k=1;k<=n;k++){const r=at(g.total*k/n);A[k]=A[k-1]+Math.hypot(r[0]-q[0],r[1]-q[1],r[2]-q[2]);q=r}
    E={A,step:g.total/n,total:A[n]};edgeArcs.set(id,E);return E;
  }
  const arcOf=(E,s)=>{const x=Math.max(0,Math.min(E.A.length-1,s/E.step)),i=Math.min(E.A.length-2,Math.floor(x));return E.A[i]+(E.A[i+1]-E.A[i])*(x-i)};
  const sOfArc=(E,a)=>{const A=E.A;let lo=0,hi=A.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(A[m]<=a)lo=m;else hi=m}return (lo+Math.max(0,Math.min(1,(a-A[lo])/((A[hi]-A[lo])||1))))*E.step};
  // a plan's ride distance ↔ its ground distance d along plan.seq (straight on past either end). Its edges' rides are
  // added up as far as asked (only the trains drawn ask, mostly near the start of their way).
  function rideEdge(p,i){const a=p.seq[i],b=p.seq[i+1];return edgeArc(p.t.line,Math.min(a.id,b.id),Math.max(a.id,b.id))}
  function rideCum(p,i){const R=p.ride??={cum:[0]};while(R.cum.length<=i){const k=R.cum.length-1;R.cum.push(R.cum[k]+rideEdge(p,k).total)}return R.cum[i]}
  function toRide(p,d){
    if(!isCoaster()||p.seq.length<2)return d;const end=p.cum[p.cum.length-1],last=p.seq.length-1;if(d<=0)return d;if(d>=end)return rideCum(p,last)+d-end;
    let i=0;while(i<last-1&&p.cum[i+1]<d)i++;const E=rideEdge(p,i),t=d-p.cum[i],fw=p.seq[i].id<p.seq[i+1].id;
    return rideCum(p,i)+(fw?arcOf(E,t):E.total-arcOf(E,(p.cum[i+1]-p.cum[i])-t));
  }
  function fromRide(p,a){
    if(!isCoaster()||p.seq.length<2)return a;const last=p.seq.length-1;if(a<=0)return a;
    let i=0;while(i<last&&rideCum(p,i+1)<a)i++;if(i===last)return p.cum[last]+a-rideCum(p,last);
    const E=rideEdge(p,i),r=a-rideCum(p,i),fw=p.seq[i].id<p.seq[i+1].id,L=p.cum[i+1]-p.cum[i];
    return p.cum[i]+(fw?sOfArc(E,r):L-sOfArc(E,E.total-r));
  }
  // 언덕이 다시 지어지면(coasterFresh) · 선로 모양 자료를 새로 받으면 버린다
  function clear(){rideClocks.clear();edgeArcs.clear()}
  return {ridePace,toRide,fromRide,clear};
}
