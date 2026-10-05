import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {distance} from './platform_endpoints_fixture.mjs';
import {trainRuntime,trainMeasurements} from './platform_trains_fixture.mjs';

test('기본 지도 774구간의 열차 선로 중심은 표시 노선 0.1m 이내에 있어요',()=>{
 const rows=trainMeasurements(trainRuntime());
 assert.equal(rows.length,774);
 assert.deepEqual(rows.filter(x=>x.renderedM>.1),[]);
});

test('역 가운데 정차·양방향 진행과 심시티·롤코 경로를 유지해요',()=>{
 const r=trainRuntime(),key='8호선:24:464',g=r.geom('8호선',24,464);
 const stops=JSON.stringify(r.context.stops),rects=JSON.stringify([...r.rects]);
 for(const k of [0,.25,.5,.75,1]){
   const forward=r.point('8호선',24,464,k),reverse=r.point('8호선',464,24,1-k);
   assert.ok(Math.hypot(forward.x-reverse.x,forward.y-reverse.y)<1e-12);
   assert.ok(Math.hypot(forward.f[0]+reverse.f[0],forward.f[1]+reverse.f[1])<1e-8);
   assert.equal(forward.off,0);
 }
 for(const [id,k] of [[24,0],[464,1]]){
   const rect=r.rects.get(`8호선:${id}`),middle=rect.center,p=r.toLL(r.point('8호선',24,464,k));
   assert.ok(Math.hypot((middle[0]-p[0])*111320*Math.cos(middle[1]*Math.PI/180),(middle[1]-p[1])*111320)<.1);
 }
 r.context.simcity=true;
 assert.equal(JSON.stringify(r.geom('8호선',24,464).pts.map(p=>r.toLL(p))),JSON.stringify(r.raw[key].map(p=>r.toLL(r.context.maplibregl.MercatorCoordinate.fromLngLat(p)))));
 const sentinel={pts:[],total:123};r.context.coasterPath=()=>sentinel;r.context.coaster=true;
 assert.equal(r.geom('8호선',24,464),sentinel);
 r.context.coaster=false;r.context.simcity=false;
 assert.equal(r.geom('8호선',24,464),g);
 assert.equal(JSON.stringify(r.context.stops),stops);
 assert.equal(JSON.stringify([...r.rects]),rects);
});

test('공유 선로는 줌 후 표시 경로와 일치하고 주행 거리·캐시는 안정적으로 유지돼요',()=>{
 const r=trainRuntime(),line='경춘선',a=8,b=121,g=r.geom(line,a,b),total=g.total;
 const cache=g;
 for(const zoom of [14,16,18,20,16]){
   r.context.map.getZoom=()=>zoom;
   const expected=trainRuntime(undefined,zoom),key=`${line}:${a}:${b}`,index=Object.keys(expected.raw).indexOf(key),coords=expected.lines[index].geometry.coordinates;
   for(const k of [0,.2,.5,.8,1]){
     const q=r.point(line,a,b,k);assert.equal(q.off,0);
     // 실제 표시 경로를 직접 비교해요. shared slot을 중복해서 더하지 않아요.
     const near=distance(r.toLL(q),coords);
     assert.ok(near<.1,`${zoom}: ${near}`);
   }
   assert.equal(r.geom(line,a,b),cache);assert.equal(g.total,total);
 }
});

test('한 역에만 정차한 기본 모드 열차도 공유 승강장 가운데에 있어요',()=>{
 const r=trainRuntime(),line='경춘선',id=8,index=Object.keys(r.raw).indexOf('경춘선:8:121');
 r.context.testPlan={seq:[r.context.byId.get(id)],cum:[0],t:{line}};
 const q=vm.runInContext('trackPoint(testPlan,0)',r.context);
 assert.ok(distance(r.toLL(q),r.lines[index].geometry.coordinates)<.1);
 assert.equal(q.off,0);
});
