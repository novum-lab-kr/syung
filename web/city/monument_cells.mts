// 문화유산 구역을 공간 칸(약 150 m)으로 나눈다: 건물 메시 · 나무 · 횃불이 칸마다 따로 그려져, 폰에서 도시 건물처럼 칸마다 거리 줄이기(cityFarFade)를 받는다.
// 궁 전체에 한 번만 걸면 가까운 한 모서리 때문에 먼 나무까지 모두 남는다(폰 줌 15 에서 1332그루 · 프레임당 약 161만 정점 — Codex 지적).
export const CELL_M = 150;
export type Rect4 = [number, number, number, number];   // 지역 미터 [x0, x1, y0, y1]
const cellOf = (x:number, y:number) => `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)}`;
export interface Cell<T> { rect:Rect4; items:T }

// 점 목록(0.1 m 정수 짝 · 기준점에서 동 · 북)을 칸으로 나눈다. lists: 종류별(수종 · 한 종류) 목록. at: 기준점(지역 미터)
export function splitPoints(at:[number, number], lists:readonly (readonly number[])[]):Cell<number[][]>[] {
  const cells = new Map<string, Cell<number[][]>>();
  lists.forEach((points, kind) => {
    for (let i = 0; i < points.length; i += 2) {
      const wx = at[0] + points[i]! / 10, wy = at[1] - points[i + 1]! / 10, key = cellOf(wx, wy);
      let cell = cells.get(key); if (!cell) { cell = { rect: [Infinity, -Infinity, Infinity, -Infinity], items: lists.map(() => []) }; cells.set(key, cell) }
      cell.items[kind]!.push(points[i]!, points[i + 1]!);
      const r = cell.rect; r[0] = Math.min(r[0], wx - 3); r[1] = Math.max(r[1], wx + 3); r[2] = Math.min(r[2], wy - 3); r[3] = Math.max(r[3], wy + 3);
    }
  });
  return [...cells.values()];
}

// 메시(삼각형 3개 단위 = stride 3개)를 칸으로 나눈다. world: 정점 i 의 지역 미터 (x, y)
export function splitTriangles(data:Float32Array, stride:number, world:(index:number) => [number, number]):Cell<Float32Array>[] {
  const groups = new Map<string, { floats:number[]; rect:Rect4 }>();
  for (let i = 0; i < data.length; i += stride * 3) {
    const a = world(i), b = world(i + stride), c = world(i + stride * 2), key = cellOf((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3);
    let group = groups.get(key); if (!group) { group = { floats: [], rect: [Infinity, -Infinity, Infinity, -Infinity] }; groups.set(key, group) }
    for (let k = 0; k < stride * 3; k++) group.floats.push(data[i + k]!);
    for (const [x, y] of [a, b, c]) { const r = group.rect; r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); r[2] = Math.min(r[2], y); r[3] = Math.max(r[3], y) }
  }
  return [...groups.values()].map(group => ({ rect: group.rect, items: new Float32Array(group.floats) }));
}

// 칸(사각 · 높이 zTop m)이 화면 밖이면 거짓 — 여덟 모서리가 모두 같은 쪽(왼 · 오 · 위 · 아래)으로 벗어나거나 모두 카메라 뒤면 그리지 않는다.
// 보이는 것은 그대로고(밖은 어차피 잘린다) 정점 처리와 그리기 호출만 덜어 준다. 깊이(z) 쪽은 보지 않는다(보수적으로 남김).
// MT: 도시 그리기 행렬(지역 미터 → 클립) · mu: 미터 → 지도 단위 배율(셰이더 u_mu)
export function cellInView(MT:ArrayLike<number>, mu:number, rect:Rect4, zTop:number):boolean {
  let outside = 63, behind = true;
  for (let corner = 0; corner < 8; corner++) {
    const x = (corner & 1 ? rect[1] : rect[0]) * mu, y = (corner & 2 ? rect[3] : rect[2]) * mu, z = (corner & 4 ? zTop : 0) * mu;
    const cx = MT[0]! * x + MT[4]! * y + MT[8]! * z + MT[12]!, cy = MT[1]! * x + MT[5]! * y + MT[9]! * z + MT[13]!, cw = MT[3]! * x + MT[7]! * y + MT[11]! * z + MT[15]!;
    if (cw > 0) behind = false;
    outside &= (cx < -cw ? 1 : 0) | (cx > cw ? 2 : 0) | (cy < -cw ? 4 : 0) | (cy > cw ? 8 : 0);
    if (!outside && !behind) return true;
  }
  return !(behind || outside);
}
