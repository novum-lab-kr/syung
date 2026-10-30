// 스토리용 가짜 경로(그릴 거리 PlanView 모양 — lib/journey-ui.mts). 노선 색은 보기용 값이다
import type { PlanView, StepView } from '../lib/journey-ui.mts';

const LINE2 = '#00a84d', LINE3 = '#ef7c1c', BUS472 = '#3d5bab', WHITE = '#fff';

export const SAMPLE_STEPS:StepView[] = [
  { kind: 'place', at: 'start', name: '내 위치', time: '08:02' },
  { kind: 'walk', text: '도보 4분', detail: ' · 280m · 2번 출구' },
  { kind: 'board', name: '강남', color: LINE2, time: '08:07' },
  { kind: 'ride', color: LINE2, ink: WHITE, bus: false, chip: '2호선', toward: '잠실 방면', chips: [], info: '5개 역 이동', live: '열차 3분 뒤 도착' },
  { kind: 'alight', name: '교대', color: LINE2, time: '08:12', chips: [] },
  { kind: 'board', name: '교대', color: LINE3, time: '08:15' },
  { kind: 'ride', color: LINE3, ink: WHITE, bus: false, chip: '3호선', toward: '오금 방면', chips: [], info: '3개 역 이동', live: null },
  { kind: 'alight', name: '고속터미널', color: LINE3, time: '08:20', chips: [] },
  { kind: 'board', name: '고속터미널', color: BUS472, time: '08:24' },
  { kind: 'ride', color: BUS472, ink: WHITE, bus: true, chip: '472', toward: null, info: '6개 정류장', live: null,
    chips: [{ route: '472', color: BUS472, ink: WHITE, side: null, detail: null }, { route: '740', color: BUS472, ink: WHITE, side: '옆 3분', detail: '반포역 · 22-301' },
      { route: '143', color: BUS472, ink: WHITE, side: null, detail: null }, { route: '148', color: BUS472, ink: WHITE, side: null, detail: null }, { route: '360', color: BUS472, ink: WHITE, side: null, detail: null }] },
  { kind: 'alight', name: '반포한강공원', color: BUS472, time: '08:36', chips: [{ route: '740', color: BUS472, ink: WHITE, where: ' 반포대교남단' }] },
  { kind: 'place', at: 'end', name: '세빛섬', time: '08:40' },
];

export const SAMPLE_PLAN:PlanView = {
  aria: '최소 시간 38분, 08:40 도착', duration: { hours: null, minutes: 38 }, arrive: '08:40 도착', tag: '최소 시간',
  track: [
    { k: 'walk', flex: 4 }, { k: 'wait', flex: 1 },
    { k: 'ride', flex: 5, need: 34, color: LINE2, ink: WHITE, bus: false, icon: false, label: '2' },
    { k: 'wait', flex: 3 },
    { k: 'ride', flex: 5, need: 34, color: LINE3, ink: WHITE, bus: false, icon: false, label: '3' },
    { k: 'wait', flex: 4 },
    { k: 'ride', flex: 12, need: 48, color: BUS472, ink: WHITE, bus: true, icon: true, label: '472' },
    { k: 'walk', flex: 4 },
  ],
  meta: '환승 2번 · 걷기 8분', live: true, steps: SAMPLE_STEPS,
};

export const SAMPLE_LONG:PlanView = {
  ...SAMPLE_PLAN, aria: '최소 환승 1시간 5분', duration: { hours: 1, minutes: 5 }, arrive: '09:07 도착', tag: '최소 환승', live: false,
  track: [{ k: 'walk', flex: 6 }, { k: 'ride', flex: 40, need: 34, color: LINE2, ink: WHITE, bus: false, icon: false, label: '2호선' }, { k: 'walk', flex: 10 }],
};
