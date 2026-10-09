// Instanced buses and round bus-stop signs in the train overlay's WebGL2 context.
// All coordinates stay double precision until the view origin is subtracted.
const RAD = Math.PI / 180;
export function busMercator([lng, lat]) {
  return [lng / 360 + .5, .5 - Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2)) / (2 * Math.PI)];
}
export function projectBusPoint(matrix, x, y, z, width, height) {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (w <= 0) return null;
  return {x: (1 + (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w) * width / 2,
    y: (1 - (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w) * height / 2};
}
// 버스 크기(길이 = 3.1 × scale px): 멀리서(줌 15 미만)는 작게(약 19px) — 노선 위에서 서로 덜 겹치게,
// 가까이서는 줌 15 에서 약 37px 부터 18 에서 약 51px 까지(2026-10-08 덕배: 확대해도 너무 작았다)
export function busModelScale(zoom) { return zoom < 15 ? 6 : 12 + Math.max(0, Math.min(3, zoom - 15)) * 1.5; }
export function busPostScale(zoom) { return .8 + Math.max(0, Math.min(3, zoom - 15)) * .1; }

function meshBuilder() {
  const data = [];
  const quad = (a, b, c, d, n, material, uv = [[0,0],[1,0],[1,1],[0,1]]) => {
    const p = [a,b,c,d]; for (const i of [0,1,2,0,2,3]) data.push(...p[i], ...n, ...uv[i], material);
  };
  const box = (x0, y0, z0, x1, y1, z1, material, roof = material) => {
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],material);
    quad([x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0],material);
    quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0],material);
    quad([x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[-1,0,0],material);
    quad([x0,y1,z1],[x1,y1,z1],[x1,y0,z1],[x0,y0,z1],[0,0,1],roof);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1],material);
  };
  return {data, quad, box};
}

export function buildBusMesh() {
  const {data, quad, box} = meshBuilder();
  const rim = [[-1.5,-.39],[-1.39,-.5],[1.37,-.5],[1.55,-.34],[1.55,.34],[1.37,.5],[-1.39,.5],[-1.5,.39]];
  for (let i=0;i<rim.length;i++) {
    const a=rim[i], b=rim[(i+1)%rim.length], dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
    quad([...a,.24],[...b,.24],[...b,1.12],[...a,1.12],[dy/len,-dx/len,0],0);
    quad([...a,1.12],[...b,1.12],[b[0]*.97,b[1]*.9,1.22],[a[0]*.97,a[1]*.9,1.22],[dy/len,-dx/len,.7],1);
    const top = [a[0]*.97,a[1]*.9,1.22], next=[b[0]*.97,b[1]*.9,1.22];
    quad([0,0,1.22],top,next,next,[0,0,1],1);
  }
  // Five windows per side, separated by the coloured pillars; two white waist strips.
  for(const side of [-1,1]) {
    for(let i=0;i<5;i++) {
      const x=-1.28+i*.52;
      quad([x,side*.503,.64],[x+.43,side*.503,.64],[x+.43,side*.503,1.07],[x,side*.503,1.07],[0,side,0],4);
    }
    quad([-1.33,side*.504,.55],[1.30,side*.504,.55],[1.30,side*.504,.60],[-1.33,side*.504,.60],[0,side,0],7);
    // A narrow front door is visible on the right-hand side.
    if(side===1) box(.92,.505,.28,1.28,.512,1.08,4);
  }
  quad([1.556,-.33,.61],[1.556,.33,.61],[1.556,.33,1.07],[1.556,-.33,1.07],[1,0,0],4);
  quad([-1.506,.32,.68],[-1.506,-.32,.68],[-1.506,-.32,1.02],[-1.506,.32,1.02],[-1,0,0],4);
  for(const y of [-.25,.25]) {
    box(1.552,y-.065,.38,1.567,y+.065,.47,5);
    box(-1.516,y-.055,.35,-1.505,y+.055,.51,6);
  }
  box(-.7,-.25,1.22,-.12,.25,1.32,1); // roof ventilation, below the railway's visual scale
  // Route number is printed on the roof, not floated in a second canvas.
  quad([.0,.36,1.226],[1.27,.36,1.226],[1.27,-.36,1.226],[.0,-.36,1.226],[0,0,1],12);
  for(const x of [-1.01,.99]) for(const side of [-1,1]) {
    const outer=side*.56, inner=side*.43, z=.25, radius=.24;
    for(let i=0;i<12;i++) {
      const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;
      const A=[x+Math.cos(a)*radius,outer,z+Math.sin(a)*radius],B=[x+Math.cos(b)*radius,outer,z+Math.sin(b)*radius];
      quad([x,outer,z],A,B,B,[0,side,0],2);
      quad(A,[A[0],inner,A[2]],[B[0],inner,B[2]],B,[Math.cos((a+b)/2),0,Math.sin((a+b)/2)],2);
      const h=.095;
      quad([x,outer+side*.002,z],[x+Math.cos(a)*h,outer+side*.002,z+Math.sin(a)*h],
        [x+Math.cos(b)*h,outer+side*.002,z+Math.sin(b)*h],[x+Math.cos(b)*h,outer+side*.002,z+Math.sin(b)*h],[0,side,0],3);
    }
  }
  return new Float32Array(data);
}

// 조선 모드의 버스: 가마꾼 넷이 멘 가마. 버스와 같은 자리(길이 3.1 · 폭 1)를 차지하고, 지붕은 노선 색, 지붕 위에 노선 번호.
// 가마꾼의 다리(재료 20)는 엉덩이(z .45, uv.x = 그 x)를 축으로 셰이더가 흔든다: uv.y 의 부호가 왼발 · 오른발, |uv.y| − 1 이
// 그 사람의 걸음 위상(앞 둘 0, 뒤 둘 반 박자). 밤에는 앞 채 끝의 초롱(재료 29)이 빛난다
export function buildPalanquinMesh() {
  const {data, quad, box} = meshBuilder();
  const legBox = (x0, y0, z0, x1, y1, z1, uv) => {
    const U = [uv, uv, uv, uv];
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],20,U); quad([x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0],20,U);
    quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0],20,U); quad([x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[-1,0,0],20,U);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1],20,U);
  };
  // 2026-10-09 (Codex 리뷰): 객실을 키우고, 장대를 바깥으로, 가마꾼 넷을 앞뒤 · 좌우로 떨어뜨려 '네 사람이 상자를 멘' 실루엣으로
  // 가마채: 두 장대, 가마꾼 바깥 어깨 높이
  for (const y of [-.58, .58]) box(-1.55, y-.045, .78, 1.55, y+.045, .87, 27);
  // 가마: 밑틀, 붉은 몸체, 옆 · 앞의 발, 노선 색 지붕(재료 26)과 그 위 한지색 현판의 번호(재료 28)
  box(-.66, -.5, .36, .66, .5, .42, 27);
  box(-.62, -.46, .42, .62, .46, 1.06, 24);
  for (const side of [-1, 1]) quad([-.4,side*.462,.58],[.4,side*.462,.58],[.4,side*.462,.96],[-.4,side*.462,.96],[0,side,0],25);
  quad([.622,-.3,.5],[.622,.3,.5],[.622,.3,.98],[.622,-.3,.98],[1,0,0],25);
  const E = [[-.72,-.58],[.72,-.58],[.72,.58],[-.72,.58]], T = [[-.57,-.26],[.57,-.26],[.57,.26],[-.57,.26]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = E[i], b = E[j], c = T[j], d = T[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, l = Math.hypot(mx, my);
    quad([...a, 1.06], [...b, 1.06], [...c, 1.34], [...d, 1.34], [mx / l * .7, my / l * .7, .72], 26);
  }
  quad([-.72,-.58,1.06],[-.72,.58,1.06],[.72,.58,1.06],[.72,-.58,1.06],[0,0,-1],24);
  quad([-.57,.26,1.341],[.57,.26,1.341],[.57,-.26,1.341],[-.57,-.26,1.341],[0,0,1],26);
  quad([-.55,.24,1.343],[.55,.24,1.343],[.55,-.24,1.343],[-.55,-.24,1.343],[0,0,1],28);
  // 가마꾼 넷: 흰 바지 · 저고리, 밝은 패랭이(위에서 보면 작은 밝은 원). 바깥 팔은 장대를 받친다
  [[1.22, .5, 0], [1.22, -.5, 0], [-1.22, .5, .5], [-1.22, -.5, .5]].forEach(([x, y, k]) => {
    for (const s of [-1, 1]) legBox(x - .05, y + s * .07 - .045, 0, x + .05, y + s * .07 + .045, .46, [x, s * (1 + k)]);
    box(x - .1, y - .14, .45, x + .1, y + .14, .78, 21);
    const out = Math.sign(y); box(x - .035, y + out * .12, .55, x + .035, y + out * .19, .84, 21);
    box(x - .07, y - .07, .78, x + .07, y + .07, .92, 22);
    box(x - .13, y - .13, .92, x + .13, y + .13, .94, 23); box(x - .065, y - .065, .94, x + .065, y + .065, 1.01, 23);
  });
  box(1.42, .51, .56, 1.56, .65, .76, 29);   // 초롱, 앞 채 끝에 매달려
  box(1.485, .575, .76, 1.495, .585, .8, 27);
  return new Float32Array(data);
}

export function buildBusPostMesh() {
  const {data,quad,box}=meshBuilder();
  box(-.75,-.75,.8,.75,.75,18,9);
  for(let i=0;i<32;i++){
    const a=i*Math.PI/16,b=(i+1)*Math.PI/16,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
    // A low circular foot, with a bevel, anchors the charcoal post.
    quad([ca*2.7,sa*2.7,.08],[cb*2.7,sb*2.7,.08],[cb*2.3,sb*2.3,1],[ca*2.3,sa*2.3,1],[ca,sa,.4],9);
    quad([0,0,1],[ca*2.3,sa*2.3,1],[cb*2.3,sb*2.3,1],[cb*2.3,sb*2.3,1],[0,0,1],9);
    const A=[ca*7.5,.42,18+sa*7.5],B=[cb*7.5,.42,18+sb*7.5];
    quad([0,.42,18],A,B,B,[0,1,0],8,[[.5,.5],[(ca+1)/2,(sa+1)/2],[(cb+1)/2,(sb+1)/2],[(cb+1)/2,(sb+1)/2]]);
    quad([A[0],-.42,A[2]],[B[0],-.42,B[2]],B,A,[ca,0,sa],10);
  }
  return new Float32Array(data);
}

const VS=`#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv; layout(location=3) in float a_material;
layout(location=4) in vec4 i_pose; layout(location=5) in vec4 i_color; layout(location=6) in vec4 i_info;
uniform mat4 u_matrix; uniform float u_unit,u_pitch,u_time;
out vec3 v_normal; out vec2 v_uv; out vec4 v_color; flat out float v_material; flat out vec2 v_info;
void main(){float c=cos(i_pose.z),s=sin(i_pose.z);vec3 pos=a_pos,normal=a_normal;
  // The raised disc faces the camera, like the exit signs. The post stays upright.
  // This also keeps the pictogram legible in journey's flat-camera fit.
  if(abs(a_material-8.)<.2||abs(a_material-10.)<.2){float y=pos.y,z=pos.z-18.;
    pos.y=sin(u_pitch)*y-cos(u_pitch)*z;pos.z=18.+cos(u_pitch)*y+sin(u_pitch)*z;
    normal.y=sin(u_pitch)*a_normal.y-cos(u_pitch)*a_normal.z;normal.z=cos(u_pitch)*a_normal.y+sin(u_pitch)*a_normal.z;}
  // 가마꾼(조선 모드): 달리는 동안(i_info.w) 다리가 엉덩이를 축으로 흔들리고, 가마와 사람이 걸음마다 살짝 들썩인다
  float run=i_info.w,ph=6.2832*(u_time*1.7+i_info.z);
  if(a_material>19.5&&a_material<20.5){float k=abs(a_uv.y)-1.,a=run*.5*sin(ph+6.2832*k)*sign(a_uv.y),ca=cos(a),sa=sin(a);
    vec2 d=vec2(pos.x-a_uv.x,pos.z-.45);pos.x=a_uv.x+ca*d.x-sa*d.y;pos.z=.45+sa*d.x+ca*d.y;}
  pos.z+=run*.03*abs(sin(ph));
  vec3 p=pos*i_pose.w*u_unit;
  p.xy=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+i_pose.xy;
  gl_Position=u_matrix*vec4(p,1.); v_normal=vec3(c*normal.x-s*normal.y,s*normal.x+c*normal.y,normal.z);
  v_uv=a_uv;v_color=i_color;v_material=a_material;v_info=i_info.xy;}`;
const FS=`#version 300 es
precision highp float; in vec3 v_normal; in vec2 v_uv; in vec4 v_color; flat in float v_material; flat in vec2 v_info;
uniform float u_dark,u_rows,u_fade; uniform sampler2D u_atlas; out vec4 outColor;
float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float shape(float d){return 1.-smoothstep(-fwidth(d),fwidth(d),d);}
void main(){vec3 col=v_color.rgb; float alpha=v_color.a;float m=v_material;
  if(m>10.5&&m<11.5){float d=length((v_uv-.5)*2.);alpha*=.22*(1.-smoothstep(.35,1.,d));col=vec3(.08,.10,.10);}
  else if(m>12.5&&m<13.5){float t=v_uv.x;alpha*=u_dark*.42*(1.-t)*(1.-t)*(1.-abs(v_uv.y*2.-1.));col=vec3(1.,.94,.68);}
  else {
    if(m>.5&&m<1.5)col=mix(v_color.rgb,vec3(.94,.95,.91),.18);
    else if(m<2.5&&m>1.5)col=vec3(.075,.09,.095);
    else if(m<3.5&&m>2.5)col=vec3(.53,.57,.57);
    else if(m<4.5&&m>3.5)col=mix(vec3(.14,.29,.35),vec3(.18,.29,.32),u_dark)+vec3(.09)*smoothstep(.30,.90,v_uv.y);
    else if(m<5.5&&m>4.5)col=mix(vec3(.78,.82,.76),vec3(1.,.98,.78),u_dark);
    else if(m<6.5&&m>5.5)col=vec3(.89,.15,.10);
    else if(m<7.5&&m>6.5)col=vec3(.9,.92,.86);
    else if(m<9.5&&m>8.5)col=mix(vec3(.22,.24,.25),vec3(.30,.32,.33),u_dark);
    else if(m<10.5&&m>9.5)col=vec3(.75,.59,.10);
    else if(m>19.5&&m<20.5)col=vec3(.843,.796,.698);   // 가마꾼: 바지 #D7CBB2, 저고리 #F1E7D3, 얼굴 #C99372, 패랭이 #C5AC79
    else if(m>20.5&&m<21.5)col=vec3(.945,.906,.827);
    else if(m>21.5&&m<22.5)col=vec3(.788,.576,.447);
    else if(m>22.5&&m<23.5)col=vec3(.773,.675,.475);
    else if(m>23.5&&m<24.5)col=mix(vec3(.537,.243,.196),vec3(.439,.255,.224),u_dark);   // 가마: 붉은 칠 #893E32 · 밤 #704139, 발 #D9C6A3, 노선 색 지붕, 채 #594331 · 밤 #8A7050
    else if(m>24.5&&m<25.5)col=vec3(.851,.776,.639)*(.93+.07*step(.5,fract(v_uv.y*9.)));
    else if(m>25.5&&m<26.5)col=v_color.rgb*.95;
    else if(m>26.5&&m<27.5)col=mix(vec3(.349,.263,.192),vec3(.541,.439,.314),u_dark);
    else if(m>28.5&&m<29.5)col=mix(vec3(.80,.32,.20),vec3(1.,.827,.604),u_dark);   // 초롱 #FFD39A: 밤에는 스스로 빛난다
    if(abs(m-8.)<.2){
      vec2 p=(v_uv-.5)*2.;float r=length(p);
      float ring=shape(abs(r-.82)-.025);
      float body=shape(roundedBox(p-vec2(0.,.015),vec2(.38,.41),.11));
      float tyres=shape(roundedBox(vec2(abs(p.x)-.25,p.y+.43),vec2(.07,.09),.02));
      float bumper=shape(roundedBox(p+vec2(0.,.28),vec2(.43,.065),.04));
      float window=shape(roundedBox(p-vec2(0.,.15),vec2(.28,.18),.025));
      float lamps=shape(length(vec2(abs(p.x)-.245,p.y+.20))-.048);
      float ink=max(ring,max(max(body,tyres),bumper)*(1.-max(window,lamps)));
      col=mix(mix(vec3(1.,.83,.08),vec3(1.,.89,.28),u_dark),vec3(.07,.08,.08),ink);
    }
    if(abs(m-28.)<.2){   // 가마 지붕 위 현판: 한지 #F2E6CE 에 먹색 #282A26 번호, 가장자리는 노선 색
      float index=v_info.x;vec2 cell=vec2(mod(index,4.),floor(index/4.));
      float ink=texture(u_atlas,(cell+vec2(v_uv.x,1.-v_uv.y))/vec2(4.,u_rows)).a,e=min(min(v_uv.x,1.-v_uv.x)*2.3,min(v_uv.y,1.-v_uv.y));
      col=e<.09?v_color.rgb:mix(vec3(.949,.902,.808),vec3(.157,.165,.149),ink);
    }
    if(abs(m-12.)<.2){
      float index=v_info.x;vec2 cell=vec2(mod(index,4.),floor(index/4.));
      vec2 uv=(cell+vec2(v_uv.x,1.-v_uv.y))/vec2(4.,u_rows);
      float ink=texture(u_atlas,uv).a;
      col=mix(v_color.rgb*.92,vec3(1.),ink);
    }
    float lit=.74+.26*max(dot(normalize(v_normal),normalize(vec3(-.5,.65,1.))),0.);
    if(abs(m-5.)>.2&&abs(m-6.)>.2&&abs(m-8.)>.2&&!(abs(m-29.)<.2&&u_dark>.5))col*=lit;
    if(v_info.y>.5&&(m<.5||abs(m-24.)<.2))col=mix(col,vec3(1.),.2);
  }
  alpha*=u_fade;if(alpha<.005)discard;outColor=vec4(col*alpha,alpha);
}`;

function program(gl) {
  const shaders=[]; const p=gl.createProgram();
  for(const [kind,src] of [[gl.VERTEX_SHADER,VS],[gl.FRAGMENT_SHADER,FS]]) {
    const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
    gl.attachShader(p,s);shaders.push(s);
  }
  gl.linkProgram(p);for(const s of shaders)gl.deleteShader(s);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
}
function effectMesh(beam) {
  const {data,quad}=meshBuilder();
  if(beam)quad([1.56,-.4,.04],[5.2,-1.25,.04],[5.2,1.25,.04],[1.56,.4,.04],[0,0,1],13);
  else quad([-1.7,-.7,.02],[1.7,-.7,.02],[1.7,.7,.02],[-1.7,.7,.02],[0,0,1],11);
  return new Float32Array(data);
}

export class BusRenderer {
  constructor(){this.matrix=new Float32Array(16);this.stats={vehicles:0,stops:0,drawCalls:0};}
  init(gl){
    if(this.gl===gl&&this.p)return;
    this.gl=gl;this.p=program(gl);this.texture=gl.createTexture();this.atlasKey=null;
    this.u=Object.fromEntries(['matrix','unit','pitch','dark','rows','atlas','fade','time'].map(k=>[k,gl.getUniformLocation(this.p,'u_'+k)]));
    this.batches=[buildBusMesh(),buildBusPostMesh(),effectMesh(false),effectMesh(true),buildPalanquinMesh()].map(data=>{
      const vao=gl.createVertexArray(),mesh=gl.createBuffer(),instances=gl.createBuffer();gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      for(const [loc,n,offset] of [[0,3,0],[1,3,3],[2,2,6],[3,1,8]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,36,offset*4);}
      gl.bindBuffer(gl.ARRAY_BUFFER,instances);
      for(const [loc,n,offset] of [[4,4,0],[5,4,4],[6,4,8]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,48,offset*4);gl.vertexAttribDivisor(loc,1);}
      return {vao,mesh,instances,count:data.length/9,capacity:0,staging:new Float32Array(0)};
    });gl.bindVertexArray(null);
  }
  atlas(names){
    const labels=[...new Set(names)].sort(),key=labels.join('|');
    if(key===this.atlasKey)return;
    this.atlasKey=key;this.labels=new Map(labels.map((s,i)=>[s,i]));this.rows=Math.max(1,Math.ceil(labels.length/4));
    const canvas=document.createElement('canvas');canvas.width=4*192;canvas.height=this.rows*64;
    const ctx=canvas.getContext('2d');ctx.font='800 48px "Noto Sans KR",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
    labels.forEach((label,i)=>ctx.fillText(label,(i%4+.5)*192,(Math.floor(i/4)+.5)*64,178));
    const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  // occlude: 건물 뒤에 가린 부분을 비치게 그릴 불투명도(열차와 같은 값 — 1 - 건물 불투명도, 심시티 · 롤코의 꽉 찬 건물이면 0)
  // joseon: 조선 모드 — 버스 대신 가마(가마꾼은 v.moving 인 동안 달린다, v.phase 로 저마다 다른 걸음), 밤의 전조등 대신 초롱
  render(gl,matrix,{origin,unit,pitch=Math.PI/4,dark,vehicles,stops,occlude=0,joseon=false,time=0}){
    this.stats={vehicles:vehicles.length,stops:stops.length,drawCalls:0};
    if(!vehicles.length&&!stops.length)return;
    this.init(gl);this.atlas(vehicles.map(v=>v.label));
    this.matrix.set(matrix);for(let i=0;i<4;i++)this.matrix[12+i]=matrix[i]*origin[0]+matrix[4+i]*origin[1]+matrix[12+i];
    gl.useProgram(this.p);gl.uniformMatrix4fv(this.u.matrix,false,this.matrix);gl.uniform1f(this.u.unit,unit);gl.uniform1f(this.u.dark,dark?1:0);
    gl.uniform1f(this.u.pitch,pitch);gl.uniform1f(this.u.time,time);
    gl.uniform1f(this.u.rows,this.rows);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(this.u.atlas,0);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(this.u.fade,1);
    const draw=(batch,items,writeDepth)=>{
      if(!items.length)return;
      if(batch.staging.length<items.length*12)batch.staging=new Float32Array(2**Math.ceil(Math.log2(items.length*12)));
      const data=batch.staging;
      items.forEach((v,i)=>data.set([v.world[0]-origin[0],v.world[1]-origin[1],v.yaw,v.scale,...v.rgb,v.alpha??1,this.labels.get(v.label)||0,v.selected?1:0,v.phase||0,joseon&&v.moving?1:0],i*12));
      gl.bindVertexArray(batch.vao);gl.bindBuffer(gl.ARRAY_BUFFER,batch.instances);
      if(batch.capacity!==data.length){gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);batch.capacity=data.length;}
      gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,items.length*12);gl.depthMask(writeDepth);
      gl.drawArraysInstanced(gl.TRIANGLES,0,batch.count,items.length);this.stats.drawCalls++;
    };
    // 열차처럼: 먼저 건물 뒤(GREATER)만 흐리게 — 깊이를 쓰기 전이라 버스 자기 면끼리는 걸리지 않는다 — 그다음 앞을 그대로
    const body=this.batches[joseon?4:0];
    if(occlude>0){gl.depthFunc(gl.GREATER);gl.uniform1f(this.u.fade,occlude);draw(body,vehicles,false);draw(this.batches[1],stops,false);
      gl.depthFunc(gl.LEQUAL);gl.uniform1f(this.u.fade,1);}
    draw(this.batches[2],vehicles,false);draw(body,vehicles,true);draw(this.batches[1],stops,true);
    if(dark&&!joseon)draw(this.batches[3],vehicles,false);
    // Isolate divisors in our VAOs; TrainLayer/ExitPillars use the default VAO.
    gl.bindVertexArray(null);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);
  }
  dispose(){
    if(!this.gl)return;const gl=this.gl;
    for(const b of this.batches||[]){gl.deleteBuffer(b.mesh);gl.deleteBuffer(b.instances);gl.deleteVertexArray(b.vao);}
    gl.deleteTexture(this.texture);gl.deleteProgram(this.p);this.p=null;this.gl=null;
  }
}
