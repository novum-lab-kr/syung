// 내 위치 단추(GeolocateControl)의 GPS 옵션 주인 — 단추가 켜는 watch 마다 지금 바라는 옵션(보통 · 덜 정확하게)으로 다시 건다.
// 왜: vendor MapLibre 6.11.1 은 켜진 watch 개수를 모듈 안 셈(rh)으로 세어 1보다 크면 positionOptions 대신 {maximumAge:6e5,timeout:0}(덜 정확 · 10분 묵은 위치)을 쓴다.
//  권한 거부(code 1)는 watch 를 지우면서 그 셈을 줄이지 않아, 한 번 거부된 뒤로는 끔 → 켬 마다 그 옵션으로 켜졌다(2026-11-27 재현 — 가짜 GPS 페이지 · watchPosition 옵션 기록).
//  또 타고 가기가 지하철 구간에서 GPS 를 낮춘 동안 오류 → 단추로 끔 → 켬 하면 라이브러리가 보통 옵션으로 새로 걸어 낮춤이 풀린 채로 남았다.
// 그래서 trigger(단추 · 본체 · 타고 가기가 모두 이 문으로 켠다 — 라이브러리 단추도 this.trigger())를 감싸 새 watch 가 생기면 같은 처리기(_onSuccess · _onError)로 바로 다시 건다.
// 단추 상태(_watchState · 단추 class)는 그대로 둔다.
export interface GpsWatchControl {
  trigger():boolean;
  _geolocationWatchID?:number;
  _onSuccess:PositionCallback;
  _onError:PositionErrorCallback;
}

// geolocation 은 부를 때마다 받는다 — 가짜 GPS(dev/fake_gps · ?fakegps=1)가 늦게 navigator.geolocation 을 바꿔 끼운다
export function ownGpsWatch(control:GpsWatchControl, geolocation:() => Geolocation, normal:PositionOptions, low:PositionOptions) {
  let lowPower = false;
  const rewatch = () => {
    const id = control._geolocationWatchID;
    if (id === undefined) return;
    const geo = geolocation();
    geo.clearWatch(id);
    control._geolocationWatchID = geo.watchPosition(control._onSuccess, control._onError, lowPower ? low : normal);
  };
  const trigger = control.trigger.bind(control);
  control.trigger = () => {
    const before = control._geolocationWatchID, result = trigger();
    if (control._geolocationWatchID !== undefined && control._geolocationWatchID !== before) rewatch();
    return result;
  };
  // 덜 정확하게(타고 가기 지하철 구간) 켜고 끄기 — 꺼져 있으면 바람만 적어 두고 다음에 켜질 때 그 옵션으로
  return {lowPower(on:boolean) { if (on === lowPower) return; lowPower = on; rewatch(); }};
}
