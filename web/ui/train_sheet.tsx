// 열차 시트(아래 시트 몸통)를 시트 칸에 그린다. 모양은 components/train_sheet.tsx.
import { render } from 'preact';
import { TrainSheet } from '../components/train_sheet.tsx';
import type { TrainSheetProps } from '../components/train_sheet.tsx';

export type { TrainRawView, TrainRideView, TrainSheetProps } from '../components/train_sheet.tsx';

// 시트 몸통에 그리기 · 다시 그리기(같은 몸통이면 Preact 가 바뀐 곳만 고친다). 치우기는 station_sheet.tsx 의 clearPanel
export const drawTrainSheet = (body:HTMLElement, props:TrainSheetProps):void => render(<TrainSheet {...props} />, body);
