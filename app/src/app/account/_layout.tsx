// 회원 화면 묶음(/account …): 들어올 때 저장한 토큰으로 내 정보를 한 번 받고, 토스트는 여기 하나에서 그린다.
// 웹처럼 지도 위에 서랍 · 시트로 뜨도록 배경을 비운다(뿌리 레이아웃에서 이 묶음을 투명 모달로 연다). 프로필 수정은 서랍을 그대로 둔 채 위에 뜬다.
// 캐릭터 얼굴이 앱 안 지도 서버(127.0.0.1)에 있어 그 서버도 띄워 둔다(이미 떠 있으면 바로 끝난다).
import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { bootSession, useSession } from '../../account/session';
import { resetTickets } from '../../account/tickets';
import { Toast } from '../../account/toast';
import { startMapServer } from '../../map/source';

const SHELL = { flex: 1 } as const;
const CLEAR = { backgroundColor: 'transparent' } as const;

export default function AccountLayout() {
  const signedOut = useSession().status === 'out';
  const pathname = usePathname();
  useEffect(() => {
    void bootSession();
    startMapServer().catch(() => undefined);   // 못 띄우면 얼굴 칸만 비어 보인다
  }, []);
  // 안쪽 넘김은 패널 안에서 직접 한다(account/ui.tsx — 웹 menu-in 28px · 0.22초)
  // 세션이 끝나면(401) 로그인 화면으로 돌아가고(로그아웃 · 탈퇴는 내 정보가 메뉴로 먼저 돌아간다), 다음 계정에 앞 계정 승차권이 비치지 않게 목록을 비운다
  useEffect(() => {
    if (!signedOut) return;
    resetTickets();
    if (pathname.startsWith('/account/')) router.dismissTo('/account');   // 안쪽에서 끝났을 때만 — 지도로 나가는 중(/)에 다시 열지 않는다
  }, [signedOut, pathname]);
  return (
    <View style={SHELL}>
      <Stack screenOptions={{ headerShown: false, contentStyle: CLEAR, animation: 'none' }}>
        <Stack.Screen name="profile" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
      </Stack>
      <Toast inPanel={!signedOut} />
    </View>
  );
}
