// 성능 · 배터리 쪽: web/ui/settings_menu.tsx Device(문구 그대로). 눌림은 지도가 알려 준 값(다리 prefs)을 따른다.
import type { PrefsState } from '../../map/bridge';
import { useTheme } from '../../theme/useTheme';
import { PrebuildIcon, SaverIcon } from '../Icons';
import { Switch } from './Switch';

export function Device({ prefs, onPref }: { prefs: PrefsState | null; onPref(key: 'prebuild' | 'saver', value: boolean): void }) {
  const theme = useTheme();
  const color = theme.color.secondary;
  return (
    <>
      <Switch plain name="건물 미리 짓기" description="모드 전환이 빨라져요 · 발열 주의" icon={<PrebuildIcon size={18} color={color} />} pressed={prefs?.prebuild ?? false} onPress={() => onPref('prebuild', !prefs?.prebuild)} />
      <Switch plain name="절전" description="움직임을 조금 덜 부드럽게 · 배터리 아낌" icon={<SaverIcon size={18} color={color} />} pressed={prefs?.saver ?? false} onPress={() => onPref('saver', !prefs?.saver)} />
    </>
  );
}
