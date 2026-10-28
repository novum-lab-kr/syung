import test from 'node:test';
import assert from 'node:assert/strict';
import {
  provider, avatarText, actionName, withdrawName, when, dayText, chartBars, kindLines, pageInfo, facts, ticketRow, placeRow, logLine,
} from '../web/admin/members_data.mts';

// 관리 화면 '회원'의 셈(admin/members.tsx 가 그린다) — 옛 인라인 스크립트와 같은 글자
const AT = 1_800_000_000;   // 2027-01-15 17:00 KST

test('회원: 이름표(로그인 방법 · 프로필 · 조치 · 탈퇴 사유)', () => {
  assert.equal(provider('kakao'), '카카오'); assert.equal(provider('apple'), 'Apple'); assert.equal(provider('naver'), 'naver');
  assert.equal(provider(null), '–'); assert.equal(provider(''), '–');
  assert.equal(avatarText({ type: 'photo' }), '올린 사진'); assert.equal(avatarText({ type: 'character', id: 'scv' }), '캐릭터 · 테란 SCV');
  assert.equal(avatarText({ type: 'character', id: 'new' }), '캐릭터 · new'); assert.equal(avatarText(null), '기본 캐릭터');
  assert.equal(actionName('avatar_view'), '사진 보기'); assert.equal(actionName('other'), 'other');
  assert.equal(withdrawName('kakao_unlink'), '카카오 연결 해제'); assert.equal(withdrawName('x'), 'x');
});

test('회원: 시각 · 요일', () => {
  assert.equal(when(AT), '27. 01. 15. 17:00'); assert.equal(when(AT, false), '27. 01. 15.'); assert.equal(when(null), '–');
  assert.equal(dayText([1, 3, 7]), '월 수 일'); assert.equal(dayText([]), '–');
});

test('회원: 막대 그래프(높이 · 위 숫자 · 7일마다 날짜)', () => {
  const daily = Array.from({ length: 30 }, (_, index) => ({ day: `2027-01-${String(index + 1).padStart(2, '0')}`, count: index === 29 ? 4 : index === 1 ? 1 : 0 }));
  const bars = chartBars(daily);
  assert.equal(bars.length, 30);
  assert.deepEqual(bars[0], { x: '2.0', y: '158.0', width: '16.0', height: '0.0', title: '2027-01-01 0명', value: null, label: null });
  assert.deepEqual(bars[1], { x: '22.0', y: '124.0', width: '16.0', height: '34.0', title: '2027-01-02 1명', value: { x: '30.0', y: '119.0', text: 1 }, label: { x: '30.0', y: 175, anchor: 'middle', text: '01.02' } });
  assert.deepEqual(bars[29], { x: '582.0', y: '22.0', width: '16.0', height: '136.0', title: '2027-01-30 4명', value: { x: '590.0', y: '17.0', text: 4 }, label: { x: '598.0', y: 175, anchor: 'end', text: '01.30' } });
  assert.deepEqual(bars.filter(bar => bar.label).map(bar => bar.label?.text), ['01.02', '01.09', '01.16', '01.23', '01.30']);
  // 가장 많은 날이 0 이어도 나누지 않는다(빈 막대)
  assert.equal(chartBars([{ day: '2027-01-01', count: 0 }])[0]?.height, '0.0');
});

test('회원: 로그인 방법 · 탈퇴 사유 줄 · 쪽', () => {
  assert.deepEqual(kindLines([{ provider: 'kakao', count: 3 }], item => provider(item.provider), '아직 회원 없음'), [{ name: '카카오', count: 3 }]);
  assert.deepEqual(kindLines([], () => '', '아직 탈퇴 없음'), [{ name: '아직 탈퇴 없음', count: 0 }]);
  assert.deepEqual(pageInfo({ total: 1234, page: 1, pageSize: 50, members: [] }, 1), { text: '1,234명 · 1 / 25쪽', prev: false, next: true });
  assert.deepEqual(pageInfo({ total: 0, page: 1, pageSize: 50, members: [] }, 1), { text: '0명 · 1 / 1쪽', prev: false, next: false });
  assert.deepEqual(pageInfo({ total: 100, page: 2, pageSize: 50, members: [] }, 2), { text: '100명 · 2 / 2쪽', prev: true, next: false });
});

test('회원: 상세 칸 · 승차권 · 장소 · 관리 기록', () => {
  const member = { id: 7, name: '김슝', createdAt: AT, provider: 'kakao', tickets: 2, lastLogin: null, sessions: 1,
    avatar: null, identities: [{ provider: 'kakao', createdAt: AT }, { provider: 'google', createdAt: AT }], ticketList: [], log: [] };
  assert.deepEqual(facts(member), [['회원번호', 7], ['닉네임', '김슝'], ['가입', '27. 01. 15. 17:00'], ['로그인 방법', '카카오 · 구글'],
    ['최근 로그인', '–'], ['로그인 중인 기기', '1대'], ['승차권', '2장'], ['프로필', '기본 캐릭터']]);
  assert.equal(facts({ ...member, identities: [] })[3]?.[1], '–');
  assert.deepEqual(ticketRow({ id: 1, name: '출근', depart: '08:10', days: [1, 2], hasRoute: true, createdAt: AT, updatedAt: AT }), ['출근', '08:10', '월 화', '있음', '27. 01. 15.']);
  assert.deepEqual(placeRow({ id: 1, name: '출근', from: { name: '시청', lat: 37.5663, lng: 126.9779 }, to: { name: '강남', lat: 37.4979, lng: 127.0276 } }),
    ['출근', '시청 (37.5663, 126.9779)', '강남 (37.4979, 127.0276)']);
  assert.deepEqual(logLine({ at: AT, action: 'logout', reason: '분실' }), ['27. 01. 15. 17:00 · ', '강제 로그아웃', ' · 분실']);
  assert.deepEqual(logLine({ at: AT, action: 'avatar_view', reason: null }), ['27. 01. 15. 17:00 · ', '사진 보기', '']);
});
