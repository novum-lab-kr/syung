// capd 작업(공용 캡처 서버가 불러 실행): 역 하나를 카카오맵 · 슝 화면으로 같은 축척 · 같은 크기(1000x700) jpg 로 찍는다.
// 카카오맵은 눈 비교용 화면만 찍는다 — 좌표 · 경로 · 출구 정보를 읽거나 저장하지 않는다(시범 capd-kakao-job.mjs 방식).
// args: {views:[{kind:'kakao', label, lat, lon, steps, file} | {kind:'syung', url, center, zoom, file}]}
// pipeline/capture_platforms.mjs 가 만든다. 한 작업에 시점 3개 이하.
export default async function({open,view,args,log}){
  const files=[];
  for(const v of args.views){
    if(v.kind==='kakao'){
      const p=await open({url:'https://map.kakao.com/link/map/'+encodeURIComponent(v.label)+','+v.lat+','+v.lon,w:1000,h:700,wait:6000});
      // 장소 말풍선 닫기, 왼쪽 검색 패널 접기(지도를 가리지 않게)
      try{await p.evaluate(()=>{for(const b of document.querySelectorAll('.InfoWindow .ico_close'))b.click()})}catch(e){log('close',e.message)}
      try{const t=await p.$('#shadow\\.toggle');if(t)await t.click()}catch(e){log('fold',e.message)}
      // 링크 지도는 패널 오른쪽 가운데(약 700,338)에 역 점을 둔다: 패널을 접은 뒤 화면 가운데(500,350)로 끌어 슝 화면과 맞춘다
      // (핀을 누르지 않게 같은 만큼 아래 빈 곳에서 끈다)
      await p.waitForTimeout(800);
      await p.mouse.move(700,500);await p.mouse.down();await p.mouse.move(600,506,{steps:8});await p.mouse.move(500,512,{steps:8});await p.mouse.up();
      await p.waitForTimeout(800);
      await p.mouse.move(500,350);
      for(let i=0;i<Math.abs(v.steps||0);i++){await p.mouse.wheel(0,v.steps>0?-300:300);await p.waitForTimeout(1200)}
      await p.waitForTimeout(2500);
      await p.screenshot({path:v.file,type:'jpeg',quality:82});files.push(v.file);
    }else{
      // 열차는 끄고 찍는다(승강장 막대 · 노선 · 출구 비교용, 화면 코드는 그대로)
      const p=await open({url:v.url,w:1000,h:700,theme:'light',mode:'off',wait:v.wait||6000,patch:v.trains?null:src=>src.replace('trainsEnabled=true,','trainsEnabled=false,')});
      await view(p,{center:v.center,zoom:v.zoom,pitch:0,bearing:0,wait:v.settle||6000});
      await p.screenshot({path:v.file,type:'jpeg',quality:82});files.push(v.file);
    }
  }
  return files;
}
