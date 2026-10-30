// 지도 아래 길찾기 단추 「어디로 갈까요?」.
// 스토리에서만 쓴다 — 첫 화면에 바로 보여야 해서 화면은 index.html 의 정적 HTML 이고, 누르기는 lib/journey-ui.mts 가 id 로 찾아 건다.
// index.html 의 #routeButton 을 고치면 여기도 같이 고친다(같은 글자인지 tests/static_shell.test.mjs 가 본다).

export const RouteButton = () =>
  <button id="routeButton" class="route-cta" type="button"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></svg><span>어디로 갈까요?</span></button>;
