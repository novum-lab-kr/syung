import test from 'node:test';
import assert from 'node:assert/strict';
import {createUserPrefs,PREF_KEYS} from '../web/user/prefs.mts';

const mem=(init={})=>{const m=new Map(Object.entries(init));return {m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))}};

test('내 설정: 저장 이름 그대로, 허용 값만 읽고 쓴다', () => {
  assert.deepEqual(PREF_KEYS,{themeChoice:'subway-theme',mapColor:'subway-map-color',prebuild:'subway-prebuild',saver:'subway-saver'},'첫 그리기 전 스크립트(index.html 등)와 같은 이름');
  const s=mem({'subway-theme':'dark','subway-map-color':'neon'}),P=createUserPrefs({storage:s});
  assert.equal(P.get('themeChoice'),'dark');assert.equal(P.get('mapColor'),null,'허용 안 된 값은 버린다 → 모드 기본값');
  assert.equal(P.set('mapColor','color'),'color');assert.equal(s.m.get('subway-map-color'),'color');
  assert.throws(()=>P.set('themeChoice','sepia'),/허용되지 않는/);assert.equal(s.m.get('subway-theme'),'dark');
  assert.throws(()=>P.set('city','x'),/허용되지 않는/);
  assert.deepEqual(P.all(),{themeChoice:'dark',mapColor:'color'});
  assert.equal(P.set('prebuild','off'),'off');assert.equal(s.m.get('subway-prebuild'),'off','기기에만 두는 미리 짓기');assert.throws(()=>P.set('prebuild','yes'),/허용되지 않는/);
  assert.equal(P.set('saver','on'),'on');assert.equal(s.m.get('subway-saver'),'on','기기에만 두는 절전');assert.throws(()=>P.set('saver','20'),/허용되지 않는/);
});

test('내 설정: 저장소가 막혀도(사생활 창) 이번 화면에서는 고른 값', () => {
  const blocked={getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}};
  const P=createUserPrefs({storage:blocked});assert.equal(P.get('themeChoice'),null);
  assert.equal(P.set('themeChoice','light'),'light');assert.equal(P.get('themeChoice'),'light');
  assert.equal(createUserPrefs({storage:undefined}).get('mapColor'),null);
});

test('내 설정: localStorage 에 손대기만 해도 던지는 브라우저에서도 시작한다', t => {
  const d=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('SecurityError')}});
  try{const P=createUserPrefs();assert.equal(P.get('themeChoice'),null);assert.equal(P.set('themeChoice','dark'),'dark')}
  finally{if(d)Object.defineProperty(globalThis,'localStorage',d);else delete globalThis.localStorage}
});
