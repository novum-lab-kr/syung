// 버스 기록 재생: 서버가 남긴 서울시 버스 응답(/var/lib/subway-live/bus/YYYYMMDD.jsonl[.gz])으로 화면이 그렸을 자리를 다시 만들어
// 실제 GPS(뒤에 온 관측을 이은 것)와 1초마다 비교한다. 서울시 호출 없이 기록만 읽는다(덕배 2026-10-14: 버스는 지금 호출로 학습).
//   node pipeline/bus_replay.mjs --day 20261013 [--train 20261007,20261008,…] [--route 100100075] [--hours 7-10] [--json]
// 화면 쪽 계산은 web/bus/motion.mjs 를 그대로 쓴다(앞지르기 · 움직임). 배운 빠르기는 밤 학습(bus_pace.mjs)과 같은 계산 · 같은 꼴.
// 재생 · 채점은 bus_records.mjs replayDay(밤 학습 bus_pace.mjs 도 같은 것으로 어제를 채점한다).
import fs from 'node:fs';
import {STATE, dayFile, readDay, loadRoutes, tracks, paceSums, addSums, paceTable, replayDay} from './bus_records.mjs';

function args() {
  const out = {hours: [0, 24]};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--day') out.day = a[++i];
    else if (a[i] === '--train') out.train = a[++i].split(',');
    else if (a[i] === '--route') out.route = a[++i];
    else if (a[i] === '--hours') out.hours = a[++i].split('-').map(Number);
    else if (a[i] === '--json') out.json = true;
  }
  return out;
}

function main() {
  const opt = args();
  if (!opt.day) { console.error('사용: node pipeline/bus_replay.mjs --day YYYYMMDD [--train 날짜,…] [--route ID] [--hours 7-10] [--json]'); process.exit(2); }
  const routes = loadRoutes();
  const only = rows => rows.filter(r => routes.has(r.routeId) && (!opt.route || r.routeId === opt.route));
  const train = opt.train || fs.readdirSync(`${STATE}/bus`).map(f => f.slice(0, 8)).filter(d => /^\d{8}$/.test(d) && d < opt.day).sort();
  const table = paceTable(addSums(train.filter(d => dayFile(d)).map(d => paceSums(tracks(only(readDay(dayFile(d))), routes), routes)), routes));
  const out = {day: opt.day, train, hours: opt.hours, ...replayDay(only(readDay(dayFile(opt.day))), routes, table, {hours: opt.hours})};
  console.log(opt.json ? JSON.stringify(out) : JSON.stringify(out, null, 1));
}

main();
