// 장소 검색의 순수 셈: 역 찾기 · 역과 카카오 장소를 한 목록으로 합치기 · 시각을 가까운 5분으로 맞추기. 화면 · 요청은 lib/journey-ui.mts.
export interface PlaceLine { name:string; color:string }
// 목록 한 줄. lines 가 있으면 역(노란 칸 · 노선 칩), 없으면 장소(핀 칸 · 주소)
export interface PlaceHit { name:string; address?:string; lat:number; lng:number; lines?:PlaceLine[]; stationId?:number; metres?:number }
export interface SearchableStation { id?:number; name:string; lat:number; lon:number; lines:readonly { name:string }[] }
export interface FoundPlace { name:string; address?:string; lat:number; lng:number }

const STATION_LIMIT = 8;
const FALLBACK_LINE_COLOR = '#52646a';
// 같은 역으로 보는 거리: 큰 환승역은 출입구까지 수백 m 라 카카오 좌표가 역 자료와 이만큼 떨어질 수 있다(내부 구현값)
const SAME_STATION_METRES = 500;
const METRES_PER_DEGREE = 111320;
const RAD = Math.PI / 180;

// 찾는 말: 끝의 '역'은 뗀다(강남역 → 강남)
export const stationQuery = (query:string) => query.trim().replace(/역$/, '');

// 옛 역 검색과 같은 차례: 이름이 같은 역 → 그 말로 시작 → 그 말을 포함, 그 안에서는 이름이 짧은 순(서울 → 서울역 먼저, 서울대입구 나중)
export function findStations(stations:readonly SearchableStation[], query:string, colors:Record<string, string>):PlaceHit[] {
  const wanted = stationQuery(query);
  if (!wanted) return [];
  const rank = (station:SearchableStation) => { if (station.name === wanted) return 0; return station.name.startsWith(wanted) ? 1 : 2; };
  return stations.filter(station => station.name.includes(wanted))
    .sort((one, other) => rank(one) - rank(other) || one.name.length - other.name.length).slice(0, STATION_LIMIT)
    .map(station => ({name: station.name, lat: station.lat, lng: station.lon, lines: station.lines.map(line => ({name: line.name, color: colors[line.name] || FALLBACK_LINE_COLOR})), ...(station.id === undefined ? {} : {stationId: station.id})}));
}

export function metresBetween(one:{ lat:number; lng:number }, other:{ lat:number; lng:number }) {
  const shrink = Math.cos((one.lat + other.lat) / 2 * RAD);
  return Math.hypot((one.lng - other.lng) * METRES_PER_DEGREE * shrink, (one.lat - other.lat) * METRES_PER_DEGREE);
}

// 그 역의 노선이거나, 역 자료에 없는 철도 이름인가(「강남역 어선」 같은 가게 이름은 아니다)
const RAILWAY_NAMES = new Set(['공항철도', 'KTX', 'SRT', 'ITX', 'ITX-새마을', 'ITX-마음', 'ITX-청춘', 'GTX-A', '경부선', '경의선', '분당선', '수인선', '중앙선']);
function isLineName(word:string, station:PlaceHit) {
  return RAILWAY_NAMES.has(word.toUpperCase()) || !!station.lines?.some(line => line.name === word);
}

// 카카오 결과가 이 역 자체인가: 이름이 역 이름으로 시작하고 뒤에 노선 이름만 남으며(「강남역 2호선」 · 「서울역 KTX」) 가깝다.
// 뒤에 다른 말이 있으면(「강남역 스타벅스」) 역 근처의 다른 곳이라 남긴다
function isStationItself(place:FoundPlace, station:PlaceHit) {
  if (!place.name.startsWith(station.name)) return false;
  const rest = place.name.slice(station.name.length).replace(/^역/, '').trim();
  if (rest && !rest.split(/\s+/).every(word => isLineName(word, station))) return false;
  return metresBetween(place, station) <= SAME_STATION_METRES;
}

const squeezed = (text:string) => text.replace(/\s+/g, '');
// 한 목록: 역 먼저, 그 뒤에 역과 겹치지 않는 장소.
// query 를 주면 장소 중 이름에 그 말이 든 곳을 앞으로(나머지 차례는 받은 그대로), here 를 주면 장소마다 거기서의 거리(metres)를 단다
export function mergeHits(stationHits:readonly PlaceHit[], places:readonly FoundPlace[], {query = '', here = null}:{ query?:string; here?:{ lat:number; lng:number } | null } = {}):PlaceHit[] {
  const wanted = squeezed(query), named = (place:FoundPlace) => wanted && squeezed(place.name).includes(wanted) ? 0 : 1;
  const others = places.filter(place => !stationHits.some(station => isStationItself(place, station))).sort((one, other) => named(one) - named(other));
  return [...stationHits, ...others.map(({name, address, lat, lng}) => ({name, lat, lng, ...(address ? {address} : {}), ...(here ? {metres: metresBetween(here, {lat, lng})} : {})}))];
}

// 거리 글자: 1 km 안은 10 m 단위, 그 밖은 km 한 자리
export function distanceText(metres:number) {
  const rounded = Math.round(metres / 10) * 10;
  return rounded < 1000 ? `${rounded}m` : `${(metres / 1000).toFixed(1)}km`;
}

// 출발과 도착을 같은 곳으로 보는 거리(내부 구현값)
const SAME_SPOT_METRES = 30;
export const sameSpot = (one:{ lat:number; lng:number }, other:{ lat:number; lng:number }) => metresBetween(one, other) <= SAME_SPOT_METRES;

// 노선 색 위 글자 색: 대비 4.5 를 넘는 흰 글자, 안 되면 어두운 글자(수인분당, 에버라인…). 둘 다 못 넘는 중간 밝기(7호선)만 검정(#141414 ≈ L .007)
export const inkOn = (hex:string) => { const value = parseInt(String(hex).slice(1), 16); if (Number.isNaN(value)) return '#fff';
  const [red, green, blue] = [value >> 16, value >> 8 & 255, value & 255].map(channel => { const unit = channel / 255; return unit <= .03928 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4; }) as [number, number, number];
  const light = .2126 * red + .7152 * green + .0722 * blue;
  if (1.05 / (light + .05) >= 4.5) return '#fff';
  return (light + .05) / .057 >= 4.5 ? '#141414' : '#000'; };

// 경로의 끝으로 쓸 이름: 역은 '역'을 붙인다(역 시트에서 고를 때와 같다)
export const endName = (hit:PlaceHit) => hit.lines && !/역$/.test(hit.name) ? `${hit.name}역` : hit.name;

// 'HH:MM' → 가까운 5분. 발권 시각 바퀴가 5분 단위다(23:58 → 00:00)
const clockText = (total:number) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
export function nearestFive(time:string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return clockText(Math.round((hours * 60 + minutes) / 5) * 5);
}
// 승차권 등록 시각: 가까운 5분. 오늘 경로인데 그 시각이 이미 지났으면 지금 기준 다음 5분으로 올린다 — 지난 시각은 다음 탈 날(내일)로 찾게 되어 길이 달라진다.
// 같은 분도 지난 것으로 본다(nextRideDay 와 같은 기준). 내일로 고른 경로는 시계만 봐서는 지난 것이 아니니 올리지 않는다
export function ticketTime(leaveBy:string, now:Date, tomorrow:boolean) {
  const nearest = nearestFive(leaveBy);
  if (tomorrow) return nearest;
  const [hours = 0, minutes = 0] = leaveBy.split(':').map(Number);
  const rounded = Math.round((hours * 60 + minutes) / 5) * 5, nowTotal = now.getHours() * 60 + now.getMinutes();
  return rounded <= nowTotal ? clockText(Math.floor(nowTotal / 5) * 5 + 5) : nearest;
}

// 출발 · 도착 맞바꾸기. start 는 지금 출발 좌표(내 위치면 그 순간의 좌표) — 내 위치가 출발로 돌아오면 좌표를 들고 있지 않고 다시 지금 위치를 쓴다
interface SpotEnd { lat:number; lng:number }
export function swappedEnds<End extends SpotEnd>(names:{ from:string; to:string }, picked:{ from:End | null; to:End | null }, start:SpotEnd | null, hereName:string) {
  return {
    names: {from: names.to, to: names.from},
    picked: {from: names.to === hereName ? null : picked.to, to: start ? {...start, name: names.from} : null},
  };
}
