// 롤코 선로 GL 층(열차 캔버스, 열차 아래): 방향마다 노선색 레일 두 줄 · 상자 거더 · 침목 · 흰 기둥. 조각은 지도 좌표로 한 번 짓고 줌마다 다시 짓지 않는다.
// 다른 화면 파일을 import 하지 않는다: 언덕 계산(coasterAt · coasterProfile …) · 지도 · 노선 자료는 본체가 넘기고, 바뀌는 값은 isCoaster · getSelected 로 읽는다.
import { PARK_DEFAULTS as COASTER_STYLE } from '../basic/park.mjs'; import { trackMetrics, zoomFade } from './metrics.mts';
import CITY_STYLE from '../basic/city.mjs';
import type { LngLatLike, Map as MapLibre, MercatorCoordinate } from 'maplibre-gl';
import type { CityViaduct } from '../../city/viaduct.mts';
import type { LinePaths } from '../../lib/routing.mts';
import type { MapStation } from '../../trains/types.mts';
import type { createCoasterGeometry } from './geometry.mts';
import type { buildCoasterTrackMesh as BuildMesh, coasterTrackVertexShader as TrackVS, TrackSample } from './track_mesh.mts';
import type { CoasterPoint, CoasterProfile, EdgeGeom } from './types.mts';
const BULB_EVERY=COASTER_STYLE.night.bulbEveryM;const COL_SPAN=COASTER_STYLE.supports.spanM[0]!,COL_AFRAME=COASTER_STYLE.supports.aHeightM,COL_CLEAR=COASTER_STYLE.supports.clearM;   // supports (CoasterTrack.columns): m between them low down, A-frames from, clear of another line's
// 메시 · 셰이더(coaster_track_mesh)는 본체가 직접 import 해서 넘긴다: 여기서 import 하면 이 파일을 받은 뒤에야 요청해 첫 화면 요청이 한 단계 늦어진다
type CoasterGeometry = ReturnType<typeof createCoasterGeometry>;
// 본체가 넘기는 것(이 파일이 쓰는 칸만)
export interface CoasterTrackDeps {
  buildCoasterTrackMesh:typeof BuildMesh; coasterTrackVertexShader:typeof TrackVS; COASTER_TRACK_FS:string;
  map:MapLibre; maplibregl:{ MercatorCoordinate:typeof MercatorCoordinate }; HOME:{ center:LngLatLike };
  paths:LinePaths; byId:Map<number, MapStation>; colors:Record<string, string>; geom:(line:string, a:number, b:number)=>EdgeGeom;
  coasterProfile:(line:string, lo:number, hi:number)=>CoasterProfile; coasterAt:(line:string, lo:number, hi:number, s:number)=>CoasterPoint;
  coasterRises:(line:string, lo:number, hi:number)=>[number, number][]; loopD:CoasterGeometry['loopD']; corkOf:CoasterGeometry['corkOf'];
  rolled:CoasterGeometry['rolled']; CORK_HEART:number; edgeOffset:(line:string, a:number, b:number)=>number; hexRGB:(v:string)=>number[];
  coasterBodyPx:(zoom:number)=>number; cityViaduct:CityViaduct; PHONE:boolean; trainFrameSoon:(ms:number)=>void; isCoaster:()=>boolean;
  getSelected:()=>string; getJourney?:()=>Parameters<CityViaduct['journeyFocus']>[0];
}
// 역 사이 하나(방향 없이 lo < hi) · 그 조각(~400 m — 화면 안인지 볼 상자 box) · 지은 GPU 버퍼(b · 꼭짓점 수 n · 마지막에 그린 프레임 f)
interface TrackEdge { id:string; line:string; lo:number; hi:number }
interface TrackPiece { id:string; e:TrackEdge; s0:number; s1:number; box:[number, number, number, number] }
interface BuiltPiece { b:WebGLBuffer | null; n:number; f?:number }
// 선로 위 점(sampler): 땅 점 x · y · 앞 fx · fy, 높이 h · 고가 위 높이 up · 기울기 roll, 루프 · 코르크스크루 · 타워 고리 안이면 loop
interface TrackPos { x:number; y:number; fx:number; fy:number; h:number; up:number; roll:number; loop:boolean }
// 선로 메시에 넘기는 점(piece 의 at): 루프 · 기울기도 담는다(줄일 때 본다)
interface TrackAt extends TrackSample { loop:boolean; roll:number }
type TrackAttr = 'a_p' | 'a_r' | 'a_o' | 'a_z' | 'a_f' | 'a_u' | 'a_c';
type TrackUniform = 'u_matrix' | 'u_unit' | 'u_lane' | 'u_body' | 'u_girder' | 'u_post' | 'u_spine' | 'u_concrete' | 'u_rail' | 'u_bed' | 'u_size' | 'u_detail' | 'u_alpha' | 'u_route' | 'u_dim' | 'u_veil';
export function createCoasterTrack({buildCoasterTrackMesh,coasterTrackVertexShader,COASTER_TRACK_FS,map,maplibregl,HOME,paths,byId,colors,geom,coasterProfile,coasterAt,coasterRises,loopD,corkOf,rolled,CORK_HEART,edgeOffset,hexRGB,coasterBodyPx,cityViaduct,PHONE,trainFrameSoon,isCoaster,getSelected,getJourney=()=>null}:CoasterTrackDeps){
  // 롤러코스터 track (see coasterAt), drawn on the train canvas under the trains: per direction a pair of
  // rails in the line's colour on a box girder, sleepers, and white columns down to the ground.
  // Built per edge in map space once (lane offsets in px are applied in the shader, so zoom needs no rebuild).
  const RAIL_LEAD=12;   // m: 롤코 레일이 고가 상판 위로 이어지는 길이(상판에서 솟아 나오게)
  const TRACK_BYTES=PHONE?COASTER_STYLE.performance.phoneTrackBytes:COASTER_STYLE.performance.trackBytes;   // GPU memory for the built track pieces (the next levels are built ahead only below 80 %: else they went out as fast as built)
  class CoasterTrack{
    // 필드는 선언만(declare — 실행 코드 없음, 값은 지금처럼 init · pieces · columns · bulbs · render 가 넣는다)
    declare p:WebGLProgram; declare attr:Record<TrackAttr, number>; declare uni:Record<TrackUniform, WebGLUniformLocation | null>; declare gl:WebGL2RenderingContext;
    declare M:Float32Array; declare cache:Map<string, BuiltPiece>; declare O:MercatorCoordinate; declare edges:TrackEdge[]; declare list:TrackPiece[] | null;
    declare cols:Map<string, number[]> | null; declare bulbPts:Float64Array | null; declare bulbRgb:Uint8Array; declare bytes:number; declare frame:number; declare stale:boolean;
    init(gl:WebGL2RenderingContext){
      const vs=coasterTrackVertexShader(CORK_HEART),fs=COASTER_TRACK_FS;   // coaster: geometry/materials live outside the shared runtime
      const sh=(t:number,src:string)=>{const x=gl.createShader(t)!;gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x)!);return x};
      this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
      this.attr=Object.fromEntries((['a_p','a_r','a_o','a_z','a_f','a_u','a_c'] as const).map(n=>[n,gl.getAttribLocation(this.p,n)])) as Record<TrackAttr, number>;
      this.uni=Object.fromEntries((['u_matrix','u_unit','u_lane','u_body','u_girder','u_post','u_spine','u_concrete','u_rail','u_bed','u_size','u_detail','u_alpha','u_route','u_dim','u_veil'] as const).map(n=>[n,gl.getUniformLocation(this.p,n)])) as Record<TrackUniform, WebGLUniformLocation | null>;
      this.gl=gl;this.M=new Float32Array(16);this.cache=new Map();
      this.O=maplibregl.MercatorCoordinate.fromLngLat(HOME.center);
      const seen=new Set<string>();this.edges=[];
      for(const [line,chunks] of Object.entries(paths))for(const ids of chunks)for(let i=1;i<ids.length;i++){
        const lo=Math.min(ids[i-1]!,ids[i]!),hi=Math.max(ids[i-1]!,ids[i]!),id=`${line}:${lo}:${hi}`;if(seen.has(id)||!byId.has(lo)||!byId.has(hi))continue;seen.add(id);this.edges.push({id,line,lo,hi})}
    }
    // Built in pieces of ~400 m (a whole long edge at 8 m took up to 0.25 s), each with its own GPU buffer, uploaded once.
    // 22 floats a vertex — x y h hf (hf 0: on the ground) · R (across, flat) · px across: offset, ×lane, ×body, raw ·
    // px along F, px along U · F (along the track) · U (the track's up) · rgb shade (shade < 0: the post colour)
    pieces(){
      if(this.list)return this.list;this.list=[];
      for(const e of this.edges){const g=geom(e.line,e.lo,e.hi),mu=g.pts[0]!.meterInMercatorCoordinateUnits(),k=Math.max(1,Math.round(g.total/mu/400)),H=coasterProfile(e.line,e.lo,e.hi);
        for(let j=0;j<k;j++){const s0=g.total*j/k,s1=g.total*(j+1)/k;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,top=0;
          for(let i=Math.floor(j/k*H.n);i<=Math.min(H.n,Math.ceil((j+1)/k*H.n));i++)top=Math.max(top,H.h[i]!);const pad=(70+top*1.5)*mu;   // tall ones stand out of view on screen: a wider margin
          for(let i=0;i<g.pts.length;i++){if(i+1<g.pts.length&&g.cum[i+1]!<s0)continue;if(i&&g.cum[i-1]!>s1)break;const q=g.pts[i]!;x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)}
          this.list.push({id:`${e.id}:${j}`,e,s0,s1,box:[x0-pad,y0-pad,x1+pad,y1+pad]})}}
      return this.list;
    }
    // the edge's point s (mercator units along it) on the coaster: ground point under it, height, lateral swing and roll
    sampler(e:TrackEdge){
      const g=geom(e.line,e.lo,e.hi);
      const ground=(s:number)=>{let i=1,j=g.pts.length-1;while(i<j){const m=(i+j)>>1;if(g.cum[m]!<s)i=m+1;else j=m}const A=g.pts[i-1]!,B=g.pts[i]!,u=Math.max(0,Math.min(1,(s-g.cum[i-1]!)/((g.cum[i]!-g.cum[i-1]!)||1))),l=Math.hypot(B.x-A.x,B.y-A.y)||1;
        return {x:A.x+(B.x-A.x)*u,y:A.y+(B.y-A.y)*u,fx:(B.x-A.x)/l,fy:(B.y-A.y)/l}};   // i: first point at or past s, found by halving
      return (s:number)=>{const [sg,h,lat,roll,up]=coasterAt(e.line,e.lo,e.hi,s),q=ground(sg) as TrackPos;q.x-=q.fy*lat;q.y+=q.fx*lat;q.h=h;q.up=up;q.roll=roll;q.loop=sg!==s||roll!==0||!!(g.spiral&&s>g.spiral.r0&&s<g.spiral.r1);return q};   // loop: no columns under it (nor under a tower ring: its turns are stacked)
    }
    // Supports: one under both directions (a crossbeam carries the two girders) a span apart by height — COL_SPAN m low,
    // more higher up, an A-frame from COL_AFRAME m — placed along each edge the same at every zoom (zoomed out every k-th:
    // piece), none on the ground, in a loop or corkscrew, nor within COL_CLEAR m of another line's (lines side by side made
    // a fence: a column every 30 m under each direction of each line, ~67 a km a line close up). Worked out once for all
    // the edges in id order, each moved on 10 m at a time until clear of the ones before.
    columns(){
      if(this.cols)return this.cols;this.cols=new Map();const grid=new Map<string, {X:number;Y:number;line:string}[]>(),cell=COL_CLEAR,key=(x:number,y:number)=>Math.floor(x/cell)+','+Math.floor(y/cell);
      for(const e of [...this.edges].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
        const g=geom(e.line,e.lo,e.hi),mu=g.pts[0]!.meterInMercatorCoordinateUnits(),pos=this.sampler(e),list:number[]=[];this.cols.set(e.id,list);
        const near=(q:TrackPos)=>{const X=q.x/mu,Y=q.y/mu,ix=Math.floor(X/cell),iy=Math.floor(Y/cell);
          for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const c of grid.get((ix+dx)+','+(iy+dy))||[])if(c.line!==e.line&&Math.hypot(c.X-X,c.Y-Y)<COL_CLEAR)return true;return false};
        for(let s=0;s<g.total;){const q=pos(s);if(q.up<3*mu||q.loop||near(q)){s+=10*mu;continue}
          list.push(s);const X=q.x/mu,Y=q.y/mu,k=key(X,Y);if(!grid.has(k))grid.set(k,[]);grid.get(k)!.push({X,Y,line:e.line});
          const h=q.h/mu;s+=(h<30?COL_SPAN:h<COL_AFRAME?80:100)*mu}
      }
      return this.cols;
    }
    // Night (the park in the dark theme): a string of bulbs under each edge's centre line, BULB_EVERY m apart and 3 m under
    // the girders — none on the ground, in a loop or corkscrew. Absolute mercator x, y and height, for NightLayer.
    bulbs(){
      if(this.bulbPts)return this.bulbPts;const out:number[]=[],rgb:number[]=[];
      for(const e of this.edges){const g=geom(e.line,e.lo,e.hi),mu=g.pts[0]!.meterInMercatorCoordinateUnits(),pos=this.sampler(e),v=parseInt((colors[e.line]||'#888888').slice(1),16);
        for(let s=BULB_EVERY*mu/2;s<g.total;s+=BULB_EVERY*mu){const q=pos(s);if(q.up<6*mu||q.loop)continue;out.push(q.x,q.y,q.h-3*mu);rgb.push(v>>16&255,v>>8&255,v&255)}}
      this.bulbRgb=new Uint8Array(rgb);   // the line each hangs under (a chase in its colour)
      return this.bulbPts=new Float64Array(out);   // doubles: float mercator is ~2 m coarse here
    }
    // lvl: sample spacing in m (8 m close up; coarser zoomed out, where 8 m built 2.3 M vertices at z12.6 and stalled the map)
    piece(c:TrackPiece,lvl:number):BuiltPiece{
      const ck=c.id+':'+lvl;let a=this.cache.get(ck);if(a)return a;
      const e=c.e,g=geom(e.line,e.lo,e.hi),mu=g.pts[0]!.meterInMercatorCoordinateUnits(),col=hexRGB(colors[e.line]||'#888888'),eo=edgeOffset(e.line,e.lo,e.hi),O=this.O;
      const pos=this.sampler(e);
      const at=(s:number):TrackAt=>{const q=pos(s),A=pos(Math.max(0,s-.5*mu)),B=pos(Math.min(g.total,s+.5*mu));
        let F=[B.x-A.x,B.y-A.y,B.h-A.h];const l=Math.hypot(...F)||1;F=F.map(c=>c/l);const R=[-q.fy,q.fx],[,U]=rolled(R,F,q.roll) as [number[], number[]];
        return {x:q.x-O.x,y:q.y-O.y,h:q.h,R,F,U,G:[q.fx,q.fy,0],loop:q.loop,roll:q.roll}};
      // samples on the edge's own grid (so neighbouring pieces meet), the piece's ends, and densely over the loop
      // zoomed out: sampled at ≤ 16 m, then thinned to what bends (every lvl m alone cut the hills and curves to zigzags)
      // 고가를 떠난 구간만(coasterRises), 양 끝은 RAIL_LEAD m 상판 위로 이어서 — 그 밖은 고가 상판이 받친다
      const parts:Float32Array[]=[];for(const [a,b] of coasterRises(e.line,e.lo,e.hi)){const r0=Math.max(c.s0,(a-RAIL_LEAD)*mu),r1=Math.min(c.s1,(b+RAIL_LEAD)*mu);if(r1-r0<mu)continue;
        const fine=Math.min(lvl,16),S=[r0],n=Math.max(1,Math.ceil(g.total/(fine*mu)));for(let i=Math.ceil(r0/g.total*n);i<=n;i++){const x=g.total*i/n;if(x>=r1)break;if(x>r0)S.push(x)}S.push(r1);
        const dense:[number, number, number][]=[];if(loopD(g.total/mu,e.lo,e.hi,e.line)){const D=loopD(g.total/mu,e.lo,e.hi,e.line)*mu;dense.push([g.total/2-D/2,D,1])}const C=corkOf(g.total/mu,e.lo,e.hi,e.line);if(C)dense.push([C[0]*mu,C[1]*mu,C[2]]);
        for(const [s0,D,T] of dense){const m=Math.max(24,96*8/lvl|0)*T;for(let i=1;i<m;i++){const x=s0+D*i/m;if(x>r0&&x<r1)S.push(x)}}if(dense.length)S.sort((p,q)=>p-q);   // densely over the loop and the corkscrew
        let P=S.map(s=>Object.assign(at(s),{s}));
        if(lvl>fine){const tol=lvl/40*mu,K=[P[0]!];let k=0;   // keep a sample where the ones since the last kept stray > tol (~¼ px; at ~1 px the corners showed) from a straight run
          // every corkscrew sample is kept (roll): its turn is in U, not in x/y/h
          const off=(A:TrackAt,B:TrackAt,Q:TrackAt)=>{const dx=B.x-A.x,dy=B.y-A.y,dh=B.h-A.h,l2=dx*dx+dy*dy+dh*dh||1,u=Math.max(0,Math.min(1,((Q.x-A.x)*dx+(Q.y-A.y)*dy+(Q.h-A.h)*dh)/l2));return Math.hypot(A.x+dx*u-Q.x,A.y+dy*u-Q.y,A.h+dh*u-Q.h)};
          for(let j=k+2;j<P.length;j++){let bad=P[j]!.loop!==P[k]!.loop||!!P[j-1]!.roll;for(let i=k+1;i<j&&!bad;i++)bad=off(P[k]!,P[j]!,P[i]!)>tol;if(bad){k=j-1;K.push(P[k]!)}}
          K.push(P[P.length-1]!);P=K}
        parts.push(buildCoasterTrackMesh({points:P,at,columns:this.columns().get(e.id)||[],s0:r0,s1:r1,mu,offset:eo,lvl,color:col}));   // coaster: stable ties, narrow rails and shared Y/A supports
      }
      let o=0;for(const q of parts)o+=q.length;const out=new Float32Array(o);o=0;for(const q of parts){out.set(q,o);o+=q.length}
      if(!o){a={b:null,n:0};this.cache.set(ck,a);return a}
      const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,out.subarray(0,o),gl.STATIC_DRAW);
      a={b,n:o/22};this.cache.set(ck,a);this.bytes=(this.bytes||0)+o*4;
      return a;
    }
    use(gl:WebGL2RenderingContext,M:ArrayLike<number>,z:number){
      const MT=this.M;MT.set(M);for(let r=0;r<4;r++)MT[12+r]=M[r]!*this.O.x+M[4+r]!*this.O.y+M[12+r]!;
      gl.useProgram(this.p);gl.uniformMatrix4fv(this.uni.u_matrix,false,MT);
      gl.uniform1f(this.uni.u_unit,1/(512*2**z));gl.uniform1f(this.uni.u_lane,cityViaduct.train(z,coasterBodyPx(z)).lanePx);gl.uniform1f(this.uni.u_body,coasterBodyPx(z));
      const pal=COASTER_STYLE.palette[document.documentElement.dataset.theme==='dark'?'dark':'light'],dims=trackMetrics(z);   // coaster: palette uniforms need no geometry rebuild on theme change
      gl.uniform3fv(this.uni.u_post,hexRGB(pal.ivory));gl.uniform3fv(this.uni.u_spine,hexRGB(pal.teal));gl.uniform3fv(this.uni.u_concrete,hexRGB(pal.concrete));
      const vc=CITY_STYLE.viaduct.colors[document.documentElement.dataset.theme==='dark'?'dark':'light'];gl.uniform3fv(this.uni.u_rail,hexRGB(vc.rail));gl.uniform3fv(this.uni.u_bed,hexRGB(vc.bed));   // 롤코 코스 레일 = 고가 레일
      gl.uniform4f(this.uni.u_size,dims.rail,dims.spineWidth,dims.spineDepth,dims.post);gl.uniform1f(this.uni.u_girder,dims.girder);gl.uniform3f(this.uni.u_detail,dims.tie,zoomFade(z,COASTER_STYLE.lod.ties),zoomFade(z,COASTER_STYLE.lod.detail));
      gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);
    }
    ptrs(gl:WebGL2RenderingContext){const S=88,ptr=(n:TrackAttr,size:number,off:number)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off*4)};
      ptr('a_p',4,0);ptr('a_r',2,4);ptr('a_o',4,6);ptr('a_z',2,10);ptr('a_f',3,12);ptr('a_u',3,15);ptr('a_c',4,18)}
    // city-life: the little people on the streets are city_life.mjs's now, in both city modes (the same figures in the same places, only toned by the mode); the walkers that strolled here (streets/snap/spawn/place/people) went with them.
    // 지은 선로 버퍼만 치운다(길 · 전구 자리 같은 CPU 자료와 셰이더는 그대로)
    free(gl:WebGL2RenderingContext){for(const a of this.cache.values())if(a.b)gl.deleteBuffer(a.b);this.cache.clear();this.bytes=0}
    render(gl:WebGL2RenderingContext,M:ArrayLike<number>,occlude:number){
      const z=map.getZoom();if(!isCoaster()){if(this.cache?.size)this.free(gl);return}if(z<12.5)return;if(!this.p)this.init(gl);   // 롤코를 나가면 지은 선로 버퍼(GPU, 폰 96 MB 까지)를 치운다 — 다시 오면 보이는 곳부터 다시 짓는다
      if(this.stale){for(const a of this.cache.values())if(a.b)gl.deleteBuffer(a.b);this.cache.clear();this.bytes=0;this.list=null;this.cols=null;this.bulbPts=null;this.stale=false}   // 고가 높이가 바뀌면(역 승강장이 들어오면) 다시 짓는다
      const view=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(view.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(view.getNorthEast()),w=hi.x-lo.x;
      const inside=(c:TrackPiece,pad:number)=>{const [x0,y0,x1,y1]=c.box;return !(x1<lo.x-pad||x0>hi.x+pad||y0>lo.y+pad||y1<hi.y-pad)};
      const sel=getSelected(),mine=this.pieces().filter(c=>sel==='all'||c.e.line===sel),vis=mine.filter(c=>inside(c,w*.1));
      const mpp=40075016.686*Math.cos(37.5*Math.PI/180)/(512*2**z),lvl=8*2**Math.max(0,Math.ceil(Math.log2(6*mpp/8)));   // ~6 px a sample
      // pieces not built at this level yet: a few each frame (~4 ms), meanwhile drawn at a level already built (building all
      // at once while zooming hitched and left gaps); spare time builds the next level out over a wider area, then in
      const t0=performance.now(),draw:[BuiltPiece, string][]=[],LV=[8,16,32,64,128,256],near=[lvl*2,lvl/2,lvl*4,lvl/4,...LV];let pending=false;
      const frame=this.frame=(this.frame||0)+1,hit=(k:string)=>{const a=this.cache.get(k);if(a){this.cache.delete(k);this.cache.set(k,a);a.f=frame}return a};   // used: to the back of the queue
      for(const c of vis){const a=hit(c.id+':'+lvl);if(a){draw.push([a,c.e.id]);continue}
        if(performance.now()-t0<4){draw.push([this.piece(c,lvl),c.e.id]);continue}
        pending=true;let b:BuiltPiece|null|undefined=null;for(const l of near)if((b=hit(c.id+':'+l)))break;
        if(!b&&performance.now()-t0<12)b=this.piece(c,lvl);if(b)draw.push([b,c.e.id])}   // nothing built for it yet (newly on screen): up to 12 ms, rather than a gap
      if(!pending&&(this.bytes||0)<TRACK_BYTES*.8)for(const [l,pad] of [[lvl*2,w*.6],[lvl/2,0]] as [number, number][])if(LV.includes(l))for(const c of mine){if(performance.now()-t0>=4){pending=true;break}if(inside(c,pad)&&!this.cache.has(c.id+':'+l))this.piece(c,l)}
      if(pending)trainFrameSoon(16);
      for(const [a] of draw)a.f=frame;
      // least recently drawn out past TRACK_BYTES, never one drawn this frame (dropping the oldest built deleted pieces on screen:
      // with every line at z13+ the 3,500 pieces at two or three levels passed the old 4,000 cap, and the track flickered)
      for(const [k,a] of this.cache){if(this.bytes<=TRACK_BYTES||a.f===frame)break;if(a.b)gl.deleteBuffer(a.b);this.cache.delete(k);this.bytes-=a.n*88}
      if(!draw.length)return;
      this.use(gl,M,z);
      // 길찾기(고가와 같은 탄 구간 목록 — cityViaduct.journeyFocus): 탄 구간은 노선색(1), 나머지는 흐린 막 색으로 물러난다(2) — 상판이 없는 낮은 줌(lod.deck 아래)에서는
      // 더 물러나(75 %) 축소해도 탄 구간이 눈에 들어오고, 상판이 다 나오면 고가와 같은 50 %. 길찾기가 없으면 0(원래대로)
      const J=cityViaduct.net?.paths?cityViaduct.journeyFocus(getJourney()):null,[d0,d1]=cityViaduct.V.lod.deck as [number, number];
      gl.uniform1f(this.uni.u_dim,.75-.25*Math.max(0,Math.min(1,(z-d0)/(d1-d0))));gl.uniform3fv(this.uni.u_veil,document.documentElement.dataset.theme==='dark'?[.043,.047,.055]:[.984,.98,.957]);   // journey-veil 의 색
      let was=-1;const each=()=>{for(const [a,id] of draw){if(!a.n)continue;const r=!J?0:J.edges.has(id)?1:2;if(r!==was){gl.uniform1f(this.uni.u_route,r);was=r}gl.bindBuffer(gl.ARRAY_BUFFER,a.b);this.ptrs(gl);gl.drawArrays(gl.TRIANGLES,0,a.n)}};
      gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);
      if(occlude){gl.depthMask(false);gl.depthFunc(gl.GREATER);gl.uniform1f(this.uni.u_alpha,occlude);each()}   // behind building walls: faint
      gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.uniform1f(this.uni.u_alpha,1);each();gl.depthMask(false);
      for(const n of Object.keys(this.attr) as TrackAttr[])gl.disableVertexAttribArray(this.attr[n]);
    }
  }
  return new CoasterTrack();
}
