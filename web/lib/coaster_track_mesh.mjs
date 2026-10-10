import { SEOUL_COASTER_STYLE as STYLE, distanceGrid } from './coaster_style_seoul.mjs';

// Existing 22-float track format. Negative red selects a uniform material:
// 1 supports, 2 ties, 3 spine, 4 V brackets, 5 concrete feet, 6 girder sides (green: the line colour packed 0xRRGGBB),
// 7 girder top. Green holds stable tie ID. 레일(0)의 rgb 는 면 밝기만 — 색은 u_rail(고가 레일 색), 침목 · 거더 윗면은 u_bed.
// 등뼈(3) · 버팀대(4)도 green 에 노선색(6 처럼). 등뼈 · 버팀대의 위아래(a_z.y)는 등뼈 지름(u_size.y) 단위 — 원이 타원이 되지 않게 가로 · 세로 같은 값 —
// 에서 blue(0 · 1)만큼 등뼈 중심 깊이(u_drop px)를 뺀다(멀리서 등뼈만 굵혀도 레일과의 거리는 그대로). 버팀대 두께(가로 · 앞뒤)는 침목 두께 px(u_detail.x).
export function coasterTrackVertexShader(heart) { return `#version 300 es
in vec4 a_p;in vec2 a_r;in vec4 a_o;in vec2 a_z;in vec3 a_f;in vec3 a_u;in vec4 a_c;
uniform mat4 u_matrix;uniform float u_unit,u_lane,u_body,u_girder,u_drop;uniform vec3 u_post,u_spine,u_concrete,u_detail,u_rail,u_bed;uniform vec4 u_size;
out vec3 v_c;out float v_alpha;
void main(){
  float kind=max(0.,-a_c.r),lane=(a_o.x+a_o.y*u_lane)*u_unit;
  float width=kind<.5?u_size.x:kind<1.5?u_size.w:kind<2.5?1.:kind<3.5?u_size.y:kind<4.5?u_detail.x:1.;
  float across=(a_o.z*u_body+a_o.w*width)*u_unit;
  float along=a_z.x*(kind>1.5&&kind<2.5||kind>3.5&&kind<4.5?u_detail.x:kind>.5&&kind<1.5?u_size.w:1.);
  float up=a_z.y*(kind>5.5?u_girder:kind<.5||kind>1.5&&kind<2.5?u_size.x:kind>2.5&&kind<4.5?u_size.y:u_size.z)-(kind>2.5&&kind<4.5?a_c.b*u_drop:0.);
  vec3 r=vec3(a_r,0.),p=r-dot(r,a_f)*a_f;float pl=length(p);vec3 U0=pl>1e-6?cross(a_f,p/pl):a_u;
  gl_Position=u_matrix*vec4(vec3(a_p.xy+a_r*lane,a_p.z*a_p.w)+cross(a_u,a_f)*across+(a_f*along+a_u*up)*u_unit+(U0-a_u)*(${heart}*u_body*u_unit),1.);
  float pk=a_c.g;vec3 line=vec3(floor(pk/65536.),mod(floor(pk/256.),256.),mod(pk,256.))/255.;
  // 레일 · 침목 · 거더 윗면은 심시티 고가와 같은 레일 · 자갈 바닥 색(2026-10-10 행님: 롤코 코스 레일도 기본 고가 레일로 통일)
  v_c=(kind<.5?u_rail*a_c.rgb:kind<1.5?u_post:kind<2.5?u_bed:kind<4.5?line:kind<5.5?u_concrete:kind<6.5?line:u_bed)*a_c.a;
  v_alpha=kind>3.5&&kind<5.5?u_detail.z:kind>1.5&&kind<2.5&&mod(a_c.g,2.)>.5?u_detail.y:1.;
}`; }
export const COASTER_TRACK_FS = `#version 300 es
precision highp float;in vec3 v_c;in float v_alpha;uniform float u_alpha;out vec4 o;
void main(){float a=u_alpha*v_alpha;if(a<.005)discard;o=vec4(v_c*a,a);}`;

export function buildCoasterTrackMesh({points:P,at,columns,s0,s1,mu,offset,lvl,color,pack=STYLE}) {
  const T=pack.track,S=pack.supports, every=Math.max(1,Math.round(lvl*3/80));
  const cols=columns.filter((s,i)=>i%every===0&&s>=s0&&s<s1);
  const out=new Float32Array(22*(2*(2*6+8)*6*P.length+2*6*6*(Math.ceil((s1-s0)/mu/T.bracketEveryM)+2)+180*cols.length+32));let o=0;   // 레일 · 등뼈 관, 버팀대, 기둥
  const lineHex=color.reduce((n,c)=>n*256+Math.round(Math.max(0,Math.min(1,c))*255),0);   // the line colour for the girder, exact in a float
  const UP=[0,0,1];
  const v=(q,hf,side,kb,kp,kf,zp,part,shade=1,post=false,index=0,drop=0)=>{
    const F=post?q.G:q.F,U=post?UP:q.U,c=part?[-part,index,drop]:[shade,shade,shade];   // 레일: 면 밝기(색은 셰이더의 u_rail)
    out[o++]=q.x;out[o++]=q.y;out[o++]=q.h;out[o++]=hf;out[o++]=q.R[0];out[o++]=q.R[1];
    out[o++]=offset;out[o++]=side;out[o++]=kb;out[o++]=kp;out[o++]=kf;out[o++]=zp;
    out[o++]=F[0];out[o++]=F[1];out[o++]=F[2];out[o++]=U[0];out[o++]=U[1];out[o++]=U[2];
    out[o++]=c[0];out[o++]=c[1];out[o++]=c[2];out[o++]=part?shade:1;
  };
  const quad=(a,b,c,d)=>{for(const q of [a,b,c,a,c,d])v(...q)};
  // Supports remain on the original edge grid. Both directions share a single structure.
  for(const cs of cols){
    const q=at(cs),h=q.h/mu;
    const leg=(a,b,hf0=0,hf1=1,side0=0,side1=0,width=.5)=>{
      for(const [kp,kf] of [[width,0],[0,width]])quad(
        [a,hf0,side0,0,-kp,-kf,0,1,.8,true],[a,hf0,side0,0,kp,kf,0,1,.8,true],
        [b,hf1,side1,0,kp,kf,-1,1,1,true],[b,hf1,side1,0,-kp,-kf,-1,1,1,true]);
    };
    const shift=d=>({...q,x:q.x+q.R[0]*d,y:q.y+q.R[1]*d});
    const bases=[];
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
      const half=S.footSizeM*.5*mu,foot=(x,y,z)=>({...B,x:B.x+(q.G[0]*x+q.R[0]*y)*half,y:B.y+(q.G[1]*x+q.R[1]*y)*half,h:z*S.footHeightM*mu});
      const corners=[foot(-1,-1,1),foot(1,-1,1),foot(1,1,1),foot(-1,1,1)];
      quad(...corners.map(p=>[p,1,0,0,0,0,0,5,1,true]));
      for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];quad([a,1,0,0,0,0,0,5,.8,true],[b,1,0,0,0,0,0,5,.8,true],[b,0,0,0,0,0,0,5,.8,true],[a,0,0,0,0,0,0,5,.8,true])}
    }
  }
  // 2026-10-10 행님: 관형 강철 코스 — 차선마다 둥근 레일 두 줄(회색) 아래 노선색 등뼈 관, 레일 밑 가로대와 V 버팀대로 잇는다.
  // 노선색 상자 거더(2026-10-05)는 없앴다: 가까이서 '공중 도로 · 색 막대'로 보였다. 멀리서 노선색은 등뼈(최소 2.5 px)가 맡는다.
  // 관 단면은 꼭짓점마다 그 각도의 밝기(위 1 · 옆 .8 · 아래 .6)로 매끈하게. 가까이(lvl ≤ 16) 레일 6각 · 등뼈 8각, 멀리 4각.
  const near=lvl<=16, NR=near?6:4, NS=near?8:4, rb=T.railBodyOffset;
  const ring=(n,k)=>{const t=(k+(n===4?.5:0))/n*2*Math.PI;return [Math.cos(t),Math.sin(t),.8+.2*Math.sin(t)]};   // 4각은 45° 돌려 위 · 아래가 면이 되게
  for(const side of [-1,1])for(let i=0;i<P.length-1;i++){
    const A=P[i],B=P[i+1];
    for(const kb of [-rb,rb])for(let k=0;k<NR;k++){const [c0,s0,h0]=ring(NR,k),[c1,s1,h1]=ring(NR,k+1);
      quad([A,1,side,kb,.5*c0,0,.5*s0-.1,0,h0],[B,1,side,kb,.5*c0,0,.5*s0-.1,0,h0],[B,1,side,kb,.5*c1,0,.5*s1-.1,0,h1],[A,1,side,kb,.5*c1,0,.5*s1-.1,0,h1])}
    for(let k=0;k<NS;k++){const [c0,s0,h0]=ring(NS,k),[c1,s1,h1]=ring(NS,k+1);
      quad([A,1,side,0,.5*c0,0,.5*s0,3,h0,false,lineHex,1],[B,1,side,0,.5*c0,0,.5*s0,3,h0,false,lineHex,1],[B,1,side,0,.5*c1,0,.5*s1,3,h1,false,lineHex,1],[A,1,side,0,.5*c1,0,.5*s1,3,h1,false,lineHex,1])}
  }
  // 버팀대(가까이서만 짓고 줌 17.2~17.8 에 서서히): bracketEveryM 마다 레일 밑 가로대 + 양 끝에서 등뼈 윗면으로 V. 판 두 장을 십자로(옆 · 위 어느 쪽에서도 보이게).
  // 높이는 등뼈 지름 단위: 가로대는 레일 밑(-.25), V 는 등뼈 윗면 양옆(중심 + .35)으로. 가로대는 V 보다 얇게(위에서 사다리 가로대처럼 보였다 — Codex 검토).
  const brackets=lvl===8?distanceGrid(s0/mu,s1/mu,T.bracketEveryM).map(m=>at(m*mu)):[];
  const bar=(q,side,kb0,z0,d0,kb1,z1,d1,sh,t=.5)=>{
    quad([q,1,side,kb0,0,-t,z0,4,sh,false,lineHex,d0],[q,1,side,kb1,0,-t,z1,4,sh,false,lineHex,d1],[q,1,side,kb1,0,t,z1,4,sh,false,lineHex,d1],[q,1,side,kb0,0,t,z0,4,sh,false,lineHex,d0]);
    quad([q,1,side,kb0,-t,0,z0,4,sh*.85,false,lineHex,d0],[q,1,side,kb1,-t,0,z1,4,sh*.85,false,lineHex,d1],[q,1,side,kb1,t,0,z1,4,sh*.85,false,lineHex,d1],[q,1,side,kb0,t,0,z0,4,sh*.85,false,lineHex,d0])};
  for(const q of brackets)for(const side of [-1,1]){
    bar(q,side,-rb,-.25,0,rb,-.25,0,1,.35);bar(q,side,-rb,-.25,0,-.06,.35,1,.85);bar(q,side,rb,-.25,0,.06,.35,1,.85)}
  if(o>out.length)throw Error('coaster track mesh capacity exceeded');
  return out.subarray(0,o);
}
