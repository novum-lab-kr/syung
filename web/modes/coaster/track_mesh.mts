import { PARK_DEFAULTS as STYLE } from '../basic/park.mjs';
import type { ParkPack } from './metrics.mts';

// Existing 22-float track format. Negative red selects a uniform material:
// 1 supports, 2 ties, 3 spine, 4 V brackets, 5 concrete feet, 6 girder sides (green: the line colour packed 0xRRGGBB),
// 7 girder top. Green holds stable tie ID. 레일(0)의 rgb 는 면 밝기만 — 색은 u_rail(고가 레일 색), 침목 · 거더 윗면은 u_bed.
export function coasterTrackVertexShader(heart:number) { return `#version 300 es
in vec4 a_p;in vec2 a_r;in vec4 a_o;in vec2 a_z;in vec3 a_f;in vec3 a_u;in vec4 a_c;
uniform mat4 u_matrix;uniform float u_unit,u_lane,u_body,u_girder,u_route,u_dim;uniform vec3 u_post,u_spine,u_concrete,u_detail,u_rail,u_bed,u_veil;uniform vec4 u_size;
out vec3 v_c;out float v_alpha;
void main(){
  float kind=max(0.,-a_c.r),lane=(a_o.x+a_o.y*u_lane)*u_unit;
  float width=kind<.5?u_size.x:kind<1.5?u_size.w:kind<2.5?1.:kind<3.5?u_size.y:1.;
  float across=(a_o.z*u_body+a_o.w*width)*u_unit;
  float along=a_z.x*(kind>1.5&&kind<2.5?u_detail.x:kind>.5&&kind<1.5?u_size.w:1.);
  float up=a_z.y*(kind>5.5?u_girder:kind<.5||kind>1.5&&kind<2.5?u_size.x:u_size.z);
  vec3 r=vec3(a_r,0.),p=r-dot(r,a_f)*a_f;float pl=length(p);vec3 U0=pl>1e-6?cross(a_f,p/pl):a_u;
  gl_Position=u_matrix*vec4(vec3(a_p.xy+a_r*lane,a_p.z*a_p.w)+cross(a_u,a_f)*across+(a_f*along+a_u*up)*u_unit+(U0-a_u)*(${heart}*u_body*u_unit),1.);
  float pk=a_c.g;vec3 line=vec3(floor(pk/65536.),mod(floor(pk/256.),256.),mod(pk,256.))/255.;
  // 레일 · 침목 · 거더 윗면은 심시티 고가와 같은 레일 · 자갈 바닥 색(2026-10-10 행님: 롤코 코스 레일도 기본 고가 레일로 통일)
  v_c=(kind<.5?u_rail*a_c.rgb:kind<1.5?u_post:kind<2.5?u_bed:kind<4.5?u_spine:kind<5.5?u_concrete:kind<6.5?line:u_bed)*a_c.a;
  // 길찾기(u_route 1 탄 구간): 거더 윗면 · 등뼈를 노선색 쪽으로(루프 · 코르크스크루도) — 레일은 고가 레일 색 그대로. (2 나머지): 흐린 막 색으로 u_dim 만큼 물러난다
  if(u_route>.5&&u_route<1.5){if(kind>6.5)v_c=mix(v_c,line*a_c.a,.75);else if(kind>2.5&&kind<4.5)v_c=mix(v_c,line*a_c.a,.5);}
  if(u_route>1.5)v_c=mix(v_c,u_veil,u_dim);
  v_alpha=kind>3.5&&kind<5.5?u_detail.z:kind>1.5&&kind<2.5&&mod(a_c.g,2.)>.5?u_detail.y:1.;
}`; }
export const COASTER_TRACK_FS = `#version 300 es
precision highp float;in vec3 v_c;in float v_alpha;uniform float u_alpha;out vec4 o;
void main(){float a=u_alpha*v_alpha;if(a<.005)discard;o=vec4(v_c*a,a);}`;

// 선로 위 한 점(롤코 선로 층 track.mts 가 만든다): 메르카토르 x · y · 높이 h, 옆 R · 앞 F · 위 U, 기둥은 땅 위 앞 G
export interface TrackSample { x:number; y:number; h:number; R:readonly number[]; F:readonly number[]; U:readonly number[]; G:readonly number[] }
export interface TrackMeshInput {
  points:TrackSample[]; at:(s:number)=>TrackSample; columns:number[]; s0:number; s1:number; mu:number; offset:number; lvl:number; color:number[]; pack?:ParkPack;
}
export function buildCoasterTrackMesh({points:P,at,columns,s0,s1,mu,offset,lvl,color,pack=STYLE}:TrackMeshInput) {
  const T=pack.track,S=pack.supports, every=Math.max(1,Math.round(lvl*3/80));
  const cols=columns.filter((s,i)=>i%every===0&&s>=s0&&s<s1);
  const out=new Float32Array(22*(160*P.length+180*cols.length+32));let o=0;
  const lineHex=color.reduce((n,c)=>n*256+Math.round(Math.max(0,Math.min(1,c))*255),0);   // the line colour for the girder, exact in a float
  const UP=[0,0,1], railColors=[1,T.railSideLight,.9,.65].map(sh=>[sh,sh,sh]);   // 면 밝기(색은 셰이더의 u_rail)
  const v=(q:TrackSample,hf:number,side:number,kb:number,kp:number,kf:number,zp:number,part:number,shade=1,post=false,index=0)=>{
    const F=post?q.G:q.F,U=post?UP:q.U,c=part?[-part,index,0]:railColors[shade]!;
    out[o++]=q.x;out[o++]=q.y;out[o++]=q.h;out[o++]=hf;out[o++]=q.R[0]!;out[o++]=q.R[1]!;
    out[o++]=offset;out[o++]=side;out[o++]=kb;out[o++]=kp;out[o++]=kf;out[o++]=zp;
    out[o++]=F[0]!;out[o++]=F[1]!;out[o++]=F[2]!;out[o++]=U[0]!;out[o++]=U[1]!;out[o++]=U[2]!;
    out[o++]=c[0]!;out[o++]=c[1]!;out[o++]=c[2]!;out[o++]=part?shade:1;
  };
  // 꼭짓점 하나의 값(v 의 인자)
  type Vtx = Parameters<typeof v>;
  const quad=(a:Vtx,b:Vtx,c:Vtx,d:Vtx)=>{for(const q of [a,b,c,a,c,d])v(...q)};
  // Supports remain on the original edge grid. Both directions share a single structure.
  for(const cs of cols){
    const q=at(cs),h=q.h/mu;
    const leg=(a:TrackSample,b:TrackSample,hf0=0,hf1=1,side0=0,side1=0,width=.5)=>{
      for(const [kp,kf] of [[width,0],[0,width]] as [number, number][])quad(
        [a,hf0,side0,0,-kp,-kf,0,1,.8,true],[a,hf0,side0,0,kp,kf,0,1,.8,true],
        [b,hf1,side1,0,kp,kf,-1,1,1,true],[b,hf1,side1,0,-kp,-kf,-1,1,1,true]);
    };
    const shift=(d:number)=>({...q,x:q.x+q.R[0]!*d,y:q.y+q.R[1]!*d});
    const bases:TrackSample[]=[];
    if(h<S.yHeightM){
      const fork={...q,h:Math.max(0,q.h-S.yBranchM*mu)};leg(q,fork);leg(fork,q,1,1,0,-.8);leg(fork,q,1,1,0,.8);bases.push(q);
    }else if(h<S.aHeightM){leg(q,q);bases.push(q)}
    else{
      const d=Math.min(S.aMaxSpreadM,h*S.aSpread)*mu,a=shift(-d),b=shift(d);
      leg(a,q,0,1,0,0,.5*S.aDiameterM/S.diameterM);leg(b,q,0,1,0,0,.5*S.aDiameterM/S.diameterM);bases.push(a,b);
      const A=shift(-d/2),B=shift(d/2);
      quad([A,.5,0,0,0,0,0,1,.8,true],[B,.5,0,0,0,0,0,1,.8,true],[B,.5,0,0,0,0,-.6,1,.8,true],[A,.5,0,0,0,0,-.6,1,.8,true]);
    }
    if(lvl<=16)quad([q,1,-1.08,0,0,-.5,-1,1,1,true],[q,1,1.08,0,0,-.5,-1,1,1,true],
      [q,1,1.08,0,0,.5,-1.65,1,.8,true],[q,1,-1.08,0,0,.5,-1.65,1,.8,true]);
    if(lvl===8)for(const B of bases){
      const half=S.footSizeM*.5*mu,foot=(x:number,y:number,z:number)=>({...B,x:B.x+(q.G[0]!*x+q.R[0]!*y)*half,y:B.y+(q.G[1]!*x+q.R[1]!*y)*half,h:z*S.footHeightM*mu});
      const corners=[foot(-1,-1,1),foot(1,-1,1),foot(1,1,1),foot(-1,1,1)];
      quad(...(corners.map((p):Vtx=>[p,1,0,0,0,0,0,5,1,true]) as [Vtx, Vtx, Vtx, Vtx]));
      for(let i=0;i<4;i++){const a=corners[i]!,b=corners[(i+1)%4]!;quad([a,1,0,0,0,0,0,5,.8,true],[b,1,0,0,0,0,0,5,.8,true],[b,0,0,0,0,0,0,5,.8,true],[a,0,0,0,0,0,0,5,.8,true])}
    }
  }
  for(const side of [-1,1]){
    for(let i=0;i<P.length-1;i++){
      const A=P[i]!,B=P[i+1]!;
      // Four faces per rail: same wheel alignment, less than two CSS pixels across.
      for(const kb of [-T.railBodyOffset,T.railBodyOffset]){
        const face=(kp0:number,z0:number,kp1:number,z1:number,shade:number)=>quad([A,1,side,kb,kp0,0,z0,0,shade],[B,1,side,kb,kp0,0,z0,0,shade],
          [B,1,side,kb,kp1,0,z1,0,shade],[A,1,side,kb,kp1,0,z1,0,shade]);
        face(-.5,.4,.5,.4,0);face(-.5,-.6,-.5,.4,1);face(.5,.4,.5,-.6,2);face(.5,-.6,-.5,-.6,3);
      }
      // 노선색 상자 거더(2026-10-05 덕배): 차선마다 열차 폭, 위는 밝은 상판(7), 옆 · 아래는 노선색 띠(6) — 가는 레일만으론 노선색이 안 보였다
      const g=T.girderBody;
      for(const [kb0,z0,kb1,z1,part,sh] of [[-g,0,g,0,7,1],[-g,-1,-g,0,6,.92],[g,0,g,-1,6,.8],[g,-1,-g,-1,6,.6]] as [number, number, number, number, number, number][])
        quad([A,1,side,kb0,0,0,z0,part,sh,false,lineHex],[B,1,side,kb0,0,0,z0,part,sh,false,lineHex],[B,1,side,kb1,0,0,z1,part,sh,false,lineHex],[A,1,side,kb1,0,0,z1,part,sh,false,lineHex]);
    }
  }
  if(o>out.length)throw Error('coaster track mesh capacity exceeded');
  return out.subarray(0,o);
}
