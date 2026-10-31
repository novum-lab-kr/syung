// 아이콘: 웹 index.html · ui/settings_menu.tsx · 본체 ICONS 의 SVG 경로를 그대로 옮긴다.
import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

interface IconProps { size: number; color: string }
type Paths = { width: number; children: ReactNode } & IconProps;

function Line({ size, color, width, children }: Paths) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</Svg>;
}

export const RefreshIcon = (props: IconProps) => <Line {...props} width={2}><Path d="M20 11a8 8 0 1 0-2.3 5.7" /><Path d="M20 4v7h-7" /></Line>;
export const MenuIcon = (props: IconProps) => <Line {...props} width={2}><Path d="M4 7h16M4 12h16M4 17h16" /></Line>;
export const SearchIcon = (props: IconProps) => <Line {...props} width={2}><Circle cx={11} cy={11} r={7} /><Path d="m16 16 5 5" /></Line>;
export const RouteIcon = (props: IconProps) => <Line {...props} width={2}><Circle cx={6} cy={19} r={2} /><Circle cx={18} cy={5} r={2} /><Path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></Line>;
export const BackIcon = (props: IconProps) => <Line {...props} width={2}><Path d="m15 6-6 6 6 6" /></Line>;
export const CloseIcon = (props: IconProps) => <Line {...props} width={2}><Path d="M6 6l12 12M18 6 6 18" /></Line>;
export const ChevronIcon = (props: IconProps) => <Line {...props} width={2}><Path d="m9 6 6 6-6 6" /></Line>;
export const SimcityIcon = (props: IconProps) => <Line {...props} width={1.9}><Path d="M3 21h18M4 21V10h6v11M10 21V3h9v18M7 13v1m0 3v1m6-11h3m-3 4h3m-3 4h3m-3 4h3" /></Line>;
export const JoseonIcon = (props: IconProps) => <Line {...props} width={1.9}><Path d="M2 10.5c3.5.3 6.5-1.8 10-5.5 3.5 3.7 6.5 5.8 10 5.5M5 9.5V20M19 9.5V20M3 20h18M9.5 20v-5h5v5" /></Line>;
export const StarcraftIcon = (props: IconProps) => <Line {...props} width={1.9}><Circle cx={12} cy={12} r={7} /><Circle cx={12} cy={12} r={2} /><Path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></Line>;
export const NationIcon = (props: IconProps) => <Line {...props} width={1.9}><Circle cx={12} cy={12} r={9} /><Path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z" /></Line>;
export const CoasterIcon = (props: IconProps) => <Line {...props} width={1.9}><Path d="M2 18c3 0 4-11 7.5-11S12 14 15 14s3.5-6 7-6" /><Path d="M5 21v-5M9.5 21V9M15 21v-5M20 21v-10" /></Line>;
export const SourcesIcon = (props: IconProps) => <Line {...props} width={1.9}><Ellipse cx={12} cy={5.5} rx={7.5} ry={2.8} /><Path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></Line>;
export function RetroIcon({ size, color }: IconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="square" strokeLinejoin="miter"><Path d="M4 4h4v4H4zM10 4h4v4h-4zM16 10h4v4h-4zM10 10h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z" /></Svg>;
}
export const SpeedIcon = (props: IconProps) => <Line {...props} width={1.9}><Path d="M4 17a8 8 0 1 1 16 0" /><Path d="m12 17 4-5" /></Line>;
export const PrebuildIcon = (props: IconProps) => <Line {...props} width={1.9}><Path d="M4 21V9l5-3v15M9 21V4h8v17M3 21h18M13 2l-2 4h4l-2 4" /></Line>;
export const SaverIcon = (props: IconProps) => <Line {...props} width={1.9}><Rect x={3} y={7} width={16} height={10} rx={2} /><Path d="M21 11v2M7 10v4M10 10v4" /></Line>;
export const DeviceIcon = (props: IconProps) => <Line {...props} width={1.9}><Rect x={6} y={2} width={12} height={20} rx={2.5} /><Path d="M11 18h2" /></Line>;
export const TicketsIcon = (props: IconProps) => <Line {...props} width={1.9}><Path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z" /><Path d="M15 6v12" strokeDasharray="2 2.4" /></Line>;
export const LoginGoIcon = (props: IconProps) => <Line {...props} width={2.4}><Path d="M5 12h13M13 6l6 6-6 6" /></Line>;
// 테마 고르기: 색이 정해진 그림(web/ui/settings_menu.tsx ICON.auto · light · dark)
export const ThemeAutoIcon = ({ size, color }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 3a9 9 0 0 0 0 18z" fill="#f5a524" /><Path d="M12 3a9 9 0 0 1 0 18z" fill="#4a5b78" /><Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={1.4} opacity={0.6} /></Svg>
);
export const ThemeLightIcon = ({ size }: Pick<IconProps, 'size'>) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round"><Circle cx={12} cy={12} r={4.2} fill="#f5a524" stroke="#d98a0b" strokeWidth={1.6} /><Path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke="#e39a17" strokeWidth={2} /></Svg>
);
export const ThemeDarkIcon = ({ size }: Pick<IconProps, 'size'>) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#b8c9da" stroke="#7f97b0" strokeWidth={1} /></Svg>
);
