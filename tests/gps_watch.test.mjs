// 내 위치 단추 GPS 옵션(web/map/gps_watch.mts) — 단추가 켜는 watch 마다 지금 바라는 옵션으로 다시 건다(2026-11-27)
// 가짜 단추는 vendor MapLibre 6.11.1 GeolocateControl.trigger 의 watch 셈(rh)을 그대로 흉내 낸다: 끄면 셈을 줄이고, 셈이 1보다 크면 {maximumAge:6e5,timeout:0}
// 권한 거부(code 1)는 watch 를 지우고 OFF 로 두지만 셈은 줄이지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import {ownGpsWatch} from '../web/map/gps_watch.mts';

const NORMAL = {enableHighAccuracy: true, maximumAge: 2000}, LOW = {enableHighAccuracy: false, maximumAge: 30000};

function setup() {
  const live = new Map(), log = [];
  let nextId = 1, count = 0;
  const geo = {
    watchPosition(ok, fail, options) { const id = nextId++; live.set(id, options); log.push(options); return id; },
    clearWatch(id) { live.delete(id); },
  };
  const control = {
    _watchState: 'OFF', _geolocationWatchID: undefined, _onSuccess() {}, _onError() {},
    trigger() {
      if (this._watchState === 'OFF') this._watchState = 'WAITING_ACTIVE';
      else { count--; this._watchState = 'OFF'; }
      if (this._watchState === 'OFF' && this._geolocationWatchID !== undefined) { geo.clearWatch(this._geolocationWatchID); this._geolocationWatchID = undefined; }
      else if (this._geolocationWatchID === undefined) {
        count++;
        this._geolocationWatchID = geo.watchPosition(this._onSuccess, this._onError, count > 1 ? {maximumAge: 6e5, timeout: 0} : NORMAL);
      }
      return true;
    },
    denied() { this._watchState = 'OFF'; geo.clearWatch(this._geolocationWatchID); this._geolocationWatchID = undefined; },
  };
  const gps = ownGpsWatch(control, () => geo, NORMAL, LOW);
  // 지금 켜진 watch 하나의 옵션(켜진 것이 하나가 아니면 실패)
  const current = () => { assert.equal(live.size, 1); assert.equal([...live.keys()][0], control._geolocationWatchID); return [...live.values()][0]; };
  return {control, gps, current, live, log};
}

test('권한 거부가 한 번 난 뒤 다시 켜도 보통 옵션으로 켜진다', () => {
  const {control, current} = setup();
  control.trigger();
  assert.deepEqual(current(), NORMAL);
  control.denied();
  control.trigger();
  assert.deepEqual(current(), NORMAL);
  control.trigger(); control.trigger();   // 끔 → 켬
  assert.deepEqual(current(), NORMAL);
});

test('낮춘 동안 단추로 끄고 다시 켜도 낮춘 옵션 · 되돌리면 보통 옵션', () => {
  const {control, gps, current, live} = setup();
  control.trigger();
  gps.lowPower(true);
  assert.deepEqual(current(), LOW);
  control.trigger();
  assert.equal(live.size, 0);
  control.trigger();
  assert.deepEqual(current(), LOW);
  gps.lowPower(false);
  assert.deepEqual(current(), NORMAL);
});

test('꺼져 있을 때 낮추면 다음에 켤 때 그 옵션 · 같은 값은 다시 걸지 않는다', () => {
  const {control, gps, current, live, log} = setup();
  gps.lowPower(true);
  assert.equal(live.size, 0);
  control.trigger();
  assert.deepEqual(current(), LOW);
  const made = log.length;
  gps.lowPower(true);
  assert.equal(log.length, made);
});
