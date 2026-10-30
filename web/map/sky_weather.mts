// 메뉴 하늘 그림의 날씨 층 — 정지 조각(가림막 · 해/달 가리는 구름 · 쌓인 눈) · 기온 글 · 어떤 장면을 틀지 · /api/weather 받기(10분 캐시).
// 움직이는 것(구름 · 비 · 눈 · 낙뢰 · 지하철)은 Lottie 장면이라 sky_motion.mts 가 맡는다. 첫 화면에서는 받지 않는다:
// theme.mts 가 메뉴를 열 때 import() 로 부른다. 개발용 칸: 주소 끝 ?weather=rain&temp=12 (localhost 에서만 — 운영에서는 안 먹는다).

import { serverUrl } from '../lib/server_url.mts';   // 앱 지도 모드면 운영 서비스 주소로
export type SkyCover = 'clear' | 'cloudy' | 'overcast';   // 맑음 · 구름 많음 · 흐림
export type Precip = 'none' | 'rain' | 'rain_snow' | 'snow' | 'drizzle' | 'sleet_drizzle' | 'flurry';
// /api/weather 응답 가운데 이 파일이 읽는 칸
export interface Weather { tempC:number | null; sky:SkyCover; precip:Precip; rainMm:number; windMs:number; lightning:boolean }
// 틀 장면(web/brand/sky-<이름>.json): clouds = 구름 겹, fall = 떨어지는 것
export interface Scene { clouds:'cloudy' | 'overcast' | 'storm' | null; fall:'drizzle' | 'rain' | 'heavyrain' | 'snow' | 'flurry' | 'sleet' | 'storm' | null }
// cover: 해 · 달이 보이는 정도 — clear 그대로 · half(구름 많음: 구름 사이로 반쯤) · hidden(흐림 · 비 · 눈 · 낙뢰: 아래쪽 절반쯤을 구름이 덮어 구름 뒤에 숨은 모습 — 비 · 눈이면 아쉬운 표정)
// back: 하늘색을 흐리는 가림막 · over(x, y): 해 · 달 자리에 얹는 구름(theme.mts 가 해 · 달 위치를 알려 준다)
// pile(지붕 [x, 너비, 윗면 y], 땅 y): 눈이 지붕 · 땅에 쌓인 모양(눈 올 때만) · scene: 틀 장면 · wet: 비 · 눈이 온다
export interface WeatherArt {
  back:string; temp:string; label:string; cover:'clear' | 'half' | 'hidden'; wet:boolean; scene:Scene;
  over:(x:number, y:number) => string; pile:(roofs:[number, number, number][], ground:number) => string;
}

const W = 320, H = 110;   // 하늘 SVG 와 같은 viewBox
const SEOUL: [number, number] = [37.5665, 126.978];   // 시청 근처(위치를 허락하지 않았을 때)
const CACHE_MS = 10 * 60 * 1000;

const SKY_NAME: Record<SkyCover, string> = { clear: '맑음', cloudy: '구름 많음', overcast: '흐림' };
const PRECIP_NAME: Record<Precip, string> = { none: '', rain: '비', rain_snow: '진눈깨비', snow: '눈', drizzle: '빗방울', sleet_drizzle: '진눈깨비', flurry: '눈날림' };

const f = (value:number) => value.toFixed(1);

export function weatherLabel(w:Weather):string {
  const parts = [PRECIP_NAME[w.precip] || SKY_NAME[w.sky]];
  if (w.lightning) parts.unshift('낙뢰');
  if (w.tempC !== null) parts.push(`${Math.round(w.tempC)}도`);
  return parts.join(' ');
}

// 날씨로 장면 고르기: 낙뢰 > 비 · 눈 종류 > 구름. 비 · 눈 · 낙뢰가 오면 하늘 값과 상관없이 두꺼운 구름(예보 어긋남 방지)
export function sceneFor(w:Weather):Scene {
  const wet = w.precip !== 'none';
  const sky = wet || w.lightning ? 'overcast' : w.sky;
  const clouds = sky === 'clear' ? null : sky;
  if (w.lightning) return { clouds: 'storm', fall: 'storm' };   // 큰비 · 낙뢰는 짙은 회청색 구름
  if (w.precip === 'rain' && w.rainMm >= 10) return { clouds: 'storm', fall: 'heavyrain' };
  if (w.precip === 'rain') return { clouds, fall: 'rain' };
  if (w.precip === 'drizzle') return { clouds, fall: 'drizzle' };
  if (w.precip === 'snow') return { clouds, fall: 'snow' };
  if (w.precip === 'flurry') return { clouds, fall: 'flurry' };
  if (w.precip === 'rain_snow' || w.precip === 'sleet_drizzle') return { clouds, fall: 'sleet' };
  return { clouds, fall: null };
}

// 하늘 그림의 구름과 같은 모양(동그라미 셋 + 바닥) · 얇은 테두리 — 해 · 달을 가리는 정지 구름용
const OUTLINE = (night:boolean) => night ? '#8a93c8' : '#8fa6c4';
function cloudParts(fill:string, night:boolean, opacity:number):string {
  return `<g fill="${fill}" stroke="${OUTLINE(night)}" stroke-width="1" opacity="${opacity}"><circle cx="0" cy="0" r="7"/><circle cx="9" cy="-4" r="9"/><circle cx="19" cy="0" r="7"/><rect x="0" y="0" width="19" height="7" rx="3.5"/></g><g fill="${fill}" opacity="${opacity}"><rect x="0" y="-.5" width="19" height="7.5" rx="3.5"/></g>`;   // 바닥 안쪽 선은 덮는다
}

// 해 · 달 자리를 덮는 구름: half 는 한쪽이 가려지고, hidden 은 통째로 가려진다(안 움직인다 — 자리가 늘 같게)
function sunCover(cover:'clear' | 'half' | 'hidden', night:boolean, wet:boolean, dark:boolean) {
  return (x:number, y:number):string => {
    if (cover === 'clear') return '';
    const place = (dx:number, dy:number, scale:number, fill:string, opacity:number) => `<g transform="translate(${f(x + dx)} ${f(y + dy)}) scale(${scale})">${cloudParts(fill, night, opacity)}</g>`;
    if (cover === 'half') return place(-3, 14, .9, night ? '#6d76a8' : '#f4f8fc', .95);   // 구름 많음: 해 · 달 70% 이상 보이고 아래 가장자리만 살짝
    const fill = night ? (dark ? '#3a4170' : '#4b5382') : dark ? '#6f7b8c' : wet ? '#8e99a8' : '#aab5c3';
    return place(-26, 15, 1.1, fill, .98) + place(8, 16, 1.1, fill, .98) + place(-13, 19, 1.35, fill, .98);   // 구름 뒤에 숨은 모습: 얼굴 윗부분 · 눈은 보이고 아래쪽 절반쯤을 덮는다
  };
}

// 쌓인 눈: 지붕 위 하얀 모자 · 땅 위 하얀 둔덕(움직이지 않는다)
function pileOfSnow(roofs:[number, number, number][], ground:number, night:boolean, amount:number):string {
  const stroke = night ? '#9aa6e0' : '#8fb4dc';
  const caps = roofs.map(([x, width, top]) => `<rect x="${x - 1}" y="${top - 2.5 * amount}" width="${width + 2}" height="${3 * amount}" rx="1.5"/>`).join('');
  let bumps = `M0 ${ground}`;
  for (let at = 0; at < W; at += 20) bumps += `q10 ${-3 * amount} 20 0`;
  return `<g fill="#ffffff" stroke="${stroke}" stroke-width=".8">${caps}<path d="${bumps}L${W} ${ground + 2}L0 ${ground + 2}Z"/></g>`;
}

export function weatherArt(w:Weather, night:boolean):WeatherArt {
  const wet = w.precip !== 'none';
  const scene = sceneFor(w);
  const snowy = w.precip === 'snow' || w.precip === 'rain_snow' || w.precip === 'flurry' || w.precip === 'sleet_drizzle';
  const amount = w.precip === 'snow' ? 1.3 : w.precip === 'rain_snow' ? .8 : .6;
  const cover = scene.clouds === null ? 'clear' : scene.clouds === 'cloudy' ? 'half' : 'hidden';
  // 하늘색이 흐려진다: 구름 많음은 살짝, 흐림 · 비 · 눈은 회색 쪽으로(밤은 더 어둡게)
  const stormy = scene.clouds === 'storm', heavy = scene.clouds === 'overcast' || stormy;
  const veilColor = night ? '#0e1230' : stormy ? '#3b4656' : heavy ? (wet ? '#5d6877' : '#6f7b8a') : '#9aa7b5';
  const veilOpacity = night ? (stormy ? .5 : heavy ? (wet ? .36 : .3) : .14) : stormy ? .68 : heavy ? (wet ? .55 : .48) : .16;
  return {
    cover, wet, scene, over: sunCover(cover, night, wet, stormy),
    pile: (roofs, ground) => snowy ? pileOfSnow(roofs, ground, night, amount) : '',
    back: scene.clouds === null ? '' : `<rect width="${W}" height="${H}" fill="${veilColor}" opacity="${veilOpacity}"/>`,
    temp: w.tempC === null ? '' : `${Math.round(w.tempC)}°`,
    label: weatherLabel(w),
  };
}

// ---- 받기 ----------------------------------------------------------------------------------
// 개발용: localhost 에서 주소 끝 ?weather=… 로 가짜 날씨(운영 호스트에서는 읽지 않는다)
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DEV_KINDS: Record<string, Partial<Weather>> = {
  clear: {}, cloudy: { sky: 'cloudy' }, overcast: { sky: 'overcast' },
  rain: { sky: 'overcast', precip: 'rain', rainMm: 3 }, heavyrain: { sky: 'overcast', precip: 'rain', rainMm: 12 },
  drizzle: { sky: 'overcast', precip: 'drizzle', rainMm: .3 }, snow: { sky: 'overcast', precip: 'snow' }, flurry: { sky: 'cloudy', precip: 'flurry' },
  sleet: { sky: 'overcast', precip: 'rain_snow', rainMm: 1 }, sleetdrizzle: { sky: 'overcast', precip: 'sleet_drizzle', rainMm: .3 },
  storm: { sky: 'overcast', precip: 'rain', rainMm: 12, lightning: true },
};
function devParams():URLSearchParams | null {
  if (typeof location === 'undefined' || !DEV_HOSTS.has(location.hostname)) return null;
  return new URLSearchParams(location.search);
}
export function devWeather():Weather | null {
  const params = devParams(), kind = params?.get('weather');
  if (!params || !kind || !(kind in DEV_KINDS)) return null;
  const temp = params.get('temp'), mm = params.get('mm'), wind = params.get('wind');
  const base:Weather = { tempC: temp === null ? 12 : Number(temp), sky: 'clear', precip: 'none', rainMm: 0, windMs: wind === null ? 2 : Number(wind), lightning: false, ...DEV_KINDS[kind] };
  return mm === null ? base : { ...base, rainMm: Number(mm) };
}
// 개발용 낮 · 밤 고정: ?night=1 / ?night=0 (없으면 null)
export function devNight():boolean | null {
  const value = devParams()?.get('night');
  return value === '1' ? true : value === '0' ? false : null;
}

interface WeatherReply { ok?:boolean; tempC?:number | null; sky?:string; precip?:string; rainMm?:number; windMs?:number; lightning?:boolean }
function readReply(reply:WeatherReply):Weather | null {
  if (!reply.ok) return null;
  const sky = reply.sky === 'cloudy' || reply.sky === 'overcast' ? reply.sky : 'clear';
  const precip = reply.precip && reply.precip in PRECIP_NAME ? reply.precip as Precip : 'none';
  return { tempC: typeof reply.tempC === 'number' ? reply.tempC : null, sky, precip, rainMm: reply.rainMm ?? 0, windMs: reply.windMs ?? 0, lightning: !!reply.lightning };
}

let cache: { key:string; at:number; weather:Weather | null } | null = null;
// 날씨 한 번 받기: 같은 자리에서 10분 안이면 다시 안 묻는다. 위치가 없으면 서울. 실패하면 null(날씨 없음 — 오류 화면 없음)
export async function fetchWeather(here:[number, number] | null):Promise<Weather | null> {
  const dev = devWeather();
  if (dev) return dev;
  const [lat, lng] = here ? [here[1], here[0]] : SEOUL;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.weather;
  let weather:Weather | null = null;
  try {
    const response = await fetch(serverUrl(`./api/weather?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`), { cache: 'no-store' });
    if (response.ok) weather = readReply(await response.json() as WeatherReply);
  } catch { /* 날씨 없음 */ }
  cache = { key, at: Date.now(), weather };
  return weather;
}
