// 디자인 토큰 창구: 웹 생성물(web/tokens/tokens.mts)을 복사 없이 그대로 다시 내보낸다. 색 · 크기 · 간격 · 둥글기는 여기서만 가져온다.
// 그림자(shadow)는 CSS 글자 그대로 RN boxShadow 에 넣는다(새 구조에서 받는다). radius.circle 은 "50%" 글자라 숫자 자리에는 지름/2 를 쓴다.
import { tokens, type Tokens } from '../../../web/tokens/tokens.mts';

export { tokens, type Tokens };

// 토큰에 아직 없고 web/syung.css · index.html 에 글자로만 있는 값 — 웹과 같게 보이려고 여기 한 곳에 모은다(토큰으로 올리면 지운다).
export const webLiterals = {
  mastDark: '#1b1c1f',          // html[data-theme=dark] .mast
  identityLight: '#5b4c00',     // .identity p
  identityDark: '#c9c2a0',      // html[data-theme=dark] .identity p
  placeholder: '#66777c',       // .search input::placeholder
  switchOffDark: '#3a3c40',     // html[data-theme=dark] .switch
  knob: '#ffffff',              // .switch:after
  exitBackground: '#ffd200',    // .station-sheet .exit
  exitInk: '#1d1d1d',           // .station-sheet .exit
  chipEdge: '#ccd4d5',          // 역 시트 노선 칩 테두리(운영 화면 계산값 — 두 테마 같음)
  chipInk: '#ffffff',           // .search-list i
  lineFallback: '#52646a',      // 노선 색을 모를 때(본체 colors[…]||'#52646a') — 노선 색은 다리 A1 로 받고 앱에 복사하지 않는다
} as const;
