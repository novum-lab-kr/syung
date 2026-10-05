import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {platformRuntime,measurements,shifted,distance,local} from './platform_endpoints_fixture.mjs';

for(const zoom of [14,16,18,20])test(`줌 ${zoom}: 전 역 승강장 양 끝에서 기본 지도 노선이 중심 0.1m 이내를 지나가요`,()=>{
 const r=platformRuntime(undefined,zoom),m=measurements(r);
 assert.equal(m.length,1594);
 assert.deepEqual(m.filter(x=>x.distance>.1),[]);
 // 각 인접 구간도 양쪽 막대에 들어와야 해요. 다른 구간이 오류를 가리는 것을 막아요.
 Object.keys(r.raw).forEach((key,i)=>{
   const [line,a,b]=key.split(':'),c=r.lines[i].geometry.coordinates;
   for(const id of [a,b])for(const p of shifted(r.rects.get(`${line}:${id}`).coords,r.rects.get(`${line}:${id}`).offset,zoom))assert.ok(distance(p,c)<.1,`${key}: ${id}`);
 });
});

test('기본 노선 보정은 승강장·stops·열차용 원본 경로와 심시티 경로를 바꾸지 않아요',()=>{
 const r=platformRuntime(),rects=JSON.stringify([...r.rects]),stops=vm.runInContext('JSON.stringify(stops)',r.context),raw=JSON.stringify(r.raw);
 vm.runInContext('simcity=true;buildStationFeatures()',r.context);
 assert.equal(JSON.stringify([...r.rects]),rects);
 const features=vm.runInContext('buildLineFeatures()',r.context);
 features.forEach((f,i)=>assert.equal(JSON.stringify(f.geometry.coordinates),JSON.stringify(Object.values(r.raw)[i])));
 vm.runInContext('simcity=false;buildLineFeatures()',r.context);
 assert.equal(vm.runInContext('JSON.stringify(stops)',r.context),stops);
 assert.equal(JSON.stringify(r.raw),raw);
});

export function sharpTurns(coords,resample=false){
 let points=[];
 if(resample){
   points=[coords[0]];let left=10;
   for(let i=1;i<coords.length;i++){let a=coords[i-1],b=coords[i],d=Math.hypot(...local(b,a));while(d>=left){const t=left/d,q=a.map((v,j)=>v+(b[j]-v)*t);points.push(q);a=q;d=Math.hypot(...local(b,a));left=10}left-=d}
 }else for(const p of coords)if(!points.length||Math.hypot(...local(p,points.at(-1)))>=1)points.push(p);
 const hits=[];
 for(let i=1;i<points.length-1;i++){
   const a=local(points[i-1],points[i]),b=local(points[i+1],points[i]),la=Math.hypot(...a),lb=Math.hypot(...b);
   if(!resample&&(la<=8||lb<=8))continue;
   const angle=180-Math.acos(Math.max(-1,Math.min(1,(a[0]*b[0]+a[1]*b[1])/(la*lb))))*180/Math.PI;
   if(angle>50)hits.push({i,angle});
 }
 return hits;
}
for(const zoom of [14,16,18,20])test(`줌 ${zoom}: 보정 경로의 50도 초과 급한 꺾임은 기존 기준과 10m 재표본 기준 모두 0이에요`,()=>{
 const r=platformRuntime(undefined,zoom),keys=Object.keys(r.raw);
 for(const resample of [false,true])assert.deepEqual(Array.from(r.lines).flatMap((f,i)=>sharpTurns(f.geometry.coordinates,resample).map(t=>({key:keys[i],...t}))),[]);
});

test('줌 변경 시 공유 선로 연결만 다시 계산하고 전체 노선 자료를 갱신해요',()=>{
 const r=platformRuntime(),expected=platformRuntime(undefined,18),before=r.lines.map(f=>JSON.stringify(f.geometry.coordinates));
 let handler,data;
 r.context.map={getZoom:()=>18,on:(event,fn)=>{assert.equal(event,'zoom');handler=fn},getSource:id=>{assert.equal(id,'routes');return {setData:d=>{data=d}}}};
 const hook=r.source.split('\n').find(line=>line.includes("map.on('zoom',()=>{if(coaster||simcity||!platformRouteFeatures.length)"));
 assert.ok(hook);
 vm.runInContext(hook,r.context);handler();
 assert.equal(JSON.stringify(data.features),JSON.stringify(expected.lines));
 assert.ok(r.lines.some((f,i)=>JSON.stringify(f.geometry.coordinates)!==before[i]));
});
