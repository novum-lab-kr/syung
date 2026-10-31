// 시트 그림: 웹 SVG 경로 그대로(bus/sheet_view.tsx · ui/journey_sheet.tsx · components/icons.tsx). 색은 color 로, 크기는 size 로 받는다.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps { color: string; size: number }
const line = (color: string, width: number) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

export const BusOutlineIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2.2)}><Rect x={4} y={3} width={16} height={15} rx={3} /><Path d="M4 11h16M7 21v-3M17 21v-3" /></Svg>
);
export const RefreshIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2.4)}><Path d="M20 12a8 8 0 1 1-2.34-5.66" /><Path d="M20 4v5h-5" /></Svg>
);
export const PinIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2)}><Circle cx={12} cy={12} r={3.2} /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><Circle cx={12} cy={12} r={7.5} /></Svg>
);
export const SwapIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2)}><Path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" /></Svg>
);
export const ChevronIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2.2)}><Path d="m9 6 6 6-6 6" /></Svg>
);
export const UpIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2.6)}><Path d="m6 15 6-6 6 6" /></Svg>
);
export const DownIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2.6)}><Path d="m6 9 6 6 6-6" /></Svg>
);
export const ClockIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2)}><Circle cx={12} cy={12} r={8.5} /><Path d="M12 7.5V12l3 2" /></Svg>
);
export const EditIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2)}><Path d="M4 20h4L19 9l-4-4L4 16z" /><Path d="m13.5 6.5 4 4" /></Svg>
);
export const CloseIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...line(color, 2.2)}><Path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const WalkIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} fill={color}><Circle cx={13} cy={4} r={2} /><Path d="M10.2 7.6 7 9.4V13h2v-2.4l1.3-.7-1.6 8.1H11l1-4.3 2 2V21h2v-6.2l-2.1-2.1.6-3.1c1 1.3 2.5 2.1 4.2 2.2v-2c-1.4-.1-2.5-.9-3.1-2l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.6.1-.9.2z" /></Svg>
);
export const BusFilledIcon = ({ color, size }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} fill={color}><Path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" /></Svg>
);
