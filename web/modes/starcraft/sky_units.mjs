// 스타크래프트 하늘: 원작 비행 유닛이 가끔 도시 하늘을 가로질러 날아간다(행님 계획 4단계, 2026-10-22).
// 모드 설정 sky {units: [모양…], everyS, maxN, altM, sizeM}: 평균 everyS 초마다 하나씩, 동시에 많아야 maxN, 높이 altM(m), 몸 폭 sizeM(m — 화면에서 너무 작으면 키운다).
// 화면 밖 한쪽에서 나타나 화면을 비스듬히 지나 반대쪽 밖으로 사라진다. 그리기는 지하철 수송선과 같은 렌더러(convoy.mjs UnitConvoy, 모양은 unit_shapes.mjs).
//   const s=new SkyUnits(); s.frame(gl, M, ox, oy, {sky, now, view:[x0,y0,x1,y1](메르카토르), mpm, unit, dark}) → 날고 있는 수; s.dispose(gl)
import { UnitConvoy } from './convoy.mjs';
import { UNIT_SHAPES } from './units.mjs';

export const SKY_MIN_PX = 26;   // 몸 폭이 화면에서 이보다 작으면 키운다(멀리서도 알아보게)
export class SkyUnits {
  constructor({ random = Math.random } = {}) { this.flights = []; this.next = 0; this.seq = 0; this.random = random; this.r = new UnitConvoy() }
  // 새 비행: 화면 둘레 원 밖의 한 점에서, 화면 가운데 근처를 지나 반대편 밖까지(메르카토르)
  spawn(now, sky, view, mpm) {
    const keys = (sky.units || []).filter(k => UNIT_SHAPES[k]); if (!keys.length) return;
    const R = this.random, cx = (view[0] + view[2]) / 2, cy = (view[1] + view[3]) / 2, rad = Math.hypot(view[2] - view[0], view[3] - view[1]) * .75;
    const a = R() * 2 * Math.PI, sx = cx + Math.cos(a) * rad, sy = cy + Math.sin(a) * rad;
    const tx = cx + (R() - .5) * rad * .6, ty = cy + (R() - .5) * rad * .6, dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
    const speed = (sky.speedMps ?? 45) * (.75 + R() * .5) * mpm, len = rad * 2.2;   // 메르카토르 / 초
    this.flights.push({ key: keys[Math.floor(R() * keys.length)], x: sx, y: sy, fx: dx / d, fy: dy / d, v: speed, t0: now, dur: len / speed, alt: (sky.altM ?? 90) * (.8 + R() * .5), id: ++this.seq });
  }
  frame(gl, M, ox, oy, { sky, now, view, mpm, unit, dark = false }) {
    const t = now / 1000;
    this.flights = this.flights.filter(f => t - f.t0 < f.dur && sky.units.includes(f.key));   // (종족을 바꾸면 그 종족 유닛만 남는다)
    if (!this.next) this.next = t + (sky.firstS ?? 3);
    if (t >= this.next) { if (this.flights.length < (sky.maxN ?? 3)) this.spawn(t, sky, view, mpm); this.next = t + (sky.everyS ?? 12) * (.5 + this.random()) }
    if (!this.flights.length) { SkyUnits.last = { n: 0, at: [] }; return 0 }
    this.r.init(gl); this.r.begin(ox, oy);
    for (const f of this.flights) {
      const s = (t - f.t0) * f.v, x = f.x + f.fx * s, y = f.y + f.fy * s, shape = UNIT_SHAPES[f.key];
      const W = Math.max((sky.sizeM ?? 28) * mpm / unit, SKY_MIN_PX), L = W * shape.len;
      // 틀: 몸 가운데가 (x, y)에 오게 뒤쪽 끝에서 시작(F 앞 · R 옆 · U 위), 높이 alt
      const ox2 = x - f.fx * L / 2 * unit, oy2 = y - f.fy * L / 2 * unit;
      this.r.unit([ox2, oy2, f.alt * mpm, f.fx, f.fy, 0, -f.fy, f.fx, 0, 0, 0, 1], L, W, f.key, [.5, .5, .5], true, 'sky' + f.id);
    }
    const keep = UnitConvoy.last; this.r.draw(gl, M, ox, oy, { unit, dark, time: t }); UnitConvoy.last = keep;   // (UnitConvoy.last 는 지하철 수송선의 것 — 캡처가 읽는다)
    SkyUnits.last = { n: this.flights.length, at: this.flights.map(f => [f.key, f.x + f.fx * (t - f.t0) * f.v, f.y + f.fy * (t - f.t0) * f.v]) };
    return this.flights.length;
  }
  dispose(gl) { this.r.dispose(gl); this.flights = []; this.next = 0; SkyUnits.last = null }
}
SkyUnits.last = null;   // 캡처 스크립트가 읽는다(날고 있는 수 · 자리)
export default SkyUnits;
