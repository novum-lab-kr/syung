// 지도 위 단추(오른쪽 위): 확대 · 축소, 내 위치.
// 스토리 · 조립 화면에서만 쓴다 — 화면의 단추는 MapLibre 가 직접 만든다(NavigationControl · GeolocateControl · 본체 map.addControl). 여기서는 그 DOM 을 그대로 옮겨 적어 같은 스타일을 받는다.
// locate: 내 위치 단추의 상태 — 라이브러리가 붙이는 class 그대로
export type LocateState = 'idle' | 'waiting' | 'active' | 'background' | 'error';
const LOCATE_CLASS:Record<LocateState, string> = {
  idle: '',
  waiting: ' maplibregl-ctrl-geolocate-waiting',
  active: ' maplibregl-ctrl-geolocate-active',
  background: ' maplibregl-ctrl-geolocate-background',
  error: ' maplibregl-ctrl-geolocate-background-error',
};

export const MapControls = ({ locate = 'idle' }:{ locate?:LocateState }) =>
  <div class="maplibregl-ctrl-top-right">
    <div class="maplibregl-ctrl maplibregl-ctrl-group">
      <button class="maplibregl-ctrl-zoom-in" type="button" aria-label="Zoom in" title="Zoom in"><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button>
      <button class="maplibregl-ctrl-zoom-out" type="button" aria-label="Zoom out" title="Zoom out"><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button>
    </div>
    <div class="maplibregl-ctrl maplibregl-ctrl-group">
      <button class={`maplibregl-ctrl-geolocate${LOCATE_CLASS[locate]}`} type="button" aria-label="Find my location" title="Find my location"><span class="maplibregl-ctrl-icon" aria-hidden="true"></span></button>
    </div>
  </div>;
