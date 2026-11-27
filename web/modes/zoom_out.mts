// 축소하면 기본 지하철: 설정 city.zoomOutBasic 이 켜진 모드(심시티)는 고가 상판이 나오기 전 줌보다 멀면
// 노선 · 역(track 묶음 통째)과 열차 굵기(trains.body)를 기본 모드 것으로 본다. 도시 · 지도 색 · 열차 모양(trains.look) 등 나머지는 그 모드 그대로.
// 결과는 모드 설정마다 한 번 만들어 얼린다(같은 설정이면 같은 참조 — track 참조로 다시 지을지 가르는 소비자가 있다).
// 다른 화면 파일을 import 하지 않는다.
import type { Settings } from './merge.mts';

interface ZoomOutView { city: Settings & { zoomOutBasic?: boolean }; track: Settings; trains: Settings & { body?: string } }

const made = new WeakMap<Settings, Settings>();
export function zoomOutSettings(S: Settings, base: Settings): Settings {
  const own = S as Settings & ZoomOutView, root = base as Settings & ZoomOutView;
  if (!own.city.zoomOutBasic) return S;
  let out = made.get(S); if (out) return out;
  const trains = own.trains.body === root.trains.body ? own.trains : Object.freeze({ ...own.trains, body: root.trains.body ?? null });
  out = Object.freeze({ ...S, track: root.track, trains }); made.set(S, out); return out;
}
