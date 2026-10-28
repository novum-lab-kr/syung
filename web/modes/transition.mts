// 모드 전환: 지금 모드 · 원하는 모드 · 마지막 요청 번호 · 롤코 배속과 앞서 달린 시간(warp)의 주인. 본체는 flags(simcity · joseon · starcraft · coaster)로 읽는다.
// 전환 순서 계약: ① 준비(prepare — 모드 코드 · 롤코 건물 받기, 이미 있으면 바로) → ② 아직 마지막 요청인지 확인 → ③ 바꾸기(commit, 동기)
// → ④ 이전 모드 정리(commit 안, 옛 상태를 읽을 수 있는 동안). 준비만으로는 화면 · 상태를 바꾸지 않는다. 늦게 온 옛 요청의 성공 · 실패는 아무것도 바꾸지 않는다.
// 준비 실패는 처리되지 않은 rejection 을 남기지 않는다(마지막 요청이면 onFail 로 버튼을 지금 모드로 되돌린다).
// 다른 화면 파일을 import 하지 않는다: 준비 · 바꾸기 · 버튼은 본체가 넘긴다.
import type { Settings } from './merge.mts';

// 모드 목록(web/modes/index.mts createModeRegistry)에서 이 파일이 쓰는 것
export interface ModeRegistry { has(id: string): boolean; settings(id: string, user?: unknown): Settings }
export interface SwitchOptions { speed?: number }
export interface ModeControllerOptions {
  registry: ModeRegistry;
  // 준비: 이미 되어 있으면 true, 아니면 끝나면 풀리는 약속(실패면 reject)
  prepare(id: string, current: string): true | PromiseLike<unknown>;
  commit(from: string, to: string, options: SwitchOptions): void;
  onRequest?(id: string, current: string): void;
  onFail?(current: string, error: unknown): void;
  clock(): number;
  root?: string;
}
export const STARCRAFT = Object.freeze(['terran', 'zerg', 'protoss']);   // 스타크래프트 종족 모드(web/modes/starcraft)
export const NATIONS = Object.freeze(['greece', 'netherlands', 'paris', 'egypt']);   // 나라 모드(web/modes/nations) — 차례대로 더한다
export const CITY_FAMILY = Object.freeze(['simcity', 'joseon', 'retro', ...STARCRAFT, ...NATIONS]);   // 심시티 도시 위의 모드(심시티 스위치 · 조선 · 레트로 · 종족 · 나라) — 서로 바꿀 때 롤코처럼 끄고 켜지 않는다
export function createModeController({ registry, prepare, commit, onRequest = () => {}, onFail = () => {}, clock, root = 'basic' }: ModeControllerOptions) {
  let current = root, desired = root, seq = 0, speed = 1, warp = 0, warpAt = 0, S = registry.settings(root);   // S: 지금 모드의 설정(자주 묻는다 — 바뀔 때만 고른다)

  // 모드 요청. 준비가 이미 끝났으면 지금 바로(동기) 바꾸고 true, 기다려야 하면 Promise(바꿨으면 true, 늦었거나 실패면 false — reject 하지 않는다).
  function request(id: string, { speed: sp }: SwitchOptions = {}): boolean | Promise<boolean> {
    if (!registry.has(id)) throw new Error(`${id}: 없는 모드`);
    const my = ++seq; desired = id; onRequest(id, current);
    const go = () => { if (my !== seq) return false; commit(current, id, { speed: sp }); current = id; S = registry.settings(id); desired = id; return true };
    let ready: true | PromiseLike<unknown>; try { ready = prepare(id, current) } catch (e) { ready = Promise.reject(e) }
    if (ready === true) return go();
    return Promise.resolve(ready).then(go, e => { if (my === seq) { desired = current; onFail(current, e) } return false })
      .catch(e => { console.error('mode: switch failed', e); return false });   // 바꾸기 중 오류: 기다리는 쪽이 없어도 처리된 것으로(동기로 바꿀 때는 그대로 던진다)
  }
  // 받는 중인 요청만 거두기: 지금 모드는 그대로(바꾸기 없음), 늦게 온 준비는 버린다
  function cancel() { seq++; desired = current; onRequest(current, current) }
  // 바꾸기(commit) 안에서만: 지금 모드를 옮긴다. 옛 코드가 거치던 중간 상태(롤코 → 기본 → 심시티)도 그대로 거친다(그사이 그리기는 없다 — 동기)
  function enter(id: string): void { if (!registry.has(id)) throw new Error(`${id}: 없는 모드`); current = id; S = registry.settings(id) }
  // 롤코 배속(1 · 5 · 20): 1 이면 앞서 달린 시간을 지우고, 아니면 지금까지를 새 배속으로 셈한다(옛 식 그대로 — 바꾼 순간까지의 몫도 새 배속)
  function setSpeed(s: number): void { speed = s; if (speed === 1) { warp = 0; warpAt = 0 } else warpNow() }
  function warpNow(): number { const t = clock(); if (t < warpAt) return warp; if (warpAt) warp += (t - warpAt) / 1000 * (speed - 1); warpAt = t; return warp }

  const flags = Object.freeze({
    get simcity() { return CITY_FAMILY.includes(current) },   // 조선 · 스타크래프트 종족도 심시티(같은 도시 · 고가 · x-ray)
    get joseon() { return current === 'joseon' },
    get starcraft() { return STARCRAFT.includes(current) },   // 스타크래프트(종족 셋 중 하나)
    get coaster() { return current === 'coaster' },
  });
  return {
    request, cancel, enter, setSpeed, warpNow, flags,
    get current() { return current }, get desired() { return desired }, get speed() { return speed }, get seq() { return seq },
    settings: (user?: unknown): Settings => user == null ? S : registry.settings(current, user),
  };
}
