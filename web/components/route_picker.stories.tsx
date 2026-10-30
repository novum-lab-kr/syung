// 경로 선택 쪽 틀 스토리: 고르기 · 단계 펼침 · 종류 탭 · 찾는 중 · 길 없음 · 조건에 맞는 길 없음 · 긴 이름. 눌러서 바꿔 볼 수 있다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import type { RouteFilterView, RouteKind } from '../user/ticket_routes.mts';
import { SAMPLE_STEPS } from './sample_plan.mts';
import { SAMPLE_COLORS, SAMPLE_PLANS } from './sample_route.mts';
import { RoutePicker } from './route_picker.tsx';
import type { RoutePickerProps } from './route_picker.tsx';
import { DrawerStage } from './story_drawer.tsx';
import { freeze } from './story_states.mts';

const meta:Meta = { title: '컴포넌트/승차권/경로 선택 쪽' };
export default meta;

const WHEN = { month: 11, day: 2, weekday: '월', time: '오전 8:00' };
const filterFor = (kind:RouteKind):RouteFilterView => ({
  kinds: [{ kind: 'all', name: '전체', count: 3, pressed: kind === 'all' }, { kind: 'subway', name: '지하철만', count: 3, pressed: kind === 'subway' }, { kind: 'bus', name: '버스만', count: 0, pressed: kind === 'bus' }],
  order: kind === 'bus' ? [] : [0, 1, 2], empty: kind === 'bus' ? '버스로 가는 길이 없어요' : '',
});

function Picker({ first = 0, open = -1, kind: firstKind = 'all' as RouteKind, from = '집', to = '강남역', message = '', ...rest }:Partial<RoutePickerProps> & { first?:number; open?:number; kind?:RouteKind }) {
  const [chosen, setChosen] = useState(first), [opened, setOpened] = useState(open), [kind, setKind] = useState(firstKind), filter = filterFor(kind);
  const rows = filter.order.map(index => ({ index, plan: SAMPLE_PLANS[index]!, chosen: index === chosen, steps: index === opened ? SAMPLE_STEPS : null }));
  return <DrawerStage title="경로 선택" back><section class="menu-page route-page"><RoutePicker when={WHEN} from={from} to={to} filter={filter} rows={rows} colors={SAMPLE_COLORS} message={message} loading={false}
    onKind={setKind} onPlan={setChosen} onSteps={plan => { const index = SAMPLE_PLANS.indexOf(plan); setOpened(opened === index ? -1 : index) }} {...rest} /></section></DrawerStage>;
}
export const 기본:StoryObj = { render: () => <Picker /> };
export const 단계_펼침:StoryObj = { name: '단계 펼침', render: () => <Picker open={0} /> };
export const 조건_빈:StoryObj = { name: '조건에 맞는 길 없음', render: () => <Picker kind="bus" /> };
export const 찾는_중:StoryObj = { name: '찾는 중', render: () => <Picker filter={null} rows={[]} loading /> };
export const 길_없음:StoryObj = { name: '길을 못 찾음(알림 글)', render: () => <Picker filter={null} rows={[]} message="경로를 찾지 못했어요" /> };
export const 긴_이름:StoryObj = { name: '긴 이름', render: () => <Picker from="인천국제공항 제1여객터미널 3층 출국장" to="서울고속버스터미널 경부선 승차장 앞" /> };
export const 포커스:StoryObj = { name: '경로 포커스', render: () => <Picker />, play: ({ canvasElement }) => freeze(canvasElement, '.rt-plan,.rt-open', 'is-focus') };
export const 누름:StoryObj = { name: '경로 누름', render: () => <Picker />, play: ({ canvasElement }) => freeze(canvasElement, '.rt-plan,.rt-open,#routePick', 'is-pressed') };
