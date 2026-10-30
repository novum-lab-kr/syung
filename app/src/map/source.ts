// 앱 묶음 안의 지도(계획서 D5 — plugins/with-map-bundle.js 가 dist/web 을 map/ 폴더로 싣는다)를
// 앱 안 작은 http 서버(modules/map-server)로 띄워 앱 지도 모드(#app)로 연다.
// file:// 로 열면 지도 라이브러리가 Worker 를 띄우지 않아 바탕 지도가 하얗다(2026-10-30 시뮬레이터 확인).
import { requireNativeModule } from 'expo';
import { MAP_PORT } from '../config';

interface MapServerModule {
  start(port: number): Promise<void>;
}

const nativeServer = requireNativeModule<MapServerModule>('MapServer');

// 서버가 지도를 내주는 출처 — 운영 서버 CORS 가 이 값 하나만 연다(포트를 바꾸면 서버 쪽도 같이)
export const MAP_ORIGIN = `http://127.0.0.1:${MAP_PORT}`;
export const MAP_URL = `${MAP_ORIGIN}/index.html#app`;

// 이미 떠 있으면 바로 끝난다 — 앱이 쉬는 동안 시스템이 닫았을 수 있어 복귀 때마다 부른다
export function startMapServer(): Promise<void> {
  return nativeServer.start(MAP_PORT);
}
