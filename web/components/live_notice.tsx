// 지도 위 안내 띠: 실시간 자료가 끊기거나 오래됐을 때 뜬다. 글자 넣기 · 숨기기는 ui/popups.mts(updateLiveNotice)가 맡는다.
// 화면의 칸은 그 파일이 같은 모양으로 직접 만든다 — 이 부품은 스토리 · 조립 화면용이고, 스타일 글자는 같이 쓴다.

export const LIVE_NOTICE_CSS = '.live-notice{position:absolute;z-index:6;left:50%;top:12px;transform:translateX(-50%);max-width:calc(100% - 120px);padding:8px 12px;border-radius:8px;background:#fff6e0;color:#6b4a00;border:1px solid #f0cf7a;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.12)}html[data-theme=dark] .live-notice{background:#3a2f12;color:#f4dc9a;border-color:#6d5620}';

export const LiveNotice = ({ text }:{ text:string }) => <div class="live-notice" role="status">{text}</div>;
