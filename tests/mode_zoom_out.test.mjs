// 축소하면 기본 지하철(city.zoomOutBasic · web/modes/zoom_out.mts): 멀리선 노선 · 역(track) · 열차 굵기만 기본 모드 것으로
import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeRegistry} from '../web/modes/index.mts';
import {createModeController} from '../web/modes/transition.mts';
import {zoomOutSettings} from '../web/modes/zoom_out.mts';

const defs=await Promise.all(['basic','simcity','joseon','coaster','retro'].map(n=>import(`../web/modes/${n}/index.mts`).then(m=>m.default)));
const more=await Promise.all(['starcraft','nations'].map(n=>import(`../web/modes/${n}/index.mts`).then(m=>m.default)));   // (종족 · 나라는 default 가 모드 배열)
defs.push(...more.flat());
const reg=createModeRegistry(defs),basic=reg.settings('basic');

test('심시티: 멀리선 선로 묶음은 기본 것(같은 참조) · 열차는 굵기만 기본, 도시 · 지도 색은 심시티 그대로', () => {
  const S=reg.settings('simcity'),far=zoomOutSettings(S,basic);
  assert.equal(S.city.zoomOutBasic,true);
  assert.equal(far.track,basic.track);assert.equal(far.track.kind,'ground');
  assert.equal(far.trains.body,'wide');assert.equal(far.trains.look,S.trains.look);
  assert.equal(far.city,S.city);assert.equal(far.map,S.map);assert.equal(far.me,S.me);
  assert.ok(Object.isFrozen(far)&&Object.isFrozen(far.trains));
  assert.equal(zoomOutSettings(S,basic),far,'같은 설정이면 같은 참조');
});

test('키가 꺼진 모드(기본 · 롤코 · 심시티 가족)는 그대로 돌려준다 — 심시티만(2026-11-27 사용자 답)', () => {
  const family=defs.map(d=>d.id).filter(id=>!['basic','simcity','coaster'].includes(id));assert.ok(family.length>=9,family.join());
  for(const id of ['basic','coaster',...family]){const S=reg.settings(id);assert.equal(S.city.zoomOutBasic,false,id);assert.equal(zoomOutSettings(S,basic),S,id)}
});

test('zoomOutBasic 은 참 · 거짓만', () => {
  assert.throws(()=>createModeRegistry([defs[0],{id:'bad',settings:{city:{zoomOutBasic:'yes'}}}]).settings('bad'),/city\.zoomOutBasic/);
});

test('심시티 가족끼리는 선로 묶음이 같은 참조 — 전환 때 노선 · 승강장을 다시 짓지 않는다(applySimcity)', () => {
  const T=reg.settings('simcity').track;
  for(const d of defs)if(d.from==='simcity'&&d.id!=='coaster')assert.equal(reg.settings(d.id).track,T,d.id);
});

test('컨트롤러 view: 지금 보이는 설정을 고르고, 모드를 바꿔도 그 고리를 거친다', () => {
  let far=false;
  const ctl=createModeController({registry:reg,clock:()=>0,prepare:()=>true,commit:(a,b)=>ctl.enter(b),view:S=>far?zoomOutSettings(S,basic):S});
  ctl.request('simcity');assert.equal(ctl.settings().track.kind,'viaduct');
  far=true;assert.equal(ctl.settings().track,basic.track);assert.equal(ctl.settings().trains.body,'wide');
  ctl.request('basic');assert.equal(ctl.settings(),basic);
});
