// 메뉴 첫 단계의 테마 칸: web/ui/settings_menu.tsx ThemePick + syung.css .sun-path · .theme-seg · .theme-note + map/theme.mts .sun-temp · 겹 차례.
// 겹: 하늘 < 구름(Lottie) < 해 · 달 < 산 · 빌딩 < 지하철(Lottie) < 떨어지는 것(Lottie). 그림 글자 · 움직임 이름 · 문장은 지도가 다리로 준다(앱이 새로 만들지 않는다).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { SkyState, ThemeChoice, ThemeState } from '../../map/bridge';
import { tokens } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { ThemeAutoIcon, ThemeDarkIcon, ThemeLightIcon } from '../Icons';
import { SkyScene } from './SkyScene';

const CHOICES: readonly (readonly [ThemeChoice, string])[] = [['auto', '자동'], ['light', '라이트'], ['dark', '다크']];
// 웹 CSS 에 글자로 적힌 색(토큰에 없다 — syung.css .sun-times · theme.mts .sun-temp)
const SKY_TEXT = { day: { times: '#4a3d00', temp: '#2b3a55', shadow: { textShadowColor: 'rgba(255,255,255,.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 } }, night: { times: '#e6edf5', temp: '#fff', shadow: { textShadowColor: 'rgba(0,0,12,.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } } };
const STILL_TRAIN = /<g class="sky-still-train">[\s\S]*?<\/g>/;
const NOTE = /^지금은 (다크|라이트)( · .*)$/;   // 자동일 때 웹은 테마 이름만 굵게(theme.mts themeNote)

function Sky({ sky }: { sky: SkyState }) {
  const font = useTheme().font.body;
  const [trainShown, setTrainShown] = useState(false);
  const text = sky.night ? SKY_TEXT.night : SKY_TEXT.day;
  // 움직이는 지하철이 뜨면 정지 그림 지하철을 뺀다(못 받으면 정지 그림이 남는다 — 웹과 같다)
  const front = trainShown ? sky.layers.front.replace(STILL_TRAIN, '') : sky.layers.front;
  return (
    <>
      <SvgXml xml={sky.layers.back} width="100%" height="100%" style={StyleSheet.absoluteFill} />
      {sky.motion.clouds ? <SkyScene name={sky.motion.clouds} night={sky.night} speed={1} /> : null}
      <SvgXml xml={sky.layers.sun} width="100%" height="100%" style={StyleSheet.absoluteFill} />
      <SvgXml xml={front} width="100%" height="100%" style={StyleSheet.absoluteFill} />
      <SkyScene name="train" night={sky.night} speed={sky.motion.trainSpeed} onShown={() => setTrainShown(true)} />
      {sky.motion.fall ? <SkyScene name={sky.motion.fall} night={sky.night} speed={1} /> : null}
      {sky.temp ? <Text style={[styles.temp, { color: text.temp }, text.shadow]}>{sky.temp}</Text> : null}
      <View style={styles.times}>
        <Text style={[styles.time, { color: text.times, fontFamily: font }]}>{`해 짐 ${sky.sunset}`}</Text>
        <Text style={[styles.time, { color: text.times, fontFamily: font }]}>{`${sky.sunrise} 해 뜸`}</Text>
      </View>
    </>
  );
}

export function ThemePick({ sky, state, onChoose }: { sky: SkyState | null; state: ThemeState | null; onChoose(choice: ThemeChoice): void }) {
  const theme = useTheme();
  const noteParts = state?.note.match(NOTE);
  const icon = (choice: ThemeChoice, color: string) => {
    if (choice === 'auto') return <ThemeAutoIcon size={18} color={color} />;
    return choice === 'light' ? <ThemeLightIcon size={18} /> : <ThemeDarkIcon size={18} />;
  };
  return (
    <>
      <View style={styles.sky} accessibilityRole={sky?.label ? 'image' : undefined} accessibilityLabel={sky?.label ?? undefined}>{sky ? <Sky sky={sky} /> : null}</View>
      <View style={[styles.seg, { backgroundColor: theme.color.control }]} accessibilityLabel="테마">
        {CHOICES.map(([choice, label]) => {
          const pressed = state?.choice === choice;
          const color = pressed ? theme.color.syungInk : theme.color.ink;
          return (
            <Pressable key={choice} onPress={() => onChoose(choice)} accessibilityRole="button" accessibilityState={{ selected: pressed }}
              style={[styles.button, pressed && { backgroundColor: theme.color.syung, boxShadow: theme.shadow.knob }]}>
              {icon(choice, color)}
              <Text style={[styles.label, { color, fontFamily: theme.font.body }]}>{label}</Text>
              {pressed ? <Text style={[styles.check, { color, fontFamily: theme.font.body }]}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.color.secondary, fontFamily: theme.font.body }]}>
        {noteParts ? <>지금은 <Text style={[styles.noteBold, { color: theme.color.ink }]}>{noteParts[1]}</Text>{noteParts[2]}</> : state?.note}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  sky: { height: 110, marginHorizontal: tokens.space[1], marginBottom: 10, borderRadius: tokens.radius[14], overflow: 'hidden' },
  temp: { position: 'absolute', right: 12, top: 7, fontFamily: 'Jua_400Regular', fontSize: 17, lineHeight: 17 },
  times: { position: 'absolute', left: 12, right: 12, bottom: 5, flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: tokens.text[12], fontWeight: tokens.weight.bold, fontVariant: ['tabular-nums'] },
  seg: { flexDirection: 'row', marginHorizontal: tokens.space[1], padding: tokens.space[1], borderRadius: tokens.radius.pill },
  button: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, borderRadius: tokens.radius.pill },
  label: { fontSize: tokens.text[15], fontWeight: tokens.weight.bold },
  check: { fontSize: tokens.text[13], fontWeight: tokens.weight.bold },
  note: { marginTop: 10, marginHorizontal: 10, marginBottom: 2, fontSize: tokens.text[13], lineHeight: 19.5 },
  noteBold: { fontWeight: tokens.weight.bold },
});
