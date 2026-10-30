// 스토리용 가짜 승차권 · 찾은 곳(이름 · 좌표는 보기용 값이다)
import type { TicketCardData } from './ticket_card.tsx';

export const SAMPLE_TICKET:TicketCardData = { id: 7, name: '출근', depart: '08:00', days: [1, 2, 3, 4, 5], from: { name: '집' }, to: { name: '강남역' }, route: {} };
export const LONG_TICKET:TicketCardData = { id: 1234, name: '강남역으로가는출근길입니', depart: '23:55', days: [1, 2, 3, 4, 5, 6, 7], from: { name: '인천국제공항 제1여객터미널' }, to: { name: '서울고속버스터미널 경부선 승차장' }, route: {} };
export const SAMPLE_CHAIN = '<span>강남</span><em>→</em><span>교대</span><small>3분 뒤</small>';
export const SAMPLE_PLACES = [
  { name: '강남역 2호선', address: '서울 강남구 강남대로 396', lat: 37.4979, lng: 127.0276 },
  { name: '강남역 신분당선', address: '서울 강남구 강남대로 지하 396', lat: 37.4966, lng: 127.0286 },
  { name: '강남구청역', address: '서울 강남구 학동로 346', lat: 37.5172, lng: 127.0412 },
];
export const LONG_PLACES = [{ name: '인천국제공항 제1여객터미널 3층 출국장 A 체크인 카운터 앞', address: '인천광역시 중구 공항로 272 인천국제공항 제1여객터미널 3층 출국장', lat: 37.449, lng: 126.451 }];
