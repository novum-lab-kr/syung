// 스토리용 가짜 경로(경로 고르기 · 발권 화면 경로 칸 — 서버 응답 Plan 모양에서 띠 그리기에 쓰는 칸만). 값은 보기용이다
import type { Plan } from '../lib/journey-ui.mts';

export const SAMPLE_COLORS:Record<string, string> = { '2호선': '#00a84d', '3호선': '#ef7c1c' };
const ride = (line:string, departs:string, arrives:string, wait:number) => ({ type: 'ride', line, departs, arrives, wait });
const walk = (seconds:number) => ({ type: 'walk', seconds });
const plan = (tag:string, kind:string, minutes:number, transfers:number, legs:object[]) => ({ tag, kind, leaveBy: '08:02', arrives: '08:40', minutes, transfers, walkMinutes: 8, legs }) as unknown as Plan;

export const SAMPLE_PLANS:Plan[] = [
  plan('최소 시간', 'subway', 38, 1, [walk(240), ride('2호선', '08:07', '08:12', 60), ride('3호선', '08:15', '08:30', 180), walk(240)]),
  plan('최소 환승', 'subway', 46, 0, [walk(360), ride('2호선', '08:10', '08:40', 120), walk(300)]),
  plan('', 'subway', 52, 2, [walk(120), ride('3호선', '08:05', '08:20', 60), ride('2호선', '08:25', '08:50', 120), walk(120)]),
];
