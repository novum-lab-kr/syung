import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {panelScene,playRange} from '../web/lib/where_motion.mts';

// 빈 패널 로고 움직임은 로그인과 같은 자료를 쓴다: 패널에 맞춘 복사본 · 재생 구간
const scene=JSON.parse(readFileSync(new URL('../web/brand/login-motion-loop.json',import.meta.url),'utf8'));
const layer=(data,name)=>data.layers.find(item=>item.nm===name);
const fills=node=>{const found=[];JSON.stringify(node,(key,value)=>{if(value?.ty==='fl'&&Array.isArray(value.c?.k))found.push(value.c.k.slice(0,3).map(part=>Math.round(part*255)).join());return value});return found};

test('복사본은 노랑을 테마 색으로 칠하고 턱을 숨긴다 · 받은 자료는 그대로다',()=>{
  const before=JSON.stringify(scene),copy=panelScene(scene,' #e3c54f');
  assert.equal(JSON.stringify(scene),before);
  assert.equal(layer(copy,'logo-ledge').hd,true);
  assert.ok(fills(layer(scene,'logo-tile')).includes('255,212,0'));
  assert.ok(fills(layer(copy,'logo-tile')).includes('227,197,79'));
  assert.ok(!fills(copy.layers).includes('255,212,0'));
  assert.deepEqual(fills(layer(copy,'logo-body')),fills(layer(scene,'logo-body')));
  assert.equal(JSON.stringify(panelScene(scene,'').layers.find(item=>item.nm==='logo-tile')),JSON.stringify(layer(scene,'logo-tile')));
});

test('처음부터 한 번, 그다음 달리는 구간만 되풀이한다',()=>{
  const loop=scene.markers.find(marker=>marker.cm==='loop');
  assert.deepEqual(playRange(scene),[[0,scene.op],[loop.tm,loop.tm+loop.dr]]);
  assert.deepEqual(playRange({op:10,layers:[]}),[[0,10]]);
});
