// The city's build worker (web/city/buildings.mjs posts the work): a tile's raw vector-tile bytes in, its
// building meshes out — read by web/city/mvt.mjs, built by web/city/mesh.mjs — so panning never waits
// on a build. One tile at a time, in the order asked; the vertex and index buffers go back transferred.
import { decodeTile } from './mvt.mts';
import { TileBuilder, resolvePack } from './mesh.mts';
import type { MeshPack, ResolvedPack, BuilderOptions } from './mesh.mts';

import '../modes/joseon/hanok.mts';
import '../modes/starcraft/race_buildings.mjs';
import '../modes/nations/parts.mjs';   // 도시 부품 'nation'(나라 모드 건물)도 이 Worker 에 등록   // 도시 부품 'race'(스타크래프트 종족 건물)도 이 Worker 에 등록   // 도시 부품 'hanok' 을 이 Worker 에도 등록(조선 팩이면 한옥으로 짓는다 — 코드는 메시지로 받지 않는다)

// 본체(buildings.mts)가 보내는 일: 팩 · 고가 통과 목록 한 번, 그다음 타일마다 짓기
type WorkerMessage = { type:'pack'; pack:MeshPack; through?:BuilderOptions['through'] } | { type:'build'; key:string; z:number; x:number; y:number; pbf:ArrayBuffer; phone:boolean };
// Worker 의 전역(tsconfig 는 DOM 만 — postMessage 의 옮기기 목록 칸만)
interface WorkerScope { postMessage(message:unknown, transfer:Transferable[]):void; postMessage(message:unknown):void }

let P:ResolvedPack | null = null, TH:BuilderOptions['through'] = null;   // the style pack and the through list (osm id → crossing points), both from the first message
self.onmessage = (e:MessageEvent<WorkerMessage>) => {
  const m = e.data;
  if (m.type === 'pack') { P = resolvePack(m.pack); TH = m.through || null; return }
  if (m.type !== 'build') return;
  try {
    if (!P) throw Error('city-build worker: no style pack yet');
    const L = decodeTile(m.pbf, new Set(['building', 'landuse']));
    const tb = new TileBuilder({ z: m.z, x: m.x, y: m.y, extent: L.building?.extent || 4096, buildings: L.building || null, landuse: L.landuse || null }, P, { phone: m.phone, through: TH });
    while (!tb.step(1e9));
    const r = tb.result();
    (self as unknown as WorkerScope).postMessage({ type: 'done', key: m.key, mesh: r }, [r.verts.buffer, r.idx.buffer, ...Object.values(r.inst).map(b => b.buffer), ...(r.models ? [r.models.data.buffer] : [])]);
  } catch (err) { (self as unknown as WorkerScope).postMessage({ type: 'fail', key: m.key, error: String(err && (err as Error).stack || err) }) }
};
