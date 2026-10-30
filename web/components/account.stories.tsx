// 내 정보 · 로그인 스토리: 로그인 단추 · 로그인 팝업 · 프로필 줄 · 프로필 수정 팝업 · 통계 칸. 지금 화면에 없는 상태(통계 불러오는 중 등)는 만들지 않는다 — 통계는 받기 전엔 칸 자체가 숨어 있다
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { LayerSheet } from './layer_sheet.tsx';
import { LoginButton } from './login_button.tsx';
import { LoginSheetBody, SocialButtons } from './login_sheet.tsx';
import { ProfileCard } from './profile_card.tsx';
import { ProfileForm } from './profile_form.tsx';
import type { ProfileFormProps } from './profile_form.tsx';
import { StatCell, StatsPanel } from './stats_panel.tsx';
import type { Stats } from './stats_panel.tsx';
import { focusFirst } from './story_state.mts';

const meta:Meta = { title: '컴포넌트/내 정보 · 로그인' };
export default meta;

export const 로그인_단추:StoryObj = {
  name: '로그인 단추',
  render: () => <div class="sb-paper">
    <p class="sb-note">기본</p><LoginButton />
    <p class="sb-note">포커스</p><div ref={focusFirst}><LoginButton /></div>
  </div>,
};
const LoginPopup = ({ message, providers = ['kakao', 'google', 'apple'] }:{ message?:string; providers?:string[] }) =>
  <div class="sb-stage"><div class="login-sheet open"><LayerSheet labelledBy="loginTitle"><LoginSheetBody message={message}><SocialButtons providers={providers} /></LoginSheetBody></LayerSheet></div></div>;
export const 로그인_팝업:StoryObj = { name: '로그인 팝업', render: () => <LoginPopup /> };
export const 로그인_팝업_오류:StoryObj = { name: '로그인 팝업 · 오류 글', render: () => <LoginPopup message="로그인을 취소했어요." /> };
export const 로그인_팝업_빈:StoryObj = { name: '로그인 팝업 · 로그인 방법 없음', render: () => <LoginPopup providers={[]} /> };

const FACE = { photo: false, image: 'url("./brand/faces/builder-240.png")' };
export const 프로필:StoryObj = {
  name: '프로필 줄',
  render: () => <div class="sb-paper account-page">
    <p class="sb-note">기본 새싹 · 아직 모름</p><ProfileCard name="" provider="" look={null} />
    <p class="sb-note">캐릭터</p><ProfileCard name="슝이" provider="카카오" look={FACE} />
    <p class="sb-note">포커스</p><div ref={focusFirst}><ProfileCard name="슝이" provider="구글" look={FACE} /></div>
    <p class="sb-note">긴 이름</p><ProfileCard name="열두글자이름이꽉찬사람" provider="Apple" look={FACE} />
  </div>,
};

const FORM:ProfileFormProps = { name: '슝이', count: '2/12', over: false, photoImage: '', choice: 'sprout', marked: true, facesLoaded: true, saving: false, converting: false };
const EditPopup = (props:Partial<ProfileFormProps>) => <div class="sb-stage"><div class="login-sheet profile-sheet open"><LayerSheet label="프로필 수정"><div class="profile-body"><ProfileForm {...FORM} {...props} /></div></LayerSheet></div></div>;
export const 수정_기본:StoryObj = { name: '프로필 수정 · 기본', render: () => <EditPopup /> };
export const 수정_넘침:StoryObj = { name: '프로필 수정 · 글자 수 넘침', render: () => <EditPopup name="이름이 아주 아주 아주 긴 사람입니다" count="19/12" over /> };
export const 수정_빈:StoryObj = { name: '프로필 수정 · 빈 이름', render: () => <EditPopup name="" count="0/12" /> };
export const 수정_사진준비:StoryObj = { name: '프로필 수정 · 사진 준비 중', render: () => <EditPopup converting /> };
export const 수정_저장중:StoryObj = { name: '프로필 수정 · 저장 중(비활성)', render: () => <EditPopup saving /> };
export const 수정_고른것없음:StoryObj = { name: '프로필 수정 · 눌림 전', render: () => <EditPopup marked={false} facesLoaded={false} /> };

const DAILY = ['01', '02', '03', '04', '05', '06', '07'].map((date, index) => ({ day: `2026-10-${date}`, open: index, route: index % 3, ticket: 1 }));
const STATS:Stats = {
  daysTogether: 128, tickets: 2, weeklyRides: 10, recent: { days: 30, openDays: 21, route: 14, ticket: 40 }, daily: DAILY,
  fare: { month: '2026-10', total: 62400, skipped: 0, reasons: {}, tickets: [{ name: '출근권', fare: 1550, rides: 20, monthly: 31000 }, { name: '퇴근권', fare: 1570, rides: 20, monthly: 31400 }] },
};
const Stat = ({ stats }:{ stats:Stats }) => <div class="sb-paper account-page"><StatsPanel stats={stats} /></div>;
export const 통계_칸:StoryObj = { name: '통계 칸', render: () => <div class="sb-paper"><div class="st-grid"><StatCell value="128일" label="함께한 날" /><StatCell value="2장" label="승차권" /></div></div> };
export const 통계:StoryObj = { name: '내 통계 · 기본', render: () => <Stat stats={STATS} /> };
export const 통계_빈:StoryObj = { name: '내 통계 · 승차권 없음', render: () => <Stat stats={{ ...STATS, tickets: 0, daily: DAILY.map(day => ({ ...day, open: 0, route: 0, ticket: 0 })), fare: { ...STATS.fare, total: 0, tickets: [] } }} /> };
export const 통계_계산못함:StoryObj = { name: '내 통계 · 계산 못 한 승차권', render: () => <Stat stats={{ ...STATS, fare: { ...STATS.fare, skipped: 2, reasons: { route: 1, extra: 1 } } }} /> };
export const 통계_긴이름:StoryObj = { name: '내 통계 · 긴 승차권 이름', render: () => <Stat stats={{ ...STATS, fare: { ...STATS.fare, tickets: [{ name: '열두글자승차권이름입니다', fare: 1550, rides: 20, monthly: 31000 }] } }} /> };
