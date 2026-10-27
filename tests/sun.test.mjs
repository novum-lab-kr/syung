import test from 'node:test';
import assert from 'node:assert/strict';
import {seoulSun,sunPosition} from '../web/lib/sun.mts';

const hm=d=>d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
const day=iso=>{const t=new Date(iso),{rise,set}=seoulSun(t);return {t,rise,set,light:t>=rise&&t<set}};

test('before 09:00 KST uses the same Seoul day (was: yesterday → stayed dark after sunrise)', ()=>{
  const d=day('2026-09-25T06:36:00+09:00');
  assert.equal(hm(d.rise).slice(0,2),'06');
  assert.ok(d.rise.toISOString().startsWith('2026-09-24T21'),'sunrise is on 25 Sep KST');
  assert.equal(d.light,true);
});

test('dark before sunrise and after sunset', ()=>{
  assert.equal(day('2026-09-25T06:10:00+09:00').light,false);
  assert.equal(day('2026-09-25T18:40:00+09:00').light,false);
  assert.equal(day('2026-09-26T00:10:00+09:00').light,false);
});

test('seasons: winter solstice sunrise ~07:4x, summer ~05:1x', ()=>{
  assert.match(hm(seoulSun(new Date('2026-12-21T12:00:00+09:00')).rise),/^07:4/);
  assert.match(hm(seoulSun(new Date('2026-06-21T12:00:00+09:00')).rise),/^05:1/);
});

test('sun position: morning east, noon south and high, afternoon west', ()=>{
  const m=sunPosition(new Date('2026-09-25T08:00:00+09:00')),n=sunPosition(new Date('2026-09-25T12:30:00+09:00')),a=sunPosition(new Date('2026-09-25T17:00:00+09:00'));
  assert.ok(m.azimuth>80&&m.azimuth<130,`morning az ${m.azimuth}`);
  assert.ok(n.azimuth>160&&n.azimuth<210&&n.elevation>45,`noon az ${n.azimuth} el ${n.elevation}`);
  assert.ok(a.azimuth>230&&a.azimuth<280,`afternoon az ${a.azimuth}`);
});
