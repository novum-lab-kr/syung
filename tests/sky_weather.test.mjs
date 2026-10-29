import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherArt,weatherLabel,sceneFor,fetchWeather,devWeather} from '../web/map/sky_weather.mts';

const base={tempC:12.4,sky:'clear',precip:'none',rainMm:0,windMs:2,lightning:false};

test('하늘 그림 날씨: 맑음은 장면 없이 기온 글만, 구름 많음은 옅은 가림막 · 흐림은 짙은 가림막',()=>{
  const clear=weatherArt(base,false);assert.equal(clear.back,'');assert.deepEqual(clear.scene,{clouds:null,fall:null});assert.equal(clear.cover,'clear');assert.equal(clear.temp,'12°');assert.equal(clear.label,'맑음 12도');
  const grey=weatherArt({...base,sky:'overcast'},false);assert.match(grey.back,/<rect width="320"/);assert.deepEqual(grey.scene,{clouds:'overcast',fall:null});assert.equal(grey.cover,'hidden');
  const cloudy=weatherArt({...base,sky:'cloudy'},false);assert.match(cloudy.back,/<rect width="320"[^>]*opacity="0?\.16"/);assert.equal(cloudy.scene.clouds,'cloudy');assert.equal(cloudy.cover,'half');
  assert.equal(cloudy.over(100,30).includes('<g transform'),true);assert.equal(clear.over(100,30),'');
});

test('하늘 그림 날씨: 비 · 눈 · 진눈깨비 · 낙뢰마다 틀 장면을 고른다',()=>{
  const fall=extra=>sceneFor({...base,...extra}).fall;
  assert.equal(fall({precip:'rain',rainMm:.2}),'rain');assert.equal(fall({precip:'rain',rainMm:12}),'heavyrain');assert.equal(fall({precip:'drizzle'}),'drizzle');
  assert.equal(fall({precip:'snow'}),'snow');assert.equal(fall({precip:'flurry'}),'flurry');
  assert.equal(fall({precip:'rain_snow'}),'sleet');assert.equal(fall({precip:'sleet_drizzle'}),'sleet');
  assert.equal(fall({precip:'rain',lightning:true}),'storm');assert.equal(fall({lightning:true}),'storm');
  assert.equal(fall({}),null);
});

test('하늘 그림 날씨: 비 · 눈이 오면 하늘이 맑음으로 와도 흐린 구름, 쌓인 눈은 눈 올 때만, 이름 · 기온 없음',()=>{
  assert.equal(sceneFor({...base,precip:'rain'}).clouds,'overcast');
  assert.equal(sceneFor({...base,precip:'rain',rainMm:12}).clouds,'storm','큰비 · 낙뢰는 짙은 구름');assert.equal(sceneFor({...base,lightning:true}).clouds,'storm');
  const roofs=[[96,14,66]];
  assert.equal(weatherArt({...base,precip:'rain'},false).pile(roofs,84),'');assert.match(weatherArt({...base,precip:'snow'},false).pile(roofs,84),/<rect/);
  assert.equal(weatherLabel({...base,precip:'rain_snow',lightning:true}),'낙뢰 진눈깨비 12도');
  const none=weatherArt({...base,tempC:null,sky:'overcast'},false);assert.equal(none.temp,'');assert.equal(none.label,'흐림');
});

test('날씨 받기: 서울 좌표로 묻고 10분 캐시, 실패 · 오류는 null, localhost 가 아니면 개발용 주소 칸은 읽지 않는다',async t=>{
  const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{urls.push(String(url));return {ok:true,json:async()=>({ok:true,tempC:3,sky:'overcast',precip:'snow',rainMm:0,windMs:1,lightning:false})}});
  const first=await fetchWeather(null);assert.deepEqual([first.sky,first.precip,first.tempC],['overcast','snow',3]);
  assert.match(urls[0],/lat=37\.5665&lng=126\.9780/);
  await fetchWeather(null);assert.equal(urls.length,1,'같은 칸 10분 안에는 다시 안 묻는다');
  globalThis.location={hostname:'syung.novum-lab.com',search:'?weather=rain&temp=12'};
  assert.equal(devWeather(),null,'운영 호스트에서는 안 먹는다');
  globalThis.location={hostname:'localhost',search:'?weather=rain&temp=7&mm=5'};
  const dev=devWeather();assert.deepEqual([dev.precip,dev.tempC,dev.rainMm],['rain',7,5]);
  delete globalThis.location;
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline')});
  assert.equal(await fetchWeather([127.5,36.5]),null);
});
