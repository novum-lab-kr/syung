// 타고 가기 — 탄 열차 고르기(2026-11-26 사용자 시안2 · 시안5): 「탔어요 · 벌써 탔어요」 자동 선택 · 정보 화면 목록의 열차 그림 · 타는 중 바로잡기 글
import test from 'node:test';
import assert from 'node:assert/strict';

const {boardedPick, rideTrainSpots, rideList, rideFixView} = await import('../web/lib/ride-along.mts');

// 구간: 1(탄 역) → 2 → 3 → 4(내릴 역) · 역 사이 1000m. 열차 예측 차례(seqIds)는 앞으로 갈 역만(지난 역은 빠진다)
const STATIONS = [1, 2, 3, 4];
const along = (seqIds, dist) => ({seqIds, cum: seqIds.map((_id, order) => 1000 * order), dist});

test('자동 선택: 탄 역에 서 있는 열차(거리 0)가 막 떠난 열차보다 가깝다', () => {
  const standing = {id: '2호선:A', track: along([1, 2, 3, 4, 5], 0)};
  const leaving = {id: '2호선:B', track: along([1, 2, 3, 4, 5], 400)};
  assert.equal(boardedPick([leaving, standing], STATIONS), '2호선:A');
});

test('자동 선택: 지난 역이 예측 차례에서 빠져도 같은 역 사이에선 다음 역까지 남은 거리가 먼 쪽(탄 역에 가까운 쪽)을 고른다(PR #178 리뷰)', () => {
  const nearNext = {id: '2호선:A', track: along([2, 3, 4, 5], -100)};   // 다음 역(2) 100m 앞
  const nearBoard = {id: '2호선:B', track: along([2, 3, 4, 5], -900)};   // 탄 역(1)을 막 떠남 — 다음 역 900m 앞
  assert.equal(boardedPick([nearNext, nearBoard], STATIONS), '2호선:B');
  assert.equal(boardedPick([nearBoard, nearNext], STATIONS), '2호선:B');
});

test('자동 선택: 서 있는 열차가 없으면 탄 역을 지나 가장 덜 간 열차', () => {
  const far = {id: '2호선:far', track: along([3, 4, 5], 200)};      // 2번 역 지나 3번 역 근처
  const near = {id: '2호선:near', track: along([2, 3, 4, 5], -500)};   // 1번 역 떠나 2번 역 가는 중(1 은 차례에서 빠짐)
  const coming = {id: '2호선:coming', track: along([0, 1, 2, 3, 4], 300)};   // 아직 탄 역 전
  assert.equal(boardedPick([far, coming, near], STATIONS), '2호선:near');
});

test('자동 선택: 반대 방향 · 내릴 역에 닿은 열차는 빼고, 없으면 null', () => {
  const opposite = {id: '2호선:R', track: along([1, 0, -1], 0)};    // 탄 역에 서 있지만 다음 역(2)이 그 열차 차례에 없다
  const arrived = {id: '2호선:D', track: along([4, 5], 0)};          // 내릴 역에 닿음
  assert.equal(boardedPick([opposite, arrived], STATIONS), null);
});

test('목록 열차 자리: 서 있으면 그 역 · 역 사이면 다음 역 · 탄 열차와 반대 방향은 빼고', () => {
  const spots = rideTrainSpots([
    {id: 'mine', track: along([2, 3, 4], 0)},
    {id: 'stand', track: along([1, 2, 3, 4], 0)},
    {id: 'run', track: along([2, 3, 4, 5], 400)},    // 2 를 떠나 3 으로 가는 중
    {id: 'back', track: along([1, 0], 0)},
  ], STATIONS, 'mine');
  assert.deepEqual(spots, [{id: 'stand', at: 0}, {id: 'run', at: 2}]);
});

test('목록: 탄 열차는 이번 역 줄(역 사이면 다음 역 줄) · 다른 열차는 그 역 줄 · 같은 줄이면 탄 것만', () => {
  const legs = [{type: 'ride', line: '2호선', from: '가', to: '라', stations: STATIONS, stops: 3, departs: '08:00', arrives: '08:10'}];
  const names = () => ['가', '나', '다', '라'];
  const trains = {mine: '2호선:M', bus: false, others: [{id: '2호선:O', at: 0}, {id: '2호선:X', at: 2}]};
  const list = rideList(legs, 0, {now: '나', next: '다', ahead: true}, names, () => '#00a84d', trains);
  assert.deepEqual(list.rows.map(row => row.marks ?? []), [
    [{id: '2호선:O', mine: false, bus: false}],
    [],
    [{id: '2호선:M', mine: true, bus: false}],
    [],
  ], '역 사이를 달리는 탄 열차는 다음 역(다) 줄 · 같은 줄의 다른 열차(X)는 그리지 않는다');
  const plain = rideList(legs, 0, {now: '나', next: '다'}, names, () => '#00a84d');
  assert.ok(plain.rows.every(row => !row.marks), '열차를 안 넘기면 그림 없음');
});

test('목록: 버스는 탄 차만 · 정류장 이름을 못 맞추면 다른 열차는 안 그린다', () => {
  const bus = [{type: 'bus', route: '472', from: '가', to: '다', stops: 2, departs: '08:00', arrives: '08:10', path: [], color: '#3d5bab'}];
  const list = rideList(bus, 0, {now: '나', next: '다'}, () => ['가', '나', '다'], () => '#3d5bab', {mine: null, bus: true, others: []});
  assert.deepEqual(list.rows[1].marks, [{id: null, mine: true, bus: true}]);
  const train = [{type: 'ride', line: '2호선', from: '가', to: '라', stations: STATIONS, stops: 3, departs: '08:00', arrives: '08:10'}];
  const unknown = rideList(train, 0, {now: '나', next: '다'}, () => null, () => '#00a84d', {mine: 'M', bus: false, others: [{id: 'O', at: 3}]});
  assert.deepEqual(unknown.rows.map(row => row.marks?.length ?? 0), [1, 0, 0]);
});

test('타는 중 바로잡기 글: 「다른 열차예요」 없이 · 목록이 보이면 「다른 열차면 목록의 열차를 눌러요」 · 기다리기의 「다른 열차를 탔어요」는 그대로', () => {
  const riding = rideFixView({step: 'ride', left: false, undo: false, choosing: false, listed: true}).fix;
  assert.deepEqual(riding.links.map(link => link.text), ['못 탔어요 ›']);
  assert.equal(riding.hint, '다른 열차면 목록의 열차를 눌러요');
  assert.equal(rideFixView({step: 'ride', left: false, undo: false, choosing: false}).fix.hint, undefined, '지도 화면(목록 없음)엔 목록 글 없음');
  assert.ok(rideFixView({step: 'wait', left: false, undo: false, choosing: false}).fix.links.some(link => link.text === '다른 열차를 탔어요 ›'));
});
