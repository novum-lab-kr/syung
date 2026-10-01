// Live-train routing: which station a feed record means, and which way the train is going.
// Pure (no DOM / map), so it runs in tests: createRouter({stations, paths}).
// Stations renamed after the GTFS snapshot (GTFS name → current name). The map shows the current name;
// key() folds both onto the GTFS name so live-feed records match either way.
export const NEW_NAMES={'당고개':'불암산','초성리':'청산','뚝섬유원지':'자양','총신대입구':'이수','화전':'한국항공대','운동장·송담대':'용인중앙시장','서구청':'서해구청'};
export const RENAMED=Object.fromEntries(Object.entries(NEW_NAMES).map(([a,b])=>[b,a]));
export const key=v=>{const k=String(v||'').replace(/\([^)]*\)/g,'').replace(/(종착|지선|순환|역)$/,'').replace(/\s/g,'').toLocaleLowerCase('ko');return RENAMED[k]||k};
// Seoul API statuses: 진입(approaching s), 도착(at s), 출발(left s), 전역출발(left the stop before s).
export const normStatus=v=>String(v||'').replace(/\s/g,'');

export function createRouter({stations,paths}){
  const byId=new Map(stations.map(s=>[s.id,s])),stationByLine=new Map();
  stations.forEach(s=>s.lines.forEach(x=>stationByLine.set(`${x.name}:${key(s.name)}`,s)));
  function ringOf(line){const raw=(paths[line]||[])[0];if(!raw)return null;const end=raw.indexOf(raw[0],1);return end>1?raw.slice(0,end):null}
  const ring2=ringOf('2호선');
  // Stations the train will pass from s onward (s first), stopping at its destination.
  // Which index direction 상행/하행 means differs per line and per path chunk, so learn it from
  // trains whose destination resolves: dirVotes["line|chunk|up|down"] = Σ sign(dest index − index).
  let dirVotes={};
  const dirLabel=t=>/상|내/.test(String(t.direction||''))?'up':'down';
  function learnDirections(list){
    dirVotes={};
    for(const t of list){
      const s=stationByLine.get(`${t.line}:${key(t.station)}`),dest=stationByLine.get(`${t.line}:${key(t.destination)}`);
      if(!s||!dest||dest.id===s.id)continue;
      (paths[t.line]||[]).forEach((ids,ci)=>{const i=ids.indexOf(s.id),j=ids.indexOf(dest.id);if(i>=0&&j>=0){const k=`${t.line}|${ci}|${dirLabel(t)}`;dirVotes[k]=(dirVotes[k]||0)+(j>i?1:-1)}});
    }
  }
  function route(t,s){
    const dest=stationByLine.get(`${t.line}:${key(t.destination)}`),dir=String(t.direction||''),MAX=8;
    // A train already at its destination has finished its run: hold it there (only use the
    // neighbour for orientation) instead of extrapolating onward in its direction of travel.
    const terminated=dest&&dest.id===s.id;
    if(t.line==='2호선'&&ring2&&!/신설동|성수지선|신도림지선|까치산/.test(String(t.destination||''))){
      const i=ring2.indexOf(s.id);
      if(i>=0){
        const sign=dir.includes('외')?-1:1,n=ring2.length,ahead=[];
        for(let k=0;k<=MAX;k++){const st=byId.get(ring2[((i+sign*k)%n+n)%n]);ahead.push(st);if(k&&dest&&st.id===dest.id)break}
        return {previous:byId.get(ring2[((i-sign)%n+n)%n]),ahead:terminated?[s]:ahead};
      }
    }
    // 6호선 응암 loop: one-way 응암 → 역촌 → 불광 → 독바위 → 연신내 → 구산 → 응암. 상행 '응암순환' trains run into
    // it at 응암; inside it the feed labels them 하행 (봉화산/신내) until they leave it at 응암 toward 새절.
    if(t.line==='6호선'){
      const ids=(paths['6호선']||[])[0]||[],eungam=stationByLine.get('6호선:응암'),a=eungam?ids.indexOf(eungam.id):-1,b=a>=0?ids.indexOf(eungam.id,a+1):-1;
      if(a>=0&&b>a&&b-a<12){
        const up=/상/.test(dir),circ=/순환/.test(String(t.destination||'')),st=normStatus(t.status);
        let i=-1;
        if(s.id===eungam.id)i=up&&circ?a:(/도착|진입/.test(st)?b:a);      // 하행 at 응암: arriving = finishing the loop
        else{const k=ids.indexOf(s.id);if(k>a&&k<b)i=k;else if(up&&circ){const k2=ids.lastIndexOf(s.id,a);if(k2>=0&&k2<a)i=k2}}
        if(i>=0){
          const ahead=[];for(let j=i;j<ids.length&&ahead.length<=MAX;j++){ahead.push(byId.get(ids[j]));if(j>i&&circ&&j===b)break}
          return {previous:byId.get(ids[i-1]),ahead};
        }
      }
    }
    let best=null;
    (paths[t.line]||[]).forEach((ids,ci)=>{for(let i=0;i<ids.length;i++){
      if(ids[i]!==s.id)continue;
      const consider=(sign,d)=>{if(ids[i+sign]!==undefined&&(!best||d<best.d))best={ids,i,sign,d}};
      if(dest&&dest.id!==s.id){const j=ids.indexOf(dest.id);if(j>=0)consider(j>i?1:-1,Math.abs(j-i))}
      // No usable destination: go the way other trains with the same 상행/하행 label go on this chunk.
      const vote=dirVotes[`${t.line}|${ci}|${dirLabel(t)}`],guess=vote?Math.sign(vote):(/상|내/.test(dir)?-1:1);
      consider(guess,1e6);
      consider(-guess,2e6);
    }});
    if(!best)return {previous:undefined,ahead:[s]};
    const {ids,i,sign}=best,ahead=[];
    for(let j=i;j>=0&&j<ids.length&&ahead.length<=MAX;j+=sign){const st=byId.get(ids[j]);if(!st)break;ahead.push(st);if(j!==i&&dest&&st.id===dest.id)break}
    return {previous:byId.get(ids[i-sign]),ahead:terminated?[s]:ahead};
  }
  return {byId,stationByLine,route,learnDirections,stationOf:t=>stationByLine.get(`${t.line}:${key(t.station)}`)};
}
