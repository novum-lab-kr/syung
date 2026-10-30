import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// 첫 화면에 바로 보이는 칸은 index.html 정적 HTML 이고, 스토리는 같은 모양의 컴포넌트를 쓴다.
// .tsx 는 Node 가 못 읽으니 글자로 비교한다: 한쪽만 고치면 여기서 걸린다.
const read=file=>readFileSync(new URL(`../web/${file}`,import.meta.url),'utf8');
const html=read('index.html');
const element=(from,to)=>{const start=html.indexOf(from);assert.ok(start>=0,`index.html 에 ${from} 없음`);return html.slice(start,html.indexOf(to,start)+to.length)};

test('길찾기 단추는 index.html 과 컴포넌트가 같다',()=>{
  assert.ok(read('components/route_button.tsx').includes(element('<button id="routeButton"','</button>')));
});
test('새로고침 · 메뉴 단추는 index.html 과 컴포넌트가 같다',()=>{
  const bar=read('components/top_bar.tsx');
  assert.ok(bar.includes(element('<button id="refreshButton"','</button>')));
  assert.ok(bar.includes(element('<button id="settingsButton"','</button>')));
});
test('검색 칸 돋보기 · 라벨은 index.html 과 컴포넌트가 같다',()=>{
  const field=read('components/search_field.tsx'),box=element('<div class="map-search search">','</ul></div>');
  assert.ok(field.includes(box.slice(box.indexOf('<svg'),box.indexOf('</svg>')+6)));
  assert.ok(field.includes('<label class="sr" for="search">역 검색</label>'));
});
