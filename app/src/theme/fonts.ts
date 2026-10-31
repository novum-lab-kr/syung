// 글꼴: 웹 tokens.font.round("Jua","Noto Sans KR","Apple SD Gothic Neo",sans-serif)와 본문 글꼴을 앱에서 같게 쓴다.
// Jua 만 웹도 내려받는 글꼴(index.html Google Fonts)이라 앱에 싣는다. 뒤쪽은 기기 글꼴 — 웹도 내려받지 않는다: iOS 는 Apple SD Gothic Neo, 안드로이드는 기기 기본(한글 Noto).
import { Jua_400Regular, useFonts } from '@expo-google-fonts/jua';
import { Platform } from 'react-native';

export const fonts = {
  round: 'Jua_400Regular',                                         // 이 글꼴은 굵기가 하나다 — fontWeight 를 같이 주지 않는다(안드로이드에서 글꼴이 풀린다)
  body: Platform.select({ ios: 'Apple SD Gothic Neo', default: undefined }),
} as const;

// 앱 맨 위(_layout)에서 한 번. true 가 되거나 실패하면 그린다(실패해도 기기 글꼴로 보인다)
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({ Jua_400Regular });
  return loaded || error !== null;
}
