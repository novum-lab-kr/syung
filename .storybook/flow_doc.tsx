// 화면 흐름 문서 한 장: 마크다운(marked) → HTML, ```mermaid 칸은 그림(mermaid)으로. 스토리북 전용(운영 dist/web 에 안 들어간다)
// - 문서끼리 링크(01-….md)는 그 문서의 스토리로, 컴포넌트 이름(경로 카드 · 단계 목록 …)은 문서마다 처음 나오는 곳만 그 컴포넌트 스토리로 잇는다
// - 원본 md 는 고치지 않는다 — 바꾸는 것은 그린 HTML 뿐
import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { pictureUrl } from './screens.mts';
import './flows.css';

// 문서 파일 → 화면 흐름 스토리 주소(flows.stories.tsx 의 내보내는 이름이 주소가 된다 — 제목 '화면 흐름' → '화면-흐름' · flow01 → flow-01)
const FLOW_STORY:Record<string, string> = {
  'README.md': '화면-흐름--readme',
  '01-map-search-station.md': '화면-흐름--flow-01',
  '02-journey.md': '화면-흐름--flow-02',
  '03-tickets.md': '화면-흐름--flow-03',
  '04-account.md': '화면-흐름--flow-04',
  '05-settings-modes.md': '화면-흐름--flow-05',
};

// 문서에 나오는 말 → 컴포넌트 스토리 주소(web/components/*.stories.tsx 의 첫 스토리)
const COMPONENT_STORY:[string, string][] = [
  ['경로 카드', '컴포넌트-경로-카드--기본'],
  ['단계 목록', '컴포넌트-단계-목록--시각-있음'],
  ['노선 칩', '컴포넌트-칩--노선'],
  ['종류 탭', '컴포넌트-세그먼트-탭--경로-종류'],
];

// 스토리는 iframe 안에서 그려진다 — 링크는 바깥 스토리북 화면(같은 폴더의 ?path=)을 바꾼다
function storyLink(doc:Document, storyId:string) {
  const link = doc.createElement('a');
  link.href = `./?path=/story/${encodeURIComponent(storyId)}`;
  link.target = '_top';
  return link;
}

// 컴포넌트 이름을 링크로: 코드 · 그림 · 제목 · 이미 링크인 곳은 건너뛴다
const SKIP = 'code, pre, a, h1, h2, h3, h4, h5, h6';
function linkComponents(doc:Document) {
  for (const [word, storyId] of COMPONENT_STORY) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? '';
      const at = text.indexOf(word);
      if (at < 0 || node.parentElement?.closest(SKIP)) continue;
      const found = (node as Text).splitText(at);
      found.splitText(word.length);
      const link = storyLink(doc, storyId);
      link.className = 'flow-comp';
      link.title = `컴포넌트 스토리 — ${word}`;
      found.replaceWith(link);
      link.append(found);
      break;
    }
  }
}

// md → 그릴 HTML. 흐름도 칸은 원문을 data 에 담은 빈 칸으로 바꿔 두고 그림은 effect 가 넣는다(테마가 바뀌면 다시 그린다)
function toHtml(source:string) {
  const doc = new DOMParser().parseFromString(marked.parse(source, { async: false, gfm: true }), 'text/html');
  for (const code of doc.querySelectorAll('pre > code.language-mermaid')) {
    const box = doc.createElement('div');
    box.className = 'flow-mermaid';
    box.dataset['src'] = code.textContent ?? '';
    code.parentElement!.replaceWith(box);
  }
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const file = anchor.getAttribute('href')!.split('#')[0]!.replace(/^fe\//, '');
    const storyId = FLOW_STORY[file];
    if (!storyId) continue;
    const link = storyLink(doc, storyId);
    link.append(...anchor.childNodes);
    anchor.replaceWith(link);
  }
  // 화면 기획 그림(screens/<흐름>/x.png)은 스토리북이 내는 주소로 — GitHub 에서는 md 의 상대 경로 그대로 보인다
  for (const image of doc.querySelectorAll<HTMLImageElement>('img[src^="screens/"]')) {
    const url = pictureUrl(image.getAttribute('src')!);
    if (url) image.src = url;
  }
  linkComponents(doc);
  return doc.body.innerHTML;
}

let drawn = 0;   // mermaid 그림마다 다른 id

export function FlowDoc({ source, theme }:{ source:string; theme:'light' | 'dark' }) {
  const html = useMemo(() => toHtml(source), [source]);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'default', fontFamily: '"Noto Sans KR","Apple SD Gothic Neo",sans-serif' });
      for (const box of root.current?.querySelectorAll<HTMLElement>('.flow-mermaid') ?? []) {
        if (!alive) return;
        try {
          drawn += 1;
          const { svg } = await mermaid.render(`flow-mermaid-${drawn}`, box.dataset['src'] ?? '');
          if (alive) box.innerHTML = svg;
        } catch (error) {
          // 문법이 깨진 흐름도는 원문과 오류를 그대로 보인다(문서를 고칠 수 있게)
          box.innerHTML = '';
          const message = document.createElement('div');
          message.className = 'flow-mermaid-error';
          message.textContent = `흐름도를 그리지 못했어요: ${error instanceof Error ? error.message : String(error)}\n\n${box.dataset['src'] ?? ''}`;
          box.append(message);
        }
      }
    })();
    return () => { alive = false; };
  }, [html, theme]);

  return <article ref={root} class="flow-doc" dangerouslySetInnerHTML={{ __html: html }} />;
}
