// 스토리북 '화면 기획': docs/flows/screens/<흐름>/ 의 JSON(설명 원본)을 읽어 그린다 — 흐름 한 장(작은 화면 + 화살표 + 무엇을 누르면) · 화면마다 그림 + 번호 설명 표
// 그림은 디자인 시스템 컴포넌트로 조립한 화면(assembled.tsx).
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Fragment } from 'preact';
import { ASSEMBLED } from './assembled.tsx';
import { PhoneScreen } from './phone.tsx';
import { readFlow, type FlowSpec, type Screen } from './screens.mts';
import './flows.css';

const meta:Meta = { title: '화면 기획', parameters: { layout: 'fullscreen' } };
export default meta;

// 작은 화면: 조립 화면을 줄여 보인다(번호 없이). 아직 조립하지 않은 흐름은 찍은 PNG
function Thumbnail({ flow, screen }:{ flow:string; screen:Screen }) {
  const assembled = ASSEMBLED[flow]?.[screen.name];
  if (assembled) return <div class="spec-flow-phone"><PhoneScreen screen={assembled} title={screen.spec.title} thumbnail /></div>;
  return <img src={screen.url} alt={screen.spec.title} />;
}

// 흐름 한 장: 줄마다 화면을 가로로, 사이에 화살표와 무엇을 누르면. 작은 그림을 누르면 그 화면 설명으로 내려간다
function FlowSheet({ flow, flowSpec, screens }:{ flow:string; flowSpec:FlowSpec; screens:Screen[] }) {
  const byName = new Map(screens.map((screen, index) => [screen.name, { screen, number: index + 1 }]));
  return (
    <div class="spec-flow">
      {flowSpec.rows.map((row, rowIndex) => (
        <div class="spec-flow-row" key={rowIndex}>
          {row.screens.map((name, index) => {
            const found = byName.get(name);
            return (
              <Fragment key={name + index}>
                {index > 0 && <div class="spec-flow-arrow"><span>{row.taps[index - 1] ?? ''}</span><i aria-hidden="true">→</i></div>}
                {found && (
                  <a class="spec-flow-thumb" href={`#screen-${name}`}>
                    <Thumbnail flow={flow} screen={found.screen} />
                    <span><b>{found.number}</b>{found.screen.spec.title}</span>
                  </a>
                )}
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ScreenSpecs({ flow, doc }:{ flow:string; doc:string }) {
  const { flowSpec, screens:all } = readFlow(flow);
  const screens = all.filter(screen => ASSEMBLED[flow]?.[screen.name] || screen.url);
  if (!screens.length) return <article class="flow-doc"><p>아직 조립한 화면이 없어요.</p></article>;
  return (
    <article class="flow-doc spec-doc">
      <h1>{flowSpec?.title ?? flow}</h1>
      <p>{ASSEMBLED[flow] ? '디자인 시스템 컴포넌트로 조립한 폰 폭(390px) 화면이다 — 고정 자료(2026-11-02 월 07:30) · 지도는 바탕색 자리만(실제 지도 · 실시간 열차 · 길 그림 없음).' : '폰 폭(390px) 실제 화면을 고정 자료로 찍었다(2026-11-02 월 07:30 · 지도 위 실시간 열차 없음).'} 글 · 흐름도는 <a href={`./?path=/story/${doc}`} target="_top">화면 흐름</a>.</p>
      {flowSpec && <FlowSheet flow={flow} flowSpec={flowSpec} screens={screens} />}
      {screens.map(({ name, spec, url }, index) => {
        const assembled = ASSEMBLED[flow]?.[name];
        return (
        <section class="spec-screen" id={`screen-${name}`} key={name}>
          <h2>{index + 1}. {spec.title}</h2>
          {spec.summary && <p>{spec.summary}</p>}
          <div class="spec-screen-body">
            {assembled ? <PhoneScreen screen={assembled} marks={spec.marks ?? []} title={spec.title} /> : <img src={url} alt={spec.title} width={320} />}
            <table>
              <thead><tr><th>번호</th><th>무엇</th><th>누르면</th><th>예외 · 빈 상태</th></tr></thead>
              <tbody>
                {(spec.marks ?? []).map(mark => (
                  <tr key={mark.n}><td class="spec-n"><b>{mark.n}</b></td><td>{mark.what}</td><td>{mark.tap ?? '—'}</td><td>{mark.edge ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        );
      })}
    </article>
  );
}

// 흐름 하나 = 스토리 하나(찍은 화면이 없으면 촬영 명령을 보인다). doc 은 같은 흐름의 '화면 흐름' 스토리 주소
const page = (flow:string, doc:string, name:string):StoryObj => ({ name, render: () => <ScreenSpecs flow={flow} doc={doc} /> });

export const flow01 = page('01-map-search-station', '화면-흐름--flow-01', '01 지도 · 역 검색');
export const flow02 = page('02-journey', '화면-흐름--flow-02', '02 길찾기');
export const flow03 = page('03-tickets', '화면-흐름--flow-03', '03 승차권');
export const flow04 = page('04-account', '화면-흐름--flow-04', '04 로그인 · 내 정보');
export const flow05 = page('05-settings-modes', '화면-흐름--flow-05', '05 설정 · 지도 모드');
