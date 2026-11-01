// 출발 시각 바퀴(오전 · 오후 / 시 / 5분 단위 분)의 움직임. 칸은 components/time_field.tsx TimeWheels 가 한 번만 그리고, 칸 속(단추 · 스크롤 자리 · on/near · aria-valuetext)은 여기서 바닐라로 다룬다.
// 발권 화면(user/account.mts)과 길찾기 시각 고르기(lib/journey-ui.mts)가 같이 쓴다.
const ROW = 34;   // 바퀴 한 칸 높이(syung.css .tw-col button)
const pad = (value:number) => String(value).padStart(2, '0');
type WheelPart = 'ampm' | 'hour' | 'minute';
interface Wheel { el:HTMLElement; values:number[]; label:(value:number)=>string }
export interface TimeWheel { show(time:string):void; roll(time:string):void; time():string; focus():void }

const clockParts = (time:string) => { const [hours = 0, minutes = 0] = time.split(':').map(Number); return {ampm: hours < 12 ? 0 : 1, hour: hours % 12 || 12, minute: minutes}; };

// box: .tw-col 셋이 든 칸. onChange: 돌리는 동안 'HH:MM'
export function createTimeWheel(box:HTMLElement, onChange:(time:string)=>void):TimeWheel {
  const wheels = Object.fromEntries([...box.querySelectorAll<HTMLElement>('.tw-col')].map(el => [el.dataset.part, {el, values: [], label: String}])) as unknown as Record<WheelPart, Wheel>;
  const indexOf = (wheel:Wheel) => Math.max(0, Math.min(wheel.values.length - 1, Math.round(wheel.el.scrollTop / ROW)));
  function mark(wheel:Wheel) {
    const at = indexOf(wheel);
    [...wheel.el.children].forEach((button, index) => {
      const near = Math.abs(index - at) === 1 ? 'near' : '';
      button.className = index === at ? 'on' : near;
    });
    wheel.el.setAttribute('aria-valuetext', wheel.label(wheel.values[at]!));
  }
  function fill(part:WheelPart, values:number[], label:(value:number)=>string, current:number) {
    const wheel = wheels[part];
    wheel.values = values; wheel.label = label;
    wheel.el.replaceChildren(...values.map((value, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.tabIndex = -1; button.textContent = label(value);
      button.onclick = () => wheel.el.scrollTo({top: index * ROW, behavior: 'smooth'});
      return button;
    }));
    wheel.el.scrollTop = Math.max(0, values.indexOf(current)) * ROW;
    mark(wheel);
  }
  function time() {
    const value = (part:WheelPart) => wheels[part].values[indexOf(wheels[part])]!;
    return `${pad(value('ampm') * 12 + value('hour') % 12)}:${pad(value('minute'))}`;
  }
  for (const wheel of Object.values(wheels)) {
    let frame = 0;
    wheel.el.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { mark(wheel); onChange(time()); });
    }, {passive: true});
    wheel.el.addEventListener('keydown', event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      wheel.el.scrollTo({top: (indexOf(wheel) + (event.key === 'ArrowDown' ? 1 : -1)) * ROW, behavior: 'smooth'});
    });
  }
  return {
    // 칸이 보인 뒤에 부른다(숨은 칸은 스크롤 자리를 잡지 못한다)
    show(shown) {
      const parts = clockParts(shown), minutes = Array.from({length: 12}, (_, index) => index * 5);
      if (!minutes.includes(parts.minute)) { minutes.push(parts.minute); minutes.sort((left, right) => left - right); }   // 예전 승차권의 08:13 같은 시각은 그대로 보여 준다
      fill('ampm', [0, 1], value => value ? '오후' : '오전', parts.ampm);
      fill('hour', Array.from({length: 12}, (_, index) => index + 1), String, parts.hour);
      fill('minute', minutes, pad, parts.minute);
    },
    // 지금 칸에서 그 시각으로 굴려 간다(지난 시각을 돌렸을 때 되돌리기)
    roll(rolled) {
      const parts = clockParts(rolled);
      for (const part of ['ampm', 'hour', 'minute'] as const) {
        const wheel = wheels[part], at = wheel.values.indexOf(parts[part]);
        if (at >= 0) wheel.el.scrollTo({top: at * ROW, behavior: 'smooth'});
      }
    },
    time,
    focus() { wheels.hour.el.focus({preventScroll: true}); },
  };
}
