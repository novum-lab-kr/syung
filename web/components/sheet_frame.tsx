// 틀: 아래 시트의 속 — 손잡이 · 닫기 · 몸통 칸 · 따라가기 단추. 겉모양만 그린다.
// 끌어 닫기 · 키보드 위로 올리기 · 따라가기 카메라는 화면(ui/sheet.mts)에 남고, 그쪽이 그려진 단추를 찾아 건다. 그래서 화면은 한 번만 그리고 다시 그리지 않는다.
// 머리줄은 시트마다 몸통 안에서 따로 그려 틀에는 없다(역 · 버스 · 열차 · 길찾기가 모양이 다르다).
import type { ComponentChildren } from 'preact';

export interface SheetFrameProps { followLabel?:string; followHidden?:boolean; children?:ComponentChildren }

export const SheetFrame = ({ followLabel = '이 열차 따라가기', followHidden = true, children }:SheetFrameProps) => <>
  <button type="button" class="sheet-grab" aria-label="닫기" title="끌어내리거나 눌러서 닫기"></button>
  <button type="button" class="sheet-close" aria-label="닫기">✕</button>
  <div class="sheet-body">{children}</div>
  <button type="button" class="sheet-follow" hidden={followHidden}>{followLabel}</button>
</>;
