// Seoul bus map contract v1: /data/bus/{routes,stops}.json and /api/bus/live.
// Static MapLibre layers sit below the subway. Moving buses have a separate canvas,
// so interpolation does not redraw the basemap or re-tile GeoJSON every frame.
import {buildBusPath, busPointAt, snapBusToPath, nextBusMotion, busMotionDistance,
  validCoordinate, intersects, contains} from './bus_motion.mjs';

export const BUS_ZOOM = {routes: 13, buses: 14, stops: 15, labels: 16};
export const BUS_TYPES = {
  trunk: {name: '간선', light: '#3567C8', dark: '#7FAAFF'},
  branch: {name: '지선', light: '#328044', dark: '#7AC98C'},
  express: {name: '광역', light: '#C74744', dark: '#FA9991'},
  circular: {name: '순환', light: '#916900', dark: '#E8C455'},
  night: {name: '심야', light: '#3567C8', dark: '#7FAAFF'},
  other: {name: '버스', light: '#63747B', dark: '#A4B5BB'},
};
const SOURCE_ROUTES = 'bus-routes', SOURCE_STOPS = 'bus-stops';
const LAYERS = ['bus-route-road', 'bus-route-approx', 'bus-stop-dot', 'bus-stop-label'];
const SETTING_KEY = 'subway-buses', STALE_MS = 120000, EXPIRE_MS = 600000;
const collection = features => ({type: 'FeatureCollection', features});
const feature = (type, coordinates, properties) => ({type: 'Feature', geometry: {type, coordinates}, properties});
const text = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const boundsArray = bounds => [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
const padded = b => { const x = (b[2] - b[0]) * .12, y = (b[3] - b[1]) * .12; return [b[0] - x, b[1] - y, b[2] + x, b[3] + y]; };
const boundsOf = points => points.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const color = (route, theme) => (BUS_TYPES[route.type] || BUS_TYPES.other)[theme];

export function prepareBusData(routes, stops) {
  if (routes?.schemaVersion !== 1 || stops?.schemaVersion !== 1 || !Array.isArray(routes.routes) || !Array.isArray(stops.stops)) {
    throw new Error('Unsupported bus data');
  }
  const stopById = new Map(), routeById = new Map(), routesByStop = new Map();
  for (const stop of stops.stops) {
    if (typeof stop.id !== 'string' || !validCoordinate([stop.lng, stop.lat])) continue;
    stopById.set(stop.id, {...stop, name: String(stop.name || '이름 없는 정류장')});
  }
  for (const raw of routes.routes) {
    if (typeof raw.id !== 'string' || !Array.isArray(raw.path) || raw.path.length < 2 || !raw.path.every(validCoordinate)) continue;
    const stopEntries = Array.isArray(raw.stopIds) ? raw.stopIds.map((id, i) => ({id, sequence: raw.stopSequences?.[i]})).filter(s => stopById.has(s.id)) : [];
    const route = {...raw, name: String(raw.name || raw.id), type: BUS_TYPES[raw.type] ? raw.type : 'other',
      stopIds: stopEntries.map(s => s.id), stopSequences: stopEntries.map(s => Number.isInteger(s.sequence) ? s.sequence : null),
      bbox: boundsOf(raw.path), approximate: raw.pathSource !== 'api', geometry: null};
    routeById.set(route.id, route);
    for (const id of new Set(route.stopIds)) {
      if (!routesByStop.has(id)) routesByStop.set(id, []);
      routesByStop.get(id).push(route);
    }
  }
  return {routeById, stopById, routesByStop, source: routes.source};
}

// Keep only segments touching the viewport. A long route's overall bbox is not enough:
// its two arms can straddle the whole screen without any of its roads being visible.
export function visibleBusRoutes(data, box, selected = null) {
  const found = [], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  for (const route of data.routeById.values()) {
    if (!intersects(route.bbox, box)) continue;
    const parts = []; let part = null, rank = Infinity;
    for (let i = 1; i < route.path.length; i++) {
      const a = route.path[i - 1], b = route.path[i];
      if (!intersects([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], box)) { part = null; continue; }
      if (!part) { part = [a]; parts.push(part); } part.push(b);
      const dx = (b[0] - a[0]) * .8, dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((cx - a[0]) * .8 * dx + (cy - a[1]) * dy) / l2)) : 0;
      rank = Math.min(rank, ((a[0] + (b[0] - a[0]) * t - cx) * .8) ** 2 + (a[1] + (b[1] - a[1]) * t - cy) ** 2);
    }
    if (parts.length) found.push({route, parts, rank: route.id === selected ? -1 : rank});
  }
  return found.sort((a, b) => a.rank - b.rank || a.route.id.localeCompare(b.route.id));
}

export function busRequestURL(routeIds, selected = null) {
  const ids = [...new Set(routeIds)].slice(0, 8);
  const query = new URLSearchParams({routes: ids.join(',')});
  if (selected && ids.includes(selected)) query.set('focus', selected);
  return `/api/bus/live?${query}`;
}

export function createBusLayer(options) { return new BusLayer(options); }

class BusLayer {
  constructor({map, phone = false, beforeId = 'routes', onSelect = () => {}, onClear = () => {}, fetcher = fetch}) {
    this.map = map; this.phone = phone; this.beforeId = beforeId; this.onSelect = onSelect; this.onClear = onClear;
    this.fetcher = (...args) => fetcher(...args); // Window.fetch must not receive the BusLayer as its receiver.
    this.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    this.enabled = false; this.disposed = false; this.data = null; this.visible = []; this.fleet = new Map(); this.hits = [];
    this.selectedRoute = null; this.selection = null; this.updateDetail = null; this.mode = 'unavailable'; this.status = '';
    this.pollMs = 30000; this.frame = 0; this.frameTimer = 0; this.pollTimer = 0; this.viewTimer = 0; this.freshnessTimer = 0; this.detailAt = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.button = document.getElementById('toggleBuses'); this.note = document.getElementById('busSettingNote');
    this.nearby = document.getElementById('inspectNearbyBus');
    this.canvas = document.createElement('canvas'); this.canvas.className = 'bus-overlay'; this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    map.getCanvas().after(this.canvas); this.ctx = this.canvas.getContext('2d');
    this.notice = document.createElement('p'); this.notice.className = 'bus-notice'; this.notice.hidden = true;
    this.notice.setAttribute('role', 'status'); map.getContainer().append(this.notice);
    this.installLayers();
    this.move = () => { clearTimeout(this.viewTimer); this.viewTimer = setTimeout(() => this.refreshView(), 200); };
    this.render = () => this.draw();
    this.visibility = () => {
      this.stopLive();
      if (!document.hidden) this.refreshView(); else this.clearCanvas();
    };
    this.motionChanged = () => { this.stopAnimation(); this.draw(); };
    this.zoom = () => { if (map.getZoom() < BUS_ZOOM.buses) this.stopLive(); this.draw(); this.updateStatus(); };
    this.toggle = () => this.setEnabled(!this.enabled);
    this.inspect = () => this.inspectNearby();
    this.remove = () => this.destroy();
    map.on('moveend', this.move); map.on('render', this.render); map.on('zoom', this.zoom); map.on('remove', this.remove);
    document.addEventListener('visibilitychange', this.visibility); this.reduced.addEventListener('change', this.motionChanged);
    this.button?.addEventListener('click', this.toggle); this.nearby?.addEventListener('click', this.inspect);
    let saved = false; try { saved = localStorage.getItem(SETTING_KEY) === '1'; } catch {}
    this.setEnabled(saved);
  }

  installLayers() {
    const map = this.map, before = map.getLayer(this.beforeId) ? this.beforeId : undefined;
    map.addSource(SOURCE_ROUTES, {type: 'geojson', data: collection([]), tolerance: 1.5, maxzoom: 16,
      attribution: '버스 노선·정류장 <a href="https://data.seoul.go.kr/dataList/OA-1095/F/1/datasetView.do" target="_blank" rel="noopener">서울특별시 열린데이터광장</a>'});
    map.addSource(SOURCE_STOPS, {type: 'geojson', data: collection([])});
    for (const approximate of [false, true]) map.addLayer({id: approximate ? LAYERS[1] : LAYERS[0], type: 'line', source: SOURCE_ROUTES,
      minzoom: BUS_ZOOM.routes, filter: ['==', ['get', 'approximate'], approximate], layout: {'line-cap': 'round', 'line-join': 'round'},
      paint: {'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, .8, 14, 1.2, 18, 2.2],
        'line-opacity': ['case', ['get', 'selected'], .9, .46], ...(approximate ? {'line-dasharray': [2, 2]} : {})}}, before);
    map.addLayer({id: LAYERS[2], type: 'circle', source: SOURCE_STOPS, minzoom: BUS_ZOOM.stops,
      paint: {'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 18, 4], 'circle-color': '#fffdf6',
        'circle-stroke-color': '#63747B', 'circle-stroke-width': 1.3}}, before);
    map.addLayer({id: LAYERS[3], type: 'symbol', source: SOURCE_STOPS, minzoom: BUS_ZOOM.labels,
      layout: {'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
        'text-variable-anchor': ['right', 'left', 'top', 'bottom'], 'text-radial-offset': .7, 'text-padding': 5,
        'text-max-width': 12, 'text-optional': true},
      paint: {'text-color': '#5d5a4e', 'text-halo-color': '#fffdf6', 'text-halo-width': 1.5}}, before);
  }

  setTheme(theme) {
    if (this.disposed) return;
    this.theme = theme === 'dark' ? 'dark' : 'light';
    const dark = this.theme === 'dark';
    for (const [id, key, value] of [[LAYERS[2], 'circle-color', dark ? '#1a1c1f' : '#fffdf6'],
      [LAYERS[2], 'circle-stroke-color', dark ? '#A4B5BB' : '#63747B'],
      [LAYERS[3], 'text-color', dark ? '#b9b5a6' : '#5d5a4e'], [LAYERS[3], 'text-halo-color', dark ? '#1a1c1f' : '#fffdf6']]) {
      if (this.map.getLayer(id)) this.map.setPaintProperty(id, key, value);
    }
    this.renderStatic(); this.draw(); this.refreshDetail();
  }

  setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = !!enabled;
    try { localStorage.setItem(SETTING_KEY, this.enabled ? '1' : '0'); } catch {}
    this.button?.setAttribute('aria-pressed', String(this.enabled));
    for (const id of LAYERS) this.map.setLayoutProperty(id, 'visibility', this.enabled ? 'visible' : 'none');
    if (!this.enabled) {
      this.stopLive(); this.staticController?.abort(); this.staticController = null;
      this.loading = false; this.fleet.clear(); this.clearSelection(); this.clearCanvas(); this.onClear();
    } else this.refreshView();
    this.updateStatus();
  }

  async loadStatic() {
    if (this.loading || this.data || !this.enabled || this.disposed) return;
    this.loading = true; this.status = ''; const controller = new AbortController(); this.staticController = controller; this.updateStatus();
    try {
      const read = async url => { const r = await this.fetcher(url, {signal: controller.signal}); if (!r.ok) throw new Error('Bus data unavailable'); return r.json(); };
      const results = await Promise.all([read('/data/bus/routes.json'), read('/data/bus/stops.json')]);
      if (controller.signal.aborted || this.disposed) return;
      this.data = prepareBusData(...results); this.loading = false;
      this.refreshView();
    } catch (error) {
      if (!controller.signal.aborted) { this.loading = false; this.status = '노선을 불러오지 못했어요 · 껐다 켜서 재시도'; this.updateStatus(); }
    } finally { if (this.staticController === controller) this.staticController = null; }
  }

  refreshView() {
    if (this.disposed || !this.enabled || document.hidden) return;
    if (this.map.getZoom() < BUS_ZOOM.routes) { this.stopLive(); this.visible = []; this.renderStatic(); this.updateStatus(); return; }
    if (!this.data) { this.loadStatic(); return; }
    this.box = padded(boundsArray(this.map.getBounds()));
    this.visible = visibleBusRoutes(this.data, this.box, this.selectedRoute);
    this.renderStatic(); this.draw(); this.updateStatus();
    const ids = this.visible.slice(0, 8).map(v => v.route.id), key = `${ids.join(',')}|${this.selectedRoute || ''}`;
    if (this.map.getZoom() < BUS_ZOOM.buses || !ids.length) { this.stopLive(); return; }
    if (key !== this.requestKey) { this.stopLive(); this.requestKey = key; this.pollLive(); }
    else if (!this.liveController && !this.pollTimer) this.pollLive();
    if (!this.freshnessTimer) this.freshnessTimer = setInterval(() => this.checkFreshness(), 30000);
  }

  renderStatic() {
    if (this.disposed) return;
    const features = [], stopFeatures = [], stopIds = new Set();
    for (const {route, parts} of this.visible) {
      for (const part of parts) features.push(feature('LineString', part, {routeId: route.id, name: route.name,
        color: color(route, this.theme), selected: route.id === this.selectedRoute, approximate: route.approximate}));
      for (const id of route.stopIds) stopIds.add(id);
    }
    if (this.data && this.box && this.map.getZoom() >= BUS_ZOOM.stops) for (const id of stopIds) {
      const stop = this.data.stopById.get(id);
      if (contains(this.box, [stop.lng, stop.lat])) stopFeatures.push(feature('Point', [stop.lng, stop.lat], {id, name: stop.name}));
      if (stopFeatures.length >= (this.phone ? 700 : 1400)) break;
    }
    this.map.getSource(SOURCE_ROUTES)?.setData(collection(features));
    this.map.getSource(SOURCE_STOPS)?.setData(collection(stopFeatures));
    this.stopFeatures = stopFeatures;
  }

  async pollLive() {
    clearTimeout(this.pollTimer); this.pollTimer = 0;
    if (this.liveController || !this.active() || !this.visible.length) return;
    const ids = this.visible.slice(0, 8).map(v => v.route.id), controller = new AbortController();
    this.liveController = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await this.fetcher(busRequestURL(ids, this.selectedRoute), {cache: 'no-store', signal: controller.signal});
      if (!r.ok) throw new Error('Bus live unavailable');
      const payload = await r.json();
      if (!controller.signal.aborted && this.active()) this.setLiveData(payload, ids);
    } catch {
      if (this.liveController === controller && this.active()) {
        this.mode = 'error'; for (const bus of this.fleet.values()) this.freeze(bus);
        this.updateStatus(); this.refreshDetail(); this.draw();
      }
    } finally {
      clearTimeout(timeout);
      if (this.liveController === controller) {
        this.liveController = null;
        if (this.active()) this.pollTimer = setTimeout(() => this.pollLive(), this.pollMs);
      }
    }
  }

  geometry(route) {
    if (route.geometry) return route.geometry;
    const path = buildBusPath(route.path); if (!path) return null;
    let previous = 0;
    path.stops = route.stopIds.map(id => {
      const stop = this.data.stopById.get(id);
      const snapped = snapBusToPath(path, [stop.lng, stop.lat], {hint: previous, min: previous, maxError: 1000});
      previous = snapped?.distance ?? previous;
      return {stop, distance: previous};
    });
    route.geometry = path; return path;
  }

  setLiveData(payload, requested = this.visible.slice(0, 8).map(v => v.route.id)) {
    if (!this.data || this.disposed) return;
    if (payload?.schemaVersion !== 1 || !Array.isArray(payload.buses)) throw new Error('Unsupported bus live data');
    const now = performance.now(), wall = Date.now(), seen = new Set(), allowed = new Set(requested);
    this.mode = ['live', 'mock', 'unavailable'].includes(payload.mode) ? payload.mode : 'unavailable';
    this.routeStates = payload.routes || {};
    this.pollMs = Math.min(300000, Math.max(15000, (Number(payload.pollAfterSeconds) || 30) * 1000));
    for (const row of payload.buses) {
      const route = this.data.routeById.get(row.routeId);
      if (!route || !allowed.has(row.routeId) || typeof row.id !== 'string' || !validCoordinate([row.lng, row.lat])) continue;
      const path = this.geometry(route); if (!path) continue;
      const state = payload.routes?.[row.routeId] || {}, previous = this.fleet.get(row.id);
      const received = timestamp(row.receivedAt), fetched = timestamp(state.fetchedAt) ?? timestamp(payload.fetchedAt);
      const observed = received ?? fetched;
      if (previous?.observed != null && observed != null && observed < previous.observed) {
        seen.add(row.id); // An older cache response is not a new position or a route correction.
        continue;
      }
      const age = Math.max(0, observed == null ? 0 : wall - observed, Number(state.ageSeconds || 0) * 1000);
      if (age > EXPIRE_MS) continue;
      const stale = ['stale', 'error', 'deferred', 'unavailable'].includes(state.status) || age > STALE_MS || observed == null;
      let min = 0, max = path.total;
      // Original ordinals can have gaps. Only the explicit aligned mapping is a hint;
      // an absent/unmatched ordinal must never be treated as an array index.
      const seq = Number.isInteger(row.stopSequence) ? route.stopSequences.indexOf(row.stopSequence) : -1;
      if (seq >= 0 && path.stops[seq] && path.stops[seq + 1]) {
        min = Math.max(0, path.stops[seq].distance - 50); max = Math.min(path.total, path.stops[seq + 1].distance + 50);
      }
      const options = {hint: previous?.motion.to ?? null, min, max, heading: row.heading, maxError: route.approximate ? 700 : 250};
      const snap = snapBusToPath(path, [row.lng, row.lat], options);
      if (!snap) continue;
      seen.add(row.id);
      const same = previous && previous.observed === observed && Math.abs(previous.motion.to - snap.distance) < 1;
      const interval = previous && observed > previous.observed ? observed - previous.observed : this.pollMs;
      const motion = same ? previous.motion : nextBusMotion(previous?.motion, snap.distance, now, {interval, reduced: this.reduced.matches, stale});
      const bus = {row, route, path, motion, observed, fetched, received, stale, receivedWall: wall,
        mock: payload.mode === 'mock' || row.mock === true || row.id.startsWith('mock:'), status: state.status};
      if (stale) this.freeze(bus);
      this.fleet.set(row.id, bus);
    }
    for (const [id, bus] of this.fleet) {
      if (allowed.has(bus.route.id) && !seen.has(id)) this.fleet.delete(id);
      else if (wall - bus.receivedWall > EXPIRE_MS) this.fleet.delete(id);
    }
    this.updateStatus(); this.refreshDetail(); this.draw();
  }

  freeze(bus) { bus.stale = true; bus.motion = {...bus.motion, from: bus.motion.to, duration: 0}; }
  checkFreshness() {
    const now = Date.now();
    for (const [id, bus] of this.fleet) {
      const age = now - (bus.observed ?? bus.receivedWall);
      if (age > EXPIRE_MS) this.fleet.delete(id);
      else if (age > STALE_MS) this.freeze(bus);
    }
    this.updateStatus(); this.refreshDetail(); this.draw();
  }
  active() { return !this.disposed && this.enabled && !document.hidden && this.map.getZoom() >= BUS_ZOOM.buses; }
  stopAnimation() { clearTimeout(this.frameTimer); cancelAnimationFrame(this.frame); this.frameTimer = 0; this.frame = 0; }
  stopLive() {
    clearTimeout(this.pollTimer); this.pollTimer = 0; this.stopAnimation();
    clearInterval(this.freshnessTimer); this.freshnessTimer = 0;
    this.liveController?.abort(); this.liveController = null; this.requestKey = null;
  }
  clearCanvas() { this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height); this.hits = []; }

  draw() {
    if (!this.ctx || !this.active()) { this.clearCanvas(); return; }
    const now = performance.now(), width = this.map.getCanvas().clientWidth, height = this.map.getCanvas().clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2), ctx = this.ctx;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); this.hits = [];
    const box = boundsArray(this.map.getBounds()), zoom = this.map.getZoom(), cap = this.phone ? 160 : 320;
    const routes = new Set(this.visible.map(v => v.route.id)), labels = []; this.labelBoxes = labels; let moving = false;
    const fleet = [...this.fleet.values()].sort((a, b) => Number(b.row.id === this.selection?.id) - Number(a.row.id === this.selection?.id));
    for (const bus of fleet) {
      if (!routes.has(bus.route.id) || Date.now() - bus.receivedWall > EXPIRE_MS) continue;
      if (bus.observed != null && Date.now() - bus.observed > STALE_MS) this.freeze(bus);
      const distance = this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, now), pose = busPointAt(bus.path, distance);
      if (!contains(box, pose.coordinate)) continue;
      const p = this.map.project(pose.coordinate);
      if (p.x < -24 || p.x > width + 24 || p.y < -24 || p.y > height + 24) continue;
      const heading = pose.heading * Math.PI / 180, q = this.map.project([
        pose.coordinate[0] + Math.sin(heading) * 5 / bus.path.kx, pose.coordinate[1] + Math.cos(heading) * 5 / 111320]);
      const selected = this.selection?.kind === 'bus' && this.selection.id === bus.row.id;
      const length = Math.min(24, 18 + (zoom - 14) * 1.5), half = length / 2, tint = color(bus.route, this.theme);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(q.y - p.y, q.x - p.x)); ctx.globalAlpha = bus.stale ? .55 : 1;
      if (selected) { ctx.beginPath(); ctx.roundRect(-half - 3, -8, length + 6, 16, 5); ctx.fillStyle = this.theme === 'dark' ? '#1a1c1f' : '#fffdf6'; ctx.fill(); }
      ctx.beginPath(); ctx.roundRect(-half, -5, length, 10, 3); ctx.fillStyle = tint; ctx.fill();
      ctx.strokeStyle = this.theme === 'dark' ? '#131416' : '#fffdf6'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = this.theme === 'dark' ? '#131416' : '#fffdf6'; ctx.fillRect(half - 5, -3, 2, 6);
      ctx.beginPath(); ctx.moveTo(half + 2, -3); ctx.lineTo(half + 6, 0); ctx.lineTo(half + 2, 3); ctx.fillStyle = tint; ctx.fill(); ctx.restore();
      this.hits.push({x: p.x, y: p.y, bus});
      if (zoom >= BUS_ZOOM.labels) {
        ctx.font = '600 11px "Noto Sans KR",sans-serif';
        const halfText = ctx.measureText(bus.route.name).width / 2 + 4, box = [p.x - halfText, p.y - 25, p.x + halfText, p.y - 8];
        if (box[0] >= 4 && box[2] <= width - 4 && box[1] >= 4 && !labels.some(other => intersects(box, other))) {
          labels.push(box); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = this.theme === 'dark' ? '#1a1c1f' : '#fffdf6';
          ctx.strokeText(bus.route.name, p.x, p.y - 10); ctx.fillStyle = this.theme === 'dark' ? '#f1efe6' : '#1d1f21'; ctx.fillText(bus.route.name, p.x, p.y - 10);
        }
      }
      if (!this.reduced.matches && !bus.stale && now < bus.motion.startedAt + bus.motion.duration) moving = true;
      if (this.hits.length >= cap) break;
    }
    const selectedBus = this.selection?.kind === 'bus' ? this.fleet.get(this.selection.id) : null;
    if (selectedBus) {
      const completedAt = selectedBus.motion.startedAt + selectedBus.motion.duration;
      const completed = now >= completedAt && this.detailAt < completedAt;
      if (now - this.detailAt >= 1000 || completed) { this.detailAt = now; this.refreshDetail(); }
      // An open detail follows its bus even after it leaves the visible canvas.
      if (!this.reduced.matches && !selectedBus.stale && now < completedAt) moving = true;
    }
    if (moving && !this.frameTimer && !this.frame) {
      this.frameTimer = setTimeout(() => { this.frameTimer = 0; this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); }); }, 1000 / (this.phone ? 24 : 30));
    }
  }

  selectAt(point) {
    if (!this.enabled || !this.data || this.map.getZoom() < BUS_ZOOM.routes) return false;
    let nearest = null, distance = this.phone ? 24 : 16;
    for (const hit of this.hits) { const d = Math.hypot(hit.x - point.x, hit.y - point.y); if (d < distance) { nearest = hit; distance = d; } }
    if (nearest) { this.select({kind: 'bus', id: nearest.bus.row.id}, nearest.bus.route.id); return true; }
    const radius = this.phone ? 20 : 9;
    const stops = this.map.getZoom() >= BUS_ZOOM.stops ? this.map.queryRenderedFeatures([[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]], {layers: [LAYERS[2]]}) : [];
    if (stops.length) { this.select({kind: 'stop', id: stops[0].properties.id}, null); return true; }
    const routes = this.map.queryRenderedFeatures([[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]], {layers: LAYERS.slice(0, 2)});
    if (routes.length) { const id = routes[0].properties.routeId; this.select({kind: 'route', id}, id); return true; }
    return false;
  }

  inspectNearby() {
    const c = this.map.getCanvas(), centre = {x: c.clientWidth / 2, y: c.clientHeight / 2};
    const hit = [...this.hits].sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))[0];
    if (hit) this.select({kind: 'bus', id: hit.bus.row.id}, hit.bus.route.id);
    else if (this.stopFeatures?.length) {
      const stops = this.stopFeatures.map(f => ({f, p: this.map.project(f.geometry.coordinates)}));
      stops.sort((a, b) => Math.hypot(a.p.x - centre.x, a.p.y - centre.y) - Math.hypot(b.p.x - centre.x, b.p.y - centre.y));
      this.select({kind: 'stop', id: stops[0].f.properties.id}, null);
    } else if (this.visible[0]) this.select({kind: 'route', id: this.visible[0].route.id}, this.visible[0].route.id);
    else return;
    const panel = document.getElementById('settingsPanel'); if (panel) panel.hidden = true;
    document.getElementById('settingsButton')?.setAttribute('aria-expanded', 'false');
    this.restoreFocus = document.getElementById('settingsButton');
    document.querySelector('.bus-detail h3')?.focus({preventScroll: true});
  }

  select(selection, routeId) {
    this.selection = selection; this.selectedRoute = routeId;
    this.updateDetail = this.onSelect(this.detailHTML()) || null;
    this.refreshView();
  }
  clearSelection() {
    if (!this.selection) return;
    if (document.activeElement?.closest?.('.bus-detail')) this.restoreFocus?.focus({preventScroll: true});
    this.restoreFocus = null; this.selection = null; this.selectedRoute = null; this.updateDetail = null; this.renderStatic(); this.draw();
  }
  refreshDetail() { if (this.selection && this.updateDetail) this.updateDetail(this.detailHTML()); }

  detailHTML() {
    const selection = this.selection; if (!selection) return '';
    const wrap = html => `<div class="bus-detail">${html}</div>`;
    if (selection.kind === 'stop') {
      const stop = this.data.stopById.get(selection.id); if (!stop) return '';
      const routes = this.data.routesByStop.get(stop.id) || [];
      return wrap(`<h3 tabindex="-1">${text(stop.name)}</h3><p class="bus-detail-note">버스 정류장${stop.arsId ? ` · ${text(stop.arsId)}` : ''}</p><div class="bus-route-list">${routes.map(r => `<span style="--bus-color:${color(r, this.theme)}">${text(BUS_TYPES[r.type].name)} <b>${text(r.name)}</b></span>`).join('')}</div>`);
    }
    const bus = selection.kind === 'bus' ? this.fleet.get(selection.id) : null;
    const route = bus?.route || this.data.routeById.get(this.selectedRoute); if (!route) return '';
    const heading = `<h3 tabindex="-1"><span class="bus-type" style="--bus-color:${color(route, this.theme)}">${text(BUS_TYPES[route.type].name)}</span> ${text(route.name)}번</h3>`;
    const approx = route.approximate ? '<p class="bus-detail-note">정류장을 연결한 근사 경로예요.</p>' : '';
    if (!bus) return wrap(`${heading}<p class="bus-detail-note">${selection.kind === 'bus' ? '이 버스의 최신 위치를 확인하지 못했어요.' : `${route.stopIds.length}개 정류장`}</p>${approx}`);
    const position = busMotionDistance(bus.motion, performance.now());
    const next = bus.path.stops.find(s => s.distance > position + 8)?.stop;
    const clock = bus.received ?? bus.fetched;
    const time = clock == null ? '확인되지 않음' : new Date(clock).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul'});
    const state = bus.mock ? '예시 데이터 · 실제 운행 정보 아님' : bus.stale ? '위치 갱신 지연 · 마지막 위치' : '마지막 수신 위치를 연결해 보여요';
    return wrap(`${heading}<dl class="bus-detail-grid"><dt>다음 정류장</dt><dd>${text(next?.name || '정보 없음')}${next ? '<small>경로 기준</small>' : ''}</dd><dt>${bus.received ? '수신 시각' : '조회 시각'}</dt><dd>${text(time)}</dd></dl><p class="bus-detail-note">${state}</p>${approx}`);
  }

  updateStatus() {
    if (this.disposed) return;
    const zoom = this.map.getZoom();
    const delayed = this.mode === 'error' || [...this.fleet.values()].some(b => b.stale) ||
      Object.values(this.routeStates || {}).some(s => ['stale', 'deferred', 'error'].includes(s.status));
    let message = '노선과 버스 위치를 표시해요';
    if (this.enabled) {
      if (zoom < BUS_ZOOM.routes) message = '확대하면 버스 노선이 보여요';
      else if (this.loading) message = '버스 노선 불러오는 중…';
      else if (this.status) message = this.status;
      else if (!this.visible.length) message = '이 화면에는 서울 버스 노선이 없어요';
      else if (zoom < BUS_ZOOM.buses) message = '더 확대하면 버스 위치를 확인할 수 있어요';
      else if (this.mode === 'mock' || [...this.fleet.values()].some(b => b.mock)) message = '예시 데이터 · 실제 운행 정보 아님';
      else if (this.mode === 'unavailable') message = '노선만 표시 · 실시간 준비 중';
      else if (delayed) message = '노선 표시 중 · 위치 갱신 지연';
      else if (!this.fleet.size) message = '노선 표시 중 · 수신된 버스 없음';
      else message = `서울 버스 ${this.visible.length}개 노선`;
    }
    if (this.note) this.note.textContent = message;
    if (this.nearby) { this.nearby.hidden = !this.enabled; this.nearby.disabled = !this.visible.length || zoom < BUS_ZOOM.routes; }
    const approximate = this.visible.some(v => v.route.approximate), mock = this.mode === 'mock' || [...this.fleet.values()].some(b => b.mock);
    const notice = mock ? '버스 예시 데이터 · 실제 운행 정보 아님' : delayed ? '버스 위치 갱신 지연' : '';
    this.notice.textContent = [notice, approximate ? `${notice ? '' : '버스 · '}정류장 연결선` : ''].filter(Boolean).join(' · ');
    this.notice.hidden = !this.enabled || zoom < BUS_ZOOM.routes || !this.notice.textContent;
  }

  destroy() {
    if (this.disposed) return;
    this.stopLive(); clearTimeout(this.viewTimer); this.staticController?.abort(); this.disposed = true;
    this.map.off('moveend', this.move); this.map.off('render', this.render); this.map.off('zoom', this.zoom); this.map.off('remove', this.remove);
    document.removeEventListener('visibilitychange', this.visibility); this.reduced.removeEventListener('change', this.motionChanged);
    this.button?.removeEventListener('click', this.toggle); this.nearby?.removeEventListener('click', this.inspect);
    this.canvas.remove(); this.notice.remove(); this.fleet.clear();
  }
}
