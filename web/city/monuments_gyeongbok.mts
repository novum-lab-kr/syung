// 경복궁 구역(광화문 · 이순신 · 세종대왕 동상(monuments_statues.mts) · 둘레 담장 · 궁 안 건물 — 궁 쪽은 monuments_palace.mts) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 공통 부품은 monument_parts.mts. 모드 · 테마 입력은 없다 — 어느 모드에서나 같은 모델 · 같은 실물 색.
import { MeshWriter, K, buildRoof, buildBrackets, bandBox } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { GATE_BASE_D as BASE_D, GATE_DECK_Z as Z0, PALACE_AT } from './monuments_data.mts';
import { PALACE_TREES } from './monuments_trees_data.mts';
import { PALACE_TORCHES } from './monuments_torches_data.mts';
import { buildPalaceWall, buildPalaceHalls, buildPalaceFrames } from './monuments_palace.mts';
import { buildYiSunsin, buildSejong } from './monuments_statues.mts';

// ── 광화문 ─────────────────────────────────────────────────────────────────────────────────────────────────
const BASE_W = 31;    // 육축 앞면 길이(지도 외곽) · 깊이 BASE_D 와 월대 윗면 높이 Z0(맞춤)는 monuments_data.mts(월대 위 보행자 들기도 쓴다)
const ARCHES = [{ cx: -7.8, w: 4, h: 4.7 }, { cx: 0, w: 4.8, h: 5.4 }, { cx: 7.8, w: 4, h: 4.7 }];   // 홍예(맞춤)
const archBottom = (x:number):number => {   // 그 x 에서 문 구멍의 위쪽 높이(월대 윗면 기준 · 구멍 아니면 0)
  for (const arch of ARCHES) { const half = arch.w / 2, d = x - arch.cx; if (Math.abs(d) <= half + 1e-6) { const spring = arch.h - half; return spring + Math.sqrt(Math.max(0, half * half - d * d)) } }
  return -1;
};
function buildGate(w:MeshWriter):void {
  const hw = BASE_W / 2, hd = BASE_D / 2, zTop = Z0 + 6, zBand = Z0 + 7;
  // 육축: 앞뒤 면(홍예 구멍을 뚫는다) · 구멍 안(천장 · 옆벽 · 바닥)
  w.box(-hw, hw, -hd, hd, 0, Z0, K.granite, { top: true });
  const step = .2, count = Math.round(BASE_W / step);
  for (let i = 0; i < count; i++) {
    const x0 = -hw + i * step, x1 = x0 + step, mid = (x0 + x1) / 2, open = archBottom(mid) >= 0;
    const z0 = open ? Z0 + archBottom(x0) : Z0, z1 = open ? Z0 + archBottom(x1) : Z0;
    for (const [y, n] of [[-hd, -1], [hd, 1]] as const) w.quad([x0, y, z0], [x1, y, z1], [x1, y, zTop], [x0, y, zTop], K.granite, [0, n, 0]);
    if (open) {
      w.quad([x0, -hd, z0], [x1, -hd, z1], [x1, hd, z1], [x0, hd, z0], K.tunnel, [0, 0, -1]);   // 천장
      w.quad([x0, -hd, Z0], [x1, -hd, Z0], [x1, hd, Z0], [x0, hd, Z0], K.deck, [0, 0, 1]);      // 바닥
    }
    w.quad([x0, -hd, zTop], [x1, -hd, zTop], [x1, hd, zTop], [x0, hd, zTop], K.granite, [0, 0, 1]);   // 윗면
  }
  for (const arch of ARCHES) {   // 구멍 옆벽(받침 높이까지) · 홍예 테두리(앞뒤로 살짝 도드라진 돌띠)
    const half = arch.w / 2, spring = arch.h - half;
    for (const side of [-1, 1]) w.quad([arch.cx + side * half, -hd, Z0], [arch.cx + side * half, hd, Z0], [arch.cx + side * half, hd, Z0 + spring], [arch.cx + side * half, -hd, Z0 + spring], K.tunnel, [-side, 0, 0]);
    for (const [y, n] of [[-hd, -1], [hd, 1]] as const) {
      const outerHalf = half + .55;
      for (let k = 0; k < 18; k++) {
        const a0 = Math.PI * k / 18, a1 = Math.PI * (k + 1) / 18;
        const p = (ang:number, r:number):V3 => [arch.cx + Math.cos(ang) * r, y + n * .14, Z0 + spring + Math.sin(ang) * r];
        w.quad(p(a0, half), p(a1, half), p(a1, outerHalf), p(a0, outerHalf), K.trim, [0, n, 0]);
      }
      for (const side of [-1, 1]) w.quad([arch.cx + side * half, y + n * .14, Z0], [arch.cx + side * outerHalf, y + n * .14, Z0], [arch.cx + side * outerHalf, y + n * .14, Z0 + spring], [arch.cx + side * half, y + n * .14, Z0 + spring], K.trim, [0, n, 0]);
    }
  }
  // 육축 위 검은 띠(벽돌 단 + 화방 무늬)
  w.box(-hw - .25, hw + .25, -hd - .25, hd + .25, zTop, zBand, K.band, { bottom: true });
  w.box(-hw - .45, hw + .45, -hd - .45, hd + .45, zBand, zBand + .16, K.granite, { bottom: true });
  buildPavilion(w, zBand + .16);
  buildWoldae(w);
}

// 문루: 하층 개방 · 상층 판문, 우진각 지붕 둘. base: 문루 바닥 높이. 높이(육축 위 12 m)는 사진 비례로 맞춘 값: 하층 처마 끝 3 m ·
// 하층 지붕이 상층 몸에 닿는 높이 4.7 m · 상층 처마 끝 7.4 m · 용마루 꼭대기 12 m
function buildPavilion(w:MeshWriter, base:number):void {
  const bandH = 1.1;
  // 하층: 기둥 4 × 3줄(x ±12 · ±4, y ±3.9 · 0), 열린 몸 안쪽은 어두운 면, 창방 · 공포 띠
  const lowerHx = 12, lowerHy = 3.9, lowerCol = base + 2.0;
  w.box(-lowerHx + .3, lowerHx - .3, -lowerHy + .2, lowerHy - .2, base, lowerCol, K.tunnel, { top: true });
  for (const x of [-lowerHx, -lowerHx / 3, lowerHx / 3, lowerHx]) for (const y of [-lowerHy, 0, lowerHy]) w.box(x - .3, x + .3, y - .3, y + .3, base, lowerCol, K.red, { bottom: true, top: true });
  bandBox(w, lowerHx + .45, lowerHy + .45, lowerCol - .4, lowerCol, K.dancheong, 0, .28);
  bandBox(w, lowerHx + .45, lowerHy + .45, lowerCol, lowerCol + bandH, K.dancheong, .3, 1);
  buildBrackets(w, lowerHx + .45, lowerHy + .45, lowerCol + .1);
  buildRoof(w, { hx: 15.9, hy: 6.6, ix: 11, iy: 3.7, z0: base + 2.84, rise: 1.7, lift: 1.15, flare: .9 }, { innerZ: lowerCol + bandH - .2, innerHx: lowerHx + .45, innerHy: lowerHy + .45 });
  // 상층: 기둥 4 × 3줄(x ±10.5 · ±3.5, y ±3.2 · 0), 판문 벽, 현판, 창방 · 공포 띠
  const upperHx = 10.5, upperHy = 3.2, upperFloor = base + 4.6, upperCol = upperFloor + 1.7, upperBase = upperFloor - .6;
  w.box(-upperHx + .15, upperHx - .15, -upperHy + .15, upperHy - .15, upperBase, upperCol, K.wood, { top: true });
  for (const x of [-upperHx, -upperHx / 3, upperHx / 3, upperHx]) for (const y of [-upperHy, 0, upperHy]) w.box(x - .28, x + .28, y - .28, y + .28, upperBase, upperCol, K.red, { bottom: true, top: true });
  bandBox(w, upperHx + .45, upperHy + .45, upperCol - .4, upperCol, K.dancheong, 0, .28);
  bandBox(w, upperHx + .45, upperHy + .45, upperCol, upperCol + bandH, K.dancheong, .3, 1);
  buildBrackets(w, upperHx + .45, upperHy + .45, upperCol + .1);
  // 현판: 앞면 가운데(검은 바탕 · 금빛 테두리와 글자 덩어리 — 글자 모양은 그리지 않는다). 사진에서 상층 가운데 칸 폭의 7할쯤
  const plaqueZ = upperFloor - .05, plaqueY = -upperHy - .16;
  w.quad([-2.5, plaqueY, plaqueZ], [2.5, plaqueY, plaqueZ], [2.5, plaqueY, plaqueZ + 1.65], [-2.5, plaqueY, plaqueZ + 1.65], K.plaque, [0, -1, 0], 0, 0, 1, 1);
  const upperEave = upperCol + bandH - .1, ridgeTop = Z0 + 19;   // 용마루 꼭대기가 월대 윗면에서 19 m
  buildRoof(w, { hx: 15, hy: 6, ix: 15 - 6, iy: 0, z0: upperEave, rise: ridgeTop - .62 - upperEave, lift: 1.3, flare: 1 }, { innerZ: upperCol + bandH - .2, innerHx: upperHx + .45, innerHy: upperHy + .45 });
}
// 월대(동서 48.7 m × 남북 29.7 m · 윗면 높이 1.1 m): 세 단 계단 · 어도 · 소맷돌 · 난간 · 해치 한 쌍
function buildWoldae(w:MeshWriter):void {
  const halfW = 24.35, yN = -BASE_D / 2, yS = yN - 29.7;
  for (let tier = 0; tier < 3; tier++) {   // 아래 단일수록 바깥으로 0.8 · 0.4 · 0 (윗단 모서리는 월대 윗면 치수)
    const out = .4 * (2 - tier), z0 = Z0 / 3 * tier, z1 = Z0 / 3 * (tier + 1);
    w.box(-halfW - out, halfW + out, yS - out, yN, z0, z1, K.granite, { bottom: true, top: true });
    w.quad([-halfW - out, yS - out, z1], [halfW + out, yS - out, z1], [halfW + out, yN, z1], [-halfW - out, yN, z1], tier === 2 ? K.deck : K.trim, [0, 0, 1]);
  }
  // 어도 앞 계단 셋(가운데 7 m)
  for (let k = 0; k < 3; k++) w.box(-3.5, 3.5, yS - .8 - (2 - k) * .8, yS - .8 + 0, Z0 / 3 * k, Z0 / 3 * (k + 1), K.trim, { top: false });
  // 소맷돌(어도 계단 양쪽 비탈 돌): 낮은 앞끝에서 월대 윗면 난간 높이로 오른다
  for (const side of [-1, 1]) {
    const xa = side * 3.5, xb = side * 4.2, yFront = yS - 2.4, yBack = yS + .6;
    w.quad([xa, yFront, .45], [xb, yFront, .45], [xb, yBack, Z0 + 1.0], [xa, yBack, Z0 + 1.0], K.trim, [0, 0, 1]);
    w.quad([xb, yFront, 0], [xb, yBack, 0], [xb, yBack, Z0 + 1.0], [xb, yFront, .45], K.trim, [side, 0, 0]);
    w.quad([xa, yFront, 0], [xa, yBack, 0], [xa, yBack, Z0 + 1.0], [xa, yFront, .45], K.trim, [-side, 0, 0]);
    w.quad([xa, yFront, 0], [xb, yFront, 0], [xb, yFront, .45], [xa, yFront, .45], K.trim, [0, -1, 0]);
    buildHaechi(w, side * 4.9, yFront - .9);
  }
  // 난간석: 월대 윗면 가장자리(동 · 서 · 남쪽, 어도 7 m 는 비운다)와 육축 양옆 북쪽 변. 돌 동자주 · 위아래 난간대
  const rail = (ax:number, ay:number, bx:number, by:number, out:V3) => {
    const len = Math.hypot(bx - ax, by - ay), count = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= count; i++) { const t = i / count, x = ax + (bx - ax) * t, y = ay + (by - ay) * t; w.box(x - .17, x + .17, y - .17, y + .17, Z0, Z0 + 1.15, K.trim, { bottom: true }); w.box(x - .12, x + .12, y - .12, y + .12, Z0 + 1.15, Z0 + 1.4, K.trim, { bottom: true }) }
    const nx = Math.abs(out[0]) ? .1 : 0, ny = Math.abs(out[1]) ? .1 : 0, x0 = Math.min(ax, bx) - nx, x1 = Math.max(ax, bx) + nx, y0 = Math.min(ay, by) - ny, y1 = Math.max(ay, by) + ny;
    w.box(x0, x1, y0, y1, Z0 + .72, Z0 + .9, K.trim, { bottom: true }); w.box(x0, x1, y0, y1, Z0, Z0 + .22, K.trim, { bottom: true });
  };
  rail(-halfW + .2, yS + .2, -3.9, yS + .2, [0, -1, 0]); rail(3.9, yS + .2, halfW - .2, yS + .2, [0, -1, 0]);
  rail(-halfW + .2, yS + .2, -halfW + .2, yN - 1.2, [-1, 0, 0]); rail(halfW - .2, yS + .2, halfW - .2, yN - 1.2, [1, 0, 0]);
  rail(-halfW + .2, yN - .2, -BASE_W / 2 - .6, yN - .2, [0, 1, 0]); rail(BASE_W / 2 + .6, yN - .2, halfW - .2, yN - .2, [0, 1, 0]);
}
// 해치(월대 앞 양쪽 한 쌍): 낮은 돌받침 위에 앉아 남쪽을 보는 모습. 알아볼 특징만 — 넓적하고 큰 머리 · 튀어나온 눈두덩 · 짧은 주둥이 · 턱수염 ·
// 목 뒤 갈기 · 쫑긋한 귀 · 곧게 세운 앞다리 · 말아 올린 꼬리. 광화문 해치는 뿔을 두지 않는다(사진 기준). 눈 · 비늘 · 갈기 결은 그리지 않는다
function buildHaechi(w:MeshWriter, x:number, y:number):void {
  const part = (x0:number, x1:number, y0:number, y1:number, z0:number, z1:number) => w.box(x + x0, x + x1, y + y0, y + y1, z0, z1, K.haechi, { bottom: true });
  part(-.85, .85, -1.3, 1.3, 0, .3);                       // 돌받침
  part(-.62, .62, .0, 1.05, .3, 1.2);                      // 엉덩이 · 뒷다리
  part(-.46, .46, -.5, .75, .3, 1.5);                      // 몸통
  part(-.5, -.28, -.78, -.42, .3, 1.25);                   // 앞다리(왼)
  part(.28, .5, -.78, -.42, .3, 1.25);                     // 앞다리(오른)
  part(-.5, .5, -.7, -.3, 1.0, 1.65);                      // 가슴
  part(-.42, .42, -.72, -.25, 1.5, 1.95);                  // 목
  part(-.62, .62, -.35, .25, 1.15, 2.05);                  // 목 뒤 갈기(머리 뒤로 넓게)
  part(-.52, .52, -1.15, -.45, 1.55, 2.2);                 // 머리(넓적하고 큼직하게)
  part(-.34, .34, -1.45, -1.15, 1.6, 1.98);                // 주둥이
  part(-.56, .56, -1.2, -.95, 2.0, 2.3);                   // 눈두덩(튀어나온 이마 선)
  part(-.18, .18, -1.28, -1.05, 1.25, 1.62);               // 턱수염
  part(-.66, -.5, -.9, -.65, 2.05, 2.5); part(.5, .66, -.9, -.65, 2.05, 2.5);   // 귀
  part(-.14, .14, .95, 1.3, .5, 1.3);                      // 꼬리
}

// 궁 안 나무 · 길가 횃불 자리: 구역 모듈이 내놓는다(경복궁 자료는 경복궁에 닿을 때만 받는다)
export const trees = { at: PALACE_AT, data: PALACE_TREES };
export const torches = { at: PALACE_AT, data: PALACE_TORCHES };
export function buildGwanghwamun():Float32Array {
  const w = new MeshWriter(); buildGate(w); return new Float32Array(w.data);
}
const BUILDERS:Record<string, (w:MeshWriter) => void> = { gwanghwamun: buildGate, 'yi-sunsin': buildYiSunsin, sejong: buildSejong, 'palace-wall': buildPalaceWall, 'palace-halls': buildPalaceHalls, 'palace-frames': buildPalaceFrames };
export function buildMonument(id:string):Float32Array {
  const build = BUILDERS[id]; if (!build) throw new Error(`기념물 모델 없음: ${id}`);
  const w = new MeshWriter(); build(w); return new Float32Array(w.data);
}

