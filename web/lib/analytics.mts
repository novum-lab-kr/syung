// 구글 애널리틱스(GA4) — 운영 지도 주소의 웹에서만 켠다. 앱 지도(#app) · 개발 · 로컬 주소에서는 Google 스크립트를 부르지 않는다.
// 측정 ID 는 페이지에 드러나는 공개 값이다(비밀값 아님). 방침은 web/privacy.html 3 · 6절 — 보내는 것이 바뀌면 같이 고친다.
// 보내는 이벤트는 셋뿐: route_search(값 없음) · mode_change(mode) · login(method).
// 위치 · 역 이름 · 검색어 · 출발지 · 도착지 · 회원 식별값은 보내지 않는다 — 이벤트 안의 다른 값은 읽지 않는다.
// 다른 코드는 이 파일을 부르지 않고 이벤트(syung:route · syung:mode · syung:login)만 낸다: 분석 쪽 오류가 지도 동작으로 번지지 않는다.
import {appMapMode} from './server_url.mts';

const MEASUREMENT_ID = 'G-PV1KC7LCL6';
const MAP_HOST = 'map.syung.novum-lab.com';
const LOGIN_METHODS = new Set(['kakao', 'google', 'apple']);   // server/services/login_providers.py 의 이름

// 이 파일이 쓰는 window 칸(시험은 가짜를 넘긴다)
export interface AnalyticsPage {
  location:{ hostname:string; origin:string; pathname:string };
  document:{ head:{ appendChild(node:unknown):unknown }; createElement(tag:'script'):{ async:boolean; src:string } };
  dataLayer?:unknown[];
  addEventListener(type:string, listener:(event:Event) => void, options?:{ once:boolean }):void;
  requestIdleCallback?:(callback:() => void, options:{ timeout:number }) => unknown;
  setTimeout(callback:() => void, delay:number):unknown;
}

export function analyticsAllowed(hostname:string, app:boolean):boolean {
  return !app && hostname === MAP_HOST;
}

function detailOf(event:Event):unknown {
  return (event as CustomEvent<unknown>).detail;
}

// 켜졌으면 true. 실패해도 던지지 않는다(분석이 지도를 막지 않는다)
export function startAnalytics(page:AnalyticsPage = window as unknown as AnalyticsPage, app:boolean = appMapMode()):boolean {
  if (!analyticsAllowed(page.location.hostname, app)) return false;
  try {
    const layer = page.dataLayer ??= [];
    // gtag.js 는 arguments 객체를 그대로 받아야 한다(배열로 넣으면 읽지 않는다)
    const gtag = function (..._args:unknown[]) { layer.push(arguments); };
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
      page_location: page.location.origin + page.location.pathname,   // 주소 뒤(#login=… · 점검용 표시)는 보내지 않는다
      allow_google_signals: false,   // 광고 기능을 쓰지 않는다(방침 6절)
      allow_ad_personalization_signals: false,
    });

    page.addEventListener('syung:route', () => gtag('event', 'route_search'));
    page.addEventListener('syung:mode', event => {
      const mode = detailOf(event);
      if (typeof mode === 'string') gtag('event', 'mode_change', {mode});
    });
    page.addEventListener('syung:login', event => {
      const method = detailOf(event);
      if (typeof method === 'string' && LOGIN_METHODS.has(method)) gtag('event', 'login', {method});
    });

    // 첫 화면을 받는 동안 대역폭을 나눠 쓰지 않게 다 받은 뒤 쉴 때 부른다. 그 전의 이벤트는 dataLayer 에 쌓였다가 같이 나간다
    const load = () => {
      const loader = page.document.createElement('script');
      loader.async = true;
      loader.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      page.document.head.appendChild(loader);
    };
    page.addEventListener('load', () => {
      if (page.requestIdleCallback) page.requestIdleCallback(load, {timeout: 4000});
      else page.setTimeout(load, 1500);
    }, {once: true});
    return true;
  } catch {
    return false;
  }
}
