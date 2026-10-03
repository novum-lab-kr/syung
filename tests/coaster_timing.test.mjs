import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('coaster speed shaping preserves every phase departure and arrival in both directions',()=>{
  const source=readFileSync(new URL('../web/maplibre_runtime.mjs',import.meta.url),'utf8');
  const a=source.indexOf('const RIDE_G='),b=source.indexOf('const edgeArcs=',a),mu=1/32000000;
  const context=vm.createContext({geom:()=>({total:1200*mu,pts:[{meterInMercatorCoordinateUnits:()=>mu}]}),
    coasterAt:(_line,_lo,_hi,s)=>[s,mu*(60+60*Math.sin(s/(1200*mu)*Math.PI*4)),0,0]});
  vm.runInContext(source.slice(a,b),context);
  for(const [from,to] of [[1,2],[2,1]])for(const [k0,k1] of [[0,1],[.15,.82],[.82,.15],[.5,.5]]){
    const at=t=>vm.runInContext(`ridePace('2호선',${from},${to},${k0},${k1},${t})`,context);
    assert.ok(Math.abs(at(0)-k0)<1e-7,'departure stays at the phase origin');
    assert.ok(Math.abs(at(1)-k1)<1e-7,'arrival stays at the phase destination');
    let prev=at(0);
    for(let i=1;i<=100;i++){const next=at(i/100);assert.ok(Number.isFinite(next));assert.ok((next-prev)*(k1-k0)>=-1e-12);prev=next}
  }
});
