import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {platformRuntime,distance} from './platform_endpoints_fixture.mjs';
import {closestPlatformPoint} from '../web/lib/platform_route.mts';
const xy=p=>({x:p[0],y:p[1]});

test('출구 연결점은 곡선 승강장과 양 끝 중 가장 가까운 곳에 닿아요',()=>{
 const points=[{x:0,y:0},{x:10,y:0},{x:10,y:10}];
 assert.deepEqual(closestPlatformPoint({x:20,y:8},points),{x:10,y:8,distance:10});
 assert.deepEqual(closestPlatformPoint({x:-5,y:0},points),{x:0,y:0,distance:5});
});
test('전 역 출구의 실제 막대 접점은 막대 위에 있고 렌더러가 같은 함수를 사용해요',()=>{
 const r=platformRuntime(),exits=JSON.parse(readFileSync(new URL('../data/osm-tracks/exits.json',import.meta.url),'utf8'));
 let count=0;
 for(const [key,rect] of r.rects){const id=key.slice(key.lastIndexOf(':')+1),coords=rect.coords;for(const p of exits[id]||[]){const foot=closestPlatformPoint(xy(p),coords.map(xy));assert.ok(foot);assert.ok(distance([foot.x,foot.y],coords)<.1,key);count++}}
 assert.ok(count>1000);
 const layer=readFileSync(new URL('../web/map/platform.mts',import.meta.url),'utf8');   // 승강장 · 출구 그리기
 assert.ok(layer.includes('if(g.points){const foot=closestPlatformPoint(e,g.points)'));
 assert.ok(layer.includes('pass.push([(foot.x+e.x)/2,(foot.y+e.y)/2'));
});
