import { SEOUL_COASTER_STYLE as STYLE, distanceGrid } from './coaster_style_seoul.mjs';

// Existing 22-float track format. Negative red selects a uniform material:
// 1 supports, 2 ties, 3 spine, 4 V brackets, 5 concrete feet. Green holds stable tie ID.
export function coasterTrackVertexShader(heart) { return `#version 300 es
in vec4 a_p;in vec2 a_r;in vec4 a_o;in vec2 a_z;in vec3 a_f;in vec3 a_u;in vec4 a_c;
uniform mat4 u_matrix;uniform float u_unit,u_lane,u_body;uniform vec3 u_post,u_spine,u_concrete,u_detail;uniform vec4 u_size;
out vec3 v_c;out float v_alpha;
void main(){
  float kind=max(0.,-a_c.r),lane=(a_o.x+a_o.y*u_lane)*u_unit;
  float width=kind<.5?u_size.x:kind<1.5?u_size.w:kind<2.5?1.:kind<3.5?u_size.y:1.;
  float across=(a_o.z*u_body+a_o.w*width)*u_unit;
  float along=a_z.x*(kind>1.5&&kind<2.5?u_detail.x:kind>.5&&kind<1.5?u_size.w:1.);
  float up=a_z.y*(kind<.5||kind>1.5&&kind<2.5?u_size.x:u_size.z);
  vec3 r=vec3(a_r,0.),p=r-dot(r,a_f)*a_f;float pl=length(p);vec3 U0=pl>1e-6?cross(a_f,p/pl):a_u;
  gl_Position=u_matrix*vec4(vec3(a_p.xy+a_r*lane,a_p.z*a_p.w)+cross(a_u,a_f)*across+(a_f*along+a_u*up)*u_unit+(U0-a_u)*(${heart}*u_body*u_unit),1.);
  v_c=(kind<.5?a_c.rgb:kind<2.5?u_post:kind<4.5?u_spine:u_concrete)*a_c.a;
  v_alpha=kind>3.5?u_detail.z:kind>1.5&&kind<2.5&&mod(a_c.g,2.)>.5?u_detail.y:1.;
}`; }
export const COASTER_TRACK_FS = `#version 300 es
precision highp float;in vec3 v_c;in float v_alpha;uniform float u_alpha;out vec4 o;
void main(){float a=u_alpha*v_alpha;if(a<.005)discard;o=vec4(v_c*a,a);}`;

const linear = x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const srgb = x=>x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055;
export function buildCoasterTrackMesh({points:P,at,columns,s0,s1,mu,offset,lvl,color,pack=STYLE}) {
  const T=pack.track,S=pack.supports, every=Math.max(1,Math.round(lvl*3/80));
  const cols=columns.filter((s,i)=>i%every===0&&s>=s0&&s<s1);
  const ties=lvl<=16?distanceGrid(s0/mu,s1/mu,T.tieEveryM,lvl===8?1:2):[];
  const out=new Float32Array(22*(160*P.length+180*cols.length+40*ties.length+32));let o=0;
  const UP=[0,0,1], railColors=[1,T.railSideLight,.9,.65].map(sh=>color.map(c=>srgb(linear(c)*sh)));
  const v=(q,hf,side,kb,kp,kf,zp,part,shade=1,post=false,index=0)=>{
    const F=post?q.G:q.F,U=post?UP:q.U,c=part?[-part,index,0]:railColors[shade];
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
  for(const side of [-1,1]){
    for(let i=0;i<P.length-1;i++){
      const A=P[i],B=P[i+1];
      // Four faces per rail: same wheel alignment, less than two CSS pixels across.
      for(const kb of [-T.railBodyOffset,T.railBodyOffset]){
        const face=(kp0,z0,kp1,z1,shade)=>quad([A,1,side,kb,kp0,0,z0,0,shade],[B,1,side,kb,kp0,0,z0,0,shade],
          [B,1,side,kb,kp1,0,z1,0,shade],[A,1,side,kb,kp1,0,z1,0,shade]);
        face(-.5,.4,.5,.4,0);face(-.5,-.6,-.5,.4,1);face(.5,.4,.5,-.6,2);face(.5,-.6,-.5,-.6,3);
      }
      // A single narrow teal spine leaves open air between the coloured rails.
      for(const [kp0,z0,kp1,z1,sh] of [[-.5,-.25,.5,-.25,1],[-.5,-1,-.5,-.25,.8],[.5,-.25,.5,-1,.9],[.5,-1,-.5,-1,.7]])
        quad([A,1,side,0,kp0,0,z0,3,sh],[B,1,side,0,kp0,0,z0,3,sh],[B,1,side,0,kp1,0,z1,3,sh],[A,1,side,0,kp1,0,z1,3,sh]);
    }
    for(const s of ties){
      const q=at(s*mu),w=T.tieBodyWidth/2,id=Math.round(s/T.tieEveryM);
      quad([q,1,side,-w,0,-.5,-.25,2,1,false,id],[q,1,side,w,0,-.5,-.25,2,1,false,id],
        [q,1,side,w,0,.5,-.25,2,1,false,id],[q,1,side,-w,0,.5,-.25,2,1,false,id]);
      if(lvl===8)for(const sign of [-1,1])quad([q,1,side,0,0,-.35,-1,4,.9],[q,1,side,sign*.3,0,-.35,-.25,4,.9],
        [q,1,side,sign*.3,0,.35,-.25,4,.9],[q,1,side,0,0,.35,-1,4,.9]);
    }
  }
  if(o>out.length)throw Error('coaster track mesh capacity exceeded');
  return out.subarray(0,o);
}
