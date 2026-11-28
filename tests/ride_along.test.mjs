// 타고 가기 셈 · 카드 글(web/lib/ride-along.mts) — 값은 계획서 plans/feature/20261102-슝-타고-가기.md 4절(2026-11-04 확정)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HURRY_SHARE, NEAR_M, arrivalFits, boardNow, pickedLeft, rideOver, rideStops, OFF_M, catchable, characterOf, legOverByTime, metres, onPath, reached, leftStation, rideSteps, rideSub,
  splitPath, stopsLeft, stopsLeftByTime, talkKind, talkLine, transferS, waitText, waitTitle, walkLeftS, walkSub, walkTitle, doneSub,
  OFF_FIXES, REROUTE_GAP_MS, WALK_OFF_M, offFixes, shouldReroute, offTrainFixes, gotOff,
} from '../web/lib/ride-along.mts';

// 서울시청 근처 한 줄(동쪽으로 약 200m)
const WEST = [126.9770, 37.5660], EAST = [126.97926, 37.5660];
const walkLeg = (extra = {}) => ({type: 'walk', seconds: 300, metres: 240, label: '시청역 5번 출구까지', path: [WEST, EAST], ...extra});
const rideLeg = (extra = {}) => ({type: 'ride', line: '2호선', from: '시청', to: '강남', departs: '08:10', arrives: '08:40', direction: '외선', stops: 12, wait: 120, stations: [201, 202, 203], ...extra});

test('확정 값: 100m · 60m · 80%', () => {
  assert.equal(NEAR_M, 100); assert.equal(OFF_M, 60); assert.equal(HURRY_SHARE, 0.8);
});

test('거리 · 길 위 자리 · 나누기', () => {
  const span = metres(WEST, EAST);
  assert.ok(span > 195 && span < 205, `${span}`);
  const mid = [126.97813, 37.56609];   // 가운데에서 북쪽으로 약 10m
  const where = onPath(mid, [WEST, EAST]);
  assert.ok(where.off > 8 && where.off < 12, `off ${where.off}`);
  assert.ok(Math.abs(where.at - span / 2) < 3, `at ${where.at}`);
  const {done, rest} = splitPath([WEST, EAST], where.at);
  assert.equal(done.length, 2); assert.equal(rest.length, 2);
  assert.deepEqual(done[1], rest[0]);
});

test('한마디 칸: 여유(열차 − 걷기)로', () => {
  const walk = 300;
  assert.equal(talkKind(200, walk), 'miss');    // 80% 안 → 못 탐
  assert.equal(talkKind(260, walk), 'hurry');   // 80% ~ 100%
  assert.equal(talkKind(360, walk), 'tight');   // 여유 2분 안
  assert.equal(talkKind(500, walk), 'fit');
  assert.equal(talkKind(800, walk), 'easy');
  assert.equal(talkKind(1000, walk), 'free');
  assert.equal(talkLine('tight', 0), '경보 선수 모드 ON');
  assert.equal(talkLine('tight', 1), '엘리베이터 말고 에스컬레이터 각');
  assert.equal(talkLine('tight', 2), '경보 선수 모드 ON');
});

test('못 타는 열차는 빼고 다음 열차부터', () => {
  assert.deepEqual(catchable([600, 100], 300), {missed: true, next: [600]});
  assert.deepEqual(catchable([250, 600], 300), {missed: false, next: [250, 600]});
});

test('기다리기 카드 글: 첫 기다리기 · 갈아타기 · 못 탐', () => {
  const legs = [walkLeg(), rideLeg(), rideLeg({line: '4호선', from: '사당', to: '오이도', departs: '08:45', arrives: '09:00', stations: [433, 434]})];
  assert.equal(waitTitle(legs[1]), '2호선 강남 방면 타는 곳으로');
  const first = waitText(legs, 1, 120, [300, 540], 0);
  assert.equal(first.sub, '걸어서 2분 · 열차 5분 뒤 · 다음 9분 뒤');
  assert.equal(first.say, '열차랑 약속 잡은 사람처럼 걷는 중');
  const transfer = waitText(legs, 2, 120, [60, 420], 0);
  assert.equal(transfer.sub, '걸어서 2분 · 다음 열차 7분 뒤');
  assert.equal(transfer.say, '포탈 열면 가능한데… 그럴 거면 집으로 여시죠');
  assert.deepEqual(waitText(legs, 1, 120, null, 0), {say: null, sub: '걸어서 2분'});
});

test('걷기 · 타기 · 도착 카드 글', () => {
  const legs = [walkLeg(), rideLeg(), walkLeg({label: undefined})];
  assert.equal(walkTitle(legs, 0, '강남역'), '시청역 5번 출구까지 걸어요');
  assert.equal(walkTitle(legs, 2, '강남역'), '강남역까지 걸어요');
  assert.equal(walkSub(72, 70), '70m · 1분');
  assert.equal(rideSub(legs, 1, 5), '5정거장 · 08:40');
  assert.equal(rideSub(legs, 1, 1), '다음 역에서 내려요');
  // 지금 역 · 다음 역을 알면 앞에 붙인다(2026-11-07 요청 — 지하철 · 버스 둘 다)
  assert.equal(rideSub(legs, 1, 5, {now: '종각', next: '종로3가'}), '지금 종각 · 다음 종로3가 · 5정거장 · 08:40');
  assert.equal(rideSub(legs, 1, 1, {now: '동대문', next: '동묘앞'}), '지금 동대문 · 다음 역에서 내려요');
  assert.equal(rideSub(legs, 1, 5, {now: '종각', next: null}), '지금 종각 · 5정거장 · 08:40');
  const now = new Date(2026, 10, 4, 8, 40), started = +now - 32 * 60000;
  assert.equal(doneSub('강남역', now, started), '강남역 · 08:40 · 32분 걸렸어요');
  assert.deepEqual(rideSteps(legs).map(step => step.kind), ['walk', 'wait', 'ride', 'walk', 'done']);
});

test('남은 시간 · 갈아타기 시간', () => {
  const legs = [walkLeg({path: undefined}), rideLeg()];
  assert.equal(walkLeftS(legs, 0, 120), 150, '그린 길이 없으면 서버 metres 잣대 — 반 남음 = 300초의 반(출발 걷기라 승강장 시간 없음)');
  // 08:40 내림 · 다음 08:45 탐(기다림 2분) → 타는 곳 08:43 → 3분 + 1분 여유
  assert.equal(transferS(rideLeg(), rideLeg({departs: '08:45', wait: 120})), 240);
  assert.equal(transferS(rideLeg(), rideLeg({departs: '08:40', wait: 0})), 120);   // 최소 1분 + 1분
});

test('열차 진행: 닿음 · 떠남 · 남은 정거장', () => {
  const track = dist => ({seqIds: [201, 202, 203, 204], cum: [0, 1000, 2000, 3000], dist});
  assert.equal(leftStation(track(1000), 202), false);
  assert.equal(leftStation(track(1200), 202), true);
  assert.equal(reached(track(2990), 203), true);
  assert.equal(reached(track(1500), 203), false);
  assert.equal(stopsLeft(track(500), [201, 202, 203]), 2);
  assert.equal(stopsLeft(track(1500), [201, 202, 203]), 1);
  assert.equal(stopsLeft(track(500), [201, 209]), null);
  // 지금 역 = 닿은(reached) 마지막 역 · 다음 역 = 그다음 — 탄 구간 안에서만
  assert.deepEqual(rideStops(track(500), [201, 202, 203]), {now: 201, next: 202});
  assert.deepEqual(rideStops(track(995), [201, 202, 203]), {now: 202, next: 203});   // 역에 들어서는 중(3% 안)
  assert.deepEqual(rideStops(track(2000), [202, 203]), {now: 203, next: null});
  assert.deepEqual(rideStops({seqIds: [202, 203, 204], cum: [1000, 2000, 3000], dist: 1500}, [201, 202, 203]), {now: 202, next: 203});   // 지난 역은 예측 차례에서 빠진다
  assert.equal(rideStops(track(500), [202, 203]), null);   // 아직 탄 역 전
  assert.deepEqual(rideStops(track(1500), [201, 202, 203, 204, 205, 206]), {now: 202, next: 203});   // 먼 내릴 역은 예측에 없다(앞 10개 역뿐)
  assert.deepEqual(rideStops(track(3000), [203, 204, 205]), {now: 204, next: 205});   // 다음 역이 예측 밖
  assert.equal(rideStops(track(500), [208, 209]), null);   // 구간 역이 예측에 하나도 없음
});

test('열차를 못 따라갈 때 시각으로 남은 정거장', () => {
  assert.equal(stopsLeftByTime(rideLeg(), new Date(2026, 10, 4, 8, 25)), 6);
  assert.equal(stopsLeftByTime(rideLeg(), new Date(2026, 10, 4, 8, 7)), 12);   // 정한 열차보다 앞 열차를 탐(탄 시각 전) — 전에는 1(2026-11-07 화면)
  assert.equal(stopsLeftByTime(rideLeg(), new Date(2026, 10, 4, 8, 50)), 1);
});

test('위치를 못 쓸 때 시각으로 구간 끝', () => {
  const legs = [walkLeg(), rideLeg()];
  assert.equal(legOverByTime(legs, 0, new Date(2026, 10, 4, 8, 7), '08:50'), false);
  assert.equal(legOverByTime(legs, 0, new Date(2026, 10, 4, 8, 8, 30), '08:50'), true);   // 08:10 − 기다림 2분
  assert.equal(legOverByTime(legs, 1, new Date(2026, 10, 4, 8, 41), '08:50'), true);
});

test('위치를 못 쓸 때 마지막 걷기: 계획보다 늦게 내렸으면 계획 도착 시각이 아니라 걷기를 시작한 뒤 걷는 시간 + 역 밖으로 나오는 시간이 지나야 끝(재생 시험 2026-11-27 시청→잠실 — 6분 늦게 내려 내린 지 1초 만에 「슝 도착!」)', async () => {
  const {walkOverByTime} = await import('../web/lib/ride-along.mts');
  const legs = [walkLeg(), rideLeg({arrives: '08:40'}), walkLeg({seconds: 250})];
  const since = new Date(2026, 10, 4, 8, 46).getTime();   // 계획(08:40 내림 · 08:44 도착)보다 6분 늦게 내려 걷기 시작
  assert.equal(walkOverByTime(legs, 2, new Date(2026, 10, 4, 8, 46, 1), '08:44', since), false);
  assert.equal(walkOverByTime(legs, 2, new Date(2026, 10, 4, 8, 51, 39), '08:44', since), false);   // 250 + 90 초 = 08:51:40
  assert.equal(walkOverByTime(legs, 2, new Date(2026, 10, 4, 8, 51, 40), '08:44', since), true);
  // 제때 내렸으면 그대로 계획 도착 시각 — 계획보다 일찍 끝내지 않는다
  assert.equal(walkOverByTime(legs, 2, new Date(2026, 10, 4, 8, 43), '08:44', new Date(2026, 10, 4, 8, 30).getTime()), false);
  // 마지막이 아닌 걷기는 원래대로(다음 탈 것의 탈 시각)
  assert.equal(walkOverByTime(legs, 0, new Date(2026, 10, 4, 8, 8, 30), '08:44', new Date(2026, 10, 4, 8, 8).getTime()), true);
});

test('카드 캐릭터: 지도 모드를 따르고 스타 세 모드는 새싹', () => {
  assert.deepEqual(characterOf('sprout'), {file: 'sprout-left.webp', flip: false});
  assert.deepEqual(characterOf('builder'), {file: 'builder-right.webp', flip: true});
  assert.deepEqual(characterOf('seonbi'), {file: 'seonbi-right.webp', flip: true});
  assert.deepEqual(characterOf('visitor'), {file: 'visitor-left.webp', flip: false});
  for (const look of ['scv', 'drone', 'probe', undefined, null]) assert.deepEqual(characterOf(look), {file: 'sprout-left.webp', flip: false});
});

// ---- 지하철 진행 멈춤 · 잘못 고름(Codex 리뷰 2026-11-04 재현)
const BASE = {nowMs: 1_000_000, zeroSinceMs: 0, trainLeft: null, pickedDueS: null, trainGone: false, listLength: 2, listFresh: true, departsPassed: true};
test('기다리기: 곧 도착 0초를 못 봐도 짐작한 열차가 떠났거나 목록에서 제때 사라지면 탔다', () => {
  // 피드가 0초를 건너뜀: 다음 열차들만 남았고 지도의 짐작 열차는 이 역을 떠났다 — 출발 10분 뒤에도 기다리기면 안 된다
  assert.equal(boardNow({...BASE, trainLeft: true}), true);
  // 지도에 그 열차가 없어도, 곧 올 목록에서 올 때가 지나 사라졌으면
  assert.equal(boardNow({...BASE, trainGone: true}), true);
});
test('기다리기: 곧 올 열차 줄에서 고른 열차가 1분 넘게 남았으면 지도 예측이 역을 지났다고 해도 타지 않았다', () => {
  // 지도 예측(pickedLeft)이 먼저 앞서 나가도, 줄이 아직 90초 남았다고 하면 기다린다
  assert.equal(boardNow({...BASE, trainLeft: true, pickedDueS: 90}), false);
  assert.equal(boardNow({...BASE, trainLeft: true, pickedDueS: 61}), false);
  // 1분 안이면 예측을 믿는다
  assert.equal(boardNow({...BASE, trainLeft: true, pickedDueS: 60}), true);
  assert.equal(boardNow({...BASE, trainLeft: true, pickedDueS: 0}), true);
  // 줄이 끊겼거나(모름) 그 열차가 줄에서 빠졌으면 지금처럼
  assert.equal(boardNow({...BASE, trainLeft: true, pickedDueS: null}), true);
  assert.equal(boardNow({...BASE, trainGone: true, pickedDueS: null}), true);
});
test('기다리기: 고른 열차가 떠났나 — 아직 먼 열차(탈 역이 차례 밖)는 떠난 것이 아니다', () => {
  const far = {seqIds: [101, 102, 103], cum: [0, 1000, 2000], dist: 500};
  assert.equal(pickedLeft(far, 133, false), false);
  const passed = {seqIds: [133, 134, 135], cum: [0, 1000, 2000], dist: 400};   // 탈 역(133)을 지나 134 로
  assert.equal(pickedLeft(passed, 133, false), true);
  assert.equal(pickedLeft({seqIds: [134, 135], cum: [0, 1000], dist: 100}, 133, true), true);   // 본 뒤 차례에서 빠짐
  assert.equal(pickedLeft({seqIds: [132, 133, 134], cum: [0, 1000, 2000], dist: 500}, 133, false), false);   // 오는 중
});
test('기다리기: 곧 올 열차 목록 갱신이 끊기면(오래됨) 목록이 없는 것처럼 탈 시각으로', () => {
  assert.equal(boardNow({...BASE, listFresh: false}), true);
  assert.equal(boardNow({...BASE, listFresh: false, departsPassed: false}), false);
});
test('기다리기: 열차가 아직 오는 중이면 탈 시각이 지나도(늦는 열차) 기다린다', () => {
  assert.equal(boardNow({...BASE, trainLeft: false}), false);
  assert.equal(boardNow(BASE), false);
  assert.equal(boardNow({...BASE, zeroSinceMs: BASE.nowMs - 50000}), true);   // 0초 + 지도에 없음 45초
});
test('타는 중: 내릴 역이 열차 예측에서 빠지면 시각으로', () => {
  const track = {seqIds: [201, 202, 203], cum: [0, 1000, 2000], dist: 500};
  // 처음부터 다른 길(예측에 이 구간 역이 보인 적 없다): 시각
  assert.equal(rideOver(track, [204, 205], true, false, false), true);
  assert.equal(rideOver(track, [204, 205], false, false, false), false);
  // 먼 내릴 역(예측 9역 밖)이라 아직 안 보임: 넉넉한 시각까지 열차를 따른다
  assert.equal(rideOver(track, [202, 203, 204, 205], true, false, true), false);
  assert.equal(rideOver(track, [202, 203, 204, 205], true, true, true), true);
  // 예측에 있으면 열차를 믿는다(늦는 열차)
  assert.equal(rideOver(track, [202, 203], true, true, true), false);
  assert.equal(rideOver(null, [202, 203], true, false, true), true);
});
test('타는 중: 구간 역이 보이던 열차에서 구간 역이 모두 빠지면 내릴 역을 지난 것 — 계획 시각 전이어도 내렸다(2026-11-26 중화)', () => {
  // 마들 → 중화 구간을 탄 열차가 중화를 지나 상봉 · 면목 …(예측이 중화를 건너뛰어 reached 를 못 봤다)
  const passed = {seqIds: [301, 302, 303], cum: [0, 1000, 2000], dist: 1200};
  assert.equal(rideOver(passed, [201, 202, 203, 204], false, false, true), true);
  assert.equal(rideOver(passed, [201, 202, 203, 204], false, false, false), false);   // 한 번도 안 보였으면 그대로 시각
  assert.equal(rideOver({seqIds: [], cum: [], dist: 0}, [201, 204], false, false, true), false);   // 빈 예측은 지난 것으로 보지 않는다
});
test('타는 중: 내릴 역에서 열차와 떨어진 새 위치가 연달아 3번이면 내렸다(2026-11-26 중화)', () => {
  const away = {stationM: 40, exitM: null, trainM: 600};
  assert.equal(offTrainFixes(0, away), 1);
  assert.equal(gotOff([1, 2, 3].reduce(count => offTrainFixes(count, away), 0)), true);
  assert.equal(gotOff(offTrainFixes(1, away)), false);
  assert.equal(offTrainFixes(2, {stationM: 40, exitM: null, trainM: 30}), 0);    // 열차와 같이 있다(아직 열차 안 · 역에 선 열차)
  assert.equal(offTrainFixes(2, {stationM: 400, exitM: 30, trainM: 900}), 3);    // 출구 50m 안
  assert.equal(offTrainFixes(2, {stationM: 400, exitM: 300, trainM: 900}), 0);   // 내릴 역 밖
  assert.equal(offTrainFixes(0, {stationM: 60, exitM: null, trainM: null}), 1);  // 열차가 지도에 없으면 떨어진 것
});
test('곧 올 열차 고르기: 내릴 역 전에 끝나거나 다른 지선으로 가는 열차는 뺀다', () => {
  const leg = rideLeg({line: '1호선', direction: '하행', stations: [133, 134, 135, 136, 137]});
  const names = {133: '서울', 134: '남영', 135: '용산', 136: '노량진', 137: '대방'};
  const nameOf = id => names[id];
  const row = extra => ({line: '1호선', direction: '하행', destination: '천안', trainNo: '1', ...extra});
  assert.equal(arrivalFits(row(), leg, null, nameOf), true);
  assert.equal(arrivalFits(row({destination: '용산'}), leg, null, nameOf), false);      // 목적지 전 종착
  assert.equal(arrivalFits(row({destination: '용산(급행)'}), leg, null, nameOf), false);
  assert.equal(arrivalFits(row(), leg, [133, 134, 135, 900, 901, 902, 903, 904], nameOf), false);   // 지선: 내릴 역 전에 길 밖 역이 5개 이어짐
  assert.equal(arrivalFits(row(), leg, [133, 134, 135, 900, 901, 902, 903], nameOf), true);        // 길 밖 4개까지는 급행 건너뛰기로 본다
  assert.equal(arrivalFits(row(), leg, [120, 121, 133, 134], nameOf), true);           // 예측 차례가 9역에서 끊김(멀리 있는 열차)
  assert.equal(arrivalFits(row({destination: '용산'}), leg, [133, 134, 135], nameOf), false);
  assert.equal(arrivalFits(row(), leg, [134, 135, 136, 137, 138], nameOf), true);
  assert.equal(arrivalFits(row({direction: '상행'}), leg, null, nameOf), false);
  assert.equal(arrivalFits(row({destination: '대방'}), leg, null, nameOf), true);      // 내릴 역이 종착이면 탈 수 있다
});
test('곧 올 열차 고르기: 2호선 순환열차(행선지 「성수」)는 성수를 지나 계속 가니 성수 너머로 가는 구간에도 탄다(재생 시험 2026-11-27 시청→잠실)', () => {
  // 곧 올 열차 줄의 행선지(bstatnNm)는 순환열차를 「성수」로 적는다 — 11-25 녹화 2호선 내선 08:20~08:49 「성수」 363 · 「성수종착」 10(위치 피드 statnTnm 은 「성수종착」)
  const leg = rideLeg({line: '2호선', direction: '내선', stations: [1, 10, 19, 20, 21, 22, 23, 24]});
  const names = {1: '시청', 10: '을지로입구', 19: '성수', 20: '건대입구', 21: '구의', 22: '강변', 23: '잠실나루', 24: '잠실'};
  const nameOf = id => names[id];
  const row = extra => ({line: '2호선', direction: '내선', destination: '성수', trainNo: '3078', ...extra});
  assert.equal(arrivalFits(row(), leg, null, nameOf), true);
  assert.equal(arrivalFits(row({line: '7호선'}), {...leg, line: '7호선'}, null, nameOf), false);   // 2호선 밖의 「성수」 행선지는 원래대로
  assert.equal(arrivalFits(row({destination: '건대입구'}), leg, null, nameOf), false);   // 2호선도 다른 역 행선지가 내릴 역 앞이면 그대로 뺀다
});
test('곧 올 열차 고르기: 급행이 건너뛰는 역(구간 밖)이 예측에 끼어도 다른 지선이 아니다(운영 시험 2026-11-04 · 9호선 노량진→여의도 사이 샛강)', () => {
  // 길찾기 구간 stations 에는 정차역만 있다 — 급행 열차 예측 차례에는 안 서는 역이 낀다
  const leg = rideLeg({line: '9호선', direction: '상행', stations: [910, 912, 914, 916]});
  const names = {910: '노량진', 911: '샛강', 912: '여의도', 913: '국회의사당', 914: '당산', 915: '선유도', 916: '염창'};
  const nameOf = id => names[id];
  const row = extra => ({line: '9호선', direction: '상행', destination: '김포공항', trainNo: '9', ...extra});
  assert.equal(arrivalFits(row(), leg, [910, 911, 912, 913, 914], nameOf), true);         // 샛강 · 국회의사당을 건너뛰는 급행
  assert.equal(arrivalFits(row(), leg, [911, 912, 913, 914, 915, 916, 917], nameOf), true);   // 구간 밖 역이 하나씩 끼고 내릴 역까지 닿는다
  assert.equal(arrivalFits(row(), leg, [910, 911, 912, 913, 914, 915], nameOf), true);     // 예측이 내릴 역 전에 끊겨도(9역 한도)
});
test('곧 올 열차 고르기: 급행 구간을 도는 완행은 구간 밖 역이 5개 넘게 이어져도 다시 구간 역으로 돌아오면 탄다(2026-11-27 점검 이슈 후보)', () => {
  // 급행 정차역만 있는 구간(구로 → 부평 사이 띄엄띄엄) — 완행 예측 차례에는 사이 역이 길게 낀다
  const leg = rideLeg({line: '1호선', direction: '하행', stations: [140, 150, 160]});
  const names = {140: '구로', 150: '부천', 160: '부평'};
  const nameOf = id => names[id];
  const row = extra => ({line: '1호선', direction: '하행', destination: '인천', trainNo: '1', ...extra});
  assert.equal(arrivalFits(row(), leg, [140, 141, 142, 143, 144, 145, 150, 151], nameOf), true);     // 사이 역 5개 → 구간 역 부천으로 돌아옴
  assert.equal(arrivalFits(row(), leg, [141, 142, 143, 144, 145, 146, 150, 151, 152], nameOf), true); // 탈 역 앞에서부터 예측이 시작돼도
  assert.equal(arrivalFits(row(), leg, [140, 141, 142, 143, 144, 145, 146, 147, 148], nameOf), false); // 돌아오지 않은 채 끊기면 지선으로 본다(원래대로)
  assert.equal(arrivalFits(row(), leg, [150, 151, 152, 153, 154, 155, 160], nameOf), true);           // 내릴 역까지 닿음
});

test('걷는 길 벗어남: 20m 넘는 위치를 연달아 3번 받으면 다시 찾기 — 한 번 튄 위치는 0 으로 돌아간다', () => {
  assert.equal(WALK_OFF_M, 20); assert.equal(OFF_FIXES, 3);
  let count = 0;
  for (const off of [25, 30]) count = offFixes(count, off);
  assert.equal(count, 2);
  assert.equal(offFixes(count, 20), 0, '20m 딱이면 길 위');
  count = [25, 5, 25, 25].reduce(offFixes, 0);
  assert.equal(count, 2, '중간에 길 위로 돌아오면 처음부터 센다');
  const base = {offFixes: 3, busy: false, nowMs: 100000, lastMs: 0};
  assert.equal(shouldReroute(base), true, '처음이면 바로');
  assert.equal(shouldReroute({...base, offFixes: 2}), false, '두 번은 아직');
  assert.equal(shouldReroute({...base, busy: true}), false, '찾는 중이면 또 부르지 않는다');
  assert.equal(shouldReroute({...base, lastMs: base.nowMs - REROUTE_GAP_MS + 1}), false, '다시 찾은 직후는 쉰다');
  assert.equal(shouldReroute({...base, lastMs: base.nowMs - REROUTE_GAP_MS}), true, '간격이 지나면 다시');
});

// ---- 정보 화면의 여정 전체 역 목록(2026-11-25 시안 15)
test('rideList: 구간마다 역을 다 적고 갈아타기 줄을 사이에 · 이번 역 줄 번호 · 내릴 역 표시 · 정류장을 모르는 버스 구간은 한 줄', async () => {
  const {rideList} = await import('../web/lib/ride-along.mts');
  const names = new Map(), train = (line, stops) => { const leg = {type: 'ride', line, from: stops[0], to: stops.at(-1), departs: '08:00', arrives: '08:10', direction: null, stops: stops.length - 1, wait: 0, stations: []}; names.set(leg, stops); return leg; };
  const bus = {type: 'bus', route: '472', from: '강남역', to: '신사역', departs: '08:21', arrives: '08:33', toward: '신사', stops: 5, wait: 0, path: []};
  const legs = [{type: 'walk', seconds: 300, metres: 300}, train('2호선', ['선릉', '역삼', '강남']), {type: 'walk', seconds: 120, metres: 100, exit: '5'}, bus, {type: 'walk', seconds: 60, metres: 60}];
  const list = rideList(legs, 1, {now: '역삼', next: '강남'}, leg => names.get(leg) ?? null, leg => leg.type === 'bus' ? '#00f' : '#0a0');
  assert.equal(list.at, 1);
  assert.deepEqual(list.rows, [
    {kind: 'stop', name: '선릉', color: '#0a0', edge: 'first', off: false}, {kind: 'stop', name: '역삼', color: '#0a0', edge: null, off: false}, {kind: 'stop', name: '강남', color: '#0a0', edge: 'last', off: true},
    {kind: 'gap'}, {kind: 'leg', text: '472번 강남역 → 신사역', color: '#00f'}]);
  // 갈아타기 줄은 글 없이 점선만(2026-11-26 사용자) — 지하철끼리(걷기 구간 없음)도 같다
  const pair = [train('1호선', ['시청', '서울역']), train('4호선', ['서울역', '숙대입구'])];
  assert.deepEqual(rideList(pair, 1, {now: '서울역', next: '숙대입구'}, leg => names.get(leg) ?? null, () => '#111').rows[2], {kind: 'gap'});
  assert.equal(rideList(pair, 1, {now: '서울역', next: '숙대입구'}, leg => names.get(leg) ?? null, () => '#111').at, 3, '같은 이름이 앞 구간에도 있어도 탄 구간의 줄');
  // 다음 역으로 가는 중(ahead): 다음 줄이 같은 구간의 역일 때만 — 이번 역이 내릴 역(다음 줄이 갈아타기)이면 false
  assert.equal(list.ahead, false, 'where.ahead 가 없으면 false');
  assert.equal(rideList(legs, 1, {now: '선릉', next: '역삼', ahead: true}, leg => names.get(leg) ?? null, () => '#111').ahead, true);
  assert.equal(rideList(legs, 1, {now: '강남', next: null, ahead: true}, leg => names.get(leg) ?? null, () => '#111').ahead, false);
});

test('rideAhead: 이번 역을 떠난 뒤에만 다음 역으로 가는 중 · 서 있거나 예측에 없으면 false', async () => {
  const {rideAhead} = await import('../web/lib/ride-along.mts');
  const track = dist => ({seqIds: [201, 202, 203], cum: [0, 1000, 2000], dist});
  assert.equal(rideAhead(track(1000), 202, 203), false, '역에 서 있음');
  assert.equal(rideAhead(track(1340), 202, 203), true);
  assert.equal(rideAhead(track(1500), 202, null), false, '다음 역 없음');
  assert.equal(rideAhead(track(1500), 202, 209), false, '다음 역이 예측에 없음');
});

test('rideList: 탄 구간의 역 이름을 모르거나 이번 역이 목록에 없으면 이번 · 다음 · 내릴 곳만', async () => {
  const {rideList} = await import('../web/lib/ride-along.mts');
  const bus = {type: 'bus', route: '472', from: '논현역', to: '압구정역', departs: '08:21', arrives: '08:33', toward: '압구정', stops: 3, wait: 0, path: []};
  const list = rideList([bus], 0, {now: '신사역', next: '가로수길'}, () => null, () => '#00f');
  assert.equal(list.at, 0);
  assert.deepEqual(list.rows.map(row => [row.name, row.off]), [['신사역', false], ['가로수길', false], ['압구정역', true]]);
});

test('rideTalk: 정보 화면 말풍선 — 목록과 겹치는 말 없이 말하듯이 · 내릴 곳 · 갈아탈 것만 노란 밑줄 · 숫자는 살짝 크게 · 한 정거장 남으면 별표', async () => {
  const {rideTalk} = await import('../web/lib/ride-along.mts');
  const train = {type: 'ride', line: '1호선', from: '서울역', to: '오산', departs: '08:10', arrives: '09:20', stops: 27, wait: 0, stations: []};
  const next = {type: 'ride', line: '2호선', from: '선릉', to: '강남', departs: '09:25', arrives: '09:30', stops: 2, wait: 0, stations: []};
  const talk = rideTalk([train, next], 0, 21);
  assert.deepEqual(talk.title, [{text: '오산', mark: 'line'}, '에서 내려요']);
  assert.deepEqual(talk.sub, ['아직 ', {text: '21정거장', mark: 'bold'}, ' 남았어요. ', {text: '09:20', mark: 'bold'}, '쯤 도착해요']);
  assert.deepEqual(talk.todo, ['내리면 ', {text: '2호선', mark: 'line'}, '으로 갈아타요.', ' ', {text: '09:25', mark: 'bold'}, '에 출발해요']);
  assert.deepEqual(rideTalk([train, next], 0, 1).sub, [{text: '다음 역에서 내려요!', mark: 'star'}]);
  const bus = {type: 'bus', route: '472', from: '강남역', to: '신사역', departs: '08:21', arrives: '08:33', toward: '신사', stops: 5, wait: 0, path: []};
  assert.deepEqual(rideTalk([bus], 0, 1).sub, [{text: '다음 정류장에서 내려요!', mark: 'star'}]);
});

test('rideNextText: 내려서 할 일 — 출구 · 걷기 · 다음 탈 것(계획 출발 시각) · 없는 부분은 빼고 · 할 일이 없으면 null', async () => {
  const {rideNextText} = await import('../web/lib/ride-along.mts');
  const text = parts => parts?.map(part => typeof part === 'string' ? part : part.text).join('') ?? null;
  const train = (line, to, departs) => ({type: 'ride', line, from: '선릉', to, departs, arrives: '08:34', stops: 2, wait: 0, stations: []});
  const walk = (seconds, exit = '') => ({type: 'walk', seconds, metres: seconds, exit});
  const bus = {type: 'bus', route: '472', from: '강남역', to: '신사역', departs: '08:21', arrives: '08:33', toward: '신사', stops: 5, wait: 0, path: []};
  assert.equal(text(rideNextText([train('2호선', '강남', '08:30'), walk(120, '5'), bus], 0)), '내리면 5번 출구로 나가 2분 걷고, 472번 타요. 08:21쯤 와요');
  assert.equal(text(rideNextText([train('2호선', '강남', '08:30'), walk(120), bus], 0)), '내리면 2분 걷고, 472번 타요. 08:21쯤 와요');
  assert.equal(text(rideNextText([train('2호선', '강남', '08:30'), walk(0, '5'), bus], 0)), '내리면 5번 출구로 나가서 472번 타요. 08:21쯤 와요');
  assert.equal(text(rideNextText([train('2호선', '강남', '08:30'), train('공항철도', '김포공항', '08:40')], 0)), '내리면 공항철도로 갈아타요. 08:40에 출발해요', '받침 없으면 「로」');
  assert.equal(text(rideNextText([train('2호선', '강남', '08:30'), walk(240, '3')], 0)), '내리면 3번 출구로 나가서 4분만 걸으면 도착이에요');
  assert.equal(text(rideNextText([bus, walk(120)], 0)), '내려서 2분만 걸으면 도착이에요');
  assert.equal(text(rideNextText([train('2호선', '강남', '08:30'), walk(0, '3')], 0)), '내리면 3번 출구로 나가요');
  // 탈 노선 · 버스만 밑줄 · 출구 번호 · 걷는 분 · 출발 시각은 살짝 크게만 — 2026-11-26 사용자 안 「나」
  const marked = parts => parts.filter(part => typeof part !== 'string').map(part => `${part.mark}:${part.text}`);
  assert.deepEqual(marked(rideNextText([train('2호선', '강남', '08:30'), walk(120, '5'), bus], 0)), ['bold:5번 출구', 'bold:2분', 'line:472번', 'bold:08:21']);
  assert.deepEqual(marked(rideNextText([train('2호선', '강남', '08:30'), train('공항철도', '김포공항', '08:40')], 0)), ['line:공항철도', 'bold:08:40']);
  assert.deepEqual(marked(rideNextText([train('2호선', '강남', '08:30'), walk(240, '3')], 0)), ['bold:3번 출구', 'bold:4분']);
  assert.equal(rideNextText([train('2호선', '강남', '08:30')], 0), null);
  assert.equal(rideNextText([walk(60)], 0), null);
});
