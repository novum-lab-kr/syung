// 타고 가기 도착 표시(2026-11-08 사용자 — 팝업 말고 지도 위에서): 로그인 로고 움직임을 거꾸로 — 열차가 슈우웅 들어와 덜컹 멈추고
// 새싹이가 뛰어내려 길 끝 깃발 옆에 착지 → 빈 열차는 다시 달려 화면 밖으로 · 머리 위 「도착!」. 지도 속 도착 자리에 붙어 지도와 같이 움직인다(상자 · 막 없음).
// 닫기: ✕ 없음 — 도착 뒤 지도 아무 데나 누르면(연기 도중이어도) 닫는다(길찾기를 다 끝낸다 · 12차 사용자). 키보드는 Esc
// 다 읽는 글(도착 역 · 시간)은 화면 읽기 프로그램용 이름표로만. 움직임 장면은 lib/arrival_motion.mts(도착할 때만 받는다)
import { useEffect, useRef } from 'preact/hooks';
import type { RideArrivalParts } from '../lib/ride-along.mts';
import type { ArrivalScene } from '../lib/arrival_motion.mts';

// 지도 자리(lng/lat)를 화면 자리로 바꿔 붙이고 지도가 움직이면 따라 옮긴다(maplibre Marker 와 같은 방식 · 상태 없이 transform 만)
export interface ArrivalMap {
  project(lngLat:[number, number]):{ x:number; y:number };
  getContainer():HTMLElement;
  on(type:'move' | 'resize', listener:() => void):unknown;
  off(type:'move' | 'resize', listener:() => void):unknown;
}

function useAnchor(map:ArrivalMap, at:readonly [number, number]) {
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const place = () => {
      const node = anchor.current;
      if (!node) return;
      const point = map.project([at[0], at[1]]), box = map.getContainer().getBoundingClientRect();
      node.style.transform = `translate(${Math.round(box.left + point.x)}px,${Math.round(box.top + point.y)}px)`;
    };
    place();
    map.on('move', place); map.on('resize', place);
    return () => { map.off('move', place); map.off('resize', place); };
  }, [map, at[0], at[1]]);
  return anchor;
}

// 장면 · 플레이어는 도착할 때(깃발은 타기 시작할 때) 받는다
function useMotion(name:ArrivalScene, onError?:() => void) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let stop:(() => void) | null = null, gone = false;
    void import('../lib/arrival_motion.mts').then(motion => { if (!gone && box.current) stop = motion.playArrival(box.current, name, onError); }).catch(() => { if (!gone) onError?.(); });
    return () => { gone = true; stop?.(); };
  }, [name, onError]);
  return box;
}

// 지도 아무 데나 누르면 닫는다 — 누르는 순간(pointerdown · 끌기 · 두 손가락도) 바로. 지도 쪽 누르기는 그대로 지나간다(막지 않는다)
function useTapClose(map:ArrivalMap, onClose:() => void) {
  useEffect(() => {
    const box = map.getContainer();
    const tap = () => onClose();
    const key = (event:KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    box.addEventListener('pointerdown', tap, true);
    document.addEventListener('keydown', key);
    return () => { box.removeEventListener('pointerdown', tap, true); document.removeEventListener('keydown', key); };
  }, [map, onClose]);
}

interface Props { map:ArrivalMap; at:readonly [number, number]; arrival:RideArrivalParts; onClose():void; onError():void; hideMe?:(on:boolean) => void }

// 도착 연기: 지도 위 내 위치 캐릭터(3D)를 잠깐 숨기고 그 자리에서 연기한다(한 번 연기 후 끝 자세 정지)
export function MapArrival({ map, at, arrival, onClose, onError, hideMe }:Props) {
  const anchor = useAnchor(map, at), box = useMotion('char-ride', onError);
  useEffect(() => { hideMe?.(true); return () => hideMe?.(false); }, [hideMe]);
  useTapClose(map, onClose);
  return <div ref={anchor} class="ra ram rac" role="status" aria-live="polite" aria-label={`${arrival.to} 슝 도착 · ${arrival.time} 도착 · ${arrival.took}분 걸렸어요 · 지도를 누르면 길찾기를 끝내요`}>
    <span ref={box} class="ral-scene rac-scene rac-ride" aria-hidden="true" />
    <span class="rac-say" aria-hidden="true">도착!</span>
  </div>;
}

// 길 끝 깃발(노란 삼각 · 11차 확정): 타고 가는 동안 길 끝 자리에 꽂혀 계속 펄럭인다. 도착해도 같은 것이 그대로 남는다(ride_card 가 같은 자리 · 같은 열쇠로 그려 Lottie 가 끊기지 않는다).
// 깃대는 도착 자리 바로 오른쪽 — 새싹이가 그 왼쪽(도착 자리)에 착지해 나란히 선다 · 열차는 깃대 밑동 아래로 지나간다. 그리기만(누르기는 지도로)
export function GoalFlag({ map, at }:{ map:ArrivalMap; at:readonly [number, number] }) {
  const anchor = useAnchor(map, at), box = useMotion('flag');
  return <div ref={anchor} class="rag" aria-hidden="true">
    <span ref={box} class="ral-scene rag-flag" />
  </div>;
}
