// 로그인 부품: 서랍 맨 위 로그인 단추. 첫 화면 코드라 로그인 팝업(login_sheet.tsx)과 나눠 둔다. 누름 · 숨김은 화면(user/account.mts)이 #loginOpen 을 찾아 건다
export const LoginButton = () => <button id="loginOpen" class="login-open" type="button" aria-haspopup="dialog" aria-controls="loginSheet">
  <span class="account-avatar face" aria-hidden="true"></span><span class="login-open-name">로그인</span>
  <svg class="login-open-go" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>
</button>;
