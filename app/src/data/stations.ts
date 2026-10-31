// 역 목록: 앱에 실린 지도 페이지(index.html)의 stationData 를 읽는다(지도와 같은 자료 · 복사하지 않는다). 검색 규칙은 web/ui/search.mts 와 같다.
import type { StationInfo } from '../map/bridge';
import { MAP_ORIGIN, startMapServer } from '../map/source';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function stationOf(value: unknown): StationInfo | null {
  if (!isRecord(value) || !Array.isArray(value.lines)) return null;
  const { id, name, lat, lon } = value;
  if (typeof id !== 'number' || typeof name !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') return null;
  const lines = value.lines.flatMap((line: unknown) => (isRecord(line) && typeof line.name === 'string' ? [line.name] : []));
  return { id, name, lat, lon, lines };
}

let loading: Promise<StationInfo[]> | null = null;

// 한 번만 받아 기억한다. 실패하면 기억하지 않아 다음에 다시 시도한다
export function loadStations(): Promise<StationInfo[]> {
  loading ??= (async () => {
    await startMapServer();
    const response = await fetch(`${MAP_ORIGIN}/index.html`);
    const found = /<script id="stationData" type="application\/json">([\s\S]*?)<\/script>/.exec(await response.text());
    const list: unknown = found?.[1] ? JSON.parse(found[1]) : null;
    if (!Array.isArray(list)) throw new Error('역 자료를 찾지 못했어요');
    return list.flatMap((item: unknown) => stationOf(item) ?? []);
  })().catch((error: unknown) => { loading = null; throw error; });
  return loading;
}

// 끝 "역" 떼기 · 같음 0 / 앞 1 / 나머지 2 · 이름 길이 · 8개
export function searchStations(stations: StationInfo[], text: string): StationInfo[] {
  const query = text.trim().replace(/역$/, '');
  if (!query) return [];
  const rank = (station: StationInfo) => {
    if (station.name === query) return 0;
    return station.name.startsWith(query) ? 1 : 2;
  };
  return stations
    .filter((station) => station.name.includes(query))
    .sort((left, right) => rank(left) - rank(right) || left.name.length - right.name.length)
    .slice(0, 8);
}
