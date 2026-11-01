// 몽촌토성 움집터 구역 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): 움집터 윤곽 way 76425868(땅콩 모양 — 두 덩이로 갈라 덩이마다 움집 하나). 몽촌토성의 성벽은 지도에 윤곽이 없어 그리지 않는다(지어내지 않는다).
// 근사(출처 못 찾음 · 값마다 "근사"): 움집 수(윤곽의 두 덩이마다 하나) · 지름 8 m · 높이 4.2 m · 문 크기 · 가장자리 낮은 돌 둘레의 높이. 움집은 땅을 파고 짚·풀 지붕을 땅까지 내린 원뿔형(청동기·초기철기 움집을 복원한 모양)으로 지었다.
// 땅의 굽이(구릉): 성벽 · 구릉의 정확한 좌표는 못 맞췄다. 한성백제박물관 몽촌토성 항공사진 · 지형도 · 실측 평면도는 이용 조건이 저작물(수익 이용은 사전 협의 · 출처 명시)이라 본떠 그리지 않았다. 대신
// ① 출처로 확인한 것(위키백과 ko 몽촌토성): 둘레 약 2.7 km · 높이 6~7 m · 구릉과 구릉 사이 저지대에 움집터 · 비탈 소나무숲 ② 열린 지형 자료(AWS Terrain Tiles = Terrarium DEM, 원자료 약 30 m 격자, 이 격자로 움집터 둘레 방향별 평균 높이를 쟀다):
// 움집터는 둘레보다 낮은 오목한 자리이고 서 · 남서 · 남동 · 북서쪽 60~120 m 에서 5~7 m 올라가며 북 · 북동쪽은 낮아진다(약 4~8 m). 이 높낮이만 따라 큰 언덕 다섯과 작은 봉우리 다섯을 겹쳐 서쪽으로 감는 능선을 근사했다 — 모양 · 자리는 근사이고 실제 성벽선과 다르다.
// 언덕 자리는 둘레 지도 건물(OSM 방이동 건물 다섯)을 덮지 않게 비껴 잡았다. 높이 · 폭은 모두 근사.
// 못 그린 것: 기둥 · 지붕 짚 결 · 화덕 · 안의 구덩이 · 성벽 단면 · 해자 · 소나무숲.
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { MCN_AT, MCN_ORIGIN } from './monuments_data.mts';
import { MCN_PIT } from './monuments_mongchon_data.mts';
import { frameOf, local } from './monuments_hanok.mts';
import { loft } from './monument_curves.mts';
import { pointsOf, lowStone, groundOf, lawn } from './monuments_tomb_kit.mts';
import type { Hill } from './monuments_tomb_kit.mts';

const FRAME = frameOf(MCN_AT, MCN_ORIGIN), HUT_R = 4, HUT_H = 4.2;
// 큰 언덕(근사 — 기준점 둘레 미터, 동 +x · 남 +y): 서 · 북서 · 남서 · 남동 · 동쪽. 움집터는 비워 둔다
export const MCN_HILLS:Hill[] = [
  { x: -105, y: 0, r: 58, h: 6.5 }, { x: -85, y: -85, r: 56, h: 6 }, { x: -70, y: 85, r: 60, h: 6.5 }, { x: 95, y: 85, r: 58, h: 5.5 }, { x: 120, y: 0, r: 42, h: 3 },
  // 능선 위 작은 봉우리(굽이침)
  { x: -135, y: -45, r: 36, h: 5 }, { x: -125, y: 50, r: 32, h: 4.5 }, { x: -40, y: 125, r: 32, h: 4 }, { x: 60, y: 125, r: 28, h: 3.5 }, { x: -60, y: -125, r: 32, h: 4 },
];
function hut(w:MeshWriter, cx:number, cy:number):void {
  loft(w, 5, 20, (v, u):V3 => { const angle = Math.PI * 2 * u, radius = HUT_R * (1 - v) ** 1.1; return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, HUT_H * v] }, K.thatch);
  const door:V3[] = [[cx - .55, cy - HUT_R - .05, 0], [cx + .55, cy - HUT_R - .05, 0], [cx + .35, cy - HUT_R * (1 - 1.5 / HUT_H) - .05, 1.5], [cx - .35, cy - HUT_R * (1 - 1.5 / HUT_H) - .05, 1.5]];
  w.quad(door[0]!, door[1]!, door[2]!, door[3]!, K.tunnel, [0, -.7, .7]);
}
export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'mcn-land') { lawn(w, MCN_HILLS, groundOf(MCN_HILLS, [], [], [])); return new Float32Array(w.data) }
  if (id !== 'mcn-halls') return new Float32Array(w.data);
  lowStone(w, pointsOf(MCN_PIT.p, MCN_ORIGIN, FRAME));
  for (let i = 0; i < MCN_PIT.centers.length; i += 2) { const [cx, cy] = local(MCN_ORIGIN[0] + MCN_PIT.centers[i]! / 1e6, MCN_ORIGIN[1] + MCN_PIT.centers[i + 1]! / 1e6, FRAME); hut(w, cx, cy) }
  return new Float32Array(w.data);
}
