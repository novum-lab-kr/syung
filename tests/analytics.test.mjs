// 지도 웹 GA4: 켜는 조건 · 보내는 값(금지 값이 나가지 않는지) · 실패해도 던지지 않는지
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsAllowed, startAnalytics} from '../web/lib/analytics.mts';

function fakePage(hostname = 'map.syung.novum-lab.com') {
  const target = new EventTarget(), scripts = [], idle = [];
  return {
    scripts, idle, target,
    location: {hostname, origin: `https://${hostname}`, pathname: '/'},
    document: {head: {appendChild: node => scripts.push(node)}, createElement: () => ({async: false, src: ''})},
    addEventListener: (type, listener, options) => target.addEventListener(type, listener, options),
    requestIdleCallback: callback => idle.push(callback),
    setTimeout: () => assert.fail('requestIdleCallback 이 있으면 쓰지 않는다'),
  };
}
const fire = (page, type, detail) => page.target.dispatchEvent(new CustomEvent(type, {detail}));
const events = page => page.dataLayer.map(entry => [...entry]).filter(entry => entry[0] === 'event').map(entry => entry.slice(1));

test('운영 지도 주소의 웹에서만 켠다', () => {
  assert.equal(analyticsAllowed('map.syung.novum-lab.com', false), true);
  assert.equal(analyticsAllowed('map.syung.novum-lab.com', true), false);   // 앱 지도(#app)
  for (const host of ['localhost', '127.0.0.1', 'syung.novum-lab.com']) assert.equal(analyticsAllowed(host, false), false);
});

test('앱 지도 · 로컬에서는 스크립트도 dataLayer 도 만들지 않는다', () => {
  for (const [host, app] of [['map.syung.novum-lab.com', true], ['localhost', false]]) {
    const page = fakePage(host);
    assert.equal(startAnalytics(page, app), false);
    fire(page, 'load');
    fire(page, 'syung:route');
    assert.equal(page.dataLayer, undefined);
    assert.deepEqual([page.scripts.length, page.idle.length], [0, 0]);
  }
});

test('스크립트는 load 뒤 쉴 때 한 번 부르고 주소 뒤는 보내지 않는다', () => {
  const page = fakePage();
  assert.equal(startAnalytics(page, false), true);
  assert.equal(page.scripts.length, 0);
  fire(page, 'load');
  fire(page, 'load');
  assert.equal(page.idle.length, 1);
  page.idle[0]();
  assert.equal(page.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-PV1KC7LCL6');
  assert.equal(page.scripts[0].async, true);
  const config = page.dataLayer.map(entry => [...entry]).find(entry => entry[0] === 'config');
  assert.deepEqual(config.slice(1), ['G-PV1KC7LCL6', {page_location: 'https://map.syung.novum-lab.com/', allow_google_signals: false, allow_ad_personalization_signals: false}]);
});

test('출발 · 도착 선택은 어느 쪽인지만 나간다', () => {
  const page = fakePage();
  startAnalytics(page, false);
  fire(page, 'syung:place_end', 'to');
  fire(page, 'syung:place_end', 'from');
  fire(page, 'syung:place_end', '강남역');
  fire(page, 'syung:place_end', {end: 'to', lat: 37.5});
  assert.deepEqual(events(page), [['place_end', {end: 'to'}], ['place_end', {end: 'from'}]]);
});

test('이벤트는 넷뿐이고 정한 값만 나간다', () => {
  const page = fakePage();
  startAnalytics(page, false);
  fire(page, 'syung:route', {from: '시청', to: '강남', lat: 37.5});
  fire(page, 'syung:mode', 'joseon');
  fire(page, 'syung:login', 'kakao');
  assert.deepEqual(events(page), [['route_search'], ['mode_change', {mode: 'joseon'}], ['login', {method: 'kakao'}]]);
});

test('모르는 로그인 방법 · 글자가 아닌 값은 보내지 않는다', () => {
  const page = fakePage();
  startAnalytics(page, false);
  fire(page, 'syung:login', 'user-1234');
  fire(page, 'syung:login', {id: 1});
  fire(page, 'syung:mode', {lat: 37.5});
  assert.deepEqual(events(page), []);
});

test('분석 쪽이 망가져도 던지지 않는다', () => {
  const page = fakePage();
  page.addEventListener = () => { throw new Error('막힘'); };
  assert.equal(startAnalytics(page, false), false);
});
