// 열차 예측: 실시간 기록(마지막 사건과 그 시각)마다 앞으로의 주행 단계(phases)를 세운다. plans · 시계 · 시간표와 학습 자료의 주인.
// 다른 화면 파일을 import 하지 않는다: 선로 · 역 · 자세 함수와 지금 모드는 본체가 넘긴다.
export function createTrainPlanner({stations,stationByLine,key,normStatus,route,merc,realGeom,geom,trainPose,mercStop,catchup,catchupAt,predictStops,isRide,getTrains}){
  function kstMs(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-9,+m[5],+m[6]):NaN}
  function age(v){const t=kstMs(v);return t===t?Math.max(0,((clock()===frameClock?frameEpoch:Date.now())-t)/1000):0}
  // 열차 위치를 정하는 시계. 1인칭으로 탈 때는 그 화면 프레임의 시각(rAF): 부르는 순간의 시각을 쓰면 프레임마다 몇 ms 씩 들쭉날쭉하고,
  // 120 Hz 화면에서는 10 ms 묶음(trainPose) 때문에 두 프레임에 한 번만 움직였다(탈 때 끊겨 보인다 — 2026-10-06 덕배). 프레임이 멈추면(250 ms — 역에 서 있을 때 등) 지금 시각.
  let frameClock=-1e9,frameEpoch=0;
  function clock(){const t=performance.now();return isRide()&&t-frameClock<250?frameClock:t}
  // Run time between adjacent stations: the GTFS timetable's median (edge_times.json, built by
  // build_edge_times.py); failing that, track length at the timetable's typical 12.4 m/s.
  let edgeTimes={},lineDwell={};
  // Per-line timing learned from the live feed (live-timing.json, built by build_live_timing.py):
  // pace = observed ÷ timetable over several stations; zone = 도착→출발 (the feed marks a train
  // entering and leaving the station section, not stopping and starting); approach = 진입→도착.
  // stops = a station's own zone, runs = an edge's own 출발→도착 seconds per direction (planTrain).
  let liveTiming={lines:{},default:{pace:1,zone:62,approach:40}};
  fetch('./live-timing.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{if(d&&d.lines){liveTiming=d;replacePlans(getTrains().map(planTrain).filter(Boolean))}}).catch(()=>{});
  // weekday rush hours (KST minutes of the day; pipeline/build_live_timing.py RUSH): lines that run
  // slower then have their own pace (rushPace)
  const RUSH=[[420,570],[1050,1200]];
  const rushNow=()=>{const k=new Date(Date.now()+9*3600e3),d=k.getUTCDay(),m=k.getUTCHours()*60+k.getUTCMinutes();return d>0&&d<6&&RUSH.some(([a,b])=>m>=a&&m<b)};
  const timingFor=line=>{const tm={...liveTiming.default,...liveTiming.lines[line]};if(tm.rushPace&&rushNow())tm.pace=tm.rushPace;return tm};
  fetch('./edge_times.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(d=>{edgeTimes=d.edges||{};lineDwell=d.dwell||{};plans=getTrains().map(planTrain).filter(Boolean)}).catch(()=>{});
  function segmentSeconds(a,b,line){
    const sched=line&&edgeTimes[`${line}:${Math.min(a.id,b.id)}:${Math.max(a.id,b.id)}`];if(sched)return sched;
    const A=merc(a),B=merc(b),chord=Math.hypot(B.x-A.x,B.y-A.y),track=line?realGeom(line,a.id,b.id).total:chord,metres=Math.max(chord,track)/A.meterInMercatorCoordinateUnits();
    return Math.max(30,Math.min(180,metres/12.4));
  }
  // Dead reckoning: the API only reports the last event (진입/도착/출발/전역출발) and when it happened.
  // Roll the train forward from that moment: approach → dwell → run → dwell … along its route,
  // so a train that "arrived 90s ago" is drawn already heading to the next stop.
  const EXPRESS_LINES=new Set(stations.flatMap(s=>s.express||[]));   // lines whose express stops the GTFS lists
  // Typical consist per line: [cars, metres per car]. Drawn at true length along the track.
  const CONSIST={'1호선':[10,20],'2호선':[10,20],'3호선':[10,20],'4호선':[10,20],'5호선':[8,20],'6호선':[8,20],'7호선':[8,20],'8호선':[6,18],'9호선':[6,19.5],'GTX-A':[8,23.5],'경강선':[4,20],'경의중앙선':[8,20],'경춘선':[8,20],'공항철도':[6,22],'김포골드라인':[2,13],'서해선':[4,20],'수인분당선':[6,20],'신림선':[3,13],'신분당선':[6,19.5],'에버라인선':[1,12],'우이신설선':[2,13],'의정부선':[2,13],'인천1호선':[8,18],'인천2호선':[2,18]};
  function planTrain(t){
    const s=stationByLine.get(`${t.line}:${key(t.station)}`);if(!s)return null;
    // Only move as far as the feed implies: the reported station may be left (after its dwell),
    // but the next station is only reached, never departed, until fresh data says so.
    // Express trains (1·9호선, whose express stops are in the GTFS) only stop at express stations and run
    // straight through the others; "the next station" for them means the next express stop.
    const expressLine=t.express&&EXPRESS_LINES.has(t.line),dest=stationByLine.get(`${t.line}:${key(t.destination)}`);
    const stops=st=>!expressLine||(st.express||[]).includes(t.line)||st===dest;
    const r=route(t,s),previous=r.previous,status=normStatus(t.status),phases=[];
    // Roll on through predictStops() stops (모드 설정 trains.predictStops — 기본 3, 롤코 99) (dwelling at each) before waiting for data: waiting at the
    // very next stop left trains standing there while they had long left; replacePlans keeps an
    // over-prediction from jumping back.
    let upto=r.ahead.length-1;for(let j=1,n=0;j<r.ahead.length;j++)if(stops(r.ahead[j])&&++n===predictStops()){upto=j;break}
    const ahead=r.ahead.slice(0,Math.max(1,upto)+1);
    // Stop to stop takes pace × (timetable run + 30 s dwell). The feed's 도착→출발 (the station section,
    // zone ~64 s) is not all standing: 도착 comes as the train enters the section and brakes along the
    // platform, it stands ~STAND s, and pulls out ~20 s before 출발. Standing the whole zone − 10 s had
    // trains stop early and leave late (7071 하행 면목·사가정·어린이대공원, 2026-09-30 ride). So a
    // predicted stop stands STAND and the run takes the rest; at the station of a 도착 record the train
    // brakes in over the last stretch (BRAKE s) and leaves zone − 20 s after the record. The times the
    // feed's next events are expected at are unchanged (build_live_timing.evaluate).
    // 감속(BRAKE)은 20초 이상, 정차는 20초 이상: 정차 30초에서 남는 만큼만 감속하면 구간 시간이 짧은 노선(7호선 zone 60)은
    // 감속이 10초뿐이라 실제보다 일찍 섰다(7호선 중곡 약 10초 빨리 도착, 2026-10-12 덕배 탑승). 출발 시각은 그대로다.
    const tm=timingFor(t.line),DWELL=Math.max(15,tm.zone-20),STAND=Math.min(DWELL,Math.max(20,Math.min(tm.stand||30,DWELL-20))),BRAKE=DWELL-STAND;
    // busy stations stand longer than the line (live-timing stops: 2호선 강남 83 s against 75): the difference goes on the standing
    const more=st=>(tm.stops?.[st.id]??tm.zone)-tm.zone,stand=st=>Math.max(5,STAND+more(st));
    // 구간마다 배운 출발→도착 초(live-timing runs, 방향별): 출발은 달리기 시작 15 s 뒤, 도착은 서기 BRAKE s 전이라 달리는 시간은 그만큼 더 길다. 없으면 시간표 × pace
    const paced=(from,to)=>{const D=tm.runs?.[`${from.id}:${to.id}`];if(D!=null)return Math.max(10,D+15+BRAKE);const R=segmentSeconds(from,to,t.line);return Math.max(.5*R,tm.pace*(R+30)-STAND)};
    // ease: slow at a stop, full speed through a station the train passes
    const run=(from,to,k0=0,k1=1,dur=paced(from,to))=>{const a=k0===0&&stops(from),b=k1===1&&stops(to);
      phases.push({from,to,k0,k1,dur:dur*(a&&b?1:a||b?.9:.8),ease:a&&b?'both':a?'in':b?'out':'none'})};
    const dwell=(at,i,dur=STAND)=>{const nx=ahead[i+1];phases.push(nx?{from:at,to:nx,k0:0,k1:0,dur}:{from:previous&&i===0?previous:ahead[i-1]||at,to:at,k0:1,k1:1,dur})};
    // the reported station: 진입 → the approach (the line's 진입→도착 time) → 도착 → braking to the
    // platform (BRAKE) → standing; it leaves DWELL after 도착 as before
    const brakes=previous&&BRAKE>0&&(status==='진입'||status==='도착');
    if(status==='진입'&&previous)run(previous,s,.75,brakes?.85:1,tm.approach);
    if(status==='전역출발'&&previous)run(previous,s);
    if(brakes)phases.push({from:previous,to:s,k0:.85,k1:1,dur:BRAKE,ease:'out'});
    // a train standing at the terminus it starts from, minutes before leaving (proxy: departsAt)
    const wait=t.departsAt?(kstMs(t.departsAt)-kstMs(t.receivedAt))/1000:0;
    if(status!=='출발'&&(stops(s)||status==='도착'))dwell(s,0,Math.max((brakes?STAND:DWELL)+more(s),wait||0));
    for(let i=0;i<ahead.length-1;i++){run(ahead[i],ahead[i+1]);if(i+1<ahead.length-1&&stops(ahead[i+1]))dwell(ahead[i+1],i+1,stand(ahead[i+1]))}
    // Hold at the last station we are willing to predict (destination or MAX hops) until fresh data arrives.
    const last=ahead[ahead.length-1],before=ahead.length>1?ahead[ahead.length-2]:previous;
    phases.push(before?{from:before,to:last,k0:1,k1:1,dur:Infinity}:{from:last,to:last,k0:0,k1:0,dur:Infinity});
    // Stations the train runs through, in travel order; every phase goes from seq[i] to seq[i+1].
    // The geometry runs past where motion stops so a train held at a station keeps its full length.
    const seq=previous?[previous,...r.ahead]:[...r.ahead],cum=[0];
    for(let i=1;i<seq.length;i++)cum.push(cum[i-1]+geom(t.line,seq[i-1].id,seq[i].id).total);
    let [cars,carMetres]=CONSIST[t.line]||[8,20];
    // 2호선 branches run short trains: 성수지선 4 cars, 신정지선 6 cars (Seoul Metro)
    if(t.line==='2호선'){const where=`${t.station} ${t.destination}`;if(/신설동|용두|신답|용답|성수지선/.test(where))cars=4;else if(/까치산|신정네거리|양천구청|도림천|신도림지선/.test(where))cars=6}
    // 출발 is sent as the train leaves the station section, ~15 s into its run
    return {t,id:`${t.line}:${t.trainNo}`,phases,seq,cum,cars,carMetres,lead:status==='출발'?15:0};
  }
  let plans=[];
  // Swap in plans from fresh data, carrying each train's drawn position over so it moves on continuously.
  // 앞으로의 보정은 원래 주행 위에 최대 CATCHUP_MPS 를 더해 메워요(질주하지 않게). 따라잡는 도중 새 자료가 오면 그때 더하던 속도에서 이어 가요.
  const GLIDE_MAX_M=1000,HOLD_MAX_M=3000,STOP_M=40,NEAR_PLATFORM_M=150;   // STOP_M: 앞선 열차가 서는 거리(약 4초) · NEAR_PLATFORM_M: 이만큼 안이면 승강장까지 가서 선다   // bigger corrections than these still jump (GLIDE_MAX_M: 상한 속도로 1 km 를 메우는 데 약 110초 — 그보다 멀면 바로 옮겨요)
  function replacePlans(next){
    const old=new Map(plans.map(p=>[p.id,p]));
    for(const p of next){
      const o=old.get(p.id);if(!o||o.seq.length<2)continue;
      const d=trainPose(o).dist;let i=0;while(i<o.seq.length-2&&o.cum[i+1]<d)i++;
      const a=o.seq[i].id,b=o.seq[i+1].id,f=(d-o.cum[i])/((o.cum[i+1]-o.cum[i])||1);
      // the same stretch of track in the new route, or else the station it was heading to
      let from;const j=p.seq.findIndex((s,k)=>s.id===a&&p.seq[k+1]?.id===b);
      if(j>=0)from=p.cum[j]+(p.cum[j+1]-p.cum[j])*f;
      else{const k=p.seq.findIndex(s=>s.id===b);if(k<0)continue;from=Math.max(0,p.cum[k]-(1-f)*(o.cum[i+1]-o.cum[i]))}   // different route: nothing to carry over
      const to=trainPose(p).dist,m=mercStop(p.t.line,p.seq[0]).meterInMercatorCoordinateUnits();
      if(from>to){if((from-to)/m<HOLD_MAX_M){
        // 자료보다 앞서 있으면 그 자리에서 부드럽게 서서(STOP_M 안) 예측이 지나가길 기다린다. 승강장에 거의 다 왔으면(NEAR_PLATFORM_M) 승강장에 선다.
        // 다음 역까지 달려가 기다리던 것은 실제 열차보다 한 역 앞서 갔다(7277 천왕 → 온수 1 km, 7호선 강남구청 → 청담, 2026-10-08).
        // 이미 서 있던 열차는 더 가지 않고, 서는 중이던 열차는 남은 만큼만 간다.
        const k=p.cum.findIndex(c=>c>=from-1e-9),next=k>=0?p.cum[k]:from,left=o.hold!=null?Math.max(0,o.hold-d):null;
        const st=left!=null?Math.min(next,from+left):(next-from)/m<=NEAR_PLATFORM_M?next:Math.min(next,from+STOP_M*m);p.hold=st;
        if(st>from)p.creep={from,at:clock(),ms:Math.max(2000,Math.min(60000,(st-from)/m*100))};
      }}
      else if((to-from)/m>1&&(to-from)/m<GLIDE_MAX_M){const v0=o.glide?catchupAt(o.glide.c,(clock()-o.glide.at)/1000).v:0;p.glide={c:catchup((to-from)/m,v0),at:clock()}}
    }
    plans=next;
  }
  return {planTrain,replacePlans,age,clock,get plans(){return plans},get frameClock(){return frameClock},
    rebuild(){plans=getTrains().map(planTrain).filter(Boolean)},   // 모드 · 선로가 바뀌면 처음부터 다시(이어 그리지 않는다)
    clear(){plans=[]},
    setFrame(ts){frameClock=ts;frameEpoch=Date.now()-(performance.now()-ts)}};   // 1인칭: 이 화면 프레임의 시각
}
