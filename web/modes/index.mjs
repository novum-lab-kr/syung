// 모드 목록 · 설정 고르기. 기본(basic)이 모든 설정의 원본이고, 모드는 다른 것만 적는다(from 을 안 적으면 basic).
// settings(name) = 합치기(settings(from), 그 모드) → 마지막에 허용된 내 설정. 결과는 모드마다 캐시하고 얼린다(같은 모드면 같은 참조).
// 정의는 이 파일이 import 하지 않는다: 본체가 정의를 import 해서 넘긴다(자식만 부르는 import 는 첫 화면 요청을 한 단계 늦춘다).
import { mergeSettings, freezeSettings, validateSettings, validateModeDefinitions } from './merge.mjs';

// 내 설정으로 바꿀 수 있는 것: 테마 · 지도 색만. 모드 고르기 · 배속은 전환 명령이지 설정 덧쓰기가 아니다.
const COLOR = /^(#[0-9a-fA-F]{6}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/;   // #rrggbb · rgba(r,g,b,a)
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
  // 아는 키의 값 검사(키가 생기는 커밋마다 여기에 더한다): 테마 · 지도 색은 허용 값만, 지도 색(map)의 글자는 색, 수는 0 이상
  function checkKnown(S, id) {
    for (const k of Object.keys(preferences)) if (k in S && !preferences[k].includes(S[k])) throw new Error(`${id}.${k}: 허용되지 않는 값 ${S[k]}`);
    const colors = (v, path) => {
      if (typeof v === 'string') { if (!COLOR.test(v)) throw new Error(`${path}: 색이 아님 (${v})`) }
      else if (typeof v === 'number') { if (v < 0) throw new Error(`${path}: 음수 (${v})`) }
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) colors(v[k], Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
    };
    if (S.map != null) colors(S.map, `${id}.map`);
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
