// 승강장 막대와 출구 통로(줌 16+)를 지도 GL 에 그리는 층. id 는 예전 그대로 'station-names'(역 이름은 따로 symbol 층).
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
    const selected=this.d.getSelected(),exits=this.d.getExits(),stationAlpha=this.d.getStationAlpha(),coaster=this.d.isCoaster(),simcity=this.d.isSimcity();
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
      const points=r.center?r.coords.map(c=>maplibregl.MercatorCoordinate.fromLngLat(c)):null;
      // 출구가 한쪽 끝 밖에 몰린 역: 가까운 막대 끝 → 통로 끝(stopReach)을 이 역 출구가 붙을 수 있는 통로로
      let reach=null;if(points&&r.reach){const q=maplibregl.MercatorCoordinate.fromLngLat(r.reach),a=points[0],b=points[points.length-1];reach=[Math.hypot(q.x-a.x,q.y-a.y)<Math.hypot(q.x-b.x,q.y-b.y)?a:b,q]}
      geo.set(k,{points,reach,cx,cy,ax:ax*flip,ay:ay*flip,len,h,col,id:k.slice(k.lastIndexOf(':')+1)});
    }
    // zoom 16+: each exit hangs off its station by a short passage (drawn first, so the box covers its root)
    if(!pointsOnly&&z>=EXIT_MINZOOM){
      const byStation=new Map();for(const g of geo.values()){if(!byStation.has(g.id))byStation.set(g.id,[]);byStation.get(g.id).push(g)}
      const w=Math.max(3,Math.min(5,hgt*.18)),pass=[];
      for(const [id,boxes] of byStation)for(const [lon,lat] of exits[id]||[]){
        if(simcity&&cityViaduct.hasStair(id,lon,lat))continue;   // city-life: 심시티 — an exit with a stair down from the platform needs no flat passage line; the ones without keep it
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
    if(coaster||simcity){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false)}else gl.disable(gl.DEPTH_TEST);   // coaster: platforms and exit passages follow the exit pillars' building occlusion   // city-life: cityOn — 심시티 too (its buildings are opaque; the bars floated over them, and over the viaduct)
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,data.length/15);
  }
}
