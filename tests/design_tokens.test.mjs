import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readTokens, renderCss, renderTs, cssName, OUTPUTS} from '../tools/tokens/make.mjs';

const tokens=readTokens();
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

// 생성물(웹 CSS · 앱 TS)은 원본 web/tokens/tokens.json 에서 만든 그대로여야 한다 — 다르면 node tools/tokens/make.mjs
test('토큰 생성물이 원본과 같다',()=>{
  assert.equal(readFileSync(OUTPUTS.css,'utf8'),renderCss(tokens),'web/tokens/tokens.css 가 원본과 다르다 — node tools/tokens/make.mjs');
  assert.equal(readFileSync(OUTPUTS.ts,'utf8'),renderTs(tokens),'web/tokens/tokens.mts 가 원본과 다르다 — node tools/tokens/make.mjs');
});

// syung.css 가 부르는 토큰 이름(접두어가 토큰 그룹인 것)은 원본에 다 있어야 한다 — 없는 이름은 조용히 빈 값이 된다
test('syung.css 의 토큰 변수가 원본에 있다',()=>{
  const names=new Set();
  const prefixes=[];
  for(const [group,body] of Object.entries(tokens)){
    if(group.startsWith('$'))continue;
    if(body.$prefix)prefixes.push(`--${body.$prefix}`);
    for(const key of Object.keys(body))if(!key.startsWith('$'))names.add(cssName(body.$prefix??'',key));
  }
  const css=read('web/syung.css');
  const missing=[...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(match=>match[1]))]
    .filter(name=>prefixes.some(prefix=>name.startsWith(prefix))&&!names.has(name));
  assert.deepEqual(missing,[]);
});

// 토큰 CSS → 기초 컴포넌트 CSS → syung.css 차례로 붙여 받는다(같은 단계 — 한 단계 늦어지지 않게 · 같은 우선순위 차례: 슝 스킨이 뒤에서 이긴다)
test('index.html 이 토큰 · 기초 컴포넌트 CSS 를 syung.css 바로 앞에서 부른다',()=>{
  const html=read('web/index.html');
  assert.match(html,/<link rel="stylesheet" href="\.\/tokens\/tokens\.css">[^\n]*\n<link rel="stylesheet" href="\.\/components\/components\.css">[^\n]*\n<link rel="stylesheet" href="\.\/syung\.css">/);
});
