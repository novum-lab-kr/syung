import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeRegistry} from '../web/modes/index.mjs';
import {createMapTheme} from '../web/map/theme.mjs';
import {mergeSettings} from '../web/modes/merge.mjs';

const defs=await Promise.all(['basic','simcity','joseon','coaster'].map(n=>import(`../web/modes/${n}/index.mjs`).then(m=>m.default)));

// 테마는 지금 모드 설정(live.settings)의 색 자료를 읽는다: 모드가 map.themes 를 덧쓰면 그 색(4-6)
function theme(S,t){
  const el={closest:()=>({}),setAttribute(){},innerHTML:''};
  globalThis.document??={head:{insertAdjacentHTML(){}},querySelectorAll:()=>[],querySelector:()=>null,documentElement:{dataset:{}}};
  globalThis.localStorage??={getItem:()=>null,setItem(){}};
  t.mock.method(globalThis,'setInterval',()=>0);
  return createMapTheme({map:{},$:()=>el,ICONS:{},seoulSun:()=>({rise:new Date(0),set:new Date(1)}),sunPosition:()=>({elevation:30,azimuth:180}),
    cityPalette:(_t,{pack})=>({cityPack:pack.id}),applyCityStyle(){},applyGroundTexture(){},syncCity(){},updateSun(){},focusRoute(){},journeyMap:{},rider:{},
    live:{get settings(){return S()},coaster:false,busLayer:null,ready:false}});
}

test('지도 색은 지금 모드 설정에서: 기본 · 심시티(도시 땅) · 롤코(공원) 차례, 모드의 색 덧쓰기도 따른다', t => {
  const R=createModeRegistry(defs);let id='basic';const T=theme(()=>R.settings(id),t);
  const base=T.mapPalette('light');assert.equal(base.stationText,'#141414');assert.equal(base.cityPack,undefined);
  id='simcity';assert.equal(T.mapPalette('light').cityPack,'seoul');
  id='joseon';assert.equal(T.mapPalette('light').cityPack,'joseon');
  id='coaster';const C=T.mapPalette('light');assert.equal(C.bld3dOpacity,1);assert.equal(C.cityPack,'seoul');assert.ok(Array.isArray(C.bld3d),'공원 건물은 id 로 고른 색');
  // 심시티가 이름표 색을 덧쓰면 심시티와 그 자식(조선 · 롤코)에서 바뀌고 기본은 그대로
  const d=defs.map(x=>x.id==='simcity'?{...x,settings:mergeSettings(x.settings,{map:{themes:{light:{stationText:'#123456'}}}})}:x);
  const R2=createModeRegistry(d);let id2='simcity';const T2=theme(()=>R2.settings(id2),t);
  assert.equal(T2.mapPalette('light').stationText,'#123456');
  id2='joseon';assert.equal(T2.mapPalette('light').stationText,'#123456','조선은 심시티에서 물려받는다');
  id2='coaster';assert.equal(T2.mapPalette('light').stationText,'#123456','롤코도 심시티에서 물려받는다');
  id2='basic';assert.equal(T2.mapPalette('light').stationText,'#141414');
});
