// 조선 모드 석탑 3D (three.js r128, 같은 열차 캔버스 GL 컨텍스트): 원각사지 십층석탑 · 불국사 삼층석탑.
// 모양은 Codex 시안(2026-10-11, 행님 "석탑은 괜찮군 — 색만 지금 색에 밸런스")을 그대로 옮겼다: 亞자 기단 · 부조 판 · 공포 · 서까래 ·
// 기와골 지붕돌(원각사지), 우주 · 탱주 · 층급받침 5단 · 곡면 지붕돌 · 상륜부 부재(석가탑). 돌결 · 노멀 · 거칠기 맵은 canvas 로 만든다.
// 조선 모드에서만 landmarks.mjs 가 import() 로 받는다(첫 화면 · 다른 모드는 안 받는다). 휴대폰은 안 쓴다(셰이더 석탑).
// 빛은 지도 셰이더와 같은 식(하늘 · 해 = u_lit), 톤 매핑 · 감마 없음 — 다른 층과 색이 맞게. 그림자 맵은 쓰지 않는다.
import * as THREE from '../vendor/three.module.js';

// BEGIN MODEL CORE — geometry-only functions, independently runnable in Node.
const PI=Math.PI, TAU=PI*2;
const square=r=>[[-r,-r],[r,-r],[r,r],[-r,r]];
const cruciform=(r,a=r*.65)=>[[-a,-r],[a,-r],[a,-a],[r,-a],[r,a],[a,a],[a,r],[-a,r],[-a,a],[-r,a],[-r,-a],[-a,-a]];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const gauss=(x,y,cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2)*2);
const geometryCache=new Map();
function cached(key,create){if(!geometryCache.has(key))geometryCache.set(key,create());return geometryCache.get(key);}
function chamferedPrism(poly,height,bevel=.018){
 const b=Math.min(bevel,height*.23);
 const key='p'+JSON.stringify([poly,height,b]);
 return cached(key,()=>{
  const shape=new THREE.Shape();poly.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:height-2*b,bevelEnabled:b>0,bevelSegments:1,steps:1,bevelSize:b,bevelThickness:b,curveSegments:1});
  g.rotateX(-PI/2);g.translate(0,b,0);return g;
 });
}
function bevelBox(w,h,d,b=.012){return chamferedPrism([[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],h,b);}
class StoneBuilder{
 constructor(materials){this.materials=materials;this.batches=new Map();this.parts=[];this.sequence=0;}
 add(g,at=[0,0,0],rotation=[0,0,0],mat='stone',tone=1,keepUV=false){
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...at),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1));
  let batch=this.batches.get(mat);if(!batch){batch={p:[],n:[],uv:[],c:[],i:[]};this.batches.set(mat,batch);}
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,offset=batch.p.length/3;
  const norm=new THREE.Matrix3().getNormalMatrix(matrix),v=new THREE.Vector3(),vn=new THREE.Vector3();
  const variety=.974+.042*(.5+.5*Math.sin(++this.sequence*13.357));
  for(let i=0;i<p.count;i++){
   v.fromBufferAttribute(p,i).applyMatrix4(matrix);vn.fromBufferAttribute(n,i).applyMatrix3(norm).normalize();
   batch.p.push(v.x,v.y,v.z);batch.n.push(vn.x,vn.y,vn.z);
   if(keepUV&&uv)batch.uv.push(uv.getX(i),uv.getY(i));
   else{const nx=Math.abs(vn.x),ny=Math.abs(vn.y),nz=Math.abs(vn.z);if(ny>=nx&&ny>=nz)batch.uv.push(v.x*.7,v.z*.7);else if(nx>nz)batch.uv.push(v.z*.7,v.y*.7);else batch.uv.push(v.x*.7,v.y*.7);}
   // restrained AO baked into vertex colors; contacts are also shadowed in the lighting pass.
   const ao=(vn.y<-.25?.76:vn.y<.15?.93:1)*tone*variety;batch.c.push(ao,ao,ao);
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),index=g.index?.array;
  const count=index?index.length:p.count;
  for(let i=0;i<count;i+=3){const ia=index?index[i]:i,ib=index?index[i+1]:i+1,ic=index?index[i+2]:i+2;
   a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic);
   if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-15)batch.i.push(ia+offset,ib+offset,ic+offset);
  }
 }
 box(w,h,d,x,y,z,mat='stone',tone=1,rot=0,b=.012){this.add(bevelBox(w,h,d,b),[x,y,z],[0,rot,0],mat,tone);}
 prism(poly,y,h,b=.018,mat='stone',tone=1){this.add(chamferedPrism(poly,h,b),[0,y,0],[0,0,0],mat,tone);}
 lathe(profile,y,mat='stone',segments=48,tone=1){
  const g=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments);this.add(g,[0,y,0],[0,0,0],mat,tone);g.dispose();
 }
 finish(name,height){
  const root=new THREE.Group();root.name=name;
  for(const [key,b]of this.batches){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));g.setIndex(b.i);g.computeBoundingBox();g.computeBoundingSphere();const m=new THREE.Mesh(g,this.materials[key]||this.materials.stone);m.castShadow=true;m.receiveShadow=true;m.name=key;root.add(m);}
  root.userData={height,parts:this.parts,triangles:0,units:'meters',axis:'Y-up'};root.traverse(m=>{if(m.isMesh)root.userData.triangles+=m.geometry.index.count/3;});
  // Normalize only at build time so subsequent engine scaling is exactly uniform.
  const box=new THREE.Box3().setFromObject(root),raw=box.max.y-box.min.y,scale=height/raw;
  root.children.forEach(m=>{m.geometry.translate(0,-box.min.y,0);m.geometry.scale(scale,scale,scale);m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();});
  root.userData.rawHeight=raw;root.userData.parts=this.parts.map(p=>({...p,y:(p.y-box.min.y)*scale}));
  return root;
 }
}
function eachEdge(poly,fn){for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),tx=dx/len,tz=dz/len;fn({a,b,len,tx,tz,nx:tz,nz:-tx,angle:Math.atan2(-tz,tx),i});}}
function onFace(builder,e,u,y,out,w,h,d,mat='stone',tone=1){builder.box(w,h,d,e.a[0]+e.tx*u+e.nx*out,y,e.a[1]+e.tz*u+e.nz*out,mat,tone,e.angle);}
function roofHeight(u,t,rise,lift,tiled,tiles){
 const corner=Math.pow(Math.abs(2*u-1),7);
 const slope=rise*Math.pow(t,1.75); // shallow edge, steeper towards the ridge.
 const up=lift*corner*Math.pow(1-t,2.4);
 const tile=tiled?.013*(.5+.5*Math.cos(u*tiles*TAU))*Math.sin(PI*t):0;
 return slope+up+tile;
}
function sculptRoof(builder,poly,inner,y,edge,rise,lift,tiled=false){
 const pos=[],uv=[],idx=[];const radial=10;
 eachEdge(poly,e=>{
  const segments=tiled?Math.max(24,Math.ceil(e.len/.13)*4):48,tiles=Math.max(4,Math.round(e.len/.13)),base=pos.length/3;
  for(let j=0;j<=radial;j++){const t=j/radial,scale=1-t*(1-inner);
   for(let i=0;i<=segments;i++){const u=i/segments,x=e.a[0]+(e.b[0]-e.a[0])*u,z=e.a[1]+(e.b[1]-e.a[1])*u;pos.push(x*scale,y+edge+roofHeight(u,t,rise,lift,tiled,tiles),z*scale);uv.push(u,t);}
  }
  for(let j=0;j<radial;j++)for(let i=0;i<segments;i++){const a=base+j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;idx.push(a,c,b,b,c,d);}
  // Fascia and underside have their own vertices: the eave remains a crisp stone edge.
  const wall=pos.length/3;
  for(let i=0;i<=segments;i++){const u=i/segments,x=e.a[0]+(e.b[0]-e.a[0])*u,z=e.a[1]+(e.b[1]-e.a[1])*u,up=lift*Math.pow(Math.abs(2*u-1),7);pos.push(x,y+up,z,x,y+edge+up,z);uv.push(u,0,u,1);}
  for(let i=0;i<segments;i++){const a=wall+i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  const underside=pos.length/3;
  for(let i=0;i<=segments;i++){const u=i/segments,x=e.a[0]+(e.b[0]-e.a[0])*u,z=e.a[1]+(e.b[1]-e.a[1])*u,up=lift*Math.pow(Math.abs(2*u-1),7);pos.push(x,y+up,z,x*inner,y,z*inner);uv.push(u,0,u,1);}
  for(let i=0;i<segments;i++){const a=underside+i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
 });
 const top=poly.map(p=>new THREE.Vector2(p[0]*inner,p[1]*inner));const cap=THREE.ShapeUtils.triangulateShape(top,[]),base=pos.length/3;
 for(const p of top){pos.push(p.x,y+edge+rise,p.y);uv.push(p.x,p.y);}for(const t of cap)idx.push(base+t[0],base+t[2],base+t[1]);
 const bottom=pos.length/3;for(const p of top){pos.push(p.x,y,p.y);uv.push(p.x,p.y);}for(const t of cap)idx.push(bottom+t[0],bottom+t[1],bottom+t[2]);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();builder.add(g);g.dispose();
 if(tiled){
  // Raised hip tiles only at convex corners; concave 亞 corners keep their valleys.
  for(let i=0;i<poly.length;i++){
   const p=poly[i],prev=poly[(i+poly.length-1)%poly.length],next=poly[(i+1)%poly.length];
   const cross=(p[0]-prev[0])*(next[1]-p[1])-(p[1]-prev[1])*(next[0]-p[0]);
   if(cross<=0)continue;
   const points=Array.from({length:11},(_,j)=>{const t=j/10,scale=1-t*(1-inner);return new THREE.Vector3(p[0]*scale,y+edge+roofHeight(0,t,rise,lift,false,0)+.012,p[1]*scale);});
   const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),10,.023,5,false);builder.add(g,[0,0,0],[0,0,0],'stone',1.015);g.dispose();
  }
  eachEdge(poly,e=>{
   const tiles=Math.max(4,Math.round(e.len/.13));
   for(let i=0;i<tiles;i++){const u=(i+.5)/tiles,up=lift*Math.pow(Math.abs(2*u-1),7);onFace(builder,e,u*e.len,y+.01+up,.013,.068,.065,.055,'shade',.98);}
  });
 }
}
// One continuous bas-relief surface: seated figures, halo, lotus and robe folds.
function reliefHeight(u,v,variant=0){
 const x=(u-.5)*2,y=v;let h=.006;
 const ring=Math.sqrt((x/.56)**2+((y-.57)/.34)**2);
 h+=.018*Math.exp(-(((ring-1)/.07)**2));
 h+=.043*gauss(x,y,0,.74,.20,.12); // rounded head and ushnisha
 h+=.014*gauss(x,y,0,.835,.075,.055);
 h+=.032*gauss(x,y,0,.45,.34,.27);
 h+=.035*gauss(x,y,0,.27,.70,.115); // crossed knees
 h+=.019*gauss(x,y,-.29,.43,.13,.14)+.019*gauss(x,y,.29,.43,.13,.14);
 h+=.009*gauss(x,y,variant%2?.07:-.07,.36,.11,.08);
 if(variant%3===1){
  h=.006+.016*Math.exp(-(((ring-1)/.07)**2));
  h+=.043*gauss(x,y,0,.76,.18,.115)+.012*gauss(x,y,0,.855,.08,.06);
  h+=.033*gauss(x,y,0,.44,.26,.37)+.019*gauss(x,y,-.25,.53,.13,.19)+.019*gauss(x,y,.25,.53,.13,.19);
  h+=.022*gauss(x,y,-.11,.19,.10,.16)+.022*gauss(x,y,.11,.19,.10,.16);
 }
 const body=gauss(x,y,0,.43,.39,.24);
 h+=.006*body*(.5+.5*Math.cos((x*3+y*10+variant*.13)*TAU));
 const lotusY=.14+.023*Math.cos(x*19);h+=.014*Math.exp(-(((y-lotusY)/.027)**2))*Math.exp(-((x/.8)**6));
 // Facial center line; sculpted, not a color silhouette.
 h+=.006*gauss(x,y,0,.738,.04,.058)-.0035*gauss(x,y,0,.703,.12,.022);
 const frame=Math.min(u,1-u,v,1-v);return h*smooth(0,.07,frame);
}
function reliefGeometry(width,height,variant){
 const key=`r${width.toFixed(3)},${height.toFixed(3)},${variant%3}`;
 return cached(key,()=>{const g=new THREE.PlaneGeometry(width,height,16,20),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const u=p.getX(i)/width+.5,v=p.getY(i)/height+.5;p.setZ(i,reliefHeight(u,v,variant));}g.computeVertexNormals();return g;});
}
function carvedPanels(builder,poly,y,h,base=false,floor=0){
 eachEdge(poly,e=>{
  if(e.len<.22)return;
  const count=Math.max(1,Math.round(e.len/(base?.8:.85))),bay=e.len/count;
  for(let k=0;k<count;k++){
   const u=(k+.5)*bay,w=bay*.78,ph=h*.73,cy=y+h*.48;
   // The plane sits behind the frame and pilasters, forming a real recessed niche.
   const p=[e.a[0]+e.tx*u+e.nx*.009,cy,e.a[1]+e.tz*u+e.nz*.009];
   builder.add(reliefGeometry(w,ph,e.i+floor+k),p,[0,e.angle+PI,0],'relief',.91,true);
   onFace(builder,e,u,y+h*.06,.029,w+.06,.042,.068,'stone',1);
   onFace(builder,e,u,y+h*.86,.029,w+.06,.044,.068,'stone',1);
   for(const side of[-1,1])onFace(builder,e,u+side*(w/2+.021),y+h*.08,.028,.038,h*.82,.068,'stone',1);
  }
  for(const u of[.025,e.len-.025])onFace(builder,e,u,y+.022,.04,.074,h-.025,.082,'stone',1.025);
 });
}
function timberDetails(builder,poly,y,overhang,s=1){
 eachEdge(poly,e=>{
  const n=Math.max(2,Math.round(e.len/.34));
  // Stacked dougong arms project from the wall in three interlocking courses.
  for(let i=0;i<n;i++){const u=(i+.5)*e.len/n;
   onFace(builder,e,u,y,.066,.11,.078*s,.14,'shade');
   onFace(builder,e,u,y+.07*s,.10,.22,.065*s,.23);
   onFace(builder,e,u,y+.133*s,.17,.32,.052*s,.34);
   onFace(builder,e,u,y+.184*s,.23,.105,.064*s,.39);
  }
  const rafters=Math.max(3,Math.floor(e.len/.14));
  for(let i=0;i<rafters;i++)onFace(builder,e,(i+.5)*e.len/rafters,y+.23*s,overhang*.40,.058,.066*s,overhang*.9,'shade',1);
  onFace(builder,e,e.len/2,y+.205*s,.11,e.len+.035,.056*s,.12,'stone',.94);
 });
}
function lotus(builder,r,y,h,petals=16){
 builder.lathe([[0,0],[r*.45,0],[r*.62,h*.17],[r*.85,h*.65],[r,h*.93],[r*.73,h],[0,h]],y);
 for(let i=0;i<petals;i++){
  const a=i*TAU/petals;const g=cached('petal',()=>new THREE.SphereGeometry(1,10,7));
  const petal=g.clone();petal.scale(r*.135,h*.65,r*.30);petal.rotateX(-.38);petal.rotateY(a);petal.translate(Math.sin(a)*r*.71,y+h*.52,Math.cos(a)*r*.71);builder.add(petal);petal.dispose();
 }
}
function buildWongaksa(materials){
 const b=new StoneBuilder(materials);let y=0;
 b.prism(cruciform(2.60),y,.16,.026);y+=.16;
 // Three richly carved, progressively receding 亞-shaped pedestal tiers.
 for(const[r,h]of[[2.43,.60],[2.15,.59],[1.88,.59]]){
  b.prism(cruciform(r),y,.075,.017);y+=.075;
  b.prism(cruciform(r-.07),y,h,.018,'shade',1);
  carvedPanels(b,cruciform(r-.07),y,h,true);y+=h;
  b.prism(cruciform(r+.035),y,.105,.022);y+=.105;
  b.prism(cruciform(r-.055),y,.061,.014);y+=.061;
 }
 b.parts.push({name:'기단',y:y/2});
 for(let floor=0;floor<10;floor++){
  const isCross=floor<3,r=isCross?1.37-floor*.071:1.015-(floor-3)*.043;
  const poly=isCross?cruciform(r):square(r),body=isCross?.62-floor*.025:.29-(floor-3)*.009;
  b.prism(poly,y,.068,.012);y+=.068;
  b.prism(poly,y,body,.018,'shade');carvedPanels(b,poly,y,body,false,floor);
  const bodyBottom=y;y+=body;
  const bracketScale=isCross?1:.62;timberDetails(b,poly,y-.014,isCross?.39:.29,bracketScale);y+=.266*bracketScale;
  const rr=r+(isCross?.41:.29),rp=isCross?cruciform(rr,rr*.65):square(rr);
  const roofEdge=isCross?.088:.070,roofRise=isCross?.185:.125;sculptRoof(b,rp,.59,y,roofEdge,roofRise,isCross?.105:.058,true);
  b.parts.push({name:`${floor+1}층`,y:bodyBottom+body/2,plan:isCross?'亞':'square'});
  y+=roofEdge+roofRise;
  b.prism(isCross?cruciform(r*.86):square(r*.84),y,.04,.009);y+=.04;
 }
 // Restrained finial study: intentionally flagged as interpretation in the visible note.
 b.prism(square(.39),y,.17,.015);y+=.17;
 b.lathe([[0,0],[.29,0],[.31,.045],[.26,.13],[.16,.205],[0,.22]],y);y+=.22;
 lotus(b,.24,y,.16,12);y+=.16;
 b.lathe([[.08,0],[.08,.36],[0,.36]],y,'shade',24);
 for(let i=0;i<2;i++){b.lathe([[.075,0],[.21-i*.035,.017],[.21-i*.035,.055],[.075,.074]],y+.10+i*.12);}
 b.lathe([[0,0],[.075,0],[.115,.09],[.085,.17],[0,.28]],y+.33);
 b.parts.push({name:'상륜부',y:y+.25});return b.finish('원각사지 십층석탑',12);
}
function cornerPillars(b,r,y,h,width=.17,central=0){
 // Narrow proud edges of the same monolith; no ornamental trim on Seokgatap.
 for(const x of[-r+width/2,r-width/2])for(const z of[-r+width/2,r-width/2])b.box(width,h,width,x,y,z,'stone',1.018,0,.008);
 eachEdge(square(r),e=>{for(let i=1;i<=central;i++)onFace(b,e,e.len*i/(central+1),y,.012,width,h,.047,'stone',1.015);});
}
function buildSeokgatap(materials){
 const b=new StoneBuilder(materials);let y=0;
 b.prism(square(2.46),y,.17,.025);y+=.17;
 b.prism(square(2.22),y,.71,.022,'shade',1);cornerPillars(b,2.23,y,.71,.21,2);y+=.71;
 b.prism(square(2.46),y,.18,.022);y+=.18;
 // Sloping cap, restrained and straight, with one shallow beveled lip.
 const cap=(r,inner,y)=>sculptRoof(b,square(r),inner,y,.035,.15,.014,false);
 cap(2.44,.78,y);y+=.185;
 b.prism(square(1.77),y,.081,.012);y+=.081;
 const upper=y;
 b.prism(square(1.76),y,1.10,.020,'shade');cornerPillars(b,1.765,y,1.10,.18,2);y+=1.10;
 b.prism(square(1.97),y,.17,.018);y+=.17;cap(1.95,.71,y);y+=.185;
 b.prism(square(1.20),y,.075,.012);y+=.075;b.parts.push({name:'2단 기단',y:(upper+y)/2});
 const levels=[[1.03,1.34,1.86,.36],[.88,.59,1.63,.34],[.75,.50,1.41,.31]];
 for(let floor=0;floor<3;floor++){
  const[r,h,roofR,rise]=levels[floor];
  b.prism(square(r),y,h,.014,'stone');cornerPillars(b,r+.006,y,h,.125,0);b.parts.push({name:`${floor+1}층 몸돌`,y:y+h/2});y+=h;
  // Exactly five steps beneath every roof, each wider toward the eave.
  for(let step=0;step<5;step++){const sr=r+.05+(roofR-r-.25)*(step/4);b.prism(square(sr),y,.068,.007,'shade',.99);y+=.068;}
  const roofY=y;sculptRoof(b,square(roofR),.47,y,.13,rise,.068,false);y+=.13+rise;
  b.parts.push({name:`${floor+1}층 지붕돌`,y:roofY+.16,steps:5});
  b.prism(square(r*.80),y,.063,.009);y+=.063;
 }
 const finialStart=y;
 // 노반 → 복발 → 앙화 → 보륜 → 보개 → 수연 → 용차 → 보주. 찰주 runs through all.
 b.prism(square(.405),y,.23,.018);y+=.23;
 b.lathe([[0,0],[.33,0],[.37,.045],[.34,.13],[.25,.24],[.09,.28],[0,.28]],y);y+=.28;
 lotus(b,.39,y,.29,16);y+=.29;
 b.lathe([[.052,0],[.052,2.35],[0,2.35]],y,'metal',24);
 for(let i=0;i<3;i++){
  const r=.39-i*.035;
  b.lathe([[.065,0],[.14,.02],[r*.87,.045],[r,.09],[r*.94,.14],[.14,.17],[.065,.18]],y,'stone',56);y+=.26;
 }
 b.lathe([[.064,0],[.22,.018],[.43,.047],[.46,.09],[.37,.16],[.22,.23],[.07,.26]],y);y+=.28;
 // Four pierced flame leaves (수연) keep negative space visible in silhouette.
 for(let i=0;i<4;i++){
  const a=i*PI/2,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(.075,0,0),new THREE.Vector3(.29,.17,0),new THREE.Vector3(.26,.39,0),new THREE.Vector3(.11,.54,0),new THREE.Vector3(.075,.24,0)]);
  const g=new THREE.TubeGeometry(curve,22,.035,7,false);g.rotateY(a);b.add(g,[0,y,0]);g.dispose();
 }
 y+=.52;
 b.lathe([[0,0],[.07,0],[.13,.06],[.15,.13],[.11,.21],[.06,.26],[0,.26]],y);y+=.29;
 b.lathe([[0,0],[.09,0],[.145,.075],[.13,.15],[.07,.23],[0,.33]],y);y+=.33;
 b.lathe([[.025,0],[.02,.23],[0,.25]],y,'metal',20);y+=.25;
 b.parts.push({name:'상륜부',y:(finialStart+y)/2});return b.finish('불국사 삼층석탑',10.75);
}
function auditModel(root){
 const box=new THREE.Box3().setFromObject(root);let triangles=0,invalid=0,maxTexture=0;
 root.traverse(m=>{if(!m.isMesh)return;const g=m.geometry;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;
  for(const attr of Object.values(g.attributes))for(const x of attr.array)if(!Number.isFinite(x))invalid++;
  if(g.index)for(const x of g.index.array)if(x>=g.attributes.position.count)invalid++;
  for(const key of['map','normalMap','roughnessMap']){const t=m.material[key];if(t&&t.image)maxTexture=Math.max(maxTexture,t.image.width||0,t.image.height||0);}
 });
 if(invalid||triangles>300000||Math.abs(box.max.y-root.userData.height)>.001||maxTexture>512)throw new Error(root.name+' 형상 검증 실패');
 return{triangles,drawCalls:root.children.length,height:box.max.y,width:box.max.x-box.min.x,depth:box.max.z-box.min.z,invalid,maxTexture};
}

function seededRandom(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function periodicNoise(x,y){return .40*Math.sin(x*TAU+Math.sin(y*TAU)*1.6)+.24*Math.sin(y*TAU*3+x*TAU*2)+.12*Math.cos(x*TAU*11-y*TAU*7);}
function stoneTextures(granite){
 const N=512,rand=seededRandom(granite?6847:1467),height=new Float32Array(N*N),color=new Uint8ClampedArray(N*N*4),rough=new Uint8ClampedArray(N*N*4),normal=new Uint8ClampedArray(N*N*4);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const i=y*N+x,u=x/N,v=y/N,noise=periodicNoise(u,v),grain=rand(),speck=grain>.973?-30:grain<.025?17:0;
  const vein=Math.exp(-Math.pow(Math.sin(TAU*(u*3+v*2)+.8*Math.sin(v*TAU*3))/.115,2));
  const cloud=granite?noise*9:noise*8-vein*10,tone=granite?(grain-.5)*19+speck+cloud:(grain-.5)*6+cloud;
  const rgb=granite?[207,198,181]:[230,227,219];   // (2026-10-11 행님: 지금 지도 색에 맞춘다 — 원각사지 #E6E3DB · 석가탑 #CFC6B5)
  for(let c=0;c<3;c++)color[i*4+c]=rgb[c]+tone;color[i*4+3]=255;
  const r=granite?211+grain*25:190+grain*25+vein*12;rough[i*4]=rough[i*4+1]=rough[i*4+2]=r;rough[i*4+3]=255;
  height[i]=granite?(grain-.5)*.6+speck*.015+noise*.05:(grain-.5)*.15+noise*.14-vein*.08;
 }
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const i=y*N+x,dx=height[y*N+(x+1)%N]-height[y*N+(x+N-1)%N],dy=height[((y+1)%N)*N+x]-height[((y+N-1)%N)*N+x];
  const len=Math.hypot(dx,dy,1);normal[i*4]=128-dx/len*100;normal[i*4+1]=128-dy/len*100;normal[i*4+2]=128+127/len;normal[i*4+3]=255;
 }
 function texture(data,srgb){const canvas=document.createElement('canvas');canvas.width=canvas.height=N;canvas.getContext('2d').putImageData(new ImageData(data,N,N),0,0);const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.LinearEncoding;/* 지도 셰이더들처럼 색을 그대로(감마 변환 없이) */t.anisotropy=4;return t;}
 return{map:texture(color,true),normalMap:texture(normal,false),roughnessMap:texture(rough,false)};
}
function reliefNormal(){
 const N=256,data=new Uint8Array(N*N*4);for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const u=x/(N-1),v=1-y/(N-1),d=1/N,dx=(reliefHeight(u+d,v)-reliefHeight(u-d,v))*18,dy=(reliefHeight(u,v+d)-reliefHeight(u,v-d))*18,l=Math.hypot(dx,dy,1),i=(y*N+x)*4;
  data[i]=128-dx/l*127;data[i+1]=128-dy/l*127;data[i+2]=128+127/l;data[i+3]=255;
 }const t=new THREE.DataTexture(data,N,N,THREE.RGBAFormat);t.flipY=true;t.needsUpdate=true;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;return t;
}

function reliefMaterial(base) { return new THREE.MeshStandardMaterial({ color: base, normalMap: reliefNormal(), normalScale: new THREE.Vector2(.55, .55), roughness: .91, metalness: 0, vertexColors: true, side: THREE.DoubleSide }) }
function makeMaterials() {
  const marble = stoneTextures(false), granite = stoneTextures(true);
  const stone = tex => new THREE.MeshStandardMaterial({ ...tex, color: 0xffffff, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(.34, .34), vertexColors: true, side: THREE.DoubleSide });
  const wm = stone(marble), sm = stone(granite), ws = wm.clone(), ss = sm.clone(); ws.color.setHex(0xd8dad6); ss.color.setHex(0xe2ddd2);   // 오목한 면 · 받침(조금 어둡게)
  const metal = new THREE.MeshStandardMaterial({ color: 0x6e6554, roughness: .85, metalness: .15, vertexColors: true, side: THREE.DoubleSide });
  return { wongaksa: { stone: wm, shade: ws, relief: reliefMaterial(0xd2d2cc) }, seokga: { stone: sm, shade: ss, metal } };
}

// 그리는 쪽: landmarks.mjs 가 탑마다 모델 → 지도 행렬(M, 열 우선 16)과 빛을 준다
export class Stupa3D {
  init(gl) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: gl.canvas, context: gl, antialias: false });
    r.autoClear = false; r.outputEncoding = THREE.LinearEncoding; r.toneMapping = THREE.NoToneMapping; r.shadowMap.enabled = false; r.setPixelRatio(1);
    this.mats = makeMaterials(); this.models = {};
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb8b8b8, .64); this.sun = new THREE.DirectionalLight(0xffffff, .36); this.sun.target.position.set(0, 0, 0);
    this.spot = new THREE.SpotLight(0xffcc94, 0, 0, .55, .7, 1); this.warm = new THREE.AmbientLight(0xffd9a8, 0);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.spot, this.spot.target, this.warm);
  }
  // 그 모델을 짓는다(화면에 들어왔을 때 한 번 — 원각사지는 삼각형 약 30만, 짓는 데 0.5초 안팎)
  build(k) {
    if (this.models[k]) return;
    const m = k === 'wongaksa' ? buildWongaksa(this.mats.wongaksa) : buildSeokgatap(this.mats.seokga);
    m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false } });
    m.visible = false; this.scene.add(m); this.models[k] = m;
    for (const g of geometryCache.values()) g.dispose(); geometryCache.clear();
  }
  has(kind) { return !!this.models[kind] }
  // items: [{kind, M: Float32Array(16) 모델(m, Y 위) → 화면, H: 그린 높이(m)}], light: 해 방향(모델 축: x 동 · y 위 · z 남), lit: [하늘, 해]
  render(gl, items, { light, lit, dark }) {
    const r = this.renderer; r.resetState(); r.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.hemi.intensity = lit[0] * (dark ? .45 : 1); this.sun.intensity = lit[1] * (dark ? .45 : 1); this.sun.position.set(light[0], light[1], light[2]);
    this.warm.intensity = dark ? .05 : 0;
    for (const it of items) {
      const m = this.models[it.kind]; if (!m) continue;
      for (const k in this.models) this.models[k].visible = k === it.kind;
      // 밤: 아래에서 비추는 따뜻한 문화재 조명(모델 높이 기준, 그린 크기와 상관없이 같은 모습)
      const h = m.userData.height; this.spot.intensity = dark ? 1.1 : 0; this.spot.distance = h * 1.8; this.spot.position.set(h * .35, h * .02, h * .45); this.spot.target.position.set(0, h * .55, 0);
      this.camera.projectionMatrix.fromArray(it.M); this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
      r.render(this.scene, this.camera);
    }
    r.resetState();
  }
  dispose() {
    const seen = new Set(); this.scene?.traverse(o => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose() } if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mt of ms) { for (const v of Object.values(mt)) if (v && v.isTexture) v.dispose(); mt.dispose() } } });
    this.renderer?.dispose(); this.models = {}; this.scene = null;
  }
}
export { buildWongaksa, buildSeokgatap };
