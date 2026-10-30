// 경로 선택 머리말 스토리(#129 달력 + 목적지): 기본 · 시각 아직 없음 · 긴 이름
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { RouteHead } from './route_head.tsx';

const meta:Meta = { title: '컴포넌트/승차권/경로 선택 머리말' };
export default meta;

const WHEN = { month: 10, day: 30, weekday: '금', time: '오전 8:00' };

export const 기본:StoryObj = { render: () => <div class="sb-paper"><RouteHead when={WHEN} from="집" to="강남역" /></div> };
export const 시각_없음:StoryObj = { name: '시각 없음(when 비어 있음)', render: () => <div class="sb-paper"><RouteHead when={null} from="집" to="강남역" /></div> };
export const 긴_이름:StoryObj = { name: '긴 이름', render: () => <div class="sb-paper"><RouteHead when={{ ...WHEN, month: 12, day: 31 }} from="인천국제공항 제1여객터미널 3층 출국장" to="서울고속버스터미널 경부선 승차장 앞" /></div> };
