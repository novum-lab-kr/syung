import test from 'node:test';
import assert from 'node:assert/strict';
import { duration, level, clock, callLine, cacheRow } from '../web/admin/status_data.mts';

// 관리 화면 '서버 상태'의 셈(admin/status.tsx 가 그린다) — 옛 인라인 스크립트와 같은 글자
test('서버 상태: 켠 지 · 시각', () => {
  assert.equal(duration(59), '0분'); assert.equal(duration(3 * 3600 + 5 * 60), '3시간 5분'); assert.equal(duration(2 * 86400 + 7 * 3600 + 30), '2일 7시간');
  assert.equal(clock('2026-10-28T09:05:31+09:00'), '09:05'); assert.equal(clock(null), '–');
});

test('서버 상태: 사용량 막대(70% 노랑 · 90% 빨강) · 장부를 못 읽음', () => {
  assert.equal(level(.69), ''); assert.equal(level(.7), 'mid'); assert.equal(level(.9), 'bad');
  assert.deepEqual(callLine({ key: 'subway', label: '서울시 지하철', used: 1500, limit: 2000, day: '2026-10-28' }),
    { label: '서울시 지하철', count: '1,500 / 2,000', width: '75.0%', level: 'mid', sub: '75% 사용 · 기준일 2026-10-28' });
  assert.deepEqual(callLine({ key: 'bus', label: '버스', used: null, limit: 1000, day: null }),
    { label: '버스', count: '? / 1,000', width: '0.0%', level: '', sub: '장부를 읽지 못했어요' });
  assert.equal(callLine({ key: 'x', label: 'x', used: 0, limit: 10, day: null }).sub, '0% 사용 · 기준일 아직 호출 없음');
  assert.equal(callLine({ key: 'x', label: 'x', used: 30, limit: 10, day: 'd' }).width, '100.0%');
});

test('서버 상태: 캐시 줄', () => {
  assert.deepEqual(cacheRow({ key: 'subway', label: '지하철 전 노선', entries: 1234, ageSeconds: 12 }), ['지하철 전 노선', '1,234', '12초']);
  assert.deepEqual(cacheRow({ key: 'p', label: '위치', entries: 0, ageSeconds: null }), ['위치', '0', '–']);
});
