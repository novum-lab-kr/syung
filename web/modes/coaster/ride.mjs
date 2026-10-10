// 롤코 1인칭: 고른 자리에 앉아 열차를 타요(자리 고르기 · 타기 · 내리기 · 프레임마다 카메라). ride · rideSeat 의 주인.
// import 는 본체도 import 하는 것만(first_person · basic/park): 아니면 첫 화면 요청이 한 단계 늦어진다.
// 열차 자리 · 화면 함수는 본체가 넘기고, 바뀌는 값은 isCoaster · getSheetTrain · getSleeperM(모드 코드를 받은 뒤 채워짐)으로 읽는다.
// 프레임 순서(planner.setFrame → rideFrame → 그리기) · 내리기 줄(rideBar) 붙이기 · 이벤트 연결은 본체가 한다.
import {RIDE_ZOOM,rideFov,RIDE_NEAR_M,RIDE_FAR_M,seatRows,seatIndex,seatNumber,seatEye,rideCamera,seatLabel} from './first_person.mjs';
import { PARK_DEFAULTS as COASTER_STYLE } from '../basic/park.mjs';
export function createCoasterRide({map,maplibregl,planner,colors,cityViaduct,sheetBody,closeSheet,showTrainPopup,applyTheme,effectiveTheme,coasterBodyPx,TRAIN_MIN_PX,mercStop,trainPose,trackPoint,blendShift,toRide,fromRide,coasterCarFrame,coasterRailFrames,riderState,trainLngLat,stopFollowing,isCoaster,getSheetTrain,getSleeperM}){
  let ride=null,rideSeat={car:1,row:1,side:-1};
  const riding=plan=>ride&&ride.id===plan.id?ride.snap:null;   // 탄 열차는 늘 카메라를 놓은 순간에 그려요(느린 프레임에도 카메라와 어긋나지 않게)
  const rideRows=plan=>{const unit=1/(512*2**RIDE_ZOOM),body=coasterBodyPx(RIDE_ZOOM),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits(),n=plan.cars;
    return seatRows(Math.max(n*plan.carMetres*m,TRAIN_MIN_PX*unit,n*body*1.6*unit)/n/unit-1.4,body)};   // 1인칭 줌에서 칸마다 줄 수(drawTrains 와 같은 칸 길이)
  const rideBar=document.createElement('div');rideBar.className='ride-bar';rideBar.hidden=true;rideBar.setAttribute('role','status');
  rideBar.innerHTML='<span class="dot"></span><span class="txt"></span><button type="button" class="ride-off">내리기</button>';
  rideBar.querySelector('.ride-off').onclick=()=>stopRide(true);
  sheetBody.addEventListener('click',e=>{
    const b=e.target.closest('.ride-pick .seat');
    if(b){rideSeat={car:+b.dataset.car,row:+b.dataset.row,side:+b.dataset.side};
      for(const x of sheetBody.querySelectorAll('.ride-pick .seat')){const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))}
      const go=sheetBody.querySelector('.ride-go');if(go)go.textContent=`${seatLabel(rideSeat)}에 타기`;return}
    if(e.target.closest('.ride-go')&&getSheetTrain())startRide(getSheetTrain())});
  function rideBarText(plan){rideBar.style.setProperty('--c',colors[plan.t.line]||'#52646a');rideBar.querySelector('.txt').textContent=`${plan.t.line} ${seatLabel(ride.seat)} · ${riderState(plan)}`}
  function startRide(id){
    const plan=planner.plans.find(p=>p.id===id);if(!plan||!isCoaster()||ride)return;
    const back={center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),elevation:map.getCenterElevation(),maxPitch:map.getMaxPitch(),fov:map.getVerticalFieldOfView(),clamp:map.getCenterClampedToGround()};
    closeSheet();map.stop();stopFollowing();
    ride={id,seat:{...rideSeat},snap:null,seen:performance.now(),back};
    map.setMaxPitch(180);map.setCenterClampedToGround(false);map.setVerticalFieldOfView(rideFov(map.getContainer().clientWidth,map.getContainer().clientHeight));   // 루프에서는 위를 보고 뒤집혀요
    const S=COASTER_STYLE.sky[effectiveTheme()==='dark'?'dark':'light'];back.sky=map.getSky();   // 수평선 위: 지도 바탕 대신 하늘
    map.setSky({'sky-color':S.sky,'horizon-color':S.horizon,'fog-color':S.horizon,'sky-horizon-blend':.45,'horizon-fog-blend':.7,'fog-ground-blend':.9,'atmosphere-blend':0});
    map.getContainer().style.setProperty('--ride-ground',S.ground);   // 타일이 끝난 땅: 바탕 격자 대신 먼 땅빛(syung.css body.riding .map)
    rideBarText(plan);rideBar.hidden=false;document.body.classList.add('riding');applyTheme();   // 땅: 탈 때의 색(pack.ground.ride)
    ride.timer=setInterval(()=>{const pl=ride&&planner.plans.find(p=>p.id===ride.id);if(pl)rideBarText(pl)},1000);
    rideFrame();map.triggerRepaint();
  }
  function stopRide(reopen){
    if(!ride)return;const r=ride;ride=null;clearInterval(r.timer);rideBar.hidden=true;document.body.classList.remove('riding');applyTheme();
    map._camera.transform.clearNearFarZOverride();map.setVerticalFieldOfView(r.back.fov);map.setSky(r.back.sky);
    const plan=planner.plans.find(p=>p.id===r.id);
    map.jumpTo({center:plan?trainLngLat(plan):r.back.center,zoom:r.back.zoom,bearing:r.back.bearing,pitch:r.back.pitch,roll:0,elevation:r.back.elevation});
    map.setMaxPitch(r.back.maxPitch);map.setCenterClampedToGround(r.back.clamp);
    if(reopen&&plan&&isCoaster())showTrainPopup(plan);   // '내리기': 그 열차 정보창으로(위에서 따라가기)
    map.triggerRepaint();
  }
  // 한 프레임: 탄 열차의 자리를 이 순간으로 정해 두고(ride.snap — drawTrains 가 같은 자리에 그려요) 내 칸의 틀에서 눈 · 시선을 구해 카메라를 놓아요
  function rideFrame(){
    if(!ride)return;const plan=planner.plans.find(p=>p.id===ride.id),now=performance.now();
    if(!plan){if(now-ride.seen>5000)stopRide(false);return}   // 새 자료로 계획이 바뀌는 사이(같은 id 로 돌아와요)
    ride.seen=now;
    const unit=1/(512*2**RIDE_ZOOM),bodyPx=coasterBodyPx(RIDE_ZOOM),lanePx=cityViaduct.train(RIDE_ZOOM,bodyPx).lanePx,n=plan.cars;
    const pose=trainPose(plan),mid=trackPoint(plan,pose.dist),shift=blendShift(plan,mid),m=mercStop(plan.t.line,plan.seq[0]).meterInMercatorCoordinateUnits();
    const total=Math.max(n*plan.carMetres*m,TRAIN_MIN_PX*unit,n*bodyPx*1.6*unit),car=total/n,tail=toRide(plan,pose.dist)-total/2;
    const P=d=>{const q=trackPoint(plan,fromRide(plan,d));if(shift){q.x+=shift[0];q.y+=shift[1]}return q};
    const {j}=seatIndex(ride.seat,n,4),c=coasterCarFrame(P,tail,car,j,n,unit,bodyPx,lanePx,1.4*unit);if(!c)return;
    const rows=seatRows(c.L,bodyPx),{i,side}=seatIndex(ride.seat,n,rows);
    ride.snap={pose,shift,j,k:seatNumber(i,side)};
    const {E,F,U}=seatEye(c.fr,c.L,bodyPx,unit,rows,i,side),mpu=new maplibregl.MercatorCoordinate(E[0],E[1]).meterInMercatorCoordinateUnits();
    // 레일 · 침목: 침목은 땅에 박혀 있게 간격의 격자에 맞추고, 열차가 rebuildM 을 가면(또는 새 자료 · 옮겨 그리는 중이면) 다시 짓는다
    const RT=COASTER_STYLE.rideTrack,step=getSleeperM()*m,d0=Math.floor((tail-RT.behindM*m)/step)*step;
    if(!ride.rail||ride.rail.plan!==plan||shift||Math.abs(d0-ride.rail.d0)>RT.rebuildM*m)ride.rail={plan,d0,frames:[lanePx,-lanePx].flatMap(l=>coasterRailFrames(P,d0,tail+total+RT.aheadM*m,step,unit,bodyPx,l,tail+total,m)),mpu:m,dirty:true};   // 내 선로와 옆(맞은편) 선로
    ride.eye=E;
    const box=map.getContainer(),fov=rideFov(box.clientWidth,box.clientHeight);if(Math.abs(map.getVerticalFieldOfView()-fov)>.01)map.setVerticalFieldOfView(fov);   // 화면을 돌리거나 크기가 바뀌면 시야각도
    const cam=ride.cam=rideCamera(E,F,U,{ctcd:.5/Math.tan(fov*Math.PI/360)*box.clientHeight,mpu});   // 카메라–center 거리(px): maplibre 와 같은 식
    map.jumpTo({center:new maplibregl.MercatorCoordinate(cam.x,cam.y).toLngLat(),zoom:cam.zoom,elevation:cam.elevation,bearing:cam.bearing,pitch:cam.pitch,roll:cam.roll,padding:{top:0,bottom:0,left:0,right:0}});
    const ppm=512*2**RIDE_ZOOM*mpu;map._camera.transform.overrideNearFarZ(RIDE_NEAR_M*ppm,RIDE_FAR_M*ppm);   // px(공개 API 없음 — maplibre 6.11 transform): 가까운 칸이 잘리지 않게(기본 가까운 면은 줌 18 에서 7 m)
  }
  return {riding,rideRows,startRide,stopRide,rideFrame,rideBar,get ride(){return ride},get seat(){return rideSeat},set seat(v){rideSeat=v}};
}
