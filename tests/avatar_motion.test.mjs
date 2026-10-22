// 내 위치 캐릭터(web/map/avatar.mjs): 걷기 판단 · 방향 · 모양 메시
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyMotion, buildAvatarMesh, registerAvatar, avatarLooks } from '../web/map/avatar.mjs';
import * as syung from '../web/map/avatars/sprout.mjs';

const BASE = [127.0, 37.5], LNG_M = 111320 * Math.cos(37.5 * Math.PI / 180), LAT_M = 111320;
const at = (e, n) => ({ coords: { longitude: BASE[0] + e / LNG_M, latitude: BASE[1] + n / LAT_M, accuracy: 10 } });
// 같은 흔들림을 늘 똑같이(시험이 들쭉날쭉하지 않게)
const wobble = i => [Math.sin(i * 2.3) * 2, Math.cos(i * 1.7) * 2];

test('서 있으면 GPS 가 2 m 씩 튀어도 걷지 않는다', () => {
  let t = 0; const m = createMyMotion({ now: () => t });
  for (let i = 0; i < 30; i++) { t = i * 1000; m.fix(at(...wobble(i)), t) }
  assert.equal(m.walking, false);
  assert.equal(m.at(t + 16).walk < .01, true);
});

test('천천히 걸어도(0.9 m/s) 걷는다', () => {
  let t = 0; const m = createMyMotion({ now: () => t });
  for (let i = 0; i < 8; i++) { t = i * 1000; m.fix(at(i * .9, 0), t) }
  assert.equal(m.walking, true);
});

test('사람 걸음(1.3 m/s)이면 걷고, 방향은 걷는 쪽', () => {
  let t = 0; const m = createMyMotion({ now: () => t });
  for (let i = 0; i < 10; i++) { t = i * 1000; m.fix(at(...wobble(i)), t) }   // 먼저 서 있다가
  for (let i = 0; i < 10; i++) { t = 10000 + i * 1000; m.fix(at(i * 1.3, 0), t) }   // 동쪽으로
  assert.equal(m.walking, true);
  let s; for (let k = 1; k <= 30; k++) s = m.at(t + k * 33);
  assert.ok(s.walk > .9, `walk ${s.walk}`);
  assert.ok(Math.abs(s.yaw) < .1, `yaw ${s.yaw}`);   // 동쪽 = 0
});

test('열차 속도(15 m/s)면 탄 것으로 보고 서 있되 방향은 따라간다', () => {
  let t = 0; const m = createMyMotion({ now: () => t });
  for (let i = 0; i < 10; i++) { t = i * 1000; m.fix(at(0, i * 15), t) }   // 북쪽
  assert.equal(m.walking, false);
  assert.ok(Math.abs(m.at(t).yaw + Math.PI / 2) < .05);   // 북쪽 = 메르카토르 −y
});

test('멈추면 몇 초 뒤 다시 선다', () => {
  let t = 0; const m = createMyMotion({ now: () => t });
  for (let i = 0; i < 8; i++) { t = i * 1000; m.fix(at(i * 1.3, 0), t) }
  assert.equal(m.walking, true);
  for (let i = 1; i <= 2; i++) { t = 7000 + i * 1000; m.fix(at(7 * 1.3, 0), t) }
  assert.equal(m.walking, true);   // 막 멈춘 때는 아직(GPS 늦음)
  for (let i = 3; i <= 5; i++) { t = 7000 + i * 1000; m.fix(at(7 * 1.3, 0), t) }
  assert.equal(m.walking, false);
});

test('위치가 3초 간격으로 와도 걷는 동안 섰다 걸었다 하지 않는다', () => {
  let t = 0; const m = createMyMotion({ now: () => t });
  for (let i = 0; i < 6; i++) { t = i * 3000; m.fix(at(i * 3.9, 0), t) }   // 1.3 m/s
  assert.equal(m.walking, true);
  for (const dt of [500, 1500, 2500, 2900]) { m.at(t + dt); assert.equal(m.walking, true, `+${dt} ms`) }
  m.at(t + 4600); assert.equal(m.walking, false, '다음 위치가 안 오면 선다');
});

test('새 위치로 순간이동하지 않고 미끄러져 간다', () => {
  let t = 0; const m = createMyMotion({ now: () => t });
  m.fix(at(0, 0), 0); m.at(0); m.fix(at(10, 0), 1000);
  const half = m.at(1100).lngLat, d = (half[0] - BASE[0]) * LNG_M;
  assert.ok(d > .5 && d < 9.5, `${d} m`);
  let s; for (let k = 1; k <= 90; k++) s = m.at(1100 + k * 33);
  assert.ok(Math.abs((s.lngLat[0] - BASE[0]) * LNG_M - 10) < .1);
});

test('모양 메시: 12 float 꼭짓점, 다리 · 팔 축은 rig 높이, 그림자 따로', () => {
  const { body, shadow } = buildAvatarMesh(syung);
  assert.equal(body.length % 12, 0); assert.equal(shadow.length / 12, 6);
  const parts = new Set(); for (let i = 0; i < body.length; i += 12) {
    const part = body[i + 9]; parts.add(part);
    if (part === 1 || part === 2) assert.equal(body[i + 11], Math.fround(syung.rig.hip));
    if (part === 3 || part === 4) assert.equal(body[i + 11], Math.fround(syung.rig.shoulder));
  }
  for (const k of [0, 1, 2, 3, 4]) assert.ok(parts.has(k), `part ${k}`);
  // 키 1 · 폭 ±0.35 안(규칙)
  let zMax = 0, r = 0; for (let i = 0; i < body.length; i += 12) { zMax = Math.max(zMax, body[i + 2]); r = Math.max(r, Math.abs(body[i]), Math.abs(body[i + 1])) }
  assert.ok(zMax <= 1.001 && r <= .351, `${zMax} ${r}`);
});

test('등록한 이름으로 바꿔 쓴다', () => {
  registerAvatar('test-look', syung);
  assert.ok(avatarLooks().includes('test-look'));
});
