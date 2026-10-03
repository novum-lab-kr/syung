// 88열차 — the coaster mode's trains, drawn as the 88 Train (서울어린이대공원, 1984–2012; see scratchpad/city/train/research.md).
//
// Low open cars with rows of high-backed seats and riders in them, a bar across each row, a rounded nose on the lead car
// wearing the round "88" plate, and the livery from the Seoul style pack (stylePack.train.coaster88): cream upper body,
// cherry-red skirt under a gold belt, dark-teal frame, seats and wheels. The line's colour stays on every car — the
// headrests, the lead car's headboard and the tail car's end (livery 'B', the default); zoomed out, where those are a
// pixel, the train rides its own line's track, which names the line. (Livery 'C' instead paints the skirt and roof in the
// line's colour below LINE_MIX — tried and set aside: a green car on the green track vanished into it.)
//
// One instanced draw a level of detail: the car is a static mesh in unit space (a_x along the car × L px, a_p across and
// up × W px, W the body width TrainLayer draws at), and every car on screen is an instance — its frame on the track from
// TrainLayer (base, F along, R across, U up: it climbs, banks and turns over in the loop), L, W, the line colour and
// front/back flags. Parts a car does not have (the nose on a middle car, an empty seat's rider) collapse in the vertex
// shader; the riders throw their arms up when the car dives (F points down). The night bulbs along the belt are point
// sprites with park_night's lamp. Depth: the cars test against the walls, rides and track in the overlay's depth buffer
// and write their own, so the seats sit inside the tub at any angle.
//
//   const c88=new CoasterTrain(SEOUL_CITY_STYLE.train.coaster88); c88.init(gl);
//   c88.begin(ox,oy); c88.car(frame,L,W,rgb,front,back)…; c88.draw(gl,M,ox,oy,{zoom,unit,walls,occlude,dark,shadow,pixelRatio}); c88.dispose(gl)

import { BULB_FS, bulbSize, compile, hexRGB, lightsOn, lightsOff } from './park_night.mjs';
import { SEOUL_CITY_STYLE } from './city_style_seoul.mjs';

const SUN = (v => { const l = Math.hypot(...v); return v.map(c => c / l) })([-.30, .46, .84]);   // as park_rides: +x east, +y south, +z up — a high south-western sun
const LINE_MIX = [15.2, 16.6];      // zoom: below the first the skirt and roof are the line's colour, above the second the livery's
const LOD_MID = 11, LOD_HI = 22;    // W px: wheels and a rounder nose from LOD_MID, bars, arms and the full nose from LOD_HI (riders at every level)
const INST = 19;                    // floats an instance
const fnv1a = s => { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 };

// ── the car, in unit space ───────────────────────────────────────────────────────────────────────
// x along the car in units of L (0 the rear, 1 the front) plus an offset in W; y across (±.5 the body sides); z up, in W.
const TUB0 = .16, TUBH = .40, WALL = .06, NOSE = .62, FLOOR = TUB0 + .02;
// parts: how the fragment shader paints a vertex
const P_FLAT = 0, P_SIDE = 1, P_PLATE = 2, P_LINE = 4, P_FOOT = 5, P_HEAD = 6, P_SHIRT = 8, P_ARM = 9, P_FACE = 10, P_HAIR = 11;   // 8–11: a rider (a_slot = its seat)
// palette slots (u_pal): the livery, then the people — the riders wear what the platform's walkers wear (roundPerson in the runtime: SKIN, SHIRTS, HAIR)
const S_CREAM = 0, S_RED = 1, S_GOLD = 2, S_TEAL = 3, S_SEAT = 4, S_BAR = 5, S_CHASSIS = 6, S_WHEEL = 7, S_DECK = 8, S_SKIN = 9, S_SHIRT = 10, SHIRTS = 7, S_HAIR = 17, HAIRS = 4, PAL = 24;
const SKIN = [.97, .82, .68], HAIR = [[.16, .12, .1], [.3, .2, .12], [.1, .1, .12], [.45, .3, .18]],
  SHIRTS_RGB = [[.95, .38, .35], [.3, .58, .92], [1, .8, .2], [.36, .74, .48], [.66, .5, .88], [.98, .62, .32], [.95, .95, .96]];
// visibility: 0 every car · 1 lead cars only · 2 all but the lead · 3 tail cars only
const V_ALL = 0, V_LEAD = 1, V_NOTLEAD = 2, V_TAIL = 3;

const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] };

class Mesh {
  constructor() { this.d = []; this.n = 0 }
  // a vertex: x (× L), p (× W), normal, part, slot, visibility — 10 floats
  v(x, p, n, part, slot, vis) { this.d.push(x, p[0], p[1], p[2], n[0], n[1], n[2], part, slot, vis); this.n++ }
  quad(x, A, B, C, D, o, n) { for (const p of [A, B, C, A, C, D]) this.v(x, p, n, o.part, o.slot, o.vis) }
  // a box between two along-positions (x0 + ex0·W … x1 + ex1·W), y0..y1, z0..z1; faces: which of +x −x +y −y +z −z to draw
  slab(x0, ex0, x1, ex1, y0, y1, z0, z1, o, faces = 'XxYyZz') {
    const P = (x, ex, y, z) => [x, [ex, y, z]], q = (face, a, b, c, d, n) => { if (!faces.includes(face)) return;
      for (const [x, p] of [a, b, c, a, c, d]) this.v(x, p, n, o.part, o.slot, o.vis) };
    const A = (y, z) => P(x0, ex0, y, z), B = (y, z) => P(x1, ex1, y, z);
    q('X', B(y0, z0), B(y1, z0), B(y1, z1), B(y0, z1), [1, 0, 0]);
    q('x', A(y1, z0), A(y0, z0), A(y0, z1), A(y1, z1), [-1, 0, 0]);
    q('Y', A(y1, z0), B(y1, z0), B(y1, z1), A(y1, z1), [0, 1, 0]);
    q('y', B(y0, z0), A(y0, z0), A(y0, z1), B(y0, z1), [0, -1, 0]);
    q('Z', A(y0, z1), B(y0, z1), B(y1, z1), A(y1, z1), [0, 0, 1]);
    q('z', A(y1, z0), B(y1, z0), B(y0, z0), A(y0, z0), [0, 0, -1]);
  }
  // a box at one along-position x, centred (cx, cy, cz) in W with half extents h
  box(x, c, h, o, faces = 'XxYyZz') { this.slab(x, c[0] - h[0], x, c[0] + h[0], c[1] - h[1], c[1] + h[1], c[2] - h[2], c[2] + h[2], o, faces) }
  buffer() { return new Float32Array(this.d) }
}

// the nose of the lead car: a loft from the tub's front (x = L) to the tip, elliptical in plan, its top the sloping plate
function nose(M, rings) {
  const prof = t => ({ w: .5 * Math.sqrt(Math.max(0, 1 - t * t)) + .06 * t, z: TUB0 + TUBH * (1 - .55 * Math.pow(t, 1.4)), x: NOSE * t });
  const side = { part: P_FLAT, slot: S_RED, vis: V_LEAD }, plate = { part: P_PLATE, slot: S_CREAM, vis: V_LEAD };
  for (let i = 0; i < rings; i++) {
    const a = prof(i / rings), b = prof((i + 1) / rings), dx = b.x - a.x, dw = a.w - b.w, dz = a.z - b.z;
    // the two sides, outward normals (the taper turns them forward), and the plate on top, its normal up and forward
    M.quad(1, [a.x, -a.w, TUB0], [a.x, -a.w, a.z], [b.x, -b.w, b.z], [b.x, -b.w, TUB0], side, norm([dw, -dx, 0]));
    M.quad(1, [a.x, a.w, TUB0], [b.x, b.w, TUB0], [b.x, b.w, b.z], [a.x, a.w, a.z], side, norm([dw, dx, 0]));
    M.quad(1, [a.x, -a.w, a.z], [a.x, a.w, a.z], [b.x, b.w, b.z], [b.x, -b.w, b.z], plate, norm([dz, 0, dx]));
  }
  const t = prof(1);   // the tip: a small vertical cap
  M.quad(1, [t.x, -t.w, TUB0], [t.x, -t.w, t.z], [t.x, t.w, t.z], [t.x, t.w, TUB0], side, [1, 0, 0]);
}
// the lead car's headboard: a plate leaning back over the front wall, the line's colour (the 행선 panel)
function headboard(M) {
  const o = { part: P_LINE, slot: S_TEAL, vis: V_LEAD }, z0 = TUB0 + TUBH, z1 = z0 + .17, lean = .11, hw = .34, th = .03, nb = norm([-(z1 - z0), 0, -lean]), nf = norm([z1 - z0, 0, lean]);
  M.quad(1, [-th, -hw, z0], [-th, hw, z0], [-th - lean, hw, z1], [-th - lean, -hw, z1], o, nb);      // back face (seen from the camera behind the train)
  M.quad(1, [0, hw, z0], [0, -hw, z0], [-lean, -hw, z1], [-lean, hw, z1], o, nf);                    // front face
  M.quad(1, [-th - lean, -hw, z1], [-th - lean, hw, z1], [-lean, hw, z1], [-lean, -hw, z1], o, [0, 0, 1]);   // top edge
  for (const s of [-1, 1]) M.quad(1, [0, s * hw, z0], [-lean, s * hw, z1], [-th - lean, s * hw, z1], [-th, s * hw, z0], o, [0, s, 0]);
}
// the tail car's end: a board in the line's colour over the rear wall, and two tail lamps
function tailboard(M) {
  M.slab(0, -.025, 0, 0, -.46, .46, TUB0 + .04, TUB0 + TUBH + .02, { part: P_LINE, slot: S_TEAL, vis: V_TAIL }, 'xYyZ');
  for (const s of [-1, 1]) M.box(0, [-.03, s * .3, TUB0 + TUBH * .55], [.012, .06, .05], { part: P_FLAT, slot: S_RED, vis: V_TAIL }, 'xYyZz');
}
function chassis(M, wheels) {
  M.slab(0, .02, 1, -.02, -.44, .44, .08, TUB0, { part: P_FLAT, slot: S_CHASSIS, vis: V_ALL }, 'XxYyz');   // its top is the tub's floor
  if (wheels) for (const x of [.14, .86]) for (const s of [-1, 1]) M.box(x, [0, s * .31, .075], [.075, .045, .075], { part: P_FLAT, slot: S_WHEEL, vis: V_ALL }, 'XxYyz');
}
function footprint(M) {   // the ground shadow's quad, a little wider than the car (its edge is softened in the shader)
  M.slab(0, -.12, 1, .12, -.62, .62, 0, 0, { part: P_FOOT, slot: 0, vis: V_ALL }, 'Z');
}
// the open tub: walls with thickness (outer face painted, inner face and rim in the frame's teal), the deck
function tub(M) {
  const outer = { part: P_SIDE, slot: S_CREAM, vis: V_ALL }, inner = { part: P_FLAT, slot: S_TEAL, vis: V_ALL }, deck = { part: P_FLAT, slot: S_DECK, vis: V_ALL }, z0 = TUB0, z1 = TUB0 + TUBH;
  for (const s of [-1, 1]) {   // side walls, between the end walls
    const yo = s * .5, yi = s * (.5 - WALL);
    M.slab(0, WALL, 1, -WALL, Math.min(yo, yi), Math.max(yo, yi), z0, z1, outer, s > 0 ? 'Y' : 'y');
    M.slab(0, WALL, 1, -WALL, Math.min(yo, yi), Math.max(yo, yi), z0, z1, inner, (s > 0 ? 'y' : 'Y') + 'Z');
  }
  M.slab(1, -WALL, 1, 0, -.5, .5, z0, z1, outer, 'X');  M.slab(1, -WALL, 1, 0, -.5, .5, z0, z1, inner, 'xZ');   // front wall (inside the nose on the lead car)
  M.slab(0, 0, 0, WALL, -.5, .5, z0, z1, outer, 'x');   M.slab(0, 0, 0, WALL, -.5, .5, z0, z1, inner, 'XZ');   // rear wall
  M.slab(0, WALL, 1, -WALL, -.5 + WALL, .5 - WALL, FLOOR, FLOOR, deck, 'Z');                                    // the deck
}
// rows of two high-backed seats and the riders in them, at every level of detail (the people are the point of the ride): zoomed out
// their heads stay big, toy-like (hs), so a 7 px car still shows who is aboard without making the bodies stand above the tub.
// The bar across each row and the arms appear close up only.
// Which seats are taken, and in what, the vertex shader decides from the car's seed and the seat's number (a_slot).
function seats(M, rows, lod) {
  const seat = { part: P_FLAT, slot: S_SEAT, vis: V_ALL }, head = { part: P_HEAD, slot: S_SEAT, vis: V_ALL }, bar = { part: P_FLAT, slot: S_BAR, vis: V_ALL };
  const rs = lod === 0 ? 1.5 : lod === 1 ? 1.2 : 1, hs = lod === 0 ? 1.8 : lod === 1 ? 1.35 : 1, full = lod > 1;
  // Keep bodies and hair just ahead of the backrest's front face (-.07 W), including the enlarged low-zoom heads.
  const bodyX = .05 * rs - .065, headX = Math.max(bodyX - .01, .052 * hs - .065);
  for (let i = 0; i < rows; i++) {
    const x = (i + .5) / rows;
    for (const s of [-1, 1]) {
      const y = s * .215, k = i * 2 + (s > 0 ? 1 : 0);   // k: the seat's number in the car (its rider's hash)
      M.box(x, [.03, y, FLOOR + .035], [.11, .095, .035], seat, 'XxYyZ');               // cushion
      M.box(x, [-.095, y, FLOOR + .07 + .13], [.025, .095, .13], seat, 'XxYyZ');         // back
      M.box(x, [-.095, y, FLOOR + .07 + .26 + .045], [.025, .075, .045], head, 'XxYyZ'); // headrest
      // the rider: shirt, face, hair on top, and arms thrown up on the drops
      const shirt = { part: P_SHIRT, slot: k, vis: V_ALL }, face = { part: P_FACE, slot: k, vis: V_ALL }, hair = { part: P_HAIR, slot: k, vis: V_ALL }, arm = { part: P_ARM, slot: k, vis: V_ALL };
      const z0 = FLOOR + .07, hz = z0 + .2 * rs + .055 * hs + .005;
      M.box(x, [bodyX, y, z0 + .1 * rs], [.05 * rs, .07 * rs, .1 * rs], shirt, 'XxYyZ');
      M.box(x, [headX, y, hz], [.045 * hs, .045 * hs, .055 * hs], face, 'XxYy');
      M.box(x, [headX, y, hz + .055 * hs], [.052 * hs, .052 * hs, .02 * hs], hair, 'XxYyZ');
      if (full) for (const t of [-1, 1]) M.box(x, [bodyX, y + t * .085, z0 + .19 + .13], [.02, .02, .13], arm, 'XxYyZ');
    }
    if (full) M.box(x, [.1, 0, FLOOR + .21], [.022, .5 - WALL, .022], bar, 'XxZz');     // the bar across the row
  }
}
// the whole car at a level of detail: 0 the tub, seats and big riders (no wheels or bars, a 3-ring nose) · 1 wheels and a rounder nose · 2 arms, bars and the full nose
function buildCar(lod, rows) {
  const M = new Mesh();
  chassis(M, lod > 0); headboard(M); tailboard(M); nose(M, lod ? (lod > 1 ? 10 : 6) : 3);
  tub(M); seats(M, rows, lod);
  return M.buffer();
}
// the night bulbs: along the belt both sides, one at the nose tip, two red at the tail. a_b = (x, y, z, kind)
function buildBulbs() {
  const d = [], zb = TUB0 + TUBH * .46;
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) d.push((i + .5) / 5, s * .53, zb, 0);
  d.push(1, 0, TUB0 + TUBH * .5, 1);   // (the nose tip is NOSE·W ahead: the shader adds it)
  for (const s of [-1, 1]) d.push(0, s * .3, TUB0 + TUBH * .55, 2);
  return new Float32Array(d);
}

// ── shaders ──────────────────────────────────────────────────────────────────────────────────────
const CAR_VS = `#version 300 es
precision highp float;
in float a_x;in vec3 a_p;in vec3 a_n;in float a_part;in float a_slot;in float a_vis;
in vec3 i_o;in vec3 i_F;in vec3 i_R;in vec3 i_U;in vec2 i_LW;in vec3 i_rgb;in float i_flag;in float i_seed;
uniform mat4 u_matrix;uniform float u_unit,u_pass;uniform vec2 u_shadow;uniform vec3 u_pal[${PAL}];
out vec3 v_loc;out vec3 v_n;flat out vec3 v_rgb;flat out vec3 v_col;flat out float v_part;flat out float v_slot;flat out vec2 v_LW;
float hash1(float n){return fract(sin(n*12.9898)*43758.5453);}
void main(){
  bool front=mod(i_flag,2.)>.5,back=mod(floor(i_flag/2.),2.)>.5,shadow=u_pass>.5;
  bool hide=(a_vis==1.&&!front)||(a_vis==2.&&front)||(a_vis==3.&&!back)||((a_part==5.)!=shadow);
  v_col=vec3(0.);
  if(a_part>7.5){   // a rider: 70–90 % of a car's seats are taken, fixed by the car's seed and the seat (nothing flickers or changes), each in their own shirt and hair; the arms only on a drop
    float seat=a_slot,occ=.7+.2*hash1(i_seed*5.3+.7),h=hash1(seat*7.31+i_seed*53.17+.5);
    if(h>occ)hide=true;
    if(a_part==9.&&i_F.z>-.22)hide=true;
    int part=int(a_part+.5);
    v_col=part==10?u_pal[${S_SKIN}]:part==11?u_pal[${S_HAIR}+int(floor(hash1(seat*3.3+i_seed*41.)*${HAIRS}.))]:u_pal[${S_SHIRT}+int(floor(hash1(seat*5.+i_seed*97.)*${SHIRTS}.))];
  }
  if(hide){gl_Position=vec4(2.,2.,2.,1.);return;}
  float L=i_LW.x,W=i_LW.y;
  vec3 loc=vec3(a_x*L+a_p.x*W,a_p.y*W,a_p.z*W);   // px in the car's frame: along, across, up
  vec3 w=i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit;
  if(shadow){w=i_o+(i_F*loc.x+i_R*loc.y)*u_unit;w.z=0.;w.xy+=u_shadow*u_unit;}   // on the ground under the car, offset as the sun throws it
  gl_Position=u_matrix*vec4(w,1.);
  v_loc=loc;v_n=i_F*a_n.x+i_R*a_n.y+i_U*a_n.z;v_rgb=i_rgb;v_part=a_part;v_slot=a_slot;v_LW=i_LW;
}`;
const CAR_FS = `#version 300 es
precision highp float;
in vec3 v_loc;in vec3 v_n;flat in vec3 v_rgb;flat in vec3 v_col;flat in float v_part;flat in float v_slot;flat in vec2 v_LW;
uniform float u_pass,u_alpha,u_lineMix,u_headrest,u_amb,u_dif,u_riderLight;uniform vec3 u_pal[${PAL}];uniform vec3 u_light;
out vec4 o;
float ink(float d){float a=max(.18,fwidth(d)*.65);return 1.-smoothstep(-a,a,d);}
float ring(vec2 p,vec2 c,float r,float t){return abs(length(p-c)-r)-t;}
// "88": two digits side by side across the car, each two rings stacked along it; h the digit height, t the stroke
float eight(vec2 p,vec2 c,float h,float t){float r=h*.25;return min(ring(p,c+vec2(r,0.),r,t),ring(p,c-vec2(r,0.),r,t));}
float d88(vec2 p,vec2 c,float h,float t){float g=h*.6;return min(eight(p,c-vec2(0.,g*.5),h,t),eight(p,c+vec2(0.,g*.5),h,t));}
void main(){
  float W=v_LW.y,L=v_LW.x;
  if(u_pass>.5){   // the ground shadow: the footprint, its edge softened as the trains' are
    float edge=max(abs(v_loc.y)-W*.5,max(-v_loc.x,v_loc.x-L));
    float a=(1.-smoothstep(-.4,2.4,edge))*.22*u_alpha;o=vec4(vec3(.09,.13,.16)*a,a);return;}
  int part=int(v_part+.5);vec3 col;
  vec3 cream=u_pal[0],red=u_pal[1],gold=u_pal[2];
  vec3 skirt=mix(red,v_rgb,u_lineMix);   // zoomed out the skirt is the line's colour
  if(part==1){   // the body side: cream over the gold belt, the skirt under it (z up from the tub's floor)
    float z=v_loc.z-${TUB0}*W,H=${TUBH}*W,b0=H*.46,bh=max(.5,H*.05);
    col=cream;col=mix(col,skirt,ink(z-b0));col=mix(col,gold,ink(abs(z-b0)-bh));
  }else if(part==2){   // the nose plate: cream, the round red emblem with "88" in it, as the zoom allows
    vec2 p=vec2(v_loc.x-L,v_loc.y);float nl=${NOSE}*W,r=min(nl*.36,W*.3);vec2 c=vec2(nl*.46,0.);
    col=cream;col=mix(col,red,ink(length(p-c)-r)*smoothstep(12.,17.,W));
    col=mix(col,cream,ink(d88(p,c,r*1.05,max(.55,r*.11)))*smoothstep(20.,27.,W));
  }else if(part==4)col=v_rgb;                                  // headboard, tail board: the line
  else if(part==6)col=u_headrest>.5?v_rgb:u_pal[4];            // headrests: the line's colour, or the seat's
  else if(part>=8)col=v_col;                                   // a rider
  else col=u_pal[int(v_slot+.5)];
  float nl=length(v_n),d=nl>1e-6?max(dot(v_n/nl,u_light),0.):0.;
  col*=part>=8?max(u_amb+u_dif*d,u_riderLight):u_amb+u_dif*d;   // riders keep a floor of light (at night their own car's festoon lights them)
  o=vec4(col,1.)*u_alpha;
}`;
const BULB_VS = `#version 300 es
precision highp float;
in vec4 a_b;
in vec3 i_o;in vec3 i_F;in vec3 i_R;in vec3 i_U;in vec2 i_LW;in vec3 i_rgb;in float i_flag;
uniform mat4 u_matrix;uniform float u_unit,u_size,u_core;uniform vec3 u_warm,u_red;
out vec3 v_rgb;out vec2 v_mix;
void main(){
  bool front=mod(i_flag,2.)>.5,back=mod(floor(i_flag/2.),2.)>.5;
  if(a_b.w==1.&&!front||a_b.w==2.&&!back){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}
  float L=i_LW.x,W=i_LW.y;
  vec3 loc=vec3(a_b.x*L+(a_b.w==1.?${NOSE}*W:0.),a_b.y*W,a_b.z*W);
  gl_Position=u_matrix*vec4(i_o+(i_F*loc.x+i_R*loc.y+i_U*loc.z)*u_unit,1.);
  gl_Position.z-=2.5e-4*gl_Position.w;   // a hair in front of the panel it hangs on
  gl_PointSize=u_size*(a_b.w==2.?1.15:1.);
  v_rgb=a_b.w==2.?u_red:u_warm;v_mix=vec2(u_core,.85);
}`;

const DEFAULT_STYLE = { bodyColors: { cream: '#F4E4BC', red: '#C94235', gold: '#E9AF32', teal: '#244D56' }, seat: '#723C31', safetyBar: '#C5C4B2', chassis: '#293A3F', bulbColor: '#FFD27E', nightMinBodyLight: .55 };

export class CoasterTrain {
  // livery: 'A' the line only on the headboard and tail · 'B' (default) and the headrests · 'C' and, zoomed out, the skirt and roof
  static livery = 'B';
  static last = null;   // what the last frame drew (the capture scripts read it)
  static dropped = 0; static repaired = 0;   // cars skipped (a NaN frame) or stood up (a degenerate one), ever
  constructor(style) {
    const S = { ...DEFAULT_STYLE, ...(style || SEOUL_CITY_STYLE?.train?.coaster88 || {}) }, C = { ...DEFAULT_STYLE.bodyColors, ...(S.bodyColors || {}) };
    const cream = hexRGB(C.cream), teal = hexRGB(C.teal), deck = cream.map((c, i) => c * .8 + teal[i] * .2);   // the deck: the cream, in the tub's shade
    this.pal = new Float32Array(PAL * 3);
    this.pal.set([...cream, ...hexRGB(C.red), ...hexRGB(C.gold), ...teal, ...hexRGB(S.seat), ...hexRGB(S.safetyBar), ...hexRGB(S.chassis), ...hexRGB('#1E2A2F'), ...deck, ...SKIN]);
    SHIRTS_RGB.forEach((c, i) => this.pal.set(c, (S_SHIRT + i) * 3)); HAIR.forEach((c, i) => this.pal.set(c, (S_HAIR + i) * 3));
    this.bulb = hexRGB(S.bulbColor); this.minLight = S.nightMinBodyLight ?? .55;
    this.inst = new Float32Array(INST * 512); this.n = 0; this.M = new Float32Array(16); this.flip = 0; this.seeds = new Map();
  }
  init(gl) {
    if (this.p) return;
    this.p = compile(gl, CAR_VS, CAR_FS);
    this.pb = compile(gl, BULB_VS, BULB_FS);
    const inst = ['i_o', 'i_F', 'i_R', 'i_U', 'i_LW', 'i_rgb', 'i_flag', 'i_seed'];
    this.attr = Object.fromEntries(['a_x', 'a_p', 'a_n', 'a_part', 'a_slot', 'a_vis', ...inst].map(n => [n, gl.getAttribLocation(this.p, n)]));
    this.attrB = Object.fromEntries(['a_b', ...inst].map(n => [n, gl.getAttribLocation(this.pb, n)]));
    this.uni = Object.fromEntries(['u_matrix', 'u_unit', 'u_pass', 'u_shadow', 'u_alpha', 'u_lineMix', 'u_headrest', 'u_amb', 'u_dif', 'u_riderLight', 'u_pal', 'u_light'].map(n => [n, gl.getUniformLocation(this.p, n)]));
    this.uniB = Object.fromEntries(['u_matrix', 'u_unit', 'u_size', 'u_core', 'u_warm', 'u_red', 'u_wt'].map(n => [n, gl.getUniformLocation(this.pb, n)]));
    // the meshes: levels 0, 1 and 2 for 2, 3 and 4 rows of seats; each with its own vertex array
    this.meshes = new Map();
    const mesh = (key, data, stride, pointers) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const va = gl.createVertexArray(); gl.bindVertexArray(va); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      for (const [loc, size, off] of pointers) if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off) }
      gl.bindVertexArray(null); this.meshes.set(key, { b, va, n: data.length / (stride / 4) });
    };
    const A = this.attr, carPtrs = [[A.a_x, 1, 0], [A.a_p, 3, 4], [A.a_n, 3, 16], [A.a_part, 1, 28], [A.a_slot, 1, 32], [A.a_vis, 1, 36]];
    for (const lod of [0, 1, 2]) for (const rows of [2, 3, 4]) mesh(lod + ':' + rows, buildCar(lod, rows), 40, carPtrs);   // a mesh a level of detail and a seat count
    { const F = new Mesh(); footprint(F); mesh('foot', F.buffer(), 40, carPtrs) }   // the shadow pass draws only this: two triangles a car
    mesh('bulbs', buildBulbs(), 16, [[this.attrB.a_b, 4, 0]]);
    // the instances: two stores used in turn, so a frame never writes over the one being drawn
    this.ib = [gl.createBuffer(), gl.createBuffer()]; this.cap = 0;
  }
  begin(ox, oy) { this.ox = ox; this.oy = oy; this.n = 0 }
  // a car: its frame on the track (base, F, R, U in mercator), L and W in px, the line's colour, whether it leads or trails,
  // and its train's id with its number in it (the seed its riders are dealt from: the same people every frame)
  car(fr, L, W, rgb, front, back, key, j = 0) {
    if ((this.n + 1) * INST > this.inst.length) { const g = new Float32Array(this.inst.length * 2); g.set(this.inst); this.inst = g }
    const d = this.inst, i = this.n * INST;
    for (let k = 0; k < 12; k++) if (!Number.isFinite(fr[k])) { CoasterTrain.dropped++; return }   // (a NaN frame would rasterize anywhere)
    d[i] = fr[0] - this.ox; d[i + 1] = fr[1] - this.oy; d[i + 2] = fr[2];
    for (let k = 0; k < 9; k++) d[i + 3 + k] = fr[3 + k];
    if (Math.hypot(fr[9], fr[10], fr[11]) < .5) {   // a degenerate frame (its across vector along the car: no up) would draw the car flat — stand it up on the world's up
      const F = [fr[3], fr[4], fr[5]]; let R = [-F[1], F[0], 0], l = Math.hypot(R[0], R[1]); if (l < 1e-6) { R = [1, 0, 0]; l = 1 } R = [R[0] / l, R[1] / l, 0];
      const U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
      d[i + 6] = R[0]; d[i + 7] = R[1]; d[i + 8] = R[2]; d[i + 9] = U[0]; d[i + 10] = U[1]; d[i + 11] = U[2]; CoasterTrain.repaired++;
    }
    d[i + 12] = L; d[i + 13] = W; d[i + 14] = rgb[0]; d[i + 15] = rgb[1]; d[i + 16] = rgb[2]; d[i + 17] = (front ? 1 : 0) + (back ? 2 : 0);
    let s = this.seeds.get(key); if (s == null) { s = fnv1a(String(key)) / 4294967296; if (this.seeds.size > 4096) this.seeds.clear(); this.seeds.set(key, s) }
    d[i + 18] = (s + j * .6180339887) % 1;
    this.n++;
  }
  // the instance attributes on the bound vertex array, from the store filled this frame
  instancePointers(gl, A) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]);
    for (const [n, size, off] of [['i_o', 3, 0], ['i_F', 3, 12], ['i_R', 3, 24], ['i_U', 3, 36], ['i_LW', 2, 48], ['i_rgb', 3, 56], ['i_flag', 1, 68], ['i_seed', 1, 72]]) {
      const loc = A[n]; if (loc < 0) continue;
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, INST * 4, off); gl.vertexAttribDivisor(loc, 1);
    }
  }
  // o: zoom, unit (mercator a px), walls (depth in the buffer: test against it), occlude (alpha behind the walls),
  //    dark, shadow ([dx, dy] px the sun throws the shadow), pixelRatio
  draw(gl, M, ox, oy, o) {
    if (!this.n || !this.p) return;
    const MT = this.M; MT.set(M); for (let r = 0; r < 4; r++) MT[12 + r] = M[r] * ox + M[4 + r] * oy + M[12 + r];   // M · translate(origin), in double precision
    this.flip ^= 1; gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]);
    if (this.cap < this.inst.length) { gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW); this.cap = this.inst.length;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip ^ 1]); gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, this.ib[this.flip]) }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, this.n * INST);
    const W = this.inst[13], L = this.inst[12], lod = W < LOD_MID ? 0 : W < LOD_HI ? 1 : 2, rows = Math.max(2, Math.min(4, Math.round(L / W * 1.3)));
    const m = this.meshes.get(lod + ':' + rows), livery = CoasterTrain.livery;
    CoasterTrain.last = { n: this.n, lod, rows, W, L, zoom: o.zoom, dropped: CoasterTrain.dropped, repaired: CoasterTrain.repaired };
    const z = o.zoom, lineMix = livery === 'C' ? 1 - Math.min(1, Math.max(0, (z - LINE_MIX[0]) / (LINE_MIX[1] - LINE_MIX[0]))) : 0;
    gl.useProgram(this.p); gl.bindVertexArray(m.va); this.instancePointers(gl, this.attr);
    const U = this.uni; gl.uniformMatrix4fv(U.u_matrix, false, MT); gl.uniform1f(U.u_unit, o.unit); gl.uniform2f(U.u_shadow, o.shadow[0], o.shadow[1]);
    gl.uniform1f(U.u_lineMix, lineMix * lineMix * (3 - 2 * lineMix)); gl.uniform1f(U.u_headrest, livery === 'A' ? 0 : 1);
    gl.uniform1f(U.u_amb, o.dark ? Math.max(this.minLight, .62) : .64); gl.uniform1f(U.u_dif, o.dark ? .26 : .36); gl.uniform1f(U.u_riderLight, o.dark ? .85 : .78);
    gl.uniform3fv(U.u_pal, this.pal); gl.uniform3fv(U.u_light, SUN);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST);
    const pass = (mesh, p, alpha) => { gl.uniform1f(U.u_pass, p); gl.uniform1f(U.u_alpha, alpha); gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.n, this.n) };
    // behind the building walls: faint, before the cars have any depth of their own (no ghost of their hidden faces)
    gl.depthMask(false);
    if (o.walls && o.occlude) { gl.depthFunc(gl.GREATER); pass(m, 0, o.occlude) }
    gl.depthFunc(gl.LEQUAL);
    const foot = this.meshes.get('foot'); gl.bindVertexArray(foot.va); this.instancePointers(gl, this.attr); pass(foot, 1, 1);   // the ground shadow
    gl.bindVertexArray(m.va); this.instancePointers(gl, this.attr);
    gl.depthMask(true); pass(m, 0, 1); gl.depthMask(false);   // the cars, writing their depth: the seats sit inside the tub, the bulbs on its sides
    gl.bindVertexArray(null);
    if (o.dark && W >= LOD_MID) {   // the night: bulbs along the belt, warm; the tail lamps red
      const b = this.meshes.get('bulbs'), s = bulbSize(z, o.pixelRatio || 1, .5), UB = this.uniB;
      gl.useProgram(this.pb); gl.bindVertexArray(b.va); this.instancePointers(gl, this.attrB); lightsOn(gl);
      gl.uniformMatrix4fv(UB.u_matrix, false, MT); gl.uniform1f(UB.u_unit, o.unit); gl.uniform1f(UB.u_size, s.point); gl.uniform1f(UB.u_core, s.coreFrac);
      gl.uniform3fv(UB.u_warm, this.bulb); gl.uniform3f(UB.u_red, 1, .32, .22); gl.uniform2f(UB.u_wt, 1, .55);
      gl.drawArraysInstanced(gl.POINTS, 0, b.n, this.n);
      gl.bindVertexArray(null); lightsOff(gl); gl.depthMask(false);
    }
    gl.depthFunc(gl.LEQUAL);   // as TrainLayer left it: no depth writes, LEQUAL, blending on
  }
  dispose(gl) {
    if (!this.p) return;
    for (const m of this.meshes.values()) { gl.deleteBuffer(m.b); gl.deleteVertexArray(m.va) }
    for (const b of this.ib) gl.deleteBuffer(b);
    gl.deleteProgram(this.p); gl.deleteProgram(this.pb); this.p = null;
  }
}
export default CoasterTrain;
