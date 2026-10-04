// The 심시티 고가's vertex format, shared by its builders (deck, piers, platforms in city_viaduct.mjs; the exit stairs
// in city_viaduct_exits.mjs). 20 floats a vertex: x y (local metres) h (m) · R · F (the frame across and along) ·
// px across, px along · ×lane, ×body (px across) · m across, m along (from the frame's point) · half size across, along
// (m, signed) · their px floors (signed) · material, shade · normal code (0 up, ±1 ±R, ±2 ±F, 3 down).
// The shader adds them up: p = (x,y) + R·(m across + size + px·unit + ×lane·lane + ×body·body) + F·(m along + size + px along)
// — so one vertex can hang off the platform's px-sized edge while another stands on a metre-fixed point.
export const STRIDE = 20;
// materials (the shader's u_col index; PARAPET and FASCIA take the line's colour)
export const MAT = { TOP: 0, SIDE: 1, UNDER: 2, PARAPET: 3, PIER: 4, BED: 5, RAIL: 6, FLOOR: 7, ROOF: 8, ROOF_UNDER: 9, POST: 10, FASCIA: 11, STAIR: 12, STAIR_WALL: 13, WALK: 14, WALK_WALL: 15 };
export const COLOR_KEYS = ['concrete', 'concrete', 'under', 'concrete', 'pier', 'bed', 'rail', 'platform', 'roof', 'roofUnder', 'post', 'concrete', 'stair', 'stairWall', 'walk', 'walkWall'];
export class Mesh {
  constructor(n) { this.d = new Float32Array(Math.max(STRIDE, n * STRIDE)); this.o = 0 }
  v(r, h, px, kl, kb, apx, lm, am, szl, sza, lp, ap, mat, shade, n) {
    if (this.o + STRIDE > this.d.length) { const g = new Float32Array(this.d.length * 2); g.set(this.d); this.d = g }
    const d = this.d, o = this.o; this.o += STRIDE;
    d[o] = r.x; d[o + 1] = r.y; d[o + 2] = h; d[o + 3] = r.rx; d[o + 4] = r.ry; d[o + 5] = r.fx; d[o + 6] = r.fy; d[o + 7] = px; d[o + 8] = apx; d[o + 9] = kl; d[o + 10] = kb;
    d[o + 11] = lm; d[o + 12] = am; d[o + 13] = szl; d[o + 14] = sza; d[o + 15] = lp; d[o + 16] = ap; d[o + 17] = mat; d[o + 18] = shade; d[o + 19] = n;
  }
  quad(a, b, c, d) { for (const q of [a, b, c, a, c, d]) this.v(...q) }
  data() { return this.d.subarray(0, this.o) }
}
export default { STRIDE, MAT, COLOR_KEYS, Mesh };
