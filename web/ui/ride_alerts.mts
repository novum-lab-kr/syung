// 타고 가기 알림 보내기(계획서 plans/feature/20261111-syung-타고-가기-앱-알림.md D1 · D3 · D4): ui/ride_along 이 고른 알림 때(lib/ride-along rideAlerts)를
//  앱 지도 모드면 다리(ui/app_bridge rideAlerts — 앱이 폰에 예약해 잠겨도 울린다)로, 브라우저면 화면이 켜진 동안 웹 Notification 으로.
// 브라우저 권한은 「이 길로 출발」 누름 안에서 한 번 묻는다(아직 안 정했을 때만) — 거부 · 못 씀(Notification 이 없음 · 만들기가 막힘)이면 조용히 아무것도 안 한다
import { alertsChanged, dueAlerts, type RideAlert, type SentAlert } from '../lib/ride-along.mts';

export interface RideAlertSink { update(list:readonly RideAlert[], nowMs:number):void; clear():void; ask():void }
type Deliver = (list:readonly RideAlert[]) => void;

// 보낼 곳 하나(전체 교체): 이미 울린 것은 빼고, 바뀐 때만 보낸다. clear 는 타고 가기를 그만뒀을 때(울린 기록도 비운다)
export function createRideAlerts(deliver:Deliver, ask:() => void = () => {}):RideAlertSink {
  let sent = new Map<string, SentAlert>(), fired = new Set<string>();
  return {
    update(list, nowMs) {
      const next = dueAlerts(list, sent, fired, nowMs);
      if (!alertsChanged(next, sent)) return;
      sent = new Map(next.map(alert => [alert.id, {at: alert.at, text: `${alert.title}\n${alert.body}`}]));
      deliver(next);
    },
    clear() {
      fired = new Set();
      if (!sent.size) return;
      sent = new Map();
      deliver([]);
    },
    ask,
  };
}

interface NotificationLike { permission:string; requestPermission():Promise<string>; new (title:string, options?:{ body?:string; tag?:string }):unknown }
const notificationApi = ():NotificationLike | null => (globalThis as { Notification?:NotificationLike }).Notification ?? null;

// 브라우저: 받은 목록마다 타이머를 다시 건다. 목록에서 빠졌는데 울릴 때가 이미 된 것은(타이머보다 목록이 먼저 옴) 지우기 전에 울린다
export function browserAlerts(api:NotificationLike):Deliver {
  const timers = new Map<string, { timer:ReturnType<typeof setTimeout>; alert:RideAlert }>();
  const show = (alert:RideAlert) => {
    if (api.permission !== 'granted') return;
    try { new api(alert.title, {...(alert.body ? {body: alert.body} : {}), tag: alert.id}); } catch { /* 못 씀(안드로이드 크롬은 서비스 워커로만) — 조용히 */ }
  };
  return list => {
    const now = Date.now(), keep = new Set(list.map(alert => alert.id));
    for (const [id, {timer, alert}] of timers) { clearTimeout(timer); if (!keep.has(id) && alert.at <= now) show(alert); }
    timers.clear();
    if (api.permission !== 'granted') return;
    for (const alert of list) timers.set(alert.id, {alert, timer: setTimeout(() => { timers.delete(alert.id); show(alert); }, Math.max(0, alert.at - now))});
  };
}

// 본체가 부른다: app 이 있으면(앱 지도 모드) 앱으로, 아니면 브라우저 알림(Notification 이 없으면 null — 알림 없이 지금처럼)
export function rideAlertSink(app:Deliver | null):RideAlertSink | null {
  if (app) return createRideAlerts(app);
  const api = notificationApi();
  if (!api) return null;
  // 옛 사파리는 requestPermission 이 약속(Promise)을 돌려주지 않는다 — 감싸서 오류만 삼킨다
  return createRideAlerts(browserAlerts(api), () => { if (api.permission === 'default') try { Promise.resolve(api.requestPermission()).catch(() => {}); } catch { /* 못 씀 */ } });
}
