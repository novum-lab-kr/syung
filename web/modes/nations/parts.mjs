// 나라 모드 건물: 도시 엔진 부품 'nation'(web/city/parts.mjs). 팩에 nation({kind: 'greece' …})이 있으면 web/city/mesh.mjs 가 건물마다 부르고,
// 여기서 몇 채만 그 나라 건물(그리스: 파란 돔 성당 · 종탑 · 어긋나게 쌓은 큐브 집)로 짓는다. 나머지는 false 를 돌려 보통 건물(팩 색 · 실제 윤곽)로.
// 스타크래프트 종족 건물(race)과 달리 몸통은 실제 윤곽 그대로 짓고, 그 위에만 모형을 얹는다(모형 도구는 race_buildings.mjs 의 fitRect · modelBuilder).
// 칠: wall(벽 재질 색) · roof(지붕 색) · accent(경사면 KIND.PITCHED — 팩 buildings.house.roof.pitched.colors 3색: 나라마다 [돔, 흰 칠, 장식]).
// 휴대폰(엔진 opts.phone)은 정점을 아낀다: 작은 집은 보통 건물, 모형은 덩어리 몇 개만(행님 2026-10-22 밤: 휴대폰 메모리 — 맥 휴대폰 화면에서 이집트 4타일 85 MB 로 한도 56 MB 를 넘었다).
// 메인 스레드는 모드 코드 받기로, Worker 는 정적 import 로 이 모듈을 불러 등록한다(행님 2026-10-22, 시안 look3d).
import { registerCityPart } from '../../city/parts.mts';
import { KIND } from '../../city/mesh.mjs';
import { fitRect, modelBuilder, raceTemplates, templateIndex, registerBuildingModels, modelList, pickModel } from '../starcraft/race_buildings.mjs';
import { pointInPolygon, edgeDistance } from '../../city/geom.mjs';
import { NATION_MODELS, NATION_CELLS } from './models.mjs';
for (const [k, list] of Object.entries(NATION_MODELS)) registerBuildingModels(k, list);   // 스타 템플릿 · 인스턴스 그리기에 나라 모형도(메인 · Worker 각자)

export const NATION_LIMITS = { minAreaM2: 40, phoneMinAreaM2: 120, minHalfM: 3 };   // 이보다 작은 땅(휴대폰은 더 큰 기준) · 좁은 직사각형은 보통 건물로
const A = slot => ({ look: 'accent', slot });
const top = M => M.Hn - .3 / M.s;   // 지붕 높이(모형 좌표: 바닥 기단 0.3 m 위에서 s 단위)

// 나라마다: pick(r, ctx) → 지을 모양 이름 또는 null(보통 건물), build[이름](M, ctx) → 지붕 위 모형(몸통은 이미 지음)
const NATIONS = {
  greece: {
    pick(r, c, phone) {
      if (c.H - c.minH > 30) return null;   // 높은 건물은 보통(흰 회벽)
      if (r < .04 && c.A >= 120 && c.A <= 3000) return 'church';   // 파란 돔 성당 — 손에 꼽게
      if (r < .07 && c.A >= 60) return 'bell';   // 종탑
      if (r < .32 && c.H - c.minH < 16) return 'cubes';   // 어긋나게 쌓은 큐브 집 + 옥상 난간
      return null;
    },
    build: {
      church(M) { const z = top(M), r = .62; M.frustum(0, 0, r, r, z, z + .28, { n: 10, ...A(1) }); M.dome(0, 0, r, z + .28, r * 1.05, { n: 10, rings: 4, ...A(0) }); M.box(0, 0, .03, .03, z + .28 + r * 1.05, z + .28 + r * 1.05 + .32, A(1)); M.box(0, 0, .12, .03, z + .28 + r * 1.05 + .2, z + .28 + r * 1.05 + .25, A(1)) },
      bell(M) { const z = top(M), x = .6, y = 0; M.box(x, y, .16, .3, z, z + .9, A(1)); M.box(x, y, .1, .2, z + .45, z + .7, A(0)); M.dome(x, y, .22, z + .9, .28, { n: 8, rings: 3, ...A(0) }) },
      cubes(M, c, phone) {   // 위층 상자 한두 개를 한쪽으로 밀어 얹고, 옥상 가장자리에 낮은 흰 난간(휴대폰은 난간 · 물탱크 없이)
        const z = top(M), f = 3.1 / M.s, sx = M.rand(1) < .5 ? -1 : 1;
        M.box(sx * .28, -.12, .62, .6, z, z + f, { look: 'wall' });
        if (M.rand(2) < .45) M.box(-sx * .3, .3, .45, .45, z + f, z + 2 * f, { look: 'wall' });
        if (phone) return;
        if (M.rand(3) < .35) M.box(-sx * .55, -.4, .3, .3, z, z + .45 * f, A(0));   // 파란 물탱크 · 창고 지붕
        for (const [x, y, hx, hy] of [[0, -.97, 1, .03], [0, .97, 1, .03], [-.97, 0, .03, 1], [.97, 0, .03, 1]]) M.box(x, y, hx, hy, z, z + .32 / M.s * 2, A(1));
      },
    },
  },
  netherlands: {
    pick(r, c, phone) {
      const h = c.H - c.minH;
      if (r < .006 && c.A >= 120 && h < 20) return 'windmill';   // 풍차 — 아주 드물게
      if (r < .016 && c.A >= 200 && h < 30) return 'spire';   // 교회 첨탑
      if (h < 24 && c.A < 900) return 'canal';   // 좁은 운하 집: 박공 + 가파른 지붕(거의 다)
      return null;
    },
    build: {
      canal(M, c, phone) {   // 긴 축을 따라 가파른 지붕(용마루), 앞(+x) 끝에 박공 4가지 중 하나 — 벽색 그대로(휴대폰은 뾰족 박공 한 장만)
        const z = top(M), rise = Math.min(1.6, 5.5 / M.s), tile = M.rand(5) < .35 ? 2 : 0;
        M.loft([[-1, -1], [1, -1], [1, 1], [-1, 1]], z, [[-.96, 0], [.96, 0], [.96, 0], [-.96, 0]], z + rise, { ...A(tile), top: false });
        const kind = phone ? 3 : Math.floor(M.rand(6) * 4), w = .97, t = .04;
        if (kind === 0) for (let k = 0; k < 4; k++) M.box(w, 0, t, 1 - k * .24, z + k * rise / 4, z + (k + 1) * rise / 4 + .02, { look: 'wall' });   // 계단 박공
        else if (kind === 1) for (let k = 0; k < 6; k++) M.box(w, 0, t, .55 + .4 * Math.cos(k / 5 * Math.PI / 2) - k * .06, z + k * rise / 6, z + (k + 1) * rise / 6 + .02, { look: 'wall' });   // 종 박공
        else if (kind === 2) { M.box(w, 0, t, .95, z, z + rise * .35, { look: 'wall' }); M.box(w, 0, t, .4, z + rise * .35, z + rise * 1.05, { look: 'wall' }); M.box(w, 0, t + .01, .46, z + rise * 1.05, z + rise * 1.12, A(1)) }   // 목 박공 + 흰 처마
        else M.loft([[w - t, -1], [w + t, -1], [w + t, 1], [w - t, 1]], z, [[w - t, 0], [w + t, 0], [w + t, 0], [w - t, 0]], z + rise * 1.08, { look: 'wall', top: false });   // 뾰족 박공
        if (!phone) M.box(w + .01, 0, t, .08, z + rise * .55, z + rise * .55 + .5 / M.s, A(1));   // 박공의 흰 들보(도르래 걸이)
      },
      windmill(M) {   // 팔각 몸통 · 모자 · 앞에 + 자 날개(길쭉한 판 둘)
        const z = top(M), x = 0, H = 4.2;
        M.frustum(x, 0, .55, .38, z, z + H, { n: 8, ...A(0) }); M.frustum(x, 0, .42, 0, z + H, z + H + .55, { n: 8, ...A(2) });
        const fz = z + H * .85, fx = .5;
        M.box(fx, 0, .03, .05, fz - 2.1, fz + 2.1, A(1)); M.box(fx, 0, .03, .98, fz - .09, fz + .09, A(1));
      },
      spire(M) { const z = top(M); M.box(.5, 0, .2, .2, z, z + 1.6, { look: 'wall' }); M.frustum(.5, 0, .22, 0, z + 1.6, z + 3.6, { n: 8, ...A(0) }) },
    },
  },
  paris: {
    pick(r, c, phone) {
      const h = c.H - c.minH;
      if (r < .0015 && c.A >= 1500 && h < 25) return 'eiffel';   // 작은 에펠탑 — 아주 드물게
      if (r < .012 && c.A >= 400 && h < 35) return 'dome';   // 둥근 돔 기념관
      if (h >= 8 && h < 45) return 'mansard';   // 오스만 블록: 망사르드 지붕 · 지붕창 · 굴뚝 · 철제 발코니 띠(거의 다)
      return null;
    },
    build: {
      mansard(M, c, phone) {
        const z = top(M), f = 3.2 / M.s, rise = Math.min(1.2, 4.6 / M.s), k = .84;
        // 철제 발코니 띠 둘(2층 · 꼭대기 아래층) — 둘레 따라 얇은 띠
        if (!phone) for (const zb of [z - (M.Hn > 4 * f ? M.Hn - 2 * f : 1.5 * f), z - f]) if (zb > .2) for (const [x, y, hx, hy] of [[0, -1, 1, .025], [0, 1, 1, .025], [-1, 0, .025, 1], [1, 0, .025, 1]]) M.box(x, y, hx, hy, zb, zb + .12 / M.s * 3, A(1));
        M.loft([[-1, -1], [1, -1], [1, 1], [-1, 1]], z, [[-k, -k], [k, -k], [k, k], [-k, k]], z + rise, { ...A(0), top: true });   // 가파른 아연 경사면 + 윗면
        const n = phone ? 2 : Math.max(2, Math.min(7, Math.round(M.half[0] / 4.2)));   // 지붕창: 긴 변 따라 4 m 마다(휴대폰은 둘)
        for (let i = 0; i < n; i++) { const x = -.8 + 1.6 * (i + .5) / n; for (const y of [-.9, .9]) M.box(x, y, Math.min(.06, .5 / n), .07, z + rise * .2, z + rise * .75, { look: 'wall' }) }
        for (let i = 0; i < (phone ? 1 : 3); i++) if (M.rand(20 + i) < .7) M.box(-.6 + i * .6, 0, .05, .14, z + rise, z + rise + 1.1 / M.s * 2, A(2));   // 굴뚝
      },
      dome(M) { const z = top(M); M.frustum(0, 0, .6, .6, z, z + .5, { n: 12, look: 'wall' }); M.dome(0, 0, .6, z + .5, .7, { n: 12, rings: 4, ...A(0) }); M.frustum(0, 0, .1, .02, z + 1.2, z + 1.6, { n: 6, ...A(1) }) },
      eiffel(M) {   // 넷으로 좁아지는 철탑(갈색 철) + 두 층 전망대
        const z = top(M), c = { n: 4, rot: Math.PI / 4, ...A(1) };
        M.frustum(0, 0, .95, .45, z, z + 2.2, c); M.box(0, 0, .5, .5, z + 2.2, z + 2.35, A(1));
        M.frustum(0, 0, .4, .18, z + 2.35, z + 4.6, c); M.box(0, 0, .22, .22, z + 4.6, z + 4.72, A(1));
        M.frustum(0, 0, .16, .03, z + 4.72, z + 8.4, c);
      },
    },
  },
  egypt: {
    pick(r, c, phone) {
      const h = c.H - c.minH;
      if (r < .002 && c.A >= 1500 && h < 20) return 'pyramid';   // 피라미드 — 아주 드물게
      if (r < .016 && c.A >= 250 && h < 30) return 'mosque';   // 돔 + 미나레트
      if (h < 40 && (!phone || r < .5)) return 'rooftop';   // 옥상 살림: 난간 · 물탱크 · 접시 · 철근 · 비둘기집 · 그늘막(거의 다, 휴대폰은 절반)
      return null;
    },
    build: {
      rooftop(M, c, phone) {
        const z = top(M), u = 1 / M.s;
        for (const [x, y, hx, hy] of [[0, -.98, 1, .02], [0, .98, 1, .02], [-.98, 0, .02, 1], [.98, 0, .02, 1]]) M.box(x, y, hx, hy, z, z + .9 * u, { look: 'wall' });   // 옥상 난간
        const nT = phone ? 1 : 1 + Math.floor(M.rand(30) * 3);
        for (let i = 0; i < nT; i++) { const x = -.6 + M.rand(31 + i) * 1.2, y = -.5 + M.rand(35 + i); M.frustum(x, y, .7 * u, .7 * u, z, z + 1.3 * u, { n: 8, ...A(1) }) }   // 검은 물탱크
        if (phone) return;   // (휴대폰: 접시 · 철근 · 비둘기집 · 그늘막 없이)
        if (M.rand(40) < .55) { const x = .5 - M.rand(41), y = -.6; M.box(x, y, .3 * u, .3 * u, z, z + .9 * u, A(1)); M.dome(x, y, .9 * u, z + .9 * u, .35 * u, { n: 8, rings: 2, ...A(2) }) }   // 위성 접시
        if (M.rand(42) < .4) for (const [x, y] of [[-.85, -.85], [.85, -.85], [-.85, .85], [.85, .85]]) M.box(x, y, .08 * u, .08 * u, z, z + 2.2 * u, A(1));   // 덜 지은 층의 철근 기둥
        if (M.rand(43) < .2) M.frustum(.55, .5, 1.3 * u, .9 * u, z, z + 3.2 * u, { n: 8, look: 'wall' });   // 비둘기집(흙 탑)
        if (M.rand(44) < .3) M.box(-.35, .35, .45, .35, z + 2.4 * u, z + 2.55 * u, A(2));   // 흰 그늘막
      },
      mosque(M) {
        const z = top(M), r = .55;
        M.frustum(0, 0, r, r, z, z + .3, { n: 12, look: 'wall' }); M.dome(0, 0, r, z + .3, r * .95, { n: 12, rings: 4, ...A(0) });
        const x = .78, y = .7; M.frustum(x, y, .13, .1, z, z + 3.2, { n: 8, ...A(2) }); M.frustum(x, y, .16, .16, z + 2.4, z + 2.55, { n: 8, ...A(2) }); M.dome(x, y, .1, z + 3.2, .2, { n: 8, rings: 2, ...A(0) });   // 미나레트
      },
      pyramid(M) { const z = top(M); M.frustum(0, 0, .97, 0, z, z + 1.9, { n: 4, rot: Math.PI / 4, look: 'wall' }) },
    },
  },
};

// 나라 건물 통째로(행님 2026-10-22: 스타처럼 나라도 실제 모양으로): 땅에 드는 직사각형을 그 나라 칸 크기로 나눠 칸마다 모형 하나 — 건물마다 꼭짓점을 쓰지 않고
// 기록 하나(40 바이트, 스타와 같은 tb.models)만. 높이 단위는 10 m 로 고정(모형의 층 높이가 실제 m). 서울 대표 건물 · 잘린 · 고가가 지나는 · 너무 높은 건물은 아래 장식 길로.
const NO_AO = 8, MX = lng => lng / 360 + .5, MY = lat => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
function keeps(tb, R) {
  if (tb._natKeep && tb._natKeepOf === R.keep) return tb._natKeep;
  const E = tb.E || 4096, out = [];
  for (const [lng, lat, rM] of R.keep || []) { const x = (MX(lng) - tb.ox) / tb.unit, y = (MY(lat) - tb.oy) / tb.unit, r = rM / tb.mPerUnit; if (x > -r - E && x < 2 * E + r && y > -r - E && y < 2 * E + r) out.push([x, y, r]) }
  tb._natKeep = out; tb._natKeepOf = R.keep; return out;
}
function modelBuilding(tb, ctx, unit) {
  const R = tb.P.race, list = R && modelList(R.kind), C = R && NATION_CELLS[R.kind]; if (!list?.length || !C) return false;
  if (ctx.clipped || ctx.th || ctx.A < NATION_LIMITS.minAreaM2 || ctx.H - ctx.minH > C.maxH) return false;
  if (keeps(tb, R).some(([x, y, r]) => pointInPolygon(x, y, ctx.outer, ctx.holes) || edgeDistance(x, y, [ctx.outer]) <= r)) return false;
  const rect = fitRect(ctx.outer, ctx.holes), mpu = tb.mPerUnit; if (!rect || rect.hy * mpu < NATION_LIMITS.minHalfM) return false;
  const u = tb.unit, T = raceTemplates(R), recs = tb.models || (tb.models = []), W = tb.W, b = W.b, Hq = Math.min(65535, Math.round(ctx.H * 10));
  const cs = tb.opts?.phone ? 1.7 : 1;   // 휴대폰: 칸을 크게(건물 수 약 1/3 — 덕배 2026-10-23: 휴대폰에서 버벅)
  const nx = Math.max(1, Math.min(8, Math.round(rect.hx * mpu / (C.halfM * cs)))), ny = Math.max(1, Math.min(3, Math.round(rect.hy * mpu / (C.depthM * cs)))), vx = -rect.uy, vy = rect.ux, gap = C.gap ?? .9;   // (파리는 블록 벽이 이어져 보이게 거의 붙인다 — 칸끼리 마주 보는 벽은 안쪽이라 안 보인다)   // 칸끼리 · 옆 땅 건물과 벽이 같은 면에 겹치면 깜박였다(맥 캡처 — 점박이 줄): 늘 조금씩 띄운다
  let built = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const seed = (ctx.seed ^ Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663)) >>> 0;
    const ox = (-1 + (2 * i + 1) / nx) * rect.hx, oy = (-1 + (2 * j + 1) / ny) * rect.hy;
    const cell = { cx: rect.cx + rect.ux * ox + vx * oy, cy: rect.cy + rect.uy * ox + vy * oy, hx: rect.hx / nx * gap, hy: rect.hy / ny * gap, ux: rect.ux, uy: rect.uy };
    if (cell.hy > cell.hx) Object.assign(cell, { hx: cell.hy, hy: cell.hx, ux: vx, uy: vy });   // 긴 축을 x 로
    const area = 4 * cell.hx * cell.hy * mpu * mpu, aspect = cell.hx / cell.hy;
    // 층수: 실제 건물 높이(한 층 3.2 m)에 칸마다 ±1 흔들어 나라 범위 안으로, 그 층수(없으면 가장 가까운) 모형 중에서
    const [f0, f1] = C.floors || [1, 9], want = Math.max(f0, Math.min(f1, Math.round((ctx.H - ctx.minH) / 3.2 + (unit(seed, 612) - .5) * 2.2)));
    const near = Math.min(...list.map(m => Math.abs((m.floors ?? want) - want))), pool = list.filter(m => Math.abs((m.floors ?? want) - want) === near);
    const model = pickModel(pool, { area, aspect, tall: false, r: unit(seed, 611) }); if (!model) continue;
    const t = templateIndex(list.indexOf(model), aspect), s = 10;   // 높이 단위 10 m(모형 z 1 = 10 m)
    recs.push([t, cell.cx * u, cell.cy * u, ctx.minH, cell.ux, cell.uy, cell.hx * mpu, cell.hy * mpu, s, ctx.mat, ctx.roofSlot, Hq & 255, Hq >>> 8, seed & 255, (seed >>> 8) & 255, b[2], b[3] | NO_AO]);
    const top = ctx.minH + T.tops[t] * s, c = (a, d) => [(cell.cx + cell.ux * cell.hx * a + vx * cell.hy * d) * u, (cell.cy + cell.uy * cell.hx * a + vy * cell.hy * d) * u];
    for (const [a, d] of [[-1, -1], [1, 1]]) { const p = c(a, d); tb.extend(ctx.chunk, p[0], p[1], p[0], p[1], top) }
    built++;
  }
  return built > 0;
}

export function building(tb, ctx, unit) {
  if (modelBuilding(tb, ctx, unit)) return true;   // 그 나라 건물 통째로(못 지으면 아래: 실제 윤곽 + 지붕 장식)
  const P = tb.P.nation, N = P && NATIONS[P.kind]; if (!N) return false;
  const phone = !!tb.opts?.phone;
  if (ctx.clipped || ctx.th || ctx.A < (phone ? NATION_LIMITS.phoneMinAreaM2 : NATION_LIMITS.minAreaM2)) return false;   // 타일에 잘린 건물 · 고가가 지나는 건물 · 작은 건물: 보통 건물
  const kind = N.pick(unit(ctx.seed, 610), ctx, phone); if (!kind) return false;
  const rect = fitRect(ctx.outer, ctx.holes); if (!rect || rect.hy * tb.mPerUnit < NATION_LIMITS.minHalfM) return false;
  const W = tb.W, keepM = W.m.slice(), keepB3 = W.b[3];
  // 몸통: 보통 건물처럼 실제 윤곽의 벽(창) · 평지붕
  tb.wallsOf(ctx, ctx.outer, ctx.minH, ctx.H, true); for (const h of ctx.holes) tb.wallsOf(ctx, h, ctx.minH, ctx.H, false);
  tb.flatRoof(ctx, ctx.outer, ctx.holes, ctx.H, true);
  W.m = keepM.slice(); W.b[3] = keepB3;
  N.build[kind](modelBuilder(tb, ctx, unit, rect), ctx, phone);
  W.m = keepM; W.b[3] = keepB3; W.kind = KIND.WALL; W.w = [0, 0, 0, 0];
  return true;
}

registerCityPart('nation', { building });
