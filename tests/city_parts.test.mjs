import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerCityPart,cityPart,hasCityPart} from '../web/city/parts.mts';
import {TileBuilder,resolvePack} from '../web/city/mesh.mts';

// 도시 엔진 부품(4-13): 엔진은 한옥 코드를 import 하지 않고 이름으로 받는다. 등록 전에 조선 팩으로 지으면 분명한 오류, 등록하면 짓는다
test('부품 등록: 없으면 분명한 오류, 같은 것 다시는 괜찮고 다른 것은 거부', async () => {
  assert.equal(hasCityPart('hanok'),false);
  assert.throws(()=>cityPart('hanok'),/hanok 없음/);
  const {JOSEON_CITY_STYLE}=await import('./joseon_pack.mjs');
  // (tests/city_mesh.test.mjs 와 같은 타일 · 도우미)
  const Z=14,TX=13975,TY=6346,E=4096,N=2**Z,UPM=E*N/(40075016.685578488*Math.cos(37.54*Math.PI/180));
  const r=(cx,cy,hx,hy)=>[{x:cx-hx,y:cy-hy},{x:cx+hx,y:cy-hy},{x:cx+hx,y:cy+hy},{x:cx-hx,y:cy+hy},{x:cx-hx,y:cy-hy}];
  const layer=f=>({length:f.length,extent:E,feature:i=>({id:f[i].id,properties:f[i].props,loadGeometry:()=>f[i].rings})});
  const build=()=>{const tb=new TileBuilder({z:Z,x:TX,y:TY,extent:E,buildings:layer([{id:1,props:{render_height:6},rings:[r(2000,2000,6*UPM,4*UPM)]}]),landuse:null},resolvePack(JOSEON_CITY_STYLE),{});while(!tb.step(1e9));return tb.result()};
  // 등록 전: 건물 하나의 오류는 엔진이 잡아 경고 한 번으로(타일은 멈추지 않는다) — 한옥은 안 생긴다
  const warns=[],orig=console.warn;console.warn=(...a)=>warns.push(String(a[1]?.message||a[1]));
  try{assert.equal(build().inst.roof.byteLength,0,'등록 전에는 한옥 없음')}finally{console.warn=orig}
  assert.ok(warns.some(w=>/hanok 없음/.test(w)),warns.join(' | '));
  await import('../web/modes/joseon/hanok.mjs');   // 콘텐츠 모듈을 부르면 스스로 등록
  assert.equal(hasCityPart('hanok'),true);
  assert.ok(build().inst.roof.byteLength>0,'등록 뒤 한옥 지붕');
  const p=cityPart('hanok');assert.ok(Object.isFrozen(p));assert.equal(typeof p.building,'function');
  assert.throws(()=>registerCityPart('hanok',{building(){}}),/이미 다른 것/);
  registerCityPart('x',p);registerCityPart('x',p);
});

test('Worker 도 한옥 부품을 스스로 등록하고, 엔진 파일은 한옥을 import 하지 않는다', () => {
  const src=f=>readFileSync(new URL(`../web/${f}`,import.meta.url),'utf8');
  assert.match(src('city/worker.mts'),/^import '\.\.\/modes\/joseon\/hanok\.mjs';/m);
  for(const f of ['city/mesh.mts','city/buildings.mts'])assert.doesNotMatch(src(f),/^\s*import\b[^\n]*hanok\.mjs['"]/m,f);   // 실제 import 구문만(주석의 파일 이름은 괜찮다)
});
