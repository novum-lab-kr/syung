// 스토리북 첫 화면: 디자인 토큰 표 — 원본 tokens.json 을 그대로 읽어 그린다(값을 여기 다시 적지 않는다). 위 막대 '테마'로 다크 값을 본다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import type { ComponentChildren } from 'preact';
import TOKENS from './tokens.json';

type TokenValue = string | { light:string; dark:string };
type Group = Record<string, TokenValue | string> & { $prefix:string };

// 그룹의 이름 · 값 목록($ 로 시작하는 칸 빼기). CSS 변수 이름은 생성기(tools/tokens/make.mjs)와 같은 규칙: 접두어 + 키(DEFAULT 는 접두어만 · . 은 -)
function entries(group:Group) {
  return Object.entries(group).filter(([key]) => !key.startsWith('$')).map(([key, value]) => {
    const name = key === 'DEFAULT' ? group.$prefix.replace(/-$/, '') : `${group.$prefix}${key.replace(/\./g, '-')}`;
    return { name: `--${name}`, value: value as TokenValue };
  });
}
const shown = (value:TokenValue) => typeof value === 'string' ? value : `${value.light} / ${value.dark}`;

function Table({ title, group, sample }:{ title:string; group:Group; sample:(variable:string) => ComponentChildren }) {
  return <section style="margin-bottom:28px">
    <h2 style="font-family:var(--round);font-weight:400;font-size:var(--text-20);margin:0 0 10px">{title}</h2>
    <table style="border-collapse:collapse;width:100%;max-width:760px;font-size:var(--text-13)">
      <tbody>{entries(group).map(({ name, value }) => <tr style="border-top:1px solid var(--rule)">
        <td style="padding:8px 12px 8px 0;width:96px">{sample(name)}</td>
        <td style="padding:8px 12px 8px 0;font-family:ui-monospace,monospace">{name}</td>
        <td style="padding:8px 0;color:var(--secondary);font-family:ui-monospace,monospace">{shown(value)}</td></tr>)}</tbody>
    </table>
  </section>;
}

const BOX = 'display:block;width:48px;height:32px;border-radius:var(--radius-8)';

function TokenPage() {
  const groups = TOKENS as unknown as Record<string, Group>;
  const group = (key:string) => groups[key]!;
  return <div style="font-family:'Noto Sans KR',sans-serif;color:var(--ink)">
    <p style="margin:0 0 20px;color:var(--secondary);font-size:var(--text-13)">원본 <code>web/tokens/tokens.json</code> → <code>node tools/tokens/make.mjs</code> → 웹 <code>tokens.css</code> · 앱 <code>tokens.mts</code>. 값이 두 개면 라이트 / 다크.</p>
    <Table title="색" group={group('color')} sample={variable => <i style={`${BOX};background:var(${variable});box-shadow:inset 0 0 0 1px var(--rule)`}></i>} />
    <Table title="글꼴" group={group('font')} sample={variable => <span style={`font-family:var(${variable});font-size:var(--text-18)`}>슝 가나다</span>} />
    <Table title="글자 크기" group={group('text')} sample={variable => <span style={`font-size:var(${variable})`}>슝 가나다</span>} />
    <Table title="굵기" group={group('weight')} sample={variable => <span style={`font-weight:var(${variable});font-size:var(--text-16)`}>슝 가나다</span>} />
    <Table title="간격" group={group('space')} sample={variable => <i style={`display:block;width:var(${variable});height:12px;background:var(--syung)`}></i>} />
    <Table title="둥글기" group={group('radius')} sample={variable => <i style={`display:block;width:48px;height:32px;border-radius:var(${variable});background:var(--control);box-shadow:inset 0 0 0 1.5px var(--secondary)`}></i>} />
    <Table title="그림자" group={group('shadow')} sample={variable => <i style={`display:block;width:48px;height:32px;border-radius:var(--radius-8);background:var(--paper);box-shadow:var(${variable})`}></i>} />
    <Table title="시간" group={group('duration')} sample={() => null} />
    <Table title="곡선" group={group('ease')} sample={() => null} />
    <Table title="포커스" group={group('focus')} sample={() => <i style="display:block;width:48px;height:24px;border-radius:var(--radius-8);background:var(--control);outline:var(--focus-width) solid var(--focus);outline-offset:var(--focus-offset)"></i>} />
  </div>;
}

const meta:Meta = { title: '토큰', component: TokenPage, parameters: { layout: 'padded' } };
export default meta;
export const 전체:StoryObj = {};
