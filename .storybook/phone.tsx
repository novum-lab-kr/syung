// 화면 기획의 폰: 390 × 844 iframe 안에 조립 화면을 그린다. iframe 이라 @media(max-width:780px) · vw · fixed 가 실제 폰과 같이 먹는다(스코프 CSS 로 값을 다시 적지 않는다)
// 스타일: index.html 첫 <style>(지도 화면 기본 규칙) + 스토리북이 실은 CSS 를 그대로 옮겨 싣는다. 테마는 바깥 html[data-theme] 를 따른다
import { render, type VNode } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import indexHtml from '../web/index.html?raw';
import type { Mark } from './screens.mts';

export interface AssembledScreen {
  draw():VNode;
  prepare?(doc:Document):void;   // 컴포넌트가 칸만 그리고 속은 화면 쪽이 채우는 자리(시각 바퀴)
}

const PAGE = '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body></body></html>';
const HEAD_STYLE = /<style>([\s\S]*?)<\/style>/.exec(indexHtml)?.[1] ?? '';
const LAYER_Z = 2147483000;

function copyStyles(doc:Document) {
  const base = doc.createElement('style');
  base.textContent = HEAD_STYLE;
  doc.head.append(base);
  for (const sheet of document.head.querySelectorAll('style, link[rel="stylesheet"]')) doc.head.append(doc.importNode(sheet, true));
}

// Preact 11 은 숫자에 px 를 붙이지 않아 스타일 값을 글자로 적는다
// 번호 자리: 요소 왼쪽 위 모서리. 글자를 가리는 곳은 JSON 의 badge 로 옮기고, 먼저 놓은 번호와 겹치면 오른쪽으로 비킨다
function badgeSpot(box:DOMRect, badge:Mark['badge'], width:number, height:number, taken:{ left:number; top:number }[]) {
  const wanted = { right: box.right - 18, above: box.left + box.width / 2 - 12, left: box.left - 30 };
  let left = Math.min(Math.max(badge ? wanted[badge] : box.left - 10, 4), width - 28);
  const tops = { right: box.top - 10, above: box.top - 22, left: box.top + box.height / 2 - 12 };
  const top = Math.min(Math.max(badge ? tops[badge] : box.top - 10, 4), height - 28);
  while (taken.some(spot => Math.abs(spot.left - left) < 26 && Math.abs(spot.top - top) < 26)) left += 28;
  taken.push({ left, top });
  return { left, top };
}

function MarkLayer({ doc, marks }:{ doc:Document; marks:Mark[] }) {
  const { innerWidth:width = 390, innerHeight:height = 844 } = doc.defaultView ?? {};
  const taken:{ left:number; top:number }[] = [];
  const missing = marks.filter(mark => !doc.querySelector(mark.at));
  return <>
    {marks.map(mark => {
      const found = doc.querySelector(mark.at);
      if (!found) return null;
      const box = found.getBoundingClientRect(), spot = badgeSpot(box, mark.badge, width, height, taken);
      return <div key={mark.n}>
        <div style={{ position: 'fixed', left: `${box.left - 3}px`, top: `${box.top - 3}px`, width: `${box.width + 6}px`, height: `${box.height + 6}px`, border: '2px solid #e5484d', borderRadius: '6px', boxSizing: 'border-box' }} />
        <b data-mark={mark.n} style={{ position: 'fixed', left: `${spot.left}px`, top: `${spot.top}px`, width: '24px', height: '24px', borderRadius: '50%', background: '#e5484d', color: '#fff', font: '700 13px/24px sans-serif', textAlign: 'center', boxShadow: '0 0 0 2px #fff' }}>{mark.n}</b>
      </div>;
    })}
    {/* 설명과 화면이 어긋나면 그대로 두지 않고 눈에 띄게 알린다 */}
    {missing.length > 0 && <p data-mark-missing style={{ position: 'fixed', inset: 'auto 0 0 0', margin: '0', padding: '8px', background: '#e5484d', color: '#fff', font: '700 12px/1.4 sans-serif' }}>
      {`설명 번호의 자리를 못 찾음: ${missing.map(mark => `${mark.n}(${mark.at})`).join(' · ')}`}</p>}
  </>;
}

// iframe 문서에 화면을 그리고 치우는 함수를 돌려준다
function mount(doc:Document, screen:AssembledScreen, marks:Mark[]) {
  copyStyles(doc);
  const syncTheme = () => {
    const theme = document.documentElement.dataset['theme'];
    if (theme) doc.documentElement.dataset['theme'] = theme;
    else delete doc.documentElement.dataset['theme'];
  };
  syncTheme();
  const themeWatch = new MutationObserver(syncTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const root = doc.createElement('div'), layer = doc.createElement('div');
  root.style.display = 'contents';
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: String(LAYER_Z), pointerEvents: 'none' });
  doc.body.append(root, layer);
  render(screen.draw(), root);

  const measure = () => render(<MarkLayer doc={doc} marks={marks} />, layer);
  // CSS · 글꼴 · 그림이 늦게 오면 자리가 바뀐다 — 올 때마다 다시 맞춘다
  const settle = () => { screen.prepare?.(doc); measure(); };
  // 조립 화면은 고정 자료뿐이라 눌러도 어디로도 가지 않는다(로그인 링크 · 발권 단추 포함)
  const stopPress = (event:Event) => event.preventDefault();
  doc.addEventListener('click', stopPress, true);
  doc.addEventListener('load', settle, true);
  doc.addEventListener('scroll', measure, true);
  doc.defaultView?.addEventListener('resize', measure);
  void doc.fonts.ready.then(settle);
  settle();
  for (const mark of marks) if (!doc.querySelector(mark.at)) console.error(`[화면 기획] 번호 ${mark.n} 자리를 못 찾음: ${mark.at}`);
  return () => {
    themeWatch.disconnect();
    render(null, layer);
    render(null, root);
  };
}

export function PhoneScreen({ screen, marks = [], title, thumbnail = false }:{ screen:AssembledScreen; marks?:Mark[]; title:string; thumbnail?:boolean }) {
  const frame = useRef<HTMLIFrameElement>(null), cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  // srcdoc: 빈 iframe 은 호환 모드(quirks)라 표준 모드 문서를 넣고 다 읽히면 그린다
  const start = () => {
    const doc = frame.current?.contentDocument;
    if (doc && !cleanup.current) cleanup.current = mount(doc, screen, marks);
  };
  return <iframe ref={frame} class="spec-phone" title={title} srcdoc={PAGE} onLoad={start} tabIndex={thumbnail ? -1 : undefined} aria-hidden={thumbnail ? 'true' : undefined} />;
}
