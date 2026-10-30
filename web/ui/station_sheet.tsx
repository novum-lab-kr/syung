// 역 도착 시트(아래 시트 몸통)를 시트 칸에 그린다. 모양은 components/station_sheet.tsx.
import { render } from 'preact';
import { StationSheet } from '../components/station_sheet.tsx';
import type { StationSheetProps } from '../components/station_sheet.tsx';

export type { ArrivalCard, ExitItem, StationSheetProps, StationSheetState } from '../components/station_sheet.tsx';

// 시트 몸통에 그리기 · 다시 그리기(같은 몸통이면 Preact 가 바뀐 곳만 고친다) · 치우기
export const drawStationSheet = (body:HTMLElement, props:StationSheetProps):void => render(<StationSheet {...props} />, body);
export const clearPanel = (body:HTMLElement):void => render(null, body);
