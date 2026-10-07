// Bus display geometry uses the same OFM centre lines, road profiles and connected
// graph as CityLife. Feed distances remain untouched: they index this display path.
import SEOUL from './city_style_seoul.mjs';
import {RoadGraph} from './city_traffic.mjs';
import {busMercator} from './bus_mesh.mjs';
import {busPointAt} from './bus_motion.mjs';

const EARTH=40075016.685578488, LAT=37.5665, ORIGIN=busMercator([126.978,LAT]);
const MU=1/(EARTH*Math.cos(LAT*Math.PI/180)), CELL=64;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const metric=p=>{const w=busMercator(p);return[(w[0]-ORIGIN[0])/MU,(w[1]-ORIGIN[1])/MU];};
const coordinate=([x,y])=>[(ORIGIN[0]+x*MU-.5)*360,Math.atan(Math.sinh(Math.PI*(1-2*(ORIGIN[1]+y*MU))))*180/Math.PI];
const gridKey=(x,y)=>`${Math.floor(x/CELL)},${Math.floor(y/CELL)}`;
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
  constructor(){this.graph=new RoadGraph();this.tiles=new Map();this.grid=new Map();this.version=0;}
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
    this.grid.clear();
    for(const e of this.graph.edges)for(let i=1;i<e.xs.length;i++){
      const a=[e.xs[i-1],e.ys[i-1]],b=[e.xs[i],e.ys[i]],len=e.cum[i]-e.cum[i-1];if(len<.01)continue;
      const seg={e,a,b,len,s:e.cum[i-1]};
      for(let x=Math.floor(Math.min(a[0],b[0])/CELL);x<=Math.floor(Math.max(a[0],b[0])/CELL);x++)
        for(let y=Math.floor(Math.min(a[1],b[1])/CELL);y<=Math.floor(Math.max(a[1],b[1])/CELL);y++){
          const key=`${x},${y}`;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(seg);
        }
    }
    this.version++;return true;
  }
  candidates(p,heading){
    const [x,y]=metric(p),h=heading*Math.PI/180,hx=Math.sin(h),hy=-Math.cos(h),found=[],seen=new Set();
    for(let gx=-1;gx<=1;gx++)for(let gy=-1;gy<=1;gy++)for(const seg of this.grid.get(gridKey(x+gx*CELL,y+gy*CELL))||[]){
      if(seen.has(seg))continue;seen.add(seg);
      const {e,a,b,len}=seg,dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len,dot=dx*hx+dy*hy,dir=e.oneway|| (dot>=0?1:-1);
      if(dot*dir<.15)continue;
      const along=clamp((x-a[0])*dx+(y-a[1])*dy,0,len),error=Math.hypot(x-a[0]-along*dx,y-a[1]-along*dy);
      if(error>45)continue;
      found.push({e,s:seg.s+along,dir,error,score:error+(1-dot*dir)*22+(e.cls==='service'?5:0)});
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
  // 노선 표시선을 심시티가 그리는 도로(같은 OFM 중심선 · 폭) 안으로: STEP m 마다 진행 방향이 맞는
  // 도로 중심선에 내리고, 맞는 도로가 없으면 원래 점을 둔다(선이 끊기지 않게). 차로 쪽으로 밀지 않는다.
  // 분리 차도는 진행 방향으로 자기 차도를 고르므로, 한 줄로 모아 둔 상하행이 각자 차도로 갈라진다.
  snapLine(path,box=null,step=6){
    const samples=[];let previous=null;
    const inside=p=>!box||(p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3]);
    for(let s=0;;s=Math.min(path.total,s+step)){
      const pose=busPointAt(path,s);let point={distance:s,coordinate:pose.coordinate,lane:pose.coordinate,laneWidth:3,width:null};
      if(inside(pose.coordinate)){
        const found=this.candidates(pose.coordinate,pose.heading).filter(c=>c.error<=25&&c.e.cls!=='service');
        // 앞 점과 같은 도로가 거의 비슷하게 가까우면 그대로 간다(교차로에서 옆길로 튀지 않게).
        const keep=previous&&found.find(c=>c.e===previous.e&&c.dir===previous.dir&&c.error<=found[0].error+4);
        const c=keep||found[0];
        if(c){
          // 선은 도로 중심선, 버스는 같은 자리에서 진행 방향 오른쪽 바깥 차로(lane)로.
          const {offset,laneWidth}=busRoadLane(c.e),p=this.graph.poseAt(c.e,c.s,0,c.dir),q=this.graph.poseAt(c.e,c.s,offset,c.dir);
          point={distance:s,coordinate:coordinate([p.x,p.y]),lane:coordinate([q.x,q.y]),laneWidth,width:c.e.width};
        }
        previous=c||null;
      }else previous=null;
      samples.push(point);
      if(s>=path.total)break;
    }
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
