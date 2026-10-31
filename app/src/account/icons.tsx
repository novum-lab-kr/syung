// 웹 화면의 그림을 그대로 옮긴 SVG(경로 값은 web/user/account.mts · tickets_view.tsx · account_view.tsx · journey_sheet.tsx · brand/syung-light.svg)
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

type Icon = { size?: number; color?: string };
const stroke = (color: string, width: number) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

export const KakaoIcon = ({ size = 18 }: Icon) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path fill="#191919" d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7S17 4 12 4z" /></Svg>
);
export const GoogleIcon = ({ size = 18 }: Icon) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.89 46.98 24.55Z" />
    <Path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </Svg>
);
export const AppleIcon = ({ size = 18, color = '#ffffff' }: Icon) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path fill={color} d="M17.05 12.54c.03 3.27 2.87 4.36 2.9 4.38-.02.08-.45 1.55-1.49 3.07-.9 1.31-1.83 2.62-3.3 2.65-1.44.03-1.91-.86-3.56-.86-1.64 0-2.16.83-3.53.89-1.42.05-2.5-1.42-3.41-2.73C2.8 17.26 1.39 12.36 3.3 9.05a5.3 5.3 0 0 1 4.49-2.72c1.4-.03 2.72.94 3.56.94.83 0 2.4-1.16 4.04-.99.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.3 4.15ZM14.35 4.5c.76-.92 1.28-2.2 1.14-3.48-1.1.04-2.44.74-3.23 1.66-.7.81-1.32 2.11-1.15 3.35 1.23.1 2.48-.63 3.24-1.53Z" /></Svg>
);
// brand/syung-light.svg
export const BrandLogo = ({ size = 47 }: Icon) => (
  <Svg width={size} height={size} viewBox="0 0 96 96">
    <Rect width={96} height={96} rx={22} fill="#ffd400" /><Rect x={36} y={34} width={42} height={28} rx={14} fill="#141414" /><Circle cx={66} cy={48} r={5} fill="#ffd400" />
    <Path d="M16 38h14M12 48h18M16 58h14" stroke="#141414" strokeWidth={6} strokeLinecap="round" />
  </Svg>
);
// 승차권 앞면 점선 로고(tickets_view.tsx LOGO)
export const TicketLogo = ({ color }: { color: string }) => (
  <Svg width={124} height={74} viewBox="0 0 100 60">
    <G fill="none" stroke={color} strokeWidth={1.1} strokeDasharray=".3 2.3" strokeLinecap="round">
      <Rect x={36} y={11} width={56} height={38} rx={19} /><Rect x={40.5} y={15.5} width={47} height={29} rx={14.5} />
      <Circle cx={74} cy={30} r={7.5} /><Circle cx={74} cy={30} r={3.5} />
      <Rect x={15} y={16} width={17} height={7} rx={3.5} /><Rect x={8} y={26.5} width={24} height={7} rx={3.5} /><Rect x={15} y={37} width={17} height={7} rx={3.5} />
    </G>
  </Svg>
);
export const BackIcon = ({ size = 24, color = '#000' }: Icon) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m15 6-6 6 6 6" {...stroke(color, 2)} /></Svg>;
export const CloseIcon = ({ size = 22, color = '#000' }: Icon) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" {...stroke(color, 2.2)} /></Svg>;
export const ChevronRight = ({ size = 18, color = '#000' }: Icon) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m9 6 6 6-6 6" {...stroke(color, 2.2)} /></Svg>;
export const ChevronDown = ({ size = 18, color = '#000', width = 2.2 }: Icon & { width?: number }) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m6 9 6 6 6-6" {...stroke(color, width)} /></Svg>;
export const PencilIcon = ({ size = 16, color = '#000' }: Icon) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4 20h4L19 9l-4-4L4 16z" {...stroke(color, 2.2)} /></Svg>;
export const CameraIcon = ({ size = 24, color = '#000' }: Icon) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4 8h3l2-3h6l2 3h3v11H4z" {...stroke(color, 1.9)} /><Circle cx={12} cy={13} r={3.5} {...stroke(color, 1.9)} /></Svg>
);
export const WalkIcon = ({ size = 13, color = '#000' }: Icon) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Circle cx={13} cy={4} r={2} /><Path d="M10.2 7.6 7 9.4V13h2v-2.4l1.3-.7-1.6 8.1H11l1-4.3 2 2V21h2v-6.2l-2.1-2.1.6-3.1c1 1.3 2.5 2.1 4.2 2.2v-2c-1.4-.1-2.5-.9-3.1-2l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.6.1-.9.2z" /></Svg>
);
export const BusIcon = ({ size = 12, color = '#000' }: Icon) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" /></Svg>
);
