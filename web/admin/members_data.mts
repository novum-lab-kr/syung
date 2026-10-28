// 관리 화면 '회원'의 셈(그리기는 admin/members.tsx): 응답 모양 · 이름표 · 시각 글자 · 막대 그래프 · 표 줄.
// 응답은 server/services/admin.py(stats · members · member · places · logout · clear_avatar · reset_name · delete) — 이 파일이 읽는 칸.
// 글자는 옛 인라인 스크립트(admin/members.html)가 만들던 것과 같다.

export interface DayCount { day:string; count:number }
export interface ProviderCount { provider:string; count:number }
export interface ReasonCount { reason:string; count:number }
export interface MemberStats {
  total:number; today:number; week:number; month:number; providers:ProviderCount[]; daily:DayCount[];
  withdraw:{ total:number; today:number; week:number; month:number; reasons:ReasonCount[]; daily:DayCount[] };
}
export interface MemberRow { id:number; name:string; createdAt:number; provider:string | null; tickets:number; lastLogin:number | null; sessions:number }
export interface MemberPage { total:number; page:number; pageSize:number; members:MemberRow[] }
export interface Avatar { type:'photo' | 'character'; id?:string }
export interface Ticket { id:number; name:string; depart:string; days:number[]; hasRoute:boolean; createdAt:number; updatedAt:number }
export interface LogItem { at:number; action:string; reason:string | null }
export interface MemberDetail extends MemberRow {
  avatar:Avatar | null; identities:{ provider:string; createdAt:number }[]; ticketList:Ticket[]; log:LogItem[];
}
export interface Spot { name:string; lat:number; lng:number }
export interface Place { id:number; name:string; from:Spot; to:Spot }

const PROVIDERS:Record<string, string> = { kakao: '카카오', google: '구글', apple: 'Apple' };
const ACTIONS:Record<string, string> = { places: '장소 보기', logout: '강제 로그아웃', delete: '탈퇴 처리', avatar: '사진 내리기', avatar_view: '사진 보기', name: '닉네임 초기화' };
const CHARACTERS:Record<string, string> = { sprout: '새싹 볼빵 후디', builder: '꼬마 건설 반장', seonbi: '갓 쓴 꼬마 선비', visitor: '두근두근 나들이',
  scv: '테란 SCV', drone: '저그 드론', probe: '프로토스 프로브' };
const WITHDRAW_REASONS:Record<string, string> = { self: '본인 탈퇴', kakao_unlink: '카카오 연결 해제', admin: '관리자 탈퇴 처리' };
const DAYS = ['', '월', '화', '수', '목', '금', '토', '일'];

export const provider = (name:string | null | undefined):string => (name && PROVIDERS[name]) || name || '–';
export const actionName = (action:string):string => ACTIONS[action] || action;
export const withdrawName = (reason:string):string => WITHDRAW_REASONS[reason] || reason;

export function avatarText(avatar:Avatar | null | undefined):string {
  if (avatar?.type === 'photo') return '올린 사진';
  if (avatar?.type === 'character') return `캐릭터 · ${(avatar.id && CHARACTERS[avatar.id]) || avatar.id}`;
  return '기본 캐릭터';
}

// 초(UNIX) → 한국 시각 'YY. MM. DD. HH:MM'(withTime 이 false 면 날짜만) · 없으면 –
export const when = (seconds:number | null | undefined, withTime = true):string => seconds == null ? '–' : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul',
  year: '2-digit', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(seconds * 1000));

// 승차권이 타는 요일(1 = 월 … 7 = 일) → '월 화 수' · 없으면 –
export const dayText = (days:number[]):string => days.map(day => DAYS[day]).join(' ') || '–';

// ---- 가입 · 탈퇴 막대 그래프(viewBox 600×180) ----
// 막대 하나: 사각형 칸 · 위 숫자(0 이면 없음) · 7일마다 아래 날짜 글자(맨 끝 날짜는 오른쪽 맞춤)
export interface Bar {
  x:string; y:string; width:string; height:string; title:string;
  value:{ x:string; y:string; text:number } | null;
  label:{ x:string; y:number; anchor:'end' | 'middle'; text:string } | null;
}
export function chartBars(daily:DayCount[]):Bar[] {
  const width = 600, height = 180, top = 22, bottom = 22, most = Math.max(1, ...daily.map(day => day.count));
  const step = width / daily.length;
  return daily.map((day, index) => {
    const tall = (height - top - bottom) * day.count / most, x = index * step + 2, y = height - bottom - tall, last = index === daily.length - 1;
    return {
      x: x.toFixed(1), y: y.toFixed(1), width: (step - 4).toFixed(1), height: Math.max(day.count ? 2 : 0, tall).toFixed(1), title: `${day.day} ${day.count}명`,
      value: day.count ? { x: (x + (step - 4) / 2).toFixed(1), y: (y - 5).toFixed(1), text: day.count } : null,
      label: (daily.length - 1 - index) % 7 === 0
        ? { x: (last ? x + step - 4 : x + (step - 4) / 2).toFixed(1), y: height - 5, anchor: last ? 'end' : 'middle', text: day.day.slice(5).replace('-', '.') }
        : null,
    };
  });
}

// 로그인 방법 · 탈퇴 사유 줄(없으면 '아직 …' 한 줄 · 0)
export interface KindLine { name:string; count:number }
export function kindLines<T extends { count:number }>(items:T[], name:(item:T) => string, empty:string):KindLine[] {
  return items.length ? items.map(item => ({ name: name(item), count: item.count })) : [{ name: empty, count: 0 }];
}

// ---- 목록 ----
// 쪽 글자 · 이전 · 다음을 누를 수 있나
export function pageInfo(body:MemberPage, page:number):{ text:string; prev:boolean; next:boolean } {
  const last = Math.max(1, Math.ceil(body.total / body.pageSize));
  return { text: `${body.total.toLocaleString('ko-KR')}명 · ${page} / ${last}쪽`, prev: page > 1, next: page < last };
}

// 상세 칸(이름 · 값)
export function facts(member:MemberDetail):[string, string | number][] {
  return [['회원번호', member.id], ['닉네임', member.name], ['가입', when(member.createdAt)],
    ['로그인 방법', member.identities.map(item => provider(item.provider)).join(' · ') || '–'],
    ['최근 로그인', when(member.lastLogin)], ['로그인 중인 기기', `${member.sessions}대`], ['승차권', `${member.tickets}장`],
    ['프로필', avatarText(member.avatar)]];
}

// 승차권 한 줄: 이름 · 출발 시각 · 타는 날 · 고른 경로 · 만든 날
export const ticketRow = (ticket:Ticket):string[] =>
  [ticket.name, ticket.depart, dayText(ticket.days), ticket.hasRoute ? '있음' : '없음', when(ticket.createdAt, false)];

// 장소 한 줄: 승차권 · 출발지 · 도착지(이름 (위도, 경도))
export const placeRow = (place:Place):string[] =>
  [place.name, `${place.from.name} (${place.from.lat}, ${place.from.lng})`, `${place.to.name} (${place.to.lat}, ${place.to.lng})`];

// 관리 기록 한 줄: '시각 · ' + 굵은 조치 이름 + ' · 이유'(없으면 빈 글자)
export const logLine = (item:LogItem):[string, string, string] =>
  [`${when(item.at)} · `, actionName(item.action), item.reason ? ` · ${item.reason}` : ''];
