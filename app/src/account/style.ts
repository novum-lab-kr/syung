// 테마별 StyleSheet 를 한 번씩만 만드는 도우미 + 글자 스타일 두 가지(웹 --round · 본문 글꼴).
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme, type Theme, type ThemeName } from '../theme/useTheme';

export function makeStyles<const Sheet extends { [Name in keyof Sheet]: ViewStyle | TextStyle | ImageStyle }>(make: (theme: Theme) => Sheet) {
  const made: Partial<Record<ThemeName, Sheet>> = {};
  return (): Sheet => {
    const theme = useTheme();
    made[theme.name] ??= StyleSheet.create(make(theme));
    return made[theme.name] as Sheet;
  };
}

// Jua 는 굵기가 하나라 fontWeight 를 주지 않는다
export const round = (theme: Theme, fontSize: number, color: string = theme.color.ink): TextStyle => ({ fontFamily: theme.font.round, fontSize, color });
export const body = (theme: Theme, fontSize: number, fontWeight: TextStyle['fontWeight'] = 400, color: string = theme.color.ink): TextStyle =>
  ({ fontFamily: theme.font.body, fontSize, fontWeight, color });
