// 회원 화면(투명 모달) ↔ 그 밑 메뉴 서랍. 웹은 내 정보 · 승차권이 서랍 안의 한 쪽이라 패널이 하나다.
// 앱은 모달이 서랍 위에 같은 자리 · 같은 폭으로 뜨고, 닫기와 경로 선택(지도와 함께 보는 쪽)만 밑의 서랍에 알린다.
import type { RoutePlan } from '../map/bridge';

interface MenuHandle { close(): void; setAside(aside: boolean): void }
let handle: MenuHandle | null = null;

export const linkMenu = (next: MenuHandle | null) => { handle = next; };
export const menuUnder = () => handle !== null;
export const closeMenu = () => handle?.close();
export const setMenuAside = (aside: boolean) => handle?.setAside(aside);

// 회원 화면 ↔ 그 밑 지도: 승차권 경로 선택이 고른 경로를 지도에 미리 그린다(웹 account.mts previewPlan · previewGone).
// 메뉴 줄은 메뉴가 열려 있을 때만 이어지고 지도가 다시 뜰 때 끊기므로, 지도 화면이 살아 있는 동안 이어 두는 줄을 따로 둔다.
interface RouteMapHandle { show(plan: RoutePlan, bottom: number): void; clear(): void }
let routeMap: RouteMapHandle | null = null;

export const linkRouteMap = (next: RouteMapHandle | null) => { routeMap = next; };
export const previewRoute = (plan: RoutePlan, bottom: number) => routeMap?.show(plan, bottom);
export const clearRoutePreview = () => routeMap?.clear();
