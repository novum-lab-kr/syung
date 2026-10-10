// The city's build worker (web/lib/city_buildings.mjs posts the work): a tile's raw vector-tile bytes in, its
// building meshes out — read by web/city/mvt.mjs, built by web/lib/city_mesh.mjs — so panning never waits
// on a build. One tile at a time, in the order asked; the vertex and index buffers go back transferred.
import { decodeTile } from '../city/mvt.mjs';
import { TileBuilder, resolvePack } from './city_mesh.mjs';
import './city_hanok.mjs';   // 도시 부품 'hanok' 을 이 Worker 에도 등록(조선 팩이면 한옥으로 짓는다 — 코드는 메시지로 받지 않는다)

let P = null, TH = null;   // the style pack and the through list (osm id → crossing points), both from the first message
self.onmessage = e => {
  const m = e.data;
  if (m.type === 'pack') { P = resolvePack(m.pack); TH = m.through || null; return }
  if (m.type !== 'build') return;
  try {
    if (!P) throw Error('city-build worker: no style pack yet');
    const L = decodeTile(m.pbf, new Set(['building', 'landuse']));
    const tb = new TileBuilder({ z: m.z, x: m.x, y: m.y, extent: L.building?.extent || 4096, buildings: L.building || null, landuse: L.landuse || null }, P, { phone: m.phone, through: TH });
    while (!tb.step(1e9));
    const r = tb.result();
    self.postMessage({ type: 'done', key: m.key, mesh: r }, [r.verts.buffer, r.idx.buffer, ...Object.values(r.inst).map(b => b.buffer)]);
  } catch (err) { self.postMessage({ type: 'fail', key: m.key, error: String(err && err.stack || err) }) }
};
