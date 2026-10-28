// 롤코 밤 축제 전구 — 건물 지붕 테두리에 꼬마전구 줄, 높은 탑 몇 동은 모서리 세로 줄 (2026-10-11 행님: "다크 모드일 때 반짝반짝
// 조명들을 건물에 좀 달아 줘, 축제 분위기 나게"). 시안 A(지붕 테두리 전구, Codex 추천 · 수치)로.
//
// 지도가 이미 받은 z14 건물 타일(ofm)만 읽는다 — 따로 받지 않는다. 타일마다 한 번 전구 자리를 지어 정적 버퍼로 두고,
// 줌에 따라 건물 단위(rank)로 솎고 줄 안에서 몇 개 건너뛰는 것은 셰이더가 한다(움직일 때 다시 짓지 않는다).
// 고르는 규칙: 20 m 이상 건물(다각형 하나) 가운데 자리 해시로 30 %(같은 건물은 늘 같은 색 · 같은 선택 — OFM 타일은 같은 높이
// 건물을 한 feature 로 묶어 두므로 id 가 아니라 다각형 bbox 가운데 자리로), 80 m 이상 탑 가운데 15 %는
// 두 모서리에 세로 줄. 색은 건물마다 하나 — 크림 45 · 분홍 30 · 라일락 25 %(브랜드 노랑 없음; 크림만이면 창 불빛과 안 갈려 분홍 · 라일락을 진하게).
// 움직임은 전구 셋에 하나가 4~8 s 에 밝기 ±40 %(부드러운 사인, 번쩍임 없음), 줄인 움직임이면 고정. 블룸은 공통 밤 빛(다른 창)이 맡아 코어 위주.
//
//   const f=new FestoonLayer(); f.init(gl); f.update(map); f.pump(map,repaint); f.render(gl,matrix,{zoom,phone,reducedMotion,bounds,pixelRatio,now}); f.dispose(gl);

import { decodeTile } from '../../city/mvt.mts';
import { classifyRings } from '../../city/geom.mts';
import { LANDMARKS, landmarkMerc } from '../../city/landmarks_data.mts';
import { BULB_FS, compile, lightsOn, lightsOff, bulbSize, hexRGB, ORIGIN } from './night.mts';
import type { Layer } from '../../city/mvt.mts';
import type { NightRenderOptions } from './night.mts';

const EARTH = 40075016.685578488, TILE_Z = 14;
export const FESTOON = Object.freeze({
  minH: 20, share: .30,              // 지붕 전구: 이 높이 이상 건물 가운데 이 몫
  towerH: 80, towerShare: .15,       // 세로 줄: 이 높이 이상 탑 가운데 이 몫, 두 모서리
  roofM: 6, vertM: 8,                // 전구 간격(m)
  roofMax: 64, vertMax: 32,          // 한 동 · 한 줄 상한(넘으면 간격을 넓힌다)
  aboveM: .8,                        // 지붕 위로(난간 위)
  minPx: 5,                          // 화면에서 전구 사이 최소 간격(px): 멀면 줄 안에서 건너뛴다
  palette: ['#FFE6B8', '#FF9FC8', '#C7A6FF'], weights: [.45, .3, .25],
  zoomOn: 14, zoomKeep: [[14, 1 / 3], [15, 2 / 3], [16, 1]] as [number, number][],   // 줌별로 켤 건물 몫(그 사이는 서서히)
  vertZoom: 16,                      // 세로 줄은 이 줌부터
  cap: { phone: 1600, desk: 3200 },  // 화면에 그리는 전구 수 상한(넘으면 건물 몫을 줄인다), 세로 줄은 그 가운데 vertShare 까지
  vertShare: .3,
  twinkleShare: .33, twinkleAmp: .4, twinkleS: [4, 8],   // (Codex 캡처 검토: 1/5 · ±30 % → 1/3 · ±40 %)
  bright: 1, wt: [1, .28], scale: 1.15,   // 코어 · 번짐 세기(번짐은 블룸이 더한다), 크기(선로 전구 대비)
  cacheTiles: 18,                    // 지은 타일 보관 수(휴대폰 메모리: 도시 건물 캐시와 같은 수)
});

const mercX = (lon:number) => lon / 360 + .5;
const mercY = (lat:number) => .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const O = { x: mercX(ORIGIN[0]), y: mercY(ORIGIN[1]) };
// 32-bit 해시(0..1): 건물 id 와 용도별 소금
const hash01 = (id:number, salt:number) => { let h = (Math.imul((id >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296 };
const pick = (u:number, w:readonly number[]) => { let a = 0; for (let i = 0; i < w.length; i++) { a += w[i]!; if (u < a) return i } return w.length - 1 };

// 줌별로 켤 건물 몫: zoomKeep 사이를 곧게
// 전구 설정 모양(FESTOON 그대로)
export type Festoon = typeof FESTOON;
// 타일 하나의 전구(festoonBulbs): 줄마다 [rank, 전구 수]
export interface FestoonBulbs { data:Float32Array; roofs:[number, number][]; verts:[number, number][] }
// 지은 타일: 전구 수 · 마지막으로 본 때 · 상자 · GPU 버퍼
interface FestoonTile { n:number; seen:number; box:[number, number, number, number] | null; roofs:[number, number][]; verts:[number, number][]; d:string; b?:WebGLBuffer; va?:WebGLVertexArrayObject }
interface FestoonQueued { k:string; x:number; y:number; raw:ArrayBuffer; d:number }
// 지도에서 이미 받은 타일 찾기(maplibre 6.11 의 비공개 tileManagers)
interface FestoonMap {
  style?:{ tileManagers?:Record<string, { getRenderableIds?():string[]; getTileByID(id:string):{ tileID?:{ canonical?:{ x:number; y:number; z:number } }; latestFeatureIndex?:{ rawTileData?:ArrayBuffer } } | undefined } | undefined> };
  getCenter():{ lng:number; lat:number }; isMoving():boolean;
}
type FestoonUniform = 'u_matrix' | 'u_size' | 'u_core' | 'u_keep' | 'u_vert' | 'u_stride' | 'u_time' | 'u_anim' | 'u_bright' | 'u_pal' | 'u_wt';
export function keepAt(zoom:number, F:Festoon = FESTOON) {
  const k = F.zoomKeep; if (zoom < F.zoomOn) return 0; if (zoom <= k[0]![0]) return k[0]![1];
  for (let i = 1; i < k.length; i++) if (zoom <= k[i]![0]) return k[i - 1]![1] + (k[i]![1] - k[i - 1]![1]) * (zoom - k[i - 1]![0]) / (k[i]![0] - k[i - 1]![0]);
  return k[k.length - 1]![1];
}

// 타일 하나의 전구: [x, y, z(메르카토르, ORIGIN 뺌), rank, 줄 안 차례, 색 + 4 × 세로, 반짝임 해시] × n
// layer: decodeTile 의 building 층. 건물 높이 · 숨김 · 랜드마크 자리 빼기는 도시 건물(city/mesh)과 같은 규칙.
export function festoonBulbs(layer:Layer | undefined, { x, y, z = TILE_Z }:{ x:number; y:number; z?:number }, F:Festoon = FESTOON):FestoonBulbs {
  const out:number[] = [], roofs:[number, number][] = [], verts:[number, number][] = [];   // roofs · verts: 줄마다 [rank, 전구 수] — 화면 상한 계산용
  if (!layer) return { data: new Float32Array(0), roofs, verts };
  const n = 2 ** z, E = layer.extent, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + .5) / n))), mu = 1 / (EARTH * Math.cos(lat));
  // 랜드마크 자리(타일 단위): 도시 메시(city/mesh landmarkPart)와 같은 판정 — feature 외곽 전체 bbox 가운데가 반경 안, 크기 2.5 r 미만, 높이 minH 이상
  const marks = LANDMARKS.map(L => { const [mx, my] = landmarkMerc(L); return { x: (mx * n - x) * E, y: (my * n - y) * E, r: L.hide.radiusM * mu * n * E, minH: L.hide.minH } });
  const wx = (v:number) => (v / E + x) / n, wy = (v:number) => (v / E + y) / n, inTile = (u:number, v:number) => u >= 0 && u < E && v >= 0 && v < E;   // 타일 버퍼(이웃 타일 몫)의 전구는 그 타일이 단다
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i), p = f.properties || {};
    if (p.hide_3d === true || p.hide_3d === 'true') continue;
    const H = +(p.render_height as number); if (!(H >= F.minH)) continue;
    let flat:number[][]; try { flat = f.loadGeometry().map(r => r.flatMap(q => [q.x, q.y])) } catch { continue }
    {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const a of flat) for (let k = 0; k < a.length; k += 2) { x0 = Math.min(x0, a[k]!); x1 = Math.max(x1, a[k]!); y0 = Math.min(y0, a[k + 1]!); y1 = Math.max(y1, a[k + 1]!) }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (marks.some(m => H >= m.minH && Math.hypot(cx - m.x, cy - m.y) < m.r && Math.max(x1 - x0, y1 - y0) < 2.5 * m.r)) continue;   // 전용 모델이 그린다
    }
    const base = Math.max(0, +(p.render_min_height as number) || 0), zTop = (H + F.aboveM) * mu;
    for (const poly of classifyRings(flat)) {
      const ring = poly.outer, m = ring.length / 2;
      if (m < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < ring.length; k += 2) { x0 = Math.min(x0, ring[k]!); x1 = Math.max(x1, ring[k]!); y0 = Math.min(y0, ring[k + 1]!); y1 = Math.max(y1, ring[k + 1]!) }
      // 건물 열쇠: bbox 가운데의 세계 자리(약 1 m 격자) — 차례 · id 와 무관
      const key = (Math.round(wx((x0 + x1) / 2) * 2 ** 25) ^ Math.imul(Math.round(wy((y0 + y1) / 2) * 2 ** 25), 0x27d4eb2d)) >>> 0;
      const rank = hash01(key, 1), tower = H >= F.towerH && hash01(key, 2) < F.towerShare, roof = rank < F.share;
      if (!roof && !tower) continue;
      const col = pick(hash01(key, 3), F.weights);
      let per = 0; for (let k = 0; k < m; k++) { const b = (k + 1) % m; per += Math.hypot(ring[2 * b]! - ring[2 * k]!, ring[2 * b + 1]! - ring[2 * k + 1]!) }
      const perM = per / (n * E) / mu; if (perM < 8) continue;
      if (roof) {
        const r = rank / F.share, cnt = Math.min(F.roofMax, Math.max(4, Math.round(perM / F.roofM))), step = per / cnt;
        let s = 0, idx = 0, next = 0, kept = 0;
        for (let k = 0; k < m && idx < cnt; k++) {
          const ax = ring[2 * k]!, ay = ring[2 * k + 1]!, b = (k + 1) % m, bx = ring[2 * b]!, by = ring[2 * b + 1]!, L = Math.hypot(bx - ax, by - ay);
          while (next <= s + L && idx < cnt) {
            const u = L ? (next - s) / L : 0, px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
            if (inTile(px, py)) { out.push(wx(px) - O.x, wy(py) - O.y, zTop, r, idx, col, hash01(key + idx * 7919, 4)); kept++ }
            idx++; next += step;
          }
          s += L;
        }
        if (kept) roofs.push([r, kept]);
      }
      if (tower) {
        // 두 모서리: 가운데서 가장 먼 꼭짓점과, 그 점에서 가장 먼 꼭짓점(카메라 · 차례와 무관)
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        let a = 0, best = -1; for (let k = 0; k < m; k++) { const d = Math.hypot(ring[2 * k]! - cx, ring[2 * k + 1]! - cy); if (d > best) { best = d; a = k } }
        let b = a; best = -1; for (let k = 0; k < m; k++) { const d = Math.hypot(ring[2 * k]! - ring[2 * a]!, ring[2 * k + 1]! - ring[2 * a + 1]!); if (d > best) { best = d; b = k } }
        const cnt = Math.min(F.vertMax, Math.max(2, Math.floor((H - base) / F.vertM))), rv = hash01(key, 2) / F.towerShare;
        for (const k of a === b ? [a] : [a, b]) {
          if (!inTile(ring[2 * k]!, ring[2 * k + 1]!)) continue;
          for (let j = 1; j <= cnt; j++) out.push(wx(ring[2 * k]!) - O.x, wy(ring[2 * k + 1]!) - O.y, (base + (H - base) * j / cnt) * mu, rv, cnt - j, col + 4, hash01(key + k * 31 + j * 7919, 5));
          verts.push([rv, cnt]);
        }
      }
    }
  }
  return { data: new Float32Array(out), roofs, verts };
}

// 켤 몫 k(지붕) · kv(세로) 와 줄 안 건너뛰기 stride 에서 실제로 남는 전구 수: 줄마다 0번부터 stride 마다 하나 → ceil(n / stride)
export function survivors(T:{ roofs:[number, number][]; verts:[number, number][] }, k:number, kv:number, stride:number, part = 'all') {
  let c = 0;
  if (part !== 'vert') for (const [r, n] of T.roofs) if (r < k) c += Math.ceil(n / stride);
  if (part !== 'roof' && kv > 0) for (const [r, n] of T.verts) if (r < kv) c += Math.ceil(n / stride);
  return c;
}

const f = (v:unknown) => Number(v).toFixed(4);   // GLSL 실수 글자(정수 글자는 float 와 곱할 수 없다)
const VS = `#version 300 es
layout(location=0) in vec3 a_p;    // 메르카토르(ORIGIN 뺌), z 도 메르카토르 단위
layout(location=1) in vec4 a_d;    // rank(0..1, 작을수록 먼저 켠다), 줄 안 차례, 색 + 4 × 세로, 반짝임 해시
uniform mat4 u_matrix; uniform float u_size, u_core, u_keep, u_vert, u_stride, u_time, u_anim, u_bright;
uniform vec3 u_pal[3];
out vec3 v_rgb; out vec2 v_mix;
void main(){
  float vert = step(3.5, a_d.z), keep = mix(u_keep, u_vert, vert);
  float fade = 1. - smoothstep(keep - .06, keep, a_d.x);   // 몫이 바뀌는 자리에서 서서히
  if (fade <= .01 || mod(a_d.y, u_stride) >= .5) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  gl_Position = u_matrix * vec4(a_p, 1.);
  gl_Position.z -= 2e-4 * gl_Position.w;   // 지붕 · 모서리 벽보다 한 터럭 앞
  gl_PointSize = u_size;
  float h = a_d.w, tw = 1.;
  if (u_anim > .5 && h < ${f(FESTOON.twinkleShare)}) tw = 1. + ${f(FESTOON.twinkleAmp)} * sin(6.283185 * (u_time / (${f(FESTOON.twinkleS[0])} + h * ${f((FESTOON.twinkleS[1]! - FESTOON.twinkleS[0]!) / FESTOON.twinkleShare)}) + h * 61.));
  v_rgb = u_pal[int(mod(a_d.z, 4.))];
  v_mix = vec2(u_core, u_bright * fade * tw);
}`;

export class FestoonLayer {
  // 필드는 선언만(declare — 실행 코드 없음, 값은 지금처럼 constructor · init · update · render 가 넣는다)
  declare F:Festoon; declare tiles:Map<string, FestoonTile>; declare want:Set<string>; declare M:Float32Array; declare queue:FestoonQueued[];
  declare stats:{ tiles:number; bulbs:number; drawn:number; keep:number; ms:number; keepCapped?:number; vert?:number };
  declare p:WebGLProgram | null; declare broken:boolean; declare u:Record<FestoonUniform, WebGLUniformLocation | null>; declare pal:Float32Array; declare gl:WebGL2RenderingContext | null;
  declare looked:number; declare idle:number; declare capMemo:{ k:string; keep:number; vert:number; drawn:number } | undefined;
  constructor(F:Festoon = FESTOON) { this.F = F; this.tiles = new Map(); this.want = new Set(); this.M = new Float32Array(16); this.stats = { tiles: 0, bulbs: 0, drawn: 0, keep: 0, ms: 0 }; this.queue = [] }

  init(gl:WebGL2RenderingContext) {
    if (this.p || this.broken) return;
    try { this.p = compile(gl, VS, BULB_FS) } catch (e) { this.broken = true; console.error('coaster festoon: off —', e); return }   // 깨지면 이 층만 끈다(열차 · 밤 층은 그대로)
    this.u = Object.fromEntries((['u_matrix', 'u_size', 'u_core', 'u_keep', 'u_vert', 'u_stride', 'u_time', 'u_anim', 'u_bright', 'u_pal', 'u_wt'] as const).map(n => [n, gl.getUniformLocation(this.p!, n)])) as Record<FestoonUniform, WebGLUniformLocation | null>;
    this.pal = new Float32Array(this.F.palette.flatMap(hexRGB));
    this.gl = gl;
  }

  // 지도가 그릴 수 있는 z14 건물 타일 가운데 화면 가운데에서 가까운 cacheTiles 장: 새 것은 가까운 차례로 줄 세우고, 나머지는 버릴 수 있게.
  // 타일 목록은 300 ms 에 한 번만 본다(매 프레임 아님)
  update(map:FestoonMap) {
    if (!this.p) return;
    const now = performance.now(); if (now - (this.looked || 0) < 300) return; this.looked = now;
    const man = map.style?.tileManagers?.ofm; if (!man) return;
    const c = map.getCenter(), n = 2 ** TILE_Z, cx = (c.lng + 180) / 360 * n, cy = (1 - Math.log(Math.tan(Math.PI / 4 + c.lat * Math.PI / 360)) / Math.PI) / 2 * n, all:FestoonQueued[] = [];
    for (const id of man.getRenderableIds?.() || []) {
      const t = man.getTileByID(id), q = t?.tileID?.canonical;
      if (!q || q.z !== TILE_Z || !t!.latestFeatureIndex?.rawTileData) continue;
      all.push({ k: `${q.x}/${q.y}`, x: q.x, y: q.y, raw: t!.latestFeatureIndex.rawTileData, d: Math.hypot(q.x + .5 - cx, q.y + .5 - cy) });
    }
    all.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
    const near = all.slice(0, this.F.cacheTiles); this.want = new Set(near.map(w => w.k));
    for (const w of near) { const T = this.tiles.get(w.k); if (T) T.seen = now }
    this.queue = near.filter(w => !this.tiles.has(w.k));
  }
  // 줄의 맨 앞 타일 하나를 짓는다(움직이는 동안은 부르지 않는다): 지었으면 true
  buildOne() {
    const q = this.queue.shift(); if (!q || !this.gl) return false;
    if (this.tiles.size >= this.F.cacheTiles && !this.evict(1)) { this.queue.unshift(q); return false }   // 자리가 없으면(보이는 것만 꽉 참) 안 짓는다
    const t0 = performance.now(), gl = this.gl;
    let B:FestoonBulbs;
    try { B = festoonBulbs(decodeTile(q.raw, new Set(['building'])).building, { x: q.x, y: q.y }, this.F) }
    catch (e) { console.error('coaster festoon: tile', q.k, e); B = { data: new Float32Array(0), roofs: [], verts: [] } }
    const data = B.data, T:FestoonTile = { n: data.length / 7, seen: performance.now(), box: null, roofs: B.roofs, verts: B.verts, d: q.k };
    if (T.n) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < data.length; i += 7) { x0 = Math.min(x0, data[i]!); x1 = Math.max(x1, data[i]!); y0 = Math.min(y0, data[i + 1]!); y1 = Math.max(y1, data[i + 1]!) }
      T.box = [x0 + O.x, y0 + O.y, x1 + O.x, y1 + O.y];
      T.b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, T.b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      T.va = gl.createVertexArray(); gl.bindVertexArray(T.va);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
      gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    this.tiles.set(q.k, T); this.stats.ms = performance.now() - t0;
    return true;
  }
  // 버릴 타일: 지금 원하는 가까운 타일이 아닌 것부터, 오래 안 본 것부터. 버렸으면 true
  evict(need:number) {
    const old = [...this.tiles].filter(([k]) => !this.want.has(k)).sort((a, b) => a[1].seen - b[1].seen);
    let done = 0; while (done < need && old.length) { const [k, T] = old.shift()!; this.drop(T); this.tiles.delete(k); done++ }
    return done >= need;
  }
  // 쉬는 틈에 한 타일씩(그리는 프레임 밖, 움직이는 동안은 미룬다): 지으면 repaint
  pump(map:FestoonMap, repaint:()=>void) {
    if (this.idle || !this.queue.length) return;
    const run = () => { this.idle = 0; if (!this.gl) return; if (map.isMoving()) { this.pump(map, repaint); return } if (this.buildOne()) repaint() };
    this.idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 600 }) : setTimeout(run, 60) as unknown as number;
  }
  pending() { return this.queue.length > 0 }

  render(gl:WebGL2RenderingContext, matrix:ArrayLike<number>, opts:NightRenderOptions = {}) {
    if (!this.p) return;
    const { zoom = 15, phone = false, reducedMotion = false, bounds, pixelRatio = 1, now = performance.now() } = opts, F = this.F;
    let keep = keepAt(zoom, F); this.stats.keep = keep; this.stats.drawn = 0;
    if (keep <= 0) return;
    let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity;
    if (bounds) { x0 = Math.min(bounds[0]!, bounds[2]!); x1 = Math.max(bounds[0]!, bounds[2]!); y0 = Math.min(bounds[1]!, bounds[3]!); y1 = Math.max(bounds[1]!, bounds[3]!) }
    const vis:FestoonTile[] = [];
    for (const T of this.tiles.values()) if (T.n && !(T.box![2] < x0 || T.box![0] > x1 || T.box![3] < y0 || T.box![1] > y1)) vis.push(T);
    if (!vis.length) return;
    // 줄 안 건너뛰기: 화면에서 minPx 보다 가깝지 않게
    const mpp = EARTH * Math.cos(ORIGIN[1] * Math.PI / 180) / (512 * 2 ** zoom), stride = Math.max(1, Math.ceil(F.minPx * mpp / F.roofM));
    // 상한: 켤 몫에서 실제로 남을 전구 수를 상한에 맞춘다 — 세로 줄은 상한의 vertShare 까지, 지붕은 남은 만큼(0 까지)
    const cap = phone ? F.cap.phone : F.cap.desk, count = (k:number, kv:number, part?:string) => vis.reduce((s, T) => s + survivors(T, k, kv, stride, part), 0);
    let vert = zoom >= F.vertZoom ? Math.min(1, zoom - F.vertZoom + .3) : 0;
    const memo = `${stride}|${keep.toFixed(3)}|${vert.toFixed(2)}|${cap}|${vis.map(T => T.d).join()}`;   // 같은 줌 · 같은 타일이면 다시 세지 않는다(매 프레임)
    if (this.capMemo?.k === memo) ({ keep, vert } = this.capMemo);
    else {
      while (vert > 0 && count(0, vert, 'vert') > cap * F.vertShare) vert = Math.max(0, vert - .1);
      const rest = cap - count(0, vert, 'vert');
      while (keep > 0 && count(keep, 0, 'roof') > rest) keep = Math.max(0, keep - .05);
      this.capMemo = { k: memo, keep, vert, drawn: count(keep, vert) };
    }
    this.stats.drawn = this.capMemo!.drawn; if (keep <= 0) return;
    const MT = this.M; MT.set(matrix);
    for (let r = 0; r < 4; r++) MT[12 + r] = matrix[r]! * O.x + matrix[4 + r]! * O.y + matrix[12 + r]!;
    const sz = bulbSize(zoom, pixelRatio, F.scale);
    lightsOn(gl); gl.useProgram(this.p);
    gl.uniformMatrix4fv(this.u.u_matrix, false, MT);
    gl.uniform1f(this.u.u_size, sz.point); gl.uniform1f(this.u.u_core, sz.coreFrac);
    gl.uniform1f(this.u.u_keep, keep); gl.uniform1f(this.u.u_vert, vert); gl.uniform1f(this.u.u_stride, stride);
    gl.uniform1f(this.u.u_time, now / 1000); gl.uniform1f(this.u.u_anim, reducedMotion ? 0 : 1); gl.uniform1f(this.u.u_bright, F.bright);
    gl.uniform3fv(this.u.u_pal, this.pal); gl.uniform2f(this.u.u_wt, F.wt[0]!, F.wt[1]!);
    for (const T of vis) { gl.bindVertexArray(T.va!); gl.drawArrays(gl.POINTS, 0, T.n) }
    gl.bindVertexArray(null); lightsOff(gl);
    this.stats.tiles = this.tiles.size; this.stats.bulbs = vis.reduce((s, T) => s + T.n, 0); this.stats.keepCapped = keep; this.stats.vert = vert;
  }
  animating() { return this.stats.drawn > 0 }

  drop(T:FestoonTile) { const gl = this.gl; if (gl && T.b) { gl.deleteBuffer(T.b); gl.deleteVertexArray(T.va!) } }
  dispose(gl:WebGL2RenderingContext) {
    for (const T of this.tiles.values()) this.drop(T);
    this.tiles.clear(); this.queue = []; this.want = new Set(); this.looked = 0;
    if (this.idle) { (typeof cancelIdleCallback === 'function' ? cancelIdleCallback : clearTimeout as (id:number)=>void)(this.idle); this.idle = 0 }
    if (this.p) gl.deleteProgram(this.p); this.p = null; this.gl = null;
  }
}
export default FestoonLayer;
