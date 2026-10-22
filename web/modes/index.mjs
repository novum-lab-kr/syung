// 모드 목록 · 설정 고르기. 기본(basic)이 모든 설정의 원본이고, 모드는 다른 것만 적는다(from 을 안 적으면 basic).
// settings(name) = 합치기(settings(from), 그 모드) → 마지막에 허용된 내 설정. 결과는 모드마다 캐시하고 얼린다(같은 모드면 같은 참조).
// 정의는 이 파일이 import 하지 않는다: 본체가 정의를 import 해서 넘긴다(자식만 부르는 import 는 첫 화면 요청을 한 단계 늦춘다).
import { mergeSettings, freezeSettings, validateSettings, validateModeDefinitions } from './merge.mjs';

// 내 설정으로 바꿀 수 있는 것: 테마 · 지도 색만. 모드 고르기 · 배속은 전환 명령이지 설정 덧쓰기가 아니다.
const COLOR = /^(#[0-9a-fA-F]{6}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/;   // #rrggbb · rgba(r,g,b,a)
// 도시 팩 · 공원 자료 검사(엔진이 읽는 모양): '#' 로 시작하거나 color 로 끝나는 키, palette · sky · light · dark · colors 묶음 안의 글자는 #rrggbb, 수는 0 이상,
// 줌(키가 zoom 으로 끝나거나 lod 묶음 안)은 0~24, lod 의 [시작, 끝] 은 두 개에 시작 ≤ 끝. 이름 값(pattern · fade …)의 목록 검사는 아직 없다.
const HEX6 = /^#[0-9a-fA-F]{6}$/, COLOR_GROUP = /^(palette|sky|light|dark|colou?rs?)$/i;   // 이 이름의 묶음 안 글자는 모두 색
function checkPack(pack, where) {
  const walk = (v, path, key, inLod, inColor) => {
    if (Array.isArray(v)) {
      if (inLod && !(v.length === 2 && v.every(x => typeof x === 'number') && v[0] <= v[1])) throw new Error(`${path}: lod 는 [시작, 끝] 두 개, 시작 ≤ 끝`);
      v.forEach((x, i) => walk(x, `${path}[${i}]`, key, inLod, inColor)); return;
    }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, k, inLod || k === 'lod', inColor || COLOR_GROUP.test(k)); return }
    if (typeof v === 'string') { if ((inColor || v.startsWith('#') || /colou?r$/i.test(key)) && !HEX6.test(v)) throw new Error(`${path}: 색이 아님 (${v})`); return }
    if (typeof v === 'number') {
      if (v < 0) throw new Error(`${path}: 음수 (${v})`);
      if ((inLod || /zoom$/i.test(key)) && v > 24) throw new Error(`${path}: 줌 범위 밖 (${v})`);
    }
  };
  walk(pack, where, '', false, false);
}
export const USER_PREFERENCES = Object.freeze({ themeChoice: Object.freeze(['auto', 'light', 'dark']), mapColor: Object.freeze(['calm', 'color']) });

export function createModeRegistry(definitions, { root = 'basic', maxDepth = 2, preferences = USER_PREFERENCES } = {}) {
  // 정의는 만들 때 한 번 베껴 고정한다(id · from · label 사본, settings 는 안쪽까지 얼림): 뒤에 원본을 바꿔도 캐시 · chain · explain 이 갈라지지 않게
  const defs = Object.freeze((Array.isArray(definitions) ? definitions : Object.values(definitions))
    .map(d => d && typeof d === 'object' ? Object.freeze({ id: d.id, from: d.from, label: d.label, settings: d.settings }) : d));
  const byId = validateModeDefinitions(defs, { root, maxDepth });
  for (const d of defs) freezeSettings(d.settings || {});   // 합친 결과가 바뀌지 않은 묶음을 같이 쓴다
  const parent = id => id === root ? null : byId.get(id).from ?? root;
  const chainOf = id => { const c = []; for (let p = id; p != null; p = parent(p)) c.unshift(p); return c };   // basic 부터
  const base = new Map(), withUser = new Map();
  const modeSettings = id => {
    let S = base.get(id); if (S) return S;
    const d = byId.get(id), up = parent(id);
    S = up == null ? (d.settings || {}) : mergeSettings(modeSettings(up), d.settings || {});
    freezeSettings(checkKnown(validateSettings(S, `${id}`), id)); base.set(id, S); return S;
  };
  // 아는 키의 값 검사(키가 생기는 커밋마다 여기에 더한다): 테마 · 지도 색은 허용 값만, 지도 색 자료(map.themes · colors · park)의 글자는 색, 수는 0 이상, 이름 값은 목록 안
  function checkKnown(S, id) {
    // 아는 묶음은 평범한 객체여야(null · 참거짓 · 배열 · 수로 통째로 바꾸면 엔진이 그 안을 읽다 멈춘다)
    const plainGroup = v => v && typeof v === 'object' && !Array.isArray(v);
    for (const [g, k] of [['map'], ['map', 'pixel'], ['city'], ['city', 'life'], ['park'], ['track'], ['trains'], ['buses'], ['me'], ['sun']]) {
      const v = k ? S[g]?.[k] : S[g], present = k ? (S[g] && k in S[g]) : g in S;
      if (present && !plainGroup(v)) throw new Error(`${id}.${k ? g + '.' + k : g}: 묶음(객체)이어야 — ${JSON.stringify(v)}`);
    }
    for (const k of Object.keys(preferences)) if (k in S && !preferences[k].includes(S[k])) throw new Error(`${id}.${k}: 허용되지 않는 값 ${S[k]}`);
    const colors = (v, path) => {
      if (typeof v === 'string') { if (!COLOR.test(v)) throw new Error(`${path}: 색이 아님 (${v})`) }
      else if (typeof v === 'number') { if (v < 0) throw new Error(`${path}: 음수 (${v})`) }
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) colors(v[k], Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
    };
    for (const k of ['themes', 'colors', 'park']) if (S.map?.[k] != null) colors(S.map[k], `${id}.map.${k}`);
    const oneOf = (v, list, path) => { if (v !== undefined && !list.includes(v)) throw new Error(`${path}: 허용되지 않는 값 ${v}`) };
    oneOf(S.map?.paletteKind, ['base', 'city', 'park-city'], `${id}.map.paletteKind`); oneOf(S.map?.exitLook, ['pillar', 'jangseung'], `${id}.map.exitLook`); oneOf(S.sun?.light, ['map', 'park'], `${id}.sun.light`);
    oneOf(S.track?.kind, ['ground', 'viaduct', 'coaster'], `${id}.track.kind`); oneOf(S.me?.look, ['sprout', 'builder', 'seonbi', 'visitor', 'scv', 'drone', 'probe'], `${id}.me.look`); oneOf(S.trains?.look, ['commuter', 'fleet', 'coaster88', 'units'], `${id}.trains.look`); oneOf(S.city?.landmarks, ['tower', 'wood-tower'], `${id}.city.landmarks`); oneOf(S.buses?.look, ['bus', 'palanquin', 'siegeTank', 'ultralisk', 'dragoon'], `${id}.buses.look`);
    for (const k of ['lead', 'rest']) if (S.trains?.units && typeof S.trains.units[k] !== 'string') throw new Error(`${id}.trains.units.${k}: 유닛 모양 이름이어야`);   // (이름이 맞는지는 그리는 쪽 — 없는 모양은 안 그린다)
    for (const k of ['cars', 'crossings']) if (S.city?.life && k in S.city.life && typeof S.city.life[k] !== 'boolean') throw new Error(`${id}.city.life.${k}: 참 · 거짓`); oneOf(S.trains?.body, ['wide', 'slim'], `${id}.trains.body`); oneOf(S.track?.platform, ['ribbon', 'straight'], `${id}.track.platform`);
    if (S.city && 'tone' in S.city) {   // 톤: 팩 modes 의 진짜 톤 항목(채도 · 밝기가 있는 묶음 — colorMath · transitionMs 는 아님)
      const T = S.city.tone, M = S.city.pack?.modes, e = typeof T === 'string' && M && Object.hasOwn(M, T) ? M[T] : null;
      if (!e || typeof e !== 'object' || Array.isArray(e) || !('saturation' in e || 'brightness' in e)) throw new Error(`${id}.city.tone: 팩 modes 에 없는 톤 ${T}`);
      if (S.city.lampPool == null && !(typeof e.lampPool === 'number' && e.lampPool > 0)) throw new Error(`${id}.city.lampPool: null 이면 톤의 lampPool 이 0 보다 큰 수여야 — ${e.lampPool}`);
    }
    if (S.city && S.city.lampPool != null && !(typeof S.city.lampPool === 'number' && S.city.lampPool > 0)) throw new Error(`${id}.city.lampPool: 0 보다 큰 수 또는 null — ${S.city.lampPool}`);
    if (S.trains && 'predictStops' in S.trains && !(Number.isInteger(S.trains.predictStops) && S.trains.predictStops >= 1)) throw new Error(`${id}.trains.predictStops: 1 이상 정수`);
    for (const [g, k] of [['map', 'verticalGradient'], ['city', 'groundTexture'], ['city', 'xray'], ['trains', 'timeWarp']]) if (S[g] && k in S[g] && typeof S[g][k] !== 'boolean') throw new Error(`${id}.${g}.${k}: 참 · 거짓`);
    if (S.sun && S.sun.lowHouseM != null && !(typeof S.sun.lowHouseM === 'number' && S.sun.lowHouseM > 0)) throw new Error(`${id}.sun.lowHouseM: 0 보다 큰 수 또는 null`);
    if (S.city?.pack) checkPack(S.city.pack, `${id}.city.pack`);
    if (S.park?.style) checkPack(S.park.style, `${id}.park.style`);
    if (S.park && 'towerM' in S.park && !(typeof S.park.towerM === 'number' && S.park.towerM > 0)) throw new Error(`${id}.park.towerM: 0 보다 큰 수`);
    if (S.park && 'landmarkRides' in S.park) {   // 랜드마크 놀이기구: 목록, 줄마다 kind · lngLat(서울 둘레) · diameterM
      if (!Array.isArray(S.park.landmarkRides)) throw new Error(`${id}.park.landmarkRides: 목록`);
      S.park.landmarkRides.forEach((L, k) => { const at = `${id}.park.landmarkRides[${k}]`;
        oneOf(L?.kind, ['ferris'], `${at}.kind`); if (L?.kind === undefined) throw new Error(`${at}.kind: 필요`);
        if (!(Array.isArray(L.lngLat) && L.lngLat.length === 2 && L.lngLat[0] > 126 && L.lngLat[0] < 128 && L.lngLat[1] > 37 && L.lngLat[1] < 38)) throw new Error(`${at}.lngLat: 서울 둘레 [경도, 위도]`);
        if (!(typeof L.diameterM === 'number' && L.diameterM > 0 && L.diameterM <= 400)) throw new Error(`${at}.diameterM: 0 ~ 400 m`);
        if ('yawDeg' in L && typeof L.yawDeg !== 'number') throw new Error(`${at}.yawDeg: 수`) });
    }
    for (const g of ['city', 'park']) if (S[g] && 'enabled' in S[g] && typeof S[g].enabled !== 'boolean') throw new Error(`${id}.${g}.enabled: 참 · 거짓`);
    if (S.map?.pixel) {   // 도트: 켜기 · 윤곽은 참거짓, 크기는 1~8 CSS px, 팔레트는 목록 안
      const X = S.map.pixel;
      for (const k of ['enabled', 'outline']) if (k in X && typeof X[k] !== 'boolean') throw new Error(`${id}.map.pixel.${k}: 참 · 거짓`);
      if ('size' in X && !(typeof X.size === 'number' && X.size >= 1 && X.size <= 8)) throw new Error(`${id}.map.pixel.size: 1 ~ 8`);
      oneOf(X.palette, ['none', 'endesga32'], `${id}.map.pixel.palette`);
    }
    return S;
  }
  for (const id of byId.keys()) modeSettings(id);   // 잘못된 정의는 쓰기 전에(시작할 때) 알린다

  // 내 설정 정규화: 허용된 키 · 값만. 잘못된 값은 던진다(저장소에서 읽은 값은 부르는 쪽이 먼저 걸러 넘긴다).
  function normalizeUser(user) {
    if (user == null) return null;
    if (typeof user !== 'object' || Array.isArray(user)) throw new Error('내 설정은 객체');
    const out = {};
    for (const k of Object.keys(user)) {
      const allowed = preferences[k]; if (!allowed) throw new Error(`${k}: 내 설정으로 못 바꾸는 항목`);
      const d = Object.getOwnPropertyDescriptor(user, k); if (d.get || d.set) throw new Error(`${k}: getter · setter 는 못 씀`);
      const v = d.value; if (v === undefined) continue;   // 한 번만 읽는다
      if (!allowed.includes(v)) throw new Error(`${k}: 허용되지 않는 값 ${v}`);
      out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  function settings(name = root, user) {
    if (!byId.has(name)) throw new Error(`${name}: 없는 모드`);
    const S = modeSettings(name), u = normalizeUser(user); if (!u) return S;
    const key = `${name}|${Object.keys(preferences).map(k => u[k] ?? '').join('|')}`;
    let R = withUser.get(key); if (!R) { R = freezeSettings(mergeSettings(S, u)); withUser.set(key, R) }
    return R;
  }
  const list = () => defs.map(d => ({ id: d.id, from: parent(d.id), label: d.label ?? d.id }));
  // 이 모드 최종 설정의 출처: 키 경로마다 마지막으로 적은 모드(기본에서 온 값은 root). 콘솔 · #debug 용, 매번 새로 계산한다.
  function explain(name = root) {
    if (!byId.has(name)) throw new Error(`${name}: 없는 모드`);
    const chain = chainOf(name), sources = {};
    const mark = (v, path, id) => { if (v && typeof v === 'object' && !Array.isArray(v)) { if (path) delete sources[path]; for (const k of Object.keys(v)) mark(v[k], path ? `${path}.${k}` : k, id) } else if (path) { for (const k of Object.keys(sources)) if (k.startsWith(path + '.')) delete sources[k]; sources[path] = id } };   // 값 · 목록 · null 이 묶음을 통째로 바꾸면 그 안쪽 출처는 지운다
    for (const id of chain) mark(byId.get(id).settings || {}, '', id);
    return { id: name, chain, sources };
  }
  return { root, settings, list, explain, has: id => byId.has(id), chain: chainOf };
}
