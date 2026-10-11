// 승강장 막대와 출구 통로(줌 16+)를 지도 GL 에 그리는 층(StationNameLayer)과 열차 캔버스의 출구 기둥(ExitPillars). StationNameLayer 의 id 는 예전 그대로 'station-names'(역 이름은 따로 symbol 층).
// 다른 화면 파일을 import 하지 않는다: 지도 · 역 자료 · 함수는 본체가 넘기고, 바뀌는 값은 getter(getLabels · getSelected · getExits · getStationAlpha · isCoaster · isSimcity)로 읽는다.
const NAME_PX=40,NAME_ROW=50;   // atlas: each name rendered once at 40 px in a 50 px row
export class StationNameLayer{
  constructor(deps){this.d=deps;this.id='station-names';this.type='custom';this.renderingMode='3d';this.atlasKey=''}   // coaster: platforms share the buildings' depth range; actual names are separate symbols
  onAdd(map,gl){
    this.map=map;
    const vs=`#version 300 es
in vec2 a_px;in vec2 a_local;in vec2 a_size;in vec4 a_uv;in vec3 a_color;in vec2 a_tw;
uniform mat4 u_matrix;out vec2 v_local;out vec2 v_size;out vec4 v_uv;out vec3 v_color;out vec2 v_tw;
// a_px: mercator position relative to the view centre (drawn on the ground, so pitch and bearing apply)
void main(){v_local=a_local;v_size=a_size;v_uv=a_uv;v_color=a_color;v_tw=a_tw;gl_Position=u_matrix*vec4(a_px,0.,1.);}`;
    const fs=`#version 300 es
precision highp float;in vec2 v_local;in vec2 v_size;in vec4 v_uv;in vec3 v_color;in vec2 v_tw;uniform sampler2D u_tex;uniform float u_dpr;uniform float u_dark;uniform float u_alpha;out vec4 o;
void main(){
  // 연결된 승강장 리본: 누적 거리와 폭으로 바깥 가장자리만 부드럽게 처리해요.
  if(v_tw.x<-3.5){float r=min(v_size.y*.12,v_size.x*.5);vec2 q=abs(v_local)-(v_size*.5-r);
    float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-r,aa=max(fwidth(sd),1e-3),c=clamp(.5-sd/aa,0.,1.);
    if(c<=0.)discard;o=vec4(v_color*c,c)*u_alpha;return;}
  // v_tw.x: >0 name cell, 0 box, -1 exit passage (solid line colour), -3 its white casing, -2 soft shadow (size includes 6px blur)
  if(v_tw.x<-1.5){vec2 hs=v_size*.5-6.,q=abs(v_local)-(hs-min(hs.y,hs.x));float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-min(hs.y,hs.x);
    float a=(1.-smoothstep(-2.,6.,sd))*mix(.16,.4,u_dark);if(a<=0.)discard;o=vec4(0.,0.,0.,a)*u_alpha;return;}
  if(v_tw.x<-.5){vec2 hs=v_size*.5,q=abs(v_local)-(hs-hs.y);float sd=length(max(q,0.))-hs.y+min(max(q.x,q.y),0.),aa=max(fwidth(sd),1e-3),c=clamp(.5-sd/aa,0.,1.);if(c<=0.)discard;
    vec3 col=v_tw.x<-2.5?mix(vec3(1.),vec3(.12,.17,.2),u_dark):v_color;o=vec4(col*c,c)*u_alpha;return;}
  // rounded rectangle: white fill, line-colour border, dark name
  float r=abs(v_size.x-v_size.y)<.5?v_size.x*.5:min(v_size.y*(v_tw.x>0.?.32:.12),v_size.x*.5),border=(abs(v_size.x-v_size.y)<.5?1.8:2.2)*u_dpr;   // square box → dot
  vec2 q=abs(v_local)-(v_size*.5-r);float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
  float aa=max(fwidth(sd),1e-3),cover=clamp(.5-sd/aa,0.,1.);if(cover<=0.)discard;
  vec3 fill=mix(vec3(1.),vec3(.12,.17,.2),u_dark),ink=mix(vec3(.11,.17,.19),vec3(.93,.96,.97),u_dark);   // dark mode: dark box, light name
  vec3 col=v_tw.x>0.?mix(fill,v_color,smoothstep(-border-aa,-border+aa,sd)):v_color;   // platform: solid line colour, set into the map
  if(v_tw.x>0.){vec2 t=(v_local+v_tw*.5)/v_tw;   // v_tw = text cell size (width, font × row ratio)
    if(t.x>0.&&t.x<1.&&t.y>0.&&t.y<1.){float a=texture(u_tex,vec2(mix(v_uv.x,v_uv.z,t.x),mix(v_uv.y,v_uv.w,t.y))).a;col=mix(col,ink,a);}}
  o=vec4(col*cover,cover)*u_alpha;   // premultiplied; faded behind a 길찾기 route
}`;
    const sh=(type,src)=>{const x=gl.createShader(type);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
    if(!gl.getProgramParameter(this.p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.p));
    this.b=gl.createBuffer();this.tex=gl.createTexture();
    this.attr=Object.fromEntries(['a_px','a_local','a_size','a_uv','a_color','a_tw'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uni=Object.fromEntries(['u_matrix','u_tex','u_dpr','u_dark','u_alpha'].map(n=>[n,gl.getUniformLocation(this.p,n)]));
  }
  buildAtlas(gl){
    const labels=this.d.getLabels(),{document}=this.d;
    const texts=[...new Set(labels.map(l=>l.text))],key=texts.join('|');if(key===this.atlasKey)return;this.atlasKey=key;
    const c=document.createElement('canvas'),ctx=c.getContext('2d'),W=2048;ctx.font=`700 ${NAME_PX}px "Noto Sans KR",sans-serif`;
    let x=0,y=0;const pos=new Map();
    for(const t of texts){const w=Math.ceil(ctx.measureText(t).width)+4;if(x+w>W){x=0;y+=NAME_ROW}pos.set(t,[x,y,w]);x+=w}
    c.width=W;c.height=Math.max(NAME_ROW,y+NAME_ROW);ctx.font=`700 ${NAME_PX}px "Noto Sans KR",sans-serif`;ctx.textBaseline='middle';ctx.fillStyle='#000';
    for(const [t,[px,py]] of pos)ctx.fillText(t,px+2,py+NAME_ROW/2);
    this.uv=new Map([...pos].map(([t,[px,py,w]])=>[t,[px/W,py/c.height,(px+w)/W,(py+NAME_ROW)/c.height,(w-4)/NAME_PX]]));
    gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  render(gl,options){
    const {map,maplibregl,stationRects,exitCol,cityViaduct,colors,hexRGB3,stationWidthPx,platformPx,PLATFORM_SCALE,closestPlatformPoint,platformStroke,EXIT_MINZOOM,EXIT_MAX_M,EXIT_PASSAGES,document,matchMedia}=this.d;
    const selected=this.d.getSelected(),exits=this.d.getExits(),stationAlpha=this.d.getStationAlpha(),kind=this.d.getTrack().kind;   // 선로 종류(지금 모드 설정)
    if(!stationRects.size)return;
    this.buildAtlas(gl);
    const z=map.getZoom(),unit=1/(512*2**z),data=[],hgt=stationWidthPx(z);
    const O=maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()),ox=O.x,oy=O.y;
    // a box on the ground: centre (mercator), unit axis, length/height in CSS px at this zoom
    const quad=(cx,cy,ax,ay,bw,h,uv,col,tw,th)=>{const nx=-ay,ny=ax,hw=bw/2,hh=h/2;
      const corner=(lx,ly)=>[cx-ox+(ax*lx+nx*ly)*unit,cy-oy+(ay*lx+ny*ly)*unit,lx,ly,bw,h,uv[0],uv[1],uv[2],uv[3],...col,tw,th];
      const q=[corner(-hw,-hh),corner(hw,-hh),corner(hw,hh),corner(-hw,hh)];for(const i of [0,1,2,0,2,3])data.push(...q[i])};
    // zoomed out (phone ≤ 12, desktop ≤ 13): each platform is just a dot, no names
    const pointsOnly=z<=(matchMedia('(max-width:720px),(pointer:coarse)').matches?12:13),dot=Math.max(7,Math.min(10,hgt*.55));
    const b=map.getBounds(),lo=maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()),hi=maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()),pad=(hi.x-lo.x)*.2;
    const geo=new Map();   // rect key → ground placement, reused for its name
    // 화면에 걸리는 역: 막대 전체 범위로 보고(긴 막대는 가운데가 밖이어도 보임), 그 역의 다른 노선 막대도 함께 둔다 —
    // 출구가 어느 노선 막대에 붙을지가 화면 범위(회전 · 이동)에 따라 바뀌지 않게(잠실 2호선 · 8호선)
    const shown=new Set();
    for(const [k,r] of stationRects){
      const line=k.slice(0,k.lastIndexOf(':'));if(selected!=='all'&&line!==selected)continue;
      if(!r.box){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const c of r.coords){const m=maplibregl.MercatorCoordinate.fromLngLat(c);x0=Math.min(x0,m.x);x1=Math.max(x1,m.x);y0=Math.min(y0,m.y);y1=Math.max(y1,m.y)}r.box=[x0,y0,x1,y1]}
      const [x0,y0,x1,y1]=r.box;if(!(x1<lo.x-pad||x0>hi.x+pad||y0>lo.y+pad||y1<hi.y-pad))shown.add(k.slice(k.lastIndexOf(':')+1));
    }
    for(const [k,r] of stationRects){
      const line=k.slice(0,k.lastIndexOf(':'));if(selected!=='all'&&line!==selected)continue;
      if(!shown.has(k.slice(k.lastIndexOf(':')+1)))continue;
      const m0=maplibregl.MercatorCoordinate.fromLngLat(r.coords[0]),m1=maplibregl.MercatorCoordinate.fromLngLat(r.coords[r.coords.length-1]);
      let ax=m1.x-m0.x,ay=m1.y-m0.y;const lenU=Math.hypot(ax,ay)||1e-12;ax/=lenU;ay/=lenU;
      const mid=r.center?maplibregl.MercatorCoordinate.fromLngLat(r.center):null,cx=(mid?.x??(m0.x+m1.x)/2)-ay*r.offset*unit,cy=(mid?.y??(m0.y+m1.y)/2)+ax*r.offset*unit;   // line-offset: right of drawing direction
      const col=hexRGB3(colors[line]||'#52646a'),h=platformPx(r,hgt)*PLATFORM_SCALE,len=lenU/unit;
      // names read left→right on screen: flip the axis when it points leftward
      const p0=map.project(r.coords[0]),p1=map.project(r.coords[r.coords.length-1]),flip=p1.x<p0.x?-1:1;
      let points=r.center?r.coords.map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)):null;
      if(points&&r.offset){const P=points,o=r.offset*unit;points=P.map((p,i)=>{const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1e-12;return {x:p.x-dy/d*o,y:p.y+dx/d*o}})}   // 고가 모드 리본: 상판 중심선 → 이 노선의 칸(line-offset 처럼 그리는 방향 오른쪽)
      // 출구가 한쪽 끝 밖에 몰린 역: 가까운 막대 끝 → 통로 끝(stopReach)을 이 역 출구가 붙을 수 있는 통로로
      let reach=null;if(points&&r.reach){const q=maplibregl.MercatorCoordinate.fromLngLat(r.reach),a=points[0],b=points[points.length-1];reach=[Math.hypot(q.x-a.x,q.y-a.y)<Math.hypot(q.x-b.x,q.y-b.y)?a:b,q]}
      geo.set(k,{points,reach,cx,cy,ax:ax*flip,ay:ay*flip,len,h,col,id:k.slice(k.lastIndexOf(':')+1)});
    }
    // zoom 16+: each exit hangs off its station by a short passage (drawn first, so the box covers its root)
    if(!pointsOnly&&z>=EXIT_MINZOOM){
      const byStation=new Map();for(const g of geo.values()){if(!byStation.has(g.id))byStation.set(g.id,[]);byStation.get(g.id).push(g)}
      const w=Math.max(3,Math.min(5,hgt*.18)),pass=[];
      for(const [id,boxes] of byStation)for(const [lon,lat] of exits[id]||[]){
        if(kind==='viaduct'&&cityViaduct.hasStair(id,lon,lat))continue;   // city-life: 심시티 — an exit with a stair down from the platform needs no flat passage line; the ones without keep it
        const e=maplibregl.MercatorCoordinate.fromLngLat([lon,lat]);let best=null;
        for(const g of boxes){   // nearest point on the box's centre line (its rounded ends excluded)
          if(g.points){const foot=closestPlatformPoint(e,g.points);if(foot&&(!best||foot.distance/unit<best.d))best={sx:foot.x,sy:foot.y,d:foot.distance/unit,g};
            const rf=g.reach&&closestPlatformPoint(e,g.reach);if(rf&&(!best||rf.distance/unit<best.d))best={sx:rf.x,sy:rf.y,d:rf.distance/unit,g,via:Math.hypot(rf.x-g.reach[0].x,rf.y-g.reach[0].y)/unit};continue}
          const rx=(e.x-g.cx)/unit,ry=(e.y-g.cy)/unit,half=Math.max(0,(Math.max(g.len,g.h)-g.h)/2),t=Math.max(-half,Math.min(half,rx*g.ax+ry*g.ay));
          const sx=g.cx+g.ax*t*unit,sy=g.cy+g.ay*t*unit,d=Math.hypot(e.x-sx,e.y-sy)/unit;if(!best||d<best.d)best={sx,sy,d,g}}
        if(best)exitCol.set(lon+','+lat,best.g.col);
        if(best?.via!=null&&best.d*unit*40075016.686*Math.cos(lat*Math.PI/180)<=EXIT_MAX_M)best.g.reachUsed=Math.max(best.g.reachUsed||0,best.via);   // 통로를 이 출구까지 그린다
        if(!best||best.d*unit*40075016.686*Math.cos(lat*Math.PI/180)>EXIT_MAX_M||best.d<best.g.h/2)continue;   // too far to be this station's, or inside the box
        // past the box's end: the concourse runs on along the box's axis and the exit branches off it square
        if(best.g.points&&best.via!=null){pass.push([(best.sx+e.x)/2,(best.sy+e.y)/2,(e.x-best.sx)/unit/best.d,(e.y-best.sy)/unit/best.d,best.d+w,w,best.g.col]);continue}   // 통로 위 점에서 출구로
        if(best.g.points){
          const foot=closestPlatformPoint(e,best.g.points),d=foot?.distance/unit;if(!foot||d<best.g.h/2)continue;
          pass.push([(foot.x+e.x)/2,(foot.y+e.y)/2,(e.x-foot.x)/unit/d,(e.y-foot.y)/unit/d,d+w,w,best.g.col]);continue;
        }
        const g=best.g,t=((e.x-g.cx)*g.ax+(e.y-g.cy)*g.ay)/unit,half=Math.max(0,(Math.max(g.len,g.h)-g.h)/2);
        if(Math.abs(t)>half){const side=t>0?1:-1;g.trunk=g.trunk||{};g.trunk[side]=Math.max(g.trunk[side]||half,Math.abs(t))}
        const sx=g.cx+g.ax*t*unit,sy=g.cy+g.ay*t*unit,d=Math.hypot(e.x-sx,e.y-sy)/unit;if(d<g.h/2)continue;
        pass.push([(sx+e.x)/2,(sy+e.y)/2,(e.x-sx)/unit/d,(e.y-sy)/unit/d,d+w,w,g.col]);
      }
      for(const g of geo.values())if(g.reachUsed){const [a,q]=g.reach,l=Math.hypot(q.x-a.x,q.y-a.y)/unit||1,ux=(q.x-a.x)/unit/l,uy=(q.y-a.y)/unit/l,m=g.reachUsed/2;
        pass.unshift([a.x+ux*m*unit,a.y+uy*m*unit,ux,uy,g.reachUsed+w,w,g.col]);delete g.reachUsed}   // 막대 끝에서 늘린 통로(출구가 붙은 데까지)
      for(const g of geo.values())for(const [side,far] of Object.entries(g.trunk||{})){const half=Math.max(0,(Math.max(g.len,g.h)-g.h)/2),m=(half+far)/2*side;
        pass.unshift([g.cx+g.ax*m*unit,g.cy+g.ay*m*unit,g.ax*side,g.ay*side,far-half+w,w,g.col]);delete g.trunk}   // the concourse the exits share
      if(EXIT_PASSAGES){
      for(const [cx,cy,ux,uy,l,ww,col] of pass)quad(cx,cy,ux,uy,l+3,ww+3,[0,0,0,0],col,-3,0);   // white casing
      for(const [cx,cy,ux,uy,l,ww,col] of pass)quad(cx,cy,ux,uy,l,ww,[0,0,0,0],col,-1,0);       // passage: a thin line in the station's line colour
      }
    }
    for(const g of geo.values()){
      if(pointsOnly){quad(g.cx,g.cy,1,0,dot,dot,[0,0,0,0],g.col,0,0);continue}
      if(g.points){
        const stroke=platformStroke(g.points,unit,g.h);
        for(const v of stroke.vertices)data.push(v.x-ox,v.y-oy,v.s,v.t,stroke.length,g.h,0,0,0,0,...g.col,-4,0);
        continue;
      }
      quad(g.cx,g.cy,g.ax,g.ay,Math.max(g.len,g.h),g.h,[0,0,0,0],g.col,0,0);   // one bar: platform and passages out to the exits
    }
    if(!data.length)return;
    const M=options.defaultProjectionData.mainMatrix,MT=Array.from(M);for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r];
    gl.useProgram(this.p);gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    const S=15*4,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,S,off*4)};
    ptr('a_px',2,0);ptr('a_local',2,2);ptr('a_size',2,4);ptr('a_uv',4,6);ptr('a_color',3,10);ptr('a_tw',2,13);
    gl.uniformMatrix4fv(this.uni.u_matrix,false,new Float32Array(MT));gl.uniform1f(this.uni.u_dpr,1);gl.uniform1f(this.uni.u_dark,document.documentElement.dataset.theme==='dark'?1:0);gl.uniform1f(this.uni.u_alpha,stationAlpha);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.uni.u_tex,0);
    if(kind!=='ground'){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false)}else gl.disable(gl.DEPTH_TEST);   // coaster: platforms and exit passages follow the exit pillars' building occlusion   // city-life: cityOn — 심시티 too (its buildings are opaque; the bars floated over them, and over the viaduct)
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,data.length/15);
  }
}
// Exit pillars (zoom 16+), drawn on the train canvas above the trains: a square column standing on the exit,
// painted grey with a band of its line's colour round the top and the exit number in yellow, like real entrance pillars.
// The box is built in map space, so it leans with the tilt and turns with the bearing; only the sides facing
// the viewer are drawn, lit from the south-west. Seen from straight above, the number moves onto the cap.
const PILLAR_PX=[[16,11,22],[18,17,38]];   // [zoom, side, height] in screen px — 2026-10-05: 통로 선을 없애고 번호를 크게
// segs: [from, to (share of the height), colour (an [r,g,b], or 1: the line's), number on it]
// segs: [from, to (share of the height), colour (an [r,g,b], 1: the line's, 'grey': the theme's), number on it]
// grey: a slightly dark grey by day; lighter at night so the pillar stands off the dark map
const PILLAR_STYLE={ink:[1,1,1],inkOnLight:[.08,.08,.08],cap:1,grey:{light:[.4,.42,.44],dark:[.56,.59,.62]},segs:[[0,.38,'grey'],[.38,1,1,1]]};   // 노선색 면에 흰 번호(밝은 노선색이면 검은 번호), 아래만 회색 기둥
export class ExitPillars{
  constructor(deps){this.d=deps}
  init(gl){
    const vs=`#version 300 es
in vec3 a_pos;in vec2 a_local;in vec3 a_col;in vec3 a_ink;in vec4 a_glyph;in vec4 a_guv;in float a_mode;uniform vec2 u_view;
out vec2 v_local;out vec3 v_col;out vec3 v_ink;flat out vec4 v_glyph;flat out vec4 v_guv;out float v_mode;
void main(){v_local=a_local;v_col=a_col;v_ink=a_ink;v_glyph=a_glyph;v_guv=a_guv;v_mode=a_mode;gl_Position=vec4(a_pos.xy/u_view*vec2(2.,-2.)+vec2(-1.,1.),a_pos.z,1.);}`;   // z: its depth, for the solid park buildings
    const fs=`#version 300 es
precision highp float;in vec2 v_local;in vec3 v_col;in vec3 v_ink;flat in vec4 v_glyph;flat in vec4 v_guv;in float v_mode;uniform sampler2D u_tex,u_face;uniform float u_time;out vec4 o;
void main(){
  if(v_mode<.5){float d=length(v_local);float a=(1.-smoothstep(.15,1.,d))*.3;if(a<=0.)discard;o=vec4(0.,0.,0.,a);return;}   // ground shadow
  if(v_mode>2.5&&v_mode<3.5){vec3 t=texture(u_face,mix(v_guv.xy,v_guv.zw,vec2(v_local.x,1.-v_local.y))).rgb;o=vec4(t*v_col,1.);return;}   // 장승 얼굴(아틀라스)
  if(v_mode>3.5&&v_mode<4.5){   // 횃불 불꽃: 아래 둥글고 위로 뾰족, 흔들림(v_ink.x 위상)
    float ph=u_time*7.+v_ink.x,y=v_local.y,x=v_local.x+.18*sin(ph+y*3.)*y,w=(1.-y)*.55+.45*sqrt(max(0.,y))*(1.-y)*1.6;
    float a=1.-smoothstep(w*.75,w,abs(x));a*=smoothstep(0.,.08,y)*(1.-smoothstep(.82+.1*sin(ph*1.3),1.,y));if(a<=.01)discard;
    vec3 c=mix(vec3(1.,.93,.62),vec3(.94,.4,.1),smoothstep(.15,.85,abs(x)/max(w,1e-3)*.6+y*.7));o=vec4(c*a,a);return;}
  if(v_mode>4.5){float d=length(v_local),a=(1.-smoothstep(0.,1.,d))*.42*v_col.r*(.85+.15*sin(u_time*9.+v_ink.x));if(a<=.004)discard;o=vec4(vec3(1.,.62,.28)*a,a*.6);return;}   // 밤 불빛 번짐
  vec3 col=v_col;
  if(v_mode>1.5){vec2 q=(v_local-v_glyph.xy)/(v_glyph.zw-v_glyph.xy);   // the number, printed on this face
    if(all(greaterThanEqual(q,vec2(0.)))&&all(lessThanEqual(q,vec2(1.)))){float a=texture(u_tex,mix(v_guv.xy,v_guv.zw,vec2(q.x,1.-q.y))).a;col=mix(col,v_ink,a);}}
  o=vec4(col,1.);
}`;
    const sh=(t,src)=>{const x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    this.p=gl.createProgram();gl.attachShader(this.p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(this.p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.p);
    this.attr=Object.fromEntries(['a_pos','a_local','a_col','a_ink','a_glyph','a_guv','a_mode'].map(n=>[n,gl.getAttribLocation(this.p,n)]));
    this.uView=gl.getUniformLocation(this.p,'u_view');this.uTex=gl.getUniformLocation(this.p,'u_tex');this.uFace=gl.getUniformLocation(this.p,'u_face');this.uTime=gl.getUniformLocation(this.p,'u_time');
    this.b=gl.createBuffer();this.tex=gl.createTexture();this.gl=gl;this.key='';
  }
  // number atlas: each exit ref once, bold, on a row of the texture
  atlas(){
    const exits=this.d.getExits(),{document}=this.d;
    const refs=[...new Set(Object.values(exits).flatMap(l=>l.map(e=>String(e[2]))))].sort(),key=refs.join('|');if(key===this.key)return;this.key=key;
    const F=26,ROW=30,W=1024,c=document.createElement('canvas'),x=c.getContext('2d');x.font=`800 ${F}px "Noto Sans KR",system-ui,sans-serif`;
    let px=0,py=0;const pos=new Map();
    for(const r of refs){const w=Math.ceil(x.measureText(r).width)+4;if(px+w>W){px=0;py+=ROW}pos.set(r,[px,py,w]);px+=w}
    c.width=W;c.height=py+ROW;x.font=`800 ${F}px "Noto Sans KR",system-ui,sans-serif`;x.textBaseline='middle';x.textAlign='center';x.fillStyle='#000';
    for(const [r,[a,b,w]] of pos)x.fillText(r,a+w/2,b+ROW/2+1);
    this.uv=new Map([...pos].map(([r,[a,b,w]])=>[r,[a/W,b/c.height,(a+w)/W,(b+ROW)/c.height,w/ROW]]));
    const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);   // no mipmaps: they blur the digits' strokes into outlines
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  // 장승 얼굴 아틀라스(조선 출구, 2026-10-11 행님): 천하대장군(0) · 지하여장군(1), 한 칸 128 px — 붉은 칠 얼굴에 먹 눈썹 · 부릅뜬 눈 · 주먹코 · 이빨 / 둥근 눈 · 연지
  faceAtlas(){
    if(this.faceTex)return;const {document}=this.d,c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');
    const E=(cx,cy,rx,ry,col,r=0)=>{x.beginPath();x.ellipse(cx,cy,rx,ry,r,0,Math.PI*2);x.fillStyle=col;x.fill()},L=(pts,col,w)=>{x.beginPath();pts.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.strokeStyle=col;x.lineWidth=w;x.lineCap='round';x.stroke()},P=(pts,col)=>{x.beginPath();pts.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.closePath();x.fillStyle=col;x.fill()};
    const ink='#221810',iv='#efe3c6';
    for(const f of [0,1]){const o=f*128;x.save();x.translate(o,0);
      x.fillStyle='#9b5a3f';x.fillRect(0,0,128,128);for(let i=0;i<9;i++){x.fillStyle=i%2?'rgba(60,30,15,.16)':'rgba(240,200,150,.10)';x.fillRect(6+i*14,0,3,128)}   // 붉은 칠 · 나뭇결
      if(!f){L([[10,30],[34,18],[56,32]],ink,9);L([[72,32],[96,18],[118,30]],ink,9);E(36,48,15,13,iv);E(92,48,15,13,iv);E(38,50,7,9,ink);E(90,50,7,9,ink);
        P([[56,52],[72,52],[80,84],[48,84]],'#c99567');L([[50,84],[64,90],[78,84]],'#5a3a22',3);
        P([[20,94],[108,94],[100,116],[28,116]],ink);P([[30,95],[40,95],[35,110]],iv);P([[88,95],[98,95],[93,110]],iv);for(let i=0;i<4;i++)x.fillStyle=iv,x.fillRect(48+i*9,96,6,7);
        L([[14,60],[8,100],[16,124]],ink,4);L([[114,60],[120,100],[112,124]],ink,4)}   // 천하대장군: 부릅뜬 눈 · 주먹코 · 송곳니 · 먹 수염
      else{L([[16,32],[36,24],[54,32]],ink,5);L([[74,32],[92,24],[112,32]],ink,5);E(36,50,13,14,ink);E(92,50,13,14,ink);E(36,50,8,9,iv);E(92,50,8,9,iv);E(37,52,4,6,ink);E(91,52,4,6,ink);
        E(22,82,12,9,'#c8382c');E(106,82,12,9,'#c8382c');P([[58,56],[70,56],[74,78],[54,78]],'#c48f63');E(64,100,14,7,'#7a2018');E(64,99,9,3,'#c8382c')}   // 지하여장군: 둥근 눈 · 연지
      x.restore()}
    const gl=this.gl;this.faceTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.faceTex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
    gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  render(gl,M,W,H,dpr,solid=false){
    const {map,maplibregl,stations,exitCol,colors,hexRGB3,EXIT_MINZOOM,document}=this.d,exits=this.d.getExits(),selected=this.d.getSelected();
    const z=map.getZoom();if(z<EXIT_MINZOOM||!Object.keys(exits).length)return;
    if(!this.p)this.init(gl);this.atlas();const jang=this.d.getLook?.()==='jangseung';if(jang)this.faceAtlas();const night=document.documentElement.dataset.theme==='dark';
    const unit=1/(512*2**z),f=Math.max(0,Math.min(1,(z-PILLAR_PX[0][0])/(PILLAR_PX[1][0]-PILLAR_PX[0][0]))),lerp=i=>PILLAR_PX[0][i]+(PILLAR_PX[1][i]-PILLAR_PX[0][i])*f;
    const sPx=lerp(1),half=sPx/2*unit,hgt=lerp(2)*unit,St=PILLAR_STYLE,grey=St.grey[document.documentElement.dataset.theme==='dark'?'dark':'light'],onTop=map.getPitch()<30;
    const proj=(x,y,zz)=>{const X=M[0]*x+M[4]*y+M[8]*zz+M[12],Y=M[1]*x+M[5]*y+M[9]*zz+M[13],Z=M[2]*x+M[6]*y+M[10]*zz+M[14],Wc=M[3]*x+M[7]*y+M[11]*zz+M[15];return Wc<=0?null:[(X/Wc+1)/2*W,(1-Y/Wc)/2*H,Z/Wc]};
    const data=[],NO=[0,0,0,0],vert=(p,l,col,ink,g,guv,mode)=>data.push(p[0],p[1],p[2]??0,l[0],l[1],...col,...ink,...g,...guv,mode);
    const quad=(P,Lc,col,ink,g,guv,mode)=>{for(const i of [0,1,2,0,2,3])vert(P[i],Lc[i],col,ink,g,guv,mode)};
    const LOC=[[0,0],[1,0],[1,1],[0,1]],mul=(c,k)=>c.map(v=>v*k);
    // where the number sits on a face of w×h screen px (local 0..1 across, 0..1 up)
    const glyph=(uv,w,h,fill=.8)=>{let gh=h*fill,gw=gh*uv[4];if(gw>w*.92){gh*=w*.92/gw;gw=w*.92}return [.5-gw/w/2,.5-gh/h/2,.5+gw/w/2,.5+gh/h/2]};
    const ids=new Set(selected==='all'?Object.keys(exits):stations.filter(s=>s.lines.some(x=>x.name===selected)).map(s=>String(s.id)));
    const items=[];
    for(const id of ids)for(const [lon,lat,ref] of exits[id]||[]){
      const m=maplibregl.MercatorCoordinate.fromLngLat([lon,lat]),b=proj(m.x,m.y,0);if(!b||b[0]<-40||b[0]>W+40||b[1]<-60||b[1]>H+40)continue;
      const st=stations.find(s=>String(s.id)===id);
      items.push([m,b,String(ref),exitCol.get(lon+','+lat)||hexRGB3(colors[st?.lines[0]?.name]||'#52646a')]);
    }
    items.sort((a,b)=>a[1][1]-b[1][1]);   // far (higher on screen) first, near ones drawn over them
    const Ld=[-.6,.8];   // light from the south-west (map y runs south)
    if(jang)for(const [m,b,ref,lc] of items)this.jangseung(m,b,ref,lc,{proj,quad,LOC,glyph,unit,sPx,half,hgt,onTop,Ld,night,NO});
    if(!jang)for(const [m,b,ref,lc] of items){
      const uv=this.uv.get(ref)||[0,0,0,0,1],guv=uv.slice(0,4),x=m.x,y=m.y,ink=.299*lc[0]+.587*lc[1]+.114*lc[2]>.62?St.inkOnLight:St.ink;
      const ex=proj(x+half,y,0),ey=proj(x,y+half,0),sh=Math.min(sPx,ex&&ey?2*Math.max(Math.hypot(ex[0]-b[0],ex[1]-b[1]),Math.hypot(ey[0]-b[0],ey[1]-b[1])):0);   // 그림자는 기둥이 화면에 보이는 크기로: 고정 px 이던 때 1인칭(눈높이)에서 수 km 밖 기둥 그림자가 수평선에 검은 얼룩으로 쌓였다
      if(sh>.5)quad([[b[0]-sh*1.1,b[1]-sh*.55,b[2]],[b[0]+sh*1.3,b[1]-sh*.55,b[2]],[b[0]+sh*1.3,b[1]+sh*.65,b[2]],[b[0]-sh*1.1,b[1]+sh*.65,b[2]]],[[-1,-1],[1,-1],[1,1],[-1,1]],NO.slice(0,3),NO.slice(0,3),NO,NO,0);   // shadow on the ground
      const C=[[x-half,y-half,0,-1],[x+half,y-half,1,0],[x+half,y+half,0,1],[x-half,y+half,-1,0]];   // NW,NE,SE,SW and the normal of the side that starts there
      for(let i=0;i<4;i++){
        const [ax,ay,nx,ny]=C[i],[bx,by]=C[(i+1)%4],A0=proj(ax,ay,0),B0=proj(bx,by,0),A1=proj(ax,ay,hgt);if(!A0||!B0||!A1)continue;
        if((B0[0]-A0[0])*(A1[1]-A0[1])-(B0[1]-A0[1])*(A1[0]-A0[0])<=0)continue;   // faces away
        const k=.9+.1*(nx*Ld[0]+ny*Ld[1]),fw=Math.hypot(B0[0]-A0[0],B0[1]-A0[1]);
        for(const [t0,t1,tone,num] of St.segs){
          const P=[proj(bx,by,hgt*t0),proj(ax,ay,hgt*t0),proj(ax,ay,hgt*t1),proj(bx,by,hgt*t1)];if(P.some(p=>!p))continue;   // b→a reads left→right from outside
          const fh=Math.hypot(P[3][0]-P[0][0],P[3][1]-P[0][1]),col=mul(tone===1?lc:tone==='grey'?grey:tone,k),text=num&&!onTop&&fw>sPx*.55;
          quad(P,LOC,col,ink,text?glyph(uv,fw,fh):NO,guv,text?2:1);
        }
      }
      const T=C.map(([cx,cy])=>proj(cx,cy,hgt));if(T.some(p=>!p))continue;
      const xs=T.map(p=>p[0]),ys=T.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      const TL=T.map(p=>[(p[0]-x0)/Math.max(1e-3,x1-x0),(y1-p[1])/Math.max(1e-3,y1-y0)]);   // screen-upright, so the number reads from above
      quad(T,TL,St.cap===1?lc:St.cap,ink,onTop?glyph(uv,x1-x0,y1-y0,.78):NO,guv,onTop?2:1);   // the cap: 노선색, 위에서 볼 때 번호
    }
    if(!data.length)return;
    gl.useProgram(this.p);gl.bindBuffer(gl.ARRAY_BUFFER,this.b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
    const st=20*4,ptr=(n,size,off)=>{gl.enableVertexAttribArray(this.attr[n]);gl.vertexAttribPointer(this.attr[n],size,gl.FLOAT,false,st,off*4)};
    ptr('a_pos',3,0);ptr('a_local',2,3);ptr('a_col',3,5);ptr('a_ink',3,8);ptr('a_glyph',4,11);ptr('a_guv',4,15);ptr('a_mode',1,19);
    gl.uniform2f(this.uView,W,H);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(this.uTex,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.faceTex||this.tex);gl.uniform1i(this.uFace,1);gl.activeTexture(gl.TEXTURE0);gl.uniform1f(this.uTime,(performance.now()%1e6)/1000);
    if(solid){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false)}else gl.disable(gl.DEPTH_TEST);   // solid park buildings hide them; through see-through ones they show
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,data.length/20);
    for(const n of Object.keys(this.attr))gl.disableVertexAttribArray(this.attr[n]);
  }
  // 조선 출구: 장승 한 기(기둥보다 25 % 높게) — 아래 몸통에 출구 번호(밝은 나무에 먹 글자), 위에 얼굴(홀수 번 천하대장군 · 짝수 지하여장군),
  // 갓 테 · 관모(노선색 띠), 그 양쪽(동 · 서)에 횃불(밤엔 불빛 번짐). 기둥과 같은 화면 크기 규칙 · 같은 그리기 한 번
  jangseung(m,b,ref,lc,{proj,quad,LOC,glyph,unit,sPx,half,hgt,onTop,Ld,night,NO}){
    const uv=this.uv.get(ref)||[0,0,0,0,1],guv=uv.slice(0,4),x=m.x,y=m.y,Ht=hgt*1.25,male=(parseInt(ref,10)||1)%2===1,FU=male?[0,0,.5,1]:[.5,0,1,1];
    const ink=[.13,.09,.06],woodL=[.86,.77,.62],wood=[.55,.39,.25],hatC=male?[.27,.19,.15]:[.34,.18,.16];
    const ex=proj(x+half,y,0),ey=proj(x,y+half,0),sh=Math.min(sPx,ex&&ey?2*Math.max(Math.hypot(ex[0]-b[0],ex[1]-b[1]),Math.hypot(ey[0]-b[0],ey[1]-b[1])):0);
    if(sh>.5)quad([[b[0]-sh*1.1,b[1]-sh*.55,b[2]],[b[0]+sh*1.3,b[1]-sh*.55,b[2]],[b[0]+sh*1.3,b[1]+sh*.65,b[2]],[b[0]-sh*1.1,b[1]+sh*.65,b[2]]],[[-1,-1],[1,-1],[1,1],[-1,1]],[0,0,0],[0,0,0],NO,NO,0);
    // 횃불: 장승 양쪽, 기둥 · 불꽃 · (밤) 불빛 — 뒤쪽 것을 먼저
    const torch=(dx,phase)=>{const tx=x+dx,top=Ht*.78,B0=proj(tx,y,0),T0=proj(tx,y,top);if(!B0||!T0)return;const pw=Math.max(1.2,sPx*.11),fl=sPx*.85;
      quad([[B0[0]-pw/2,B0[1],B0[2]],[B0[0]+pw/2,B0[1],B0[2]],[T0[0]+pw/2,T0[1],T0[2]],[T0[0]-pw/2,T0[1],T0[2]]],LOC,[.32,.22,.14],[0,0,0],NO,NO,1);   // 나무 기둥
      quad([[T0[0]-pw*1.6,T0[1],T0[2]],[T0[0]+pw*1.6,T0[1],T0[2]],[T0[0]+pw*1.9,T0[1]-pw*1.4,T0[2]],[T0[0]-pw*1.9,T0[1]-pw*1.4,T0[2]]],LOC,[.18,.15,.13],[0,0,0],NO,NO,1);   // 쇠 화로
      if(night){const g=fl*1.9,cy=T0[1]-pw*1.4-fl*.35;quad([[T0[0]-g,cy+g,T0[2]],[T0[0]+g,cy+g,T0[2]],[T0[0]+g,cy-g,T0[2]],[T0[0]-g,cy-g,T0[2]]],[[-1,-1],[1,-1],[1,1],[-1,1]],[1,1,1],[phase,0,0],NO,NO,5)}
      const fy=T0[1]-pw*1.4;quad([[T0[0]-fl*.32,fy,T0[2]],[T0[0]+fl*.32,fy,T0[2]],[T0[0]+fl*.32,fy-fl,T0[2]],[T0[0]-fl*.32,fy-fl,T0[2]]],[[-1,0],[1,0],[1,1],[-1,1]],[1,1,1],[phase,0,0],NO,NO,4)};
    const tsep=half*2.6,phase=(x*7919e3+y*104729e3)%6.283;
    const order=[[-tsep,phase],[tsep,phase+2.1]].sort((a,c)=>{const pa=proj(x+a[0],y,0),pc=proj(x+c[0],y,0);return (pa?pa[1]:0)-(pc?pc[1]:0)});
    torch(...order[0]);
    // 몸통 · 갓: 높이에 따라 반폭이 달라지는 네모 기둥(t0 → t1, 반폭 r0 → r1 · 반폭 몫), 면마다 fill(P, 면 폭, 면 높이, 밝기)
    const box=(t0,t1,r0,r1,fill)=>{const C=[[-1,-1,0,-1],[1,-1,1,0],[1,1,0,1],[-1,1,-1,0]];
      for(let i=0;i<4;i++){const [ax,ay,nx,ny]=C[i],[bx,by]=C[(i+1)%4],A0=proj(x+ax*half*r0,y+ay*half*r0,Ht*t0),B0=proj(x+bx*half*r0,y+by*half*r0,Ht*t0),A1=proj(x+ax*half*r1,y+ay*half*r1,Ht*t1),B1=proj(x+bx*half*r1,y+by*half*r1,Ht*t1);if(!A0||!B0||!A1||!B1)continue;
        if((B0[0]-A0[0])*(A1[1]-A0[1])-(B0[1]-A0[1])*(A1[0]-A0[0])<=0)continue;
        const k=.88+.12*(nx*Ld[0]+ny*Ld[1]);fill([B0,A0,A1,B1],Math.hypot(B0[0]-A0[0],B0[1]-A0[1]),Math.hypot(B1[0]-B0[0],B1[1]-B0[1]),k)}
      return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([cx,cy])=>proj(x+cx*half*r1,y+cy*half*r1,Ht*t1))};
    const wr=t=>.86+.2*t;   // 아래가 좁고 위가 넓은 통나무
    box(0,.06,wr(0),wr(.06),(P,w,h,k)=>quad(P,LOC,wood.map(v=>v*k*.8),[0,0,0],NO,NO,1));
    box(.06,.46,wr(.06),wr(.46),(P,w,h,k)=>{const text=!onTop&&w>sPx*.5;quad(P,LOC,woodL.map(v=>v*k),ink,text?glyph(uv,w,h,.86):NO,guv,text?2:1)});   // 출구 번호
    box(.46,.82,wr(.46),wr(.82),(P,w,h,k)=>quad(P,LOC,[k,k,k],[0,0,0],NO,FU,3));   // 얼굴
    box(.82,.86,1.28,1.28,(P,w,h,k)=>quad(P,LOC,hatC.map(v=>v*k*.85),[0,0,0],NO,NO,1));   // 갓 테
    box(.86,.89,.92,.92,(P,w,h,k)=>quad(P,LOC,hatC.map(v=>v*k),[0,0,0],NO,NO,1));
    box(.89,.95,.92,.92,(P,w,h,k)=>quad(P,LOC,lc.map(v=>v*k),[0,0,0],NO,NO,1));   // 관모 노선색 띠
    const T=box(.95,1,.92,male?.92:.7,(P,w,h,k)=>quad(P,LOC,hatC.map(v=>v*k),[0,0,0],NO,NO,1));
    if(T.every(p=>p)){const xs=T.map(p=>p[0]),ys=T.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      const TL=T.map(p=>[(p[0]-x0)/Math.max(1e-3,x1-x0),(y1-p[1])/Math.max(1e-3,y1-y0)]);quad(T,TL,onTop?lc:hatC.map(v=>v*1.1),[1,1,1],onTop?glyph(uv,x1-x0,y1-y0,.78):NO,guv,onTop?2:1)}   // 위에서 보면 관모 윗면에 번호
    torch(...order[1]);
  }
}
