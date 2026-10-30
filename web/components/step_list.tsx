// 기초 컴포넌트: 경로의 단계 목록(출발 → 걷기 · 승차 · 하차 → 도착) — 세로선(.js-rail · 걷기와 환승은 회색 점선)과 동그라미(.js-dot), #122 규칙.
// 지금 길찾기 시트(ui/journey_sheet.tsx 의 StepList)와 같은 DOM 을 그린다 — 기존 화면은 2b 에서 이것을 쓰게 바꾼다. 그릴 거리(StepView)는 lib/journey-ui.mts 의 routeSteps 가 만든다
import { Component } from 'preact';
import { ALT_SHOWN } from '../lib/journey-ui.mts';
import type { AlightChipView, BusChipView, StepView } from '../lib/journey-ui.mts';
import { Chip } from './chip.tsx';
import { BUS, WALK } from './icons.tsx';

// 탈 수 있는 버스 칩들: 고른 버스 + 같은 구간 다른 버스. 앞의 몇 대만 보이고 '외 N대' 를 누르면 다 펼친다.
// 옆 정류장에서 타는 칩('옆 3분')을 누르면 그 정류장 이름 · 번호를 아래에 보인다. 누름이 카드로 새지 않게 막는다(카드를 누르면 시트가 닫힌다)
class BusChips extends Component<{ chips:BusChipView[] }, { all:boolean; tapped:string | null }> {
  override state = { all: false, tapped: null as string | null };
  override render({ chips }:{ chips:BusChipView[] }) {
    const shown = this.state.all ? chips : chips.slice(0, 1 + ALT_SHOWN), hidden = chips.length - shown.length;
    const note = chips.find(chip => chip.route === this.state.tapped)?.detail;
    return <>
      <span class="js-chips">{shown.map(chip => chip.detail === null
        ? <Chip kind="line" color={chip.color} ink={chip.ink} icon={BUS}>{chip.route}</Chip>
        : <button type="button" class="js-chip side" style={`--c:${chip.color};--t:${chip.ink}`} aria-expanded={this.state.tapped === chip.route} onClick={event => { event.stopPropagation(); this.setState({ tapped: this.state.tapped === chip.route ? null : chip.route }); }}>{BUS}{chip.route}<small>{chip.side}</small></button>)}
        {hidden > 0 && <button type="button" class="jp-more" onClick={event => { event.stopPropagation(); this.setState({ all: true }); }}>{`외 ${hidden}대`}</button>}</span>
      {note != null && <small class="js-side">{note}</small>}
    </>;
  }
}

// 하차에서: 다른 버스가 다른 정류장에 내리면 그 칩에 정류장 이름을 작게
function AlightChips({ chips }:{ chips:AlightChipView[] }) {
  return <small class="js-chips">{chips.map(chip => <span class="js-alt"><Chip kind="line" color={chip.color} ink={chip.ink} icon={BUS}>{chip.route}</Chip>{chip.where}</span>)}</small>;
}

function Step({ step, timed }:{ step:StepView; timed:boolean }) {
  if (step.kind === 'place') return <li class={`js node ${step.at}`} style={`--c:${step.at === 'start' ? 'var(--syung)' : 'var(--ink)'}`}>{timed && <span class="js-t">{step.time}</span>}<span class="js-dot"></span><div class="js-b"><b>{step.name}</b></div></li>;
  if (step.kind === 'walk') return <li class="js walk">{timed && <span class="js-t"></span>}<span class="js-rail"></span><div class="js-b"><small>{WALK}{step.text}<span class="js-d">{step.detail}</span></small></div></li>;
  if (step.kind === 'board') return <li class="js node board" style={`--c:${step.color}`}>{timed && <span class="js-t">{step.time}</span>}<span class="js-dot"></span><div class="js-b"><b>{step.name}</b></div></li>;
  if (step.kind === 'alight') return <li class="js node alight" style={`--c:${step.color}`}>{timed && <span class="js-t">{step.time}</span>}<span class="js-dot"></span><div class="js-b"><b>{step.name}</b>{step.chips.length > 0 && <AlightChips chips={step.chips} />}</div></li>;
  return <li class="js ride" style={`--c:${step.color};--t:${step.ink}`}>{timed && <span class="js-t"></span>}<span class="js-rail"></span><div class="js-b">
    <p>{step.bus ? <BusChips chips={step.chips} /> : <Chip kind="line">{step.chip}</Chip>}{step.toward !== null && <span class="js-toward">{step.toward}</span>}</p>
    {(step.info !== '' || step.live !== null) && <small>{step.info}{step.live !== null && <span class="js-live">{step.live}</span>}</small>}</div></li>;
}

// className: 'jsteps'(길찾기 카드 — 카드를 펼쳐야 보임) · 'jsteps shown'(늘 보임). 시각이 있는 단계가 없으면 시각 칸을 뺀다(notime)
export function StepList({ steps, className }:{ steps:StepView[]; className:string }) {
  const timed = steps.some(step => 'time' in step && step.time !== null);
  return <ol class={timed ? className : `${className} notime`}>{steps.map(step => <Step step={step} timed={timed} />)}</ol>;
}
