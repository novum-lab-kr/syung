// 서양식 · 근대 건물 부품(덕수궁 석조전 · 중명전 · 정관헌 · 돈덕전 · 창경궁 대온실 · 운현궁 양관 …): 한옥 부품(monuments_hanok.mts)과 따로 둔다 —
// 단청 · 기와 처마가 아니라 돌 · 벽돌 · 회벽 · 유리 벽에 슬레이트 지붕, 정면 기둥 현관(포치) · 베란다 · 난간을 얹는다. 각 구역 파일이 윤곽 사각(Rect)을 넘겨 짓는다.
// 앞(−y)이 정면. 치수는 윤곽(OSM)에서 읽고, 층 높이 · 창 크기 · 지붕 경사 · 기둥 굵기는 사진 비례 근사다(건물마다 주석에 출처 / 근사 표시).
// 창은 한지 창호(K.window, 밤 격자 불빛)가 아니라 서양식 유리창(K.pane, 격자 없음)이다.
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';

export interface Portico { cols:number; depth:number; pediment?:boolean; balcony?:boolean; noStairs?:boolean }
// 둘레 기둥 줄(정관헌 · 돈덕전): post 기둥 종류, depth 퇴 폭, sides 가 참이면 양옆과 뒤도, floors 층마다(기본 1), rail 이면 기둥 사이 난간
export interface Veranda { post:number; depth:number; sides?:boolean; floors?:number; rail?:boolean; thin?:number }
// 한쪽 옆 2층 베란다(중명전 서쪽): 바닥 판 + 아래 가는 기둥 + 난간. side −1 = 왼옆(−x) · 1 = 오른옆(+x)
export interface SideBalcony { side:-1 | 1; depth:number }
export interface WesternLook {
  floors:number; storey:number; wall:number;
  plinth?:number; plinthKind?:number;                      // 높은 지층(석조전) — 높이 · 종류
  roof:'hip' | 'gable' | 'flat'; roofKind?:number; roofRise:number; eave?:number;
  portico?:Portico; veranda?:Veranda; sideBalcony?:SideBalcony;
  bayWidth?:number;                                         // 창 간격(기본 3.4 m)
  trim?:number;                                             // 띠 · 기둥 종류(기본 K.trim 흰 돌)
  frame?:number;                                            // 창틀 · 난간 색(기본 trim) — 돈덕전 청록
  glass?:boolean;                                           // 벽 대신 유리(대온실) — 흰 가는 골조를 온 면에
  arch?:boolean;                                            // 위가 둥근 아치 창
  plinthWindows?:boolean;                                   // 높은 지층에 작은 창(석조전)
  terrace?:number;                                          // 앞 테라스 깊이(석조전) — 둘레 난간 + 가운데 계단
  balustrade?:boolean;                                      // 포치 발코니 · 테라스 난간
}

// ── 난간 · 창 ─────────────────────────────────────────────────────────────────────────────────────────────────
// 난간 한 줄(축에 맞춰): 손잡이 + 아래 가로대 + 일정한 간격의 난간동자. 높이 0.9 m 는 사진 비례 근사
function railX(w:MeshWriter, x0:number, x1:number, y:number, z:number, kind:number, skip?:(x:number) => boolean):void {
  const h = .9, step = .6, count = Math.max(1, Math.round((x1 - x0) / step));
  w.box(x0, x1, y - .07, y + .07, z + h - .08, z + h + .04, kind, { bottom: true });
  w.box(x0, x1, y - .06, y + .06, z + .06, z + .16, kind, { bottom: true, top: true });
  for (let i = 0; i <= count; i++) { const x = x0 + (x1 - x0) * i / count; if (skip?.(x)) continue; w.box(x - .035, x + .035, y - .035, y + .035, z + .16, z + h - .08, kind, { bottom: true, top: true }) }
}
function railY(w:MeshWriter, x:number, y0:number, y1:number, z:number, kind:number):void {
  const h = .9, step = .6, count = Math.max(1, Math.round((y1 - y0) / step));
  w.box(x - .07, x + .07, y0, y1, z + h - .08, z + h + .04, kind, { bottom: true });
  w.box(x - .06, x + .06, y0, y1, z + .06, z + .16, kind, { bottom: true, top: true });
  for (let i = 0; i <= count; i++) { const y = y0 + (y1 - y0) * i / count; w.box(x - .035, x + .035, y - .035, y + .035, z + .16, z + h - .08, kind, { bottom: true, top: true }) }
}

// 창 하나: 틀(위가 둥글면 반원) 위에 유리창 한 겹. pt(u, z, off) = 면 위의 점 — u 는 면을 따라, off 는 벽에서 바깥으로 띄운 거리
type FacePoint = (u:number, z:number, off:number) => V3;
function windowAt(w:MeshWriter, pt:FacePoint, nrm:V3, center:number, half:number, z0:number, z1:number, look:WesternLook):void {
  const frame = look.frame ?? look.trim ?? K.trim;
  const draw = (hw:number, bottom:number, top:number, off:number, kind:number):void => {
    if (!look.arch) { w.quad(pt(center - hw, bottom, off), pt(center + hw, bottom, off), pt(center + hw, top, off), pt(center - hw, top, off), kind, nrm); return }
    const spring = top - hw, segs = 6;
    w.quad(pt(center - hw, bottom, off), pt(center + hw, bottom, off), pt(center + hw, spring, off), pt(center - hw, spring, off), kind, nrm);
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI * i / segs, a1 = Math.PI * (i + 1) / segs;
      w.tri(pt(center, spring, off), pt(center + hw * Math.cos(a0), spring + hw * Math.sin(a0), off), pt(center + hw * Math.cos(a1), spring + hw * Math.sin(a1), off), kind, nrm);
    }
  };
  draw(half, z0, z1, .05, frame);
  draw(half - .12, z0 + .12, z1 - .1, .07, K.pane);
  w.quad(pt(center - .03, z0 + .12, .09), pt(center + .03, z0 + .12, .09), pt(center + .03, z1 - .2 - (look.arch ? half : 0), .09), pt(center - .03, z1 - .2 - (look.arch ? half : 0), .09), frame, nrm);   // 가운데 문설주
}

// 창 한 줄: 앞면(0) 뒷면(1) 왼옆(2) 오른옆(3)
function windows(w:MeshWriter, hx:number, hy:number, z0:number, z1:number, bay:number, look:WesternLook, face:number, skip:(t:number) => boolean, margin = .7):void {
  const len = face < 2 ? hx * 2 : hy * 2, n = Math.max(1, Math.round(len / bay)), step = len / n, half = Math.min(1.1, step * .34);
  const nrm:V3 = face === 0 ? [0, -1, 0] : face === 1 ? [0, 1, 0] : face === 2 ? [-1, 0, 0] : [1, 0, 0];
  const pt:FacePoint = (u, z, off) => (face === 0 ? [u, -hy - off, z] : face === 1 ? [u, hy + off, z] : face === 2 ? [-hx - off, u, z] : [hx + off, u, z]);
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + step * (i + .5);
    if (skip(t)) continue;
    windowAt(w, pt, nrm, t, half, z0 + margin, z1 - margin, look);
  }
}

// ── 정면 기둥 현관 ─────────────────────────────────────────────────────────────────────────────────────────────
// 바닥 판 · 기둥 줄 · 들보 · (삼각 박공) · (2층 발코니 + 난간) · 앞 계단. 원기둥은 8각으로 줄여 짓는다
function portico(w:MeshWriter, hx:number, hy:number, base:number, top:number, p:Portico, look:WesternLook):void {
  const trim = look.trim ?? K.trim, frame = look.frame ?? trim, width = Math.min(hx * 2 * .55, Math.max(p.cols * 2.6, 6)) / 2, front = -hy - p.depth;
  w.box(-width - .6, width + .6, front - .3, -hy, base - .4, base, K.granite, { bottom: true });                  // 현관 바닥
  for (let k = 0; k < p.cols; k++) { const x = p.cols === 1 ? 0 : -width + 2 * width * k / (p.cols - 1); w.prism(x, front + .2, .42, base, top - .5, trim, 8) }   // 기둥
  w.box(-width - .5, width + .5, front - .15, -hy + .2, top - .5, top + .2, trim, { bottom: true });              // 들보
  if (p.pediment) {   // 삼각 박공: 들보 위에 앞뒤 두 장
    const rise = Math.min(2.2, width * .28);
    w.tri([-width - .5, front - .15, top + .2], [width + .5, front - .15, top + .2], [0, front - .15, top + .2 + rise], trim, [0, -1, 0]);
    const slope = (sx:number) => w.quad([sx * (width + .5), front - .15, top + .2], [sx * (width + .5), -hy + .2, top + .2], [0, -hy + .2, top + .2 + rise], [0, front - .15, top + .2 + rise], K.slate, [sx * .3, 0, 1]);
    slope(1); slope(-1);
  }
  if (p.balcony) {   // 2층 발코니: 바닥 판 + 앞 · 양옆 난간(바닥 판이 현관 지붕 아래)
    const z = top - 1.7;
    w.box(-width - .5, width + .5, front - .1, -hy, z, z + .2, trim, { bottom: true });
    if (look.balustrade) { railX(w, -width - .4, width + .4, front - .02, z + .2, frame); railY(w, -width - .4, front - .02, -hy, z + .2, frame); railY(w, width + .4, front - .02, -hy, z + .2, frame) }
  }
  if (!p.noStairs) for (let k = 0; k < 4; k++) w.box(-2.2, 2.2, front - (k + 1) * .32, front - k * .32, 0, base * (1 - (k + 1) / 5), K.granite, { bottom: true });   // 앞 계단 4단
}

// 앞 테라스(석조전): 지층 높이의 돌 판 + 둘레 난간 + 가운데 계단. 깊이는 사진 비례 근사
function terrace(w:MeshWriter, hx:number, hy:number, plinth:number, depth:number, look:WesternLook):void {
  const frame = look.frame ?? look.trim ?? K.trim, x = hx + .6, y = -hy - depth, gap = 2.6;
  w.box(-x, x, y, -hy, plinth - .5, plinth, K.granite, { bottom: true });
  if (look.balustrade) {
    railX(w, -x, x, y + .08, plinth, frame, t => Math.abs(t) < gap);
    railY(w, -x, y, -hy, plinth, frame); railY(w, x, y, -hy, plinth, frame);
  }
  const steps = 7, rise = plinth / (steps + 1);
  for (let k = 0; k < steps; k++) w.box(-gap, gap, y - (k + 1) * .36, y - k * .36 + .02, 0, plinth - rise * (k + 1), K.granite, { bottom: true });   // 가운데 계단
}

// ── 둘레 퇴(베란다) ───────────────────────────────────────────────────────────────────────────────────────────
// 퇴 폭 안쪽 띠만 판(바닥 · 지붕)으로 깐다 — 건물 위를 덮는 판은 없다. 기둥 사이 난간은 rail 이 참일 때
function veranda(w:MeshWriter, hx:number, hy:number, plinth:number, storey:number, v:Veranda, look:WesternLook):void {
  const d = v.depth, trim = look.trim ?? K.trim, frame = look.frame ?? v.post, floors = v.floors ?? 1, half = v.thin ?? .12;
  const x0 = -hx - (v.sides ? d : 0), x1 = hx + (v.sides ? d : 0), yFront = -hy - d, yBack = v.sides ? hy + d : hy;
  const strip = (z0:number, z1:number, kind:number):void => {   // 퇴 폭 띠(앞 · 뒤 · 양옆) — 몸통 위는 비운다
    w.box(x0 - .3, x1 + .3, yFront - .3, -hy, z0, z1, kind, { bottom: true });
    if (v.sides) { w.box(x0 - .3, -hx, -hy, yBack + .3, z0, z1, kind, { bottom: true }); w.box(hx, x1 + .3, -hy, yBack + .3, z0, z1, kind, { bottom: true }); w.box(-hx, hx, hy, yBack + .3, z0, z1, kind, { bottom: true }) }
  };
  for (let f = 0; f < floors; f++) {
    const z = plinth + f * storey, post = (x:number, y:number) => w.box(x - half, x + half, y - half, y + half, z, z + storey - .3, v.post, { bottom: true, top: true });
    const n = Math.max(2, Math.round((x1 - x0) / 2.6));
    for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, yFront);
    if (v.sides) {
      const m = Math.max(2, Math.round((yBack - yFront) / 2.6));
      for (let i = 0; i <= m; i++) { const y = yFront + (yBack - yFront) * i / m; post(x0, y); post(x1, y) }
      for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, yBack);
    }
    strip(z + storey - .3, z + storey, trim);                       // 퇴 지붕 판
    strip(z, z + .15, K.deck);                                     // 퇴 바닥
    if (v.rail) {
      railX(w, x0, x1, yFront, z + .15, frame);
      if (v.sides) { railY(w, x0, yFront, yBack, z + .15, frame); railY(w, x1, yFront, yBack, z + .15, frame); railX(w, x0, x1, yBack, z + .15, frame) }
    }
  }
}

// 한쪽 옆 2층 베란다: 바닥 판 · 가는 기둥 · 난간
function sideBalcony(w:MeshWriter, hy:number, hx:number, plinth:number, storey:number, b:SideBalcony, look:WesternLook):void {
  const trim = look.trim ?? K.trim, frame = look.frame ?? trim, xIn = b.side * hx, xOut = b.side * (hx + b.depth), lo = Math.min(xIn, xOut), hi = Math.max(xIn, xOut), z = plinth + storey;
  w.box(lo, hi, -hy, hy, z - .2, z, trim, { bottom: true });
  const n = Math.max(2, Math.round(hy * 2 / 2.8));
  for (let i = 0; i <= n; i++) { const y = -hy + hy * 2 * i / n; w.box(xOut - .11, xOut + .11, y - .11, y + .11, plinth, z - .2, trim, { bottom: true, top: true }) }
  railY(w, xOut, -hy, hy, z, frame); railX(w, lo, hi, -hy, z, frame); railX(w, lo, hi, hy, z, frame);
}

// 유리 온실의 흰 가는 골조: 네 면 세로 · 가로 살 + 지붕 서까래(유리 외피 위로 살짝 띄운다). 간격은 사진 비례 근사
function glassFrame(w:MeshWriter, hx:number, hy:number, plinth:number, H:number, look:WesternLook):void {
  const trim = look.trim ?? K.trim, post = .05, off = .05, nx = Math.max(2, Math.round(hx * 2 / 1.6)), ny = Math.max(2, Math.round(hy * 2 / 1.6));
  for (let i = 0; i <= nx; i++) { const x = -hx + hx * 2 * i / nx; w.box(x - post, x + post, -hy - off - .04, -hy - off + .04, plinth, H, trim, { bottom: true, top: true }); w.box(x - post, x + post, hy + off - .04, hy + off + .04, plinth, H, trim, { bottom: true, top: true }) }
  for (let i = 0; i <= ny; i++) { const y = -hy + hy * 2 * i / ny; w.box(-hx - off - .04, -hx - off + .04, y - post, y + post, plinth, H, trim, { bottom: true, top: true }); w.box(hx + off - .04, hx + off + .04, y - post, y + post, plinth, H, trim, { bottom: true, top: true }) }
  for (const z of [plinth + (H - plinth) * .5, H - .05]) {   // 가로 살: 중간 · 처마
    w.box(-hx - off - .05, hx + off + .05, -hy - off - .04, -hy - off + .04, z - .05, z + .05, trim, { bottom: true, top: true });
    w.box(-hx - off - .05, hx + off + .05, hy + off - .04, hy + off + .04, z - .05, z + .05, trim, { bottom: true, top: true });
    w.box(-hx - off - .04, -hx - off + .04, -hy - off, hy + off, z - .05, z + .05, trim, { bottom: true, top: true });
    w.box(hx + off - .04, hx + off + .04, -hy - off, hy + off, z - .05, z + .05, trim, { bottom: true, top: true });
  }
}
// 박공 지붕의 서까래(유리 위 흰 살)와 용마루 살
function glassRoofFrame(w:MeshWriter, hx:number, hy:number, base:number, top:number, o:number, look:WesternLook):void {
  const trim = look.trim ?? K.trim, n = Math.max(2, Math.round(hx * 2 / 1.6)), lift = .06;
  for (let i = 0; i <= n; i++) {
    const x = -hx - o + (hx + o) * 2 * i / n;
    w.quad([x - .05, -hy - o, base + lift], [x + .05, -hy - o, base + lift], [x + .05, 0, top + lift], [x - .05, 0, top + lift], trim, [0, -.6, 1]);
    w.quad([x - .05, hy + o, base + lift], [x + .05, hy + o, base + lift], [x + .05, 0, top + lift], [x - .05, 0, top + lift], trim, [0, .6, 1]);
  }
  w.box(-hx - o, hx + o, -.08, .08, top, top + .1, trim, { bottom: true });
}

export function westernBuilding(w:MeshWriter, hx:number, hy:number, look:WesternLook):void {
  const trim = look.trim ?? K.trim, plinth = look.plinth ?? .6, storey = look.storey, H = plinth + look.floors * storey, bay = look.bayWidth ?? 3.4;
  w.box(-hx, hx, -hy, hy, 0, plinth, look.plinthKind ?? K.granite, { bottom: true });
  w.box(-hx + .05, hx - .05, -hy + .05, hy - .05, plinth, H, look.glass ? K.glass : look.wall, { bottom: true, top: true });
  const porticoWidth = look.portico ? Math.min(hx * 2 * .55, Math.max(look.portico.cols * 2.6, 6)) / 2 + .6 : 0;
  const balcony = look.sideBalcony;
  if (look.plinthWindows && !look.glass) {   // 높은 지층의 낮은 창(석조전 지층 = 시종 대기실) — 정면 현관 앞은 비운다
    const low = { ...look, arch: false };
    for (let face = 0; face < 4; face++) windows(w, hx, hy, 0, plinth, bay, low, face, t => face === 0 && look.portico !== undefined && Math.abs(t) < porticoWidth, 1.0);
  }
  for (let floor = 0; floor < look.floors; floor++) {
    const z0 = plinth + floor * storey, z1 = z0 + storey;
    if (!look.glass) for (let face = 0; face < 4; face++) windows(w, hx, hy, z0, z1, bay, look, face, t => face === 0 && look.portico !== undefined && Math.abs(t) < porticoWidth);
    if (floor > 0 && !look.glass) w.box(-hx - .08, hx + .08, -hy - .08, hy + .08, z0 - .12, z0 + .12, trim, { bottom: true, top: true });   // 층 사이 띠
  }
  if (look.glass) glassFrame(w, hx, hy, plinth, H, look);
  w.box(-hx - .35, hx + .35, -hy - .35, hy + .35, H, H + .35, trim, { bottom: true });   // 처마 돌림띠
  const eave = look.eave ?? .5, roofKind = look.roofKind ?? K.slate;
  if (look.roof === 'flat') w.box(-hx - .1, hx + .1, -hy - .1, hy + .1, H + .35, H + .85, trim, { bottom: true });
  else if (look.roof === 'hip') {
    const run = look.roofRise * 1.45, hx1 = Math.max(.25, hx + eave - run), hy1 = Math.max(.25, hy + eave - run);
    w.frustum(0, 0, hx + eave, hy + eave, H + .35, hx1, hy1, H + .35 + look.roofRise, roofKind, { bottom: true });
  } else {   // 박공: 용마루가 긴 변 방향. 지붕 두 면 + 앞뒤 삼각 벽
    const top = H + .35 + look.roofRise, o = eave;
    w.quad([-hx - o, -hy - o, H + .35], [hx + o, -hy - o, H + .35], [hx + o, 0, top], [-hx - o, 0, top], roofKind, [0, -.6, 1]);
    w.quad([hx + o, hy + o, H + .35], [-hx - o, hy + o, H + .35], [-hx - o, 0, top], [hx + o, 0, top], roofKind, [0, .6, 1]);
    w.tri([-hx - o, -hy, H + .35], [-hx - o, hy, H + .35], [-hx - o, 0, top - .05], look.wall, [-1, 0, 0]);
    w.tri([hx + o, hy, H + .35], [hx + o, -hy, H + .35], [hx + o, 0, top - .05], look.wall, [1, 0, 0]);
    if (look.glass) glassRoofFrame(w, hx, hy, H + .35, top, o, look);
  }
  if (look.terrace) terrace(w, hx, hy, plinth, look.terrace, look);
  if (look.portico) portico(w, hx, hy, plinth, plinth + storey * Math.min(2, look.floors), { ...look.portico, noStairs: look.portico.noStairs || look.terrace !== undefined }, look);
  if (look.veranda) veranda(w, hx, hy, plinth, storey, look.veranda, look);
  if (balcony) sideBalcony(w, hy, hx, plinth, storey, balcony, look);
}

// place() 로 놓은 건물을 틀 안쪽 방향으로 (dx, dy) 미터 밀어 놓는다 — 윤곽 사각 안에서 본채만 뒤로 붙이고 현관 · 계단이 앞으로 나올 자리를 둘 때
export function shiftLocal(w:MeshWriter, dx:number, dy:number):void {
  if (!w.xf) return;
  const { x, y, cos, sin } = w.xf;
  w.xf = { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos, cos, sin };
}
