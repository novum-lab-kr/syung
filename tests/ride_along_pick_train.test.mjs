// 타고 가기 — 탄 열차 고르기(2026-11-26 사용자 시안2 · 시안5): 「탔어요 · 벌써 탔어요」 자동 선택 · 정보 화면 목록의 열차 그림 · 타는 중 바로잡기 글
import test from 'node:test';
import assert from 'node:assert/strict';

const {boardedPick, rideShare, rideTrainSpots, rideList, rideFixView, rideSwapAsk} = await import('../web/lib/ride-along.mts');

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
  assert.deepEqual(spots, [{id: 'stand', at: 0}, {id: 'run', at: 2, slide: -0.6}], '달리는 run 은 다음 역(3) 줄에서 위로 남은 몫');
});

test('목록 열차 자리: 반대 방향 열차는 막 지난 역이 예측 차례에 남아도 빼고, 같은 방향만(2026-11-26 실제 7호선 응답 — 하행 구간 목록에 상행 열차)', () => {
  // 구간(하행) 1 중곡 → 2 군자 → 3 어린이대공원 → 4 건대입구. 상행 열차 예측 차례 = [막 지난 역, 선 역, 앞으로 갈 역…](trains/plan seq)
  const up = [
    {id: '7호선:7262', track: along([3, 2, 1, 0], 1000)},   // 어린이대공원을 지나 군자에 섬(상행 · 다음 중곡)
    {id: '7호선:7270', track: along([2, 1, 0, -1], 1000)},  // 군자를 지나 중곡에 섬(상행) — 「카카오엔 중곡에 열차 없음」
    {id: '7호선:7264', track: along([4, 3, 2, 1], 500)},    // 건대입구 → 어린이대공원 사이(상행)
  ];
  const down = {id: '7호선:7303', track: along([0, 1, 2, 3, 4], 1000)};   // 용마산을 지나 중곡에 섬(하행)
  assert.deepEqual(rideTrainSpots([...up, down], STATIONS, null), [{id: '7호선:7303', at: 0}]);
  assert.equal(boardedPick(up, STATIONS), null, '탔어요 자동 선택도 반대 방향은 고르지 않는다');
});

test('목록: 다른 열차 그림도 탄 열차처럼 역 사이 간 몫만큼 선을 따라 옮긴다(2026-11-26 사용자 「다 움직여」)', () => {
  const spots = rideTrainSpots([
    {id: 'start', track: along([2, 3, 4], 50)},    // 2 에 서 있다 막 움직임(leftStation 전) — 2 줄에서 아래로 0.05
    {id: 'stand', track: along([1, 2, 3, 4], 0)},  // 서 있음 — 옮기지 않는다(slide 없음)
  ], STATIONS, 'mine');
  assert.deepEqual(spots, [{id: 'start', at: 1, slide: 0.05}, {id: 'stand', at: 0}]);
  const legs = [{type: 'ride', line: '2호선', from: '가', to: '라', stations: STATIONS, stops: 3, departs: '08:00', arrives: '08:10'}];
  const trains = {mine: 'M', bus: false, others: [{id: 'O', at: 0, slide: 0.3}, {id: 'S', at: 3}]};
  const list = rideList(legs, 0, {now: '나', next: '다'}, () => ['가', '나', '다', '라'], () => '#00a84d', trains);
  const others = list.rows.flatMap((row, order) => (row.marks ?? []).filter(mark => !mark.mine).map(mark => ({order, id: mark.id, slide: mark.slide})));
  assert.deepEqual(others, [{order: 0, id: 'O', slide: 0.3}, {order: 3, id: 'S', slide: undefined}]);
});

test('목록 열차 자리: 내릴 역은 서 있는 열차만 — 내릴 역을 지난 열차 · 반대 방향으로 내릴 역 → 탄 역을 지난 열차는 빼고(2026-11-26 7호선 먹골 → 중화)', () => {
  // 차례에 막 지난 역이 남는다(plan.mts seq = [앞 역, 보고 역, …]) · 구간 먹골(434) → 중화(435)
  const spots = rideTrainSpots([
    {id: '7호선:7224', track: along([435, 434, 424], 1000)},       // 장암행 · 먹골에 섬(중화는 지난 역)
    {id: '7호선:7267', track: along([434, 435, 135, 436], 1400)},  // 석남행 · 중화를 떠나 상봉으로
    {id: '7호선:stand', track: along([434, 435, 135], 1000)},      // 석남행 · 중화에 서 있음
  ], [434, 435], 'mine');
  assert.deepEqual(spots, [{id: '7호선:stand', at: 1}]);
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

test('목록 다른 열차를 누르면 묻는 팝업: 이름(「7호선 장암행」)이 그림에 실리고 · 글은 「이 열차로 바꿀까요?」 [바꾸기] [취소]', () => {
  const legs = [{type: 'ride', line: '7호선', from: '가', to: '라', stations: STATIONS, stops: 3, departs: '08:00', arrives: '08:10'}];
  const trains = {mine: '7호선:M', bus: false, others: [{id: '7호선:O', at: 2, name: '7호선 장암행'}, {id: '7호선:N', at: 3}]};
  const list = rideList(legs, 0, {now: '가', next: '나'}, () => ['가', '나', '다', '라'], () => '#747f00', trains);
  assert.deepEqual(list.rows[2].marks, [{id: '7호선:O', mine: false, bus: false, name: '7호선 장암행'}]);
  assert.deepEqual(list.rows[3].marks, [{id: '7호선:N', mine: false, bus: false}], '이름을 모르면 이름 없이');
  assert.deepEqual(rideSwapAsk('7호선 장암행'), {title: '이 열차로 바꿀까요?', name: '7호선 장암행', yes: '바꾸기', no: '취소'});
  assert.equal(rideSwapAsk(undefined).name, null);
});

test('목록: 탄 열차 그림은 역 사이 간 몫만큼 선 중간에(2026-11-26 사용자 「지하철 움직이게」) — 떠나기 전은 이번 줄에서 아래로 · 달리는 중은 다음 줄에서 위로', () => {
  assert.equal(rideShare(along([2, 3, 4], 1250), 3, 4), 0.25, '다 → 라 사이 1/4');
  assert.equal(rideShare(along([2, 3, 4], 1000), 3, 4), 0, '서 있음');
  assert.equal(rideShare(along([3, 4], 500), 2, 3), 0, '이번 역이 예측에서 빠지면 모름(0)');
  assert.equal(rideShare(along([3, 4], 1000), 4, null), 0, '내릴 역');
  const legs = [{type: 'ride', line: '2호선', from: '가', to: '라', stations: STATIONS, stops: 3, departs: '08:00', arrives: '08:10'}];
  const names = () => ['가', '나', '다', '라'], color = () => '#00a84d', trains = {mine: 'M', bus: false, others: []};
  const mine = list => list.rows.flatMap((row, order) => (row.marks ?? []).map(mark => ({order, slide: mark.slide})));
  assert.deepEqual(mine(rideList(legs, 0, {now: '나', next: '다', ahead: true, share: 0.25}, names, color, trains)), [{order: 2, slide: -0.75}]);
  assert.deepEqual(mine(rideList(legs, 0, {now: '나', next: '다', share: 0.05}, names, color, trains)), [{order: 1, slide: 0.05}], '떠나기 시작(leftStation 전)');
  assert.deepEqual(mine(rideList(legs, 0, {now: '나', next: '다', share: 0}, names, color, trains)), [{order: 1, slide: undefined}], '서 있으면 역 점 그대로');
  assert.deepEqual(mine(rideList(legs, 0, {now: '라', next: null, share: 0.5}, names, color, trains)), [{order: 3, slide: undefined}], '다음 줄이 역이 아니면 옮기지 않는다');
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
  const riding = rideFixView({step: 'ride', undo: false, choosing: false, listed: true}).fix;
  assert.deepEqual(riding.links.map(link => link.text), ['못 탔어요 ›']);
  assert.equal(riding.hint, '다른 열차면 목록의 열차를 눌러요');
  assert.equal(rideFixView({step: 'ride', undo: false, choosing: false}).fix.hint, undefined, '지도 화면(목록 없음)엔 목록 글 없음');
  assert.ok(rideFixView({step: 'wait', undo: false, choosing: false}).fix.links.some(link => link.text === '다른 열차를 탔어요 ›'));
});
