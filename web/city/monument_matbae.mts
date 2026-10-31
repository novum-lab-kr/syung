// 맞배지붕: 마루가 긴 쪽(x)으로 하나 서고, 앞 · 뒤 두 면이 처마로 내려오며, 양 끝은 지붕 끝이 수직으로 선 박공(합각 없음 · 우진각 아님).
// 종묘 정전 · 영녕전 · 공신당 · 문(출처: 위키백과 ko 종묘 — 정문 "측면 2칸 맞배" · 정전 · 영녕전 "맞배지붕")이 쓴다. 기존 한옥 지붕(buildRoof — 우진각 · 팔작)에는 맞배가 없어 따로 둔다.
// monument_parts.mts 만 import 한다(구역 자료 · 경복궁 자료 import 금지 — 구역 모듈이 따로 불러도 서로 딸려 오지 않게).
// 근사(출처 못 찾음): 박공 밖으로 내민 길이 · 지붕 단면 곡선(처마 쪽이 눕고 마루 쪽이 선다) · 처마 두께 · 박공널 두께.
import { K } from './monument_parts.mts';
import type { MeshWriter, V3 } from './monument_parts.mts';

export interface Matbae {
  hx:number; hy:number;   // 박공 벽 · 앞뒤 처마 기둥 바깥선(몸 반 길이 · 반 폭 + 띠)
  eave:number;            // 처마 내밀기(앞뒤)
  z0:number;              // 처마 끝 높이
  rise:number;            // 처마 끝 → 마루 높이
  over?:number;           // 박공 끝이 박공 벽 밖으로 내미는 길이(근사)
  steps?:number;          // 단면 나눔 수
}

export function matbaeRoof(w:MeshWriter, R:Matbae):void {
  const over = R.over ?? .9, steps = R.steps ?? 8, outer = R.hy + R.eave, wallX = R.hx, endX = R.hx + over, thick = .25, zTop = R.z0 + R.rise;
  // 단면: t 0 = 처마 끝 · 1 = 마루. 처마 쪽이 눕고(기울기 0 에서 시작) 위로 갈수록 선다 — 한옥 지붕의 휘어진 단면(근사)
  const sectionY = (side:number, t:number) => side * outer * (1 - t);
  const sectionZ = (t:number) => R.z0 + R.rise * t ** 1.5;
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps, y0 = sectionY(side, t0), y1 = sectionY(side, t1), z0 = sectionZ(t0), z1 = sectionZ(t1);
      const slope = (z1 - z0) / Math.abs(y1 - y0);
      w.quad([-endX, y0, z0], [endX, y0, z0], [endX, y1, z1], [-endX, y1, z1], K.giwa, [0, side * slope, 1], -endX, endX, endX, -endX);   // 기와 면(기와골은 x 방향 미터)
    }
    w.quad([-endX, side * outer, R.z0 - thick], [endX, side * outer, R.z0 - thick], [endX, side * outer, R.z0], [-endX, side * outer, R.z0], K.fascia, [0, side, 0], -endX, endX, endX, -endX);   // 처마 끝 막새띠
    w.quad([-endX, side * outer, R.z0 - thick], [endX, side * outer, R.z0 - thick], [endX, side * (R.hy), R.z0 - thick], [-endX, side * (R.hy), R.z0 - thick], K.soffit, [0, 0, -1]);   // 처마 밑(서까래 면)
  }
  // 박공: 양 끝에 지붕 단면 모양 그대로 수직으로 선 벽. 벽 면은 박공 벽(몸 끝)에 서고 지붕 끝(박공널)은 그 밖으로 내민다
  for (const end of [-1, 1]) {
    const wx = end * wallX, ex = end * endX;
    for (const side of [-1, 1]) {
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const a:V3 = [wx, sectionY(side, t0), R.z0 - thick], b:V3 = [wx, sectionY(side, t1), R.z0 - thick], c:V3 = [wx, sectionY(side, t1), sectionZ(t1) - .05], d:V3 = [wx, sectionY(side, t0), sectionZ(t0) - .05];
        w.quad(a, b, c, d, K.plaster, [end, 0, 0]);   // 박공 벽(수직)
        const e:V3 = [ex, sectionY(side, t0), sectionZ(t0) - .38], f:V3 = [ex, sectionY(side, t1), sectionZ(t1) - .38], g:V3 = [ex, sectionY(side, t1), sectionZ(t1)], h:V3 = [ex, sectionY(side, t0), sectionZ(t0)];
        w.quad(e, f, g, h, K.timber, [end, 0, 0]);   // 박공널(지붕 끝 널 — 단면을 따라 수직 띠)
      }
    }
  }
  w.box(-endX - .1, endX + .1, -.42, .42, zTop - .12, zTop + .55, K.ridge, { bottom: true });   // 용마루(양성바름)
}
