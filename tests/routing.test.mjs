// Cases taken from real bugs seen on the live map (2026-09-24/25).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter,key} from '../web/lib/routing.mts';
import {stations,paths} from './fixtures.mjs';

const R=createRouter({stations,paths});
const T=(line,station,direction,destination,status='도착')=>({line,station,direction,destination,status,trainNo:'t'});
const names=r=>r.ahead.map(s=>s.name);
const next=(t,others=[])=>{R.learnDirections([t,...others]);const s=R.stationOf(t);assert.ok(s,`station ${t.station} resolves`);return R.route(t,s)};

test('station names from the feed resolve', ()=>{
  for(const [line,name] of [['6호선','응암순환'],['4호선','불암산'],['2호선','성수지선'],['1호선','서울역'],['5호선','마천'],['4호선','진접']])
    assert.ok(R.stationByLine.get(`${line}:${key(name)}`),`${line} ${name}`);
});

test('a train at its destination holds there (청량리 종착)', ()=>{
  const r=next(T('1호선','청량리','상행','청량리'));
  assert.deepEqual(names(r),['청량리']);
});

test('a train not at its destination keeps going (청량리 → 양주)', ()=>{
  assert.equal(names(next(T('1호선','청량리','상행','양주')))[1],'회기');
});

test('6호선 응암순환 at 태릉입구 goes toward 석계, not back to 화랑대', ()=>{
  const r=next(T('6호선','태릉입구','상행','응암순환'));
  assert.equal(names(r)[1],'석계');
});

test('6호선 하행 봉화산 at 태릉입구 goes to 화랑대', ()=>{
  assert.equal(names(next(T('6호선','태릉입구','하행','봉화산')))[1],'화랑대');
});

test('응암 loop is one-way: 응암 → 역촌 → 불광 → 독바위 → 연신내 → 구산 → 응암', ()=>{
  assert.deepEqual(names(next(T('6호선','새절','상행','응암순환','출발'))).slice(0,4),['새절','응암','역촌','불광']);
  assert.equal(names(next(T('6호선','불광','하행','봉화산','출발')))[1],'독바위');
  assert.equal(names(next(T('6호선','구산','하행','봉화산')))[1],'응암');
  assert.equal(names(next(T('6호선','응암','하행','봉화산','출발')))[1],'역촌');      // entering the loop
  assert.equal(names(next(T('6호선','응암','하행','봉화산','도착')))[1],'새절');      // loop finished
});

test('2호선 ring: 외선 and 내선 run opposite ways', ()=>{
  const out=names(next(T('2호선','강남','외선','성수','출발')))[1],inn=names(next(T('2호선','강남','내선','성수','출발')))[1];
  assert.notEqual(out,inn);
  assert.deepEqual([out,inn].sort(),['교대','역삼'].sort());
});

test('unknown destination: direction learned from other trains on the line', ()=>{
  const helper=[T('6호선','석계','하행','봉화산'),T('6호선','고려대','하행','신내')];
  assert.equal(names(next(T('6호선','석계','하행',''),helper))[1],'태릉입구');
});

test('new branches route to their terminus (마천, 진접)', ()=>{
  assert.equal(names(next(T('5호선','거여','하행','마천','출발')))[1],'마천');
  assert.equal(names(next(T('4호선','오남','상행','진접','출발')))[1],'진접');
});
