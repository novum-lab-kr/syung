// 토큰에 아직 없고 웹 시트 CSS(web/syung.css · ui/popups.mts <style>)에 글자로만 있는 색. 웹과 같게 보이려고 여기 한 곳에 모은다(토큰으로 올리면 지운다).
export const sheetColors = {
  nowLight: '#6b7b80',          // .train-inspect .tp-now
  trainNo: '#7a8a90',           // .train-inspect .tp-line .no
  badgeLast: '#141414',         // .train-inspect .b.last
  onColor: '#ffffff',           // .bus-num · .b 글자
  cream: '#fffdf6',             // .bus-follow · .bus-hero 글자
  followStop: 'rgba(255,253,246,.14)',   // .bus-follow [data-bus-stop-view=stop]
  followDark: '#2b2d30',        // 다크 .bus-follow
  moreEdge: '#6b6a62',          // .bus-num-more · .bus-track-from
  hero: { light: '#141414', dark: '#26282c' },       // --hero
  heroLine: { light: '#4a4a44', dark: '#5a5b57' },   // --hero-line
  heroDim: { light: '#2c2b27', dark: '#3a3b3d' },    // --hero-dim
  heroText: '#d9d4c3',          // --hero-text
  heroMuted: '#a9a497',         // --hero-muted
  heroAfter: '#8a8676',         // .bus-track-names span:last-child
  trackBus: '#3567C8',          // .bus-track-bus
  tagInk: '#5b4c00',            // .jp-tag
  tagDarkBg: 'rgba(255,212,0,.14)',   // 다크 .jp-tag
  liveLight: '#1f8f55',         // .jp-live · .js-live
  liveDark: '#3ddc84',          // 다크
  dotFromDark: '#000000',       // 다크 .jdot.from 테두리
  sideChip: 'rgba(255,255,255,.28)',  // .js-chip small
  fallbackLeg: '#888888',       // 노선 색을 모를 때(journey-ui legColorOf)
  inkDark: '#141414',           // journey-ui inkOn 어두운 글자
} as const;
