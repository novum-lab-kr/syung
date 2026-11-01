// 풍납토성(한성 백제 토성) 성벽 구역 모델. monuments.mts 가 이 구역에 닿을 때만 import() 로 부른다.
// 모드 · 테마 입력 없음 — 어느 모드에서나 같은 모델 · 같은 실물 색.
// 자리는 OSM(© OpenStreetMap contributors): historic=citywalls name=풍납토성 선 여섯 도막(지금 남아 있는 구간만 — 이 도막 사이는 성벽이 없다).
// 출처로 확인한 것(위키백과 ko 풍납동 토성): 한강 변 평지에 흙을 다져 쌓은 토성으로, 성벽 중심부는 아래가 넓고 위가 좁은 사다리꼴 단면(위 폭 약 7 m · 높이 약 5 m)이며 바깥을 비탈로 덧대어 키웠다.
// 근사(출처 못 찾음 · 값마다 "근사"): 남은 성벽의 밑 반폭 17 m · 마루 반폭 3.5 m · 높이 8 m(RAMPART — 자료마다 달라 한 값으로 정했다) · 도막 끝이 땅으로 잦아드는 길이(25 m) · 풀 빛.
// 못 그린 것: 성벽 안팎 흙 층 · 목책 · 문터 · 성벽을 가로지르는 길 · 옛 한강 쪽 끊어진 부분.
import { MeshWriter, K } from './monument_parts.mts';
import type { V3 } from './monument_parts.mts';
import { PNP_AT, PNP_ORIGIN } from './monuments_data.mts';
import { PNP_LINES } from './monuments_pungnap_data.mts';
import { frameOf, clamp } from './monuments_hanok.mts';
import { pointsOf } from './monuments_tomb_kit.mts';
import type { P2 } from './monuments_tomb_kit.mts';

const FRAME = frameOf(PNP_AT, PNP_ORIGIN);
export const RAMPART = { halfBase: 17, halfCrest: 3.5, height: 8 }, TAPER = 25;   // monuments_data.mts 의 숨김 띠 폭과 같은 값(근사)
// 능선 선 하나를 따라 사다리꼴 단면을 쓸어 만든다. 양 끝은 TAPER 길이만큼 땅으로 잦아든다
export const STEP = 15;   // 단면 사이 최대 간격(근사) — 점이 둘뿐인 긴 도막도 가운데 단면이 생겨 끝 잦아듦(TAPER)에만 갇힌다
export function resample(line:P2[]):P2[] {
  const out:P2[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!, [bx, by] = line[i]!, parts = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP));
    for (let k = 1; k <= parts; k++) out.push([ax + (bx - ax) * k / parts, ay + (by - ay) * k / parts]);
  }
  return out;
}
export function rampart(w:MeshWriter, source:P2[]):void {
  const line = resample(source);
  const dist = [0]; for (let i = 1; i < line.length; i++) dist.push(dist[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
  const total = dist[dist.length - 1]!, cross:V3[][] = [];
  const segNormal = (i:number):P2 => { const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay) || 1; return [-(by - ay) / len, (bx - ax) / len] };
  for (let i = 0; i < line.length; i++) {
    const before = i > 0 ? segNormal(i - 1) : segNormal(0), after = i < line.length - 1 ? segNormal(i) : segNormal(line.length - 2);
    const mx = before[0] + after[0], my = before[1] + after[1], mlen = Math.hypot(mx, my) || 1, nx = mx / mlen, ny = my / mlen, miter = Math.min(2, 1 / Math.max(.5, nx * after[0] + ny * after[1]));
    const edge = clamp(Math.min(dist[i]!, total - dist[i]!) / TAPER, 0, 1), f = edge * edge * (3 - 2 * edge), [px, py] = line[i]!;
    const at = (offset:number, z:number):V3 => [px + nx * offset * miter * f, py + ny * offset * miter * f, z * f];
    cross.push([at(-RAMPART.halfBase, 0), at(-RAMPART.halfCrest, RAMPART.height), at(RAMPART.halfCrest, RAMPART.height), at(RAMPART.halfBase, 0)]);
  }
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!, len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
    const hints:V3[] = [[-nx * .6, -ny * .6, .8], [0, 0, 1], [nx * .6, ny * .6, .8]];
    for (let band = 0; band < 3; band++) w.quad(cross[i]![band]!, cross[i + 1]![band]!, cross[i + 1]![band + 1]!, cross[i]![band + 1]!, K.grass, hints[band]!);
  }
}
export function buildMonument(id:string):Float32Array {
  const w = new MeshWriter();
  if (id === 'pnp-wall') for (const flat of PNP_LINES) rampart(w, pointsOf(flat, PNP_ORIGIN, FRAME));
  return new Float32Array(w.data);
}
