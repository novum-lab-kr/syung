// 내 위치: 앱이 직접 구한다(expo-location). 옵션 · 실패 처리는 웹(web/maplibre_runtime.mts 첫 방문 · web/user/account.mts currentFix)과 같은 뜻 — 낮은 정확도 · 8초 제한 · 5분 안의 값은 다시 쓴다.
// 권한 거부 · 실패는 조용히 null(알림은 부르는 쪽 몫 — 웹도 자동 위치는 알리지 않고 승차권 📍 만 토스트를 띄운다).
// 모듈이 없는 옛 빌드에서도 Metro 로 새 JS 를 받으니 정적 import 하면 앱이 죽는다(expo-location 은 불러오는 순간 네이티브 모듈을 찾는다). 있는지 보고 나서 불러온다.
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';

export type LngLat = readonly [number, number];   // 경도, 위도

const METRO_AREA = { west: 126.3, south: 36.8, east: 127.9, north: 38.3 };   // 웹 METRO_AREA 와 같다
const FIX_TIMEOUT = 8000;
const FIX_MAX_AGE = 300000;
const WATCH_DISTANCE = 50;   // 지도 파란 점이 아니라 길찾기 출발점 값이라 50 m 마다면 된다

let known: LngLat | null = null;

async function loadLocation() {
  if (!requireOptionalNativeModule('ExpoLocation')) return null;
  return import('expo-location');
}

function withinTimeout<Value>(work: Promise<Value>): Promise<Value | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), FIX_TIMEOUT);
    work.then(value => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

// 지금 한 번 물어본다(처음이면 권한 창이 뜬다). 거부 · 시간 초과 · 실패 · 모듈 없음은 모두 null
async function askFix(): Promise<LngLat | null> {
  try {
    const Location = await loadLocation();
    if (!Location) return null;
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const position = await Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE })
      ?? await withinTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return position ? [position.coords.longitude, position.coords.latitude] : null;
  } catch {
    return null;
  }
}

// 승차권 📍: 아는 위치가 있으면 그것, 없으면 지금 한 번 물어본다(웹 currentFix 와 같다 — 수도권 밖이어도 돌려준다)
export async function currentFix(): Promise<LngLat | null> {
  return known ?? askFix();
}

function insideMetro([longitude, latitude]: LngLat) {
  return longitude >= METRO_AREA.west && longitude <= METRO_AREA.east && latitude >= METRO_AREA.south && latitude <= METRO_AREA.north;
}

// 지도 화면에서 한 번 쓴다: 앱을 열 때 권한을 묻고, 수도권 안이면 그때부터 위치를 따라간다(웹도 수도권 안에서만 저절로 켠다 — 밖이거나 거부면 null)
export function useMyLocation(): LngLat | null {
  const [location, setLocation] = useState<LngLat | null>(known);
  useEffect(() => {
    let closed = false;
    let stopWatch: (() => void) | null = null;
    const update = (next: LngLat) => { known = next; setLocation(next); };
    void (async () => {
      const first = await askFix();
      if (closed || !first || !insideMetro(first)) return;
      update(first);
      try {
        const Location = await loadLocation();
        if (!Location || closed) return;
        const watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: WATCH_DISTANCE },
          position => update([position.coords.longitude, position.coords.latitude]));
        if (closed) watch.remove(); else stopWatch = () => watch.remove();
      } catch {
        // 따라가기만 실패한 것 — 받아 둔 위치는 그대로 쓴다
      }
    })();
    return () => { closed = true; stopWatch?.(); };
  }, []);
  return location;
}
