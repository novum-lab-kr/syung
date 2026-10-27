import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSettings,freezeSettings,validateSettings,validateModeDefinitions} from '../web/modes/merge.mts';
import {createModeRegistry} from '../web/modes/index.mjs';

// 시험용 정의: 실제 basic · simcity · joseon · coaster 와 같은 모양(조선 · 롤코는 simcity 에서)
const defs=()=>[
  {id:'basic',settings:{themeChoice:'auto',mapColor:'calm',city:{enabled:false,pack:{floor:{light:'#eeeeee',dark:'#222222'},lod:[14,16]},life:{cars:true}},track:{kind:'ground'},show:null}},
  {id:'simcity',from:'basic',settings:{city:{enabled:true},track:{kind:'viaduct'}}},
  {id:'joseon',from:'simcity',label:'조선',settings:{city:{pack:{floor:{light:'#ccbb99'}},life:{cars:false}},buses:{look:'palanquin'}}},
  {id:'coaster',from:'simcity',settings:{track:{kind:'coaster'},show:{enabled:true,lights:[1,2]}}},
];

test('합치기: 묶음은 안쪽까지, 값 · 목록은 통째로, null 은 끄기, 안 적으면 물려받기', () => {
  const base={a:{b:1,c:[1,2,3],d:{e:'x'}},f:true,g:{h:1}};
  const out=mergeSettings(base,{a:{c:[9],d:{z:2}},f:null,n:{m:1}});
  assert.deepEqual(out,{a:{b:1,c:[9],d:{e:'x',z:2}},f:null,g:{h:1},n:{m:1}});
  assert.equal(out.g,base.g,'안 바뀐 묶음은 같은 참조');
  assert.deepEqual(base,{a:{b:1,c:[1,2,3],d:{e:'x'}},f:true,g:{h:1}},'입력은 그대로');
  assert.equal(mergeSettings(base,{a:{b:1}}),base,'같은 값만 적으면 바뀐 게 없다');
  assert.equal(mergeSettings(base,undefined),base);
  assert.deepEqual(Object.keys(mergeSettings({x:1,y:2},{z:3,x:4})),['x','y','z'],'키 차례: 기본 차례 그대로, 새 키는 뒤에');
});

test('합치기 결과가 옛 city_style_joseon(3529628)의 merge 와 같다', async () => {
  const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const old=(a,b)=>{const o={...a};for(const [k,v] of Object.entries(b))o[k]=isObj(v)&&isObj(a?.[k])?old(a[k],v):v;return o};
  const {default:SEOUL}=await import('../web/modes/basic/city.mjs');
  const delta={id:'j',ground:{light:{base:'#000'}},hanok:{tall:{towerMinH:15}},xray:null,roads:{widths:[1,2]}};
  assert.equal(JSON.stringify(mergeSettings(SEOUL,delta)),JSON.stringify(old(SEOUL,delta)));
});

test('검사: 함수 · getter · 클래스 객체 · 나쁜 키 · 무한대는 설정에 못 넣는다', () => {
  assert.throws(()=>validateSettings({a:()=>1}),/데이터가 아님/);
  assert.throws(()=>validateSettings({a:{get b(){return 1}}}),/getter/);
  assert.throws(()=>validateSettings({a:new Map()}),/평범한 객체가 아님/);
  assert.throws(()=>validateSettings(JSON.parse('{"__proto__":{"x":1}}')),/쓸 수 없는 키/);
  assert.throws(()=>validateSettings({a:[1,Infinity]}),/유한한 수/);
  assert.throws(()=>validateSettings(Object.defineProperty({},'city',{value:{on:true},enumerable:false})),/숨은/);
  assert.throws(()=>mergeSettings({a:1},JSON.parse('{"__proto__":{"x":1}}')),/쓸 수 없는 키/);
  assert.doesNotThrow(()=>validateSettings({a:null,b:[{c:'#fff'}],d:Object.create(null)}));
});

test('얼리기: 안쪽까지 — 겉만 얼린 묶음도 안쪽까지', () => {
  const shallow=Object.freeze({x:{y:1}});
  const S=freezeSettings({a:{b:[1]},s:shallow});
  assert.ok(Object.isFrozen(S.a.b));
  assert.ok(Object.isFrozen(shallow.x),'겉만 얼린 묶음의 안쪽도 얼린다');
  assert.equal(freezeSettings(S),S);
});

test('검사: 같이 쓰는 묶음은 되고 순환은 안 된다', () => {
  const shared={c:1};
  assert.doesNotThrow(()=>validateSettings({a:shared,b:shared,l:[shared,shared]}));
  const loop={a:{}};loop.a.back=loop;
  assert.throws(()=>validateSettings(loop),/순환/);
  const arr=[];arr.push(arr);
  assert.throws(()=>validateSettings({arr}),/순환/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:loop}]),/순환/);
});

test('정의 검사: 없는 부모 · 순환 · 깊이 · 중복 · 기본 없음은 시작할 때 알린다', () => {
  assert.throws(()=>validateModeDefinitions([{id:'basic'},{id:'a',from:'zz'}]),/없는 부모/);
  assert.throws(()=>validateModeDefinitions([{id:'basic'},{id:'a',from:'b'},{id:'b',from:'a'}]),/순환/);
  assert.throws(()=>validateModeDefinitions([{id:'basic'},{id:'a'},{id:'b',from:'a'},{id:'c',from:'b'}]),/너무 깊음/);
  assert.throws(()=>validateModeDefinitions([{id:'basic'},{id:'basic'}]),/중복/);
  assert.throws(()=>validateModeDefinitions([{id:'a'}]),/기본 모드가 없음/);
  assert.throws(()=>validateModeDefinitions([{id:'basic',from:'a'},{id:'a'}]),/부모가 없음/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{f:()=>1}}]),/데이터가 아님/);
  assert.doesNotThrow(()=>validateModeDefinitions(defs()));
});

test('상속: 조선 · 롤코는 심시티에서, from 생략은 basic, 기본을 고치면 안 적은 모든 모드에 간다', () => {
  const R=createModeRegistry(defs());
  const J=R.settings('joseon'),C=R.settings('coaster'),S=R.settings('simcity');
  assert.equal(J.city.enabled,true);assert.equal(J.track.kind,'viaduct');assert.equal(J.city.pack.floor.light,'#ccbb99');assert.equal(J.city.pack.floor.dark,'#222222');
  assert.equal(C.track.kind,'coaster');assert.deepEqual(C.show,{enabled:true,lights:[1,2]});assert.equal(R.settings('basic').show,null);
  assert.equal(C.city.pack,S.city.pack,'롤코 · 심시티 도시 팩은 같은 참조');
  assert.notEqual(J.city.pack,S.city.pack);
  assert.equal(R.settings('simcity'),S,'같은 모드는 같은 결과(캐시)');
  assert.ok(Object.isFrozen(J.city.pack.floor));
  assert.deepEqual(R.chain('joseon'),['basic','simcity','joseon']);
  assert.deepEqual(R.list().map(m=>[m.id,m.from]),[['basic',null],['simcity','basic'],['joseon','simcity'],['coaster','simcity']]);
  const d=defs();d[0].settings.city.pack.lod=[13,15];d[0].settings.newThing={on:true};
  const R2=createModeRegistry(d);
  for(const id of ['simcity','joseon','coaster']){assert.deepEqual(R2.settings(id).city.pack.lod,[13,15]);assert.equal(R2.settings(id).newThing.on,true)}
  assert.equal(R2.settings('joseon').city.pack.floor.light,'#ccbb99','모드가 적은 값은 그대로');
});

test('내 설정: 테마 · 지도 색만, 허용된 값만, 도시 팩 참조는 그대로', () => {
  const R=createModeRegistry(defs());
  const A=R.settings('coaster',{themeChoice:'dark',mapColor:'color'});
  assert.equal(A.themeChoice,'dark');assert.equal(A.mapColor,'color');
  assert.equal(A.city.pack,R.settings('simcity').city.pack,'테마가 바뀌어도 도시 팩은 같은 참조(건물 타일을 다시 짓지 않게)');
  assert.equal(R.settings('coaster',{mapColor:'color',themeChoice:'dark'}),A,'같은 값이면 같은 결과');
  assert.equal(R.settings('coaster',{}),R.settings('coaster'));
  assert.throws(()=>R.settings('coaster',{city:{enabled:false}}),/못 바꾸는/);
  assert.throws(()=>R.settings('coaster',{themeChoice:'sepia'}),/허용되지 않는/);
  assert.throws(()=>R.settings('nope'),/없는 모드/);
  let reads=0;const tricky={get themeChoice(){return ++reads<3?'dark':'sepia'}};
  assert.throws(()=>R.settings('coaster',tricky),/getter/,'getter 로 값 바꿔치기 막기');
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{themeChoice:'sepia'}}]),/허용되지 않는/,'정의의 기본값도 허용 값만');
});

test('만든 뒤 정의를 바꿔도 레지스트리는 그대로', () => {
  const d=defs(),R=createModeRegistry(d),J=R.settings('joseon');
  d[2].from='basic';d.push({id:'late',settings:{}});
  assert.throws(()=>{d[1].settings.city.enabled=false},TypeError,'정의 설정은 얼려 둔다');
  assert.deepEqual(R.chain('joseon'),['basic','simcity','joseon']);
  assert.equal(R.settings('joseon'),J);assert.equal(R.explain('joseon').sources['city.enabled'],'simcity');
  assert.equal(R.has('late'),false);assert.equal(R.list().length,4);
});

test('출처 보기: 키마다 마지막으로 적은 모드', () => {
  const R=createModeRegistry(defs());
  const e=R.explain('joseon');
  assert.deepEqual(e.chain,['basic','simcity','joseon']);
  assert.equal(e.sources['city.enabled'],'simcity');assert.equal(e.sources['city.pack.floor.light'],'joseon');assert.equal(e.sources['city.pack.floor.dark'],'basic');
  assert.equal(e.sources['show'],'basic');
  const c=R.explain('coaster');assert.equal(c.sources['show.enabled'],'coaster');assert.equal(c.sources['show'],undefined);
});

test('실제 모드 정의: 넷 다 검사를 지나고, 지도 색은 기본 하나를 같이 쓴다', async () => {
  const defs=await Promise.all(['basic','simcity','joseon','coaster'].map(n=>import(`../web/modes/${n}/index.mjs`).then(m=>m.default)));
  const R=createModeRegistry(defs);
  assert.deepEqual(R.list().map(m=>[m.id,m.from]),[['basic',null],['simcity','basic'],['joseon','simcity'],['coaster','simcity']]);
  const B=R.settings('basic');
  for(const id of ['simcity','joseon','coaster'])for(const k of ['themes','colors','park'])assert.equal(R.settings(id).map[k],B.map[k],`${id} 지도 색 = 기본`);
  // 모드가 묻는 설정(4-6): 지도 색 종류 · 도시 켜짐 · 흙 질감 · 해 (롤코도 고층은 건물 그대로 — 2026-10-11)
  const q=id=>{const S=R.settings(id);return [S.map.paletteKind,S.city.enabled,S.map.verticalGradient,S.city.groundTexture,S.sun.light,S.sun.lowHouseM,S.park.enabled]};
  assert.deepEqual(q('basic'),['base',false,true,false,'map',null,false]);
  assert.deepEqual(q('simcity'),['city',true,true,false,'map',null,false]);
  assert.deepEqual(q('joseon'),['city',true,true,true,'map',5,false]);
  assert.deepEqual(q('coaster'),['park-city',true,false,false,'park',null,true]);
  const badS=S=>()=>createModeRegistry([{id:'basic',settings:S}]);
  assert.throws(badS({map:{paletteKind:'neon'}}),/허용되지 않는/);assert.throws(badS({sun:{light:'moon'}}),/허용되지 않는/);
  assert.throws(badS({map:{verticalGradient:1}}),/참 · 거짓/);assert.equal(R.settings('coaster').map.towersAsRides,undefined);assert.throws(badS({sun:{lowHouseM:0}}),/lowHouseM/);
  // 선로 · 열차(4-7 · 4-8)
  const tr=id=>{const S=R.settings(id);return [S.track.kind,S.track.platform,S.trains.look,S.trains.body,S.trains.predictStops,S.trains.timeWarp]};
  assert.deepEqual(tr('basic'),['ground','ribbon','commuter','wide',3,false]);
  assert.deepEqual(tr('simcity'),['viaduct','ribbon','commuter','slim',3,false]);
  assert.deepEqual(tr('joseon'),['viaduct','ribbon','fleet','slim',3,false]);
  assert.deepEqual(tr('coaster'),['coaster','ribbon','coaster88','slim',99,true]);
  assert.deepEqual(['basic','simcity','joseon','coaster'].map(id=>R.settings(id).city.xray),[false,true,true,false],'x-ray: 심시티 · 조선만');
  assert.deepEqual(['basic','simcity','joseon','coaster'].map(id=>[R.settings(id).city.life.cars,R.settings(id).city.life.crossings,R.settings(id).city.landmarks]),
    [[true,true,'tower'],[true,true,'tower'],[false,false,'wood-tower'],[true,true,'tower']],'조선: 차 · 횡단보도 없음, 나무 탑');
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{city:{landmarks:'pagoda'}}}]),/허용되지 않는/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{city:{life:{cars:'no'}}}}]),/참 · 거짓/);
  for(const v of [null,false,[],0])assert.throws(()=>createModeRegistry([{id:'basic',settings:{city:{life:v}}}]),/묶음/,`city.life ${JSON.stringify(v)}`);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{trains:null}}]),/묶음/);
  assert.deepEqual(['basic','simcity','joseon','coaster'].map(id=>R.settings(id).buses.look),['bus','bus','palanquin','bus'],'조선: 가마');
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{buses:{look:'tram'}}}]),/허용되지 않는/);
  assert.deepEqual(['basic','simcity','joseon','coaster'].map(id=>R.settings(id).me.look),['sprout','builder','seonbi','visitor'],'내 위치 캐릭터: 모드마다');
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{me:{look:'robot'}}}]),/허용되지 않는/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{me:null}}]),/묶음/);
  assert.deepEqual(['basic','simcity','joseon','coaster'].map(id=>[R.settings(id).city.tone,R.settings(id).city.lampPool]),[['simcity',1.4],['simcity',1.4],['simcity',1.4],['coaster',null]],'도시 톤 · 가로등 웅덩이(롤코는 팩 modes.coaster.lampPool)');
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{city:{tone:'neon',pack:R.settings('basic').city.pack}}}]),/modes 에 없는/);
  const P0=R.settings('basic').city.pack,city=c=>()=>createModeRegistry([{id:'basic',settings:{city:{tone:'simcity',lampPool:1.4,pack:P0,...c}}}]);
  for(const t of [null,'toString','colorMath',['coaster']])assert.throws(city({tone:t}),/톤/,String(t));
  assert.throws(city({lampPool:0}),/lampPool/);
  assert.throws(city({tone:'coaster',lampPool:null,pack:mergeSettings(P0,{modes:{coaster:{lampPool:0}}})}),/lampPool/,'톤의 lampPool 도 검사');
  assert.doesNotThrow(city({tone:'coaster',lampPool:null}));
  for(const v of [0,-1,'bad',false])assert.throws(()=>createModeRegistry([{id:'basic',settings:{city:{lampPool:v}}}]),/lampPool/,`톤 없이도 ${v}`);
  assert.throws(badS({trains:{look:'tram'}}),/허용되지 않는/);assert.throws(badS({trains:{predictStops:0}}),/predictStops/);assert.throws(badS({track:{kind:'air'}}),/허용되지 않는/);
  const {MAP_THEMES,MAP_COLORS,PARK_COLORS}=await import('../web/modes/basic/palette.mts');
  assert.equal(B.map.themes,MAP_THEMES);assert.equal(B.map.colors,MAP_COLORS);assert.equal(B.map.park,PARK_COLORS);
  assert.equal(B.themeChoice,'auto');assert.equal(B.mapColor,'calm');
  const bad=(map)=>createModeRegistry([{id:'basic',settings:{map}}]);
  assert.throws(()=>bad({themes:{light:{bg:'not-a-color'}}}),/색이 아님/);
  assert.throws(()=>bad({park:{light:{blocks:['#fff']}}}),/색이 아님/,'짧은 #fff 는 지금 섞는 식(mixHex)이 못 읽는다');
  assert.throws(()=>bad({themes:{light:{bld3dOpacity:-1}}}),/음수/);
  assert.doesNotThrow(()=>bad({themes:{light:{halo:'rgba(255,255,255,.9)',bld3dOpacity:.5}}}));
});

test('도시 팩: 옮긴 원본 · 조선 합친 결과가 옮기기 전 값과 같고, 심시티 · 롤코는 같은 참조', async () => {
  const crypto=await import('node:crypto'),sha=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
  const defs=await Promise.all(['basic','simcity','joseon','coaster'].map(n=>import(`../web/modes/${n}/index.mjs`).then(m=>m.default)));
  const R=createModeRegistry(defs),{default:CITY}=await import('../web/modes/basic/city.mjs');
  // 옮기기 전(3529628) JSON.stringify 의 SHA-256 — 4단계 설계서의 독립 기준. 그 뒤 더한 것(night: 2026-10-11 밤 빛, 골목 가로등 lamps.minorSpacingM)은 빼고 견준다
  const before=({night,...o})=>{const {minorSpacingM,...lamps}=o.props.lamps;return {...o,props:{...o.props,lamps}}};
  assert.equal(sha(before(CITY)),'f62442b8b7887c4d012dab5cfe451e31b56e481f6124b516bdfa207180fa999e');
  // 조선 횃불(props.lamps) · 옷차림(props.people.outfits) · 석탑 자리(landmarkHide)는 2026-10-11 행님 요청으로 더했다 — 그것만 빼고 견준다(그 밖은 옮기기 전 그대로)
  const noLamps=({night,landmarkHide,...o})=>{const {lamps,...props}=o.props;const {outfits,outfitWeights,...people}=props.people;return {...o,props:{...props,people}}};   // (조선 옷차림 people.outfits 도 2026-10-11 더함)
  assert.equal(sha(noLamps(R.settings('joseon').city.pack)),'1be56617e0779d5e4b38bc112a468eab92b3624bcd42a28ce69283a4b907f94c');
  const {JOSEON_CITY_STYLE:J_TEST}=await import('./joseon_pack.mjs');assert.equal(sha(J_TEST),sha(R.settings('joseon').city.pack),'시험용 조선 팩도 같은 값');
  for(const id of ['basic','simcity','coaster'])assert.equal(R.settings(id).city.pack,CITY,`${id} 도시 팩 = 원본 그대로`);
  assert.equal(R.settings('joseon',{themeChoice:'dark'}).city.pack,R.settings('joseon').city.pack,'테마가 바뀌어도 조선 팩 참조 그대로');
  assert.ok(Object.isFrozen(CITY.viaduct));
  const bad=pack=>createModeRegistry([{id:'basic',settings:{city:{pack}}}]);
  assert.throws(()=>bad({buildings:{floorM:-1}}),/음수/);
  assert.throws(()=>bad({ground:{light:{base:'oops#'}},x:{color:'red'}}),/색이 아님/);
  assert.throws(()=>bad({ground:{light:{base:'#fff'}}}),/색이 아님/);
  assert.throws(()=>bad({lod:{windows:[15]}}),/두 개/);
  assert.throws(()=>bad({viaduct:{lod:{deck:[14.2,13.6]}}}),/시작 ≤ 끝/);
  assert.throws(()=>bad({roads:{lane:{minZoom:40}}}),/줌 범위/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{city:{pack:CITY}}},{id:'j',settings:{city:{pack:{ground:{light:{base:'#12'}}}}}}]),/색이 아님/,'모드 덧쓰기도 합친 뒤 검사');
});

test('공원 자료: 옮긴 원본이 옮기기 전 값과 같고, 롤코만 켠다', async () => {
  const crypto=await import('node:crypto'),sha=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
  const defs=await Promise.all(['basic','simcity','joseon','coaster'].map(n=>import(`../web/modes/${n}/index.mjs`).then(m=>m.default)));
  const R=createModeRegistry(defs),{default:PARK}=await import('../web/modes/basic/park.mjs');
  assert.equal(sha(PARK),'31c26c9c23d4bc944e8b81a65e082b85aea67ed6cc00c58247f2748dc70512aa');
  const M=await import('../web/modes/coaster/metrics.mjs');assert.equal(typeof M.trackMetrics,'function');assert.deepEqual(M.ridePalette(false),M.ridePalette(false,PARK),'계산 함수의 기본 자료 = 기본 공원 자료');
  for(const id of ['basic','simcity','joseon'])assert.equal(R.settings(id).park.enabled,false,id);
  assert.equal(R.settings('coaster').park.enabled,true);assert.equal(R.settings('coaster').park.style,PARK);assert.equal(R.settings('coaster').park.towerM,150);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{park:{towerM:0,style:{}}}}]),/towerM/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{park:{towerM:true}}}]),/towerM/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{park:{towerM:'150'}}}]),/towerM/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{park:{enabled:'false'}}}]),/참 · 거짓/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{park:{style:{palette:{light:{red:'oops'}}}}}}]),/색이 아님/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{park:{style:{lod:{canopy:[]}}}}}]),/두 개/);
  assert.throws(()=>createModeRegistry([{id:'basic',settings:{park:{towerM:1,style:{palette:{light:{red:'#c94'}}}}}}]),/색이 아님/);
});
