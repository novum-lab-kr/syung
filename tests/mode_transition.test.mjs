import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeRegistry} from '../web/modes/index.mjs';
import {createModeController} from '../web/modes/transition.mts';

const defs=await Promise.all(['basic','simcity','joseon','coaster'].map(n=>import(`../web/modes/${n}/index.mjs`).then(m=>m.default)));
const later=()=>{let ok,no;const p=new Promise((a,b)=>{ok=a;no=b});return {p,ok,no}};
const tick=()=>new Promise(r=>setImmediate(r));

// 본체처럼: 준비는 모드마다 기다릴 수 있고, 바꾸기는 옛 차례(롤코 끄기 → 심시티 켜기)를 기록한다
function setup({ready={basic:true}}={}){
  const log=[],buttons=[],waits=new Map();let t=0;
  const ctl=createModeController({registry:createModeRegistry(defs),clock:()=>t,
    prepare:id=>{if(ready[id])return true;const w=later();waits.set(id,w);return w.p},
    commit:(prev,next,o)=>{log.push(`${prev}→${next}${o.speed?`×${o.speed}`:''}`);if(prev==='coaster'&&next!=='coaster')ctl.enter('basic');ctl.enter(next);if(next==='coaster')ctl.setSpeed(o.speed??(prev==='coaster'?ctl.speed:1));else ctl.setSpeed(1)},
    onRequest:w=>buttons.push(w),onFail:w=>buttons.push('fail:'+w)});
  return {ctl,log,buttons,waits,ready,setT:v=>{t=v}};
}

test('준비가 끝나 있으면 그 자리에서(동기) 바꾸고, 기다려야 하면 준비 전에는 지금 모드 그대로', async () => {
  const s=setup({ready:{basic:true,simcity:true}});
  assert.equal(s.ctl.request('simcity'),true);assert.equal(s.ctl.current,'simcity');assert.deepEqual(s.log,['basic→simcity']);
  const r=s.ctl.request('coaster');
  assert.ok(r instanceof Promise);assert.equal(s.ctl.current,'simcity','준비 중에는 그대로');assert.equal(s.ctl.desired,'coaster');assert.deepEqual(s.buttons,['simcity','coaster']);
  s.waits.get('coaster').ok();assert.equal(await r,true);
  assert.equal(s.ctl.current,'coaster');assert.deepEqual(s.log,['basic→simcity','simcity→coaster']);
  assert.ok(s.ctl.flags.coaster&&!s.ctl.flags.simcity);
});

test('마지막 요청만 바꾼다: 늦게 끝난 옛 준비(조선 받는 중 롤코 · 그 반대)는 아무것도 안 바꾼다', async () => {
  for(const [a,b] of [['joseon','coaster'],['coaster','joseon'],['simcity','coaster']]){
    const s=setup();
    const ra=s.ctl.request(a),rb=s.ctl.request(b);
    s.waits.get(b).ok();assert.equal(await rb,true);assert.equal(s.ctl.current,b);
    s.waits.get(a).ok();assert.equal(await ra,false,`${a}: 늦은 성공`);
    assert.equal(s.ctl.current,b);assert.deepEqual(s.log,[`basic→${b}`]);
    s.waits.get(a).no(new Error('x'));await tick();assert.equal(s.ctl.current,b);
  }
});

test('먼저 요청한 쪽이 먼저 끝나도 뒤 요청이 이긴다(A 성공을 버리고 B 를 기다린다)', async () => {
  const s=setup();const ra=s.ctl.request('simcity'),rb=s.ctl.request('coaster');
  s.waits.get('simcity').ok();assert.equal(await ra,false);assert.equal(s.ctl.current,'basic');assert.deepEqual(s.log,[]);
  s.waits.get('coaster').ok();assert.equal(await rb,true);assert.deepEqual(s.log,['basic→coaster']);
});

test('받는 중 끄기(취소): 기본은 바로 — 늦게 온 준비는 버린다', async () => {
  const s=setup();const r=s.ctl.request('simcity');
  assert.equal(s.ctl.request('basic'),true);assert.equal(s.ctl.desired,'basic');
  s.waits.get('simcity').ok();assert.equal(await r,false);assert.equal(s.ctl.current,'basic');assert.deepEqual(s.log,['basic→basic']);
});

test('받는 중인 요청만 거두기(cancel): 지금 모드 그대로, 늦게 온 준비는 버린다', async () => {
  const s=setup({ready:{basic:true,simcity:true}});s.ctl.request('simcity');
  const r=s.ctl.request('coaster');s.ctl.cancel();
  assert.equal(s.ctl.current,'simcity');assert.equal(s.ctl.desired,'simcity');assert.equal(s.buttons.at(-1),'simcity');
  s.waits.get('coaster').ok();assert.equal(await r,false);assert.equal(s.ctl.current,'simcity');assert.deepEqual(s.log,['basic→simcity']);
});

test('준비 실패: 마지막 요청이면 버튼을 지금 모드로, 처리되지 않은 rejection 없음, 다시 누르면 다시 받는다', async () => {
  const unhandled=[];const on=e=>unhandled.push(e);process.on('unhandledRejection',on);
  try{
    const s=setup({ready:{basic:true,simcity:true}});s.ctl.request('simcity');
    const r=s.ctl.request('coaster');s.waits.get('coaster').no(new Error('kit'));
    assert.equal(await r,false);assert.equal(s.ctl.current,'simcity');assert.equal(s.ctl.desired,'simcity');assert.equal(s.buttons.at(-1),'fail:simcity');
    const r2=s.ctl.request('coaster');s.waits.get('coaster').ok();assert.equal(await r2,true);assert.equal(s.ctl.current,'coaster');
    // 옛 요청의 실패는 버튼을 건드리지 않는다
    const s2=setup();const old=s2.ctl.request('joseon');s2.ctl.request('coaster');const n=s2.buttons.length;
    s2.waits.get('joseon').no(new Error('old'));assert.equal(await old,false);assert.equal(s2.buttons.length,n);
    // 준비 함수가 던져도 rejection 으로 새지 않는다
    const s3=createModeController({registry:createModeRegistry(defs),clock:()=>0,prepare:()=>{throw new Error('boom')},commit(){},onFail(){}});
    assert.equal(await s3.request('simcity'),false);
    await tick();assert.deepEqual(unhandled,[]);
  }finally{process.off('unhandledRejection',on)}
});

test('바꾸기 중 오류(기다린 요청): 콘솔에 남기고 false, rejection 은 새지 않는다', async () => {
  const errors=[],orig=console.error;console.error=(...a)=>errors.push(a);
  try{
    const ctl=createModeController({registry:createModeRegistry(defs),clock:()=>0,prepare:()=>Promise.resolve(),commit(){throw new Error('commit')}});
    assert.equal(await ctl.request('simcity'),false);assert.equal(errors.length,1);assert.equal(ctl.current,'basic');
  }finally{console.error=orig}
});

test('롤코 배속: 1→5→20 은 옛 식 그대로(바꾼 순간까지의 몫도 새 배속), 1배 · 끄기는 앞선 시간을 지운다', () => {
  const s=setup({ready:{basic:true,coaster:true}});
  s.ctl.request('coaster',{speed:5});assert.equal(s.ctl.speed,5);
  s.setT(1000);assert.equal(s.ctl.warpNow(),0,'처음 셈은 기준 시각만');
  s.setT(3000);assert.equal(s.ctl.warpNow(),8,'2 s × (5−1)');
  s.setT(4000);s.ctl.request('coaster',{speed:20});assert.equal(s.ctl.warpNow(),27,'8 + 1 s × (20−1)');
  assert.deepEqual(s.log,['basic→coaster×5','coaster→coaster×20']);
  s.setT(5000);s.ctl.request('coaster');assert.equal(s.ctl.speed,20,'배속을 안 주면 지금 배속');
  s.ctl.request('coaster',{speed:1});assert.equal(s.ctl.warpNow(),0);
  s.ctl.request('coaster',{speed:5});s.setT(6000);s.ctl.warpNow();s.setT(7000);assert.ok(s.ctl.warpNow()>0);
  s.ctl.request('basic');assert.equal(s.ctl.speed,1);assert.equal(s.ctl.warpNow(),0);
});

test('같은 모드 다시 요청 · 없는 모드 · enter 의 검사', () => {
  const s=setup({ready:{basic:true,simcity:true}});
  s.ctl.request('simcity');s.ctl.request('simcity');assert.deepEqual(s.log,['basic→simcity','simcity→simcity']);
  assert.throws(()=>s.ctl.request('nope'),/없는 모드/);assert.throws(()=>s.ctl.enter('nope'),/없는 모드/);
  assert.ok(Object.isFrozen(s.ctl.settings()),'지금 모드의 설정(얼린 것)');
  assert.ok(s.ctl.flags.simcity&&!s.ctl.flags.joseon);s.ctl.enter('joseon');assert.ok(s.ctl.flags.simcity&&s.ctl.flags.joseon,'조선도 심시티');
});
