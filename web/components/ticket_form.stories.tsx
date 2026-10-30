// 발권 화면 틀 스토리: 처음(경로 안 고름) · 다 채움 · 저장 중 · 고치기(지우기 단추) · 지우기 확인 · 열기 전 · 긴 이름. 칸 부품은 진짜 부품으로 채운다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { routeTrack } from '../lib/journey-ui.mts';
import { DayPicker } from './day_picker.tsx';
import { PlaceField } from './place_field.tsx';
import { SAMPLE_COLORS, SAMPLE_PLANS } from './sample_route.mts';
import { DrawerStage } from './story_drawer.tsx';
import { TicketForm } from './ticket_form.tsx';
import type { TicketFormProps } from './ticket_form.tsx';
import { TimeField } from './time_field.tsx';

const meta:Meta = { title: '컴포넌트/승차권/발권 화면' };
export default meta;

const CHEVRON = '<svg class="tf-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
const EMPTY_ROUTE = `<span class="pk">경로 고르기</span>${CHEVRON}`;
const FILLED_ROUTE = `${routeTrack(SAMPLE_PLANS[0]!, SAMPLE_COLORS, 270)}<span class="pk"><b>약 38분</b> · 환승 1</span><u>바꾸기</u>`;
const noop = () => {};
const Place = ({ which, value }:{ which:'from' | 'to'; value:string }) => <PlaceField id={which === 'from' ? 'ticketFrom' : 'ticketTo'} head={which === 'from' ? '출발' : '도착'} name={which === 'from' ? '출발지' : '도착지'} placeholder={which === 'from' ? '출발지 고르기' : '도착지 고르기'} to={which === 'to'} value={value} listHidden rows={[]}
  onFocus={noop} onInput={noop} onPick={noop} onLeave={noop} onHere={noop} onCloseList={noop} />;

function Form({ from = '', to = '', ticketName = '', days: firstDays = [] as number[], ...rest }:Partial<TicketFormProps> & { from?:string; to?:string; ticketName?:string; days?:number[] }) {
  const [days, setDays] = useState(firstDays), [name, setName] = useState(ticketName);
  return <DrawerStage title="승차권 발권" back><section class="menu-page ticket-page"><TicketForm preview={{ ticket: { name: name.trim(), depart: '08:00', days }, today: false }}
    places={<><Place which="from" value={from} /><Place which="to" value={to} /></>} time={<TimeField open={false} text={{ ampm: '오전', clock: '8:00' }} value="08:00" onToggle={noop} onDone={noop} />}
    days={<DayPicker days={days} onDay={day => setDays(days.includes(day) ? days.filter(item => item !== day) : [...days, day].sort())} onQuick={value => setDays(value.split(',').map(Number))} />}
    routeHTML={EMPTY_ROUTE} routeEmpty name={name} sending={false} saveDisabled deleteHidden deleteArmed={false} onName={setName} {...rest} /></section></DrawerStage>;
}
const FILLED = { from: '집', to: '강남역', ticketName: '출근', days: [1, 2, 3, 4, 5], routeHTML: FILLED_ROUTE, routeEmpty: false, saveDisabled: false };
export const 처음:StoryObj = { name: '처음(경로 안 고름)', render: () => <Form /> };
export const 다_채움:StoryObj = { name: '다 채움', render: () => <Form {...FILLED} /> };
export const 저장_중:StoryObj = { name: '발권하는 중', render: () => <Form {...FILLED} sending saveDisabled /> };
export const 고치기:StoryObj = { name: '고치기(지우기 단추)', render: () => <Form {...FILLED} deleteHidden={false} /> };
export const 지우기_확인:StoryObj = { name: '지우기 확인', render: () => <Form {...FILLED} deleteHidden={false} deleteArmed /> };
export const 열기_전:StoryObj = { name: '열기 전(빈 칸)', render: () => <Form preview={null} routeHTML="" routeEmpty={false} /> };
export const 긴_이름:StoryObj = { name: '긴 이름', render: () => <Form {...FILLED} from="인천국제공항 제1여객터미널 3층 출국장" to="서울고속버스터미널 경부선 승차장 앞" ticketName="열두글자승차권이름입니다" /> };
