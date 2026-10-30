// 역 시트 · 열차 시트 스토리. 시트 스타일(.sheet …) 안에서 보이도록 아래 시트 틀에 넣는다. 라이트 · 다크는 위 막대 '테마'
import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import { seatPickerHTML, seatLabel } from '../modes/coaster/first_person.mts';
import { SheetFrame } from './sheet_frame.tsx';
import { StationSheet } from './station_sheet.tsx';
import type { ArrivalCard, StationChip, StationSheetState } from './station_sheet.tsx';
import { focusFirst } from './story_state.mts';
import { TRAIN_SHEET_CSS, TrainSheet } from './train_sheet.tsx';
import type { TrainSheetProps } from './train_sheet.tsx';

const meta:Meta = { title: '컴포넌트/역 · 열차 시트' };
export default meta;

const LINE2 = '#00a84d', NEW = '#d4003b';
const CHIPS:StationChip[] = [{ name: '2호선', color: LINE2 }, { name: '신분당선', color: NEW }];
const CARDS:ArrivalCard[] = [
  { line: '2호선', direction: '내선', toward: '역삼 방면', color: LINE2, rows: [{ text: '곧 도착', destination: '성수', express: false, last: false }, { text: '3분', destination: '잠실', express: false, last: false }] },
  { line: '신분당선', direction: '상행', toward: '', color: NEW, rows: [{ text: '5분', destination: '신사', express: true, last: false }, { text: '12분', destination: '신사', express: false, last: true }] },
];
const EXITS = [{ ref: '1', wheelchair: false }, { ref: '2', wheelchair: true }, { ref: '10-1', wheelchair: false }];
const LONG = '이름이 아주 아주 아주 길어서 한 줄에 다 들어가지 않는 경우의 제목입니다';

const Sheet = ({ children, follow }:{ children:ComponentChildren; follow?:boolean }) =>
  <div class="sb-stage"><style>{TRAIN_SHEET_CSS}</style><section class="sheet open" aria-label="상세 정보"><SheetFrame followHidden={!follow}>{children}</SheetFrame></section></div>;
const Station = ({ state, name = '강남', exits = EXITS }:{ state:StationSheetState; name?:string; exits?:typeof EXITS }) =>
  <Sheet><StationSheet name={name} chips={CHIPS} exits={exits} state={state} /></Sheet>;
const READY:StationSheetState = { kind: 'ready', time: '08:12', cards: CARDS };

export const 역_받음:StoryObj = { name: '역 시트 · 도착 정보', render: () => <Station state={READY} /> };
export const 역_받는중:StoryObj = { name: '역 시트 · 불러오는 중', render: () => <Station state={{ kind: 'loading', rows: 3 }} /> };
export const 역_실패:StoryObj = { name: '역 시트 · 못 받음', render: () => <Station state={{ kind: 'failed' }} /> };
export const 역_빈:StoryObj = { name: '역 시트 · 곧 오는 열차 없음', render: () => <Station state={{ kind: 'ready', time: '01:30', cards: [] }} exits={[]} /> };
export const 역_출구없음:StoryObj = { name: '역 시트 · 출구 자료 없음', render: () => <Station state={READY} exits={[]} /> };
export const 역_긴이름:StoryObj = { name: '역 시트 · 긴 이름', render: () => <Station state={READY} name={LONG} /> };
export const 역_포커스:StoryObj = { name: '역 시트 · 단추 포커스', render: () => <div ref={box => box?.querySelector<HTMLElement>('.st-journey button')?.focus()}><Station state={READY} /></div> };

const RAW = { station: '강남', status: '진입', direction: '내선', destination: '성수', recorded: '08:12:04', ageSec: 18, fetched: '08:12:20' };
const TRAIN:TrainSheetProps = { color: LINE2, line: '2호선', trainNo: '2214', express: false, last: false, dest: '성수행', now: '강남 진입 중', ride: null, raw: RAW };
const Train = (props:Partial<TrainSheetProps>) => <Sheet follow><TrainSheet {...TRAIN} {...props} /></Sheet>;
const SEAT = { car: 1, row: 1, side: -1 } as const;

export const 열차_기본:StoryObj = { name: '열차 시트 · 기본', render: () => <Train /> };
export const 열차_급행막차:StoryObj = { name: '열차 시트 · 급행 · 막차', render: () => <Train express last /> };
export const 열차_행선지없음:StoryObj = { name: '열차 시트 · 행선지 정보 없음', render: () => <Train dest="행선지 정보 없음" raw={{ ...RAW, destination: '-', recorded: '-' }} /> };
export const 열차_긴이름:StoryObj = { name: '열차 시트 · 긴 이름', render: () => <Train dest={LONG} now={LONG} /> };
export const 열차_타기:StoryObj = { name: '열차 시트 · 롤코 자리 고르기', render: () => <Train ride={{ seatsHTML: seatPickerHTML(4, 6, SEAT), goLabel: `${seatLabel(SEAT)}에 타기` }} /> };
export const 열차_타기포커스:StoryObj = { name: '열차 시트 · 타기 단추 포커스', render: () => <div ref={box => box?.querySelector<HTMLElement>('.ride-go')?.focus()}><Train ride={{ seatsHTML: seatPickerHTML(4, 6, SEAT), goLabel: `${seatLabel(SEAT)}에 타기` }} /></div> };
export const 시트_포커스틀:StoryObj = { name: '열차 시트 · 손잡이 포커스', render: () => <div ref={focusFirst}><Train /></div> };
