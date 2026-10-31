// 숭례문 구역: 이 문이 화면에 닿을 때만 받는다. 모드 · 테마는 받지 않는다.
// 자리: OSM relation 10647050(way 233625717 + 1487802248)(2026-11-01 API 원자료), 아래 outline은 그 외곽을 문 중심으로 돌린 미터 좌표.
// https://www.openstreetmap.org/relation/10647050
// 중심 126.975360250, 37.559986250 · 동쪽 기둥열의 반시계 회전 -41.801704°(OSM 외곽 긴 변에서 계산).
// 정면 5칸 · 측면 2칸 · 중층 다포 우진각: https://ko.wikipedia.org/wiki/숭례문
// 전체 높이 19 m: 서울시의회 「국가유산주변 건축물 높이 기준」(보호구역 지표 기준의 반올림 값, 정밀 실측 아님).
// https://ms.smc.seoul.kr/attach/record/SEOUL/appendix/a11/A0063919.pdf
// 문루 22.5 × 7.7 m · 전면 전돌 여장 1.2 m: 문화재청 2013-04-29 공개 현황을 전재한 https://www.nocutnews.co.kr/news/1027329
// 육축 6.4 m(지표 노출 높이): 국립문화재연구소 2010 발굴 발표 https://www.seoul.co.kr/news/life/2010/07/01/20100701003005
// 색 · 형태: 서울시 「숭례문 정면」 https://seoulcitywall.seoul.go.kr/board/B0008.do?act=read&bpoId=3447
// 주의: 홍예 4.8 × 5.2 m, 층별 높이·처마 돌출·기둥 굵기·공포·옹성 높이·여장 세부는 정밀 도면 미확보로 시각화 근사이다.
// 화강암 회색 · 주칠 붉은색 · 뇌록 녹색 · 회흑 기와는 공통 실물 색표를 쓴다. 측색 수치는 미확인.
// 확인 안 된 계단 위치·폭, 현판 글씨·잡상 조각은 임의로 복원하지 않는다.
// 현판 세로 약 0.9 × 1.9 m: 근사(검은 바탕 + 금빛 테두리까지만). 여장은 문루 둘레 네 면을 닫았다 — 일각문 자리는 근거 미확보로 근사.
import { buildCityGate } from './monuments_gates.mts';
import type { GateShape } from './monuments_gates.mts';
export const SHAPE:GateShape = {"base": [[-0.738, -10.314], [3.811, -10.411], [9.133, -10.685], [17.001, -10.773], [16.881, -7.594], [16.67, -4.498], [16.647, -1.204], [16.807, 1.119], [16.712, 5.29], [16.892, 10.781], [8.808, 10.78], [-0.695, 10.779], [-13.011, 10.771], [-14.181, 10.77], [-17.001, 10.773], [-17.025, 9.542], [-17.399, -10.174], [-10.378, -10.467], [-4.067, -10.244], [-0.738, -10.314]], "frameWidth": 22.5, "frameDepth": 7.7, "height": 19, "masonryHeight": 6.4, "archWidth": 4.8, "archHeight": 5.2, "verticalPlaque": true};
export function buildMonument(id:string):Float32Array { return id === 'sungnyemun' ? buildCityGate(SHAPE) : new Float32Array() }

// 횃불: 통로 축 양쪽 끝에 좌우 대칭 쌍을 같은 간격(8 m)으로 — 축에서 ±4.6 m · 육축 끝에서 2.5 m 떨어진 첫 쌍부터(문 국소 좌표 기준, 아래는 문 중심 동 · 북 0.1 m 정수 짝).
// 생성된 육축 · 옹성 · 계단 1.6 m, OSM 건물 1.6 m, OSM 차로 가장자리 1 m 안은 비웠다(tests/fixtures/gates_obstacles.json). 횃불은 현대 실재 시설이 아닌 야간 시각화이다.
export const torches:{ at:[number, number]; data:number[] } = { at: [126.97536025, 37.559986249999994], data: [54,130,123,68,108,189,176,128,-123,-68,-54,-130,-176,-128,-108,-189,-229,-188,-161,-249] };   // monuments.mts 가 구역을 받으면 횃불 숲으로 등록(문 중심 기준)
