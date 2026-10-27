import test from 'node:test';
import assert from 'node:assert/strict';
import {cityPalette,cityLayers,tone} from '../web/city/style.mts';
import CITY from '../web/modes/basic/city.mjs';

// 도시 땅 색은 tone(팩의 modes 항목 이름)으로: 심시티 · 조선은 simcity, 롤코는 coaster(차분한 공원 톤). 기본값은 simcity(4-10 전 coaster:false 와 같음)
test('cityPalette · cityLayers: tone 이름으로 팩의 modes 항목을 고른다', () => {
  for(const th of ['light','dark']){
    assert.deepEqual(cityPalette(th,{pack:CITY}),cityPalette(th,{pack:CITY,tone:'simcity'}));
    const C=cityPalette(th,{pack:CITY,tone:'coaster'});
    assert.equal(C.cityMode,'coaster');assert.equal(C.shadow,CITY.modes.coaster.shadowOpacity[th]);
    assert.equal(C.bg,tone(CITY.ground[th].base,CITY,'coaster',th));
    assert.notEqual(C.bg,cityPalette(th,{pack:CITY}).bg,'공원 톤은 다르다');
    const L=cityLayers({pack:CITY,theme:th,mode:'coaster'}),S=cityLayers({pack:CITY,theme:th});
    assert.equal(L.length,S.length);
  }
});
