// Shared, instanced boarding furniture; station names remain with the map's label/collision engine.
import { PARK_DEFAULTS as STYLE } from '../basic/park.mts'; import { zoomFade, metresPerPixel } from './metrics.mts';
import { compile, hexRGB } from './night.mts';
import { routeBadgeId, routeBadgeAtlas, BADGE_COLS, BADGE_ROWS } from './badges.mts';
import type { ParkPack } from './metrics.mts';

// 기운 상자(가운데 x, y · 긴 축 ax, ay · 길이 · 폭 m · 1 m 길이 mu)
export interface OrientedRect { x:number; y:number; ax:number; ay:number; length:number; width:number; mu?:number }
// 역 승강장 하나(본체 stationRects): 노선 · 역 · 차선 비킴 px · 승강장 몫 · 노선색 · 배지 번호
export interface StationSite { key:string; id:string; line:string; x:number; y:number; ax:number; ay:number; length:number; mu:number; offset:number; plat:number; color:number[]; badge:number; width?:number }
// 놓은 장식 하나(바닥 · 지붕 · 개찰구 · 표지)
export interface StationPiece extends StationSite { width:number; siteKey:string; side:number; accent?:number }
type PieceKind = 'decks' | 'roofs' | 'gates' | 'signs';
type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;
type StationUniform = 'u_matrix' | 'u_pal' | 'u_grow' | 'u_dark';
type SignUniform = 'u_matrix' | 'u_view' | 'u_px' | 'u_grow' | 'u_atlas' | 'u_cream';
interface StationPart { va:WebGLVertexArrayObject; vb:WebGLBuffer; ib:WebGLBuffer; n:number; bytes:number; key:string | null; count:number; instanceBytes?:number }
export interface StationRenderOptions { zoom:number; bounds:readonly number[]; bodyPx:number; lanePx:number; dark?:boolean; selected?:string; pixelRatio?:number }

const EARTH=40075016.685578488;
const mx=(lon:number)=>lon/360+.5, my=(lat:number)=>.5-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/(2*Math.PI);
const metre=(lat:number)=>1/(EARTH*Math.cos(lat*Math.PI/180));

export function orientedOverlap(a:OrientedRect,b:OrientedRect) {
  const dx=b.x-a.x,dy=b.y-a.y,am=a.mu||1,bm=b.mu||1;
  const al=a.length*am/2,aw=a.width*am/2,bl=b.length*bm/2,bw=b.width*bm/2,eps=1e-10*am;
  // Most platforms belong to different blocks. Reject their axis-aligned bounds before SAT,
  // without allocating axis arrays or closures for every pair during a viewport change.
  if(Math.abs(dx)>=Math.abs(a.ax)*al+Math.abs(a.ay)*aw+Math.abs(b.ax)*bl+Math.abs(b.ay)*bw-eps||
     Math.abs(dy)>=Math.abs(a.ay)*al+Math.abs(a.ax)*aw+Math.abs(b.ay)*bl+Math.abs(b.ax)*bw-eps)return false;
  for(let i=0;i<4;i++){
    const x=i===0?a.ax:i===1?-a.ay:i===2?b.ax:-b.ay,y=i===0?a.ay:i===1?a.ax:i===2?b.ay:b.ax;
    const ra=Math.abs(x*a.ax+y*a.ay)*al+Math.abs(-x*a.ay+y*a.ax)*aw;
    const rb=Math.abs(x*b.ax+y*b.ay)*bl+Math.abs(-x*b.ay+y*b.ax)*bw;
    if(Math.abs(dx*x+dy*y)>=ra+rb-eps)return false;
  }
  return true;
}

export function planStationFurniture(sites:StationSite[],{metresPerPx,bodyPx,lanePx,pack=STYLE}:{ metresPerPx:number; bodyPx:number; lanePx:number; pack?:ParkPack }) {
  const S=pack.station, sorted=[...sites].sort((a,b)=>b.length-a.length||a.key.localeCompare(b.key));
  const corridorHalf=(lanePx+bodyPx/2)*metresPerPx+S.curveClearM;
  const placed=sorted.map(s=>({...s,x:s.x-s.ay*s.offset*metresPerPx*s.mu,y:s.y+s.ax*s.offset*metresPerPx*s.mu}));
  const corridors=placed.map(s=>({...s,width:corridorHalf*2,length:s.length+8}));
  const decks:StationPiece[]=[],roofs:StationPiece[]=[],gates:StationPiece[]=[],signs:StationPiece[]=[];
  const blocked=(p:OrientedRect)=>corridors.some(c=>orientedOverlap(p,c));
  for(const s of placed){
    const L=s.length*Math.max(.1,Math.min(1,s.plat||1)),depth=S.canopyDepthM;
    const make=(side:number,along:number,length:number,suffix:string):StationPiece=>({...s,key:`${s.key}:${side}:${suffix}`,siteKey:s.key,side,
      x:s.x+s.ax*along*s.mu-s.ay*side*(corridorHalf+S.walkClearM+depth/2)*s.mu,
      y:s.y+s.ay*along*s.mu+s.ax*side*(corridorHalf+S.walkClearM+depth/2)*s.mu,length,width:depth});
    for(const side of [-1,1]){
      const deck=make(side,0,L,'deck');
      if(!blocked(deck)&&!decks.some(d=>orientedOverlap(d,deck)))decks.push(deck);
      else for(let x=-L/2;x<L/2;x+=15){
        const length=Math.min(15,L/2-x),piece=make(side,x+length/2,length,`deck:${x}`);
        if(!blocked(piece)&&!decks.some(d=>orientedOverlap(d,piece)))decks.push(piece);
      }
      const step=S.canopyLengthM+S.canopyGapM,n=Math.min(S.maxCanopiesPerSide,Math.floor((L-8+S.canopyGapM)/step));
      for(let j=0;j<n;j++){
        const roof=make(side,(j-(n-1)/2)*step,S.canopyLengthM,`roof:${j}`);roof.accent=j%3===2?1:0;
        if(!blocked(roof)&&!roofs.some(r=>orientedOverlap(r,roof)))roofs.push(roof);
      }
      const gate=make(side,side*(L/2-3),1.1,'gate');gate.width=S.gateWidthM;
      if(!blocked(gate)&&!gates.some(g=>orientedOverlap(g,gate))){gates.push(gate);if(!signs.some(g=>g.siteKey===s.key))signs.push({...gate,key:`${s.key}:sign`})}
    }
  }
  return {decks,roofs,gates,signs,corridors};
}

class Mesh {
  declare data:number[];
  constructor(){this.data=[]}
  tri(a:number[],b:number[],c:number[],slot:number,shade=1){for(const p of [a,b,c])this.data.push(...p,slot,shade)}
  quad(a:number[],b:number[],c:number[],d:number[],slot:number,shade=1){this.tri(a,b,c,slot,shade);this.tri(a,c,d,slot,shade)}
  box(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,slot:number){
    const P=(x:number,y:number,z:number)=>[x,y,z];
    this.quad(P(x0,y0,z1),P(x1,y0,z1),P(x1,y1,z1),P(x0,y1,z1),slot);
    this.quad(P(x0,y0,z0),P(x1,y0,z0),P(x1,y0,z1),P(x0,y0,z1),slot,.8);
    this.quad(P(x1,y1,z0),P(x0,y1,z0),P(x0,y1,z1),P(x1,y1,z1),slot,.9);
    this.quad(P(x0,y1,z0),P(x0,y0,z0),P(x0,y0,z1),P(x0,y1,z1),slot,.75);
    this.quad(P(x1,y0,z0),P(x1,y1,z0),P(x1,y1,z1),P(x1,y0,z1),slot,.85);
  }
}
// xy normalised to an instance's length/width; heights always map metres.
function furnitureMesh(kind:PieceKind,S:ParkPack['station']){
  const M=new Mesh(),floor=S.deckThicknessM;
  if(kind==='decks'){
    M.box(-.5,.5,-.5,.5,0,floor,2);
    M.quad([-.5,-.5,floor],[.5,-.5,floor],[.5,.5,floor],[-.5,.5,floor],5);
    const w=S.safetyWidthM/S.canopyDepthM;
    for(const sign of [-1,1]){const y=sign*(.5-w/2);M.box(-.5,.5,y-w/2,y+w/2,floor+.01,floor+.03,4)}
  }else if(kind==='roofs'){
    const e=floor+S.canopyEaveM,h=floor+S.canopyRidgeM;
    const A=[-.5,-.5,e],B=[.5,-.5,e],C=[.5,.5,e],D=[-.5,.5,e],L=[-.32,0,h],R=[.32,0,h];
    M.quad(A,B,R,L,0);M.quad(C,D,L,R,0,.88);M.tri(D,A,L,3,.86);M.tri(B,C,R,3,.95);
    for(const sign of [-1,1]){
      const y=sign*.49;M.box(-.5,.5,y-.012,y+.012,e-S.routeBandM,e,8);
      const x=sign*.37,hw=S.canopyPostM/S.canopyLengthM/2,hd=S.canopyPostM/S.canopyDepthM/2;
      M.box(x-hw,x+hw,-hd,hd,floor,e,2);
      for(let j=0;j<3;j++){const bx=(j-1)*S.bulbEveryM/S.canopyLengthM;M.box(bx-.018,bx+.018,y-.04,y+.04,e-.13,e+.02,9)}
    }
  }else{
    const h=floor+S.gateHeightM;
    for(const sign of [-1,1]){const y=sign*.46;M.box(-.12,.12,y-.035,y+.035,floor,h,2)}
    M.box(-.17,.17,-.5,.5,h-.55,h,0);M.box(-.18,.18,-.5,.5,h-.04,h+.035,4);
    M.box(-.18,.18,-.5,.5,h-.57,h-.51,4);
  }
  return new Float32Array(M.data);
}

const VS=`#version 300 es
layout(location=0)in vec3 a_pos;layout(location=1)in vec2 a_mat;
layout(location=2)in vec4 i_frame;layout(location=3)in vec4 i_size;layout(location=4)in vec4 i_color;
uniform mat4 u_matrix;uniform vec3 u_pal[10];uniform float u_grow,u_dark;
out vec3 v_color;
void main(){
  vec2 F=i_frame.zw,R=vec2(-F.y,F.x);vec3 p=vec3(i_frame.xy+(F*a_pos.x*i_size.x+R*a_pos.y*i_size.y)*i_size.z,a_pos.z*i_size.z*u_grow);
  gl_Position=u_matrix*vec4(p,1.);int slot=int(a_mat.x);
  vec3 c=slot==8?i_color.rgb:slot==3&&i_size.w<.5?u_pal[0]:u_pal[slot];
  if(slot==9&&u_dark<.5)c=u_pal[4]*.85;
  v_color=c*(slot==9&&u_dark>.5?1.:a_mat.y);
}`;
const FS=`#version 300 es
precision highp float;in vec3 v_color;out vec4 o;void main(){o=vec4(v_color,1.);}`;
const SIGN_VS=`#version 300 es
layout(location=0)in vec2 a_pos;layout(location=2)in vec4 i_frame;layout(location=3)in vec4 i_size;layout(location=4)in vec4 i_color;
uniform mat4 u_matrix;uniform vec2 u_view;uniform float u_px,u_grow;
out vec2 v_uv;out vec3 v_color;flat out float v_badge;
void main(){gl_Position=u_matrix*vec4(i_frame.xy,4.25*i_size.z,1.);gl_Position.xy+=a_pos*u_px*u_grow/u_view*gl_Position.w;
  v_uv=vec2(a_pos.x,-a_pos.y)*.5+.5;v_color=i_color.rgb;v_badge=i_color.a;}`;
const SIGN_FS=`#version 300 es
precision highp float;in vec2 v_uv;in vec3 v_color;flat in float v_badge;uniform sampler2D u_atlas;uniform vec3 u_cream;out vec4 o;
void main(){vec2 p=v_uv-.5;float d=length(p);if(d>.5)discard;
  vec2 uv=(vec2(mod(v_badge,${BADGE_COLS}.),floor(v_badge/${BADGE_COLS}.))+v_uv)/vec2(${BADGE_COLS}.,${BADGE_ROWS}.);
  vec4 glyph=texture(u_atlas,uv);vec3 c=d>.43?u_cream:v_color;o=vec4(mix(c,glyph.rgb,glyph.a),1.);}`;

export class CoasterStations {
  // 필드는 선언만(declare — 실행 코드 없음, 값은 지금처럼 constructor · init · render 가 넣는다)
  declare pack:ParkPack; declare O:{ x:number; y:number }; declare M:Float32Array; declare parts:Partial<Record<PieceKind, StationPart>>; declare stats:Record<string, number>;
  declare sites:StationSite[]; declare p:WebGLProgram | null; declare sign:WebGLProgram; declare u:Uniforms<StationUniform>; declare us:Uniforms<SignUniform>; declare tex:WebGLTexture;
  declare layoutBounds:number[]; declare layout:ReturnType<typeof planStationFurniture>; declare layoutKey:string; declare layoutRevision:number;
  declare visibleKey:string; declare visiblePlan:Record<PieceKind, StationPiece[]>;
  constructor(rects:Iterable<[string, { coords:number[][]; offset?:number; plat?:number }]>,colors:Record<string, string>,pack:ParkPack=STYLE){
    this.pack=pack;this.O={x:mx(126.978),y:my(37.5665)};this.M=new Float32Array(16);this.parts={};this.stats={draws:0,bytes:0};
    this.sites=[...rects].map(([key,r])=>{
      const split=key.lastIndexOf(':'),line=key.slice(0,split),a=r.coords[0]!,b=r.coords.at(-1)!,x0=mx(a[0]!),y0=my(a[1]!),x1=mx(b[0]!),y1=my(b[1]!);
      const d=Math.hypot(x1-x0,y1-y0)||1e-12,mu=metre((a[1]!+b[1]!)/2);
      return {key,id:key.slice(split+1),line,x:(x0+x1)/2,y:(y0+y1)/2,ax:(x1-x0)/d,ay:(y1-y0)/d,length:d/mu,mu,offset:r.offset||0,plat:r.plat||1,color:hexRGB(colors[line]||'#52646a'),badge:routeBadgeId(line)};
    });
  }
  init(gl:WebGL2RenderingContext){
    this.p=compile(gl,VS,FS);this.sign=compile(gl,SIGN_VS,SIGN_FS);
    this.u=Object.fromEntries((['u_matrix','u_pal','u_grow','u_dark'] as const).map(n=>[n,gl.getUniformLocation(this.p!,n)])) as Uniforms<StationUniform>;
    this.us=Object.fromEntries((['u_matrix','u_view','u_px','u_grow','u_atlas','u_cream'] as const).map(n=>[n,gl.getUniformLocation(this.sign,n)])) as Uniforms<SignUniform>;
    for(const kind of ['decks','roofs','gates','signs'] as PieceKind[]){
      const mesh=kind==='signs'?new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]):furnitureMesh(kind,this.pack.station);
      const va=gl.createVertexArray(),vb=gl.createBuffer(),ib=gl.createBuffer();gl.bindVertexArray(va);gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,kind==='signs'?2:3,gl.FLOAT,false,kind==='signs'?8:20,0);
      if(kind!=='signs'){gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12)}
      gl.bindBuffer(gl.ARRAY_BUFFER,ib);
      for(let i=2;i<=4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,48,(i-2)*16);gl.vertexAttribDivisor(i,1)}
      this.parts[kind]={va,vb,ib,n:mesh.length/(kind==='signs'?2:5),bytes:mesh.byteLength,key:null,count:0};
    }
    gl.bindVertexArray(null);
    this.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,routeBadgeAtlas());
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  screenBox(r:StationPiece,M:ArrayLike<number>,width:number,height:number){
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [this.pack.station.canopyEaveM,this.pack.station.canopyRidgeM]){
      const X=r.x+(r.ax*x*r.length-r.ay*y*r.width)*r.mu,Y=r.y+(r.ay*x*r.length+r.ax*y*r.width)*r.mu,Z=(z+this.pack.station.deckThicknessM)*r.mu;
      const w=M[3]!*X+M[7]!*Y+M[11]!*Z+M[15]!;if(w<=0)return null;
      const px=(M[0]!*X+M[4]!*Y+M[8]!*Z+M[12]!)/w*width/2,py=(M[1]!*X+M[5]!*Y+M[9]!*Z+M[13]!)/w*height/2;
      x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);
    }
    return {x0,y0,x1,y1,id:r.id};
  }
  render(gl:WebGL2RenderingContext,M:ArrayLike<number>,{zoom,bounds,bodyPx,lanePx,dark=false,selected='all',pixelRatio=1}:StationRenderOptions={} as StationRenderOptions){
    if(zoom<=this.pack.lod.canopy[0]!){this.stats={...this.stats,draws:0,stations:0,roofs:0,gates:0,ms:0};return}
    if(!this.p)this.init(gl);
    const start=performance.now(),mpp=metresPerPixel(zoom),pad=(bounds[2]!-bounds[0]!)*.15;
    const within=(B:readonly number[])=>this.sites.filter(s=>{const margin=pad+(s.length/2+(lanePx+bodyPx/2)*mpp+16)*s.mu;
      return (selected==='all'||selected===s.line)&&s.x>=B[0]!-margin&&s.x<=B[2]!+margin&&s.y>=B[1]!-margin&&s.y<=B[3]!+margin});
    const visible=within(bounds),layoutKey=zoom.toFixed(5)+'|'+selected,C=this.layoutBounds;
    // Plan neighbouring platforms together, retaining that collision solution throughout a pan.
    // Only instance membership changes at the viewport edge; crossing it no longer repeats SAT.
    if(layoutKey!==this.layoutKey||!C||bounds[0]!<C[0]!||bounds[1]!<C[1]!||bounds[2]!>C[2]!||bounds[3]!>C[3]!){
      const dx=(bounds[2]!-bounds[0]!)*.5,dy=(bounds[3]!-bounds[1]!)*.5;
      this.layoutBounds=[bounds[0]!-dx,bounds[1]!-dy,bounds[2]!+dx,bounds[3]!+dy];
      this.layout=planStationFurniture(within(this.layoutBounds),{metresPerPx:mpp,bodyPx,lanePx,pack:this.pack});
      this.layoutKey=layoutKey;this.layoutRevision=(this.layoutRevision||0)+1;
    }
    const key=this.layoutRevision+'|'+visible.map(s=>s.key).join('|');
    if(key!==this.visibleKey){const ids=new Set(visible.map(s=>s.key));this.visiblePlan=Object.fromEntries((['decks','roofs','gates','signs'] as const).map(k=>[k,this.layout[k].filter(p=>ids.has(p.siteKey))])) as Record<PieceKind, StationPiece[]>;this.visibleKey=key}
    const plan=this.visiblePlan,boxes:{x0:number;y0:number;x1:number;y1:number;id:string}[]=[];
    // Same-station projected roof collisions: the longest platform won the stable plan order.
    const roofs=plan.roofs.filter(r=>{const b=this.screenBox(r,M,gl.drawingBufferWidth,gl.drawingBufferHeight);if(!b)return false;
      if(boxes.some(a=>a.id===b.id&&a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0))return false;boxes.push(b);return true});
    const MT=this.M;MT.set(M);for(let r=0;r<4;r++)MT[12+r]=M[r]!*this.O.x+M[4+r]!*this.O.y+M[12+r]!;
    const pal=this.pack.palette[dark?'dark':'light'];
    const rgb=['cream','ivory','teal','red','gold','deck','concrete','ink','cream','bulbWarm'].flatMap(k=>hexRGB(pal[k as keyof typeof pal]));
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
    let draws=0,bytes=routeBadgeAtlas().width*routeBadgeAtlas().height*4;
    for(const kind of ['decks','roofs','gates','signs'] as PieceKind[]){
      const K=this.parts[kind]!,items=kind==='roofs'?roofs:plan[kind],fade=zoomFade(zoom,kind==='gates'?this.pack.lod.gate:this.pack.lod.canopy);
      if(!items.length||fade<=0)continue;
      const signature=key+'|'+items.map(r=>r.key).join(',');
      if(K.key!==signature){
        const d=new Float32Array(items.length*12);let i=0;
        for(const r of items){d.set([r.x-this.O.x,r.y-this.O.y,r.ax,r.ay,r.length,r.width,r.mu,r.accent||0,...r.color,r.badge],i);i+=12}
        gl.bindBuffer(gl.ARRAY_BUFFER,K.ib);gl.bufferData(gl.ARRAY_BUFFER,d,gl.DYNAMIC_DRAW);K.key=signature;K.count=items.length;K.instanceBytes=d.byteLength;
      }
      if(kind==='signs'){
        gl.useProgram(this.sign);gl.uniformMatrix4fv(this.us.u_matrix,false,MT);gl.uniform2f(this.us.u_view,gl.drawingBufferWidth,gl.drawingBufferHeight);
        gl.uniform1f(this.us.u_px,this.pack.station.badgePx*pixelRatio);gl.uniform1f(this.us.u_grow,fade);gl.uniform3fv(this.us.u_cream,hexRGB(pal.cream));
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.us.u_atlas,0);
      }else{gl.useProgram(this.p);gl.uniformMatrix4fv(this.u.u_matrix,false,MT);gl.uniform3fv(this.u.u_pal,rgb);gl.uniform1f(this.u.u_grow,fade);gl.uniform1f(this.u.u_dark,dark?1:0)}
      gl.bindVertexArray(K.va);gl.drawArraysInstanced(gl.TRIANGLES,0,K.n,K.count);draws++;bytes+=K.bytes+(K.instanceBytes||0);
    }
    gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    this.stats={draws,bytes,stations:visible.length,roofs:roofs.length,gates:zoom>=this.pack.lod.gate[0]!?plan.gates.length:0,ms:performance.now()-start};
  }
  dispose(gl:WebGL2RenderingContext){for(const K of Object.values(this.parts)){gl.deleteVertexArray(K.va);gl.deleteBuffer(K.vb);gl.deleteBuffer(K.ib)}gl.deleteTexture(this.tex);gl.deleteProgram(this.p);gl.deleteProgram(this.sign);this.parts={};this.p=null}
}
