// 모드 설정 합치기 · 검사 · 얼리기. 설정은 데이터뿐(평범한 객체 · 배열 · 글자 · 유한한 수 · 참거짓 · null).
// 합치기 규칙: 묶음(평범한 객체)은 안쪽까지 합치고, 값 · 목록은 통째로 바꾸고, null 은 그대로 남아 그 기능을 끈다. 안 적은 키는 물려받는다.
// 바뀌지 않은 묶음은 원래 참조를 그대로 돌려준다(구조 공유) — 도시 팩처럼 참조가 바뀌면 다시 짓는 소비자가 있다.
// 키 차례는 기존 city_style_joseon 의 merge 와 같다(기본 차례 그대로, 새 키는 뒤에) — JSON 으로 비교해도 같은 결과.
// 다른 화면 파일을 import 하지 않는다.

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isPlain = v => { if (!v || typeof v !== 'object' || Array.isArray(v)) return false; const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null };

// 설정 값 하나하나가 데이터인지 본다. 잘못되면 경로를 담아 던진다(합치기 전에 정의마다, 합친 뒤 한 번 더).
export function validateSettings(S, where = 'settings') {
  const seen = new Set(), up = new Set();   // seen: 같이 쓰는 묶음은 한 번만, up: 지금 경로의 조상(순환 찾기)
  const walk = (v, path) => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`${path}: 유한한 수가 아님 (${v})`); return }
    if (typeof v !== 'object') throw new Error(`${path}: 데이터가 아님 (${typeof v})`);
    if (!Array.isArray(v) && !isPlain(v)) throw new Error(`${path}: 평범한 객체가 아님 (${v.constructor?.name || '?'})`);
    if (up.has(v)) throw new Error(`${path}: 순환 참조`);
    if (seen.has(v)) return; seen.add(v); up.add(v);   // 얼린 기본 묶음은 여러 곳에서 같이 쓴다: 한 번만 본다
    for (const k of Reflect.ownKeys(v)) {
      if (typeof k === 'symbol') throw new Error(`${path}: 기호 키`);
      if (BAD_KEYS.has(k)) throw new Error(`${path}.${k}: 쓸 수 없는 키`);
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (Array.isArray(v) && k === 'length') continue;
      if (d.get || d.set) throw new Error(`${path}.${k}: getter · setter 는 설정에 못 넣음`);
      if (!d.enumerable) throw new Error(`${path}.${k}: 숨은(열거 안 되는) 속성`);   // 합치기 · 얼리기 · 출처 보기가 Object.keys 로 돈다
      walk(d.value, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
    }
    up.delete(v);
  };
  walk(S, where);
  return S;
}

// base 위에 delta 를 덧쓴다. 입력은 바꾸지 않는다. delta 가 undefined 면 base 그대로.
export function mergeSettings(base, delta) {
  if (delta === undefined) return base;
  if (!isPlain(delta) || !isPlain(base)) return delta;
  let out = null;
  for (const k of Object.keys(delta)) {
    if (BAD_KEYS.has(k)) throw new Error(`${k}: 쓸 수 없는 키`);
    const v = delta[k]; if (v === undefined) continue;
    const next = isPlain(v) && isPlain(base[k]) ? mergeSettings(base[k], v) : v;
    if (next === base[k] && k in base) continue;
    (out ??= { ...base })[k] = next;
  }
  return out || base;
}

// 안쪽까지 얼린다. 이 함수가 끝까지 얼린 묶음은 기억해 두고 건너뛴다(같이 쓰는 기본 묶음). 겉만 얼린 묶음도 안쪽까지 내려간다.
const deepFrozen = new WeakSet();
export function freezeSettings(S) {
  if (!S || typeof S !== 'object' || deepFrozen.has(S)) return S;
  deepFrozen.add(S); Object.freeze(S); for (const k of Object.keys(S)) freezeSettings(S[k]);
  return S;
}

// 모드 정의 목록 검사: id 중복 · 없는 부모 · 순환 · 상속 깊이. basic 은 부모가 없고, from 을 안 적으면 basic.
export function validateModeDefinitions(defs, { root = 'basic', maxDepth = 2 } = {}) {
  const byId = new Map();
  for (const d of defs) {
    if (!d || typeof d.id !== 'string' || !d.id) throw new Error('모드 정의에 id 가 없음');
    if (byId.has(d.id)) throw new Error(`${d.id}: 모드 id 중복`);
    if (d.id === root && d.from != null) throw new Error(`${root}: 기본 모드는 부모가 없음`);
    if (d.settings !== undefined && !isPlain(d.settings)) throw new Error(`${d.id}: settings 는 평범한 객체`);
    validateSettings(d.settings || {}, `${d.id}.settings`);
    byId.set(d.id, d);
  }
  if (!byId.has(root)) throw new Error(`${root}: 기본 모드가 없음`);
  const parent = d => d.id === root ? null : d.from ?? root;
  for (const d of defs) {
    const chain = [d.id];
    for (let p = parent(d); p != null; p = parent(byId.get(p))) {
      if (!byId.has(p)) throw new Error(`${d.id}: 없는 부모 모드 ${p}`);
      if (chain.includes(p)) throw new Error(`${d.id}: 상속 순환 ${[...chain, p].join(' → ')}`);
      chain.push(p);
    }
    if (chain.length - 1 > maxDepth) throw new Error(`${d.id}: 상속이 너무 깊음 (${chain.reverse().join(' → ')})`);
  }
  return byId;
}
