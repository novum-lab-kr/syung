// 열차 그리기: 실시간 열차를 열차 캔버스(지도 위 따로 둔 GL)에 칸 · 그림자 · 전조등 · 고른 열차 물결로, 모드 코드가 오면 롤코 칸 · 거북선 · 1인칭 레일까지.
// 건물 깊이(BuildingDepth): 열차가 건물 뒤에서 가려 보이게, 심시티 · 롤코 건물 벽 깊이만 같은 캔버스에 먼저 쓴다.
// 다른 화면 파일을 import 하지 않는다: 열차 자리 · 치수 함수는 본체가 넘기고, 바뀌는 값(모드 · 따라가기 · 탄 열차 · 해 그림자 · 모드 코드 클래스)은
// live.<이름> getter 로 그때그때 읽는다(생성 때 복사하지 않는다). lastPose 는 본체의 같은 Map.
// Stainless Korean EMUs: a quiet cab-led icon grows into rigid chord-aligned cars.
// Pixel-sized details fade in with car length; no textures, depth buffer or bent bodies.
const TRAIN_VS=`#version 300 es
in vec3 a_pos;in vec2 a_local;in vec4 a_info;in vec3 a_color;in float a_face;
uniform mat4 u_matrix;uniform vec2 u_offset;uniform float u_shadow;
out vec2 v_local;flat out vec4 v_info;flat out vec3 v_color;flat out float v_face;
void main(){v_local=a_local;v_info=a_info;v_color=a_color;v_face=a_face;
  bool beam=a_face>5.5;   // headlight beam and selection ripple keep their own height in the ground pass and ignore the sun offset
  gl_Position=u_matrix*vec4(a_pos.xy+(beam?vec2(0.):u_offset),beam||u_shadow<.5?a_pos.z:0.,1.);}`;
const TRAIN_FS=`#version 300 es
precision highp float;
in vec2 v_local;flat in vec4 v_info;flat in vec3 v_color;flat in float v_face;
uniform float u_shadow,u_glow,u_time,u_alpha;out vec4 outColor;
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float ink(float d){float a=max(.18,fwidth(d)*.65);return 1.-smoothstep(-a,a,d);}
float rect(vec2 p,vec2 c,vec2 b){return ink(box(p-c,b));}
float stroke(float d,float w){return ink(abs(d)-w);}
void shade(){
  float L=v_info.x,W=v_info.y,kind=mod(v_info.z,4.),carPx=v_info.w,H=W*.68;
  bool front=mod(kind,2.)>.5,back=kind>1.5;
  vec2 p=v_local;vec3 col;float alpha=1.;
  float endX=min(back?p.x:1e5,front?L-p.x:1e5);
  bool lead=front&&L-p.x<=endX+.001;   // nearer the running end → the cab that leads
  float nose=W*.48,halfW=W*.5;
  float localL=carPx>0.?carPx:L;
  float detail=smoothstep(W*1.1,W*2.5,localL);
  // Rounded cab corners only: inter-car ends remain square. Signed distance in pixels.
  float radius=W*.36;
  vec2 cab=vec2(radius-endX,abs(p.y)-(halfW-radius));
  float rounded=length(max(cab,0.))+min(max(cab.x,cab.y),0.)-radius;
  float edge=max(max(-p.x,p.x-L),max(abs(p.y)-halfW,rounded));
  if(v_face>6.5){
    // selected train: one calm line-colour pulse, like the my-location pulse, under every train body
    if(u_shadow<.5)discard;
    float R=W*3.4,d=length(p),k=clamp(fract(u_time/2.4)/.75,0.,1.),r=mix(W*.7,R,1.-(1.-k)*(1.-k)),fade=1.-k;
    float a=(1.-smoothstep(r-1.5,r+.5,d))*fade*.36+ink(abs(d-r)-1.)*fade*.22;
    outColor=vec4(v_color*a,a);return;
  }
  if(v_face>5.5){
    // headlight beam on the ground ahead of the leading cab, drawn with the ground shadows
    if(u_shadow<.5)discard;
    // two cones, one from each headlight, spreading slightly outward
    float len=W*3.4,u=p.x/len,yc=W*.27*(1.+.8*u),hw=W*(.09+.5*u);
    float cone=max(1.-smoothstep(.35,1.,abs(p.y-yc)/hw),1.-smoothstep(.35,1.,abs(p.y+yc)/hw));
    float a=pow(1.-u,1.6)*cone*u_glow*(1.+.8*(1.-smoothstep(0.,.12,u)));   // brightest right at the lamps
    outColor=vec4(vec3(1.,.95,.78)*a,a*.8);return;
  }
  if(u_shadow>.5){if(v_face>.5)discard;float a=(1.-smoothstep(-.4,2.4,edge))*.22;outColor=vec4(vec3(.09,.13,.16)*a,a);return;}
  if(v_face<.5){
    alpha=ink(edge);if(alpha<=0.)discard;
    float ay=abs(p.y),x=carPx>0.?mod(p.x,carPx):p.x;
    col=mix(vec3(.88,.91,.92),vec3(.60,.66,.70),smoothstep(W*.24,halfW,ay));
    // Raised roof shoulder and a continuous line-colour cant rail remain legible from above.
    col=mix(col,vec3(.97,.98,.98),stroke(ay-(halfW-1.9),.20));
    col=mix(col,v_color,ink(abs(ay-(halfW-.95))-.70));
    // Roof-edge glimpses of the window/door rhythm, never a stretched bitmap.
    float pitch=localL/4.,door=abs(mod(x+pitch*.5,pitch)-pitch*.5);
    float rim=ink(abs(ay-(halfW-.26))-.25);
    col=mix(col,door<min(1.1,pitch*.16)?vec3(.72,.78,.80):vec3(.12,.23,.28),rim*detail);
    vec3 cleanRoof=col;
    if(detail>0.){
      // Two low-profile air-conditioning packs with end grilles and a circular fan.
      float cx=x<localL*.5?localL*.29:localL*.71;
      vec2 q=vec2(x-cx,p.y);vec2 size=vec2(min(5.7,localL*.105),W*.235);
      col=mix(col,vec3(.46,.53,.57),rect(q,vec2(.35,.4),size+vec2(.35)));
      col=mix(col,vec3(.75,.80,.82),rect(q,vec2(0),size));
      float unitMask=rect(q,vec2(0),size-vec2(.65));
      float grille=stroke(mod(q.x+30.,1.45)-.725,.17);
      col=mix(col,vec3(.43,.52,.57),unitMask*grille*.8);
      float fan=length(q-vec2(-size.x*.35,0.));
      col=mix(col,vec3(.61,.68,.71),ink(fan-W*.135));
      col=mix(col,vec3(.36,.44,.49),stroke(fan-W*.115,.2));
      col=mix(col,vec3(.35,.43,.47),ink(fan-.4));
      // Longitudinal ribs and central roof hatch.
      col=mix(col,vec3(.66,.72,.75),stroke(ay-W*.29,.17));
      col=mix(col,vec3(.66,.72,.75),rect(vec2(x,p.y),vec2(localL*.5,0),vec2(1.5,W*.18))*.75);
      if(v_info.z>3.5){
        vec2 q=vec2(x-localL*.5,p.y);float diamond=abs(q.x)/2.8+abs(q.y)/2.;
        col=mix(col,vec3(.23,.29,.32),stroke(diamond-1.,.16));
        col=mix(col,vec3(.19,.24,.27),rect(q,vec2(0),vec2(.4,W*.29)));
      }
    }
    col=mix(cleanRoof,col,detail);
    float hatch=smoothstep(W*.75,W*1.3,localL)*(1.-detail);
    col=mix(col,vec3(.68,.75,.78),rect(vec2(x,p.y),vec2(localL*.5,0),vec2(localL*.16,W*.16))*hatch*.55);
    // At icon scale seams stop at the shoulders; no transverse ladder rungs.
    if(carPx>0.&&p.x>nose+1.&&p.x<L-nose-1.){
      float joint=abs(mod(p.x+carPx*.5,carPx)-carPx*.5);
      float seams=smoothstep(W*.8,W*1.5,carPx);
      float shoulder=smoothstep(W*.22,W*.36,ay);
      col=mix(col,vec3(.40,.49,.53),ink(joint-.25)*seams*mix(shoulder,.55,detail));
    }
    if(endX<nose+.7){
      vec3 body=col;
      if(lead){
        // Leading cab: coloured nose apron, sloping dark glass, destination display, bright headlights.
        col=mix(v_color,vec3(.82,.88,.89),.10);
        float glass=rect(vec2(endX,p.y),vec2(nose*.66,0),vec2(nose*.24,W*.32));
        col=mix(col,vec3(.055,.13,.18),glass);
        col=mix(col,vec3(.30,.43,.49),glass*rect(vec2(endX,p.y),vec2(nose*.73,-W*.13),vec2(.28,W*.18)));
        col=mix(col,vec3(.12,.19,.23),stroke(p.y,.16)*glass*detail);
        col=mix(col,vec3(.96,.66,.20),rect(vec2(endX,p.y),vec2(nose*.89,0),vec2(.22,W*.12))*detail);
        col=mix(col,vec3(1.,.98,.82),rect(vec2(endX,abs(p.y)),vec2(nose*.22,W*.27),vec2(max(.5,nose*.12),W*.09)));
      }else{
        // Tail: plain stainless end, narrow rear window, large red tail lights.
        col=mix(body,vec3(.80,.85,.87),.35);
        col=mix(col,vec3(.14,.22,.27),rect(vec2(endX,p.y),vec2(nose*.62,0),vec2(nose*.14,W*.22)));
        col=mix(col,vec3(.95,.12,.10),rect(vec2(endX,abs(p.y)),vec2(nose*.22,W*.27),vec2(max(.5,nose*.12),W*.09)));
      }
      col=mix(body,col,1.-smoothstep(nose-.15,nose+.55,endX));
    }
    col=mix(col,vec3(.24,.32,.36),1.-ink(max(abs(p.y)-halfW,rounded)+.34));
  }else if(v_face<1.5){
    // Local x follows the rigid car, local y is actual height. Four double sliding doors.
    float z=p.y,localL=carPx>0.?carPx:L,x=carPx>0.?mod(p.x,carPx):p.x;
    col=mix(vec3(.51,.59,.63),vec3(.81,.85,.86),z/H);
    col=mix(col,vec3(.17,.23,.26),1.-smoothstep(1.,1.45,z));
    float pitch=localL/4.,cell=mod(x,pitch)-pitch*.5;
    float doorW=min(W*.45,localL*.083),door=abs(cell);
    float windowBand=rect(vec2(x,z),vec2(localL*.5,H*.69),vec2(localL*.5-.9,H*.165));
    col=mix(col,vec3(.12,.23,.29),windowBand);
    // Silver window pillars split the passenger glazing into individual panes.
    float pillar=ink(abs(abs(cell)-pitch*.34)-.32);
    col=mix(col,vec3(.68,.75,.78),windowBand*pillar);
    col=mix(col,vec3(.37,.51,.58),windowBand*ink(abs(z-H*.79)-.25)*.75);
    col=mix(col,v_color,ink(abs(z-H*.39)-H*.085));
    float doorMask=rect(vec2(cell,z),vec2(0,H*.52),vec2(doorW*.5,H*.37));
    col=mix(col,vec3(.43,.52,.56),doorMask);
    col=mix(col,vec3(.78,.83,.84),rect(vec2(cell,z),vec2(0,H*.52),vec2(max(.2,doorW*.5-.38),H*.37-.28)));
    col=mix(col,v_color,doorMask*ink(abs(z-H*.39)-H*.085));
    float doorGlass=rect(vec2(abs(cell),z),vec2(doorW*.25,H*.70),vec2(max(.15,doorW*.18),H*.12));
    col=mix(col,vec3(.09,.21,.27),doorGlass);
    col=mix(col,vec3(.34,.43,.47),doorMask*stroke(cell,.17));
    col=mix(col,vec3(.93,.95,.95),ink(abs(z-(H-.30))-.23));
    col=mix(col,vec3(.40,.49,.54),ink(abs(z-1.75)-.15));
    if(endX<nose+1.){
      if(lead){   // coloured cab sides only at the leading end
        col=mix(vec3(.67,.74,.77),v_color,ink(abs(z-H*.39)-H*.085));
        col=mix(col,v_color,.55*(1.-smoothstep(H*.55,H*.6,z)));
        col=mix(col,vec3(.08,.19,.25),rect(vec2(endX,z),vec2(nose*.9,H*.72),vec2(nose*.52,H*.16)));
      }else col=mix(col,vec3(.08,.19,.25),rect(vec2(endX,z),vec2(nose*.9,H*.72),vec2(nose*.3,H*.12)));
      if(z<1.4)col=vec3(.16,.22,.25);
    }
    vec3 simpleSide=mix(vec3(.65,.72,.75),v_color,ink(abs(z-H*.45)-H*.15));
    simpleSide=mix(simpleSide,vec3(.13,.24,.29),ink(abs(z-H*.74)-H*.13));
    col=mix(simpleSide,col,detail);
    if(carPx>0.)col=mix(col,vec3(.34,.42,.46),ink(min(x,carPx-x)-.25)*detail);
  }else if(v_face<3.5){
    // End wall under the raked windscreen: coloured mask, lights, coupler and anti-climber.
    float z=p.y;col=v_face<2.5?mix(v_color,vec3(.12,.20,.24),.14):vec3(.74,.80,.82);   // coloured mask at the front, stainless at the tail
    col=mix(col,vec3(.73,.79,.81),ink(abs(z-1.6)-.5));
    col=mix(col,vec3(.13,.19,.23),1.-smoothstep(.6,1.1,z));
    vec3 lamp=v_face<2.5?vec3(1.,.98,.80):vec3(1.,.12,.09);
    col=mix(col,vec3(.13,.20,.23),rect(vec2(abs(p.x),z),vec2(W*.31,H*.33),vec2(1.05,.85)));
    col=mix(col,lamp,rect(vec2(abs(p.x),z),vec2(W*.31,H*.33),vec2(.9,.6)));
    col=mix(col,vec3(.15,.21,.24),rect(p,vec2(0,.85),vec2(.9,.5)));
  }else if(v_face>4.5){
    col=vec3(.55,.63,.67);
    col=mix(col,vec3(.16,.22,.25),rect(p,vec2(0,H*.47),vec2(W*.30,H*.40)));
    col=mix(col,vec3(.34,.41,.44),stroke(abs(p.x)-W*.25,.2));
  }else{
    // Recessed rubber bellows; fine ribs distinguish the joint from an empty gap.
    col=mix(vec3(.17,.23,.26),vec3(.38,.44,.47),stroke(mod(p.x+30.,.85)-.425,.14));
  }
  outColor=vec4(col*alpha,alpha);
}
// u_alpha: a train behind a building shows through it like through the map's translucent buildings
void main(){shade();outColor*=u_alpha;}`;
const NOSE_Z=.3;   // the leading nose slopes down to (almost) the ground, so the headlights meet their beam
export function trainLayerClass({map,JOSEON_STYLE,planner,coasterBodyPx,bodyWidthPx,TRAIN_MIN_PX,cityViaduct,laneOffsetPx,maplibregl,trainPose,trackPoint,mercStop,blendShift,lastPose,toRide,hexRGB,colors,fromRide,coasterCarFrame,smooth,sunPosition,followSoon,trainFrameSoon,TRAIN_FPS,live}){
  class TrainLayer{
    constructor(){
      this.id='webgl-trains';this.type='custom';this.renderingMode='3d';
      // Reuse the staging array and matrix: no JS vertex arrays or per-vertex objects each frame.
      this.data=new Float32Array(131072);this.matrix=new Float32Array(16);this.rgb=new Map();
      this.rideTrack=this.c88ride=this.c88=this.ships=this.units=null;   // 모드 코드가 오면 kit(look) 이 지금 모양에 쓰는 것만 만든다
    }
    // 모드 코드가 온 뒤, 지금 열차 모양(trains.look)에 쓰는 것만: coaster88 — 롤코 1인칭 레일 · 침목, 내가 탄 칸(맨 마지막에 깊이를 비우고 따로 —
    // drawTrains 끝), 88열차(서울 팩의 train.coaster88) / fleet — 조선 모드의 배 선단(열차 한 대 = 배 몇 척, 공중 수로 위). 안 쓰는 모양의 GL 은 치운다
    kit(look){
      if(!live.kitReady||!this.gl)return;const gl=this.gl;
      if(look==='coaster88'&&!this.c88){this.rideTrack=new live.RideTrack();this.c88ride=new live.CoasterTrain();this.c88=new live.CoasterTrain();this.c88.init(gl);this.c88ride.init(gl)}
      if(look!=='coaster88'&&this.c88){this.c88.dispose(gl);this.c88ride.dispose(gl);this.rideTrack.dispose(gl);this.c88=this.c88ride=this.rideTrack=null;live.CoasterTrain.last=null}
      if(look==='fleet'&&!this.ships){this.ships=new live.TurtleShips(JOSEON_STYLE.train?.turtleShip);this.ships.init(gl)}
      if(look!=='fleet'&&this.ships){this.ships.dispose(gl);this.ships=null;live.TurtleShips.last=null}
      if(look==='units'&&!this.units){this.units=new live.UnitConvoy();this.units.init(gl)}   // 스타크래프트: 유닛 행렬
      if(look!=='units'&&this.units){this.units.dispose(gl);this.units=null;live.UnitConvoy.last=null}
    }
    onAdd(map,gl){
      this.map=map;
      const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
      this.p=gl.createProgram();const vs=sh(gl.VERTEX_SHADER,TRAIN_VS),fs=sh(gl.FRAGMENT_SHADER,TRAIN_FS);
      gl.attachShader(this.p,vs);gl.attachShader(this.p,fs);gl.linkProgram(this.p);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(this.p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.p));
      this.b=gl.createBuffer();
      this.attr=Object.fromEntries(['a_pos','a_local','a_info','a_color','a_face'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
      this.uni=Object.fromEntries(['u_matrix','u_offset','u_shadow','u_glow','u_time','u_alpha'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
      this.gl=gl;this.kit(live.settings.trains.look);   // coaster-train: (모드 코드가 왔으면)
    }
    vertex(x,y,z,u,v,face){
      if(this.used+13>this.data.length){const larger=new Float32Array(this.data.length*2);larger.set(this.data);this.data=larger}
      const d=this.data,i=this.used,c=this.color;this.used+=13;
      d[i]=x-this.ox;d[i+1]=y-this.oy;d[i+2]=z;d[i+3]=u;d[i+4]=v;
      d[i+5]=this.length;d[i+6]=this.width;d[i+7]=this.kind;d[i+8]=this.carPx;
      d[i+9]=c[0];d[i+10]=c[1];d[i+11]=c[2];d[i+12]=face;
    }
    corner(x,y,z,u,v,face){
      // on the coaster each car has its own frame (fr: base, F along it, R across, U its up), so it climbs and turns over in the loop
      const f=this.fr;if(f){const X=x*this.unit,Y=y*this.unit,Z=z*this.unit;this.vertex(f[0]+f[3]*X+f[6]*Y+f[9]*Z,f[1]+f[4]*X+f[7]*Y+f[10]*Z,f[2]+f[5]*X+f[8]*Y+f[11]*Z,u,v,face);return}
      this.vertex(this.cx+(this.tx*x-this.ty*y)*this.unit,this.cy+(this.ty*x+this.tx*y)*this.unit,z*this.unit+this.h0,u,v,face);   // city-life: + h0 (the deck's height in 심시티, else 0)
    }
    // Roof strip with a sloped height at either end (also used for gangway caps).
    roof(a,b,za,zb,w,face=0){
      this.corner(a,-w,za,a,-w,face);this.corner(a,w,za,a,w,face);this.corner(b,w,zb,b,w,face);
      this.corner(a,-w,za,a,-w,face);this.corner(b,w,zb,b,w,face);this.corner(b,-w,zb,b,-w,face);
    }
    wall(a,b,za,zb,y,face=1,yb=y){
      this.corner(a,y,.65,a,.65,face);this.corner(b,yb,.65,b,.65,face);this.corner(b,yb,zb,b,zb,face);
      this.corner(a,y,.65,a,.65,face);this.corner(b,yb,zb,b,zb,face);this.corner(a,y,za,a,za,face);
    }
    // Side facets follow the same rounded outline as the roof's pixel-space mask.
    cabWall(front,side,H,low=H*.44){
      const W=this.width,r=W*.36,nose=W*.48;
      let x=0,y=W*.5-r,z=low;
      for(let i=1;i<=4;i++){
        const t=i/4,xx=r*(1-Math.cos(t*Math.PI/2)),yy=W*.5-r+r*Math.sin(t*Math.PI/2),zz=low+(H-low)*xx/nose;
        this.wall(front?this.length-x:x,front?this.length-xx:xx,z,zz,side*y,1,side*yy);
        x=xx;y=yy;z=zz;
      }
      this.wall(front?this.length-r:r,front?this.length-nose:nose,z,H,side*W*.5);
    }
    // Selection ripple: a square on the ground centred on (x,y) in world units, radius R px.
    ripple(x,y,R){
      this.cx=x;this.cy=y;this.tx=1;this.ty=0;
      this.corner(-R,-R,.2,-R,-R,7);this.corner(R,-R,.2,R,-R,7);this.corner(R,R,.2,R,R,7);
      this.corner(-R,-R,.2,-R,-R,7);this.corner(R,R,.2,R,R,7);this.corner(-R,R,.2,-R,R,7);
    }
    // Headlight beams: a flat quad on the ground from the nose forward; the shader draws one cone per lamp.
    // It lies on the ground from the nose tip, where the headlights sit.
    beam(L,w){
      const len=this.width*3.4,w0=w*.8,w1=w*2.3,zl=.3,zg=.3;
      this.corner(L,-w0,zl,0,-w0,6);this.corner(L,w0,zl,0,w0,6);this.corner(L+len,w1,zg,len,w1,6);
      this.corner(L,-w0,zl,0,-w0,6);this.corner(L+len,w1,zg,len,w1,6);this.corner(L+len,-w1,zg,len,-w1,6);
    }
    end(x,w,z,face){
      this.corner(x,-w,.65,-w,.65,face);this.corner(x,w,.65,w,.65,face);this.corner(x,w,z,w,z,face);
      this.corner(x,-w,.65,-w,.65,face);this.corner(x,w,z,w,z,face);this.corner(x,-w,z,-w,z,face);
    }
    render(gl,options){
      this.kit(live.settings.trains.look);   // 안 쓰는 모양의 GL 은 그릴 열차가 없어도 치운다(모드를 나간 뒤)
      if(!live.myLocation&&(!live.trainsEnabled||!planner.plans.length)&&!(live.settings.sky?.units?.length&&live.SkyUnits)){if(this.sky&&this.gl){this.sky.dispose(this.gl);this.sky=null}return}   // (스타크래프트 하늘은 열차가 없어도 — 밤에도 난다)
      const drawTrainsToo=live.trainsEnabled&&!live.subwayOff;   // bus: 버스 노선을 고른 동안은 열차를 그리지 않는다
      // 지금 모드 설정: 열차 모양(look) · 굵기(body), 선로 종류(K — 고가 · 롤코 길)
      const S=live.settings,K=S.track.kind,look=S.trains.look,c88=look==='coaster88';
      const zoom=map.getZoom(),unit=1/(512*2**zoom),bodyPx=S.trains.body==='slim'?coasterBodyPx(zoom):bodyWidthPx(zoom),MIN_PX=TRAIN_MIN_PX,MARGIN=3;   // city-life: 심시티 — the slim body too (the viaduct's deck is cut to it)
      // Lane: clear of the route line (its drawn width) by a visible gap, then half a car body.
      const lanePx=K!=='ground'?cityViaduct.train(zoom,bodyPx).lanePx:laneOffsetPx(zoom,bodyPx);   // city-life: 심시티 — no route line on the ground to keep clear of: the two lanes close up on the deck
      const view=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(view.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(view.getNorthEast()),pad=(hi.x-lo.x)*.1;
      // Keep world coordinates in double precision until subtracting the view-centre origin.
      const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),ox=O.x,oy=O.y;
      this.ox=ox;this.oy=oy;this.unit=unit;this.width=bodyPx;this.used=0;this.fr=null;this.h0=0;this.c88?.begin(ox,oy);this.c88ride?.begin(ox,oy);this.ships?.begin(ox,oy);this.units?.begin(ox,oy);   // city-life: h0 — the height the model stands at (the viaduct's deck in 심시티)   // coaster-train: this frame's 88열차 cars start empty
      const bearing=map.getBearing()*Math.PI/180,camX=-Math.sin(bearing),camY=Math.cos(bearing),pitched=map.getPitch()>.1,H=bodyPx*.68;
      let animating=false,waiting=false,rippling=false;
      // my-location pulse: the ripple, in 슝 yellow, under the trains
      if(live.myLocation&&map.getBounds().contains(live.myLocation)){const q=maplibregl.MercatorCoordinate.fromLngLat(live.myLocation);this.color=[1,.83,0];this.width=8;this.length=0;this.kind=0;this.carPx=0;this.ripple(q.x,q.y,8*3.4);this.width=bodyPx;rippling=true}
      for(const plan of drawTrainsToo?planner.plans:[]){
        const snap=live.riding(plan),pose=snap?snap.pose:trainPose(plan);if(!snap&&!live.trainShown(plan,pose.dist))continue;   // 길찾기 중에는 내가 가는 방향의 열차만(journey.mjs trainShown) — 1인칭으로 탄 열차는 늘
        const mid=trackPoint(plan,pose.dist),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits();   // 1인칭으로 탄 열차: 카메라를 놓은 그 순간의 자리
        this.h0=K==='viaduct'?mid.h:0;   // city-life: 심시티 — this train on the viaduct's deck (mid.h: the rail height there)
        // Fresh data: glide from where the old prediction had the train instead of teleporting.
        let shiftX=0,shiftY=0;
        const shift=snap?snap.shift:blendShift(plan,mid);if(shift){shiftX=shift[0];shiftY=shift[1];animating=true}
        const previous=lastPose.get(plan.id);
        if(previous){previous.x=mid.x+shiftX;previous.y=mid.y+shiftY}else lastPose.set(plan.id,{x:mid.x+shiftX,y:mid.y+shiftY});
        // off-screen test with the train's half length as margin: zoomed in, a train is longer than the screen
        const reach=pad+Math.max(plan.cars*plan.carMetres*m,MIN_PX*unit)/2+lanePx*unit;
        if(!snap&&(mid.x<lo.x-reach||mid.x>hi.x+reach||mid.y>lo.y+reach||mid.y<hi.y-reach))continue;
        if(pose.moving||snap&&trainPose(plan).moving)animating=true;else waiting=true;   // only trains on screen keep the map redrawing (탄 열차: 멈춘 순간에 그려도 지금 떠났으면 카메라를 다시 놓아요)
        const n=plan.cars,real=n*plan.carMetres*m,total=Math.max(real,MIN_PX*unit,c88?n*bodyPx*1.6*unit:0),car=total/n,tail=(K==='coaster'?toRide(plan,pose.dist):pose.dist)-total/2;   // on the coaster: car positions in ride distance
        let color=this.rgb.get(plan.t.line);if(!color){color=hexRGB(colors[plan.t.line]);this.rgb.set(plan.t.line,color)}this.color=color;
        if(plan.id===live.sheetTrain||live.journeyTrain(plan)){const o=(mid.off+lanePx)*unit;this.fr=null;this.width=bodyPx;this.length=0;this.kind=0;this.carPx=0;this.ripple(mid.x+shiftX+mid.r[0]*o,mid.y+shiftY+mid.r[1]*o,bodyPx*3.4);this.width=bodyPx;rippling=true}   // 고른 열차 · 길찾기로 탈 열차
        const P=d=>{const q=trackPoint(plan,K==='coaster'?fromRide(plan,d):d);q.x+=shiftX;q.y+=shiftY;return q};
        if(look==='fleet'){   // 조선 모드: 배 선단 — 한 척이 몸 폭의 3.6배쯤 되게 척 수를 고르고(많아야 칸 수), 배 사이는 32 % 띄운다(한 척이 길이:폭 3.4쯤)
          // 맨 앞(j = k-1)만 거북선: 길이 1.25배 · 폭 1.3배(이물 쪽으로 늘린다), 뒤는 일반 배. 노선 깃발은 맨 앞에만 (2026-10-10 덕배)
          const k=Math.max(1,Math.min(n,Math.round(total/unit/(bodyPx*3.6)))),span=total/k;
          for(let j=0;j<k;j++){const c=coasterCarFrame(P,tail,span,j,k,unit,bodyPx,lanePx,span*.32);if(!c)continue;const lead=j===k-1;
            this.ships?.ship(c.fr,lead?c.L*1.25:c.L,lead?bodyPx*1.3:bodyPx,color,pose.moving,plan.id,{kind:lead?'turtle':'boat',flag:lead,line:plan.t.line})}   // 깃발은 맨 앞 거북선 꼬리에만(2026-10-10 덕배)
          continue}
        if(look==='units'){   // 스타크래프트: 유닛 행렬 — 맨 앞에 lead 한 마리(제 길이의 1.15배 칸), 남은 길이에 rest 를 제 길이의 1.25배 간격으로(많아야 12)
          const U=S.trains.units,LW=bodyPx*unit,lead=live.unitLength(U.lead)*LW*1.15,step=live.unitLength(U.rest)*LW*1.25;
          const r=Math.max(0,Math.min(12,Math.floor((total-lead)/step))),span=r?(total-lead)/r:0,head=tail+total-Math.min(total,lead);
          const one=(d0,len,kind,j)=>{const c=coasterCarFrame(P,d0,len,0,1,unit,bodyPx,lanePx,0);if(c)this.units?.unit(c.fr,c.L,bodyPx,kind,color,pose.moving,plan.id+':'+j)};
          one(head,Math.min(total,lead),U.lead,0);
          for(let j=0;j<r;j++)one(tail+j*span,span,U.rest,j+1);
          continue}
        const ratio=car/unit/bodyPx,separate=c88||ratio>=1.5;   // on the coaster: always car by car, so the train bends over the hills
        const unfold=c88?1:smooth(Math.max(0,Math.min(1,(ratio-1.5)/.9))),gap=1.4*unit*unfold;
        const start=P(tail),finish=P(tail+total);
        // 심시티: at the LOD boundary, car chords coincide with the compact icon's chord, then articulate.
        // 기본 모드: 칸 끝은 늘 선로 위 점(P(d))에 둔다 — 곡선에서 곧은 막대로 모으지 않는다. 틈 · 지붕 이음만 unfold 로 자란다.
        const follow=K==='viaduct'?unfold:1;
        const articulated=(d)=>{
          const q=P(d),t=(d-tail)/total;
          q.x=(start.x+(finish.x-start.x)*t)*(1-follow)+q.x*follow;
          q.y=(start.y+(finish.y-start.y)*t)*(1-follow)+q.y*follow;
          q.h=(start.h+(finish.h-start.h)*t)*(1-follow)+q.h*follow;
          return q;
        };
        // 기본 모드 낮은 줌: 칸이 짧으면 몇 칸을 한 마디(몸 폭 0.8배 이상)로 묶어 휘게 그린다
        const bends=K!=='ground'?1:Math.max(1,Math.min(n,Math.floor(total/unit/(bodyPx*.8))));
        if(separate){
          // Painter order follows camera ground direction; no hidden back wall can bleed through.
          const forward=mid.f[0]*camX+mid.f[1]*camY>=0;
          for(let k=0;k<n;k++){
            const j=forward?k:n-1-k;
            if(c88){const c=coasterCarFrame(P,tail,car,j,n,unit,bodyPx,lanePx,gap);if(c){this.fr=c.fr;(snap&&snap.j===j?this.c88ride:this.c88)?.car(c.fr,c.L,bodyPx,color,j===n-1,j===0,plan.id,j,plan.t.line,snap&&snap.j===j?snap.k:-1)}continue}   // coaster-train: route badge + stable riders on the 88열차 car; no beam or gangways (1인칭: 내 자리는 비워요)
            const A=articulated(tail+j*car+(j?gap/2:0)),B=articulated(tail+(j+1)*car-(j<n-1?gap/2:0));if(K==='viaduct')this.h0=(A.h+B.h)/2;   // city-life: 심시티 — each car at the deck's height under it (on a ramp between levels the train tilts car by car)
            const dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy);if(len<unit*.1)continue;
            const gl2=Math.hypot(dx,dy)||1e-12,tx=dx/gl2,ty=dy/gl2,L=len/unit,off=((A.off+B.off)/2+lanePx)*unit;
            this.cx=A.x-ty*off;this.cy=A.y+tx*off;this.tx=tx;this.ty=ty;this.length=L;this.carPx=0;
            const side=(-ty*camX+tx*camY)>=0?1:-1;
            const back=j===0,front=j===n-1,panto=/^(1호선|4호선|경의중앙선|수인분당선)$/.test(plan.t.line)&&j%3===1;
            this.kind=(front?1:0)+(back?2:0)+(panto?4:0);
            const w=bodyPx/2,nose=bodyPx*.48,a=back?nose:0,b=front?L-nose:L,low=H*.44;
            if(j&&unfold>0){this.roof(-.7*unfold,0,H-.75,H-.75,w*.62,4);if(pitched)this.wall(-.7*unfold,0,H-.75,H-.75,side*w*.62,4)}
            if(j<n-1&&unfold>0){this.roof(L,L+.7*unfold,H-.75,H-.75,w*.62,4);if(pitched)this.wall(L,L+.7*unfold,H-.75,H-.75,side*w*.62,4)}
            // Draw only the visible end and side, then cap them with the roof and raked cab glass.
            if(pitched){
              const alongCamera=tx*camX+ty*camY;
              if(alongCamera<0)this.end(0,back?w-bodyPx*.36:w,back?low:H,back?3:5);
              if(alongCamera>0&&!front)this.end(L,w,H,5);   // the leading nose slopes to the ground: no front wall
              this.wall(a,b,H,H,side*w);
              if(back)this.cabWall(false,side,H);
              if(front)this.cabWall(true,side,H,NOSE_Z);
            }
            this.roof(a,b,H,H,w);
            if(back)this.roof(0,a,low,H,w);
            if(front){this.roof(b,L,H,NOSE_Z,w);this.beam(L,w)}
          }
        }else if(bends>1){
          // 기본 모드, 칸이 몸 폭 1.5배보다 짧을 때: 곧은 아이콘과 같은 모양 · 셰이더 칸 줄(carPx)을 마디마다 나눠 그려 선로를 따라 휜다.
          // 마디 끝은 그 점의 선로 법선으로 차선만큼 띄워, 이웃 마디와 같은 점에서 만난다. 틈 · 지붕 이음은 없다(한 몸).
          const w=bodyPx/2,nose=bodyPx*.48,low=H*.44,Wm=w+MARGIN,cut=[],dir=[];
          for(let i=0;i<=bends;i++){const q=P(tail+Math.round(i*n/bends)*car),o=(q.off+lanePx)*unit;q.x+=q.r[0]*o;q.y+=q.r[1]*o;cut.push(q)}
          for(let i=0;i<bends;i++){const dx=cut[i+1].x-cut[i].x,dy=cut[i+1].y-cut[i].y,len=Math.hypot(dx,dy)||1e-30;dir.push([dx/len,dy/len,len])}
          // 이음매는 두 마디 방향의 이등분선으로 비스듬히 자른다(마이터): 겹침도 틈도 없어 반투명(건물 뒤) · 그림자에 이음 줄이 안 생긴다.
          // 기울기 = 가로 1 당 세로 끝이 밀리는 양, 꺾임 반각 60° 까지
          const slope=(t,u)=>{const s=(-t[1]*u[0]+t[0]*u[1])/(1+t[0]*u[0]+t[1]*u[1]);return Math.max(-1.73,Math.min(1.73,s||0))};
          const forward=mid.f[0]*camX+mid.f[1]*camY>=0;
          for(let k=0;k<bends;k++){
            const j=forward?k:bends-1-k,A=cut[j],[tx,ty,len]=dir[j];if(len<unit*.1)continue;
            const back=j===0,front=j===bends-1,cars=Math.round((j+1)*n/bends)-Math.round(j*n/bends),S=len/unit,carPx=S/cars;
            let sA=back?0:slope(dir[j],dir[j-1]),sB=front?0:slope(dir[j],dir[j+1]);
            const squeeze=Wm*(Math.abs(sA)+Math.abs(sB))/(S*.9);if(squeeze>1){sA/=squeeze;sB/=squeeze}   // 아주 짧은 마디: 안쪽 모서리가 엇갈리지 않게
            // 셰이더 x 원점을 칸 길이의 배수만큼 앞에 둬 칸 줄 · 해치가 마디를 넘어 이어진다. 앞머리 아닌 마디는 길이를 넉넉히 줘 끝 칸 줄도 그린다
            const c=back?0:carPx*Math.ceil((Math.max(Math.abs(sA)*Wm,nose+1)+.01)/carPx),L=front?c+S:c+S+Math.abs(sB)*Wm+nose+2;
            this.cx=A.x-tx*c*unit;this.cy=A.y-ty*c*unit;this.tx=tx;this.ty=ty;
            this.kind=(front?1:0)+(back?2:0);this.length=L;this.carPx=carPx;
            const X0=y=>back?nose:c-y*sA,X1=y=>front?L-nose:c+S-y*sB,side=(-ty*camX+tx*camY)>=0?1:-1;
            if(pitched){
              if(back&&tx*camX+ty*camY<0)this.end(0,w-bodyPx*.36,low,3);
              this.wall(X0(side*w),X1(side*w),H,H,side*w);
              if(back)this.cabWall(false,side,H);
              if(front)this.cabWall(true,side,H,NOSE_Z);
            }
            const a0=X0(-Wm),a1=X0(Wm),b0=X1(-Wm),b1=X1(Wm);
            this.corner(a0,-Wm,H,a0,-Wm,0);this.corner(a1,Wm,H,a1,Wm,0);this.corner(b1,Wm,H,b1,Wm,0);
            this.corner(a0,-Wm,H,a0,-Wm,0);this.corner(b1,Wm,H,b1,Wm,0);this.corner(b0,-Wm,H,b0,-Wm,0);
            if(back){this.roof(0,nose,low,H,Wm);this.roof(-MARGIN,0,low,low,Wm)}
            if(front){this.roof(L-nose,L,H,NOSE_Z,Wm);this.roof(L,L+MARGIN,NOSE_Z,NOSE_Z,Wm);this.beam(L,w)}
          }
        }else{
          // One rigid, rounded icon. Detail uses true consist spacing, but tiny cars
          // do not split the silhouette. Use the same chord and lane rule as rigid cars.
          const dx=finish.x-start.x,dy=finish.y-start.y,len=Math.hypot(dx,dy);
          if(len<unit*.1)continue;
          const tx=dx/len,ty=dy/len,off=((start.off+finish.off)/2+lanePx)*unit;
          this.cx=start.x-ty*off;this.cy=start.y+tx*off;this.tx=tx;this.ty=ty;
          this.kind=3;this.length=len/unit;this.carPx=this.length/n;
          const L=this.length,w=bodyPx/2,nose=Math.min(bodyPx*.48,L*.24),low=H*.44;
          const side=(-ty*camX+tx*camY)>=0?1:-1;
          if(pitched){
            const alongCamera=tx*camX+ty*camY;
            if(alongCamera<0)this.end(0,w-bodyPx*.36,low,3);
            this.wall(nose,L-nose,H,H,side*w);
            this.cabWall(false,side,H);
            this.cabWall(true,side,H,NOSE_Z);
          }
          this.roof(nose,L-nose,H,H,w+MARGIN);
          this.roof(0,nose,low,H,w+MARGIN);
          this.roof(L-nose,L,H,NOSE_Z,w+MARGIN);
          this.roof(-MARGIN,0,low,low,w+MARGIN);
          this.roof(L,L+MARGIN,NOSE_Z,NOSE_Z,w+MARGIN);
          this.beam(L,w);
        }
      }
      // coaster-train: the 88열차 cars, with their own buffers, program and depth (the ripple and pulse below stay this layer's)
      const c88o=this.c88o={zoom,unit,walls:options.walls,occlude:options.occlude,dark:document.documentElement.dataset.theme==='dark',shadow:live.sunTrainShadow,pixelRatio:gl.drawingBufferWidth/Math.max(1,gl.canvas.clientWidth||1),lod:live.rider.ride?2:undefined};   // 1인칭: 눈앞의 칸들이라 늘 가장 자세하게
      if(look==='fleet'&&this.ships)this.ships.draw(gl,options.defaultProjectionData.mainMatrix,ox,oy,c88o);   // 조선 모드: 거북선
      if(look==='units'&&this.units)this.units.draw(gl,options.defaultProjectionData.mainMatrix,ox,oy,c88o);   // 스타크래프트: 유닛 행렬
      // 스타크래프트 하늘(모드 설정 sky.units): 가끔 비행 유닛이 화면을 가로지른다 — 나는 동안 계속 그리고, 없을 때도 1초마다 다음 비행을 본다. 모드를 나가면 GL 을 치운다
      {const sky=S.sky;if(sky?.units?.length&&live.SkyUnits&&zoom>=13){this.sky??=new live.SkyUnits();if(this.sky.frame(gl,options.defaultProjectionData.mainMatrix,ox,oy,{sky,now:performance.now(),view:[lo.x,hi.y,hi.x,lo.y],mpm:O.meterInMercatorCoordinateUnits(),unit,dark:c88o.dark}))animating=true;else waiting=true}else if(this.sky){this.sky.dispose(gl);this.sky=null}}
      if(c88&&this.c88){this.c88.draw(gl,options.defaultProjectionData.mainMatrix,ox,oy,c88o);this.c88ride.draw(gl,options.defaultProjectionData.mainMatrix,ox,oy,{...c88o,part:'foot'})}   // 내 칸은 땅 그림자만 여기서(몸은 cockpit)
      if(c88&&this.rideTrack&&live.rider.ride?.rail?.frames.length&&live.rider.ride.eye){const r=live.rider.ride.rail;if(r.dirty){this.rideTrack.set(gl,r.frames,r.mpu,[r.frames[0].p[0],r.frames[0].p[1]]);r.dirty=false}this.rideTrack.draw(gl,options.defaultProjectionData.mainMatrix,live.rider.ride.eye,document.documentElement.dataset.theme==='dark')}
      if(this.used){
        gl.useProgram(this.p);
        const M=options.defaultProjectionData.mainMatrix,MT=this.matrix;MT.set(M);
        for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r]; // M · translate(origin), evaluated in double precision
        gl.uniformMatrix4fv(this.uni.u_matrix,false,MT);
        // Never write depth: the model's own faces are ordered by the painter's pass above (testing them
        // against each other flickered on phones). options.occlude (the building walls' depth is in the
        // buffer): draw what is in front of them, then what is behind at that alpha.
        gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.b);
        if(this.gpuCapacity!==this.data.length){gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);this.gpuCapacity=this.data.length}
        gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.used);
        const S=52,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off)};
        ptr('a_pos',3,0);ptr('a_local',2,12);ptr('a_info',4,20);ptr('a_color',3,36);ptr('a_face',1,48);
        gl.uniform1f(this.uni.u_glow,document.documentElement.dataset.theme==='dark'?.62:.3);gl.uniform1f(this.uni.u_time,performance.now()/1000);
        const SS=K==='viaduct'?cityViaduct.shadowShift(sunPosition()):[0,0];   // city-life: 심시티 — a train up on the viaduct casts its shadow where the deck casts its own
        const pass=alpha=>{gl.uniform1f(this.uni.u_alpha,alpha);
          gl.uniform2f(this.uni.u_offset,live.sunTrainShadow[0]*unit+SS[0],live.sunTrainShadow[1]*unit+SS[1]);gl.uniform1f(this.uni.u_shadow,1);gl.drawArrays(gl.TRIANGLES,0,this.used/13);
          gl.uniform2f(this.uni.u_offset,0,0);gl.uniform1f(this.uni.u_shadow,0);gl.drawArrays(gl.TRIANGLES,0,this.used/13)};
        if(options.walls){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);pass(1);if(options.occlude){gl.depthFunc(gl.GREATER);pass(options.occlude)}}   // solid buildings (the park): hidden behind them
        else{gl.disable(gl.DEPTH_TEST);pass(1)}
      }
      // moving trains, ripple or pulse: TRAIN_FPS (a followed train moves the camera: map redraws at
      // FOLLOW_FPS); trains standing at a station: once a second, to see them set off
      // following a moving train: camera, map and trains step together (followSoon), and no extra
      // train-only frames in between — they drew the train ahead of the map it sits on (jitter)
      if(animating&&(live.following||live.rider.ride)&&!live.easing)followSoon();
      else if(animating||rippling)trainFrameSoon(1000/TRAIN_FPS);else if(waiting)trainFrameSoon(1000);
    }
    onRemove(map,gl){gl.deleteBuffer(this.b);gl.deleteProgram(this.p);this.c88?.dispose(gl);this.c88ride?.dispose(gl);this.ships?.dispose(gl);this.units?.dispose(gl);this.sky?.dispose(gl);this.rideTrack?.dispose(gl)}   // coaster-train: and the 88열차's
  }

  return TrainLayer;
}
const BLD_VS=`#version 300 es
in vec3 a_pos;uniform mat4 u_matrix;uniform float u_h;
void main(){gl_Position=u_matrix*vec4(a_pos.xy,a_pos.z*u_h,1.);}`;
const BLD_FS=`#version 300 es
precision mediump float;out vec4 o;void main(){o=vec4(0.);}`;
export function buildingDepthClass({cityOn,map,PHONE,maplibregl,live}){
  class BuildingDepth{
    constructor(gl){
      const sh=(t,src)=>{const x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
      this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,BLD_VS));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,BLD_FS));gl.linkProgram(this.p);
      this.a=gl.getAttribLocation(this.p,'a_pos');this.um=gl.getUniformLocation(this.p,'u_matrix');this.uh=gl.getUniformLocation(this.p,'u_h');
      this.b=gl.createBuffer();this.n=0;this.gl=gl;this.M=new Float32Array(16);
    }
    shown(){if(cityOn())return false;const z=map.getZoom();return z>=(PHONE?15:14)&&map.getLayer('bm-bld3d')&&map.getLayoutProperty('bm-bld3d','visibility')!=='none'}
    rebuild(){
      this.n=0;if(!this.shown())return;
      const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),mpu=O.meterInMercatorCoordinateUnits(),out=[];this.ox=O.x;this.oy=O.y;
      const X=l=>(l+180)/360-O.x,Y=a=>(180-180/Math.PI*Math.log(Math.tan(Math.PI/4+a*Math.PI/360)))/360-O.y;
      for(const f of map.querySourceFeatures('ofm',{sourceLayer:'building'})){
        const g=f.geometry,top=(f.properties.render_height??10)*mpu,base=(f.properties.render_min_height??0)*mpu;if(top<=base)continue;
        for(const poly of g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[])for(const ring of poly)
          for(let i=0;i+1<ring.length;i++){const x0=X(ring[i][0]),y0=Y(ring[i][1]),x1=X(ring[i+1][0]),y1=Y(ring[i+1][1]);
            out.push(x0,y0,base,x1,y1,base,x1,y1,top,x0,y0,base,x1,y1,top,x0,y0,top)}
      }
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(out),gl.STATIC_DRAW);this.n=out.length/3;
    }
    // depth of the walls into the buffer; returns whether anything was drawn
    draw(M){
      if(!this.n||!this.shown())return false;
      const gl=this.gl,MT=this.M;MT.set(M);for(let r=0;r<4;r++)MT[12+r]=M[r]*this.ox+M[4+r]*this.oy+M[12+r];
      gl.useProgram(this.p);gl.uniformMatrix4fv(this.um,false,MT);gl.uniform1f(this.uh,Math.max(0,Math.min(1,map.getZoom()-14)));   // the map grows buildings in over z14–15
      gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.enableVertexAttribArray(this.a);gl.vertexAttribPointer(this.a,3,gl.FLOAT,false,12,0);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(true);gl.colorMask(false,false,false,false);gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES,0,this.n);gl.colorMask(true,true,true,true);gl.disableVertexAttribArray(this.a);
      return true;
    }
  }
  return BuildingDepth;
}
