// 고른 곳의 슝 3D 마커를 실제 MapLibre 카메라로 돌려 보는 화면(화면과 같은 AvatarRenderer.renderMarker). 좌우는 몸 전체, 기울기는 고개만.
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AvatarRenderer, registerAvatar } from '../web/map/avatar.mts';
import * as sprout from '../web/map/avatars/sprout.mts';
import * as maplibregl from '../web/vendor/maplibre-gl.mjs';

// 스토리북 빌드는 지도 코드를 묶어 maplibre 가 제 옆의 Worker 를 못 찾는다 — 그대로 복사한 파일을 알려 준다(main.mts staticDirs)
maplibregl.setWorkerUrl(new URL('./vendor/maplibre-gl-worker.mjs', location.href).href);

const CENTER = [127.028214, 37.497291] as [number, number];
// 바탕에 격자를 깔아 지도가 도는 것이 보이게 한다(마커는 늘 이쪽을 보니 격자 없이는 멈춘 것처럼 보인다)
function gridLines() {
  const lines:number[][][] = [];
  for (let step = -6; step <= 6; step++) {
    lines.push([[CENTER[0] + step * .0004, CENTER[1] - .003], [CENTER[0] + step * .0004, CENTER[1] + .003]]);
    lines.push([[CENTER[0] - .003, CENTER[1] + step * .0004], [CENTER[0] + .003, CENTER[1] + step * .0004]]);
  }
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: lines } };
}

// 실제 지도는 열차 캔버스 맨 마지막에 그린다. 스토리는 지도 하나뿐이라 사용자 층으로 부른다
function markerLayer(map:maplibregl.Map) {
  registerAvatar('sprout', sprout);
  const renderer = new AvatarRenderer(), spot = maplibregl.MercatorCoordinate.fromLngLat(CENTER), world = [spot.x, spot.y];
  return { id: 'place-marker', type: 'custom' as const, renderingMode: '3d' as const,
    render(gl:WebGL2RenderingContext | WebGLRenderingContext, args:{ defaultProjectionData:{ mainMatrix:ArrayLike<number> } }) {
      renderer.renderMarker(gl as WebGL2RenderingContext, args.defaultProjectionData.mainMatrix, { world, origin: world, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
    } };
}

function MarkerStage() {
  const host = useRef<HTMLDivElement>(null), mapRef = useRef<maplibregl.Map | null>(null);
  const [bearing, setBearing] = useState(0), [pitch, setPitch] = useState(35), [spin, setSpin] = useState(false);
  useEffect(() => {
    const map = new maplibregl.Map({ container: host.current!, center: CENTER, zoom: 18, bearing: 0, pitch: 35, attributionControl: false, interactive: false,
      style: { version: 8, sources: { grid: { type: 'geojson', data: gridLines() } }, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#fff6c2' } }, { id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#ece6cf', 'line-width': 4 } }] } });
    map.on('load', () => map.addLayer(markerLayer(map)));
    mapRef.current = map;
    return () => map.remove();
  }, []);
  useEffect(() => { mapRef.current?.jumpTo({ bearing, pitch }) }, [bearing, pitch]);
  useEffect(() => {
    if (!spin) return;
    const timer = setInterval(() => setBearing(value => (value + 3) % 360), 50);
    return () => clearInterval(timer);
  }, [spin]);
  return <div style={{ width: '390px', fontFamily: 'var(--round)', color: 'var(--ink)' }}>
    <div ref={host} style={{ position: 'relative', width: '390px', height: '520px' }} />
    <div style={{ display: 'grid', gap: 'var(--space-2)', padding: 'var(--space-3)' }}>
      <label>좌우 {bearing}° — 몸 전체<input type="range" min={0} max={359} value={bearing} style={{ width: '100%' }} onInput={event => setBearing(+event.currentTarget.value)} /></label>
      <label>기울기 {pitch}° — 고개만<input type="range" min={0} max={60} value={pitch} style={{ width: '100%' }} onInput={event => setPitch(+event.currentTarget.value)} /></label>
      <button type="button" onClick={() => setSpin(value => !value)}>{spin ? '멈추기' : '한 바퀴 돌리기'}</button>
    </div>
  </div>;
}

const meta:Meta = { title: '컴포넌트/슝 마커', parameters: { layout: 'centered' } };
export default meta;
export const facing:StoryObj = { name: '카메라를 보는 슝', render: () => <MarkerStage /> };
