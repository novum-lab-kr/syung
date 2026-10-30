// 스토리북 '화면 흐름': docs/flows/*.md(원본 하나 — 여기 다시 적지 않는다)를 글자 그대로 읽어 그린다. 위 막대 '테마'로 흐름도도 라이트 · 다크
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { FlowDoc } from './flow_doc.tsx';
import README from '../docs/flows/README.md?raw';
import FLOW01 from '../docs/flows/01-map-search-station.md?raw';
import FLOW02 from '../docs/flows/02-journey.md?raw';
import FLOW03 from '../docs/flows/03-tickets.md?raw';
import FLOW04 from '../docs/flows/04-account.md?raw';
import FLOW05 from '../docs/flows/05-settings-modes.md?raw';

const meta:Meta = { title: '화면 흐름', parameters: { layout: 'fullscreen' } };
export default meta;

// 문서 하나 = 스토리 하나. 내보내는 이름(readme · flow01 …)이 스토리 주소가 된다 — flow_doc.tsx 의 FLOW_STORY 와 같게
const page = (source:string, name:string):StoryObj => ({ name, render: (_args, context) => <FlowDoc source={source} theme={context.globals['theme'] === 'dark' ? 'dark' : 'light'} /> });

export const readme = page(README, '목차');
export const flow01 = page(FLOW01, '01 지도 · 역 검색');
export const flow02 = page(FLOW02, '02 길찾기');
export const flow03 = page(FLOW03, '03 승차권');
export const flow04 = page(FLOW04, '04 로그인 · 내 정보');
export const flow05 = page(FLOW05, '05 설정 · 모드');
