// 관리 화면 '서버 상태'(admin/status.html 의 <main>): 켠 지 · 지금 문제 · 오늘 바깥 API 호출 · 캐시. 30초마다(탭이 보일 때) · '다시 보기'로 다시 받는다.
// 셈은 admin/status_data.mts. 표시(DOM 모양 · class · 문구 · aria)는 옛 인라인 스크립트가 만들던 것과 같다 — 첫 그림은 HTML 에 그대로 있고 이 모듈이 받아 그린다.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { callLine, cacheRow, clock, duration } from './status_data.mts';
import type { StatusBody } from './status_data.mts';

interface View { login:boolean; error:string | null; body:StatusBody | null }

function Problems({ view }:{ view:View }) {
  const { error, body } = view;
  if (error) return <ul class="problems" id="problems"><li>{error}</li></ul>;
  if (!body) return <ul class="problems" id="problems"><li class="fine">불러오는 중</li></ul>;
  return <ul class="problems" id="problems">{body.problems.length ? body.problems.map(problem => <li>{problem.text}</li>) : <li class="fine">문제 없어요</li>}</ul>;
}

function StatusPage() {
  const [view, setView] = useState<View>({ login: false, error: null, body: null });
  async function load() {
    let body:StatusBody & { error?:{ message?:string } };
    try {
      const response = await fetch('/api/admin/status', { credentials: 'same-origin' });
      if (response.status === 401) { setView(prev => ({ ...prev, login: true })); return }
      setView(prev => ({ ...prev, login: false }));
      body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || `요청 실패(${response.status})`);
    } catch (error) {
      setView(prev => ({ ...prev, error: (error as Error).message }));
      return;
    }
    setView(prev => ({ ...prev, error: null, body }));
  }
  useEffect(() => { load(); const timer = setInterval(() => { if (!document.hidden) load() }, 30000); return () => clearInterval(timer) }, []);
  const { body } = view;
  return <>
    <p class="login" id="login" hidden={!view.login}>로그인이 풀렸어요. <a href="/admin/login.html?next=/admin/status">다시 로그인</a></p>

    <section class="stats" aria-label="서버">
      <div class="stat"><small>켠 지</small><b id="uptime">{body ? duration(body.uptimeSeconds) : '–'}</b><span id="started">{body ? `${body.startedAt.slice(0, 10)} ${clock(body.startedAt)} 시작` : ''}</span></div>
      <div class="stat"><small>지금 문제</small><b id="problemCount">{body ? (body.problems.length ? `${body.problems.length}건` : '없음') : '–'}</b><span>이상 감지 기준</span></div>
      <div class="stat"><small>확인한 때</small><b id="checked">{body ? clock(body.checkedAt) : '–'}</b><span>30초마다 다시 봐요</span></div>
    </section>

    <section class="box" aria-label="지금 문제">
      <h2>지금 문제<button class="btn" type="button" id="reload" onClick={load}>다시 보기</button></h2>
      <Problems view={view} />
    </section>

    <section class="box" aria-label="API 사용량">
      <h2>오늘 바깥 API 호출</h2>
      <div class="calls" id="calls">{body?.calls.map(callLine).map(line => <div class="call">
        <div><span>{line.label}</span><b>{line.count}</b></div>
        <div class="meter"><i class={line.level} style={{ width: line.width }}></i></div>
        <small>{line.sub}</small>
      </div>)}</div>
      <p class="note">서울시 API 는 키마다 하루 한도가 있어요(한국 날짜로 0시에 다시 세요). 위치 피드는 지하철 호출 안에서 따로 정한 예산이에요.</p>
    </section>

    <section class="box" aria-label="캐시">
      <h2>캐시</h2>
      <table><thead><tr><th>무엇</th><th class="n">담긴 수</th><th class="n">받은 지</th></tr></thead><tbody id="caches">{body?.caches.map(cacheRow).map(([label, entries, age]) => <tr><td>{label}</td><td class="n">{entries}</td><td class="n">{age}</td></tr>)}</tbody></table>
    </section>
  </>;
}

// HTML 에 있던 첫 그림(같은 모양)을 비우고 그 자리에 그린다 — 같은 작업 안이라 깜박이지 않는다
const main = document.querySelector('main')!;
main.textContent = '';
render(<StatusPage />, main);
