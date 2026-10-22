// 나라 모드 건물 모형: 스타크래프트 종족 건물처럼 땅 위에 그 나라 건물을 통째로 세운다(행님 2026-10-22: 스타처럼 나라도 실제 모양으로).
// 모형 좌표는 스타와 같다(web/modes/starcraft/race_buildings.mjs modelBuilder): x · y 는 칸의 반 변으로 나눈 −1..1(x 가 긴 축),
// 높이 z 는 높이 단위 — 나라 모형은 기록의 높이 단위를 10 m 로 고정해(parts.mjs) z 1 = 10 m, 층 0.32 = 3.2 m 로 실제 높이다.
// 칠: wall(그 건물의 벽 재질 색) · roof(지붕 색) · accent 0 · 1 · 2(팩 buildings.house.roof.pitched.colors — 나라마다 [특색, 흰 칠 · 철, 유리]).
// 창은 벽에서 살짝 나온 얇은 상자(유리 accent 2) — 템플릿에 한 번만 지어 같이 쓰니(인스턴스) 건물 수만큼 늘지 않는다. 휴대폰 정점을 생각해 층마다가 아니라 기둥(층을 꿰는 긴 창)으로도 쓴다.
const A = slot => ({ look: 'accent', slot });
const WALL = { look: 'wall' }, ROOF = { look: 'roof' };
const F = .32;   // 한 층 3.2 m
const fit = (weight, o = {}) => ({ weight, tall: false, minArea: 0, maxArea: Infinity, maxAspect: Infinity, ...o });
// 옥상 둘레 난간(얇은 띠 넷)
function rim(M, z, h, o) { for (const [x, y, hx, hy] of [[0, -.985, 1, .015], [0, .985, 1, .015], [-.985, 0, .015 / M.aspect, 1], [.985, 0, .015 / M.aspect, 1]]) M.box(x, y, hx, hy, z, z + h, o) }
const bays = (M, per) => Math.max(1, Math.round(M.aspect * per));
// 창 난 벽: 벽 상자 앞에 창 상자를 덧대면 두 면이 가까워 멀리서 깊이가 깜박였다(맥 캡처 — 긁힌 점박이). 대신 안쪽에 유리 몸통을 두고
// 바깥에 벽 기둥 · 층 띠만 세운다 — 창 자리에는 유리만, 벽 자리에는 벽만 보여 겹치는 면이 없다.
// o: { zA, zB 벽 높이, nL 긴 면 창 수, nS 짧은 면 창 수, w 창 폭 비율, rows [[z0, z1] …] 창 높이(없으면 zA~zB 한 줄), sides 긴 면 [-1, 1] · ends 짧은 면 [-1, 1] }
function facade(M, { zA = 0, zB, nL, nS, w = .5, rows = null, glass = A(2), wall = WALL, sides = [-1, 1], ends = [-1, 1] }) {
  const tL = .1, tS = .1 / M.aspect;   // 벽 두께(긴 면은 y, 짧은 면은 x 로 — 같은 m)
  M.box(0, 0, 1 - tS * .5, 1 - tL * .5, zA, zB, glass);   // 유리 몸통
  const R = rows || [[zA, zB]], bands = [[zA, R[0][0]], ...R.slice(0, -1).map((r, i) => [r[1], R[i + 1][0]]), [R[R.length - 1][1], zB]].filter(([a, b]) => b - a > .003);
  const face = (n, along, at, t, asp) => {   // along: 'x' 긴 면(y = at) · 'y' 짧은 면(x = at)
    const put = (c, h, z0, z1) => along === 'x' ? M.box(c, at * (1 - t / 2), h, t / 2, z0, z1, wall) : M.box(at * (1 - t / 2), c, t / 2, h, z0, z1, wall);
    const hw = n ? w / n : 0, edges = [-1]; for (let i = 0; i < n; i++) { const c = -1 + (2 * i + 1) / n; edges.push(c - hw, c + hw) } edges.push(1);
    for (let k = 0; k < edges.length; k += 2) { const a = edges[k], b = edges[k + 1]; if (b - a > .002) for (const r of R) put((a + b) / 2, (b - a) / 2, r[0], r[1]) }   // 창 사이 기둥(창 줄마다)
    for (const [z0, z1] of bands) put(0, 1, z0, z1);   // 층 띠(창 줄 사이 · 아래 · 위)
  };
  for (const y of sides) face(nL, 'x', y, tL);
  for (const x of ends) face(nS, 'y', x, tS);
  M.box(0, 0, 1.006, 1.006, zB, zB + .015, ROOF);   // 옥상 덮개(유리 몸통 윗면이 검은 지붕으로 보였다 — 맥 캡처): 벽보다 살짝 넓고 위라 겹치는 면 없음
}

// ── 그리스(산토리니): 흰 회벽 큐브 집 1~2층, 둥근 모서리 없이 낮고 하얗게, 파란 문 · 덧창, 옥상 난간, 가끔 파란 돔 예배당 · 계단
const GREECE = [
  { id: 'cube1', floors: 1, fit: fit(4), build(M) {
    const h = F * 1.15; facade(M, { zB: h, nL: bays(M, 2), nS: 1, w: .3, rows: [[.1, .22]], glass: A(0) }); rim(M, h, .07, A(1));   // 파란 덧창
  } },
  { id: 'stair1', floors: 1, fit: fit(3), build(M) {   // 바깥 계단이 옥상 테라스로 오르는 집
    const h = F * 1.1; facade(M, { zB: h, nL: bays(M, 1.5), nS: 1, w: .26, rows: [[.1, .22]], glass: A(0) }); rim(M, h, .08, A(1));
    for (let k = 0; k < 6; k++) M.box(-.7 + k * .1, -1.06, .05, .06, 0, (k + 1) * h / 6, WALL);   // 벽에 붙은 흰 계단
  } },
  { id: 'chapel', floors: 1, fit: fit(.5, { minArea: 80 }), build(M) {   // 작은 예배당: 흰 몸통, 파란 돔, 종 걸린 흰 벽(종탑 벽)
    const h = F * 1.3; facade(M, { zB: h, nL: bays(M, 1.5), nS: 1, w: .3, rows: [[.12, .3]], glass: A(0) }); rim(M, h, .05, A(1));
    const r = Math.min(.75, .75 / Math.max(1, M.aspect * .6)); M.frustum(0, 0, r, r, h, h + .06, { n: 12, ...A(1) }); M.dome(0, 0, r, h + .06, .32, { n: 12, rings: 4, ...A(0) });
    M.box(.8, 0, .06 / M.aspect, .45, h, h + .42, A(1)); M.box(.8, 0, .07 / M.aspect, .14, h + .18, h + .3, A(0));   // 종탑 벽 + 종 자리
  } },
  { id: 'cube2', floors: 2, fit: fit(3), build(M) {   // 아래 큐브 위에 한쪽으로 밀린 작은 큐브(2층) + 옥상 테라스 난간
    const h = F * 1.1; facade(M, { zB: h, nL: bays(M, 2), nS: 1, w: .28, rows: [[.1, .21]], glass: A(0) }); M.box(-.35, .25, .6, .7, h, h + F, WALL);
    rim(M, h, .07, A(1)); rim(M, h + F, .05, A(1));
  } },
  { id: 'twin2', floors: 2, fit: fit(3), build(M) {   // 높이가 다른 두 채가 붙은 집(2층 · 1층), 파란 문
    const h = F * 2.1; facade(M, { zB: h, nL: bays(M, 2), nS: 1, w: .3, rows: [[.1, .22], [.1 + F, .22 + F]], glass: A(0) }); rim(M, h, .06, A(1));
    M.box(.55, 0, .45, 1.01, 0, F * .7, A(1)); M.box(.55, 0, .43, .99, F * .7, F * .78, WALL);   // 낮은 흰 담 · 마당
  } },
  { id: 'terrace', floors: 2, fit: fit(2), build(M) {   // 계단처럼 물러나는 세 단(언덕 마을)
    for (let k = 0; k < 3; k++) { const x0 = -1 + k * .62, z = F * (k + 1) * .85; M.box((x0 + 1) / 2, 0, (1 - x0) / 2, 1, 0, z, WALL); rim(M, z, .05, A(1)) }
  } },
  { id: 'tower3', floors: 3, fit: fit(2), build(M) {   // 세 층 쌓인 큐브(위로 갈수록 작게) + 파란 지붕 작은 방
    const h = F * 1.05; facade(M, { zB: h, nL: bays(M, 2), nS: 1, w: .3, rows: [[.1, .22]], glass: A(0) });
    M.box(.15, -.1, .75, .75, h, h + F, WALL); M.box(.3, -.2, .45, .45, h + F, h + 2 * F, WALL); M.box(.3, -.2, .47, .47, h + 2 * F, h + 2 * F + .04, A(0));
    rim(M, h, .06, A(1)); rim(M, h + F, .05, A(1));
  } },
];

// ── 네덜란드(암스테르담): 좁고 깊은 벽돌집, 앞뒤 박공(계단 · 종 · 목 · 뾰족), 가파른 지붕, 층마다 큰 창(흰 테)
function dutch(gable, floors) {
  return { id: `${gable}${floors}`, floors, fit: fit(gable === 'spout' ? 2 : 3), build(M) {
    const h = F * floors + .05, rise = .55;
    facade(M, { zB: h, nL: bays(M, .8), nS: 2, w: .62, rows: Array.from({ length: floors }, (_, f) => [.06 + f * F, .06 + f * F + F * .62]) });
    M.loft([[-1, -1], [1, -1], [1, 1], [-1, 1]], h, [[-.97, 0], [.97, 0], [.97, 0], [-.97, 0]], h + rise, { ...ROOF, top: false });   // 긴 축 용마루의 가파른 지붕
    for (const sx of [-1, 1]) {   // 앞뒤 끝(짧은 면 x = ±1)의 박공: 벽색, 지붕보다 조금 높게
      const x = sx * .99, t = .02 / M.aspect;
      if (gable === 'step') for (let k = 0; k < 4; k++) M.box(x, 0, t, 1 - k * .24, h + k * rise / 4, h + (k + 1) * rise / 4 + .03, WALL);
      else if (gable === 'bell') for (let k = 0; k < 6; k++) M.box(x, 0, t, .58 + .38 * Math.cos(k / 5 * Math.PI / 2) - k * .07, h + k * rise / 6, h + (k + 1) * rise / 6 + .03, WALL);
      else if (gable === 'neck') { M.box(x, 0, t, .95, h, h + rise * .35, WALL); M.box(x, 0, t, .4, h + rise * .35, h + rise * 1.08, WALL); M.box(x, 0, t * 1.4, .46, h + rise * 1.08, h + rise * 1.15, A(1)) }
      else M.loft([[x - t, -1], [x + t, -1], [x + t, 1], [x - t, 1]], h, [[x - t, 0], [x + t, 0], [x + t, 0], [x - t, 0]], h + rise * 1.1, { ...WALL, top: false });
      M.box(x, 0, t * 1.3, .07, h + rise * .55, h + rise * .55 + .05, A(1));   // 흰 들보(도르래 걸이)
    }
  } };
}
const NETHERLANDS = [2, 3, 4, 5].flatMap(f => ['step', 'bell', 'neck', 'spout'].map(g => dutch(g, f)));

// ── 파리(오스만): 크림 석조 5~7층, 1층 가게(어두운 유리 · 차양), 2층 · 꼭대기 아래층 철제 발코니 띠, 회청 아연 망사르드 + 지붕창 + 굴뚝
// 벽에서 바깥으로 나온 띠(처마 · 발코니): 벽 면과 같은 면에 겹치면 깜박이니 늘 벽 앞에(y 1.01~1.05)
function band(M, z, h, out, o) { for (const y of [-1, 1]) M.box(0, y * (1 + out / 2), 1 + out / M.aspect, out / 2, z, z + h, o); for (const x of [-1, 1]) M.box(x * (1 + out / 2 / M.aspect), 0, out / 2 / M.aspect, 1, z, z + h, o) }
// 행님 2026-10-22 "파리가 좀..": 칸이 떨어진 가는 탑 · 층을 꿰는 검은 줄 창(창살처럼) · 7층이 어색했다 — 이어진 블록 벽, 층마다 나뉜 프랑스 창, 5~6층 고른 높이, 처마 · 철제 발코니
function haussmann(floors, corner, style = 'classic') {
  return { id: `haus${floors}${style}${corner ? 'c' : ''}`, floors, fit: fit(corner ? .6 : 3, corner ? { minArea: 300 } : {}), build(M) {
    const h = F * floors + .12, rise = .36, k = .88;
    const rows = [[.03, .3], ...Array.from({ length: floors - 1 }, (_, f) => [.42 + f * F, .42 + f * F + .2])];   // 1층 가게 유리 + 층마다 키 큰 프랑스 창
    facade(M, { zB: h, nL: bays(M, 1.8), nS: 2, w: .46, rows });
    band(M, .34, .03, .03, WALL);   // 1층 위 돌 띠
    if (style === 'classic') { band(M, .42 + .2, .015, .05, A(1)); band(M, .42 + (floors - 2) * F + .2, .015, .05, A(1)) }   // 철제 발코니(2층 · 꼭대기 아래층)
    if (style === 'balcony') for (let f = 0; f < floors - 1; f++) band(M, .42 + f * F + .2, .012, .04, A(1));   // 층마다 철제 발코니
    if (style === 'plain') band(M, .42 + F - .1, .03, .02, WALL);   // 수수한 꼴: 층 사이 돌 띠 하나
    band(M, h - .03, .045, .05, WALL);   // 처마(코니스)
    M.loft([[-1, -1], [1, -1], [1, 1], [-1, 1]], h + .015, [[-k, -k], [k, -k], [k, k], [-k, k]], h + rise, { ...(style === 'plain' ? ROOF : A(0)), top: true });   // 망사르드(수수한 꼴은 건물마다 다른 지붕색)
    const n = bays(M, 1.4); for (let i = 0; i < n; i++) for (const y of [-.95, .95]) M.box(-1 + (2 * i + 1) / n, y, .2 / n, .04, h + .08, h + .26, WALL);   // 지붕창
    for (const x of [-.55, .1, .65]) M.box(x, 0, .04, .1, h + rise, h + rise + .16, ROOF);   // 굴뚝 줄
    if (corner) { const r = .28; M.frustum(.8, -.72, r, r, h - F, h + .1, { n: 10, ...WALL }); M.dome(.8, -.72, r, h + .1, .3, { n: 10, rings: 3, ...A(0) }) }   // 모서리 돔 탑(드물게)
  } };
}
const PARIS = [...[4, 5, 6, 7].flatMap(f => ['classic', 'balcony', 'plain'].map(st => haussmann(f, false, st))), haussmann(6, true)];

// ── 이집트(카이로): 사암 · 흙벽 3~5층 평지붕, 작은 창, 옥상 난간 · 검은 물탱크 · 흰 접시 · 덜 지은 층 철근, 가끔 돔 + 미나레트 모스크
function cairo(floors, extra) {
  return { id: `cairo${floors}${extra}`, floors, fit: fit(extra === 'mosque' ? 1 : 3, extra === 'mosque' ? { minArea: 160 } : {}), build(M) {
    const h = F * floors + .04;
    facade(M, { zB: h, nL: bays(M, 2), nS: 1, w: .3, rows: Array.from({ length: floors }, (_, f) => [.1 + f * F, .24 + f * F]) }); rim(M, h, .1, WALL);
    if (extra === 'tanks') { M.frustum(-.5, .3, .1, .1, h, h + .13, { n: 8, ...A(2) }); M.frustum(-.15, .3, .1, .1, h, h + .13, { n: 8, ...A(2) }); M.dome(.5, -.4, .14, h + .06, .05, { n: 8, rings: 2, ...A(1) }); M.box(.5, -.4, .02, .03, h, h + .06, A(1)) }
    if (extra === 'plain') { M.box(-.3, 0, .5, .02, h + .12, h + .14, A(2)); for (let k = 0; k < 3; k++) M.box(-.6 + k * .3, 0, .06, .03, h + .04, h + .12, [A(0), A(1), A(2)][k]) }   // 빨랫줄 · 빨래
    if (extra === 'rebar') { for (const [x, y] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) M.box(x, y, .015, .015, h, h + .25, A(2)); M.frustum(.3, .3, .1, .1, h, h + .13, { n: 8, ...A(2) }) }
    if (extra === 'mosque') { const r = .55; M.frustum(0, 0, r, r, h, h + .06, { n: 12, ...WALL }); M.dome(0, 0, r, h + .06, .5, { n: 12, rings: 4, ...A(0) });
      M.frustum(.85, .75, .1, .08, h, h + 1.2, { n: 8, ...A(1) }); M.dome(.85, .75, .09, h + 1.2, .14, { n: 8, rings: 2, ...A(0) }) }
  } };
}
const EGYPT = [...[2, 3, 4, 5, 6, 7].flatMap(f => ['tanks', 'rebar', 'plain'].map(x => cairo(f, x))), cairo(3, 'mosque'), cairo(4, 'mosque')];

export const NATION_MODELS = { greece: GREECE, netherlands: NETHERLANDS, paris: PARIS, egypt: EGYPT };
// 나라마다 칸 나누기: 긴 축 반 길이 목표(m) · 깊이 반 최대(m) · 이보다 높은 실제 건물은 보통 건물(도심 고층)
// floors: [최소, 최대] 층 — 실제 건물 높이(3.2 m 한 층)에 가까운 층수 모형을 고른다(같은 층수 안에서 여러 꼴). 행님 2026-10-22: 다양성이 사라졌다
export const NATION_CELLS = { greece: { halfM: 5.5, depthM: 6, maxH: 30, floors: [1, 3] }, netherlands: { halfM: 3.6, depthM: 8, maxH: 30, floors: [2, 5] }, paris: { halfM: 13, depthM: 9, maxH: 60, gap: .985, floors: [4, 7] }, egypt: { halfM: 7, depthM: 7, maxH: 45, floors: [2, 7] } };
