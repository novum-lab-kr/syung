// 스토리북 '화면 기획': docs/flows/screens/<흐름>/ 의 JSON(설명 원본)과 찍은 PNG 를 읽어 그린다 — 흐름 한 장(작은 그림 + 화살표 + 무엇을 누르면) · 화면마다 그림 + 번호 설명 표
// 그림 다시 찍기: node tools/flows/capture.mjs <흐름 폴더>
import type { Meta, StoryObj } from '@storybook/preact-vite';
import { Fragment } from 'preact';
import { readFlow, type FlowSpec, type Screen } from './screens.mts';
import './flows.css';

const meta:Meta = { title: '화면 기획', parameters: { layout: 'fullscreen' } };
export default meta;

// 흐름 한 장: 줄마다 화면을 가로로, 사이에 화살표와 무엇을 누르면. 작은 그림을 누르면 그 화면 설명으로 내려간다
function FlowSheet({ flowSpec, screens }:{ flowSpec:FlowSpec; screens:Screen[] }) {
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
                    <img src={found.screen.url} alt={found.screen.spec.title} />
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
  const { flowSpec, screens } = readFlow(flow);
  if (!screens.length) return <article class="flow-doc"><p>아직 찍은 화면이 없어요 — <code>node tools/flows/capture.mjs {flow}</code></p></article>;
  return (
    <article class="flow-doc spec-doc">
      <h1>{flowSpec?.title ?? flow}</h1>
      <p>폰 폭(390px) 실제 화면을 고정 자료로 찍었다(2026-11-02 월 07:30 · 지도 위 실시간 열차 없음). 글 · 흐름도는 <a href={`./?path=/story/${doc}`} target="_top">화면 흐름</a>.</p>
      {flowSpec && <FlowSheet flowSpec={flowSpec} screens={screens} />}
      {screens.map(({ name, spec, url }, index) => (
        <section class="spec-screen" id={`screen-${name}`} key={name}>
          <h2>{index + 1}. {spec.title}</h2>
          {spec.summary && <p>{spec.summary}</p>}
          <div class="spec-screen-body">
            <img src={url} alt={spec.title} width={320} />
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
      ))}
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
