// 나라 모드 건물: 도시 엔진 부품 'nation'(web/city/parts.mjs). 팩에 nation({kind: 'greece' …})이 있으면 web/city/mesh.mjs 가 건물마다 부르고,
// 여기서 몇 채만 그 나라 건물(그리스: 파란 돔 성당 · 종탑 · 어긋나게 쌓은 큐브 집)로 짓는다. 나머지는 false 를 돌려 보통 건물(팩 색 · 실제 윤곽)로.
// 스타크래프트 종족 건물(race)과 달리 몸통은 실제 윤곽 그대로 짓고, 그 위에만 모형을 얹는다(모형 도구는 race_buildings.mjs 의 fitRect · modelBuilder).
// 칠: wall(벽 재질 색) · roof(지붕 색) · accent(경사면 KIND.PITCHED — 팩 buildings.house.roof.pitched.colors 3색: 나라마다 [돔, 흰 칠, 장식]).
// 메인 스레드는 모드 코드 받기로, Worker 는 정적 import 로 이 모듈을 불러 등록한다(행님 2026-10-22, 시안 look3d).
import { registerCityPart } from '../../city/parts.mjs';
import { KIND } from '../../city/mesh.mjs';
import { fitRect, modelBuilder } from '../starcraft/race_buildings.mjs';

export const NATION_LIMITS = { minAreaM2: 40, minHalfM: 3 };   // 이보다 작은 땅 · 좁은 직사각형은 보통 건물로
const A = slot => ({ look: 'accent', slot });
const top = M => M.Hn - .3 / M.s;   // 지붕 높이(모형 좌표: 바닥 기단 0.3 m 위에서 s 단위)

// 나라마다: pick(r, ctx) → 지을 모양 이름 또는 null(보통 건물), build[이름](M, ctx) → 지붕 위 모형(몸통은 이미 지음)
const NATIONS = {
  greece: {
    pick(r, c) {
      if (c.H - c.minH > 30) return null;   // 높은 건물은 보통(흰 회벽)
      if (r < .04 && c.A >= 120 && c.A <= 3000) return 'church';   // 파란 돔 성당 — 손에 꼽게
      if (r < .07 && c.A >= 60) return 'bell';   // 종탑
      if (r < .32 && c.H - c.minH < 16) return 'cubes';   // 어긋나게 쌓은 큐브 집 + 옥상 난간
      return null;
    },
    build: {
      church(M) { const z = top(M), r = .62; M.frustum(0, 0, r, r, z, z + .28, { n: 10, ...A(1) }); M.dome(0, 0, r, z + .28, r * 1.05, { n: 10, rings: 4, ...A(0) }); M.box(0, 0, .03, .03, z + .28 + r * 1.05, z + .28 + r * 1.05 + .32, A(1)); M.box(0, 0, .12, .03, z + .28 + r * 1.05 + .2, z + .28 + r * 1.05 + .25, A(1)) },
      bell(M) { const z = top(M), x = .6, y = 0; M.box(x, y, .16, .3, z, z + .9, A(1)); M.box(x, y, .1, .2, z + .45, z + .7, A(0)); M.dome(x, y, .22, z + .9, .28, { n: 8, rings: 3, ...A(0) }) },
      cubes(M) {   // 위층 상자 한두 개를 한쪽으로 밀어 얹고, 옥상 가장자리에 낮은 흰 난간
        const z = top(M), f = 3.1 / M.s, sx = M.rand(1) < .5 ? -1 : 1;
        M.box(sx * .28, -.12, .62, .6, z, z + f, { look: 'wall' });
        if (M.rand(2) < .45) M.box(-sx * .3, .3, .45, .45, z + f, z + 2 * f, { look: 'wall' });
        if (M.rand(3) < .35) M.box(-sx * .55, -.4, .3, .3, z, z + .45 * f, A(0));   // 파란 물탱크 · 창고 지붕
        for (const [x, y, hx, hy] of [[0, -.97, 1, .03], [0, .97, 1, .03], [-.97, 0, .03, 1], [.97, 0, .03, 1]]) M.box(x, y, hx, hy, z, z + .32 / M.s * 2, A(1));
      },
    },
  },
};

export function building(tb, ctx, unit) {
  const P = tb.P.nation, N = P && NATIONS[P.kind]; if (!N) return false;
  if (ctx.clipped || ctx.th || ctx.A < NATION_LIMITS.minAreaM2) return false;   // 타일에 잘린 건물 · 고가가 지나는 건물 · 아주 작은 건물: 보통 건물
  const kind = N.pick(unit(ctx.seed, 610), ctx); if (!kind) return false;
  const rect = fitRect(ctx.outer, ctx.holes); if (!rect || rect.hy * tb.mPerUnit < NATION_LIMITS.minHalfM) return false;
  const W = tb.W, keepM = W.m.slice(), keepB3 = W.b[3];
  // 몸통: 보통 건물처럼 실제 윤곽의 벽(창) · 평지붕
  tb.wallsOf(ctx, ctx.outer, ctx.minH, ctx.H, true); for (const h of ctx.holes) tb.wallsOf(ctx, h, ctx.minH, ctx.H, false);
  tb.flatRoof(ctx, ctx.outer, ctx.holes, ctx.H, true);
  W.m = keepM.slice(); W.b[3] = keepB3;
  N.build[kind](modelBuilder(tb, ctx, unit, rect), ctx);
  W.m = keepM; W.b[3] = keepB3; W.kind = KIND.WALL; W.w = [0, 0, 0, 0];
  return true;
}

registerCityPart('nation', { building });
