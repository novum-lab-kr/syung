import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {createRouter,key,normStatus} from '../web/lib/routing.mjs';
import {catchup,catchupAt} from '../web/lib/train_catchup.mjs';
import {createTrainPlanner} from '../web/trains/plan.mjs';

const record=(extra={})=>({line:'9호선',trainNo:'9001',station:'나',destination:'라',direction:'하행',status:'출발',...extra});

async function setup(t){
  // 가 → 나 → 다 → 라, 역 사이 1 km. 급행은 나를 통과한다.
  const stations=['가','나','다','라'].map((name,i)=>({id:i+1,name,lines:[{name:'9호선'}],express:i===1?[]:['9호선']}));
  const {stationByLine,route}=createRouter({stations,paths:{'9호선':[[1,2,3,4]]}});
  const merc=s=>({x:(s.id-1)*1000,y:0,meterInMercatorCoordinateUnits:()=>1});
  const geom=(_line,a,b)=>({total:Math.abs(b-a)*1000});
  let trains=[],ride=false;
  const poses=new WeakMap(),requests=[];
  t.mock.method(globalThis,'fetch',async url=>{
    requests.push(url);
    return {ok:true,json:async()=>({})};
  });
  const planner=createTrainPlanner({stations,stationByLine,key,normStatus,route,merc,geom,realGeom:geom,
    trainPose:p=>{assert.ok(poses.has(p),'보정할 계획의 자세가 준비되어 있음');return {dist:poses.get(p)}},
    mercStop:(_line,s)=>merc(s),catchup,catchupAt,predictStops:()=>3,isRide:()=>ride,getTrains:()=>trains});   // 기본 모드 설정 trains.predictStops
  // 두 비동기 초기화를 끝낸 뒤 계획을 바꿔야 늦게 온 자료가 테스트 배열을 덮지 않는다.
  await setImmediate();
  assert.deepEqual(requests,['./live-timing.json','./edge_times.json']);
  return {planner,stations,poses,setTrains:v=>{trains=v},setRide:v=>{ride=v}};
}

// 단계의 역과 진행률만 비교하고, 시간은 정차 · 주행과 마지막 대기를 따로 확인한다.
const phaseEdges=p=>p.phases.map(({from,to,k0,k1})=>[from.id,to.id,k0,k1]);
const dwellStations=p=>p.phases.filter(ph=>Number.isFinite(ph.dur)&&ph.k0===ph.k1).map(ph=>ph.k0===0?ph.from.id:ph.to.id);

for(const [status,lead,first] of [
  ['도착',0,[[1,2,.85,1],[2,3,0,0]]],
  ['출발',15,[]],
  ['진입',0,[[1,2,.75,.85],[1,2,.85,1],[2,3,0,0]]],
])test(`planTrain: ${status} 기록의 phases · seq · lead와 마지막 대기`,async t=>{
  const {planner,stations}=await setup(t),train=record({status}),p=planner.planTrain(train);
  assert.equal(p.t,train);
  assert.equal(p.id,'9호선:9001');
  assert.deepEqual(p.seq,stations);
  p.seq.forEach((s,i)=>assert.equal(s,stations[i],'노선의 역 객체를 그대로 쓴다'));
  assert.deepEqual(p.cum,[0,1000,2000,3000]);
  assert.equal(p.lead,lead);
  assert.deepEqual(phaseEdges(p),[...first,[2,3,0,1],[3,4,0,0],[3,4,0,1],[3,4,1,1]]);
  assert.ok(p.phases.slice(0,-1).every(ph=>Number.isFinite(ph.dur)&&ph.dur>0));
  assert.equal(p.phases.at(-1).dur,Infinity);
  if(status!=='출발'){
    const brake=p.phases.find(ph=>ph.k0===.85&&ph.k1===1);
    assert.equal(brake.dur,12,'도착 뒤 감속 시간');
    assert.equal(p.phases.find(ph=>ph.from.id===2&&ph.k0===ph.k1).dur,30,'감속 뒤 정차 시간');
  }
});

test('planTrain: 역을 찾지 못하면 null',async t=>{
  const {planner}=await setup(t);
  assert.equal(planner.planTrain(record({station:'없는역'})),null);
});

test('planTrain: 급행은 비정차역에서 서지 않는다',async t=>{
  const {planner}=await setup(t),train=record({station:'가'});
  const normal=planner.planTrain(train),express=planner.planTrain({...train,express:true});
  assert.deepEqual(normal.seq.map(s=>s.id),[1,2,3,4]);
  assert.deepEqual(express.seq.map(s=>s.id),[1,2,3,4],'비정차역도 주행 경로에는 남는다');
  assert.deepEqual(dwellStations(normal),[2,3]);
  assert.deepEqual(dwellStations(express),[3],'나에서는 서지 않고 다음 급행역 다에서 선다');
  const into=express.phases.find(ph=>ph.from.id===1&&ph.to.id===2&&ph.k0!==ph.k1);
  const out=express.phases.find(ph=>ph.from.id===2&&ph.to.id===3&&ph.k0!==ph.k1);
  assert.equal(into.ease,'in','비정차역으로 들어가며 감속하지 않는다');
  assert.equal(out.ease,'out','비정차역을 떠나며 정차부터 가속하지 않는다');
  assert.equal(express.phases.at(-1).dur,Infinity);
});

test('rebuild · clear · plans: 현재 배열 참조를 그대로 읽고 교체한다',async t=>{
  const {planner,setTrains}=await setup(t),initial=planner.plans;
  assert.equal(planner.plans,initial);
  assert.deepEqual(initial,[]);
  const a=record();
  setTrains([a,record({station:'없는역'})]);
  planner.rebuild();
  const first=planner.plans;
  assert.notEqual(first,initial);
  assert.equal(planner.plans,first);
  assert.equal(first.length,1,'못 찾은 역의 기록은 제외한다');
  assert.equal(first[0].t,a);
  // getter가 다음 호출 때 읽는 새 자료를 사용하며 옛 배열을 고치지 않는다.
  const b=record({trainNo:'9002',station:'다'});
  setTrains([b]);
  planner.rebuild();
  const second=planner.plans;
  assert.notEqual(second,first);
  assert.equal(planner.plans,second);
  assert.equal(second.length,1);
  assert.equal(second[0].t,b);
  assert.equal(first[0].t,a);
  planner.clear();
  const cleared=planner.plans;
  assert.notEqual(cleared,second);
  assert.equal(planner.plans,cleared);
  assert.deepEqual(cleared,[]);
  assert.equal(second[0].t,b);
});

test('replacePlans: 새 자료가 뒤로 가면 hold로 부드럽게 선다',async t=>{
  const {planner,poses}=await setup(t);
  const old=planner.planTrain(record()),next=planner.planTrain(record());
  poses.set(old,1200);poses.set(next,1100);
  planner.replacePlans([old]);
  const array=[next];
  planner.replacePlans(array);
  assert.equal(planner.plans,array,'넘겨받은 배열을 복사하지 않는다');
  assert.equal(planner.plans[0],next);
  assert.equal(next.hold,1240,'다음 역까지 가지 않고 기존 자리에서 40 m 안에 선다');
  assert.equal(next.creep.from,1200);
  assert.equal(next.creep.ms,4000);
  assert.ok(Number.isFinite(next.creep.at));
  assert.equal(next.glide,undefined);
  assert.equal(old.hold,undefined,'옛 계획에는 보정을 쓰지 않는다');
});

test('replacePlans: 새 자료가 조금 앞이면 glide로 차이를 메운다',async t=>{
  const {planner,poses}=await setup(t);
  const old=planner.planTrain(record()),next=planner.planTrain(record());
  poses.set(old,1200);poses.set(next,1250);
  planner.replacePlans([old]);
  const array=[next];
  planner.replacePlans(array);
  assert.equal(planner.plans,array);
  assert.equal(planner.plans[0],next);
  assert.equal(next.hold,undefined);
  assert.equal(next.creep,undefined);
  assert.ok(Number.isFinite(next.glide.at));
  assert.equal(catchupAt(next.glide.c,0).left,50,'처음에는 기존 위치를 유지한다');
  const middle=catchupAt(next.glide.c,next.glide.c.T/2);
  assert.ok(middle.left>0&&middle.left<50,'달리면서 점차 차이를 줄인다');
  assert.equal(catchupAt(next.glide.c,next.glide.c.T).left,0);
  assert.equal(catchupAt(next.glide.c,next.glide.c.T).done,true);
  assert.equal(old.glide,undefined);
});

test('setFrame · clock: 탑승 중에는 프레임 시각, 그 밖에는 현재 시각',async t=>{
  const {planner,setRide}=await setup(t);
  let now=1000;
  t.mock.method(globalThis.performance,'now',()=>now);
  assert.equal(planner.clock(),1000);
  setRide(true);
  assert.equal(planner.clock(),1000,'아직 프레임이 없으면 현재 시각');
  planner.setFrame(900);
  assert.equal(planner.frameClock,900);
  assert.equal(planner.clock(),900);
  now=1100;
  assert.equal(planner.clock(),900,'같은 프레임에서 시계가 들쭉날쭉하지 않는다');
  setRide(false);
  assert.equal(planner.clock(),1100);
  setRide(true);
  now=1150;
  assert.equal(planner.clock(),1150,'프레임이 250 ms 멈추면 현재 시각으로 돌아간다');
  planner.setFrame(1140);
  assert.equal(planner.frameClock,1140);
  assert.equal(planner.clock(),1140,'새 프레임이 오면 다시 그 프레임 시각');
});
