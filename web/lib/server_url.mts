// 서버 주소 한 곳: 웹은 지금처럼 이 페이지와 같은 곳(상대 주소 그대로), 앱 지도 모드(#app — index.html 이 html[data-app=map])는 운영 서비스 주소.
// 앱은 지도 빌드(dist/web)를 앱 묶음 안에서 띄운다(계획서 D5) — 상대 주소는 앱 안 파일을 가리키니 실시간 · API · 서버가 내는 자료(선로 모양 · 시간표 학습 · 출구 · 버스)는 여기로 부른다.
// 옛 주소(syung.novum-lab.com)의 /api 308 넘기기에 기대지 않는다(계획서 "공통 스펙" — 2026-10-30 도메인 분리).
// 모듈을 읽을 때 document 를 만지지 않는다(Node 시험이 이 파일을 부르는 모듈을 읽는다) — 부를 때마다 본다.
export const APP_SERVER_ORIGIN = 'https://map.syung.novum-lab.com';

// 앱 지도 모드인가(index.html 의 첫 스크립트가 주소 #app 을 보고 붙인 표시)
export function appMapMode():boolean {
  return globalThis.document?.documentElement?.dataset.app === 'map';
}

// path: 지금 코드가 쓰는 주소 그대로('./api/live?…' · '/data/bus/routes.json' · './edge_times.json'). 앱 지도 모드면 운영 서비스 주소에 붙인다
export function serverUrl(path:string, app:boolean = appMapMode()):string {
  if (!app || /^[a-z][a-z0-9+.-]*:/i.test(path)) return path;   // 웹 · 이미 온전한 주소(https: · data: · blob:)는 그대로
  return `${APP_SERVER_ORIGIN}/${path.replace(/^\.?\//, '')}`;
}
