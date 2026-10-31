import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../theme/fonts';

export default function RootLayout() {
  const fontsReady = useAppFonts();
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* 회원 화면은 웹처럼 지도 위 서랍 · 시트 — 뒤의 지도가 비쳐 보이게 투명 모달로 열고, 나타나는 움직임은 서랍 · 시트가 직접 한다(account/ui.tsx) */}
        <Stack.Screen name="account" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
      </Stack>
    </SafeAreaProvider>
  );
}
