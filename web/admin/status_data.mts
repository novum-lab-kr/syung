// 관리 화면 '서버 상태'의 셈(그리기는 admin/status.tsx): 응답 모양 · 켠 지 글자 · 사용량 막대 · 캐시 줄.
// 응답은 GET /api/admin/status(server/services/admin.py status) — 이 파일이 읽는 칸.

export interface ApiCall { key:string; label:string; used:number | null; limit:number; day:string | null }
export interface CacheItem { key:string; label:string; entries:number; ageSeconds:number | null }
export interface Problem { key:string; text:string }
export interface StatusBody { checkedAt:string; startedAt:string; uptimeSeconds:number; calls:ApiCall[]; caches:CacheItem[]; problems:Problem[] }

// ISO 시각 → 'HH:MM'(없으면 –)
export const clock = (iso:string | null | undefined):string => iso ? iso.slice(11, 16) : '–';

export function duration(seconds:number):string {
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  if (days) return `${days}일 ${hours}시간`;
  return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

// 90% 넘으면 빨강, 70% 넘으면 노랑
export function level(share:number):string {
  if (share >= .9) return 'bad';
  return share >= .7 ? 'mid' : '';
}

// 바깥 API 한 줄: 이름 · 쓴 수 / 한도 · 막대 폭과 색 · 아래 글
export interface CallLine { label:string; count:string; width:string; level:string; sub:string }
export function callLine(call:ApiCall):CallLine {
  const share = call.used == null || !call.limit ? 0 : Math.min(1, call.used / call.limit);
  return {
    label: call.label,
    count: call.used == null ? `? / ${call.limit.toLocaleString('ko-KR')}` : `${call.used.toLocaleString('ko-KR')} / ${call.limit.toLocaleString('ko-KR')}`,
    width: `${(share * 100).toFixed(1)}%`, level: level(share),
    sub: call.used == null ? '장부를 읽지 못했어요' : `${Math.round(share * 100)}% 사용 · 기준일 ${call.day || '아직 호출 없음'}`,
  };
}

// 캐시 한 줄: 무엇 · 담긴 수 · 받은 지
export const cacheRow = (item:CacheItem):[string, string, string] =>
  [item.label, item.entries.toLocaleString('ko-KR'), item.ageSeconds == null ? '–' : `${item.ageSeconds}초`];
