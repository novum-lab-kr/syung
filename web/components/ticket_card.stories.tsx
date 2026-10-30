// 승차권 카드 스토리: 앞면 · 뒷면(경로 자세히 · 지도에서 보기 · 고치기) · 단계 펼침 · 찾는 중 · 누름 · 포커스 · 긴 이름 · 미리보기 · 빈 목록. 라이트 · 다크는 위 막대 '테마'
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { SAMPLE_STEPS } from './sample_plan.mts';
import { LONG_TICKET, SAMPLE_CHAIN, SAMPLE_TICKET } from './sample_ticket.mts';
import { freeze } from './story_states.mts';
import { TicketCard, TicketFront, TicketList } from './ticket_card.tsx';
import type { TicketCardData } from './ticket_card.tsx';

const meta:Meta = { title: '컴포넌트/승차권/카드' };
export default meta;

// 누르면 실제 화면처럼 뒤집히고 단계를 펼친다
function Card({ ticket = SAMPLE_TICKET, flip = false, chain = SAMPLE_CHAIN as string | null, mapping = false, open = false, today = false }:{ ticket?:TicketCardData; flip?:boolean; chain?:string | null; mapping?:boolean; open?:boolean; today?:boolean }) {
  const [flipped, setFlipped] = useState(flip), [opened, setOpened] = useState(open);
  return <div class="sb-paper ticket-page"><div class="ticket-list"><TicketCard ticket={ticket} today={today} flipped={flipped} chain={chain} mapping={mapping} steps={opened ? SAMPLE_STEPS : null}
    onFlip={() => setFlipped(!flipped)} onEdit={() => {}} onMap={() => {}} onSteps={() => setOpened(!opened)} /></div></div>;
}

export const 앞면:StoryObj = { render: () => <Card /> };
export const 앞면_오늘:StoryObj = { name: '앞면(오늘 타는 날)', render: () => <Card today /> };
export const 뒷면:StoryObj = { render: () => <Card flip /> };
export const 뒷면_기다림:StoryObj = { name: '뒷면(첫 줄 불러오는 중)', render: () => <Card flip chain={null} /> };
export const 뒷면_경로_없음:StoryObj = { name: '뒷면(저장한 경로 없음 · 타는 날 없음)', render: () => <Card flip ticket={{ ...SAMPLE_TICKET, days: [], route: null }} /> };
export const 경로_자세히:StoryObj = { name: '뒷면(경로 자세히 펼침)', render: () => <Card flip open /> };
export const 지도_찾는_중:StoryObj = { name: '뒷면(지도에서 보기 — 불러오는 중)', render: () => <Card flip mapping /> };
export const 누름:StoryObj = { name: '뒷면 단추 누름', render: () => <Card flip />, play: ({ canvasElement }) => freeze(canvasElement, '.sy-btn', 'is-pressed') };
export const 포커스:StoryObj = { name: '뒷면 단추 포커스', render: () => <Card flip />, play: ({ canvasElement }) => freeze(canvasElement, '.sy-btn', 'is-focus') };
export const 긴_이름:StoryObj = { name: '긴 이름(앞면)', render: () => <Card ticket={LONG_TICKET} /> };
export const 긴_이름_뒷면:StoryObj = { name: '긴 이름(뒷면 — 줄인 이름)', render: () => <Card ticket={LONG_TICKET} flip chain={null} /> };
export const 미리보기:StoryObj = {
  name: '발권 화면 미리보기(번호 없음)',
  render: () => <div class="sb-paper ticket-page"><div class="ticket"><div class="ticket-in"><TicketFront ticket={{ name: '', depart: '08:00', days: [] }} today={false} /></div></div></div>,
};
export const 목록:StoryObj = {
  render: () => <div class="sb-paper ticket-page"><TicketList>{[SAMPLE_TICKET, { ...SAMPLE_TICKET, id: 8, name: '퇴근', depart: '18:30' }].map(ticket => <TicketCard ticket={ticket} today={false} flipped={false} chain={null} mapping={false} steps={null} onFlip={() => {}} onEdit={() => {}} onMap={() => {}} onSteps={() => {}} />)}</TicketList></div>,
};
export const 빈_목록:StoryObj = { name: '빈 목록', render: () => <div class="sb-paper ticket-page"><TicketList /></div> };
export const 예매_단추_누름:StoryObj = { name: '예매 단추 누름', render: () => <div class="sb-paper ticket-page"><TicketList /></div>, play: ({ canvasElement }) => freeze(canvasElement, '.ticket-new', 'is-pressed') };
export const 예매_단추_포커스:StoryObj = { name: '예매 단추 포커스', render: () => <div class="sb-paper ticket-page"><TicketList /></div>, play: ({ canvasElement }) => freeze(canvasElement, '.ticket-new', 'is-focus') };
