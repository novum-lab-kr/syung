// 스토리 전용 도우미(운영 코드는 부르지 않는다): 이 칸 안 첫 단추 · 입력에 진짜 포커스를 준다 — :focus-visible 모양을 멈춰 보이려고
export const focusFirst = (box:HTMLElement | null) => { box?.querySelector<HTMLElement>('button,input')?.focus(); };
