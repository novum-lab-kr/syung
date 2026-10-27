// 롤코 길 · 언덕 · 주행의 타입(타입만 — 실행 코드는 없다. import type 으로만 부르니 빌드 결과에 이 파일은 없다)
import type { MercatorCoordinate } from 'maplibre-gl';
import type { TrackGeom, TrainPlan } from '../../trains/types.mts';

// 선로 도형의 한 점(메르카토르): 본체 withCum 에 넘기는 MercatorCoordinate, 또는 타워 코스처럼 {x, y} 에 1 m 길이를 붙인 것
export interface PathPt { x:number; y:number; meterInMercatorCoordinateUnits():number }
// 타워 코스의 고리(geometry towerPath): 플랫폼을 떠나는 곳 a · 고리에 오르고 내리는 곳 r0 · r1 · 실제 선로로 돌아오는 곳 b(메르카토르 거리)
export interface Spiral { a:number; r0:number; r1:number; b:number; T:MercatorCoordinate; tower:number; top:number }
// 역 사이 선로 도형(본체 withCum 결과 — geom · cityGeom · coasterPath)
export interface EdgeGeom extends TrackGeom { pts:PathPt[]; cum:number[]; spiral?:Spiral }
// 역 사이 높이(geometry coasterProfile): 10 m 마다 높이 h · 고가 위 덧높이 ex(m), 옆으로 비키는 몫 sw 와 모양 SW
export interface CoasterProfile {
  h:Float32Array; ex:Float32Array; n:number; st:number; mu:number; rise:boolean;
  sw:Float32Array | null; SW:((m:number)=>number) | null;
}
// coasterAt 의 값: [땅 거리, 높이, 옆, 기울기, 고가 위 높이](메르카토르 · lo → hi)
export type CoasterPoint = [sg:number, h:number, lat:number, roll:number, up:number];
// 본체 edgeGeom 캐시: 선로 도형과 높이(id 'h:…')가 같은 Map 에 든다
export type EdgeCache = Map<string, EdgeGeom | CoasterProfile>;
// 롤코 주행 계획: 탄 거리 누적(motion rideCum)을 계획에 붙여 둔다
export type RidePlan = TrainPlan & { ride?:{ cum:number[] } };
