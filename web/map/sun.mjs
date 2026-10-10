// 해 그림자: 건물마다 해 반대쪽으로 늘린 볼록 껍질(hull)을 화면 밖 마스크에 한 번씩 그려 겹쳐도 진해지지 않게, 한 투명도로 지도에 얹는 층.
// 바깥 값을 읽지 않는다(그림자 자료는 본체 updateSun 이 set 으로 넣는다).
export function hull(pts){pts=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const c=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];
  for(const p of pts){while(lo.length>1&&c(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
  for(const p of pts.reverse()){while(up.length>1&&c(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p)}
  return lo.slice(0,-1).concat(up.slice(0,-1))}
// Ground shadows: every hull is drawn once into an offscreen mask (so overlapping shadows don't stack
// up darker), then the mask is laid over the map at one opacity.
export class SunShadowLayer{
  constructor(){this.id='sun-shadows';this.type='custom';this.renderingMode='2d';this.geo=null;this.alpha=0}
  set(geo,alpha){this.geo=geo;this.alpha=alpha;this.dirty=true}
  onAdd(map,gl){
    this.map=map;
    const sh=(t,src)=>{const x=gl.createShader(t);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
    const prog=(v,f)=>{const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,v));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);return p};
    this.pMask=prog(`#version 300 es
in vec2 a;uniform mat4 m;void main(){gl_Position=m*vec4(a,0.,1.);}`,`#version 300 es
precision mediump float;out vec4 o;void main(){o=vec4(1.);}`);
    this.pComp=prog(`#version 300 es
in vec2 a;out vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`,`#version 300 es
precision mediump float;in vec2 uv;uniform sampler2D t;uniform vec4 c;out vec4 o;void main(){o=c*texture(t,uv).a;}`);
    this.buf=gl.createBuffer();this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
    this.tex=gl.createTexture();this.fbo=gl.createFramebuffer();this.w=0;this.h=0;
  }
  render(gl,options){
    if(!this.geo||!this.geo.data.length||this.alpha<=0)return;
    const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,prevFbo=gl.getParameter(gl.FRAMEBUFFER_BINDING),prevVp=gl.getParameter(gl.VIEWPORT);
    if(W!==this.w||H!==this.h){gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.tex,0);this.w=W;this.h=H}
    // 1) mask
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.STENCIL_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true,true,true,true);gl.bindVertexArray(null);   // MapLibre may leave masks / a VAO bound
    const M=options.defaultProjectionData.mainMatrix,MT=Array.from(M),{ox,oy}=this.geo;for(let r=0;r<4;r++)MT[12+r]=M[r]*ox+M[4+r]*oy+M[12+r];
    gl.useProgram(this.pMask);gl.uniformMatrix4fv(gl.getUniformLocation(this.pMask,'m'),false,new Float32Array(MT));
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);if(this.dirty){gl.bufferData(gl.ARRAY_BUFFER,this.geo.data,gl.DYNAMIC_DRAW);this.dirty=false}
    let loc=gl.getAttribLocation(this.pMask,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLES,0,this.geo.data.length/2);
    // 2) composite
    gl.bindFramebuffer(gl.FRAMEBUFFER,prevFbo);gl.viewport(prevVp[0],prevVp[1],prevVp[2],prevVp[3]);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.pComp);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform1i(gl.getUniformLocation(this.pComp,'t'),0);
    const a=this.alpha,C=this.color||[.11,.17,.2];gl.uniform4f(gl.getUniformLocation(this.pComp,'c'),C[0]*a,C[1]*a,C[2]*a,a);   // city-build: colour settable
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);loc=gl.getAttribLocation(this.pComp,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
}
