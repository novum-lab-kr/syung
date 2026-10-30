// 내 정보 쪽 틀 스토리: 프로필 + 통계 + 기기 목록 + 아래 줄 + 탈퇴 확인, 기기 목록 상태들. 지금 화면에 없는 상태는 만들지 않는다(통계 · 기기는 받기 전엔 칸이 숨어 있다)
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { AccountPage, DeviceList } from './account_page.tsx';
import type { Session } from './account_page.tsx';
import { ProfileCard } from './profile_card.tsx';
import { StatsPanel } from './stats_panel.tsx';
import type { Stats } from './stats_panel.tsx';
import { DrawerStage } from './story_drawer.tsx';
import { focusFirst } from './story_state.mts';

const meta:Meta = { title: '컴포넌트/내 정보 · 로그인/내 정보 쪽' };
export default meta;

// 시각은 보기용(2026-10 초 · 초 단위)
const SESSIONS:Session[] = [
  { id: 'now', device: 'iPhone · Safari', current: true, lastUsedAt: 1793404800, createdAt: 1790812800 },
  { id: 'mac', device: 'Mac · Chrome', lastUsedAt: 1793232000, createdAt: 1791072000 },
  { id: 'old', device: 'Android · Chrome', lastUsedAt: 1791936000, createdAt: 1785456000 },
];
const LONG:Session = { id: 'long', device: '아주 아주 긴 이름의 기기 · 아주 아주 긴 이름의 브라우저 133.0.0.0', lastUsedAt: 1793232000, createdAt: 1791072000 };
const STATS:Stats = {
  daysTogether: 128, tickets: 2, weeklyRides: 10, recent: { days: 30, openDays: 21, route: 14, ticket: 40 },
  daily: ['01', '02', '03', '04', '05', '06', '07'].map((date, index) => ({ day: `2026-10-${date}`, open: index, route: index % 3, ticket: 1 })),
  fare: { month: '2026-10', total: 62400, skipped: 0, reasons: {}, tickets: [{ name: '출근권', fare: 1550, rides: 20, monthly: 31000 }] },
};
const FACE = { photo: false, image: 'url("./brand/faces/builder-240.png")' };

function Page({ stats = true, safe = true, sessions = SESSIONS, confirm = false }) {
  const [confirmOpen, setConfirmOpen] = useState(confirm);
  return <DrawerStage title="내 정보" back><section class="menu-page account-page"><AccountPage profile={<ProfileCard name="슝이" provider="카카오" look={FACE} />}
    statsShown={stats} stats={stats && <StatsPanel stats={STATS} />} safeShown={safe} safe={safe && <DeviceList sessions={sessions} busy={[]} />}
    confirmOpen={confirmOpen} onDeleteAsk={() => setConfirmOpen(true)} onDeleteNo={() => setConfirmOpen(false)} onDeleteYes={() => setConfirmOpen(false)} /></section></DrawerStage>;
}
export const 기본:StoryObj = { render: () => <Page /> };
export const 받기_전:StoryObj = { name: '통계 · 기기 받기 전', render: () => <Page stats={false} safe={false} /> };
export const 탈퇴_확인:StoryObj = { name: '탈퇴 확인', render: () => <Page stats={false} safe={false} confirm /> };

const Devices = ({ sessions = SESSIONS, busy = [] as string[] }) => <div class="sb-paper account-page"><DeviceList sessions={sessions} busy={busy} /></div>;
export const 기기_여럿:StoryObj = { name: '기기 목록 · 여러 대', render: () => <Devices /> };
export const 기기_하나:StoryObj = { name: '기기 목록 · 이 기기뿐', render: () => <Devices sessions={[SESSIONS[0]!]} /> };
export const 기기_로그아웃중:StoryObj = { name: '기기 목록 · 로그아웃 보내는 중', render: () => <Devices busy={['mac']} /> };
export const 기기_긴이름:StoryObj = { name: '기기 목록 · 긴 이름', render: () => <Devices sessions={[SESSIONS[0]!, LONG]} /> };
export const 기기_포커스:StoryObj = { name: '기기 목록 · 포커스', render: () => <div ref={focusFirst}><Devices /></div> };
