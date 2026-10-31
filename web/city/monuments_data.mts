// 기념물 전용 모델(web/city/monuments.mts)의 자리와, 그 자리 지도 건물을 빼는 목록. 데이터만 둔다.
//
// 광화문: 자리는 지도(OSM way 170199440 · building=gatehouse)의 외곽에서 잰다. 가운데 동서 -5.5 m · 남북 -0.1 m(기준 126.97688 · 37.57593),
// 중앙 육축 앞면 31 m(동서 -21.3 ~ 9.7 m) · 깊이 13.3 m, 앞면이 동쪽으로 갈수록 1.3° 남쪽으로 기운다(시계 방향 · 아래 yawDeg).
// zone: 이 기념물 모델이 든 구역 파일(monuments_<zone>.mts — 구역마다 따로 지연 로드한다)
// minZoom: 이 줌보다 멀리서는 그리지 않는다(휴대폰 메모리 · 그리기 비용 — 없으면 14)
export interface Monument { id:string; zone:string; lngLat:[number, number]; yawDeg:number; minZoom?:number }
export const GATE_DECK_Z = 1.1, GATE_BASE_D = 13.3;   // 광화문 월대 윗면 높이(맞춤) · 육축 깊이(지도 외곽)
// 경복궁 모델의 기준점(지도 좌표) · 둘레와 건물 자리의 정수 좌표 원점
export const PALACE_AT:[number, number] = [126.977, 37.579];
export const PALACE_ORIGIN:[number, number] = [126.97, 37.57];
// 경복궁 둘레: OSM relation 5501517(경복궁)의 바깥 경계(좌표는 원점 기준 정수 짝 — monuments_gyeongbok_data.mts 머리 주석). 담장 모델과 지도 건물 비우기가 같이 쓴다
export const PALACE_RING:number[] = [4036,8690,4073,8376,4111,8054,4234,7300,4301,6962,4387,6427,4445,6097,4446,6088,4592,6006,4698,6005,4742,6004,5139,5984,5448,5972,6197,5941,6640,5931,6639,5880,6638,5872,6733,5870,6829,5869,6927,5866,6990,5865,6990,5871,6991,5908,7019,5907,7935,5925,8173,5930,8339,5940,8601,5976,8861,6008,9126,6295,9318,6458,9317,6507,9316,6564,9296,6563,9296,6580,9266,6579,9269,6753,9295,6753,9295,6770,9328,6771,9354,7936,9348,8071,9357,8200,9411,9013,9425,9497,9329,9500,9327,9566,9325,9620,9325,9631,9323,9686,9443,9692,9462,9986,9689,9980,10017,11036,10049,12170,9968,12615,9780,12941,9298,13289,7413,13565,6716,13667,6446,13651,6127,13632,5609,13552,5432,13523,4511,13350,4119,13277,3945,13226,3936,13000,3755,12912,3755,12743,3786,11975,3822,11071,3834,10761,3910,9816,4015,8900,4022,8830,3998,8829,4007,8801,4013,8778,4014,8758,4015,8738,4015,8714,4013,8686,4036,8690];
export const palaceRing = ():[number, number][] => { const ring:[number, number][] = []; for (let i = 0; i < PALACE_RING.length; i += 2) ring.push([PALACE_ORIGIN[0] + PALACE_RING[i]! / 1e6, PALACE_ORIGIN[1] + PALACE_RING[i + 1]! / 1e6]); return ring };
// 동상(이순신 · 세종대왕): 모델 코드는 monuments_gyeongbok.mts 에 남아 있지만 이번 배포에는 내보내지 않는다(사용자 결정 2026-10-31 — 다음 브랜치에서 곡면 메시로 다시 짓는다).
// 다시 내보낼 때 이 두 줄을 MONUMENTS 에, STATUE_HIDES 를 MONUMENT_HIDES 에 합친다.
export const STATUES:Monument[] = [
  { id: 'yi-sunsin', zone: 'gyeongbok', lngLat: [126.97695, 37.57097], yawDeg: 0 },   // 이순신 장군 동상: OSM node 2653074012 · direction 180°(남쪽을 본다)
  { id: 'sejong', zone: 'gyeongbok', lngLat: [126.97691, 37.57292], yawDeg: 0 },   // 세종대왕 동상: OSM node 3841809527 · direction 180°
];
export const MONUMENTS:Monument[] = [
  { id: 'gwanghwamun', zone: 'gyeongbok', lngLat: [126.976817, 37.575928], yawDeg: -1.3 },
  // 경복궁 둘레 담장 · 궁 안 건물(흥례문 … 향원정 전용 모델 + 나머지 한옥 틀): 같은 기준점 PALACE_AT, 방향 없음. 멀리서는 안 그린다
  { id: 'palace-wall', zone: 'gyeongbok', lngLat: PALACE_AT, yawDeg: 0, minZoom: 14.5 },
  { id: 'palace-halls', zone: 'gyeongbok', lngLat: PALACE_AT, yawDeg: 0, minZoom: 15.5 },
  { id: 'palace-frames', zone: 'gyeongbok', lngLat: PALACE_AT, yawDeg: 0, minZoom: 16 },
];
// 모델이 앉는 자리의 지도 건물(OSM 광화문 외곽 49.5 × 13.3 m — 육축과 양옆 궁장 도막)을 뺀다: 그 안에 중심이 있는 조각 건물
// (세종대왕 동상 앞 지도 건물 비우기는 STATUE_HIDES — 동상과 같이 다음 브랜치에서)
// 동상을 내보낼 때 합칠 자리 비우기(지금은 쓰지 않는다)
export const STATUE_HIDES = [{ lngLat: [126.97691, 37.57285] as [number, number], radiusM: 14, minH: 0 }];
export const MONUMENT_HIDES = [
  { lngLat: [126.976817, 37.575928] as [number, number], radiusM: 22, minH: 0 },
  // 경복궁 안: 둘레 안에 중심이 든 지도 건물은 모두 뺀다(전용 모델 · 한옥 틀이 대신 선다). 반경은 둘레 전체를 덮는 값 — 실제 판정은 area 다각형
  { lngLat: PALACE_AT, radiusM: 900, minH: 0, area: palaceRing() },
];

// 이 모델들이 있는 곳(광화문 · 경복궁 · 광화문광장 둘레): 화면이 이 둘레에 닿을 때만 코드를 받는다(첫 화면 · 다른 도시에서는 받지 않는다)
// bounds: 지도 화면의 메르카토르 사각 [서, 북, 동, 남](overlay 가 넘긴다)
const REGION = { lngLat: [126.9770, 37.5745] as [number, number], radiusM: 1500 };
export function monumentsInView(bounds:[number, number, number, number]):boolean {
  const [lng, lat] = REGION.lngLat, x = (lng + 180) / 360, y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2, r = REGION.radiusM / (40075016.686 * Math.cos(lat * Math.PI / 180));
  return bounds[0] - r <= x && x <= bounds[2] + r && bounds[1] - r <= y && y <= bounds[3] + r;
}

// 팩에 기념물 자리 비우기를 덧붙인 복사본(한 번만 만들어 둔다 — 팩 참조가 바뀌면 건물 타일을 전부 다시 짓는다)
interface HidePack { landmarkHide?:{ lngLat:[number, number]; radiusM:number; minH:number; area?:[number, number][] }[] }
const withHides = new WeakMap<object, object>();
export function withMonumentHides<P extends HidePack>(pack:P):P {
  let out = withHides.get(pack) as P | undefined;
  if (!out) { out = { ...pack, landmarkHide: [...(pack.landmarkHide || []), ...MONUMENT_HIDES] }; withHides.set(pack, out) }
  return out;
}

// 기본 모드(MapLibre 건물 층 bm-bld · bm-bld3d)에서 같은 자리 건물을 빼는 필터: 도시 엔진의 자리 비우기(위)는 이 층에 닿지 않는다.
// `within` 은 건물 전체가 다각형 안에 들어야 참이라, 반경을 키운 열여섯 각형으로 건물 윤곽 전체를 감싼다(반경 × 1.5).
export function monumentBuildingFilter():unknown[] {
  const rings = MONUMENT_HIDES.map(({ lngLat: [lng, lat], radiusM, area }) => {
    if (area) return [[...area, area[0]!]];
    const ring:[number, number][] = [], r = radiusM * 1.5;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ring.push([lng + Math.cos(a) * r / (111320 * Math.cos(lat * Math.PI / 180)), lat + Math.sin(a) * r / 110574]) }
    ring.push(ring[0]!); return [ring];
  });
  return ['!', ['within', { type: 'MultiPolygon', coordinates: rings }]];
}
