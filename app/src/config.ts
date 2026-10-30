// 앱이 부르는 서버 주소 한 곳(계획서 "공통 스펙" — 서비스 주소 map. · 옛 주소의 308 넘기기에 기대지 않는다).
// 웹 지도 쪽은 web/lib/server_url.mts APP_SERVER_ORIGIN 이 같은 값을 쓴다 — 바꾸면 둘 다 바꾼다.
export const SERVER_ORIGIN = 'https://map.syung.novum-lab.com';

// 앱 안 지도 서버(modules/map-server) 포트 — 127.0.0.1 에서만 받는다. 지도 출처가 http://127.0.0.1:<이 값> 이 되고
// 운영 서버 CORS 가 그 출처 하나만 연다 — 바꾸면 서버 쪽(syung-be)도 같이 바꾼다.
export const MAP_PORT = 38127;
