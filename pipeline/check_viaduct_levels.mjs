#!/usr/bin/env node
// 심시티 고가 층 검사: the runtime's level assignment run offline on the whole network (the same code, data and station
// rectangles as the page): every place two decks cross or run together, how it was separated (a hump on the later line, or
// a raised station), and whether any crossing is still at one level. Prints a summary; writes the details as JSON.
//   node pipeline/check_viaduct_levels.mjs [--out FILE]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CityViaduct, toLL } from '../web/city/viaduct.mjs';
import SNAP, { stops as SNAP_STOPS } from '../web/city/viaduct_snap.mjs';
import pack from '../web/modes/basic/city.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2), OUT = args[args.indexOf('--out') + 1] || null;
const TS = JSON.parse(readFileSync(path.join(ROOT, 'data', 'osm-tracks', 'track_shapes.json'), 'utf8')), shapes = TS.edges;
const html = readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8'), block = id => JSON.parse(html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`))[1]);
const stations = block('stationData'), paths = block('linePaths'), byId = new Map(stations.map(q => [q.id, q])), nameOf = id => byId.get(+id)?.name ?? String(id);
function chaikin(pts, rounds = 3) { for (let r = 0; r < rounds && pts.length > 2; r++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if (i > 0) out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]); if (i < pts.length - 2) out.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]) } out.push(pts[pts.length - 1]); pts = out } return pts }
export function offlineViaduct() {
  // 런타임(심시티)처럼 도로 위로 옮긴 역 점 · 곧은 승강장 방향을 먼저 쓴다
  const stops = { ...(TS.stops || {}), ...Object.fromEntries(Object.entries(SNAP_STOPS).map(([k, v]) => [k, v.slice(0, 2)])) }, dirs = { ...(TS.stopDirs || {}), ...Object.fromEntries(Object.entries(SNAP_STOPS).filter(([, v]) => v.length > 3).map(([k, v]) => [k, v.slice(2)])) }, halfs = TS.stopHalf || {}, phalf = TS.platformHalf || {}, rects = new Map(), M = 111320;
  for (const st of stations) for (const { name: line } of st.lines) {
    const k = `${line}:${st.id}`, c = stops[k] || [st.lon, st.lat], kx = Math.cos(c[1] * Math.PI / 180), h = halfs[k] || 90; let d = dirs[k];
    if (!d) { const e = Object.keys(shapes).find(x => x.startsWith(line + ':') && x.split(':').slice(1).includes(String(st.id))); if (!e) continue; const P = shapes[e], a = P[0], b = P[P.length - 1], dx = (b[0] - a[0]) * kx * M, dy = (b[1] - a[1]) * M, l = Math.hypot(dx, dy) || 1; d = [dx / l, dy / l] }
    const ll = (x, y) => [c[0] + x / (kx * M), c[1] + y / M], ph = phalf[k];
    rects.set(k, { coords: [ll(-d[0] * h, -d[1] * h), ll(d[0] * h, d[1] * h)], offset: 0, plat: ph ? Math.min(1, ph / h) : 1 });
  }
  const merc = ([lon, lat]) => ({ x: lon / 360 + .5, y: .5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI) }), cache = new Map();
  const geom = (line, lo, hi) => { const id = `${line}:${lo}:${hi}`; let g = cache.get(id); if (g) return g; const c = SNAP[id] || (shapes[id] ? chaikin(shapes[id].map(q => q.slice())) : null) || [stops[`${line}:${lo}`] || [byId.get(lo).lon, byId.get(lo).lat], stops[`${line}:${hi}`] || [byId.get(hi).lon, byId.get(hi).lat]]; g = { pts: c.map(merc) }; cache.set(id, g); return g };
  return new CityViaduct({ pack, net: { paths, byId, colors: {}, geom, offset: () => 0, rects, exits: {}, bodyPx: () => 26 } });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const v = offlineViaduct(); v.levelsOf(); const D = v.debugCrossings();
  const named = id => { const [line, lo, hi] = id.split(':'); return `${line} ${nameOf(lo)}–${nameOf(hi)}` };
  const raised = v.debugLevels().map(([k, L]) => ({ key: k, station: nameOf(k.slice(k.lastIndexOf(':') + 1)), level: L }));
  const humps = D.humps.map(h => ({ ...h, edge: named(h.edge), over: named(h.over) })), same = D.sameLevel.map(r => ({ ...r, a: named(r.a), b: named(r.b) }));
  const floors = D.floors.map(([k, L]) => ({ key: k, station: nameOf(k.slice(k.lastIndexOf(':') + 1)), level: L }));
  console.log(`crossing/overlap regions ${D.regions} (side by side, one deck: ${D.parallel}); humps ${humps.length}; stations raised by a crossing next to them ${floors.length}; raised stations in all ${raised.length} (levels ${JSON.stringify(Object.fromEntries([2, 3, 4, 5].map(L => [L, raised.filter(r => r.level === L).length])))}); still at one level: ${same.length}; ${D.ms} ms`);
  for (const r of same.slice(0, 10)) console.log('  SAME LEVEL', JSON.stringify(r));
  if (OUT) writeFileSync(OUT, JSON.stringify({ regions: D.regions, ms: D.ms, humps, floors, raised, sameLevel: same }, null, 1));
}
