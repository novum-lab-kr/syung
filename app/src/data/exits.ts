// 출구: 서버의 exits.json(역 번호 → [경도, 위도, 출구 번호, 휠체어]) — 한 번 받아 기억 · 번호마다 한 칸(web/ui/popups.mts exitItems).
import { SERVER_ORIGIN } from '../config';

export interface ExitItem { ref: string; wheelchair: boolean }
type ExitTable = Record<string, unknown>;

let loading: Promise<ExitTable> | null = null;

function loadTable(): Promise<ExitTable> {
  loading ??= fetch(`${SERVER_ORIGIN}/exits.json`).then(async (response) => {
    const table: unknown = response.ok ? await response.json() : null;
    if (typeof table !== 'object' || table === null) throw new Error('출구 자료 없음');
    return table as ExitTable;
  }).catch((error: unknown) => { loading = null; throw error; });
  return loading;
}

export async function loadExits(stationId: number): Promise<ExitItem[]> {
  const list = (await loadTable())[String(stationId)];
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.flatMap((row: unknown) => {
    if (!Array.isArray(row)) return [];
    const ref = String(row[2] ?? '');
    if (!ref || seen.has(ref)) return [];
    seen.add(ref);
    return [{ ref, wheelchair: row[3] === 1 }];
  });
}
