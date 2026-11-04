// 타고 가기 셈 · 카드 글(web/lib/ride-along.mts) — 값은 계획서 plans/feature/20261102-슝-타고-가기.md 4절(2026-11-04 확정)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HURRY_SHARE, NEAR_M, arrivalFits, boardNow, pickedLeft, rideOver, OFF_M, catchable, characterOf, legOverByTime, legPace, measuredPace, metres, onPath, reached, leftStation, rideSteps, rideSub,
  splitPath, stopsLeft, talkKind, talkLine, transferS, waitText, waitTitle, walkLeftS, walkSub, walkTitle, doneSub,
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
  assert.equal(transfer.sub, '2/3 · 걸어서 2분 · 다음 열차 7분 뒤');
  assert.equal(transfer.say, '포탈 열면 가능한데… 그럴 거면 집으로 여시죠');
  assert.deepEqual(waitText(legs, 1, 120, null, 0), {say: null, sub: '걸어서 2분'});
});

test('걷기 · 타기 · 도착 카드 글', () => {
  const legs = [walkLeg(), rideLeg(), walkLeg({label: undefined})];
  assert.equal(walkTitle(legs, 0, '강남역'), '시청역 5번 출구까지 걸어요');
  assert.equal(walkTitle(legs, 2, '강남역'), '강남역까지 걸어요');
  assert.equal(walkSub(legs, 0, 72, 70), '1/3 · 70m · 1분');
  assert.equal(rideSub(legs, 1, 5), '2/3 · 5정거장 · 08:40');
  assert.equal(rideSub(legs, 1, 1), '2/3 · 다음 역에서 내려요');
  const now = new Date(2026, 10, 4, 8, 40), started = +now - 32 * 60000;
  assert.equal(doneSub('강남역', now, started), '강남역 · 08:40 · 32분 걸렸어요');
  assert.deepEqual(rideSteps(legs).map(step => step.kind), ['walk', 'wait', 'ride', 'walk', 'done']);
});

test('걷는 빠르기 · 남은 시간 · 갈아타기 시간', () => {
  const legs = [walkLeg(), rideLeg()];
  assert.equal(legPace(legs, 0), 240 / (300 - 90));
  assert.equal(walkLeftS(legs, 0, 120, 1.2), 100 + 90);
  assert.equal(measuredPace([{t: 0, at: 0}, {t: 5000, at: 2}]), null);
  assert.equal(measuredPace([{t: 0, at: 0}, {t: 20000, at: 24}]), 1.2);
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
});

test('위치를 못 쓸 때 시각으로 구간 끝', () => {
  const legs = [walkLeg(), rideLeg()];
  assert.equal(legOverByTime(legs, 0, new Date(2026, 10, 4, 8, 7), '08:50'), false);
  assert.equal(legOverByTime(legs, 0, new Date(2026, 10, 4, 8, 8, 30), '08:50'), true);   // 08:10 − 기다림 2분
  assert.equal(legOverByTime(legs, 1, new Date(2026, 10, 4, 8, 41), '08:50'), true);
});

test('카드 캐릭터: 지도 모드를 따르고 스타 세 모드는 새싹', () => {
  assert.deepEqual(characterOf('sprout'), {file: 'sprout-left.webp', flip: false});
  assert.deepEqual(characterOf('builder'), {file: 'builder-right.webp', flip: true});
  assert.deepEqual(characterOf('seonbi'), {file: 'seonbi-right.webp', flip: true});
  assert.deepEqual(characterOf('visitor'), {file: 'visitor-left.webp', flip: false});
  for (const look of ['scv', 'drone', 'probe', undefined, null]) assert.deepEqual(characterOf(look), {file: 'sprout-left.webp', flip: false});
});

// ---- 지하철 진행 멈춤 · 잘못 고름(Codex 리뷰 2026-11-04 재현)
const BASE = {nowMs: 1_000_000, zeroSinceMs: 0, trainLeft: null, trainGone: false, listLength: 2, listFresh: true, departsPassed: true};
test('기다리기: 곧 도착 0초를 못 봐도 짐작한 열차가 떠났거나 목록에서 제때 사라지면 탔다', () => {
  // 피드가 0초를 건너뜀: 다음 열차들만 남았고 지도의 짐작 열차는 이 역을 떠났다 — 출발 10분 뒤에도 기다리기면 안 된다
  assert.equal(boardNow({...BASE, trainLeft: true}), true);
  // 지도에 그 열차가 없어도, 곧 올 목록에서 올 때가 지나 사라졌으면
  assert.equal(boardNow({...BASE, trainGone: true}), true);
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
  // 지나쳤거나 다른 길(예측에 이 구간 역이 없다): 시각
  assert.equal(rideOver(track, [204, 205], true, false), true);
  assert.equal(rideOver(track, [204, 205], false, false), false);
  // 먼 내릴 역(예측 9역 밖)이라 아직 안 보임: 넉넉한 시각까지 열차를 따른다
  assert.equal(rideOver(track, [202, 203, 204, 205], true, false), false);
  assert.equal(rideOver(track, [202, 203, 204, 205], true, true), true);
  // 예측에 있으면 열차를 믿는다(늦는 열차)
  assert.equal(rideOver(track, [202, 203], true, true), false);
  assert.equal(rideOver(null, [202, 203], true, false), true);
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
