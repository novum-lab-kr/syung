// 경복궁 구역(광화문 · 이순신 · 세종대왕 동상 · 둘레 담장 · 궁 안 건물 — 궁 쪽은 monuments_palace.mts) 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 공통 부품은 monument_parts.mts. 모드 · 테마 입력은 없다 — 어느 모드에서나 같은 모델 · 같은 실물 색.
import { MeshWriter, K, buildRoof, buildBrackets, bandBox } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { GATE_BASE_D as BASE_D, GATE_DECK_Z as Z0 } from './monuments_data.mts';
import { buildPalaceWall, buildPalaceHalls, buildPalaceFrames } from './monuments_palace.mts';

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

// ── 이순신 장군 동상(광화문광장) ───────────────────────────────────────────────────────────────────────────────
// 근거: 동상 6.5 m · 받침 10.5 m, 오른손에 칼, 앞에 거북선 모형 · 북 둘(위키백과 「Statue of Admiral Yi Sun-sin」), 방향 남쪽(OSM node 2653074012 direction 180°),
// 2010 보수 뒤 청동색과 녹색이 섞인 색. 모습은 사진(Commons 「Yi Sun-sin statue」 CC0 · 분수 쪽 사진 CC BY-SA 3.0)으로 맞췄다: 위로 살짝 좁아지는 긴 돌기둥 받침 ·
// 투구 · 긴 갑옷 자락 · 가슴 앞에서 땅으로 세운 장검 · 왼손은 허리 쪽. 받침의 가로 · 세로 치수와 거북선 · 북의 크기 · 놓인 자리는 사진 비례로 맞춘 값이다("맞춤" — 공신력 있는 자료에서 못 구함).
// 받침에 새긴 글자 · 부조는 출처 없이 못 그려 비워 둔다. 얼굴은 그리지 않는다(작은 화면에서 읽히는 투구 · 어깨 · 자락의 윤곽만).
// 2026-10-31 사진 4장(Commons CC0 · CC BY-SA)과 Codex 설계(받침 폭 · 어깨 · 소매 · 칼 위치)로 다시 지었다. 치수는 사진 비례로 맞춘 값("맞춤") — 공신력 있는 도면은 못 구함.
// 받침 높이 10.5 m · 동상 6.5 m 는 위키백과 값. 받침은 가늘고 곧은 석주(사진: 동상보다 훨씬 높고 거의 수직). 새김 · 부조 · 얼굴은 그리지 않는다.
const YI = { plinth: .5, shaftTop: 10.5, height: 6.5 };
function buildYiSunsin(w:MeshWriter):void {
  const z = YI.shaftTop;
  // 받침: 낮은 두 단 + 가늘고 곧은 석주(아래 2.8×2.5 → 위 2.35×2.15, 반폭) + 머리 판석
  w.box(-5.2, 5.2, -5.2, 5.2, 0, .3, K.stone, { bottom: true });
  w.box(-4.2, 4.2, -4.2, 4.2, .3, YI.plinth, K.stone, { bottom: true });
  w.box(-1.9, 1.9, -1.7, 1.7, YI.plinth, 1.5, K.stone, { bottom: true });
  w.frustum(0, 0, 1.4, 1.25, 1.5, 1.18, 1.08, z - .3, K.stone, { bottom: true });
  w.box(-1.3, 1.3, -1.18, 1.18, z - .3, z, K.stone, { bottom: true });
  // 앞 아래 거북선 모형 · 북 둘(맞춤)
  const sy = -3.2, sz = YI.plinth;
  w.box(-.6, .6, sy - 1.3, sy + 1.3, sz, sz + .22, K.stone, { bottom: true });
  w.frustum(0, sy, .55, 1.3, sz + .22, .42, 1.1, sz + .62, K.bronze, { bottom: true });
  w.frustum(0, sy, .42, 1.0, sz + .62, .2, .7, sz + .98, K.bronze, { bottom: true });
  w.box(-.17, .17, sy - 1.55, sy - 1.1, sz + .5, sz + .85, K.bronze, { bottom: true });
  for (const x of [-2.4, 2.4]) { w.prism(x, -3.0, .5, sz, sz + .55, K.bronze, 12); w.prism(x, -3.0, .56, sz + .12, sz + .2, K.trim, 12) }
  // 선 모습(남쪽 = −y, 동상의 오른쪽 = 서쪽 = −x)
  w.box(-.8, -.1, -.85, .5, z, z + .4, K.bronze, { bottom: true }); w.box(.1, .8, -.85, .5, z, z + .4, K.bronze, { bottom: true });   // 두 발(앞코가 나온다)
  w.frustum(0, 0, 1.05, .6, z + .3, .68, .5, z + 2.9, K.bronze, { bottom: true });   // 아래 갑옷 · 긴 옷(아래가 퍼진다)
  w.box(-.8, .8, -.55, .55, z + 2.8, z + 3.1, K.trim, { bottom: true });   // 허리띠
  w.frustum(0, 0, .65, .48, z + 3.05, .95, .52, z + 4.5, K.bronze, { bottom: true });   // 가슴 갑옷: 어깨가 넓고 허리가 좁다
  for (const x of [-1.05, 1.05]) w.frustum(x, 0, .3, .36, z + 4.7, .22, .3, z + 3.9, K.bronze, { bottom: true });   // 어깨 갑(끝이 아래로 꺾인다)
  w.box(-1.45, -.85, -.5, .25, z + 3.0, z + 4.2, K.bronze, { bottom: true });   // 오른팔(서쪽): 몸에서 벌려 팔꿈치를 굽힌다
  w.box(-1.65, -1.1, -.9, -.45, z + 3.2, z + 3.75, K.bronze, { bottom: true });   // 칼 쥔 손
  w.box(-1.55, -1.3, -.8, -.55, z + .5, z + 4.9, K.bronze, { bottom: true });   // 장검: 거의 수직(위는 손잡이 · 아래는 긴 칼집)
  w.box(-1.7, -1.15, -.88, -.48, z + 3.75, z + 3.9, K.trim, { bottom: true });   // 코등이
  w.box(.85, 1.7, -.1, .4, z + 3.0, z + 4.2, K.bronze, { bottom: true });   // 왼팔(동쪽): 팔꿈치를 밖으로 내밀고
  w.box(.5, 1.3, -.45, .0, z + 2.85, z + 3.2, K.bronze, { bottom: true });   // 손은 허리 쪽
  w.box(-.25, .25, -.25, .25, z + 4.4, z + 4.7, K.bronze, { bottom: true });   // 목
  w.box(-.42, .42, -.42, .36, z + 4.6, z + 5.2, K.bronze, { bottom: true });   // 머리(얼굴을 투구 아래로 낸다)
  w.box(-.12, .12, -.46, -.3, z + 4.7, z + 4.95, K.bronze, { bottom: true });   // 짧은 수염
  w.frustum(0, 0, .52, .48, z + 5.15, .3, .28, z + 6.1, K.bronze, { bottom: true });   // 투구
  w.box(-.5, .5, .3, .55, z + 4.7, z + 5.5, K.bronze, { bottom: true });   // 투구 뒤 목가리개
  w.box(-.07, .07, -.07, .07, z + 6.05, z + YI.height, K.bronze, { bottom: true });   // 꼭지 장식
}

// ── 세종대왕 동상(광화문광장) ───────────────────────────────────────────────────────────────────────────────────
// 근거: 김영원 작 2009-10-09 건립, 높이 6.2 m · 너비 4.3 m, 좌상 — 한 손은 들고 한 손은 책을 쥠, 앞에 혼천의 · 측우기 · 앙부일구 모형(위키백과 「Statue of King Sejong」),
// 방향 남쪽(OSM node 3841809527 direction 180°). 사진(Commons 「King sejong the great gwanghwamun square police-859145」 CC0 · 「Statue of King Sejong」 CC BY-SA 2.0)과
// Codex 설계로 2026-10-31 다시 지었다: 낮고 비스듬한 받침(아래 7.5×5.5 m → 위 4.8×3.8 m — 맞춤) · 높은 등받이 의자 · 무릎에서 흘러내리는 곤룡포 ·
// 위로 든 오른손(서쪽)과 책을 받친 왼손(동쪽)의 비대칭 · 아래로 처지는 큰 소매 · 위로 선 두 날개 익선관. 용 무늬 · 의자 조각 · 한글 새김 · 얼굴은 그리지 않는다.
const SEJONG = { baseTop: 3.4, total: 6.2 };
function buildSejong(w:MeshWriter):void {
  const z = SEJONG.baseTop, G = K.gilt;
  // 받침: 기운 옆면(반폭 아래 3.75×2.75 → 위 2.4×1.9)
  w.frustum(0, 0, 4.25, 3.1, 0, 2.7, 2.1, z, K.stone, { bottom: true });
  // 앞 작은 모형 셋(받침 앞 땅 — 맞춤)
  for (const [x, kind] of [[-3.0, 0], [0, 1], [3.0, 2]] as const) {
    const y = -5.2;
    w.box(x - .45, x + .45, y - .45, y + .45, 0, .85, K.stone, { bottom: true });
    if (kind === 0) w.frustum(x, y, .5, .5, .85, .72, .72, 1.25, G, { bottom: true });
    else if (kind === 1) w.prism(x, y, .22, .85, 1.55, G, 10);
    else { w.prism(x, y, .5, .85, 1.0, G, 8); w.frustum(x, y, .42, .42, 1.0, .42, .42, 1.8, G, { bottom: true }); w.frustum(x, y, .55, .08, 1.15, .55, .08, 1.65, G, { bottom: true }) }
  }
  // 의자는 짙은 청동색으로 나눠 사람 모습이 읽히게(사진: 의자 그늘이 짙다 — 맞춤)
  // 의자: 발판 · 좌판 · 뒤의 넓은 등받이 · 양옆 기둥 · 팔걸이
  w.box(-1.75, 1.75, -1.25, 1.0, z, z + .65, K.bronze, { bottom: true });   // 의자 하단 · 발판
  w.box(-1.75, 1.75, .55, 1.0, z + .5, z + 3.1, K.bronze, { bottom: true });   // 등받이
  for (const x of [-1.7, 1.7]) w.box(x - .12, x + .12, .45, 1.05, z + .5, z + 3.3, K.bronze, { bottom: true });   // 양옆 기둥
  for (const x of [-1.55, 1.55]) w.box(x - .15, x + .15, -.85, .85, z + 2.75, z + 3.05, K.bronze, { bottom: true });   // 팔걸이(앞뒤로 길다)
  // 앉은 모습(−y 가 앞)
  const seat = z + .65;
  for (const x of [-.45, .45]) w.box(x - .22, x + .22, -1.35, -.6, seat, seat + .25, G, { bottom: true });   // 신 앞코
  w.frustum(0, -.55, 1.45, 1.1, seat, .95, .8, seat + 1.9, G, { bottom: true });   // 무릎 · 도포 밑단(아래로 넓어진다)
  for (const x of [-.6, .6]) w.frustum(x, -.95, .45, .6, seat + 1.2, .4, .5, seat + 2.3, G, { bottom: true });   // 무릎 두 봉우리(앞으로 솟는다)
  w.frustum(0, 0, .8, .55, seat + 1.2, 1.0, .5, seat + 3.0, G, { bottom: true });   // 허리 → 어깨
  w.box(-.45, .45, -.6, -.25, seat + 1.7, seat + 2.6, G, { bottom: true });   // 흉배(가슴 판)
  // 오른팔(서쪽): 큰 소매를 위로 들어 손바닥을 앞으로
  w.frustum(-1.05, -.4, .45, .35, seat + 2.0, .5, .4, seat + 2.95, G, { bottom: true });   // 어깨 · 위팔
  w.frustum(-1.3, -.75, .55, .4, seat + 1.9, .3, .25, seat + 2.9, G, { bottom: true });   // 아래로 처지는 큰 소매
  w.box(-1.55, -1.2, -1.05, -.8, seat + 2.8, seat + 3.4, G, { bottom: true });   // 손바닥(세운 판)
  // 왼팔(동쪽): 책을 받친다
  w.frustum(1.05, -.4, .4, .3, seat + 1.7, .45, .35, seat + 2.5, G, { bottom: true });
  w.frustum(1.25, -.85, .5, .4, seat + 1.2, .3, .25, seat + 1.9, G, { bottom: true });   // 소매
  w.box(.55, 1.8, -1.5, -.7, seat + 1.2, seat + 1.35, G, { bottom: true });   // 책(왼손에서 무릎 쪽으로 비스듬히)
  w.box(1.25, 1.8, -1.5, -.7, seat + 1.35, seat + 1.6, G, { bottom: true });   // 책 바깥 끝을 높인다
  w.box(-.2, .2, -.25, .1, seat + 2.95, seat + 3.2, G, { bottom: true });   // 목
  w.box(-.42, .42, -.42, .3, seat + 3.15, seat + 3.95, G, { bottom: true });   // 머리
  w.box(-.18, .18, -.55, -.35, seat + 3.0, seat + 3.45, G, { bottom: true });   // 턱수염
  w.frustum(0, -.05, .42, .4, seat + 3.9, .36, .34, seat + 4.55, G, { bottom: true });   // 익선관(둥근 관체)
  for (const x of [-1, 1]) w.box(x * .5 - .12, x * .5 + .12, .0, .4, seat + 4.0, seat + 4.4, G, { bottom: true });   // 위로 선 두 날개
}

export function buildGwanghwamun():Float32Array {
  const w = new MeshWriter(); buildGate(w); return new Float32Array(w.data);
}
const BUILDERS:Record<string, (w:MeshWriter) => void> = { gwanghwamun: buildGate, 'yi-sunsin': buildYiSunsin, sejong: buildSejong, 'palace-wall': buildPalaceWall, 'palace-halls': buildPalaceHalls, 'palace-frames': buildPalaceFrames };
export function buildMonument(id:string):Float32Array {
  const build = BUILDERS[id]; if (!build) throw new Error(`기념물 모델 없음: ${id}`);
  const w = new MeshWriter(); build(w); return new Float32Array(w.data);
}

