// 도시 엔진 부품: 모드 전용 콘텐츠(조선 한옥 …)를 엔진(city_mesh · city_buildings)이 import 하지 않고 이름으로 받는다.
// 설정에는 이름과 자료만(팩의 hanok 등) — 함수는 그 콘텐츠 모듈이 불릴 때 스스로 등록한다. 메인 스레드와 Worker 가 각자 등록한다(코드는 메시지로 보내지 않는다).
// 쓰는 쪽은 등록을 먼저 끝낸다: 메인은 모드 코드 받기(loadModeKit)에 그 모듈을 넣고, Worker 는 정적으로 import 한다.
// 부품 하나: 그 콘텐츠 모듈이 넘기는 함수 · 값 묶음(엔진은 이름으로 꺼내 쓴다)
export type CityPartImpl = Readonly<Record<string, unknown>>;
const parts = new Map<string, { impl:CityPartImpl; part:CityPartImpl }>();
export function registerCityPart(key:string, impl:CityPartImpl):void {
  if (parts.has(key) && parts.get(key)!.impl !== impl) throw new Error(`도시 부품 ${key}: 이미 다른 것이 등록됨`);
  if (!parts.has(key)) parts.set(key, { impl, part: Object.freeze({ ...impl }) });
}
export function cityPart(key:string):CityPartImpl {
  const p = parts.get(key); if (!p) throw new Error(`도시 부품 ${key} 없음 — 그 콘텐츠 모듈을 먼저 불러야 한다`);
  return p.part;
}
export const hasCityPart = (key:string) => parts.has(key);
