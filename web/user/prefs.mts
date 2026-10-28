// 내 설정 창구: 지금은 이 기기(localStorage), 로그인 단계에서 계정 서버와 맞춘다(그때도 첫 화면은 이 기기 값으로 먼저 그린다).
// 허용 항목 · 값은 모드 목록의 USER_PREFERENCES(테마 auto · light · dark, 지도 색 calm · color) — 그 밖의 값은 읽어도 버리고 쓰지도 않는다.
// 저장 이름은 그대로(subway-theme · subway-map-color): index.html · admin/login.html · admin/learning.html 의 첫 그리기 전 스크립트도 같은 이름을 읽는다.
// 다른 화면 파일을 import 하지 않는다(본체가 만들어 테마에 넘긴다).
import { USER_PREFERENCES } from '../modes/index.mts';

export const PREF_KEYS = Object.freeze({ themeChoice: 'subway-theme', mapColor: 'subway-map-color', prebuild: 'subway-prebuild', saver: 'subway-saver' });
// 이 기기에만 두는 항목(모드 설정과 섞지 않는다): 도시 건물 미리 짓기 켬 · 끔(덕배 2026-10-12: 휴대폰 발열 비교 버튼, 없으면 휴대폰 끔 · 컴퓨터 켬)
// 절전: 켜면 움직임(열차 층 · 이름표 · 따라가기 · 버스)을 1초 20번으로 그린다(덕배 2026-10-23: 발열 · 배터리 — 기본은 꺼짐, 30번 그대로)
export const DEVICE_PREFERENCES = Object.freeze({ prebuild: Object.freeze(['on', 'off']), saver: Object.freeze(['on', 'off']) });

type PrefKey = keyof typeof PREF_KEYS;
// 항목마다 고를 수 있는 값
type Allowed = Partial<Record<string, readonly string[]>>;
// 기기 저장소(localStorage 와 같은 꼴 · 시험은 가짜를 넘긴다)
interface PrefStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface UserPrefsOptions { allowed?: Allowed; storage?: PrefStorage | null }
export interface UserPrefs { get(k: PrefKey): string | null; set(k: PrefKey, v: string): string; all(): Partial<Record<PrefKey, string>> }

export function createUserPrefs(opts: UserPrefsOptions = {}): UserPrefs {
  const allowed: Allowed = opts.allowed || { ...USER_PREFERENCES, ...DEVICE_PREFERENCES };
  let storage: PrefStorage | null | undefined = opts.storage; if (!('storage' in opts)) try { storage = globalThis.localStorage } catch { storage = null }   // localStorage 에 손대기만 해도 던지는 브라우저(막힌 사이트 자료)
  const ok = (k: string, v: string | null): v is string => !!allowed[k] && allowed[k].includes(v as string);
  const values: Partial<Record<PrefKey, string | null>> = {};
  for (const k of Object.keys(PREF_KEYS) as PrefKey[]) { let v = null; try { v = storage?.getItem(PREF_KEYS[k]) ?? null } catch { } values[k] = ok(k, v) ? v : null }   // 막힌 저장소(사생활 창 등)는 없는 것과 같다
  return {
    // 고른 값, 없으면 null(부르는 쪽이 모드 설정의 기본값을 쓴다)
    get: (k: PrefKey) => values[k] ?? null,
    // 허용된 값만 기억하고 기기에 쓴다(쓰기가 막혀도 이번 화면에서는 그 값)
    set(k: PrefKey, v: string) {
      if (!ok(k, v)) throw new Error(`${k}: 허용되지 않는 내 설정 ${v}`);
      values[k] = v; try { storage?.setItem(PREF_KEYS[k], v) } catch { }
      return v;
    },
    all: () => Object.fromEntries(Object.entries(values).filter(([, v]) => v != null)) as Partial<Record<PrefKey, string>>,
  };
}
