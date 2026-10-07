import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {platformRuntime,measurements,distance,local} from './platform_endpoints_fixture.mjs';

for(const zoom of [14,16,18,20])test(`줌 ${zoom}: 전 역 승강장 양 끝과 중심선이 표시 노선 0.1m 이내에 있어요`,()=>{
 const r=platformRuntime(undefined,zoom),m=measurements(r);
 assert.equal(m.length,1594);assert.deepEqual(m.filter(x=>x.distance>.1),[]);
 for(const [key,rect] of r.rects){
   const i=key.lastIndexOf(':'),line=key.slice(0,i),id=key.slice(i+1),lines=Object.keys(r.raw).flatMap((k,j)=>k.startsWith(line+':')&&k.split(':').slice(-2).includes(id)?[r.lines[j].geometry.coordinates]:[]);
   for(const p of rect.coords)assert.ok(Math.min(...lines.map(c=>distance(p,c)))<.1,key);
   assert.equal(rect.half,r.context.platformHalf[key]||90);
 }
});

export function sharpTurns(coords,resample=false){
 let points=[];
 if(resample){points=[coords[0]];let left=10;for(let i=1;i<coords.length;i++){let a=coords[i-1],b=coords[i],d=Math.hypot(...local(b,a));while(d>=left){const t=left/d,q=a.map((v,j)=>v+(b[j]-v)*t);points.push(q);a=q;d=Math.hypot(...local(b,a));left=10}left-=d}}
 else for(const p of coords)if(!points.length||Math.hypot(...local(p,points.at(-1)))>=1)points.push(p);
 const hits=[];
 for(let i=1;i<points.length-1;i++){const a=local(points[i-1],points[i]),b=local(points[i+1],points[i]),la=Math.hypot(...a),lb=Math.hypot(...b);if(!resample&&(la<=8||lb<=8))continue;const angle=180-Math.acos(Math.max(-1,Math.min(1,(a[0]*b[0]+a[1]*b[1])/(la*lb))))*180/Math.PI;if(angle>50)hits.push({i,angle})}
 return hits;
}
for(const zoom of [14,16,18,20])test(`줌 ${zoom}: 일원 포함 전 구간 급한 꺾임 0이에요`,()=>{
 const r=platformRuntime(undefined,zoom),keys=Object.keys(r.raw);
 const strict=Array.from(r.lines).flatMap((f,i)=>sharpTurns(f.geometry.coordinates).map(t=>({key:keys[i],...t})));
 assert.deepEqual(strict,[]);
 // 10m 재표본의 원본 굽이도 함께 비교해요. 기본 막대 때문에 추가된 꺾임은 허용하지 않아요.
 const baseline=Object.entries(r.raw).flatMap(([key,c])=>sharpTurns(c,true).map(t=>({key,angle:t.angle})));
 const sampled=Array.from(r.lines).flatMap((f,i)=>sharpTurns(f.geometry.coordinates,true).map(t=>({key:keys[i],angle:t.angle})));
 assert.deepEqual(sampled,baseline);
 assert.ok(!sampled.some(t=>t.key==='3호선:84:85'));
});

test('줌 변경은 공유 선로 간격과 승강장을 함께 갱신하고 반복 줌은 갱신하지 않아요',()=>{
 const r=platformRuntime(),expected=platformRuntime(undefined,18);const on={};let labelUpdates=0;const updates=[];
 r.context.rebuildLabels=()=>{labelUpdates++};r.context.labelsStale=false;
 r.context.map={getZoom:()=>18,on:(event,fn)=>{on[event]=fn},getSource:id=>({setData:d=>updates.push({id,data:JSON.stringify(d)})})};
 const lines=r.source.split('\n'),hook=lines.find(line=>line.includes("map.on('zoom',()=>{if(coaster||simcity)return;")),end=lines.find(line=>line.includes("map.on('zoomend',"));
 assert.ok(hook&&end);vm.runInContext(hook+'\n'+end,r.context);on.zoom();
 assert.equal(updates[0].id,'routes');assert.equal(updates[0].data,JSON.stringify({type:'FeatureCollection',features:expected.lines}));assert.equal(updates[1].id,'stations');
 assert.equal(labelUpdates,0);on.zoomend();assert.equal(labelUpdates,1);   // 이름표는 줌이 끝난 뒤 한 번만
 on.zoom();on.zoomend();assert.equal(updates.length,2);assert.equal(labelUpdates,1);
});
