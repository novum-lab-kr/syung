// 심시티 / 롤코 모드의 건물 — the city's buildings drawn as real meshes from the OpenFreeMap `building` tiles
// (walls, flat roofs set back behind a parapet, roof plant, gabled small houses, set-back office tops),
// with the floors, windows, shopfronts and night lights drawn procedurally in the fragment shader in
// world metres (they never stretch with zoom).
//
// Where it draws: a MapLibre custom layer ('3d') inside the map's own GL context, placed under the
// labels — so street and station names stay readable over the city — and the same meshes again,
// depth only, into the train canvas (drawDepth), so trains, rides and the coaster track are hidden
// behind the buildings exactly as the map shows them.
//
// Meshes are built per canonical z14 tile (the source's maximum; higher zooms overzoom it), in
// 4×4 sub-chunks for frustum culling, cached across pans and zooms, built in time slices, and each
// tile grows in over 0.4 s when it arrives. Every look value (materials, roofs, windows, night) comes
// from the style pack (web/modes/basic/city.mjs, opts.stylePack): nothing Seoul-specific is coded
// here. The building type is estimated by one replaceable function, classifyBuilding (height, area,
// landuse); pass opts.classify to override it when real use data arrives.
//
//   const city=new CityBuildings({phone});  map.addLayer(city,'station-names');
//   city.set({on:true,tone:'simcity'|'coaster',theme:'light'|'dark',maxHeight:150});   // tone: 팩의 modes 항목(모드 설정 city.tone)
//   city.drawDepth(trainGl,matrix) → true when walls were drawn (trains then depth-test against them)

import { cityPart } from './parts.mjs';
import { MODEL_STRIDE } from './mesh.mjs';   // 조선 한옥 템플릿은 부품 'hanok'(web/modes/joseon/hanok.mjs 가 등록 — 모드 코드 받기에 들어 있다)
import { TileBuilder, resolvePack, classifyBuilding, STRIDE, INST_STRIDES, LOD_HI, GROW_MS, RAIL_Q, EARTH, RAD, S, num, hexRGB, POSTS } from './mesh.mjs';
import { SEOUL_CITY_STYLE } from '../modes/basic/city.mjs';
import { sunPosition } from '../lib/sun.mts';
import { buildSignAtlas, SIGN_ATLAS } from './sign_text.mjs';   // 간판 글자: 업종 이름을 쓴 글자 묶음 그림(한국 상가 간판처럼)
import THROUGH_LIST from './through_buildings.mjs';   // the buildings the simcity viaduct passes through (a glass hall at the deck's level)
export { TileBuilder, classifyBuilding };

// ── shaders ──────────────────────────────────────────────────────────────────────────────────────
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_xy;layout(location=1) in float a_z;layout(location=2) in vec4 a_nk;layout(location=3) in float a_u;
layout(location=4) in vec4 a_wall;layout(location=5) in vec4 a_bld;layout(location=6) in vec4 a_misc;
uniform mat4 u_matrix;uniform float u_mpu;uniform vec2 u_wo;uniform float u_S;uniform float u_grow;uniform vec2 u_detail;uniform float u_maxH;
out vec3 v_n;out float v_z;out float v_u;out vec2 v_wm;flat out vec4 v_wall;flat out vec4 v_bld;flat out vec4 v_misc;flat out float v_kind;
void main(){
  float kind=floor(a_nk.w*127.0+0.5),H=(a_misc.z+a_misc.w*256.0)*0.1,z=a_z;
  if(kind==3.0)z=a_u+(a_z-a_u)*u_detail.x;   // roof plant grows out of the roof as the view comes closer
  if(kind==5.0)z=a_u+(a_z-a_u)*u_detail.y;   // awnings likewise
  if(kind==7.0){float z0=a_misc.y*0.2;z=z0+(a_z-z0)*u_detail.y;}   // 간판도(밑면 z0 에서 자라난다)
  z*=u_grow;
  vec4 pos=u_matrix*vec4(a_xy,z*u_mpu,1.0);
  if(H>=u_maxH)pos=vec4(0.0,0.0,2.0,1.0);   // the towers that are rides on the coaster: not drawn
  gl_Position=pos;
  v_n=a_nk.xyz;v_z=z;v_u=a_u;v_wm=u_wo+a_xy*u_S;v_wall=a_wall;v_bld=a_bld;v_misc=a_misc;v_kind=kind;
}`;
// 조선 고층의 처마 조각, 인스턴스로 (city_hanok.mjs skirtTemplate · skirtInst — 바꾸면 셋 다): 조각 하나의 점(열 sc 0 · .5 · 1,
// 행 t 벽 → 처마 끝, part 0 경사 · 1 끝 두께 위 · 2 아래)을 기록(a_p: 벽 시작 xy · 윗면 z · 각도, a_l: 길이 · u 시작, a_e: 처마
// 양 끝이 벽에서 나간 거리(×0.01 m) 밖 · 뒤 · 밖 · 앞, a_f: 양 끝 들림 · 내밀기(×0.01 m) · 기와 색)대로 펼친다.
// 같은 FS 를 쓴다: kind 8(기와), 법선은 격자 이웃의 차이로
const VS_SKIRT = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_t;layout(location=1) in vec4 a_p;layout(location=2) in vec2 a_l;layout(location=3) in vec4 a_e;layout(location=4) in vec4 a_f;
uniform mat4 u_matrix;uniform float u_mpu;uniform vec2 u_wo;uniform float u_S;uniform float u_grow;uniform vec4 u_sk;   // 처마: 높이(벽 → 끝), 끝 들림(내밀기 ×), 끝 두께
out vec3 v_n;out float v_z;out float v_u;out vec2 v_wm;flat out vec4 v_wall;flat out vec4 v_bld;flat out vec4 v_misc;flat out float v_kind;
vec2 D,N;
vec3 at(float sc,float t){
  float L=a_l.x,o=a_f.z*0.01;
  vec2 w=D*(sc*L),e=mix(N*(a_e.x*0.01)-D*(a_e.y*0.01),D*L+N*(a_e.z*0.01)+D*(a_e.w*0.01),sc);
  float lift=sc<0.5?mix(a_f.x,0.0,sc*2.0):mix(0.0,a_f.y,sc*2.0-1.0);
  return vec3(mix(w,e,t),-u_sk.x*(1.6*t-0.6*t*t)+(u_sk.y*o+lift*0.01)*t*t);
}
void main(){
  D=vec2(cos(a_p.w),sin(a_p.w));N=vec2(D.y,-D.x);
  float sc=a_t.x,t=a_t.y;int part=int(a_t.z+0.5);
  vec3 q=at(sc,t),n;
  if(part==0){float hs=sc<0.75?0.05:-0.05,ht=t<0.75?0.05:-0.05;vec3 a=(at(sc+hs,t)-q)*sign(hs),b=(at(sc,t+ht)-q)*sign(ht);n=normalize(cross(a,b));if(n.z<0.0)n=-n;}
  else{n=vec3(N,0.0);if(part==2)q.z-=u_sk.z;}
  float z=(a_p.z+q.z)*u_grow;vec2 xy=a_p.xy+q.xy*u_mpu;
  gl_Position=u_matrix*vec4(xy,z*u_mpu,1.0);
  float L=a_l.x;
  v_n=n;v_z=z;v_u=mix(a_l.y+sc*L,mix(a_l.y-a_e.y*0.01,a_l.y+L+a_e.w*0.01,sc),t);v_wm=u_wo+xy*u_S;
  v_wall=vec4(0.0);v_bld=vec4(0.0);v_misc=vec4(a_f.w,0.0,255.0,255.0);v_kind=8.0;
}`;
// 조선 한옥 지붕, 인스턴스로 (city_hanok.mjs roofInst · roofTemplate — 바꾸면 셋 다): 템플릿 점 (part, i, j)를 기록(a_p 중심
// xy · 각도 · a, a_q b · o · ze · rise, a_r ar · lift · kick · t1, a_h 벽 위 zt · 용마루 꼭대기 H, a_s 모양 · 초가 · 색, a_d 씨앗)대로
// 펼친다: 면 0–1 긴 면(±y), 2–3 짧은 면(±x), 4–5 합각 · 박공벽, 6 용마루, 7 초가 끝 두께. 그 지붕에 없는 부분은 화면 밖으로
const VS_ROOF = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_t;layout(location=1) in vec4 a_p;layout(location=2) in vec4 a_q;layout(location=3) in vec4 a_r;layout(location=4) in vec2 a_h;layout(location=5) in vec4 a_s;layout(location=6) in vec4 a_d;
uniform mat4 u_matrix;uniform float u_mpu;uniform vec2 u_wo;uniform float u_S;uniform float u_grow;uniform vec4 u_rf;uniform vec4 u_rd;   // u_rf: 팔작 tg, 맞배 끝 내밀기, 초가 끝 두께, 기와 처마 끝 두께; u_rd: 용마루 반폭 · 위 · 아래, 추녀마루 폭
out vec3 v_n;out float v_z;out float v_u;out vec2 v_wm;flat out vec4 v_wall;flat out vec4 v_bld;flat out vec4 v_misc;flat out float v_kind;
float A,B,O,ZE,RI,AR,LI,KI,T1,AE,BE,XG,TG;int STY;bool TH;
float prof(float t){return TH?1.0-(1.0-t)*(1.0-t)*0.9-0.1*(1.0-t):0.45*t+0.55*t*t;}
float zOf(float t){return ZE+RI*prof(t);}
float X(float t){return STY==0?mix(AE,AR,t):STY==1?(t<TG?mix(AE,XG,t/TG):XG):AE;}
vec3 face(int f,float s,float t){   // 면 f 위 s(처마 따라 0..1), t(처마 0 … 용마루 1)
  float u=1.0-t;
  if(f<2){float sy=f==0?1.0:-1.0,c=abs(2.0*s-1.0),cl=STY==2?0.4:1.0;return vec3(mix(-sy,sy,s)*(X(t)+KI*u),sy*(BE+KI*c)*u,zOf(t)+cl*LI*c*u*u);}
  float sx=f==2?1.0:-1.0;return vec3(sx*(X(t)+KI*u),mix(sx,-sx,s)*(BE+KI)*u,zOf(t)+LI*u*u);
}
float rowT(int f,float j){if(STY==1)return j<0.5?0.0:j<1.5?TG*0.5:j<2.5?TG:1.0;return j<0.5?0.0:j<1.5?T1*0.5:T1;}
void main(){
  A=a_p.w;B=a_q.x;O=a_q.y;ZE=a_q.z;RI=a_q.w;AR=a_r.x;LI=a_r.y;KI=a_r.z;T1=a_r.w;TG=u_rf.x;
  STY=int(a_s.x+0.5);TH=a_s.y>0.5;AE=STY==2?A+u_rf.y:A+O;BE=B+O;XG=max(0.35*AE,AE-BE*TG);
  int part=int(a_t.x+0.5);float i=a_t.y,j=a_t.z;
  vec3 p=vec3(0.0),n=vec3(0.0,0.0,1.0);float U=0.0,kind=TH?11.0:8.0,H=a_h.y,mx=a_s.z,my=clamp(floor(a_h.x*20.0+0.5),0.0,255.0);bool off=false;
  if(part<4){
    off=part>=2&&STY==2;
    float s=part<2?i*0.5:i,t=rowT(part,j);p=face(part,s,t);U=part<2?p.x:p.y;
    float h=0.02,s0=max(s-h,0.0),s1=min(s+h,1.0),tt=min(t,0.96),t0=max(tt-h,0.0),t1=tt+h;
    n=normalize(cross(face(part,s1,tt)-face(part,s0,tt),face(part,s,t1)-face(part,s,t0)));if(n.z<0.0)n=-n;
  }else if(part<6){   // 합각(팔작) · 박공벽(맞배): 회벽 삼각, 지붕 곡선을 따라
    off=STY==0;float sx=part==4?1.0:-1.0,x,t0,wk;
    if(STY==1){x=sx*(XG-0.3);t0=TG;wk=0.87;}else{x=sx*A;t0=max(0.0,1.0-B/BE);wk=1.0;}
    float ts=i<1.5?t0:i<3.5?(t0+1.0)*0.5:1.0,y=BE*(1.0-ts)*wk*(mod(i,2.0)<0.5?-1.0:1.0);
    p=vec3(x,i>3.5&&i<4.5?0.0:y,zOf(ts)-0.12);
    if(i>4.5){if(STY==2)p=vec3(x,i<5.5?-B:B,a_h.x);else p=vec3(x,BE*(1.0-t0)*wk*(i<5.5?-1.0:1.0),zOf(t0)-0.12);}
    n=vec3(sx,0.0,0.0);U=p.y;kind=10.0;
    float zA=zOf(1.0)-0.12,zB=STY==1?zOf(TG)-0.12:a_h.x;H=zA;mx=clamp(floor((zA-zB)*20.0+0.5),1.0,255.0);my=1.0;
  }else if(part==6){   // 용마루
    float R=STY==1?max(0.35*AE,AE-BE*0.5):STY==2?A+u_rf.y:AR,L=R+(STY==0?0.3:0.15),w=u_rd.x,zr=ZE+RI,z0=zr-u_rd.z,z1=zr+u_rd.y;
    off=T1<0.999||TH||R<=0.2;
    float q=floor(i/4.0),c=mod(i,4.0),x=(c==0.0||c==3.0)?-L:L;
    if(q<1.5){float sy=q<0.5?-1.0:1.0;p=vec3(x,sy*w,c<1.5?z0:z1);n=vec3(0.0,sy,0.0);}
    else{p=vec3(x,c<1.5?-w:w,z1);n=vec3(0.0,0.0,1.0);}
    U=x;
  }else if(part==7){   // 초가 끝 두께
    off=!TH;int f=int(i/4.0);float e=mod(floor(i/2.0),2.0);p=face(f,e,0.0);if(mod(i,2.0)>0.5)p.z-=u_rf.z;
    n=f<2?vec3(0.0,f==0?1.0:-1.0,0.0):vec3(f==2?1.0:-1.0,0.0,0.0);U=f<2?p.x:p.y;
  }else if(part<10){   // 가까이: 8 처마 밑면(벽 위 → 처마 끝 아래, 서까래는 FS), 9 기와 처마 끝 두께(와구토)
    float k=i;int f=0;float nn=3.0;
    if(k>=6.0){k-=6.0;f=1;if(k>=6.0){k-=6.0;f=2;nn=2.0;if(k>=4.0){k-=4.0;f=3;}}}
    bool second=k>=nn;float s=(second?k-nn:k)/(nn-1.0);
    off=(f>=2&&STY==2)||(part==9&&TH)||T1<0.999&&part==9;
    vec3 e0=face(f,s,0.0);float drop=TH?u_rf.z:u_rf.w;
    vec2 ow=f<2?vec2(0.0,f==0?1.0:-1.0):vec2(f==2?1.0:-1.0,0.0);
    if(part==8){
      vec2 w=f<2?vec2(mix(-1.0,1.0,f==0?s:1.0-s)*A,ow.y*B):vec2(ow.x*A,mix(1.0,-1.0,f==2?s:1.0-s)*B);
      p=second?vec3(e0.xy,e0.z-drop):vec3(w,a_h.x);n=normalize(vec3(ow*0.35,-1.0));
    }else{p=second?vec3(e0.xy,e0.z-drop):e0;n=vec3(ow,0.0);}
    U=f<2?p.x:p.y;
  }else if(part==11){   // 추녀마루: 네 귀의 사선 마루 — 귀에서 우진각은 용마루까지, 팔작은 합각 아래까지. 등이 솟은 띠
    int h=int(i/9.0);float q=floor(mod(i,9.0)/3.0),cc=mod(i,3.0);
    off=STY==2||TH;float tTop=STY==1?TG:T1,t=tTop*q*0.5,ss=(h==0||h==2)?0.0:1.0;int f=h<2?0:1;
    vec3 L0=face(f,ss,t),L1=face(f,ss,min(t+0.02,tTop)),L2=face(f,ss,max(t-0.02,0.0));vec2 dir=normalize((L1-L2).xy+vec2(1e-6));vec2 pp=vec2(-dir.y,dir.x);
    float w=u_rd.w*0.5;p=cc<0.5?L0+vec3(pp*w,0.02):cc<1.5?L0+vec3(0.0,0.0,u_rd.w*0.75):L0+vec3(-pp*w,0.02);
    n=normalize(cc<0.5?vec3(pp*0.7,1.0):cc<1.5?vec3(0.0,0.0,1.0):vec3(-pp*0.7,1.0));U=t*10.0;mx=4.0;
  }else{   // 10 망와: 용마루 양 끝에 선 막새
    float R=STY==1?max(0.35*AE,AE-BE*0.5):STY==2?A+u_rf.y:AR,L=R+(STY==0?0.3:0.15),w=u_rd.x+0.06,z1=ZE+RI+u_rd.y;
    off=T1<0.999||TH||R<=0.2;float e=i<3.5?-1.0:1.0,c=mod(i,4.0);
    p=vec3(e*L,(c==0.0||c==3.0)?-w:w,c<1.5?z1-0.08:z1+0.32);n=vec3(e,0.0,0.0);U=p.y;
  }
  float c=cos(a_p.z),sn=sin(a_p.z);mat2 R=mat2(c,sn,-sn,c);
  vec2 xy=a_p.xy+R*p.xy*u_mpu;float z=p.z*u_grow;
  gl_Position=off?vec4(0.0,0.0,2.0,1.0):u_matrix*vec4(xy,z*u_mpu,1.0);
  float Hq=min(65535.0,floor(H*10.0+0.5));
  v_n=vec3(R*n.xy,n.z);v_z=z;v_u=U;v_wm=u_wo+xy*u_S;v_wall=vec4(0.0);v_bld=vec4(a_d.x,a_d.y,0.0,0.0);v_misc=vec4(mx,my,mod(Hq,256.0),floor(Hq/256.0));v_kind=kind;
}`;
// 조선 한옥 벽 상자, 인스턴스로 (city_hanok.mjs boxInst · boxTemplate): 네 면(side, end, top), 면마다 칸 수 · 길이 · 층 높이나 씨앗을
// 원래 정점이 들던 대로 v_wall 에 — FS kind 9 그대로
const VS_BOX = `#version 300 es
// (POSTS: city_hanok.mjs boxTemplate)
precision highp float;
layout(location=0) in vec3 a_t;layout(location=1) in vec4 a_p;layout(location=2) in vec4 a_q;layout(location=3) in vec4 a_w;layout(location=4) in vec4 a_d;
uniform mat4 u_matrix;uniform float u_mpu;uniform vec2 u_wo;uniform float u_S;uniform float u_grow;uniform float u_bay;uniform vec4 u_base;uniform vec4 u_post;   // u_base: 기단 높이(기와 · 초가), 기단이 벽 밖으로 나온 폭, 계단 폭; u_post: 기둥 폭 · 돌출, 받침목 폭 · 돌출
out vec3 v_n;out float v_z;out float v_u;out vec2 v_wm;flat out vec4 v_wall;flat out vec4 v_bld;flat out vec4 v_misc;flat out float v_kind;
void main(){
  int s=int(a_t.x+0.5);float e=a_t.y,A=a_p.w,B=a_q.x;bool off=false,solid=false;
  vec3 p,n;float l,U;float bh=a_w.x>0.5?u_base.y:u_base.x;
  if(s<4){
    vec2 C0=s==0?vec2(-A,-B):s==1?vec2(A,-B):s==2?vec2(A,B):vec2(-A,B),C1=s==0?vec2(A,-B):s==1?vec2(A,B):s==2?vec2(-A,B):vec2(-A,-B);
    l=length(C1-C0);vec2 d=(C1-C0)/l;p=vec3(mix(C0,C1,e),a_t.z>0.5?a_q.z:a_q.y);n=vec3(d.y,-d.x,0.0);U=e*l;
  }else{   // 가까이: 기단(집 둘레 돌 단)과 긴 면 하나의 돌계단 두 단 — 집(종류 0 · 1)의 바닥에만
    off=a_w.x>1.5||a_q.y>0.01;float pa=A+u_base.z,pb=B+u_base.z,k=e,c=mod(k,4.0);
    if(s==4){
      if(k<15.5){int q=int(k/4.0);vec2 C0=q==0?vec2(-pa,-pb):q==1?vec2(pa,-pb):q==2?vec2(pa,pb):vec2(-pa,pb),C1=q==0?vec2(pa,-pb):q==1?vec2(pa,pb):q==2?vec2(-pa,pb):vec2(-pa,-pb);
        l=length(C1-C0);vec2 d=(C1-C0)/l;float ee=(c==1.0||c==2.0)?1.0:0.0;p=vec3(mix(C0,C1,ee),c<1.5?0.0:bh);n=vec3(d.y,-d.x,0.0);U=ee*l;}
      else{p=vec3((c==0.0||c==3.0)?-pa:pa,c<1.5?-pb:pb,bh);n=vec3(0.0,0.0,1.0);U=p.x;l=2.0*pa;}
    }else if(s==5){
      float st=floor(k/16.0),fc=floor(mod(k,16.0)/4.0),sy=mod(a_w.w,2.0)<0.5?-1.0:1.0,hw=min(u_base.w,A)*0.5,z1=bh*(st+1.0)/3.0,y0=sy*pb,y1=sy*(pb+u_base.z*(2.0-st));
      off=off||A<1.2;
      if(fc<0.5){p=vec3((c==0.0||c==3.0)?-hw:hw,y1,c<1.5?0.0:z1);n=vec3(0.0,sy,0.0);}
      else if(fc<2.5){float x=fc<1.5?-hw:hw;p=vec3(x,(c==0.0||c==3.0)?y0:y1,c<1.5?0.0:z1);n=vec3(fc<1.5?-1.0:1.0,0.0,0.0);}
      else{p=vec3((c==0.0||c==3.0)?-hw:hw,(c<1.5)?y0:y1,z1);n=vec3(0.0,0.0,1.0);}
      U=p.x+hw;l=2.0*hw;
    }else{   // 기둥 · 받침목: 벽 한 면(s-6)의 칸 줄마다, 집(종류 0 · 1)과 위층(3)만
      int sd=s-6;float kk=e,c2=a_t.z;
      vec2 C0=sd==0?vec2(-A,-B):sd==1?vec2(A,-B):sd==2?vec2(A,B):vec2(-A,B),C1=sd==0?vec2(A,-B):sd==1?vec2(A,B):sd==2?vec2(-A,B):vec2(-A,-B);
      l=length(C1-C0);vec2 d=(C1-C0)/l,nn=vec2(d.y,-d.x);float bays=max(1.0,floor(l/u_bay+0.5));
      off=a_w.x>1.5&&a_w.x<2.5||kk>bays||bays>float(${POSTS - 1});
      vec2 at=C0+d*(l*kk/bays);float zb=a_q.y+(a_w.x<1.5?bh:0.0),zt=a_q.z;
      float fc=floor(c2/4.0),cc=mod(c2,4.0),sx=(cc==0.0||cc==3.0)?-1.0:1.0,up=cc<1.5?0.0:1.0;
      float w=fc<3.0?u_post.x*0.5:u_post.z*0.5,po=fc<3.0?u_post.y:u_post.w,z0=fc<3.0?zb:zt-0.26,z1=fc<3.0?zt-0.05:zt-0.12;
      float fq=fc<3.0?fc:fc-3.0;
      if(fq<0.5){p=vec3(at+d*(sx*w)+nn*po,mix(z0,z1,up));n=vec3(nn,0.0);}
      else if(fq<2.5){float sg=fq<1.5?-1.0:1.0;p=vec3(at+d*(sg*w)+nn*(sx<0.0?0.0:po),mix(z0,z1,up));n=vec3(d*sg,0.0);}
      else{p=vec3(at+d*(sx*w)+nn*(up<0.5?0.0:po),z0);n=vec3(0.0,0.0,-1.0);}
      U=0.0;solid=true;
    }
  }
  float c=cos(a_p.z),sn=sin(a_p.z);mat2 R=mat2(c,sn,-sn,c);
  vec2 xy=a_p.xy+R*p.xy*u_mpu;float z=p.z*u_grow;
  gl_Position=off?vec4(0.0,0.0,2.0,1.0):u_matrix*vec4(xy,z*u_mpu,1.0);
  float lq=min(65535.0,floor(l*20.0+0.5)),w3=a_w.x>=2.0?clamp(floor(a_q.w*20.0+0.5),1.0,255.0):mod(float(s)*5.0+a_w.w,16.0),Hq=min(65535.0,floor(a_q.z*10.0+0.5));
  v_n=vec3(R*n.xy,n.z);v_z=z;v_u=U;v_wm=u_wo+xy*u_S;
  v_wall=vec4(max(1.0,floor(l/u_bay+0.5)),mod(lq,256.0),floor(lq/256.0),w3);float door=(s==(mod(a_w.w,2.0)<0.5?0:2)&&a_w.x<1.5&&a_q.y<0.01&&A>=1.2)?1.0:0.0;   // 계단 앞 칸은 문
  v_bld=vec4(a_d.x,a_d.y,a_w.x,solid?2.0:door);v_misc=vec4(a_w.y,a_w.z,mod(Hq,256.0),floor(Hq/256.0));v_kind=9.0;
}`;
// x-ray (심시티): the screen boxes of the station platforms and running trains this frame (NDC x0,y0,x1,y1; their farthest window
// depth and fade weight): a building fragment inside one (feathered by u_xv.z px) and nearer than the target turns to glass
const XR_N = 48;
const XR_GLSL = `uniform vec4 u_xr[${XR_N}];uniform vec2 u_xd[${XR_N}];uniform int u_xn;uniform vec4 u_xv;
float xray(){
  if(u_xn<=0)return 0.0;
  vec2 p=gl_FragCoord.xy/u_xv.xy*2.0-1.0,fe=u_xv.z*2.0/u_xv.xy;float f=0.0;
  for(int i=0;i<${XR_N};i++){if(i>=u_xn)break;if(gl_FragCoord.z>=u_xd[i].x)continue;vec4 r=u_xr[i];
    vec2 a=smoothstep(r.xy-fe,r.xy,p)*(1.0-smoothstep(r.zw,r.zw+fe,p));f=max(f,a.x*a.y*u_xd[i].y);}
  return f;
}`;
// 스타크래프트 종족 건물(부품 'race'), 인스턴스로: 종족 템플릿(모형 × 비율 — race_buildings.mjs raceTemplates)의 점을 기록대로 놓는다
// (기록: mesh.mjs packModels — 자리 · 긴 축 · 반 길이 · 반 폭 · 높이 단위, 재질 · 지붕 색 · 높이, 건물 바이트). 같은 FS 를 쓴다(종류 · 색 칸은 템플릿 점마다)
const VS_MODEL = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_t;layout(location=1) in vec3 a_tn;layout(location=2) in float a_tb;layout(location=3) in float a_ks;
layout(location=4) in vec4 i_a;layout(location=5) in vec4 i_b;layout(location=6) in vec4 i_c;layout(location=7) in vec4 i_d;
uniform mat4 u_matrix;uniform float u_mpu;uniform vec2 u_wo;uniform float u_S;uniform float u_grow;uniform vec2 u_detail;uniform float u_ztop;   // u_ztop > 0: 가림 상자(깊이 패스) — 상자 높이를 그 템플릿 꼭대기로
out vec3 v_n;out float v_z;out float v_u;out vec2 v_wm;flat out vec4 v_wall;flat out vec4 v_bld;flat out vec4 v_misc;flat out float v_kind;
void main(){
  vec2 U=vec2(i_a.w,i_b.x),V=vec2(-U.y,U.x);float HX=i_b.y,HY=i_b.z,s=i_b.w;
  vec3 at=a_t;if(u_ztop>0.0)at.z*=u_ztop;
  float kind=floor(a_ks/16.0+0.001),slot=a_ks-kind*16.0,zb=i_a.z+a_tb*s,z=i_a.z+at.z*s;
  if(kind==3.0)z=zb+(z-zb)*u_detail.x;   // 작은 기계 · 테두리 · 빛은 보통 건물처럼 가까이서 자란다
  if(kind==5.0||kind==7.0)z=zb+(z-zb)*u_detail.y;
  z*=u_grow;
  vec2 xy=i_a.xy+(U*(at.x*HX)+V*(at.y*HY))*u_mpu;
  gl_Position=u_matrix*vec4(xy,z*u_mpu,1.0);
  vec3 n=normalize(vec3(a_tn.x/HX,a_tn.y/HY,a_tn.z/s));
  v_n=vec3(U*n.x+V*n.y,n.z);v_z=z;v_u=kind==1.0?0.0:zb;v_wm=u_wo+xy*u_S;v_wall=vec4(0.0);v_bld=i_d;
  v_misc=vec4(kind==0.0?i_c.x:kind==1.0?i_c.y:slot,kind==7.0?zb/0.2:0.0,i_c.z,i_c.w);v_kind=kind;
}`;
const FS_DEPTH = `#version 300 es
precision highp float;in float v_z;flat in vec4 v_bld;flat in float v_kind;uniform vec4 u_through;uniform vec4 u_thBand;out vec4 o;
${XR_GLSL}
void main(){
  if(xray()>0.5)discard;   // a building hiding a station or a train: no depth there, so the train canvas draws them (the glass pass tints them after)
  if(u_through.w>0.5&&int(v_kind+0.5)==6){   // a wall piece the viaduct passes through (kind 6): its glass band writes no depth, so the deck and the trains show through it
    int rq=((int(v_bld.z+0.5)>>6)&3)*16+(int(v_bld.w+0.5)>>4);float rail=u_through.x+float(rq)*u_through.y;   // the deck's rail height there (6 bits)
    if(v_z>rail-u_thBand.x&&v_z<rail+u_thBand.y)discard;}
  o=vec4(0.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 v_n;in float v_z;in float v_u;in vec2 v_wm;flat in vec4 v_wall;flat in vec4 v_bld;flat in vec4 v_misc;flat in float v_kind;
uniform vec4 u_tA[6];uniform vec4 u_tB[6];uniform vec4 u_tC[6];uniform vec4 u_tD[6];uniform vec4 u_tE[6];uniform vec4 u_tF[6];uniform vec4 u_tG[6];
uniform vec3 u_mwall[32];uniform vec3 u_mglass[32];uniform vec4 u_mfac[32];uniform float u_mbay[32];uniform vec3 u_roofPal[64];
uniform vec3 u_hk[8];uniform vec3 u_hk2[7];uniform vec3 u_giwa[4];uniform vec4 u_hkP;uniform vec2 u_hkE;uniform vec4 u_hkG[2];   // 조선 모드: wood, plaster, paper, stone, 담장, the eave's underside, lit paper, ridge; 초가 ×3, 흙벽, 돌담 ×2, 고층 유리창; 기와 ×3; platform height, post width, 창호 share, lit share; lit paper's emission; 고층 처마 무리(city_hanok.mjs skirtGroups: 폭, 사이, 모서리 몫 · 최소 · 최대, 가운데 최소)
uniform vec4 u_ground[6];uniform vec3 u_pitched[3];uniform vec3 u_awning[3];uniform vec3 u_sign[8];uniform vec3 u_signInk[2];uniform float u_signNight;uniform sampler2D u_signText;uniform float u_signHW[64];uniform float u_signVL[24];uniform float u_signOn;uniform vec3 u_equip;uniform vec3 u_lit[3];uniform vec3 u_litMean[6];
uniform vec3 u_sun;uniform vec3 u_lightCol;uniform vec4 u_shade;uniform vec4 u_nightUp;uniform vec4 u_nightK;uniform vec2 u_nightF;uniform vec2 u_ao;uniform vec4 u_refl;uniform vec4 u_reflB;uniform vec3 u_sky[2];uniform vec4 u_art;uniform vec3 u_artTop;uniform vec4 u_artBelt;uniform vec4 u_artDim;uniform vec4 u_artDL;uniform vec4 u_reflH;uniform vec4 u_reflD;uniform vec2 u_lodPx;uniform float u_debug;
${XR_GLSL}
uniform vec4 u_xa;   // the glass pass: opacity, outline opacity, outline width (px)
uniform vec4 u_through;uniform vec4 u_thBand;uniform vec3 u_thGlass;uniform vec3 u_thFrame;uniform vec3 u_thInside;uniform vec3 u_thMix;   // buildings the viaduct passes through: rail height code base/step (m) + depth-open flag; band below/above, post width/spacing; glass, posts, the lit hall by day; sky mix, hall mix by day, night brightness relative to the type's lit windows
out vec4 o;
float hash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
// coverage of {fract(x) in [a,b]} box-filtered over a pixel w wide (cell units): windows never alias or moiré
float pint(float x,float a,float b){float f=floor(x),r=x-f;return f*(b-a)+clamp(r-a,0.0,b-a);}
float pulse(float x,float a,float b,float w){w=max(w,1e-4);return (pint(x+w*.5,a,b)-pint(x-w*.5,a,b))/w;}
// 되풀이 없는 한 구간 [a,b] 의 덮임(픽셀 폭 w 로 거른 값)
float seg(float x,float a,float b,float w){w=max(w,1e-4);return (clamp(x+w*.5,a,b)-clamp(x-w*.5,a,b))/w;}
vec3 toSrgb(vec3 c){return pow(max(c,0.0),vec3(1.0/2.2));}
float lum(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}
// CIE L* of a linear luminance, and the factor that moves a colour's L* by dL: the pack's ΔL* values land on the screen as written
float lstar(float Y){return Y>0.008856?116.0*pow(Y,1.0/3.0)-16.0:903.3*Y;}
float yOfL(float L){return L>8.0?pow((L+16.0)/116.0,3.0):L/903.3;}
float dlMul(float Y,float dL){Y=max(Y,1e-3);return clamp(yOfL(max(0.0,lstar(Y)+dL))/Y,0.25,4.0);}
void shade(){
  int kind=int(v_kind+0.5),tv=int(v_bld.z+0.5),type=tv&7,crown=(tv>>3)&3,flags=int(v_bld.w+0.5),slot=int(v_misc.x+0.5);bool famFac=(tv&32)!=0;
  float seed=v_bld.x+v_bld.y*256.0,H=(v_misc.z+v_misc.w*256.0)*0.1;
  bool night=u_shade.z>0.5;
  vec3 n=normalize(v_n);
  // light: a world direction; faces away from it at most u_shade.x darker (linear), roofs up to u_shade.y brighter
  float el=u_sun.z,horiz=max(0.3,sqrt(max(0.0,1.0-el*el))),k=clamp(max(0.0,dot(n,u_sun))/horiz,0.0,1.0);
  float shade=n.z>0.6?1.0+u_shade.y*max(0.0,el)*(0.3+0.7*n.z):1.0-u_shade.x*(1.0-k);
  vec3 light=u_lightCol*shade,col;
  if(kind==6){   // a wall piece the viaduct passes through (the portal the mesh cut around its path; its rail height in 6 bits): the floor it crosses is a glass hall — thin posts, the sky in the glass and the lit hall by day; by night lit like the type's windows, a little brighter
    float rail=u_through.x+float(((tv>>6)&3)*16+(flags>>4))*u_through.y;
    if(v_z>rail-u_thBand.x&&v_z<rail+u_thBand.y){
      float mu=v_u/u_thBand.w,mw=0.5*u_thBand.z/u_thBand.w,post=pulse(mu+0.5,0.5-mw,0.5+mw,fwidth(mu));
      vec3 g;
      if(night)g=u_litMean[type]*u_tE[type].x*u_thMix.z;
      else{g=mix(u_thGlass*mix(u_refl.x,u_refl.y,k),mix(u_sky[0],u_sky[1],0.5),u_thMix.x);g=mix(g,u_thInside,u_thMix.y);}
      col=mix(g,u_thFrame*light,post);
      o=vec4(toSrgb(col),1.0);return;
    }
  }
  if(kind==1){   // flat roof: its colour slot (family roof, the type's variants, the membrane or the plain roof); its axis angle in v_u
    vec3 mat=u_roofPal[slot];
    if((flags&2)!=0){vec2 c=floor(v_wm/10.0);mat*=0.965+0.07*hash(vec3(c,seed));}   // merged low-rise: roof panels
    if(type==4){float a=v_u;float p=dot(v_wm,vec2(cos(a),sin(a)))/4.0;mat*=1.0-0.08*pulse(p,0.0,0.5,fwidth(p));}   // industrial: panel lines
    col=mat*light*u_nightF.y;   // (u_nightF.y: 밤 불빛의 지붕 빛 — 끄면 1)
  }else if(kind==3){col=u_equip*light*u_nightF.y;}
  else if(kind==4){col=u_pitched[slot]*light*u_nightF.y;}
  else if(kind==5){col=u_awning[slot]*light;}
  else if(kind==8){   // 조선: 기와 — the joints between the tile rows down the slope (v_u: along the eave, m), the ridge dark; underneath, the eave's rafters. slot 3: the 목탑's golden 상륜
    if(slot==3)col=u_giwa[3]*u_lightCol*(0.7+0.45*clamp(dot(n,u_sun),0.0,1.0));
    else if(n.z<-0.2){float p=v_u/0.32;col=u_hk[5]*u_lightCol*(0.55+0.2*k)*mix(1.0,1.9,pulse(p,0.0,0.45,fwidth(p)));}   // 처마 밑: 어두운 바탕에 서까래 줄
    else if(abs(n.z)<0.3){   // 처마 끝 두께(고층 처마): 기와 끝의 와구토 — 어두운 바탕에 흰 점줄
      float p=v_u/0.3;col=mix(u_giwa[slot<3?slot:0]*0.7,u_hk[1]*0.85,0.38*pulse(p,0.12,0.5,fwidth(p)))*light;   // (Codex 3차: 흰 점이 빗살처럼 튀지 않게)
    }
    else{
      vec3 g=slot==4?u_hk[7]:u_giwa[slot<3?slot:0];float p=v_u/0.3;if(slot!=4)g*=1.0-0.08*pulse(p,0.0,0.38,fwidth(p));   // (Codex 2차: 골 명암 5~8 %; slot 4: 추녀마루)
      if(v_z>H-0.30)g=u_hk[7];   // 용마루 (H: its top; a skirt carries none)
      else if(v_z<v_misc.y*0.05-0.03)g=mix(g,u_hk[1],0.8);   // 와구토: the white line along the eave (below the wall's top: the eave's edge, thinning up the lifted corners)
      col=g*u_lightCol*(0.62+0.5*clamp(dot(n,u_sun),0.0,1.0));
    }
  }
  else if(kind==11){   // 조선: 초가 — straw streaks down the slope (fading out where they would shimmer), the thick cut edge darker, the 용마름 at the top
    vec3 g=u_hk2[slot<3?slot:0];float sw=0.14/max(fwidth(v_u),1e-4);
    g*=mix(1.0,0.94+0.1*hash(vec3(floor(v_u/0.14),seed,3.0)),smoothstep(1.0,3.0,sw));   // (Codex 3차: 줄무늬 대비 절반 — 나무판처럼 보이지 않게)
    if(n.z<0.3)g*=0.72;
    if(v_z>H-0.35)g*=0.8;
    col=g*u_lightCol*(0.62+0.5*clamp(dot(n,u_sun),0.0,1.0));
  }
  else if(kind==12){   // 조선: 돌담 — fieldstones of uneven size in staggered courses, dark joints (the top: stones seen from above)
    vec2 q=n.z>0.5?v_wm/vec2(0.5,0.4):vec2(v_u/0.5,v_z/0.32);float row=floor(q.y);q.x+=hash(vec3(row,seed,7.0));
    vec2 c=floor(q);float j=max(pulse(q.x,0.0,0.1,fwidth(q.x)),pulse(q.y,0.0,0.12,fwidth(q.y)));
    col=mix(u_hk2[4],u_hk2[5],hash(vec3(c,seed)))*(0.88+0.2*hash(vec3(c,seed+1.0)))*(1.0-0.35*j)*light;
  }
  else if(kind==9){   // 조선: 한옥 — the stone band at the foot (기단); above it 기둥 on the bay lines, 하인방 · 상인방, and 회벽 or 창호 between them; 창호 lit by night.
    // a_bld.z type: 0 a house, 1 a mud-walled 초가, 2 a tall body of storeys (a_wall.w: the storey, ×0.05 m), 3 one upper storey; H: the wall's top
    int wt=type;float st=v_wall.w*0.05;
    if((flags&2)!=0){col=u_hk[0]*light*(n.z<-0.5?0.62:1.0);}   // 입체 기둥 · 받침목(가까이)
    else if(n.z>0.5||(wt!=3&&v_z<u_hkP.x+0.01)){
      vec2 q=n.z>0.5?v_wm/vec2(0.9,0.45):vec2(v_u/0.9,v_z/0.28);q.x+=0.5*floor(q.y);
      float j=max(pulse(q.x,0.0,0.06,fwidth(q.x)),pulse(q.y,0.0,0.08,fwidth(q.y)));
      col=u_hk[3]*(0.92+0.1*hash(vec3(floor(q),seed)))*(1.0-0.2*j)*light;
    }else if(wt==2){
      // 한옥 고층 몸통 (Codex 검토 2026-10-10, 레퍼런스: 처마 지붕 무리 밑에 굵은 나무 틀의 큰 유리창, 무리 사이엔 회벽 판).
      // 지붕 무리는 city_hanok.mjs skirtGroups 와 같은 셈. 층마다 아래 보와 창방, 처마가 있는 층은 그 밑이 그늘
      float len=(v_wall.y+v_wall.z*256.0)*0.05,u=v_u,z0=v_misc.y*0.05,stepF=max(v_misc.x,1.0);
      float f=max(v_z-z0,0.0)/st,fl=floor(f),zr=fract(f),wz=fwidth(f),du=fwidth(u);
      float gw=u_hkG[0].x,gap=u_hkG[0].y,leg=clamp(u_hkG[0].z*len,u_hkG[0].w,u_hkG[1].x),g0=0.0,g1=len;bool inG=true;
      if(len>2.0*leg+gap){
        if(u<leg)g1=leg;else if(u>len-leg)g0=len-leg;
        else{inG=false;float sp=len-2.0*leg-2.0*gap;
          if(sp>=u_hkG[1].y){float nn=max(1.0,floor((sp+gap)/(gw+gap)+0.5)),w=(sp-(nn-1.0)*gap)/nn,x=u-leg-gap,i=floor(x/(w+gap));
            if(x>=0.0&&i<nn&&x-i*(w+gap)<w){inG=true;g0=leg+gap+i*(w+gap);g1=g0+w;}}
          if(!inG){g0=u;g1=u;}}
      }
      float zm=zr*st,dz=wz*st,beam=max(seg(zm,0.0,0.32,dz),seg(zm,st-0.42,st,dz));   // 아래 보 · 창방
      vec3 wood=u_hk[0],c;
      if(inG){
        float x=u-g0,W=g1-g0,post=max(seg(x,0.0,0.34,du),seg(x,W-0.34,W,du));
        float wx0=0.5,wx1=W-0.5,nu=max(1.0,floor((wx1-wx0)/1.7+0.5)),uw=(wx1-wx0)/nu,fx=x-wx0,fu=fract(fx/uw)*uw,wi=floor(fx/uw);
        bool win=x>wx0&&x<wx1&&zm>0.86&&zm<st-0.7;   // (Codex 2차: 창 45 · 회벽 35 · 나무 20 %, 잔 틀은 가늘게)
        float mull=win?max(seg(fu,0.0,0.05,du),seg(fu,uw-0.05,uw,du)):0.0,frame=win?max(mull,max(seg(zm,0.86,0.92,dz),seg(zm,st-0.76,st-0.7,dz))):0.0;
        float sash=win?seg(fu,uw*0.5-0.02,uw*0.5+0.02,du)*0.8:0.0;   // 미닫이 두 짝
        bool lit=night&&hash(vec3(seed,fl*13.0+wi,g0))<u_hkP.w;
        float gv=hash(vec3(seed,fl,g0+0.5));gv=gv<0.15?0.72:0.95+0.1*gv;   // 창 무리마다 밝기 조금씩, 몇은 어둡게(커튼)
        vec3 gc=lit?u_hk[6]*u_hkE.x:u_hk2[6]*gv*(0.85+0.3*zr)*light;
        c=win?mix(gc,wood*1.25*light,max(frame,sash)):mix(u_hk[1],wood,0.12)*light*0.94;   // 창 밑 · 옆 판벽은 회벽보다 조금 어둡게
        c=mix(c,wood*light,max(post,beam));
        float above=fl+1.0;   // 이 층 위에 처마가 있으면 그 밑 그늘(창 위쪽이 어둡다)
        if(mod(above,stepF)<0.5&&above>=stepF)c*=1.0-0.3*smoothstep(0.4,1.0,zr);
      }else{
        float mid=seg(zm,st*0.5-0.08,st*0.5+0.08,dz);   // 무리 사이: 회벽 판, 가운데 띠
        c=mix(u_hk[1]*light,wood*light,max(beam,mid));
      }
      col=c;
    }else{
      float len=(v_wall.y+v_wall.z*256.0)*0.05,bay=len/max(v_wall.x,1.0),tx=v_u/bay,bI=floor(tx),wx=fwidth(tx);
      float pw=0.5*u_hkP.y/bay*(wt==2?0.7:1.0),post=pulse(tx+0.5,0.5-pw,0.5+pw,wx);   // (a tall body: slimmer posts, so its walls read white)
      float hgt,zr,fl=0.0;
      if(wt==2){hgt=st;float f=max(v_z-u_hkP.x,0.0)/st;fl=floor(f);zr=fract(f);}
      else if(wt==3){hgt=st;zr=(v_z-(H-st))/st;}
      else{hgt=max(H-u_hkP.x,0.5);zr=(v_z-u_hkP.x)/hgt;}
      float wz=fwidth(zr),beam=wt==2?smoothstep(0.9-wz,0.9,zr):max(1.0-smoothstep(0.08,0.08+wz,zr),smoothstep(0.84-wz,0.84,zr));   // a tall body: one beam a floor, under its eave
      float face=wt>=2?fl*7.0+v_wall.x+len:v_wall.w;   // (types 2–3: a_wall.w is the storey; the face seed from the floor and the face's length)
      bool paper=hash(vec3(seed,bI,face))<u_hkP.z*(wt==1?0.6:1.0);
      // 창살: 칸을 문짝(약 0.75 m)으로 나누고 울거미(테두리) 안에 띠살(촘촘한 세로살 + 위 · 가운데 · 아래 가로살 띠) 또는
      // 용자살(가운데 세로살 하나 + 가로살 셋). 면마다 한 가지. 셰이더 무늬라 정점 · 메모리는 그대로 (2026-10-09 덕배: 네모로만 보임)
      float lat=0.0,shd=0.0;
      if(paper){
        float pwm=u_hkP.y*(wt==2?0.7:1.0),x0=0.5*pwm,x1=bay-0.5*pwm,z0=wt==2?0.0:0.08*hgt,lh=(wt==2?0.9:0.84)*hgt-z0;
        float xm=fract(tx)*bay,dx=fwidth(xm),dz=fwidth(zr)*hgt,nl=max(1.0,floor((x1-x0)/0.75+0.5)),lw=(x1-x0)/nl;
        float fx=fract((xm-x0)/lw)*lw,fz=zr*hgt-z0;
        float frame=max(max(seg(fx,0.0,0.05,dx),seg(fx,lw-0.05,lw,dx)),max(seg(fz,0.0,0.06,dz),seg(fz,lh-0.06,lh,dz)));
        float sal;
        if(hash(vec3(seed,face,5.0))<0.6){   // 띠살
          float v=pulse(fx/0.09,0.0,0.22,dx/0.09),hb=0.0;
          for(int i=0;i<3;i++){float c=lh*(0.17+0.33*float(i));hb=max(hb,seg(fz,c-0.07,c+0.07,dz)*pulse(fz/0.035,0.0,0.45,dz/0.035));}
          sal=max(v,hb);
        }else{   // 용자살
          float v=seg(fx,0.5*lw-0.015,0.5*lw+0.015,dx),hb=0.0;
          for(int i=1;i<4;i++){float c=lh*0.25*float(i);hb=max(hb,seg(fz,c-0.015,c+0.015,dz));}
          sal=max(v,hb);
        }
        lat=max(frame,0.75*sal);
        shd=max(seg(fz,lh-0.13,lh-0.06,dz),seg(fx,0.05,0.11,dx));   // 창호가 벽보다 들어간 깊이: 위 · 왼쪽 안 그림자 (Codex 3차)
      }
      // by night a few faces light one or two neighbouring bays, in the middle of the bay only (an oil lamp behind the paper, not a lit wall)
      float fh=hash(vec3(seed,face,11.0)),run=floor(fh*max(v_wall.x-1.0,1.0));
      bool lit=night&&paper&&fh<u_hkP.w&&bI>=run&&bI<=run+1.0&&fract(tx)>0.18&&fract(tx)<0.82&&zr>0.28&&zr<0.76;
      vec3 wallC=wt==1?u_hk2[3]:u_hk[1];
      vec3 pc=lit?u_hk[6]*u_hkE.x*(1.0-0.45*lat):mix(mix(paper?u_hk[2]:wallC,u_hk[0],0.55*lat),u_hk[0]*0.62,0.5*shd)*light;
      if((flags&1)!=0&&abs(v_u-len*0.5)<0.75&&zr>0.08&&zr<0.84){float dl=seg(v_u,len*0.5-0.03,len*0.5+0.03,fwidth(v_u))+seg(abs(v_u-len*0.5),0.69,0.75,fwidth(v_u));pc=mix(u_hk[0]*1.18,u_hk[0]*0.55,min(dl,1.0))*light;}   // 계단 앞 칸: 나무 두 짝 문
      col=mix(pc,u_hk[0]*light,max(post,beam));
      if(wt!=2)col*=1.0-0.38*smoothstep(0.62,1.0,zr);   // 처마 밑 그늘 (Codex 2026-10-10: 얇은 판이 아닌 목조로 읽히게)
    }
  }
  else if(kind==10&&int(v_misc.y+0.5)==1){   // 조선: 합각 · 박공벽 — 회벽보다 어둡고 따뜻하게, 발치에 보, 지붕 밑 위쪽은 그늘 (Codex 2차: 밝은 삼각이 지붕에 뚫린 구멍처럼 보였다)
    float h=max(v_misc.x*0.05,0.1),zb=H-h,dz=fwidth(v_z);
    vec3 c=mix(u_hk[4],u_hk[0],0.18)*0.85;
    c=mix(c,u_hk[0],seg(v_z,zb-0.1,zb+0.16,dz));
    col=c*light*(1.0-0.35*smoothstep(zb+0.4*h,H,v_z));
  }
  else if(kind==10){   // 조선: 담장 — stone below, plaster above
    vec3 c=u_hk[4];
    if(v_z<0.8){vec2 q=vec2(v_u/0.7,v_z/0.27);q.x+=0.5*floor(q.y);float j=max(pulse(q.x,0.0,0.07,fwidth(q.x)),pulse(q.y,0.0,0.09,fwidth(q.y)));c=u_hk[3]*(0.9+0.12*hash(vec3(floor(q),seed)))*(1.0-0.22*j);}
    col=c*light;
  }
  else if(kind==7){   // 간판: 바탕색, 긴 면엔 글자 무늬(axis 1 가로 글줄 · 2 세로 글줄)와 어두운 테두리. 밤에는 스스로 빛난다
    vec3 bg=u_sign[slot&7],inkC=lum(bg)>0.3?u_signInk[1]:u_signInk[0];int ax=int(v_wall.x+0.5);
    float len=(v_wall.y+v_wall.z*256.0)*0.05,h=max(v_wall.w*0.05,0.05),z0=v_misc.y*0.2,t=v_z-z0,ink=0.0,rim=0.0;
    if(ax>0&&u_signOn>0.5){   // 진짜 한글: 간판마다 업종 이름 하나(1층 가로 · 2층 창 · 세로 돌출 낱말 묶음에서), 간판 크기에 맞춰 가운데에(web/city/sign_text.mjs)
      float A=ax==1?v_u:t,Bv=ax==1?t:v_u,LA=ax==1?len:h,LB=ax==1?h:len;
      float hs=hash(vec3(seed+len*3.1+float(slot),z0,float(ax)));
      int wi=ax==1?(z0>4.5?40+min(23,int(hs*24.0)):min(39,int(hs*40.0))):min(23,int(hs*24.0));   // 2층부터는 학원 · 병원 · 사무실 이름
      float ww=ax==1?u_signHW[wi]:u_signVL[wi],aspect=ww*${SIGN_ATLAS.hW.toFixed(1)}/${SIGN_ATLAS.hH.toFixed(1)};   // 낱말 길이 ÷ 글자 높이
      float gh=LB*0.68,gw=gh*aspect;if(gw>LA*0.92){gw=LA*0.92;gh=gw/aspect;}
      float uA=(A-(LA-gw)*0.5)/gw,vB=(Bv-(LB-gh)*0.5)/gh;bool band=uA>0.0&&uA<1.0&&vB>0.0&&vB<1.0;
      if(band){vec2 tc=ax==1?vec2((float(wi%${SIGN_ATLAS.hCols})*${SIGN_ATLAS.hW.toFixed(1)}+(1.0-uA)*ww*${SIGN_ATLAS.hW.toFixed(1)})/${SIGN_ATLAS.size.toFixed(1)},(float(wi/${SIGN_ATLAS.hCols})*${SIGN_ATLAS.hH.toFixed(1)}+(1.0-vB)*${SIGN_ATLAS.hH.toFixed(1)})/${SIGN_ATLAS.size.toFixed(1)})
        :vec2((float(wi)*${SIGN_ATLAS.vW.toFixed(1)}+(1.0-vB)*${SIGN_ATLAS.vW.toFixed(1)})/${SIGN_ATLAS.size.toFixed(1)},(${SIGN_ATLAS.vY.toFixed(1)}+(1.0-uA)*ww*${SIGN_ATLAS.vH.toFixed(1)})/${SIGN_ATLAS.size.toFixed(1)});
        ink=smoothstep(0.25,0.6,texture(u_signText,tc).r);}
      float px=gh/max(fwidth(A),1e-5);ink=mix(band?0.3:0.0,ink,smoothstep(3.0,7.0,px));   // 멀면 평균(물결무늬 없이)
      float e=min(min(v_u,len-v_u),min(t,h-t));rim=1.0-smoothstep(0.05,0.09,e);
    }
    else if(ax>0){
      float A=ax==1?v_u:t,Bv=ax==1?t:v_u,LA=ax==1?len:h,LB=ax==1?h:len;   // A: 글줄 방향, B: 그 가로(m)
      float gh=LB*0.56,gw=gh*0.92,pit=gw*1.2,nC=max(1.0,floor((LA-LB*0.6)/pit)),a0=(LA-nC*pit)*0.5+(pit-gw)*0.5;
      float ga=(A-a0)/pit,ci=floor(ga),gx=fract(ga)*pit/gw,gy=(Bv-(LB-gh)*0.5)/gh;
      bool band=ci>=0.0&&ci<nC&&gy>0.0&&gy<1.0;
      if(band&&gx<1.0){   // 글자 하나 = 한글처럼 획 몇 개: 왼쪽 자음(가로획 셋 · 세로획 둘 중 몇) + 오른쪽 모음(세로획, 곁가지)
        float g=seed+z0*13.0+float(slot)*7.0+len;bool b0=hash(vec3(g,ci,1.0))<0.6,b1=hash(vec3(g,ci,2.0))<0.5,b2=hash(vec3(g,ci,3.0))<0.6,b3=hash(vec3(g,ci,4.0))<0.55,b4=hash(vec3(g,ci,5.0))<0.4,b5=hash(vec3(g,ci,6.0))<0.5;
        float X=gx,Y=gy,w=0.14;bool L=X<0.6;
        bool on=L&&(b0&&Y>0.84-w&&Y<0.84+w*0.5||b1&&Y>0.5-w*0.5&&Y<0.5+w*0.5||b2&&Y>0.12-w*0.5&&Y<0.12+w||b3&&X>0.04&&X<0.04+w*1.1&&Y>0.1&&Y<0.9||b4&&X>0.46&&X<0.46+w*1.1&&Y>0.1&&Y<0.9);
        on=on&&(b0||b1||b2)||L&&b3&&X>0.04&&X<0.04+w*1.1&&Y>0.1&&Y<0.9;   // 가로획 없이 세로획만 남지 않게
        on=on||X>0.72&&X<0.72+w*1.1&&Y>0.04&&Y<0.96||b5&&X>0.72&&X<0.97&&Y>0.46&&Y<0.46+w;   // 모음: 세로획(ㅏ · ㅣ), 곁가지
        ink=on?1.0:0.0;}
      float px=gw/3.0/max(fwidth(A),1e-5);ink=mix(band?0.35:0.0,ink,smoothstep(1.2,3.0,px));   // 멀면 평균(물결무늬 없이)
      float e=min(min(v_u,len-v_u),min(t,h-t));rim=1.0-smoothstep(0.05,0.09,e);
    }
    vec3 c=mix(mix(bg,inkC,ink),bg*0.45,rim);if(ax==0)c=bg*0.8;
    col=night?c*u_signNight*(ax>0?1.0:0.5):c*light;
  }
  else{   // walls (0) and the parapet's inner faces (2): the material slot's wall and glass
    vec4 tA=u_tA[type],tB=u_tB[type],tC=u_tC[type],tD=u_tD[type],tE=u_tE[type],tF=u_tF[type],tG=u_tG[type],F=u_mfac[slot];
    vec3 wall=u_mwall[slot],glass=u_mglass[slot];
    if(kind==2)wall*=0.96;
    int pattern=famFac&&F.x>=0.0?int(F.x+0.5):int(tC.x+0.5);   // offices take their material family's facade; the rest keep the type's
    float floorM=tA.x,bayM=famFac&&u_mbay[slot]>0.0?u_mbay[slot]:tA.y,winW=famFac&&F.y>0.0?F.y:tA.z,winH=famFac&&F.z>0.0?F.z:tA.w,gM=tB.x,litR=tB.z,gLit=tB.w;
    bool storefront=(flags&4)!=0,absU=(flags&1)!=0,noAO=(flags&8)!=0,merged=(flags&2)!=0,cA=mod(floor(v_wall.w/64.0),2.0)>0.5,cB=v_wall.w>=128.0;   // the wall's ends: a real corner of the outline (mesh flags) or just a vertex splitting a straight facade
    int fcls=int(mod(floor(v_wall.w/16.0),4.0)+0.5);   // the face's windows, decided by the mesh from what the wall looks onto: 0 every bay, 1 every other bay, 2 one narrow column in the middle (no windows at all = bays 0)
    // floors: the ground floor, then the rest fitted into the height so no window is cut by the roof
    float gEff=min(gM,H),up=H-gEff,nUp=up<floorM*0.6?0.0:max(1.0,floor(up/floorM+0.5)),fM=nUp>0.0?up/nUp:floorM;
    bool ground=v_z<gEff||nUp==0.0;
    float ty=ground?v_z/max(gEff,0.1):(v_z-gEff)/fM,fIdx=ground?0.0:1.0+floor(ty),fy=fract(ty),cellH=ground?gEff:fM;
    float bays=v_wall.x,len=(v_wall.y+v_wall.z*256.0)*0.05,bay=absU?bayM:(bays>0.0?len/bays:bayM);
    float tx=v_u/bay,bIdx=floor(tx),fx=fract(tx),wx=fwidth(tx),wy=fwidth(ty);
    bool solid=bays<0.5||kind==2;
    // the office's crown, belts and corners (QA1 articulation) from z16.5 on: every value a stable function of the seed
    bool art=u_art.x>0.0&&type==3&&H>=u_art.x;float artK=art?smoothstep(u_art.y-0.2,u_art.y+0.2,u_art.z):0.0;
    float beltEvery=tC.z,beltM=tC.w;if(art){float bi=floor(hash(vec3(seed,41.0,1.0))*u_artBelt.w);beltEvery=bi<0.5?u_artBelt.x:bi<1.5?u_artBelt.y:u_artBelt.z;beltM=mix(u_artDim.x,u_artDim.y,hash(vec3(seed,43.0,1.0)));}   // the pack's belt rhythms and thicknesses, one stable pick a building
    float wallMul=1.0,x0=0.5-winW*0.5,x1=0.5+winW*0.5,y0=0.5-winH*0.5,y1=0.5+winH*0.5;
    if(pattern==0){float grp=floor(tC.y+hash(vec3(seed,v_wall.w,1.0))*(tC.z-tC.y+1.0));if(bays>=4.0&&mod(bIdx,grp+1.0)==grp)solid=true;}
    else if(pattern==1){if(tC.y>0.0&&mod(bIdx,tC.y)==tC.y-1.0){wallMul=tC.z;x0=0.11;x1=0.89;y0=0.1;y1=0.78;}}
    else if(pattern==2){y0=max(y0,tC.y/cellH+0.06);if(fy*cellH<tC.y)wallMul=0.93;}
    else if(pattern==3){float mx=tC.y/bay*0.5,my=tC.y/cellH*0.5,mull=max(pulse(tx+0.5,0.5-mx,0.5+mx,wx),pulse(ty+0.5,0.5-my,0.5+my,wy));wallMul=mix(1.0,lum(wall)>0.45?0.74:0.86,mull);if(beltEvery>0.0&&mod(fIdx,beltEvery)==0.0&&fy*cellH<beltM){solid=true;wallMul=1.0;}}   // curtain wall: the glass keeps the family's window ratio (x0..y1 above); the mullion is one thin dark line on each cell boundary, the frame around the glass the wall (spandrel) colour
    else if(pattern==4){y1=0.86;y0=y1-winH;float rh=0.5*tC.y/bay;wallMul*=1.0-0.15*pulse(tx+0.5,0.5-rh,0.5+rh,wx);}   // clerestory: the type's window height under the eave; ribs centred on the bay boundaries
    if(fcls==1){if(mod(bIdx+floor(mod(v_wall.w,16.0)),2.0)>0.5)solid=true;}   // a side face: every other bay, the phase from the edge seed
    else if(fcls==2){if(bIdx!=floor(bays*0.5))solid=true;else{float hw=winW*0.3;x0=0.5-hw;x1=0.5+hw;}}   // a slab's end or a narrow face: one narrow column
    if(ground){
      if(storefront){x0=0.05;x1=0.95;y0=0.08;y1=0.88;}
      else if(tD.z>0.5){wall=u_ground[type].rgb;if(type==4)solid=true;}
      else if(pattern==3){float gy=clamp(tB.y/max(winW,0.05),0.0,0.94);y0=0.5-gy*0.5;y1=0.5+gy*0.5;}   // the lobby: the bays' glass width, as tall as the ground floor's glass share asks
    }
    if(merged){float pIdx=floor(v_u/11.0+hash(vec3(seed,2.0,5.0)));wallMul*=0.96+0.08*hash(vec3(seed,pIdx,9.0));}
    if(artK>0.0){   // the top zone and the corners toned by the pack's ΔL* (lighter on dark walls, darker on light ones)
      float Yw=lum(wall*light)*wallMul,dir=lum(wall)>0.3?-1.0:1.0;
      bool inCrown=false;if(crown>0){float topH=min(H*mix(u_artTop.x,u_artTop.y,mod(seed,5.0)/4.0),u_artTop.z);inCrown=v_z>H-topH;}   // the same topH the mesh used
      if(inCrown){wallMul*=mix(1.0,dlMul(Yw,dir*mix(u_artDL.z,u_artDL.w,hash(vec3(seed,59.0,1.0)))),artK);if(artK>0.5)solid=true;}
      else if(!absU&&bays>0.0){   // corners, at the wall's real corners only: the pack's width × the building's budget share (a_bld.w high nibble, from the mesh)
        float cw=mix(u_artDim.z,u_artDim.w,hash(vec3(seed,47.0,1.0)))*float(flags>>4)/15.0;
        if((cA&&v_u<cw)||(cB&&len-v_u<cw))wallMul*=mix(1.0,dlMul(Yw,dir*mix(u_artDL.x,u_artDL.y,hash(vec3(seed,53.0,1.0)))),artK);
      }
    }
    float cov=solid?0.0:pulse(tx,x0,x1,wx)*pulse(ty,y0,y1,wy);
    // ambient occlusion: the base, and the corners of fitted walls
    float ao=1.0;
    if(!noAO){ao-=u_ao.x*(1.0-smoothstep(0.0,u_ao.y,v_z));if(!absU&&bays>0.0){float d=min(cA?v_u:1e3,cB?len-v_u:1e3);ao-=0.6*u_ao.x*(1.0-smoothstep(0.0,u_ao.y*1.2,d));}}
    float stK=storefront?1.0:fcls==0&&bays>0.5?0.45:0.0;   // 밤: 길 불빛(가로등 · 가게)이 벽 아래를 데운다 — 가게 벽은 다, 트인 면(길 쪽)은 반쯤, 옆 · 뒤 · 맞붙은 면은 안, 높이 오를수록 옅게
    vec3 stUp=night?u_nightUp.rgb*(stK*exp(-v_z/max(u_nightUp.w,0.1))):vec3(0.0);
    vec3 wallC=wall*wallMul*(light+stUp)*ao;
    // glass by day: its own diffuse range (linear), the sky mixed in by height and face, one broad fixed band a face; by night dark
    vec3 glassC;
    if(night)glassC=glass*(0.85+0.15*k)*u_lightCol;
    else{
      glassC=glass*mix(u_refl.x,u_refl.y,k);
      float zr=clamp((v_z/max(H,1.0)-u_reflH.x)/max(u_reflH.y-u_reflH.x,0.01),0.0,1.0),fs=mix(u_reflH.z,u_reflH.w,hash(vec3(seed,v_wall.w,23.0)));   // the pack's height range and face strengths
      float mixAmt=min(u_reflB.x,mix(u_refl.z,u_refl.w,zr)*fs*F.w);
      glassC=mix(glassC,mix(u_sky[0],u_sky[1],zr),mixAmt);
      // one broad band a face, bandDeltaLStar brighter than the glass beside it on the screen (scaled by the family's reflection), fixed to the face
      if(!absU&&bays>0.0&&u_reflD.y>0.0){float bw=mix(u_reflB.y,u_reflB.z,hash(vec3(seed,v_wall.w,29.0))),bc=hash(vec3(seed,v_wall.w,31.0))*(1.0-bw)+bw*0.5;if(abs(v_u/max(len,0.1)-bc)<bw*0.5)glassC*=dlMul(lum(glassC),mix(u_reflD.x,u_reflD.y,hash(vec3(seed,v_wall.w,37.0)))*F.w);}
    }
    // night: the lit mask (the type's own ratios when it has them, never outside the day window), the floor's share,
    // runs of lit bays cut, brightness tiers; far away the lit share blends to its mean (no shimmer)
    float lx0=x0,lx1=x1,ly0=y0,ly1=y1;
    if(tF.x>0.0&&!(ground&&storefront)){lx0=max(x0,0.5-tF.x*0.5);lx1=min(x1,0.5+tF.x*0.5);ly0=max(y0,0.5-tF.y*0.5);ly1=min(y1,0.5+tF.y*0.5);}
    float covLit=(solid||lx1<=lx0||ly1<=ly0)?0.0:pulse(tx,lx0,lx1,wx)*pulse(ty,ly0,ly1,wy);
    float litRatio=ground?gLit:litR;if(v_misc.y>0.5)litRatio=v_misc.y/255.0;
    litRatio*=ground?u_nightK.z:u_nightK.x;   // 밤 불빛(팩 night.lights): 켜진 몫 ×
    float pr=min(litRatio*mix(tE.z,tE.w,hash(vec3(seed,fIdx,3.0))),ground?u_nightK.w:u_nightK.y);   // (층마다 곱한 뒤의 상한: 끄면 1)
    float isLit=hash(vec3(seed,fIdx*131.0+bIdx,7.0))<pr?1.0:0.0;
    if(isLit>0.5&&tF.z>0.0){float run=0.0;for(float j=1.0;j<=3.0;j+=1.0)run+=hash(vec3(seed,fIdx*131.0+bIdx-j,7.0))<pr?1.0:0.0;if(run>=tF.z)isLit=0.0;}
    float litPx=(ly1-ly0)*cellH/max(fwidth(v_z),1e-5),litMix=smoothstep(u_lodPx.x,u_lodPx.y,litPx);
    float litV=night?mix(min(1.0,pr),isLit,litMix):0.0;
    float h2=hash(vec3(seed,bIdx*7.0+fIdx,11.0));vec3 litC=h2<tD.x?u_lit[0]:h2<tD.y?u_lit[1]:u_lit[2];litC=mix(u_litMean[type],litC,litMix);
    float E=ground?tE.y:tE.x,h3=hash(vec3(seed,bIdx*13.0+fIdx,17.0));
    E*=tG.w>0.0?(h3<tG.w?tG.x:h3<tF.w?tG.y:tG.z):mix(0.72,1.08,h3);   // three tiers when the type has them, else each window its own
    col=mix(wallC,glassC,cov);
    col=mix(col,litC*E,min(1.0,covLit*litV*(1.0+u_nightF.x*(1.0-litMix))));   // (밤 불빛: 멀리서 창 평균으로 섞일 때 그 몫을 키운다 — 넓게 본 동네도 켜진 것처럼)
  }
  if(u_debug>0.5){vec3 d=kind==0?vec3(0.6):kind==1?vec3(0.2,0.7,0.2):kind==2?vec3(0.9,0.1,0.1):kind==3?vec3(0.1,0.3,0.9):kind==4?vec3(1.0,0.6,0.1):vec3(0.9,0.1,0.9);col=d*(0.6+0.4*k);
    if(u_debug>1.5)col=vec3(max(0.0,-n.z),abs(n.x)*0.5+abs(n.y)*0.5,max(0.0,n.z));   // 2: the normal (blue up, green sideways, red down)
    if(u_debug>2.5)col=vec3(fract(v_z/10.0),v_z/max(H,1.0),H>0.0?1.0:0.0);   // 3: height
    if(u_debug>3.5)col=vec3(hash(vec3(float(slot),1.0,2.0)),hash(vec3(float(slot),3.0,4.0)),hash(vec3(float(slot),5.0,6.0)))*(0.6+0.4*k);}   // 4: the material / roof slot
  o=vec4(toSrgb(col),1.0);
}
void main(){
  float wz=fwidth(v_z),wu=fwidth(v_u);
  if(u_xv.w<0.5){shade();return;}
  // the glass pass (train canvas): only where the building hides a station or a train — the building at u_xa.x over what the
  // train canvas drew there, its outline (corners, the roof line, the parapet) nearly solid so it keeps its shape
  float f=xray();if(f<0.01)discard;
  shade();
  int kind=int(v_kind+0.5);float a=u_xa.x;
  if(kind==0||kind==6){float H=(v_misc.z+v_misc.w*256.0)*0.1,len=(v_wall.y+v_wall.z*256.0)*0.05;bool absU=(int(v_bld.w+0.5)&1)!=0;
    float dz=(H-v_z)/max(wz,1e-4),du=absU?1e4:min(v_u,len-v_u)/max(wu,1e-4);a=mix(u_xa.y,a,smoothstep(u_xa.z,u_xa.z+1.0,min(dz,du)));}
  else if(kind==2)a=u_xa.y;
  a=mix(1.0,a,f);o=vec4(o.rgb*a,a);
}`;


function compile(gl, vs, fs) {
  const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw Error('city-build shader: ' + gl.getShaderInfoLog(x)); return x };
  const p = gl.createProgram(); const a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs); gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p); gl.deleteShader(a); gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error('city-build link: ' + gl.getProgramInfoLog(p));
  const u = new Proxy({}, { get: (o, k) => k in o ? o[k] : (o[k] = gl.getUniformLocation(p, k)) });
  return { p, u };
}

// a built tile's size in memory (one copy): its vertex and index bytes
const meshBytes = m => m.verts.byteLength + m.idx.byteLength + (m.inst ? Object.values(m.inst).reduce((n, b) => n + b.byteLength, 0) : 0) + (m.models ? m.models.data.byteLength : 0);

// the through list (web/city/through_buildings.mjs, or opts.through: [{id, lng, lat, line, railM}]) as the builders want it: osm id → its crossing points
function throughIndex(list) {
  const byId = new Map(), byRing = new Map();
  for (const e of list || []) {
    if (!e || !Number.isFinite(+e.lng) || !Number.isFinite(+e.lat)) continue;
    const r = { lng: +e.lng, lat: +e.lat, railM: Number.isFinite(+e.railM) ? +e.railM : 11, line: e.line || '', path: Array.isArray(e.path) && e.path.length >= 2 ? e.path : null };   // path: the deck's way through it (lng/lat points) — only the walls it crosses open
    if (Number.isFinite(+e.id)) { let a = byId.get(+e.id); if (!a) byId.set(+e.id, a = []); a.push(r) }
    if (e.ring) { let a = byRing.get(String(e.ring)); if (!a) byRing.set(String(e.ring), a = []); a.push(r) }   // "z/x/y/feature/ring": the exact outline in the tile version the list was made from (several stretches can cross one outline)
  }
  return { byId, byRing, size: byId.size + byRing.size };
}

const DETAIL_Z = 18;   // 조선 인스턴스의 가까이 디테일(처마 밑면 · 끝 두께 · 망와 · 기단 · 계단): 이 줌부터. 템플릿에 들어 있어 타일 메모리는 그대로
// 조선의 인스턴스 종류 (city_hanok.mjs): 정점 셰이더, 템플릿(far · near 색인 범위), 기록의 속성 [위치, 개수, 형식(0 f32 · 1 u8), 바이트 위치]
const INST = {
  skirt: { vs: VS_SKIRT, tpl: P => { const T = cityPart('hanok').skirtTemplate(P.hanok?.tall?.skirtGroup?.rows || [0, .55, 1]); return { ...T, far: T.lo, near: [T.grid[0], T.grid[1] + T.edge[1]], nearPhone: T.grid } }, attrs: [[1, 4, 0, 0], [2, 2, 0, 16], [3, 4, 1, 24], [4, 4, 1, 28]] },
  roof: { vs: VS_ROOF, tpl: () => cityPart('hanok').roofTemplate(), attrs: [[1, 4, 0, 0], [2, 4, 0, 16], [3, 4, 0, 32], [4, 2, 0, 48], [5, 4, 1, 56], [6, 4, 1, 60]] },
  box: { vs: VS_BOX, tpl: () => cityPart('hanok').boxTemplate(), attrs: [[1, 4, 0, 0], [2, 4, 0, 16], [3, 4, 1, 32], [4, 4, 1, 36]] },
};

// ── the layer ────────────────────────────────────────────────────────────────────────────────────
export class CityBuildings {
  constructor(opts = {}) {
    this.id = 'city-buildings'; this.type = 'custom'; this.renderingMode = '3d';
    this.opts = opts; this.phone = !!opts.phone; this.P = resolvePack(opts.stylePack || SEOUL_CITY_STYLE);
    this.on = false; this.tone = 'simcity'; this.theme = 'light'; this.maxHeight = Infinity;
    this.tiles = new Map(); this.visible = []; this.ctx = new Map(); this.frame = 0; this.now = 0; this.timer = 0; this.growing = false;
    this.maxTiles = this.phone ? 18 : 40; this.maxBytes = this.phone ? 56e6 : Infinity; this.palette = null; this.stats = { built: 0, buildMs: 0, verts: 0 };
    this.useWorker = opts.worker !== false && typeof Worker !== 'undefined' && !opts.classify; this.workers = null;   // builds run in web/city/worker.mjs (a classify function cannot cross into one: main thread then)
    this.debug = 0; this.lodHi = LOD_HI; this.cull = 'cw'; this.noCull = false; this.skipDraw = false;   // dev knobs: kind colours, culling, LOD, draw calls off (JS cost alone)
    this.M64 = new Float64Array(16); this.M32 = new Float32Array(16);
    this.through = throughIndex(opts.through || THROUGH_LIST);   // osm id → the points where the viaduct crosses it (opts.through overrides the shipped list)
  }
  onAdd(map, gl) { this.map = map; this.gl = gl }   // (programs compiled on first draw: the city may never be switched on — 2026-10-10 첫 화면이 늦게 떴다)
  onRemove(map, gl) { for (const [g, c] of this.ctx) { for (const t of this.tiles.values()) this.free(g, t); g.deleteProgram(c.color.p); g.deleteProgram(c.depth.p) } this.ctx.clear(); this.map = null }
  // on/off, tone 'simcity' | 'coaster'(팩의 modes 항목), 'light' | 'dark', maxHeight (m; the coaster's towers are rides, not buildings)
  set(o) {
    if (o.pack && o.pack !== this.P.pack) this.setPack(o.pack);
    if (o.on != null) this.on = o.on; if (o.tone) this.tone = o.tone; if (o.theme) this.theme = o.theme; if (o.maxHeight != null) this.maxHeight = o.maxHeight; if (o.night) this.night = o.night;   // night: {lights} 밤 불빛 켬(팩 night.lights)
    this.palette = null; this.map?.triggerRepaint();
  }
  // another style pack (조선 모드 ↔ 심시티): every tile built again with it; a build already in a worker comes back to no tile and is dropped
  setPack(pack) {
    this.P = resolvePack(pack); this.palette = null;
    for (const e of this.tiles.values()) for (const gl of this.ctx.keys()) this.free(gl, e);
    this.tiles.clear(); this.visible = [];
    for (const w of this.workers || []) w.postMessage({ type: 'pack', pack, through: this.through });
  }
  shown() { return this.on && this.canShow() }
  // 켜면 보일 줌 · 지도인가(켜짐은 묻지 않는다)
  canShow() {
    if (!this.map) return false;
    if (this.map.getZoom() < (this.phone ? 14.5 : 14)) return false;   // phones: a little later than the desktop (the far fade keeps it light)
    return !this.map.getLayer('bm-bld') || this.map.getLayoutProperty('bm-bld', 'visibility') !== 'none';
  }
  // 미리 짓기(꺼져 있을 때 · 본체가 지도가 쉴 때 부른다): 켜면 보일 타일을 그리지 않고 짓기만 해 둔다 — 모드를 누르면 다 지은 것을
  // 올리기만 한다(덕배 2026-10-12: 전환 때 '건물 짓는 중' 2~3초). 한도(maxTiles · 휴대폰 maxBytes · 먼 타일 빼기)는 켜졌을 때와 같다
  prebuild(map) {
    if (this.on) return false;
    this.map = map;   // (지도에 아직 안 올린 층: onAdd 전에도 타일 관리자를 읽는다)
    if (!this.canShow()) return false;
    this.frame++; this.collect(); return true;
  }
  animating() { return this.growing }
  // 모드 바꾸는 중 게이지(본체): 지난 그리기에서 보인 z14 타일 중 다 지은 수 / 전체
  progress() {
    let ready = 0, total = 0;
    for (const e of this.tiles.values()) if (e.used === this.frame) { total++; if (e.state === 'ready') ready++ }
    return { ready, total };
  }
  context(gl) {
    let c = this.ctx.get(gl);
    if (!c) { c = { color: compile(gl, VS, FS), depth: compile(gl, VS, FS_DEPTH), inst: {}, tpl: {} }; this.ctx.set(gl, c) }
    return c;
  }
  // an instance kind's template in this context (again when the pack's shape of it changes)
  template(gl, C, kind) {
    const T = INST[kind].tpl(this.P), key = Array.from(T.verts).join(',');
    if (C.tpl[kind]?.key === key) return C.tpl[kind];
    if (C.tpl[kind]) { gl.deleteBuffer(C.tpl[kind].vbo); gl.deleteBuffer(C.tpl[kind].ibo) }
    const vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, T.verts, gl.STATIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, T.idx, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return (C.tpl[kind] = { key, vbo, ibo, far: T.far, near: T.near, nearPhone: T.nearPhone || T.near, detail: T.detail || T.near });
  }
  // ── tiles ──
  // the canonical z14 tiles the map is showing: meshes for those we have, builds queued for the rest
  collect() {
    const map = this.map, tm = map.style?.tileManagers?.ofm; this.visible = [];
    if (!tm) return;
    const maxz = map.getSource('ofm')?.maxzoom ?? 14, seen = new Set(), c = map.getCenter(), cm = [c.lng / 360 + .5, .5 - Math.log(Math.tan(Math.PI / 4 + c.lat * RAD / 2)) / (2 * Math.PI)];
    const far = this.phone ? this.farLimit(map.getZoom())[1] / (EARTH * Math.cos(c.lat * RAD)) : Infinity;   // phones: tiles wholly beyond the far fade are not built
    let ids; try { ids = tm.getRenderableIds() } catch { return }
    let queued = false;
    for (const id of ids) {
      const tile = tm.getTileByID(id); if (!tile) continue; const cz = tile.tileID.canonical;
      if (cz.z !== maxz) continue;
      const key = cz.z + '/' + cz.x + '/' + cz.y; if (seen.has(key)) continue; seen.add(key);
      let e = this.tiles.get(key);
      if (!e) {
        if (!tile.latestFeatureIndex?.rawTileData) continue;   // no data yet (or an empty tile)
        if (far < Infinity) { const n = 2 ** cz.z, dx = Math.max(cz.x / n - cm[0], 0, cm[0] - (cz.x + 1) / n), dy = Math.max(cz.y / n - cm[1], 0, cm[1] - (cz.y + 1) / n); if (Math.hypot(dx, dy) > far) continue }
        e = { key, z: cz.z, x: cz.x, y: cz.y, state: 'queued', tile, builder: null, mesh: null, gpu: new Map(), readyAt: 0, used: 0, prio: 0 };
        this.tiles.set(key, e); queued = true;
      }
      e.used = this.frame;
      const n = 2 ** cz.z; e.prio = Math.hypot((cz.x + .5) / n - cm[0], (cz.y + .5) / n - cm[1]);
      if (e.state === 'ready') this.visible.push(e); else queued = true;
    }
    if (queued) this.schedule();
    // least recently seen first, down to maxTiles and (phones) maxBytes of mesh: a 조선 tile is ~4× a 심시티 one, and the
    // phone tab was killed (reloaded) holding 18 of them on two canvases (2026-10-09)
    let bytes = 0; for (const e of this.tiles.values()) bytes += e.bytes || 0;
    if (this.tiles.size > this.maxTiles || bytes > this.maxBytes) {
      const old = [...this.tiles.values()].filter(e => e.used !== this.frame).sort((a, b) => a.used - b.used);
      for (const e of old) {
        if (this.tiles.size <= this.maxTiles && bytes <= this.maxBytes) break;
        for (const gl of this.ctx.keys()) this.free(gl, e); this.tiles.delete(e.key); bytes -= e.bytes || 0;
      }
    }
  }
  schedule() { if (!this.timer) this.timer = setTimeout(() => this.work(), 1) }
  // the build workers (one; two on a roomy desktop), started on first use; any failure falls back to main-thread slices
  startWorkers() {
    if (this.workers) return this.workers.length > 0;
    this.workers = []; if (!this.useWorker) return false;
    const n = !this.phone && typeof navigator !== 'undefined' && navigator.hardwareConcurrency >= 6 ? 2 : 1;
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
        w.busy = null; w.onmessage = ev => this.onWorker(w, ev.data); w.onerror = ev => { console.warn('city-build: worker failed, building on the main thread', ev.message || ev); this.dropWorkers() };
        w.postMessage({ type: 'pack', pack: this.P.pack, through: this.through }); this.workers.push(w);
      }
    } catch (e) { console.warn('city-build: no worker', e); this.dropWorkers() }
    return this.workers.length > 0;
  }
  dropWorkers() { for (const w of this.workers || []) { try { w.terminate() } catch { } if (w.busy && this.tiles.get(w.busy.key) === w.busy) this.tiles.delete(w.busy.key) } this.workers = []; this.useWorker = false; this.schedule() }
  onWorker(w, m) {
    const e = w.busy; w.busy = null;
    if (e && m.key === e.key && this.tiles.get(m.key) === e) {
      if (m.type === 'done') { e.mesh = m.mesh; e.bytes = meshBytes(m.mesh); e.state = 'ready'; e.readyAt = performance.now(); this.stats.built++; this.stats.buildMs += e.readyAt - e.t0; this.stats.verts += m.mesh.verts.byteLength / STRIDE; if (this.on) this.map?.triggerRepaint() }   // (미리 짓기: 그릴 것 없음)
      else { console.warn('city-build: a tile failed in the worker', m.error); this.tiles.delete(e.key) }
    }
    this.schedule();
  }
  // build: in the workers (the nearest queued tile to each idle one), else in main-thread slices: a few ms at a
  // time, less while the map moves, the nearest tile first
  work() {
    this.timer = 0; const map = this.map; if (!map) return;
    const pending = [...this.tiles.values()].filter(e => e.state !== 'ready').sort((a, b) => a.prio - b.prio);
    if (this.startWorkers()) {
      for (const w of this.workers) {
        while (!w.busy) {
          const e = pending.find(e => e.state === 'queued'); if (!e) break;
          const raw = e.tile?.latestFeatureIndex?.rawTileData;
          if (!raw) { this.tiles.delete(e.key); pending.splice(pending.indexOf(e), 1); continue }   // gone before we got to it: again when it is back
          const pbf = raw.slice(0); e.state = 'building'; e.t0 = performance.now(); e.tile = null; w.busy = e;
          w.postMessage({ type: 'build', key: e.key, z: e.z, x: e.x, y: e.y, pbf, phone: this.phone }, [pbf]);
        }
      }
      return;
    }
    const budget = map.isMoving() ? 2.5 : 7, t0 = performance.now();
    for (const e of pending) {
      if (performance.now() - t0 > budget) break;
      if (!e.builder) {
        const fi = e.tile?.latestFeatureIndex; let layers = null; try { layers = fi?.rawTileData ? fi.loadVTLayers() : null } catch { }
        if (!layers) { this.tiles.delete(e.key); continue }   // gone before we got to it: again when it is back
        e.builder = new TileBuilder({ z: e.z, x: e.x, y: e.y, extent: layers.building?.extent || 4096, buildings: layers.building || null, landuse: layers.landuse || null }, this.P, { phone: this.phone, classify: this.opts.classify, through: this.through });
        e.t0 = performance.now(); e.tile = null; e.state = 'building';
      }
      const left = budget - (performance.now() - t0), ts = performance.now(), done = e.builder.step(Math.max(1, left)); this.stats.mainBuildMs = (this.stats.mainBuildMs || 0) + performance.now() - ts;   // main-thread time spent in slices (0 with workers)
      if (done) {
        e.mesh = e.builder.result(); e.bytes = meshBytes(e.mesh); e.builder = null; e.state = 'ready'; e.readyAt = performance.now();
        this.stats.built++; this.stats.buildMs += e.readyAt - e.t0; this.stats.verts += e.mesh.verts.byteLength / STRIDE;
        map.triggerRepaint();
      }
    }
    if ([...this.tiles.values()].some(e => e.state !== 'ready')) this.timer = setTimeout(() => this.work(), 6);
  }
  // phones: the far field fades into the ground beyond this distance (m) from the view centre — [start, end] by zoom
  farLimit(zoom) { const d1 = Math.min(2600, 1200 * 2 ** ((zoom - 15) * .5)); return [d1 * .7, d1] }
  // a tile's buffers: made at their full size, then filled a few MB a frame (feed) — a 조선 tile is 10–20 MB, and putting it
  // up whole in one frame (twice: the map's canvas and the trains') stalled zooming out (2026-10-10)
  upload(gl, e) {
    const t0 = performance.now(), m = e.mesh, vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, m.verts.byteLength, gl.STATIC_DRAW);
    const A = (i, n, type, norm, off) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, type, norm, STRIDE, off) };
    A(0, 2, gl.FLOAT, false, 0); A(1, 1, gl.FLOAT, false, 8); A(2, 4, gl.BYTE, true, 12); A(3, 1, gl.FLOAT, false, 16); A(4, 4, gl.UNSIGNED_BYTE, false, 20); A(5, 4, gl.UNSIGNED_BYTE, false, 24); A(6, 4, gl.UNSIGNED_BYTE, false, 28);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx.byteLength, gl.STATIC_DRAW);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    const g = { vao, vbo, ibo, vOff: 0, iOff: 0, done: false }; e.gpu.set(gl, g);
    g.inst = {};   // 조선 인스턴스: the template's points + the tile's records (their pointers moved to each run's first record when drawn)
    for (const kind of Object.keys(INST)) {
      const buf = m.inst?.[kind]; if (!buf || !buf.byteLength) continue;
      const C = this.context(gl), tpl = this.template(gl, C, kind), vao = gl.createVertexArray(), vbo = gl.createBuffer();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, tpl.vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      for (const [loc] of INST[kind].attrs) { gl.enableVertexAttribArray(loc); gl.vertexAttribDivisor(loc, 1) }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tpl.ibo);
      gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      g.inst[kind] = { vao, vbo, tpl };
    }
    if (m.models?.data.byteLength) g.models = this.uploadModels(gl, this.context(gl), m.models); this.stats.uploadMs = (this.stats.uploadMs || 0) + performance.now() - t0; this.stats.uploads = (this.stats.uploads || 0) + 1; return g;
  }
  // fill the buffers on: at most `budget` bytes; the bytes put up
  feed(gl, g, m, budget) {
    const t0 = performance.now(); let used = 0;
    if (g.vOff < m.verts.byteLength) {
      const n = Math.min(budget, m.verts.byteLength - g.vOff);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo); gl.bufferSubData(gl.ARRAY_BUFFER, g.vOff, m.verts, g.vOff, n); gl.bindBuffer(gl.ARRAY_BUFFER, null);
      g.vOff += n; used += n;
    }
    if (used < budget && g.vOff >= m.verts.byteLength && g.iOff < m.idx.length) {
      const n = Math.min(Math.max(1, (budget - used) >> 2), m.idx.length - g.iOff);
      gl.bindVertexArray(null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo); gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, g.iOff * 4, m.idx, g.iOff, n); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      g.iOff += n; used += n * 4;
    }
    g.done = g.vOff >= m.verts.byteLength && g.iOff >= m.idx.length;
    const st = this.stats, dt = performance.now() - t0; st.uploadMs = (st.uploadMs || 0) + dt; st.feedMaxMs = Math.max(st.feedMaxMs || 0, dt);
    return used;
  }
  free(gl, e) { const g = e.gpu.get(gl); if (!g) return; gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vbo); gl.deleteBuffer(g.ibo); if (g.models) { gl.deleteVertexArray(g.models.vao); gl.deleteBuffer(g.models.vbo) } for (const I of Object.values(g.inst || {})) { gl.deleteVertexArray(I.vao); gl.deleteBuffer(I.vbo) } e.gpu.delete(gl) }
  // ── the look: the pack's colours for this theme and mode, linear, as uniform tables ──
  // 간판 글자 그림: 처음 쓸 때 한 번 만들고(메인 스레드 캔버스), GL 마다 R8 텍스처 한 장(밉맵 — 멀어도 반짝이지 않게)을 칸 14 에 묶는다.
  // 지금 칸(ACTIVE_TEXTURE) · 풀기 설정은 되돌린다(MapLibre 가 기억한 상태와 어긋나지 않게). 캔버스가 없으면 예전 획 무늬
  signText(gl, u) {
    if (this.signAtlas === undefined) this.signAtlas = buildSignAtlas();
    const A = this.signAtlas, unit = 14; let T = (this.signTex ||= new WeakMap()).get(gl);
    if (A && !T) {
      const t = gl.createTexture(), act = gl.getParameter(gl.ACTIVE_TEXTURE), fy = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), al = gl.getParameter(gl.UNPACK_ALIGNMENT), pm = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, SIGN_ATLAS.size, SIGN_ATLAS.size, 0, gl.RED, gl.UNSIGNED_BYTE, A.data); gl.generateMipmap(gl.TEXTURE_2D);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, fy); gl.pixelStorei(gl.UNPACK_ALIGNMENT, al); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, pm); gl.activeTexture(act);
      this.signTex.set(gl, T = t);
    }
    if (T) { const act = gl.getParameter(gl.ACTIVE_TEXTURE); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, T); gl.activeTexture(act); gl.uniform1fv(u.u_signHW, A.hWidth); gl.uniform1fv(u.u_signVL, A.vLen) }
    gl.uniform1i(u.u_signText, unit); gl.uniform1f(u.u_signOn, T ? 1 : 0);
  }
  paletteFor() {
    const P = this.P, th = this.theme, mode = P.modes[this.tone] || P.modes.simcity || {}, sat = num(mode.saturation?.[th], 1), bri = num(mode.brightness?.[th], 1), lw = (P.modes.colorMath?.lumaWeights) || [.2126, .7152, .0722];
    const L = h => { const c = hexRGB(h).map(v => v ** 2.2), Y = c[0] * lw[0] + c[1] * lw[1] + c[2] * lw[2]; return c.map(v => (Y + (v - Y) * sat) * bri) };
    const pick = o => o && (o[th] || o.light);
    // material slots: wall, glass (the family's; a legacy type slot takes the type's glass, else the default), facade
    const mwall = [], mglass = [], mfac = [], mbay = [], defGlass = pick(P.glass) || '#52696C';
    for (let i = 0; i < 32; i++) {
      const m = P.materials[i]; if (!m) { mwall.push(0, 0, 0); mglass.push(0, 0, 0); mfac.push(-1, 0, 0, 0); mbay.push(0); continue }
      mbay.push(m.bayEff || 0);
      mwall.push(...L(pick(m.wall) || '#999999'));
      let g = pick(m.glass); if (!g && m.family.startsWith('type-')) { const T = P.types[P.byKey[m.family.slice(5)]]; g = T && pick(T.glass) }
      mglass.push(...L(g || defGlass)); mfac.push(m.pattern, m.winW, m.winH, m.refl);
    }
    const roofPal = []; for (let i = 0; i < 64; i++) { const r = P.roofs[i]; roofPal.push(...(r ? L(pick(r) || '#888888') : [.3, .3, .3])) }
    const ground = [], tA = [], tB = [], tC = [], tD = [], tE = [], tF = [], tG = [], litMean = [];
    const NL = th === 'dark' && this.night?.lights ? P.pack?.night?.lights : null;   // 밤 불빛 다시 맞추기(팩 night.lights): 다크 · 켰을 때만
    const litCols = P.lit.colors.map(c => c.map(v => v ** 2.2)), em = num(mode.windowEmission, 1), emK = NL ? num(NL.emissionMul, 1) : 1, gemK = NL ? num(NL.groundEmissionMul, 1) : 1;
    for (const T of P.types) {
      const gc = pick(T.groundColor); ground.push(...(gc ? L(gc) : [0, 0, 0]), gc ? 1 : 0);
      tA.push(T.floorM, T.bayEff, T.winW, T.winH); tB.push(T.groundM, T.groundGlass, T.litRatio, T.groundLit);   // the bay as the mesh counted it (piers at least the pack's minimum)
      const pat = T.pattern; let p1 = 0, p2 = 0, p3 = 0;
      if (pat === 0) { p1 = T.baysPerGroup?.[0] ?? 2; p2 = T.baysPerGroup?.[1] ?? 4 } else if (pat === 1) { p1 = T.balconyEvery; p2 = T.balconyBright } else if (pat === 2) p1 = T.spandrelM; else if (pat === 3) { p1 = T.mullionM; p2 = T.beltEvery; p3 = T.beltM } else if (pat === 4) p1 = T.ribM ? .15 : 0;
      tC.push(pat, p1, p2, p3);
      const w = T.tempW; tD.push(w[0], w[0] + w[1], gc ? 1 : 0, 0);
      litMean.push(...[0, 1, 2].map(i => w[0] * litCols[0][i] + w[1] * litCols[1][i] + w[2] * litCols[2][i]));
      const fm = T.nightFloorMul || P.lit.floorMul; tE.push((Number.isFinite(T.nightEmission) ? T.nightEmission : P.lit.emission) * em * emK, (Number.isFinite(T.nightGroundEmission) ? T.nightGroundEmission : P.lit.groundEmission) * em * gemK, num(fm[0], .65), num(fm[1], 1.2));
      const tiers = T.tiers, tm = tiers?.multipliers || [1, 1, 1], tw = tiers?.weights || [0, 0, 0];
      tF.push(num(T.nightWin?.[0], 0), num(T.nightWin?.[1], 0), T.maxContig, tiers ? num(tw[0], 0) + num(tw[1], 0) : 0);
      tG.push(num(tm[0], 1), num(tm[1], 1), num(tm[2], 1), tiers ? num(tw[0], 0) : 0);
    }
    const house = P.types[0], shop = P.types[2], office = P.types[P.byKey.office] || P.types[3];
    const pitched = (pick(house.pitched?.colors) || ['#855B49', '#656F68', '#9D7658']).flatMap(L);
    const awning = (pick(shop.awning?.colors) || ['#9C614D', '#667C6B', '#C2AC76']).flatMap(L);
    const SG = P.signs || {}, sign = Array.from({ length: 8 }, (_, i) => L((SG.colors || ['#C8372D'])[i % (SG.colors || ['#C8372D']).length])).flat(), signInk = [L(SG.ink?.light || '#F7F5EE'), L(SG.ink?.dark || '#1E2326')].flat(), signNight = num(SG.nightEmission, .95) * (NL ? num(NL.signMul, 1) : 1);   // 간판
    const light = th === 'dark' ? P.dark : P.light, lc = hexRGB(light.color || '#ffffff').map(v => v ** 2.2), mx = Math.max(...lc), MN = NL?.moon, mc = MN ? hexRGB(MN.color || '#ffffff').map(v => v ** 2.2) : [1, 1, 1], mm = Math.max(...mc), lightCol = lc.map((v, i) => v / mx * (MN ? mc[i] / mm * num(MN.k, 1) : 1));   // (밤 불빛: 벽 · 지붕을 달빛처럼 어둡고 푸르게 — 켜진 창 · 간판이 그 위에서 빛나 보이게)
    const sideDark = th === 'dark' ? num(light.maxSideDarken, .15) : num(light.maxSideDarken, .2), roofBright = num(light.maxRoofBrighten, th === 'dark' ? .05 : .08);
    // glass by day (QA1 dayReflection): diffuse range, the sky mixed in over a height range by face strength up to a cap, the broad band's ΔL*
    const R = office.dayReflection || {}, on = R.enabled !== false, pair = (v, a, b) => Array.isArray(v) ? [num(v[0], a), num(v[1] ?? v[0], b)] : v != null && Number.isFinite(+v) ? [+v, +v] : [a, b];
    const dr = pair(R.diffuseRangeLinear, .66, 1.04), mh = pair(R.mixByHeight, .06, .2), bw = pair(R.bandWidthRatio, .2, .35), hr = pair(R.heightRangeRatio, .15, .95), fsr = pair(R.faceStrengthRange, .65, 1), bd = pair(R.bandDeltaLStar, 4, 7);
    const refl = [dr[0], dr[1], mh[0], mh[1]], reflB = [on ? num(R.maxMix, .24) : 0, bw[0], bw[1], 0], reflH = [hr[0], hr[1], fsr[0], fsr[1]], reflD = on ? [bd[0], bd[1], 0, 0] : [0, 0, 0, 0];
    const sky = [...L(R.skyHorizon || '#EEF3F1'), ...L(R.skyZenith || '#C5E4F7')];
    // the office's articulation (QA1): where it starts, the top zone, belt rhythms and thicknesses, corner widths, the ΔL* of corners and crown
    const AR = office.articulation, be = AR?.beltEveryFloors, beArr = (Array.isArray(be) ? be : be != null ? [be] : [6, 8, 10]).map(v => num(v, 6)), tz = pair(AR?.topZoneHeightRatio, .06, .1);
    const art = AR ? [num(AR.minHeightM, 60), num(AR.minDetailZoom, 16.5), 0, 0] : [0, 99, 0, 0];   // (maxAccentFacadeAreaRatio is applied by the mesh: the corner width share a building)
    const artTop = [tz[0], tz[1], num(AR?.maxTopZoneHeightM, 4.5)], artBelt = [beArr[0], beArr[1] ?? beArr[0], beArr[2] ?? beArr[beArr.length - 1], Math.min(3, beArr.length)];
    const bh = pair(AR?.beltHeightM, .35, .55), cw = pair(AR?.cornerWidthM, .35, .65), cd = pair(AR?.cornerDeltaLStar, 5, 9), kd = pair(AR?.crownDeltaLStar, 8, 14);
    const artDim = [bh[0], bh[1], cw[0], cw[1]], artDL = [cd[0], cd[1], kd[0], kd[1]];
    // buildings the viaduct passes through: the rail-height code, the band, its glass / posts / lit hall (linear), the mixes and the night brightness
    const TH = P.through, thGlass = L(pick(TH.glass) || '#A9CBD8'), thFrame = L(pick(TH.frame) || '#55626A'), thInside = L(typeof TH.inside === 'string' ? TH.inside : pick(TH.inside) || '#F3ECDA');
    const through = [RAIL_Q.base, RAIL_Q.step, 0, TH.depthOpen ? 1 : 0], thBand = [TH.below, TH.above, TH.mull, TH.mullEvery], thMix = [TH.skyMix, TH.insideMix, TH.nightEmission];   // (night: × the type's lit-window emission, which already carries the mode's windowEmission)
    // 조선 모드 (pack.hanok): the house's materials, the 기와, the platform and posts, the lit paper
    const HK = P.hanok, hc = HK ? (HK.colors?.[th] || HK.colors?.light) : null;
    const hk = (hc ? [hc.wood, hc.plaster, hc.paper, hc.stone, hc.dam, hc.soffit, HK.night?.paper || '#FFC774', hc.ridge] : new Array(8).fill('#888888')).flatMap(L);
    const giwa = [0, 1, 2].flatMap(i => L(hc ? hc.giwa[i % hc.giwa.length] : '#555555')).concat(L(hc?.spire || '#C99B3A'));
    const hk2 = (hc ? [...[0, 1, 2].map(i => (hc.thatch || ['#C3A05E'])[i % (hc.thatch || [1]).length]), hc.mud || '#C4AA83', ...[0, 1].map(i => (hc.field || ['#9C978B'])[i % (hc.field || [1]).length]), hc.glass || '#718887'] : new Array(7).fill('#888888')).flatMap(L);
    const KG = HK?.tall?.skirtGroup || {}, hkG = [num(KG.widthM, 8), num(KG.gapM, 2.2), num(KG.cornerK, .2), num(KG.cornerM?.[0], 3.5), num(KG.cornerM?.[1], 6.5), num(KG.minM, 4.5), 0, 0];
    const hkP = HK ? [num(HK.baseM, .55), num(HK.postM, .24), num(HK.paperShare, .55), num(HK.night?.litShare, .6)] : [0, 0, 0, 0], hkE = [HK ? num(HK.night?.emission, .85) : 0, 0];
    const ST = NL?.street, upC = ST ? hexRGB(ST.color || '#FF9F52').map(v => v ** 2.2 * num(ST.strength, 0)) : [0, 0, 0];
    const nightUp = [...upC, ST ? num(ST.heightM, 6) : 1], nightK = NL ? [num(NL.litRatioMul, 1), num(NL.litRatioMax, 1), num(NL.groundLitMul, 1), num(NL.groundLitMax, 1)] : [1, 1e3, 1, 1e3];
    const nightF = NL ? [num(NL.farGlow, 0), num(MN?.roofK, 1)] : [0, 1];
    return { nightUp, nightK, nightF, hk, hk2, hkG, giwa, hkP, hkE, through, thBand, thGlass, thFrame, thInside, thMix, mwall, mglass, mfac, mbay, roofPal, ground, tA, tB, tC, tD, tE, tF, tG, litMean, pitched, awning, sign, signInk, signNight, equip: L(pick(P.equip.colors)), lit: litCols.flat(), lightCol, shade: [sideDark, roofBright, th === 'dark' ? 1 : 0, 0], ao: [num(P.ao.opacity, .1), num(P.ao.widthM, .5)], refl, reflB, reflH, reflD, sky, art, artTop, artBelt, artDim, artDL, lodPx: P.lodPx };
  }
  sunDir() {
    let az, el; try { const s = sunPosition(window.__sunTime || new Date()); az = s.azimuth; el = s.elevation } catch { el = -1 }
    if (!(el > 3) || this.theme === 'dark') { az = num(this.P.refSun.azimuthDeg, 225); el = num(this.P.refSun.elevationDeg, 42) }
    const a = az * RAD, e = el * RAD; return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];   // toward the sun; mercator y points south
  }
  // ── drawing ──
  render(gl, options) {
    this.frame++; this.now = performance.now();
    if (!this.shown()) { this.visible = []; return }
    this.collect();
    this.draw(gl, options.defaultProjectionData.mainMatrix, false);
  }
  // the walls' depth into the train canvas (its own GL context); true when anything was drawn
  drawDepth(gl, M) {
    if (!this.shown() || !this.visible.length) { this.xr = null; return false }
    this.xrayFrame(gl, M);   // this frame's x-ray boxes (심시티): the depth pass leaves them open, drawGlass tints them after
    return this.draw(gl, M, true);
  }
  // ── x-ray (심시티): buildings between the camera and a station platform or a running train turn to glass there ──
  // targets: [{id, ax, ay, bx, by, z0, z1, w, m}] in mercator units (a segment, its bottom/top height, half width; m = one metre),
  // from the runtime each frame (null: off). Cut into pieces, projected to screen boxes with their farthest depth, nearest the
  // view centre first, each fading in over the pack's fadeMs when it first shows
  setXray(targets) { this.xrayIn = targets && targets.length ? targets : null }
  xrayFrame(gl, M) {
    const X = this.P.xray; this.xr = null; if (!this.xrayIn || !X) { this.xrSeen?.clear(); return }
    const now = performance.now(), seen = this.xrSeen || (this.xrSeen = new Map()), cand = [], live = new Set(), c = [0, 0, 0, 0];
    const proj = (x, y, z) => { c[3] = M[3] * x + M[7] * y + M[11] * z + M[15]; c[0] = M[0] * x + M[4] * y + M[8] * z + M[12]; c[1] = M[1] * x + M[5] * y + M[9] * z + M[13]; c[2] = M[2] * x + M[6] * y + M[10] * z + M[14] };
    for (const t of this.xrayIn) {
      const dx = t.bx - t.ax, dy = t.by - t.ay, L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L / (X.pieceM * t.m))), ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0, px = -uy * t.w, py = ux * t.w;
      for (let k = 0; k < n; k++) {
        const s0 = L * k / n, s1 = L * (k + 1) / n; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zf = -Infinity, behind = false;
        for (let q = 0; q < 8; q++) {
          const s = q & 1 ? s1 : s0, sd = q & 2 ? 1 : -1; proj(t.ax + ux * s + px * sd, t.ay + uy * s + py * sd, q & 4 ? t.z1 : t.z0);
          if (c[3] <= 1e-9) { behind = true; break }
          const nx = c[0] / c[3], ny = c[1] / c[3], nz = c[2] / c[3]; if (nx < x0) x0 = nx; if (nx > x1) x1 = nx; if (ny < y0) y0 = ny; if (ny > y1) y1 = ny; if (nz > zf) zf = nz;
        }
        if (behind || x1 < -1.05 || x0 > 1.05 || y1 < -1.05 || y0 > 1.05 || zf > 1) continue;
        const id = t.id + '#' + k; live.add(id); if (!seen.has(id)) seen.set(id, now);
        cand.push({ id, r: [x0, y0, x1, y1], d: Math.min(1, zf * .5 + .5), c: Math.hypot((x0 + x1) / 2, (y0 + y1) / 2) });
      }
    }
    for (const id of seen.keys()) if (!live.has(id)) seen.delete(id);   // gone (off screen, or out of the list): in again with a fresh fade
    if (!cand.length) return;
    cand.sort((a, b) => a.c - b.c); const n = Math.min(cand.length, X.maxTargets, XR_N), R = new Float32Array(XR_N * 4), D = new Float32Array(XR_N * 2); let fading = false;
    const U = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) { const t = cand[i], w = Math.min(1, (now - seen.get(t.id)) / Math.max(1, X.fadeMs)); if (w < 1) fading = true; R.set(t.r, i * 4); D[i * 2] = t.d; D[i * 2 + 1] = w * w * (3 - 2 * w); U[0] = Math.min(U[0], t.r[0]); U[1] = Math.min(U[1], t.r[1]); U[2] = Math.max(U[2], t.r[2]); U[3] = Math.max(U[3], t.r[3]) }
    const fe = X.featherPx * 2 / Math.max(1, Math.min(gl.drawingBufferWidth, gl.drawingBufferHeight)); U[0] -= fe; U[1] -= fe; U[2] += fe; U[3] += fe;
    this.xr = { R, D, n, U, fading };
    if (fading) this.map?.triggerRepaint();   // the fade runs on the map's frames (the train canvas follows them)
  }
  xrayUniforms(gl, u, glass) {
    const xr = this.xr, X = this.P.xray;
    if (!xr) { gl.uniform1i(u.u_xn, 0); gl.uniform4f(u.u_xv, 1, 1, 1, 0); return }
    gl.uniform4fv(u.u_xr, xr.R); gl.uniform2fv(u.u_xd, xr.D); gl.uniform1i(u.u_xn, xr.n);
    gl.uniform4f(u.u_xv, gl.drawingBufferWidth, gl.drawingBufferHeight, X.featherPx * (gl.drawingBufferWidth / Math.max(1, gl.canvas.clientWidth || gl.drawingBufferWidth)), glass ? 1 : 0);
    if (glass) gl.uniform4f(u.u_xa, X.alpha, X.edgeAlpha, X.edgePx * (gl.drawingBufferWidth / Math.max(1, gl.canvas.clientWidth || gl.drawingBufferWidth)), 0);
  }
  // after the train canvas has drawn the decks and trains: the hiding buildings again, at the pack's opacity, over them
  drawGlass(gl, M) {
    if (!this.xr || !this.shown() || !this.visible.length) return false;
    return this.draw(gl, M, false, true);
  }
  // the uniforms both programs read (the buildings' and the 처마 instances'): the palette, light, x-ray, detail by zoom
  uniforms(gl, u, depthOnly, glass, zoom) {
    const K = this.palette || (this.palette = this.paletteFor()), sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
    gl.uniform4fv(u.u_through, K.through); gl.uniform4fv(u.u_thBand, K.thBand);   // both passes: the depth pass leaves the band open
    if (!depthOnly) {
      gl.uniform3fv(u.u_thGlass, K.thGlass); gl.uniform3fv(u.u_thFrame, K.thFrame); gl.uniform3fv(u.u_thInside, K.thInside); gl.uniform3fv(u.u_thMix, K.thMix);
      gl.uniform4fv(u.u_tA, K.tA); gl.uniform4fv(u.u_tB, K.tB); gl.uniform4fv(u.u_tC, K.tC); gl.uniform4fv(u.u_tD, K.tD); gl.uniform4fv(u.u_tE, K.tE); gl.uniform4fv(u.u_tF, K.tF); gl.uniform4fv(u.u_tG, K.tG);
      gl.uniform3fv(u.u_mwall, K.mwall); gl.uniform3fv(u.u_mglass, K.mglass); gl.uniform4fv(u.u_mfac, K.mfac); gl.uniform1fv(u.u_mbay, K.mbay); gl.uniform3fv(u.u_roofPal, K.roofPal);
      gl.uniform3fv(u.u_hk, K.hk); gl.uniform3fv(u.u_hk2, K.hk2); gl.uniform3fv(u.u_giwa, K.giwa); gl.uniform4fv(u.u_hkP, K.hkP); gl.uniform2fv(u.u_hkE, K.hkE); gl.uniform4fv(u.u_hkG, K.hkG);
      this.signText(gl, u);
      gl.uniform4fv(u.u_ground, K.ground); gl.uniform3fv(u.u_pitched, K.pitched); gl.uniform3fv(u.u_awning, K.awning); gl.uniform3fv(u.u_sign, K.sign); gl.uniform3fv(u.u_signInk, K.signInk); gl.uniform1f(u.u_signNight, K.signNight); gl.uniform3fv(u.u_equip, K.equip); gl.uniform3fv(u.u_lit, K.lit); gl.uniform3fv(u.u_litMean, K.litMean);
      gl.uniform3fv(u.u_sun, this.sunDir()); gl.uniform3fv(u.u_lightCol, K.lightCol); gl.uniform4fv(u.u_shade, K.shade); gl.uniform4fv(u.u_nightUp, K.nightUp); gl.uniform4fv(u.u_nightK, K.nightK); gl.uniform2fv(u.u_nightF, K.nightF); gl.uniform2fv(u.u_ao, K.ao);
      gl.uniform4fv(u.u_refl, K.refl); gl.uniform4fv(u.u_reflB, K.reflB); gl.uniform4fv(u.u_reflH, K.reflH); gl.uniform4fv(u.u_reflD, K.reflD); gl.uniform3fv(u.u_sky, K.sky); gl.uniform4f(u.u_art, K.art[0], K.art[1], zoom, K.art[3]); gl.uniform3fv(u.u_artTop, K.artTop); gl.uniform4fv(u.u_artBelt, K.artBelt); gl.uniform4fv(u.u_artDim, K.artDim); gl.uniform4fv(u.u_artDL, K.artDL); gl.uniform2fv(u.u_lodPx, K.lodPx);
    }
    const lodE = this.P.lod.equipment;
    gl.uniform2f(u.u_detail, sm(lodE[0], lodE[1], zoom), sm(lodE[1], lodE[1] + .5, zoom)); gl.uniform1f(u.u_maxH, this.maxHeight); gl.uniform1f(u.u_S, S);
    if (!depthOnly) gl.uniform1f(u.u_debug, this.debug);
    this.xrayUniforms(gl, u, glass);   // x-ray boxes: the depth pass and the glass pass on the train canvas; none in the map's own pass (it has no boxes then)
  }
  draw(gl, M, depthOnly, glass = false) {
    const t0 = performance.now(), map = this.map, C = this.context(gl), prog = depthOnly ? C.depth : C.color, u = prog.u, zoom = map.getZoom(), now = this.now || performance.now();
    gl.useProgram(prog.p);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); if (this.cull === 'none') gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(this.cull === 'ccw' ? gl.CCW : gl.CW) } gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    if (depthOnly) gl.colorMask(false, false, false, false); else gl.colorMask(true, true, true, true);
    this.uniforms(gl, u, depthOnly, glass, zoom);
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
    if (glass) { gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA) }   // premultiplied, and only where the train canvas drew something behind (a deck, a platform, a train): elsewhere the map's own opaque building and the labels over it stay as they are
    const hi = zoom >= this.lodHi, zoomGrow = sm(this.phone ? 14.5 : 14, (this.phone ? 14.5 : 14) + .6, zoom);   // the city rises over the first 0.6 zoom, as the map's boxes did
    const M64 = this.M64, M32 = this.M32, skirts = [], models = []; let growing = false, drawn = false, draws = 0;
    const far = this.phone ? this.farLimit(zoom) : null, cc = map.getCenter(), cmx = cc.lng / 360 + .5, cmy = .5 - Math.log(Math.tan(Math.PI / 4 + cc.lat * RAD / 2)) / (2 * Math.PI);
    let budget = this.phone ? 1.5e6 : 3e6;   // bytes put up to the GPU this pass; the rest next frame (growing: a repaint follows)
    for (const e of this.visible) {
      let g = e.gpu.get(gl);
      if (!g || !g.done) {
        if (budget <= 0) { growing = true; continue }
        if (!e.mesh.verts) { this.tiles.delete(e.key); for (const g2 of this.ctx.keys()) this.free(g2, e); this.schedule(); continue }   // its bytes already let go (phones): built again
        if (!g) g = this.upload(gl, e);
        budget -= this.feed(gl, g, e.mesh, budget);
        if (!g.done) { growing = true; continue }
        // phones: once both canvases (the map's and the trains') hold it, the JS copy is let go — a third copy of the city
        if (this.phone && e.gpu.size >= 2 && [...e.gpu.values()].every(x => x.done)) { e.mesh.verts = null; e.mesh.idx = null; e.mesh.inst = null; e.mesh.models = e.mesh.models && { groups: e.mesh.models.groups, data: { byteLength: e.mesh.models.data.byteLength } } }
      }
      const m = e.mesh;
      const t = Math.min(1, (now - e.readyAt) / GROW_MS), grow = zoomGrow * (t < 1 ? (growing = true, t * t * (3 - 2 * t)) : 1);
      if (grow <= 0) continue;
      const tox = cmx - m.ox, toy = cmy - m.oy;   // the view centre in the tile's frame
      for (let i = 0; i < 16; i++) M64[i] = M[i];
      for (let r = 0; r < 4; r++) M64[12 + r] = M[r] * m.ox + M[4 + r] * m.oy + M[12 + r];   // M · translate(tile origin), in double
      M32.set(M64);
      gl.uniformMatrix4fv(u.u_matrix, false, M32); gl.uniform1f(u.u_mpu, m.mpu); gl.uniform2f(u.u_wo, m.wox, m.woy); gl.uniform1f(u.u_grow, grow);
      gl.bindVertexArray(g.vao);
      const sk = Object.keys(g.inst || {}).length ? { g, m, M: Float32Array.from(M32), chunks: [] } : null;   // 조선 instances: drawn after, by their own programs
      for (const c of m.chunks) {
        if (!this.noCull && !this.inView(M64, c, m.mpu * grow)) continue;
        if (glass && !this.hitsBox(M64, c, m.mpu * grow, this.xr.U)) continue;   // the glass pass: only chunks under an x-ray box
        const a = hi ? c.iLo : c.i0, b = hi ? c.i1 : c.iW, nk = sk ? Object.values(c.k).some(([k0, kF, k1]) => (hi ? k1 : kF) > k0) : false; if (b <= a && !nk) continue;
        let f = 1;
        if (far) {   // phones: beyond the far limit the chunk sinks into the ground, then is skipped
          const d = (Math.hypot((c.x0 + c.x1) / 2 - tox, (c.y0 + c.y1) / 2 - toy) - Math.hypot(c.x1 - c.x0, c.y1 - c.y0) / 2) / m.mpu; f = 1 - sm(far[0], far[1], d);
          if (f <= 0) continue; gl.uniform1f(u.u_grow, grow * f);
        }
        if (nk) sk.chunks.push(c, grow * f);
        if (b > a) { if (!this.skipDraw) gl.drawElements(gl.TRIANGLES, b - a, gl.UNSIGNED_INT, a * 4); drawn = true; draws++ }
      }
      if (sk && sk.chunks.length) skirts.push(sk);
      if (g.models && !glass) models.push({ g: g.models, m, M: Float32Array.from(M32), grow });   // 스타크래프트 모형: 타일째(칸 가리기 없이)
    }
    if (skirts.length) draws += this.drawInst(gl, C, depthOnly, glass, zoom, hi, skirts), drawn = true;
    if (models.length) draws += this.drawModels(gl, C, depthOnly, glass, zoom, models), drawn = true;
    gl.bindVertexArray(null); gl.colorMask(true, true, true, true); gl.disable(gl.CULL_FACE); gl.frontFace(gl.CCW); if (depthOnly) gl.depthFunc(gl.LESS);   // the train canvas's renderers expect culling off (as BuildingDepth left it)
    if (glass) { gl.disable(gl.BLEND); gl.depthMask(true); this.stats.glassDraws = draws; return drawn }
    this.growing = growing; if (growing && !depthOnly) map.triggerRepaint();
    const st = this.stats; st[depthOnly ? 'depthMs' : 'renderMs'] = (st[depthOnly ? 'depthMs' : 'renderMs'] || 0) + performance.now() - t0; st[depthOnly ? 'depthFrames' : 'frames'] = (st[depthOnly ? 'depthFrames' : 'frames'] || 0) + 1; st.draws = draws;
    return drawn;
  }
  // 스타크래프트 모형 템플릿(이 문맥에 한 번 — 종족이 바뀌면 다시): 꼭짓점 8 float · Uint32 색인
  modelTemplate(gl, C) {
    const T = cityPart('race').templates(this.phone ? { ...this.P.race, lod: 'low' } : this.P.race);   // 휴대폰: 낮은 디테일 템플릿(같은 번호)
    if (C.model?.key === T.key) return C.model;
    if (C.model) { gl.deleteBuffer(C.model.vbo); gl.deleteBuffer(C.model.ibo) }
    // 끝에 가림 상자 하나(깊이 패스 — 열차 층의 가림에만 쓰여 보이지 않는다): 칸 ±1, 높이 0..1(그리기 때 u_ztop 으로 그 템플릿 꼭대기까지). 옆 넷 + 윗면 10 삼각형
    const nb = T.verts.length / 8, bv = [], bi = [], P4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const z of [0, 1]) for (const [x, y] of P4) bv.push(x, y, z, 0, 0, 1, 0, 16);
    for (let k = 0; k < 4; k++) { const a = k, b = (k + 1) % 4; bi.push(a, b, b + 4, a, b + 4, a + 4) }
    bi.push(4, 5, 6, 4, 6, 7);
    const verts = new Float32Array(T.verts.length + bv.length), idx = new Uint32Array(T.idx.length + bi.length);
    verts.set(T.verts); verts.set(bv, T.verts.length); idx.set(T.idx); idx.set(bi.map(i => i + nb), T.idx.length);
    const vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return (C.model = { key: T.key, vbo, ibo, ranges: T.ranges, tops: T.tops, box: [T.idx.length, bi.length], bytes: verts.byteLength + idx.byteLength });
  }
  // 한 타일의 모형 기록: 템플릿 점(0~3) + 기록(4~7, 한 기록에 한 번)
  uploadModels(gl, C, mm) {
    const tpl = this.modelTemplate(gl, C), vao = gl.createVertexArray(), vbo = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, tpl.vbo);
    for (const [loc, n, off] of [[0, 3, 0], [1, 3, 12], [2, 1, 24], [3, 1, 28]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 32, off) }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, mm.data, gl.STATIC_DRAW);
    for (const loc of [4, 5, 6, 7]) { gl.enableVertexAttribArray(loc); gl.vertexAttribDivisor(loc, 1) }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tpl.ibo);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return { vao, vbo, tpl, groups: mm.groups };
  }
  // 스타크래프트 모형: 타일마다 템플릿 하나에 그 기록들을 한 번에(같은 FS · 깊이 FS). 유리(x-ray) 칸에는 안 그린다
  drawModels(gl, C, depthOnly, glass, zoom, list) {
    const prog = depthOnly ? (C.modelDepth ||= compile(gl, VS_MODEL, FS_DEPTH)) : (C.modelColor ||= compile(gl, VS_MODEL, FS)), u = prog.u;
    const cull = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
    gl.useProgram(prog.p); this.uniforms(gl, u, depthOnly, glass, zoom); gl.uniform1f(u.u_S, S); gl.uniform1f(u.u_ztop, 0);
    // 깊이 패스(열차 층의 가림)는 자세한 모양 대신 칸을 감싸는 상자로(2026-10-23 덕배: 발열 · 배터리 — 휴대폰 스타는 1초 30번 약 70만 삼각형이던 것). 색 그리기는 그대로
    const boxDepth = depthOnly && !!list[0]?.g.tpl.box;
    let draws = 0;
    for (const { g, m, M, grow } of list) {
      gl.uniformMatrix4fv(u.u_matrix, false, M); gl.uniform1f(u.u_mpu, m.mpu); gl.uniform2f(u.u_wo, m.wox, m.woy); gl.uniform1f(u.u_grow, grow);
      gl.bindVertexArray(g.vao); gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
      for (const [t, first, count] of g.groups) {
        const r = g.tpl.ranges[t]; if (!r || !r[1]) continue; const o = first * MODEL_STRIDE;
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, MODEL_STRIDE, o); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, MODEL_STRIDE, o + 16);
        gl.vertexAttribPointer(6, 4, gl.UNSIGNED_BYTE, false, MODEL_STRIDE, o + 32); gl.vertexAttribPointer(7, 4, gl.UNSIGNED_BYTE, false, MODEL_STRIDE, o + 36);
        if (boxDepth) { gl.uniform1f(u.u_ztop, Math.max(.01, g.tpl.tops[t] || 1)); if (!this.skipDraw) gl.drawElementsInstanced(gl.TRIANGLES, g.tpl.box[1], gl.UNSIGNED_INT, g.tpl.box[0] * 4, count); draws++; continue }
        if (!this.skipDraw) gl.drawElementsInstanced(gl.TRIANGLES, r[1], gl.UNSIGNED_INT, r[0] * 4, count); draws++;
      }
    }
    gl.uniform1f(u.u_ztop, 0); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindVertexArray(null); if (cull) gl.enable(gl.CULL_FACE);
    const P = depthOnly ? C.depth : C.color; gl.useProgram(P.p);
    this.stats.modelDraws = draws;
    return draws;
  }
  // 조선 instances (처마 조각 · 지붕 · 벽 상자): each kind's template drawn once per record of the visible chunks — far its far
  // records and far range, near all of them (phones: the 처마 without its edge); neighbouring chunks' runs drawn as one.
  // Both sides drawn: a roof is an open surface
  drawInst(gl, C, depthOnly, glass, zoom, hi, list) {
    const H = this.P.hanok || {}, T = H.tall || {}, G = T.skirtGroup || {}, R = H.ridge || {};
    const cull = gl.isEnabled(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
    let draws = 0;
    for (const [kind, I] of Object.entries(INST)) {
      if (!list.some(t => t.g.inst[kind])) continue;
      const C2 = C.inst[kind] || (C.inst[kind] = {}), prog = depthOnly ? (C2.depth ||= compile(gl, I.vs, FS_DEPTH)) : (C2.color ||= compile(gl, I.vs, FS)), u = prog.u, stride = INST_STRIDES[kind];   // (each compiled when first drawn: the big FS takes long to compile on some GPUs)
      let used = false;
      for (const { g, m, M, chunks } of list) {
        const gi = g.inst[kind]; if (!gi) continue;
        if (!used) {
          used = true; gl.useProgram(prog.p); this.uniforms(gl, u, depthOnly, glass, zoom); gl.uniform1f(u.u_S, S);
          gl.uniform4f(u.u_sk, num(T.skirtRiseM, 1), num(G.upK, .15), num(T.skirtEdgeM, .12), 0);
          gl.uniform4f(u.u_rf, .5, num(H.gableEndM, .6), num(H.thatch?.edgeM, .32), num(H.detail?.fasciaM, .16)); gl.uniform4f(u.u_rd, num(R.halfWidthM, .11), num(R.upM, .18), num(R.downM, .08), num(H.detail?.hipRidgeM, .14)); gl.uniform1f(u.u_bay, num(H.bayM, 2.4));
          gl.uniform4f(u.u_base, num(H.baseM, .55), num(H.thatch?.baseM, .3), num(H.detail?.platformOutM, .45), num(H.detail?.stepWidthM, 1.8));
          const D = H.detail || {}; gl.uniform4f(u.u_post, num(D.postM, .22), num(D.postOutM, .1), num(D.bracketM, .14), num(D.bracketOutM, .32));
        }
        const tpl = gi.tpl, [i0, n] = !hi ? tpl.far : zoom >= DETAIL_Z ? tpl.detail : this.phone ? tpl.nearPhone : tpl.near;
        gl.uniformMatrix4fv(u.u_matrix, false, M); gl.uniform1f(u.u_mpu, m.mpu); gl.uniform2f(u.u_wo, m.wox, m.woy);
        gl.bindVertexArray(gi.vao); gl.bindBuffer(gl.ARRAY_BUFFER, gi.vbo);
        let run = null;
        const flush = () => {
          if (!run || run.b <= run.a) return;
          gl.uniform1f(u.u_grow, run.grow); const o = run.a * stride;
          for (const [loc, size, type, off] of I.attrs) gl.vertexAttribPointer(loc, size, type ? gl.UNSIGNED_BYTE : gl.FLOAT, false, stride, o + off);
          if (!this.skipDraw) gl.drawElementsInstanced(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, i0 * 2, run.b - run.a); draws++;
        };
        for (let k = 0; k < chunks.length; k += 2) {
          const [k0, kF, k1] = chunks[k].k[kind], a = k0, b = hi ? k1 : kF, grow = chunks[k + 1]; if (b <= a) continue;
          if (run && run.b === a && run.grow === grow) { run.b = b; continue }   // (from afar a run joins only where no near-only records lie between: b === a)
          flush(); run = { a, b, grow };
        }
        flush();
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindVertexArray(null); if (cull) gl.enable(gl.CULL_FACE);
    const P = depthOnly ? C.depth : C.color; gl.useProgram(P.p);
    return draws;
  }
  // the chunk's screen box against a box in NDC (x0,y0,x1,y1): false only when every corner is in front of the camera and the boxes miss
  hitsBox(M, c, zs, U) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? c.x1 : c.x0, y = i & 2 ? c.y1 : c.y0, z = i & 4 ? c.zmax * zs : 0, w = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (w <= 1e-9) return true;
      const nx = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w, ny = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w;
      if (nx < x0) x0 = nx; if (nx > x1) x1 = nx; if (ny < y0) y0 = ny; if (ny > y1) y1 = ny;
    }
    return !(x1 < U[0] || x0 > U[2] || y1 < U[1] || y0 > U[3]);
  }
  // the chunk's box against the clip volume: out when all eight corners lie beyond one plane; a box with a
  // corner behind the camera is kept (its plane tests mean nothing there)
  inView(M, c, zs) {
    let out = 31, behind = 0;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? c.x1 : c.x0, y = i & 2 ? c.y1 : c.y0, z = i & 4 ? c.zmax * zs : 0;
      const w = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (w <= 0) { behind++; continue }
      const cx = M[0] * x + M[4] * y + M[8] * z + M[12], cy = M[1] * x + M[5] * y + M[9] * z + M[13], cz = M[2] * x + M[6] * y + M[10] * z + M[14];
      let o = 0; if (cx < -w) o |= 1; if (cx > w) o |= 2; if (cy < -w) o |= 4; if (cy > w) o |= 8; if (cz > w) o |= 16;
      out &= o;
    }
    return behind === 8 ? false : behind > 0 ? true : out === 0;
  }
  // for the report / tests
  info() { const t = [...this.tiles.values()]; return { workers: this.workers ? this.workers.length : null, through: this.through.size, tiles: t.length, ready: t.filter(e => e.state === 'ready').length, visible: this.visible.length, buildings: t.reduce((s, e) => s + (e.mesh?.count || 0), 0), bytes: t.reduce((s, e) => s + (e.bytes || 0), 0), ...this.stats } }
}
