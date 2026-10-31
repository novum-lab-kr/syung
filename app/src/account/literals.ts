// 웹 web/syung.css · web/user/account.mts 에 글자로만 있고 토큰에 없는 값(승차권 색 · 소셜 단추 · 토큰에 없는 글자 크기 등).
// 웹과 같게 보이려고 회원 화면 안 여기 한 곳에 모은다. 주석은 그 값이 있는 웹 선택자 — 웹에서 토큰으로 올리면 여기서 지운다.
export const ticket = {
  face: '#ffe14d',          // .tk-face · .tf-time · .tw-band · .tw-ok · .tf-save
  back: '#ffe88a',          // .tk-back
  faceInk: '#655b24',       // .tk-face · .tk-map · .tk-edit · .tk-flip
  edgeShadow: '0 7px 14px rgba(170,140,0,.09)',   // .tk-face(edgeBrand 뒤에 더한다)
  dashed: 'rgba(111,100,32,.27)',  // .tk-face:after
  logo: '#8a7a25',          // .tk-logo-row svg
  name: '#5d5418',          // .tk-top b
  stripBack: 'rgba(255,242,168,.79)', stripEdge: 'rgba(135,121,39,.13)', stripInk: '#48546b',   // .tk-strip
  serial: '#766923',        // .tk-serial
  todayBack: '#fffdf5', todayInk: '#b64b2e', todayShadow: '0 2px 0 rgba(0,0,0,.05)',   // .tk-today
  flipBack: 'rgba(111,100,32,.1)',  // .tk-flip
  chain: '#3a3413', chainSoft: '#9a8b33',   // .tk-chain
  soft: '#786a2b',          // .tk-alts · .tk-time span · .tk-foot
  timeValue: '#51491f',     // .tk-time b
  mag: '#665347', magShadow: 'inset 0 2px 0 rgba(255,255,255,.07)',   // .tk-mag
  editInk: '#fff3b1',       // .tk-edit
} as const;

export const form = {
  edge: '#f3d64a', back: '#fff7cc', ink: '#3a3410', label: '#6f6326', dashed: '#e8d27a',   // .tf-route · .tf-pl · .tf-pick · .tf-in
  dot: '#4b4316', placeholder: '#8a7a2e',   // .tf-dot · .tf-here · input::placeholder
  listEdge: '#eadf9a', listRule: '#f1ecd2', listShadow: '0 2px 8px rgba(58,52,16,.14)', white: '#ffffff',   // .tf-list
  wheelOff: '#b3a35a', wheelNear: '#7d6f2c',   // .tw-col
  quickEdge: '#e3d48c', quickInk: '#5c5220',   // .tf-quick · .tf-days
  dayOnEdge: '#e6c62f', saveInk: '#4b4316', saveShadow: '0 4px 0 #e6c62f',   // .tf-days[aria-pressed] · .tf-save
  dangerEdge: '#f2c7b3', danger: '#c2410c',    // .tf-del · .account-delete · .pf-in small.over
} as const;

export const route = {
  onEdge: '#e6c62f', radioEdge: '#c9bb78', tagInk: '#5b4c00', tagDarkBack: 'rgba(255,212,0,.14)', openInk: '#5c5220',   // .rt-plan · .rt-radio · .jp-tag · .rt-open
  footShadow: '0 -8px 12px -10px rgba(20,20,20,.25)',   // .rt-foot
  rideShadow: 'inset 0 -2px 0 rgba(0,0,0,.14)',         // .jseg.ride
  sideChip: 'rgba(255,255,255,.28)',                    // .js-chip small
} as const;

export const social = {
  kakao: { back: '#fee500', ink: '#191919', shadow: undefined },
  google: { back: '#ffffff', ink: '#1f1f1f', shadow: 'inset 0 0 0 1px #747775' },
  apple: { back: '#000000', ink: '#ffffff', shadow: undefined },
  appleDarkShadow: 'inset 0 0 0 1px #5a5a5a',
} as const;

export const sheet = {
  loginScrim: 'rgba(18,18,18,.4)', menuScrim: 'rgba(20,20,20,.32)',   // .login-scrim · .menu-scrim
  cardShadow: '0 -10px 30px rgba(23,30,24,.13)', brandShadow: '0 4px 0 #e9e5cd',   // .login-card · .login-brand
  panelShadow: '-6px 0 24px rgba(20,20,20,.18)',   // .settings-panel
  panelWidth: 340, panelShare: 0.86,               // .settings-panel width:min(340px,86vw)
} as const;

export const toastLook = {
  ink: '#3a3410', edge: '#f3d64a', errorEdge: '#fca5a5', errorSpeed: '#f87171',
  shadow: '0 10px 24px rgba(80,60,0,.14)', darkShadow: '0 10px 24px rgba(0,0,0,.4)',   // .acct-toast
} as const;

// 토큰 표에 없는 글자 크기(px)
export const size = { loginTitle: 25, wheelOn: 27, ticketTime: 29, timeValue: 30, serial: 10 } as const;
