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
// from the style pack (web/lib/city_style_seoul.mjs, opts.stylePack): nothing Seoul-specific is coded
// here. The building type is estimated by one replaceable function, classifyBuilding (height, area,
// landuse); pass opts.classify to override it when real use data arrives.
//
//   const city=new CityBuildings({phone});  map.addLayer(city,'station-names');
//   city.set({on:true,mode:'simcity'|'coaster',theme:'light'|'dark',maxHeight:150});
//   city.drawDepth(trainGl,matrix) → true when walls were drawn (trains then depth-test against them)

import { TileBuilder, resolvePack, classifyBuilding, STRIDE, LOD_HI, GROW_MS, RAIL_Q, EARTH, RAD, S, num, hexRGB } from './city_mesh.mjs';
import { SEOUL_CITY_STYLE } from './city_style_seoul.mjs';
import { sunPosition } from './sun.mjs';
import THROUGH_LIST from './city_through_buildings.mjs';   // the buildings the simcity viaduct passes through (a glass hall at the deck's level)
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
uniform vec3 u_hk[8];uniform vec3 u_hk2[6];uniform vec3 u_giwa[4];uniform vec4 u_hkP;uniform vec2 u_hkE;   // 조선 모드: wood, plaster, paper, stone, 담장, the eave's underside, lit paper, ridge; 기와 ×3; platform height, post width, 창호 share, lit share; lit paper's emission
uniform vec4 u_ground[6];uniform vec3 u_pitched[3];uniform vec3 u_awning[3];uniform vec3 u_sign[8];uniform vec3 u_signInk[2];uniform float u_signNight;uniform vec3 u_equip;uniform vec3 u_lit[3];uniform vec3 u_litMean[6];
uniform vec3 u_sun;uniform vec3 u_lightCol;uniform vec4 u_shade;uniform vec2 u_ao;uniform vec4 u_refl;uniform vec4 u_reflB;uniform vec3 u_sky[2];uniform vec4 u_art;uniform vec3 u_artTop;uniform vec4 u_artBelt;uniform vec4 u_artDim;uniform vec4 u_artDL;uniform vec4 u_reflH;uniform vec4 u_reflD;uniform vec2 u_lodPx;uniform float u_debug;
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
    col=mat*light;
  }else if(kind==3){col=u_equip*light;}
  else if(kind==4){col=u_pitched[slot]*light;}
  else if(kind==5){col=u_awning[slot]*light;}
  else if(kind==8){   // 조선: 기와 — the joints between the tile rows down the slope (v_u: along the eave, m), the ridge dark; underneath, the eave's rafters. slot 3: the 목탑's golden 상륜
    if(slot==3)col=u_giwa[3]*u_lightCol*(0.7+0.45*clamp(dot(n,u_sun),0.0,1.0));
    else if(n.z<-0.2)col=u_hk[5]*u_lightCol*(0.55+0.2*k);
    else{
      vec3 g=u_giwa[slot<3?slot:0];float p=v_u/0.3;g*=1.0-0.16*pulse(p,0.0,0.38,fwidth(p));
      if(v_z>H-0.30)g=u_hk[7];   // 용마루 (H: its top; a skirt carries none)
      else if(v_z<v_misc.y*0.05-0.03)g=mix(g,u_hk[1],0.8);   // 와구토: the white line along the eave (below the wall's top: the eave's edge, thinning up the lifted corners)
      col=g*u_lightCol*(0.62+0.5*clamp(dot(n,u_sun),0.0,1.0));
    }
  }
  else if(kind==11){   // 조선: 초가 — straw streaks down the slope (fading out where they would shimmer), the thick cut edge darker, the 용마름 at the top
    vec3 g=u_hk2[slot<3?slot:0];float sw=0.14/max(fwidth(v_u),1e-4);
    g*=mix(1.0,0.88+0.2*hash(vec3(floor(v_u/0.14),seed,3.0)),smoothstep(1.0,3.0,sw));
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
    if(n.z>0.5||(wt!=3&&v_z<u_hkP.x+0.01)){
      vec2 q=n.z>0.5?v_wm/vec2(0.9,0.45):vec2(v_u/0.9,v_z/0.28);q.x+=0.5*floor(q.y);
      float j=max(pulse(q.x,0.0,0.06,fwidth(q.x)),pulse(q.y,0.0,0.08,fwidth(q.y)));
      col=u_hk[3]*(0.92+0.1*hash(vec3(floor(q),seed)))*(1.0-0.2*j)*light;
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
      float lat=0.0;
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
      }
      // by night a few faces light one or two neighbouring bays, in the middle of the bay only (an oil lamp behind the paper, not a lit wall)
      float fh=hash(vec3(seed,face,11.0)),run=floor(fh*max(v_wall.x-1.0,1.0));
      bool lit=night&&paper&&fh<u_hkP.w&&bI>=run&&bI<=run+1.0&&fract(tx)>0.18&&fract(tx)<0.82&&zr>0.28&&zr<0.76;
      vec3 wallC=wt==1?u_hk2[3]:u_hk[1];
      vec3 pc=lit?u_hk[6]*u_hkE.x*(1.0-0.45*lat):mix(paper?u_hk[2]:wallC,u_hk[0],0.55*lat)*light;
      col=mix(pc,u_hk[0]*light,max(post,beam));
    }
  }
  else if(kind==10){   // 조선: 담장 — stone below, plaster above
    vec3 c=u_hk[4];
    if(v_z<0.8){vec2 q=vec2(v_u/0.7,v_z/0.27);q.x+=0.5*floor(q.y);float j=max(pulse(q.x,0.0,0.07,fwidth(q.x)),pulse(q.y,0.0,0.09,fwidth(q.y)));c=u_hk[3]*(0.9+0.12*hash(vec3(floor(q),seed)))*(1.0-0.22*j);}
    col=c*light;
  }
  else if(kind==7){   // 간판: 바탕색, 긴 면엔 글자 무늬(axis 1 가로 글줄 · 2 세로 글줄)와 어두운 테두리. 밤에는 스스로 빛난다
    vec3 bg=u_sign[slot&7],inkC=lum(bg)>0.3?u_signInk[1]:u_signInk[0];int ax=int(v_wall.x+0.5);
    float len=(v_wall.y+v_wall.z*256.0)*0.05,h=max(v_wall.w*0.05,0.05),z0=v_misc.y*0.2,t=v_z-z0,ink=0.0,rim=0.0;
    if(ax>0){
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
    vec3 wallC=wall*wallMul*light*ao;
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
    float pr=litRatio*mix(tE.z,tE.w,hash(vec3(seed,fIdx,3.0)));
    float isLit=hash(vec3(seed,fIdx*131.0+bIdx,7.0))<pr?1.0:0.0;
    if(isLit>0.5&&tF.z>0.0){float run=0.0;for(float j=1.0;j<=3.0;j+=1.0)run+=hash(vec3(seed,fIdx*131.0+bIdx-j,7.0))<pr?1.0:0.0;if(run>=tF.z)isLit=0.0;}
    float litPx=(ly1-ly0)*cellH/max(fwidth(v_z),1e-5),litMix=smoothstep(u_lodPx.x,u_lodPx.y,litPx);
    float litV=night?mix(min(1.0,pr),isLit,litMix):0.0;
    float h2=hash(vec3(seed,bIdx*7.0+fIdx,11.0));vec3 litC=h2<tD.x?u_lit[0]:h2<tD.y?u_lit[1]:u_lit[2];litC=mix(u_litMean[type],litC,litMix);
    float E=ground?tE.y:tE.x,h3=hash(vec3(seed,bIdx*13.0+fIdx,17.0));
    E*=tG.w>0.0?(h3<tG.w?tG.x:h3<tF.w?tG.y:tG.z):mix(0.72,1.08,h3);   // three tiers when the type has them, else each window its own
    col=mix(wallC,glassC,cov);
    col=mix(col,litC*E,covLit*litV);
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
const meshBytes = m => m.verts.byteLength + m.idx.byteLength;

// the through list (web/lib/city_through_buildings.mjs, or opts.through: [{id, lng, lat, line, railM}]) as the builders want it: osm id → its crossing points
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

// ── the layer ────────────────────────────────────────────────────────────────────────────────────
export class CityBuildings {
  constructor(opts = {}) {
    this.id = 'city-buildings'; this.type = 'custom'; this.renderingMode = '3d';
    this.opts = opts; this.phone = !!opts.phone; this.P = resolvePack(opts.stylePack || SEOUL_CITY_STYLE);
    this.on = false; this.mode = 'simcity'; this.theme = 'light'; this.maxHeight = Infinity;
    this.tiles = new Map(); this.visible = []; this.ctx = new Map(); this.frame = 0; this.now = 0; this.timer = 0; this.growing = false;
    this.maxTiles = this.phone ? 18 : 40; this.maxBytes = this.phone ? 56e6 : Infinity; this.palette = null; this.stats = { built: 0, buildMs: 0, verts: 0 };
    this.useWorker = opts.worker !== false && typeof Worker !== 'undefined' && !opts.classify; this.workers = null;   // builds run in web/lib/city_worker.mjs (a classify function cannot cross into one: main thread then)
    this.debug = 0; this.lodHi = LOD_HI; this.cull = 'cw'; this.noCull = false; this.skipDraw = false;   // dev knobs: kind colours, culling, LOD, draw calls off (JS cost alone)
    this.M64 = new Float64Array(16); this.M32 = new Float32Array(16);
    this.through = throughIndex(opts.through || THROUGH_LIST);   // osm id → the points where the viaduct crosses it (opts.through overrides the shipped list)
  }
  onAdd(map, gl) { this.map = map; this.gl = gl; this.context(gl) }
  onRemove(map, gl) { for (const [g, c] of this.ctx) { for (const t of this.tiles.values()) this.free(g, t); g.deleteProgram(c.color.p); g.deleteProgram(c.depth.p) } this.ctx.clear(); this.map = null }
  // on/off, 'simcity' | 'coaster', 'light' | 'dark', maxHeight (m; the coaster's towers are rides, not buildings)
  set(o) {
    if (o.pack && o.pack !== this.P.pack) this.setPack(o.pack);
    if (o.on != null) this.on = o.on; if (o.mode) this.mode = o.mode; if (o.theme) this.theme = o.theme; if (o.maxHeight != null) this.maxHeight = o.maxHeight;
    this.palette = null; this.map?.triggerRepaint();
  }
  // another style pack (조선 모드 ↔ 심시티): every tile built again with it; a build already in a worker comes back to no tile and is dropped
  setPack(pack) {
    this.P = resolvePack(pack); this.palette = null;
    for (const e of this.tiles.values()) for (const gl of this.ctx.keys()) this.free(gl, e);
    this.tiles.clear(); this.visible = [];
    for (const w of this.workers || []) w.postMessage({ type: 'pack', pack, through: this.through });
  }
  shown() {
    if (!this.on || !this.map) return false;
    if (this.map.getZoom() < (this.phone ? 14.5 : 14)) return false;   // phones: a little later than the desktop (the far fade keeps it light)
    return !this.map.getLayer('bm-bld') || this.map.getLayoutProperty('bm-bld', 'visibility') !== 'none';
  }
  animating() { return this.growing }
  context(gl) { let c = this.ctx.get(gl); if (!c) { c = { color: compile(gl, VS, FS), depth: compile(gl, VS, FS_DEPTH) }; this.ctx.set(gl, c) } return c }
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
        const w = new Worker(new URL('./city_worker.mjs', import.meta.url), { type: 'module' });
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
      if (m.type === 'done') { e.mesh = m.mesh; e.bytes = meshBytes(m.mesh); e.state = 'ready'; e.readyAt = performance.now(); this.stats.built++; this.stats.buildMs += e.readyAt - e.t0; this.stats.verts += m.mesh.verts.byteLength / STRIDE; this.map?.triggerRepaint() }
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
  upload(gl, e) {
    const t0 = performance.now(), m = e.mesh, vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
    const A = (i, n, type, norm, off) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, type, norm, STRIDE, off) };
    A(0, 2, gl.FLOAT, false, 0); A(1, 1, gl.FLOAT, false, 8); A(2, 4, gl.BYTE, true, 12); A(3, 1, gl.FLOAT, false, 16); A(4, 4, gl.UNSIGNED_BYTE, false, 20); A(5, 4, gl.UNSIGNED_BYTE, false, 24); A(6, 4, gl.UNSIGNED_BYTE, false, 28);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    const g = { vao, vbo, ibo }; e.gpu.set(gl, g); this.stats.uploadMs = (this.stats.uploadMs || 0) + performance.now() - t0; this.stats.uploads = (this.stats.uploads || 0) + 1; return g;
  }
  free(gl, e) { const g = e.gpu.get(gl); if (!g) return; gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vbo); gl.deleteBuffer(g.ibo); e.gpu.delete(gl) }
  // ── the look: the pack's colours for this theme and mode, linear, as uniform tables ──
  paletteFor() {
    const P = this.P, th = this.theme, mode = P.modes[this.mode] || P.modes.simcity || {}, sat = num(mode.saturation?.[th], 1), bri = num(mode.brightness?.[th], 1), lw = (P.modes.colorMath?.lumaWeights) || [.2126, .7152, .0722];
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
    const litCols = P.lit.colors.map(c => c.map(v => v ** 2.2)), em = num(mode.windowEmission, 1);
    for (const T of P.types) {
      const gc = pick(T.groundColor); ground.push(...(gc ? L(gc) : [0, 0, 0]), gc ? 1 : 0);
      tA.push(T.floorM, T.bayEff, T.winW, T.winH); tB.push(T.groundM, T.groundGlass, T.litRatio, T.groundLit);   // the bay as the mesh counted it (piers at least the pack's minimum)
      const pat = T.pattern; let p1 = 0, p2 = 0, p3 = 0;
      if (pat === 0) { p1 = T.baysPerGroup?.[0] ?? 2; p2 = T.baysPerGroup?.[1] ?? 4 } else if (pat === 1) { p1 = T.balconyEvery; p2 = T.balconyBright } else if (pat === 2) p1 = T.spandrelM; else if (pat === 3) { p1 = T.mullionM; p2 = T.beltEvery; p3 = T.beltM } else if (pat === 4) p1 = T.ribM ? .15 : 0;
      tC.push(pat, p1, p2, p3);
      const w = T.tempW; tD.push(w[0], w[0] + w[1], gc ? 1 : 0, 0);
      litMean.push(...[0, 1, 2].map(i => w[0] * litCols[0][i] + w[1] * litCols[1][i] + w[2] * litCols[2][i]));
      const fm = T.nightFloorMul || P.lit.floorMul; tE.push((Number.isFinite(T.nightEmission) ? T.nightEmission : P.lit.emission) * em, (Number.isFinite(T.nightGroundEmission) ? T.nightGroundEmission : P.lit.groundEmission) * em, num(fm[0], .65), num(fm[1], 1.2));
      const tiers = T.tiers, tm = tiers?.multipliers || [1, 1, 1], tw = tiers?.weights || [0, 0, 0];
      tF.push(num(T.nightWin?.[0], 0), num(T.nightWin?.[1], 0), T.maxContig, tiers ? num(tw[0], 0) + num(tw[1], 0) : 0);
      tG.push(num(tm[0], 1), num(tm[1], 1), num(tm[2], 1), tiers ? num(tw[0], 0) : 0);
    }
    const house = P.types[0], shop = P.types[2], office = P.types[P.byKey.office] || P.types[3];
    const pitched = (pick(house.pitched?.colors) || ['#855B49', '#656F68', '#9D7658']).flatMap(L);
    const awning = (pick(shop.awning?.colors) || ['#9C614D', '#667C6B', '#C2AC76']).flatMap(L);
    const SG = P.signs || {}, sign = Array.from({ length: 8 }, (_, i) => L((SG.colors || ['#C8372D'])[i % (SG.colors || ['#C8372D']).length])).flat(), signInk = [L(SG.ink?.light || '#F7F5EE'), L(SG.ink?.dark || '#1E2326')].flat(), signNight = num(SG.nightEmission, .95);   // 간판
    const light = th === 'dark' ? P.dark : P.light, lc = hexRGB(light.color || '#ffffff').map(v => v ** 2.2), mx = Math.max(...lc), lightCol = lc.map(v => v / mx);
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
    const hk2 = (hc ? [...[0, 1, 2].map(i => (hc.thatch || ['#C3A05E'])[i % (hc.thatch || [1]).length]), hc.mud || '#C4AA83', ...[0, 1].map(i => (hc.field || ['#9C978B'])[i % (hc.field || [1]).length])] : new Array(6).fill('#888888')).flatMap(L);
    const hkP = HK ? [num(HK.baseM, .55), num(HK.postM, .24), num(HK.paperShare, .55), num(HK.night?.litShare, .6)] : [0, 0, 0, 0], hkE = [HK ? num(HK.night?.emission, .85) : 0, 0];
    return { hk, hk2, giwa, hkP, hkE, through, thBand, thGlass, thFrame, thInside, thMix, mwall, mglass, mfac, mbay, roofPal, ground, tA, tB, tC, tD, tE, tF, tG, litMean, pitched, awning, sign, signInk, signNight, equip: L(pick(P.equip.colors)), lit: litCols.flat(), lightCol, shade: [sideDark, roofBright, th === 'dark' ? 1 : 0, 0], ao: [num(P.ao.opacity, .1), num(P.ao.widthM, .5)], refl, reflB, reflH, reflD, sky, art, artTop, artBelt, artDim, artDL, lodPx: P.lodPx };
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
  draw(gl, M, depthOnly, glass = false) {
    const t0 = performance.now(), map = this.map, C = this.context(gl), prog = depthOnly ? C.depth : C.color, u = prog.u, zoom = map.getZoom(), now = this.now || performance.now();
    gl.useProgram(prog.p);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); if (this.cull === 'none') gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(this.cull === 'ccw' ? gl.CCW : gl.CW) } gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    if (depthOnly) gl.colorMask(false, false, false, false); else gl.colorMask(true, true, true, true);
    const K = this.palette || (this.palette = this.paletteFor());
    gl.uniform4fv(u.u_through, K.through); gl.uniform4fv(u.u_thBand, K.thBand);   // both passes: the depth pass leaves the band open
    if (!depthOnly) {
      gl.uniform3fv(u.u_thGlass, K.thGlass); gl.uniform3fv(u.u_thFrame, K.thFrame); gl.uniform3fv(u.u_thInside, K.thInside); gl.uniform3fv(u.u_thMix, K.thMix);
      gl.uniform4fv(u.u_tA, K.tA); gl.uniform4fv(u.u_tB, K.tB); gl.uniform4fv(u.u_tC, K.tC); gl.uniform4fv(u.u_tD, K.tD); gl.uniform4fv(u.u_tE, K.tE); gl.uniform4fv(u.u_tF, K.tF); gl.uniform4fv(u.u_tG, K.tG);
      gl.uniform3fv(u.u_mwall, K.mwall); gl.uniform3fv(u.u_mglass, K.mglass); gl.uniform4fv(u.u_mfac, K.mfac); gl.uniform1fv(u.u_mbay, K.mbay); gl.uniform3fv(u.u_roofPal, K.roofPal);
      gl.uniform3fv(u.u_hk, K.hk); gl.uniform3fv(u.u_hk2, K.hk2); gl.uniform3fv(u.u_giwa, K.giwa); gl.uniform4fv(u.u_hkP, K.hkP); gl.uniform2fv(u.u_hkE, K.hkE);
      gl.uniform4fv(u.u_ground, K.ground); gl.uniform3fv(u.u_pitched, K.pitched); gl.uniform3fv(u.u_awning, K.awning); gl.uniform3fv(u.u_sign, K.sign); gl.uniform3fv(u.u_signInk, K.signInk); gl.uniform1f(u.u_signNight, K.signNight); gl.uniform3fv(u.u_equip, K.equip); gl.uniform3fv(u.u_lit, K.lit); gl.uniform3fv(u.u_litMean, K.litMean);
      gl.uniform3fv(u.u_sun, this.sunDir()); gl.uniform3fv(u.u_lightCol, K.lightCol); gl.uniform4fv(u.u_shade, K.shade); gl.uniform2fv(u.u_ao, K.ao);
      gl.uniform4fv(u.u_refl, K.refl); gl.uniform4fv(u.u_reflB, K.reflB); gl.uniform4fv(u.u_reflH, K.reflH); gl.uniform4fv(u.u_reflD, K.reflD); gl.uniform3fv(u.u_sky, K.sky); gl.uniform4f(u.u_art, K.art[0], K.art[1], zoom, K.art[3]); gl.uniform3fv(u.u_artTop, K.artTop); gl.uniform4fv(u.u_artBelt, K.artBelt); gl.uniform4fv(u.u_artDim, K.artDim); gl.uniform4fv(u.u_artDL, K.artDL); gl.uniform2fv(u.u_lodPx, K.lodPx);
    }
    const lodE = this.P.lod.equipment, sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
    gl.uniform2f(u.u_detail, sm(lodE[0], lodE[1], zoom), sm(lodE[1], lodE[1] + .5, zoom)); gl.uniform1f(u.u_maxH, this.maxHeight); gl.uniform1f(u.u_S, S);
    if (!depthOnly) gl.uniform1f(u.u_debug, this.debug);
    this.xrayUniforms(gl, u, glass);   // x-ray boxes: the depth pass and the glass pass on the train canvas; none in the map's own pass (it has no boxes then)
    if (glass) { gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA) }   // premultiplied, and only where the train canvas drew something behind (a deck, a platform, a train): elsewhere the map's own opaque building and the labels over it stay as they are
    const hi = zoom >= this.lodHi, zoomGrow = sm(this.phone ? 14.5 : 14, (this.phone ? 14.5 : 14) + .6, zoom);   // the city rises over the first 0.6 zoom, as the map's boxes did
    const M64 = this.M64, M32 = this.M32; let growing = false, drawn = false, draws = 0;
    const far = this.phone ? this.farLimit(zoom) : null, cc = map.getCenter(), cmx = cc.lng / 360 + .5, cmy = .5 - Math.log(Math.tan(Math.PI / 4 + cc.lat * RAD / 2)) / (2 * Math.PI);
    let uploaded = false;
    for (const e of this.visible) {
      let g = e.gpu.get(gl);
      if (!g) {
        if (uploaded) { growing = true; continue }   // one tile's upload a frame: the rest next frame (growing: a repaint follows)
        if (!e.mesh.verts) { this.tiles.delete(e.key); for (const g2 of this.ctx.keys()) this.free(g2, e); this.schedule(); continue }   // its bytes already let go (phones): built again
        g = this.upload(gl, e); uploaded = true;
        // phones: once both canvases (the map's and the trains') hold it, the JS copy is let go — a third copy of the city
        if (this.phone && e.gpu.size >= 2) { e.mesh.verts = null; e.mesh.idx = null }
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
      for (const c of m.chunks) {
        if (!this.noCull && !this.inView(M64, c, m.mpu * grow)) continue;
        if (glass && !this.hitsBox(M64, c, m.mpu * grow, this.xr.U)) continue;   // the glass pass: only chunks under an x-ray box
        const a = hi ? c.iLo : c.i0, b = hi ? c.i1 : c.iW; if (b <= a) continue;
        if (far) {   // phones: beyond the far limit the chunk sinks into the ground, then is skipped
          const d = (Math.hypot((c.x0 + c.x1) / 2 - tox, (c.y0 + c.y1) / 2 - toy) - Math.hypot(c.x1 - c.x0, c.y1 - c.y0) / 2) / m.mpu, f = 1 - sm(far[0], far[1], d);
          if (f <= 0) continue; gl.uniform1f(u.u_grow, grow * f);
        }
        if (!this.skipDraw) gl.drawElements(gl.TRIANGLES, b - a, gl.UNSIGNED_INT, a * 4); drawn = true; draws++;
      }
    }
    gl.bindVertexArray(null); gl.colorMask(true, true, true, true); gl.disable(gl.CULL_FACE); gl.frontFace(gl.CCW); if (depthOnly) gl.depthFunc(gl.LESS);   // the train canvas's renderers expect culling off (as BuildingDepth left it)
    if (glass) { gl.disable(gl.BLEND); gl.depthMask(true); this.stats.glassDraws = draws; return drawn }
    this.growing = growing; if (growing && !depthOnly) map.triggerRepaint();
    const st = this.stats; st[depthOnly ? 'depthMs' : 'renderMs'] = (st[depthOnly ? 'depthMs' : 'renderMs'] || 0) + performance.now() - t0; st[depthOnly ? 'depthFrames' : 'frames'] = (st[depthOnly ? 'depthFrames' : 'frames'] || 0) + 1; st.draws = draws;
    return drawn;
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
