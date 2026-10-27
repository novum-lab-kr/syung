// 열차 자료 · 예측 계획의 타입(타입만 — 실행 코드는 없다. import type 으로만 부르니 빌드 결과에 이 파일은 없다)
import type { MercatorCoordinate } from 'maplibre-gl';
import type { FeedTrain, Station } from '../lib/routing.mts';

// /api/live 응답 trains 한 줄(server/services/live.py — 서울시 실시간 원본을 고른 칸)
export interface LiveTrain extends FeedTrain {
  trainNo:string; station:string; destination:string; direction:string; status:string;
  express:boolean; last:boolean; receivedAt:string|null; departsAt?:string; etaSeconds?:number|null;
}
// 역 자료(index.html stationData) — 좌표 · 급행이 서는 노선
export interface MapStation extends Station { lat:number; lon:number; express?:string[] }
// 주행 단계: from → to 를 k0 → k1 비율까지 dur 초(정차는 k0 === k1)
export interface Phase { from:MapStation; to:MapStation; k0:number; k1:number; dur:number; ease?:'both'|'in'|'out'|'none' }
// 따라잡기 · 천천히 가기(replacePlans 가 붙인다)
export interface Glide { c:import('../lib/train_catchup.mts').Catchup; at:number }
export interface Creep { from:number; at:number; ms:number; linear:boolean }
export interface TrainPlan {
  t:LiveTrain; id:string; phases:Phase[]; seq:MapStation[]; cum:number[]; cars:number; carMetres:number; lead:number;
  hold?:number; creep?:Creep; glide?:Glide;
}
// 선로 도형 한 구간(본체 geom · realGeom)
export interface TrackGeom { total:number }
export type Merc = MercatorCoordinate;
