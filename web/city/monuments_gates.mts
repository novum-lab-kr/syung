// 두 도성문의 공통 짜임. 구역 파일에서만 부른다(첫 화면 정적 import 없음).
// 정밀 도면이 없는 부재는 아래 이름 있는 상수(근사)로 단순화한 시각화 값이다. 구역 머리 주석에 근거와 한계를 적는다.
import { MeshWriter, K, buildRoof, buildBrackets, bandBox } from './monument_parts.mts';
export type GatePoint = [number, number];
// ── 근사 상수: 모두 정밀 도면 · 실측으로 확인하지 못한 시각화 값이다(근거가 있는 것만 따로 적는다) ──
const PARAPET_HEIGHT = 1.2;       // 전돌 여장 높이: 숭례문 전면 1.2 m(문화재청 2013 공개 현황). 흥인지문에도 같은 값을 쓴 근사
const PARAPET_THICKNESS = .44;    // 근사
const PARAPET_MARGIN = { x: 1.5, y: 2 };   // 문루 바깥으로 여장이 도는 여유(근사)
const PARAPET_BODY = .7, MERLON_LENGTH = .9, MERLON_PITCH = 1.6;   // 몸통 높이 · 총안 사이 솟은 돌 길이 · 간격(근사)
const UPPER_TIER_START = .39;     // 상층 기둥이 시작하는 높이(문루 목재 높이 대비, 근사)
const BEAM_FRACTION = .22;        // 기둥 높이(문루 목재 높이 대비, 근사)
const ROOF_LIFT = .65, ROOF_FLARE = .45;   // 처마 올림 · 벌림(근사)
const PLAQUE_VERTICAL = { width: .9, height: 1.9 }, PLAQUE_HORIZONTAL = { width: 2.8, height: 1 };   // 현판 크기(근사 — 숭례문은 세로, 흥인지문은 가로)
export interface GateShape {
  base:GatePoint[]; enclosure?:GatePoint[]; frameWidth:number; frameDepth:number;
  height:number; masonryHeight:number; archWidth:number; archHeight:number; verticalPlaque:boolean;
  tiers?:1 | 2; bays?:number;   // 단층 문루(숙정문 · 창의문)는 tiers 1 · 정면 칸 수 bays(기본 중층 · 5칸)
}

// 오목한 OSM 윤곽도 그대로 덮는 가로 절편: 모서리마다 잘라 윗면과 옆면만 만든다.
// 홍예는 같은 절편의 아래 높이를 원호로 올려 실제 관통하는 구멍으로 남긴다.
function masonry(writer:MeshWriter, ring:GatePoint[], height:number, arch:{ width:number; height:number } | null):void {
  const halfArch = (arch?.width ?? 0) / 2;
  const spring = (arch?.height ?? 0) - halfArch;
  const ceiling = (east:number):number => {
    if (!arch || Math.abs(east) > halfArch + .00001) return 0;
    return spring + Math.sqrt(Math.max(0, halfArch * halfArch - east * east));
  };
  const cuts = ring.map(point => point[0]);
  if (arch) for (let segment = 0; segment <= 40; segment++) cuts.push(-halfArch + arch.width * segment / 40);
  cuts.sort((left, right) => left - right);
  const unique = [...new Set(cuts)];
  for (let index = 0; index + 1 < unique.length; index++) {
    const from = unique[index]!, to = unique[index + 1]!, middle = (from + to) / 2;
    if (to - from < .00001) continue;
    const crossings:{ middle:number; from:number; to:number }[] = [];
    for (let edge = 0; edge + 1 < ring.length; edge++) {
      const start = ring[edge]!, end = ring[edge + 1]!;
      if (middle <= Math.min(start[0], end[0]) || middle >= Math.max(start[0], end[0])) continue;
      const northAt = (east:number):number => start[1] + (end[1] - start[1]) * (east - start[0]) / (end[0] - start[0]);
      crossings.push({ middle: northAt(middle), from: northAt(from), to: northAt(to) });
    }
    crossings.sort((left, right) => left.middle - right.middle);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const front = crossings[pair]!, back = crossings[pair + 1]!;
      const opened = arch !== null && Math.abs(middle) < halfArch;
      const bottomFrom = opened ? ceiling(from) : 0, bottomTo = opened ? ceiling(to) : 0;
      writer.quad([from, front.from, bottomFrom], [to, front.to, bottomTo], [to, front.to, height], [from, front.from, height], K.granite, [0, -1, 0]);
      writer.quad([to, back.to, bottomTo], [from, back.from, bottomFrom], [from, back.from, height], [to, back.to, height], K.granite, [0, 1, 0]);
      writer.quad([from, front.from, height], [to, front.to, height], [to, back.to, height], [from, back.from, height], K.granite, [0, 0, 1]);
      if (opened) writer.quad([from, front.from, bottomFrom], [from, back.from, bottomFrom], [to, back.to, bottomTo], [to, front.to, bottomTo], K.tunnel, [0, 0, -1]);
    }
  }
  // 가로 절편에 나타나지 않는 동서 끝 면과 홍예 수직 문설주.
  for (let edge = 0; edge + 1 < ring.length; edge++) {
    const start = ring[edge]!, end = ring[edge + 1]!;
    if (Math.abs(start[0] - end[0]) < .00001) writer.quad([start[0], start[1], 0], [end[0], end[1], 0], [end[0], end[1], height], [start[0], start[1], height], K.granite, [Math.sign(start[0]), 0, 0]);
  }
  if (arch) {
    for (const side of [-1, 1]) {
      const east = side * halfArch, intersections:number[] = [];
      for (let edge = 0; edge + 1 < ring.length; edge++) {
        const start = ring[edge]!, end = ring[edge + 1]!;
        if (east <= Math.min(start[0], end[0]) || east >= Math.max(start[0], end[0])) continue;
        intersections.push(start[1] + (end[1] - start[1]) * (east - start[0]) / (end[0] - start[0]));
      }
      intersections.sort((left, right) => left - right);
      const front = intersections[0]!, back = intersections[intersections.length - 1]!;
      writer.quad([east, front, 0], [east, back, 0], [east, back, spring], [east, front, spring], K.tunnel, [-side, 0, 0]);
    }
  }
}

function pavilion(writer:MeshWriter, shape:GateShape):void {
  const halfWidth = shape.frameWidth / 2, halfDepth = shape.frameDepth / 2;
  const floor = shape.masonryHeight;   // 기둥 발은 육축 윗면에 바로 닿는다(단 · 바닥 면으로 띄우지 않는다)
  const timberHeight = shape.height - floor;
  const tiers = shape.tiers ?? 2, bays = shape.bays ?? 5, top = tiers - 1;
  for (let tier = 0; tier < tiers; tier++) {
    const inset = tier * .6, halfFront = halfWidth - inset, halfSide = halfDepth - tier * .25;
    const bottom = floor + timberHeight * tier * UPPER_TIER_START;
    const beam = bottom + timberHeight * BEAM_FRACTION;
    // 정면 다섯 칸(기본)은 기둥 여섯 줄, 측면 두 칸은 세 줄. 가운데 칸도 열린 하층을 가짜 벽으로 막지 않는다.
    for (let column = 0; column <= bays; column++) {
      const east = -halfFront + halfFront * 2 * column / bays;
      for (const north of [-halfSide, 0, halfSide]) writer.prism(east, north, .25, bottom, beam, K.red, 10);
      if (tier === 1 && column < bays) for (const side of [-1, 1]) {
        const next = -halfFront + halfFront * 2 * (column + 1) / bays;
        writer.box(east + .25, next - .25, side * halfSide - .08, side * halfSide + .08, bottom + .15, beam - .15, K.wood);
      }
    }
    if (tier === 1) for (const side of [-1, 1]) writer.box(side * halfFront - .08, side * halfFront + .08, -halfSide, halfSide, bottom + .15, beam - .15, K.wood);
    bandBox(writer, halfFront + .3, halfSide + .3, beam - .2, beam + .25, K.dancheong, 0, .28);
    buildBrackets(writer, halfFront + .3, halfSide + .3, beam + .15);
    const eave = beam + .9, roofRise = shape.height - .62 - eave;
    const innerDepth = tier === top ? 0 : halfDepth - .2;
    const rise = tier === top ? roofRise : timberHeight * .17;
    buildRoof(writer, { hx: halfFront + 2.5, hy: halfSide + 2.4, ix: halfFront - halfSide, iy: innerDepth, z0: eave, rise, lift: ROOF_LIFT, flare: ROOF_FLARE }, { innerZ: beam + .8, innerHx: halfFront + .3, innerHy: halfSide + .3 });
    // 문루 안쪽 개구부의 천장만 등불을 받는다. 막힌 판문 · 단청 · 기와에는 발광 재질을 쓰지 않는다.
    if (tier === 0) writer.quad([-halfFront, -halfSide, beam], [halfFront, -halfSide, beam], [halfFront, halfSide, beam], [-halfFront, halfSide, beam], K.tunnel, [0, 0, -1]);
    if (tier === top) {
      // 현판: 검은 바탕 + 금빛 테두리까지만(글씨는 지어내지 않는다). 셰이더가 폭을 s 에서 읽도록 데시미터 폭을 싣는다
      const plaque = shape.verticalPlaque ? PLAQUE_VERTICAL : PLAQUE_HORIZONTAL, y = -halfSide - .3, widthCode = 2 * Math.round(plaque.width * 10);
      writer.box(-plaque.width / 2, plaque.width / 2, y, y + .15, bottom + .1, bottom + .1 + plaque.height, K.plaque);
      writer.quad([-plaque.width / 2, y - .01, bottom + .1], [plaque.width / 2, y - .01, bottom + .1], [plaque.width / 2, y - .01, bottom + .1 + plaque.height], [-plaque.width / 2, y - .01, bottom + .1 + plaque.height], K.plaque, [0, -1, 0], widthCode, widthCode, widthCode + 1, widthCode + 1);
    }
  }
  // 육축 위 전돌 여장: 네 면이 문루 바깥을 닫아 두른다(일각문 자리는 근거를 확인하지 못해 비우지 않고 닫았다 — 근사). 회색 계열 재질
  const parapetWidth = halfWidth + PARAPET_MARGIN.x, parapetDepth = halfDepth + PARAPET_MARGIN.y;
  const run = (alongX:boolean, fixed:number, from:number, to:number):void => {
    const half = PARAPET_THICKNESS / 2, wall = (a0:number, a1:number, z1:number):void => {
      if (alongX) writer.box(a0, a1, fixed - half, fixed + half, floor, z1, K.ridge); else writer.box(fixed - half, fixed + half, a0, a1, floor, z1, K.ridge);
    };
    wall(from, to, floor + PARAPET_BODY);
    const count = Math.max(1, Math.round((to - from) / MERLON_PITCH));
    for (let merlon = 0; merlon < count; merlon++) {
      const start = from + (to - from) * merlon / count;
      wall(start, Math.min(to, start + MERLON_LENGTH), floor + PARAPET_HEIGHT);
    }
  };
  for (const side of [-1, 1]) { run(true, side * parapetDepth, -parapetWidth, parapetWidth); run(false, side * parapetWidth, -parapetDepth, parapetDepth) }
}

export function buildCityGate(shape:GateShape):Float32Array {
  const writer = new MeshWriter();
  masonry(writer, shape.base, shape.masonryHeight, { width: shape.archWidth, height: shape.archHeight });
  if (shape.enclosure) {
    masonry(writer, shape.enclosure, shape.masonryHeight, null);
    // 옹성의 실제 두께 · 열린 북쪽 끝은 OSM 안팎 윤곽을 그대로 따른다. 담 위 총안은 음영으로 읽히는 작은 구멍을 남긴다.
    for (let edge = 0; edge + 1 < shape.enclosure.length; edge++) {
      const start = shape.enclosure[edge]!, end = shape.enclosure[edge + 1]!;
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (length < .5) continue;
      writer.xf = { x: start[0], y: start[1], cos: (end[0] - start[0]) / length, sin: (end[1] - start[1]) / length };
      const count = Math.max(1, Math.ceil(length / 2.5));
      for (let merlon = 0; merlon < count; merlon++) {
        const from = length * merlon / count, to = length * (merlon + 1) / count;
        writer.box(from, to, -.22, .22, shape.masonryHeight, shape.masonryHeight + .35, K.granite);
        writer.box(from, to - .35, -.22, .22, shape.masonryHeight + .7, shape.masonryHeight + 1.15, K.granite);
        writer.box(from, from + .3, -.22, .22, shape.masonryHeight + .35, shape.masonryHeight + .7, K.granite);
      }
      writer.xf = null;
    }
  }
  pavilion(writer, shape);
  return new Float32Array(writer.data);
}

// 성곽 선에서 성문 자리를 잘라 낸다: 선을 .5 m 씩 나눠, 문 국소 좌표(방향 yawDeg)에서 육축 상자(앞뒤 + 1.6 m · 좌우 + .8 m) 안에 든 조각을 버린다 —
// 성곽이 문 앞을 가로질러 홍예 통로를 막지 않게(문 육축이 그 자리를 채운다). 점은 문 중심 기준 동 · 북 미터.
export function clipOutsideGate(line:GatePoint[], base:GatePoint[], yawDeg:number):GatePoint[][] {
  const angle = yawDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const halfX = Math.max(...base.map(point => Math.abs(point[0]))) + .8, halfY = Math.max(...base.map(point => Math.abs(point[1]))) + 1.6;
  const inside = (east:number, north:number):boolean => Math.abs(east * cos + north * sin) < halfX && Math.abs(-east * sin + north * cos) < halfY;
  const runs:GatePoint[][] = []; let run:GatePoint[] = [];
  for (let index = 0; index + 1 < line.length; index++) {
    const [ax, ay] = line[index]!, [bx, by] = line[index + 1]!, steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / .5));
    for (let step = 0; step < steps; step++) {
      const t0 = step / steps, t1 = (step + 1) / steps, from:GatePoint = [ax + (bx - ax) * t0, ay + (by - ay) * t0], to:GatePoint = [ax + (bx - ax) * t1, ay + (by - ay) * t1];
      if (inside((from[0] + to[0]) / 2, (from[1] + to[1]) / 2)) { if (run.length) runs.push(run); run = []; continue }
      if (!run.length) run.push(from);
      run.push(to);
    }
  }
  if (run.length) runs.push(run);
  return runs;
}
