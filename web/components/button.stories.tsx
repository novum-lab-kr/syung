// 버튼 스토리: 종류(주 · 보조 · 글자 · 아이콘)마다 상태(기본 · 누름 · 포커스 · 비활성 · 불러오는 중). 누름 · 포커스는 .is-pressed · .is-focus 로 멈춰 보인다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Button } from './button.tsx';
import type { ButtonVariant } from './button.tsx';
import { DOWN } from './icons.tsx';

const meta:Meta<typeof Button> = {
  title: '컴포넌트/버튼',
  component: Button,
  args: { variant: 'primary', children: '고치기 ›' },
  argTypes: { variant: { control: 'inline-radio', options: ['primary', 'secondary', 'text', 'icon'] } },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const 기본:Story = {};

const LABEL:Record<ButtonVariant, string> = { primary: '주', secondary: '보조', text: '글자', icon: '아이콘' };
const VARIANTS:ButtonVariant[] = ['primary', 'secondary', 'text', 'icon'];
const content = (variant:ButtonVariant) => variant === 'icon' ? DOWN : variant === 'text' ? <>경로 자세히{DOWN}</> : '지도에서 보기';

// 한 줄에 종류 넷 × 상태 다섯
function States({ extra }:{ extra?:string }) {
  return <table style="border-collapse:separate;border-spacing:14px 10px;font-size:var(--text-12);color:var(--secondary)">
    <thead><tr><th></th><th>기본</th><th>누름</th><th>포커스</th><th>비활성</th><th>불러오는 중</th></tr></thead>
    <tbody>{VARIANTS.map(variant => <tr><th style="text-align:left">{LABEL[variant]}</th>
      <td><Button variant={variant} class={extra} label={variant === 'icon' ? '펼치기' : undefined}>{content(variant)}</Button></td>
      <td><Button variant={variant} class={[extra, 'is-pressed'].filter(Boolean).join(' ')} label={variant === 'icon' ? '펼치기' : undefined}>{content(variant)}</Button></td>
      <td><Button variant={variant} class={[extra, 'is-focus'].filter(Boolean).join(' ')} label={variant === 'icon' ? '펼치기' : undefined}>{content(variant)}</Button></td>
      <td><Button variant={variant} class={extra} disabled label={variant === 'icon' ? '펼치기' : undefined}>{content(variant)}</Button></td>
      <td><Button variant={variant} class={extra} loading={variant === 'icon' ? '…' : '찾는 중…'} label={variant === 'icon' ? '펼치기' : undefined}>{content(variant)}</Button></td></tr>)}</tbody>
  </table>;
}

export const 상태:Story = { render: () => <div class="sb-paper" style="max-width:none;display:inline-block"><States /></div> };
// 승차권 뒷면 위의 색(#122 · #126 — 고치기 · 지도에서 보기 · 경로 자세히)
export const 승차권_종이:Story = { name: '승차권 종이 위', render: () => <div class="sb-ticket"><States extra="on-ticket" /></div> };
