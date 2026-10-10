// Bus display geometry uses the same OFM centre lines, road profiles and connected
// graph as CityLife. Feed distances remain untouched: they index this display path.
import SEOUL from '../modes/basic/city.mjs';
import {RoadGraph} from '../city/traffic.mjs';
import {busMercator} from './mesh.mjs';
import {busPointAt} from './motion.mjs';

const EARTH=40075016.685578488, LAT=37.5665, ORIGIN=busMercator([126.978,LAT]);
const MU=1/(EARTH*Math.cos(LAT*Math.PI/180)), CELL=64;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const metric=p=>{const w=busMercator(p);return[(w[0]-ORIGIN[0])/MU,(w[1]-ORIGIN[1])/MU];};
const coordinate=([x,y])=>[(ORIGIN[0]+x*MU-.5)*360,Math.atan(Math.sinh(Math.PI*(1-2*(ORIGIN[1]+y*MU))))*180/Math.PI];
const gridKey=(x,y)=>`${Math.floor(x/CELL)},${Math.floor(y/CELL)}`;
const cellId=(cx,cy)=>(cx+1e6)*2e6+(cy+1e6); // 문자열 없이 칸을 찾는 숫자 키(서울 반경 수백 km 안에서 겹치지 않는다)
export const busMetresPerPixel=(zoom,lat=37.5)=>EARTH*Math.cos(lat*Math.PI/180)/(512*2**zoom);

export function busRoadProfile(p,pack=SEOUL){
  const cls=pack.roads.aliases?.[p.class]??p.class,spec=pack.roads.classes[cls];
  if(!spec||p.brunnel==='tunnel')return null;
  const oneway=p.oneway===1?1:p.oneway===-1?-1:0,ramp=p.ramp===1;
  const width=spec.widthM*(oneway?.72:1)*(ramp?.55:1);
  const lanes=oneway?(width<7?1:Math.max(2,2*Math.round(width/6.6))):Math.max(1,Math.round(width/3.5/2));
  return {cls:p.class,width,lanes,oneway,ramp,level:p.brunnel==='bridge'?1:0,sidewalk:ramp?0:spec.sidewalkM};
}
export function busRoadLane(road){
  if(!road)return {offset:1.5,laneWidth:3}; // One lane at most; never a zoom-driven metre offset.
  const laneWidth=road.width/(road.lanes*(road.oneway?1:2));
  return {offset:Math.max(0,road.width/2-laneWidth/2),laneWidth};
}

export class BusRoadNetwork {
  constructor(){this.graph=new RoadGraph();this.tiles=new Map();this.grid=new Map();this.cells=new Set();this.version=0;}
  update(features){
    const groups=new Map();
    for(const f of features){
      const t=f.tile;if(t&&t.z<14)continue; // Coarse overview tiles cannot position a vehicle.
      const profile=busRoadProfile(f.properties||{}),g=f.geometry;
      if(!profile||!['LineString','MultiLineString'].includes(g?.type))continue;
      const key=t?`${t.z}/${t.x}/${t.y}`:'fixture';
      if(!groups.has(key))groups.set(key,{t,lines:[],seen:new Set()});
      const group=groups.get(key);
      for(const cs of g.type==='LineString'?[g.coordinates]:g.coordinates){
        const id=JSON.stringify([profile,cs]);if(group.seen.has(id))continue;group.seen.add(id);
        group.lines.push({...profile,pts:cs.map(metric)});
      }
    }
    let changed=false;
    for(const [key,g] of groups){
      const signature=[...g.seen].sort().join('|'),old=this.tiles.get(key);
      this.tiles.delete(key);this.tiles.set(key,signature);
      if(old===signature)continue;
      const n=g.t?2**g.t.z:0;
      const box=g.t?[(g.t.x/n-ORIGIN[0])/MU,(g.t.y/n-ORIGIN[1])/MU,((g.t.x+1)/n-ORIGIN[0])/MU,((g.t.y+1)/n-ORIGIN[1])/MU]:[-1e6,-1e6,1e6,1e6];
      this.graph.addCell(key,g.lines,box);changed=true;
    }
    while(this.tiles.size>32){const key=this.tiles.keys().next().value;this.tiles.delete(key);this.graph.removeCell(key);changed=true;}
    if(!changed)return false;
    this.grid.clear();this.cells.clear();
    for(const e of this.graph.edges)for(let i=1;i<e.xs.length;i++){
      const a=[e.xs[i-1],e.ys[i-1]],b=[e.xs[i],e.ys[i]],len=e.cum[i]-e.cum[i-1];if(len<.01)continue;
      const seg={e,a,b,len,s:e.cum[i-1]};
      for(let x=Math.floor(Math.min(a[0],b[0])/CELL);x<=Math.floor(Math.max(a[0],b[0])/CELL);x++)
        for(let y=Math.floor(Math.min(a[1],b[1])/CELL);y<=Math.floor(Math.max(a[1],b[1])/CELL);y++){
          const key=`${x},${y}`;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(seg);this.cells.add(cellId(x,y));
        }
    }
    this.version++;return true;
  }
  near(x,y){
    const cx=Math.floor(x/CELL),cy=Math.floor(y/CELL);
    for(let gx=-1;gx<=1;gx++)for(let gy=-1;gy<=1;gy++)if(this.cells.has(cellId(cx+gx,cy+gy)))return true;
    return false;
  }
  candidates(p,heading){
    const [x,y]=metric(p),h=heading*Math.PI/180,hx=Math.sin(h),hy=-Math.cos(h),found=[],seen=new Set();
    for(let gx=-1;gx<=1;gx++)for(let gy=-1;gy<=1;gy++)for(const seg of this.grid.get(gridKey(x+gx*CELL,y+gy*CELL))||[]){
      if(seen.has(seg))continue;seen.add(seg);
      const {e,a,b,len}=seg,dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len,dot=dx*hx+dy*hy,dir=e.oneway|| (dot>=0?1:-1);
      if(dot*dir<.15)continue;
      const along=clamp((x-a[0])*dx+(y-a[1])*dy,0,len),error=Math.hypot(x-a[0]-along*dx,y-a[1]-along*dy);
      if(error>45)continue;
      found.push({e,s:seg.s+along,dir,error,score:error+(1-dot*dir)*22+(e.cls==='service'?5:0),x:a[0]+along*dx,y:a[1]+along*dy});
    }
    return found.sort((a,b)=>a.score-b.score).filter((a,i,all)=>all.findIndex(b=>b.e===a.e&&b.dir===a.dir)===i).slice(0,5);
  }
  connect(a,b,limit){
    if(a.e===b.e&&a.dir===b.dir&&(b.s-a.s)*a.dir>=-.1)
      return {length:Math.abs(b.s-a.s),parts:[{e:a.e,from:a.s,to:b.s,dir:a.dir}]};
    const start=a.dir>0?a.e.b:a.e.a,goal=b.dir>0?b.e.a:b.e.b;
    const first={e:a.e,from:a.s,to:a.dir>0?a.e.len:0,dir:a.dir},last={e:b.e,from:b.dir>0?0:b.e.len,to:b.s,dir:b.dir};
    const tail=Math.abs(last.to-last.from),queue=[{node:start,cost:Math.abs(first.to-first.from),parts:[first]}],best=new Map();let visits=0;
    while(queue.length&&visits++<160){
      queue.sort((x,y)=>y.cost-x.cost);const q=queue.pop();
      if(q.cost+tail>limit||q.cost>=(best.get(q.node)??Infinity))continue;best.set(q.node,q.cost);
      if(q.node===goal)return {length:q.cost+tail,parts:[...q.parts,last]};
      for(const {e,end} of q.node.out){
        const dir=end===0?1:-1;if(e.oneway&&e.oneway!==dir)continue;
        const next=dir>0?e.b:e.a,cost=q.cost+e.len;
        if(cost+tail<=limit&&cost<(best.get(next)??Infinity))queue.push({node:next,cost,parts:[...q.parts,{e,from:dir>0?0:e.len,to:dir>0?e.len:0,dir}]});
      }
    }
    return this.joinOnRoad(a,b);
  }
  joinOnRoad(a,b){
    // OFM occasionally gives contiguous ways endpoints just outside RoadGraph's
    // 0.7m node tolerance. Only bridge a near-straight seam whose entire lane
    // (including its casing) is covered by same-level road surfaces.
    if(a.e.level!==b.e.level)return null;
    const A=this.graph.poseAt(a.e,a.s,0,a.dir),B=this.graph.poseAt(b.e,b.s,0,b.dir);
    if(A.fx*B.fx+A.fy*B.fy<.96)return null;
    const laneA=busRoadLane(a.e),laneB=busRoadLane(b.e),laneWidth=Math.min(laneA.laneWidth,laneB.laneWidth);
    const p=[A.x-A.fy*laneA.offset,A.y+A.fx*laneA.offset],q=[B.x-B.fy*laneB.offset,B.y+B.fx*laneB.offset],length=Math.hypot(q[0]-p[0],q[1]-p[1]);
    if(length>45||(q[0]-p[0])*A.fx+(q[1]-p[1])*A.fy<-.1)return null;
    const steps=Math.max(1,Math.ceil(length));
    for(let i=0;i<=steps;i++){
      const x=p[0]+(q[0]-p[0])*i/steps,y=p[1]+(q[1]-p[1])*i/steps;let inside=false;
      for(let gx=-1;gx<=1&&!inside;gx++)for(let gy=-1;gy<=1&&!inside;gy++)for(const seg of this.grid.get(gridKey(x+gx*CELL,y+gy*CELL))||[]){
        if(seg.e.level!==a.e.level)continue;
        const dx=seg.b[0]-seg.a[0],dy=seg.b[1]-seg.a[1],t=clamp(((x-seg.a[0])*dx+(y-seg.a[1])*dy)/(seg.len*seg.len),0,1);
        if(Math.hypot(x-seg.a[0]-dx*t,y-seg.a[1]-dy*t)+laneWidth*.46<=seg.e.width/2){inside=true;break;}
      }
      if(!inside)return null;
    }
    return {length,points:[{coordinate:coordinate(p),width:a.e.width,laneWidth,offset:laneA.offset,edge:a.e.id},
      {coordinate:coordinate(q),width:b.e.width,laneWidth,offset:laneB.offset,edge:b.e.id}]};
  }
  partPoints({e,from,to,dir}){
    const {offset,laneWidth}=busRoadLane(e),distances=[from,...Array.from(e.cum).filter(s=>s>Math.min(from,to)+.01&&s<Math.max(from,to)-.01),to].sort((a,b)=>(a-b)*dir),points=[];
    for(let i=0;i<distances.length;i++){
      const s=distances[i],sides=i===0?[dir]:i===distances.length-1?[-dir]:[-dir,dir];
      for(const side of sides){
        // Bevel bends inside the road instead of extending a mitre beyond the kerb.
        const centre=this.graph.poseAt(e,s,0,dir),tangent=this.graph.poseAt(e,clamp(s+side*.01,0,e.len),0,dir);
        points.push({coordinate:coordinate([centre.x-tangent.fy*offset,centre.y+tangent.fx*offset]),width:e.width,laneWidth,offset,edge:e.id});
      }
    }
    return points;
  }
  // 노선 표시선을 심시티가 그리는 도로(같은 OFM 중심선 · 폭) 안으로: STEP m 마다 진행 방향이 맞는 도로 후보를
  // 찾고, 노선 전체에서 한 번에 고른다(비터비). 점마다 따로 가장 가까운 도로를 고르면 나란한 길(서부간선 ·
  // 안양천로)이나 분리 차도 사이를 지나는 곳에서 선이 이 길 저 길로 옮겨 다니며 지그재그가 됐다. 그래서
  // 도로에서 조금 먼 것(error)보다 옆 도로로 건너뛰는 것(앞 점과의 거리가 STEP 보다 긴 만큼)을 더 비싸게 친다.
  // 맞는 도로가 없으면 원래 점을 둔다(선이 끊기지 않게). 차로 쪽으로 밀지 않는다.
  // 분리 차도는 진행 방향으로 자기 차도를 고르므로, 한 줄로 모아 둔 상하행이 각자 차도로 갈라진다.
  snapLine(path,box=null,step=6){
    const inside=p=>!box||(p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3]),layers=[];
    const poses=[];for(let s=0;;s=Math.min(path.total,s+step)){poses.push(busPointAt(path,s));if(s>=path.total)break;}
    const at=poses.map(p=>metric(p.coordinate)),headings=chordHeadings(at,poses,step);
    for(let i=0;i<poses.length;i++){
      const s=Math.min(path.total,i*step),pose=poses[i],[x,y]=at[i],states=[{c:null,x,y,emit:SNAP_NONE}];
      // 진행 방향은 앞뒤 CHORD m 를 이은 방향: 선에 남은 몇 m 짜리 되돌이 꺾임에서 방향이 뒤집혀
      // 반대 차도로 건너가지 않게.
      const heading=headings[i],h=heading*Math.PI/180,hx=Math.sin(h),hy=-Math.cos(h);
      // 근처에 불러온 도로 칸이 없으면(화면 밖 대부분) 후보를 찾지 않는다 — 타일이 들어올 때마다 노선 전체를 다시 붙인다.
      if(inside(pose.coordinate)&&this.near(x,y)){
        for(const c of this.candidates(pose.coordinate,heading)){
          if(c.error>25||c.e.cls==='service')continue;
          states.push({c,x:c.x,y:c.y,emit:c.score}); // 후보를 찾을 때 내린 도로 중심선 위 자리
        }
      }
      const previous=layers.at(-1),gap=previous?s-previous.s:0;
      for(const st of states){
        st.cost=st.emit;st.back=-1;
        if(!previous)continue;
        let best=Infinity;
        for(let k=0;k<previous.states.length;k++){
          const q=previous.states[k];
          // 옆으로(진행 방향에 수직) 건너뛴 만큼과, 앞으로 간 거리가 샘플 간격과 다른 만큼
          const dx=st.x-q.x,dy=st.y-q.y,along=dx*hx+dy*hy,side=Math.abs(dx*hy-dy*hx);
          let move=Math.max(0,side-1)*SNAP_HOP+Math.max(0,Math.abs(along-gap)-2)*SNAP_HOP/3;
          if(q.c&&st.c&&q.c.e===st.c.e&&q.c.dir!==st.c.dir)move+=SNAP_HOP*10; // 같은 도로에서 방향만 뒤집기
          else if(q.c&&st.c&&q.c.e!==st.c.e)move+=.5;                        // 비슷하면 가던 도로
          if(q.cost+move<best){best=q.cost+move;st.back=k;}
        }
        st.cost+=best;
      }
      layers.push({s,pose,states});
    }
    const samples=new Array(layers.length),xy=new Float64Array(layers.length*2);
    let k=layers.at(-1).states.reduce((m,st,i,all)=>st.cost<all[m].cost?i:m,0);
    for(let i=layers.length-1;i>=0;i--){
      const {s,pose,states}=layers[i],c=states[k].c;
      xy[i*2]=states[k].x;xy[i*2+1]=states[k].y;
      if(c){
        // 선은 도로 중심선, 버스는 같은 자리에서 진행 방향 오른쪽 바깥 차로(lane)로.
        const {offset,laneWidth}=busRoadLane(c.e),q=this.graph.poseAt(c.e,c.s,offset,c.dir);
        samples[i]={distance:s,coordinate:coordinate([states[k].x,states[k].y]),lane:coordinate([q.x,q.y]),laneWidth,width:c.e.width};
      }else samples[i]={distance:s,coordinate:pose.coordinate,lane:pose.coordinate,laneWidth:3,width:null};
      k=states[k].back;
    }
    straightenHops(samples,headings,step,xy);
    easeSwitches(samples,headings,xy);
    return {samples,step,version:this.version};
  }
  // 심시티 차도(중심선 ± 폭/2) 안에 찍힌 정류장을 차도 끝 너머 인도로 옮긴다. 고가 도로도 위에서 보면 정류장을
  // 덮으므로 함께 피한다(화랑대역: 북부간선 고가 밑). 양쪽으로 밀어 보고 덜 움직이는 쪽을 고른다.
  // 한 방향으로 계속 밀어서 분리 차도 · 고가가 이어지면 그 너머까지 간다. 차도 끝 1.5 m 안(좁은 틈)도 도로 위로 본다.
  roadAt(x,y,decks=true){
    let hit=null;
    for(let gx=-1;gx<=1;gx++)for(let gy=-1;gy<=1;gy++)for(const seg of this.grid.get(gridKey(x+gx*CELL,y+gy*CELL))||[]){
      if(seg.e.cls==='service'||(!decks&&seg.e.level!==0))continue;
      const dx=(seg.b[0]-seg.a[0])/seg.len,dy=(seg.b[1]-seg.a[1])/seg.len,t=(x-seg.a[0])*dx+(y-seg.a[1])*dy;
      if(t<0||t>seg.len)continue;
      const d=(x-seg.a[0])*-dy+(y-seg.a[1])*dx,half=seg.e.width/2;
      if(Math.abs(d)<half+1.5&&(!hit||Math.abs(d)<Math.abs(hit.d)))hit={d,nx:-dy,ny:dx,half,walk:seg.e.sidewalk||3};
    }
    return hit;
  }
  kerbside(p){
    // 고가까지 넘으면 30 m 넘게 멀어지는 곳은 지상 차도 끝까지만 옮긴다(정류장이 버스 길에서 너무 멀어지지 않게).
    const [x0,y0]=metric(p),far=this.kerbMove(x0,y0,true),best=far&&far.moved<=30?far:this.kerbMove(x0,y0,false);
    return best?coordinate([best.x,best.y]):p;
  }
  kerbMove(x0,y0,decks){
    const first=this.roadAt(x0,y0,decks);if(!first)return null;
    let best=null;
    for(const side of [1,-1]){
      const push=[first.nx*side,first.ny*side];let x=x0,y=y0,hit=first,ok=false;
      for(let round=0;round<8;round++){
        const along=hit.nx*push[0]+hit.ny*push[1];if(Math.abs(along)<.3)break;
        const target=(along>0?1:-1)*(hit.half+Math.max(2,Math.min(hit.walk,4)/2));
        const move=(target-hit.d)/along;x+=push[0]*move;y+=push[1]*move;
        hit=this.roadAt(x,y,decks);if(!hit){ok=true;break;}
      }
      const moved=Math.hypot(x-x0,y-y0);
      if(ok&&(!best||moved<best.moved))best={x,y,moved};
    }
    return best;
  }
  match(path){
    const chunks=[];let previous=null,chunk=null,matched=0,total=0;
    for(let i=1;i<path.points.length;i++){
      const start=path.distances[i-1],length=path.distances[i]-start,steps=Math.max(1,Math.ceil(length/24));
      for(let j=i===1?0:1;j<=steps;j++){
        const distance=start+length*j/steps,pose=busPointAt(path,distance),candidates=this.candidates(pose.coordinate,pose.heading);total++;
        if(!candidates.length){previous=null;chunk=null;continue;}
        let picked=candidates[0],link=null;
        if(previous){
          const delta=distance-previous.distance;let score=Infinity;
          for(const c of candidates){
            const joined=this.connect(previous,c,delta*3+35);if(!joined)continue;
            const cost=c.score+Math.abs(joined.length-delta)*.6;
            if(cost<score){score=cost;picked=c;link=joined;}
          }
        }
        matched++;
        if(link){
          const points=link.points??link.parts.flatMap(part=>this.partPoints(part)),lengths=[0];
          for(let k=1;k<points.length;k++){const a=metric(points[k-1].coordinate),b=metric(points[k].coordinate);lengths.push(lengths.at(-1)+Math.hypot(a[0]-b[0],a[1]-b[1]));}
          const length=lengths.at(-1)||1;
          points.forEach((p,k)=>{p.distance=previous.distance+(distance-previous.distance)*lengths[k]/length;});
          if(!chunk){chunk=[];chunks.push(chunk);}chunk.push(...points);
        }else chunk=null;
        previous={...picked,distance};
      }
    }
    return {chunks:chunks.filter(c=>c.length>1),matched,total,version:this.version};
  }
}

// SNAP_NONE: 도로를 못 찾은 점의 값(어떤 후보보다 비싸게) · SNAP_HOP: 옆 도로로 건너뛴 1 m 의 값
const CHORD=12,HOP_RUN=6,SNAP_NONE=45,SNAP_HOP=6;
// 샘플마다 앞뒤 CHORD m(샘플 몇 개) 를 이은 방향(도, 북쪽에서 시계 방향)
function chordHeadings(at,poses,step){
  const n=Math.max(1,Math.round(CHORD/step));
  return at.map((p,i)=>{
    const A=at[Math.max(0,i-n)],B=at[Math.min(at.length-1,i+n)],dx=B[0]-A[0],dy=B[1]-A[1];
    return Math.hypot(dx,dy)<1?poses[i].heading:(Math.atan2(dx,-dy)*180/Math.PI+360)%360;
  });
}
// 곧은 길에서 앞뒤 샘플은 같은 처지(둘 다 도로에 붙음 · 둘 다 도로 못 찾음)인데 그 사이 HOP_RUN 개(36 m) 이하만
// 옆 도로 · 반대 차도 · 원래 선으로 튀었다 돌아오면(지그재그 · 가로 막대) 그 조각을 앞뒤 샘플 사이 곧은 선으로
// 바꾼다. 도로 타일이 덜 들어온 가장자리에서 샘플 하나만 옆 골목에 붙는 것도 같다.
// 꺾이는 길(교차로 회전)은 건드리지 않는다. 길게 못 찾은 구간(지하차도 등)도 그대로 둔다.
// xy: 샘플 중심선 자리(m) — 샘플마다 좌표를 다시 바꾸지 않게 같이 고친다.
function straightenHops(S,H,step,xy){
  const jump=step*1.5,dist=(i,j)=>Math.hypot(xy[i*2]-xy[j*2],xy[i*2+1]-xy[j*2+1]);
  const turn=(i,j)=>{const d=Math.abs(H[i]-H[j])%360;return Math.min(d,360-d);};
  const hop=(i,j)=>!S[i].width!==!S[j].width||dist(i,j)>jump;
  for(let i=1;i<S.length-1;i++){
    const a=S[i-1];if(!hop(i-1,i))continue;
    for(let j=i;j<Math.min(S.length-1,i+HOP_RUN);j++){
      const b=S[j+1];if(!a.width!==!b.width||!hop(j,j+1))continue;
      if(dist(i-1,j+1)>(b.distance-a.distance)*1.3+8||turn(i-1,j+1)>30)continue;
      for(let k=i;k<=j;k++){
        const t=(S[k].distance-a.distance)/(b.distance-a.distance),mix=(p,q)=>p.map((v,n)=>v+(q[n]-v)*t);
        S[k]={distance:S[k].distance,coordinate:mix(a.coordinate,b.coordinate),lane:mix(a.lane,b.lane),laneWidth:a.laneWidth,width:a.width};
        for(const n of [0,1])xy[k*2+n]=xy[(i-1)*2+n]+(xy[(j+1)*2+n]-xy[(i-1)*2+n])*t;
      }
      i=j;break;
    }
  }
}

// 정말 다른 도로로 옮겨 가는 곳(램프 → 간선처럼 중심선이 옆으로 몇 m 떨어진 곳)은 한 샘플에서 꺾지 않고
// 앞뒤 두 샘플씩(24 m)에 걸쳐 1-2-3-2-1 로 섞어 부드럽게 옮긴다. 교차로 회전은 둥글리지 않는다.
function easeSwitches(S,H,xy){
  const W=[1,2,3,2,1],old=S.map(p=>({coordinate:p.coordinate,lane:p.lane})),m=p=>[xy[p*2],xy[p*2+1]];
  const turn=(i,j)=>{const d=Math.abs(H[i]-H[j])%360;return Math.min(d,360-d);};
  for(let i=3;i<S.length-3;i++){
    if(!S[i-1].width||!S[i].width)continue;
    const a=m(i-1),b=m(i),A=m(i-2),dx=a[0]-A[0],dy=a[1]-A[1],l=Math.hypot(dx,dy);
    if(l<.5||Math.abs((b[0]-a[0])*dy-(b[1]-a[1])*dx)/l<2||turn(i-3,i+2)>30)continue;
    for(let k=Math.max(2,i-2);k<=Math.min(S.length-3,i+1);k++){
      if(!S[k].width)continue;
      const mix=key=>[0,1].map(n=>W.reduce((sum,w,j)=>sum+w*old[k-2+j][key][n],0)/9);
      S[k]={...S[k],coordinate:mix('coordinate'),lane:mix('lane')};
    }
  }
}

// 노선 선(snapLine) 위 distance 지점의 버스 자리: 그 도로의 진행 방향 오른쪽 차로. 선이 끊기지 않으므로 늘 있다.
export function busLinePointAt(snapped,distance){
  const S=snapped.samples,i=clamp(Math.floor(distance/snapped.step),0,Math.max(0,S.length-2)),a=S[i],b=S[Math.min(S.length-1,i+1)];
  const t=clamp((distance-a.distance)/((b.distance-a.distance)||1),0,1),A=metric(a.lane),B=metric(b.lane);
  // 같은 점 두 개면 앞뒤 샘플로 방향을 잡는다.
  let H=[B[0]-A[0],B[1]-A[1]];
  if(Math.hypot(...H)<.01){const P=metric(S[Math.max(0,i-1)].lane),Q=metric(S[Math.min(S.length-1,i+2)].lane);H=[Q[0]-P[0],Q[1]-P[1]];}
  return {coordinate:a.lane.map((v,k)=>v+(b.lane[k]-v)*t),heading:(Math.atan2(H[0],-H[1])*180/Math.PI+360)%360,
    laneWidth:Math.min(a.laneWidth,b.laneWidth),width:Math.min(a.width??6,b.width??6),distance};
}

export function busRoadPointAt(matched,distance){
  for(const chunk of matched.chunks){
    if(distance<chunk[0].distance||distance>chunk.at(-1).distance)continue;
    let lo=0,hi=chunk.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(chunk[mid].distance<=distance)lo=mid;else hi=mid;}
    const a=chunk[lo],b=chunk[hi],t=clamp((distance-a.distance)/(b.distance-a.distance||1),0,1),A=metric(a.coordinate),B=metric(b.coordinate);
    return {coordinate:a.coordinate.map((v,i)=>v+(b.coordinate[i]-v)*t),heading:(Math.atan2(B[0]-A[0],A[1]-B[1])*180/Math.PI+360)%360,
      laneWidth:Math.min(a.laneWidth,b.laneWidth),width:Math.min(a.width,b.width),distance};
  }
  return null; // Missing/disconnected roads must not create a shortcut through a building.
}
