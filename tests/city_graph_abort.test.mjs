// 도로 그래프: 칸을 짓다가 어느 중단 지점에서 버려도(문화유산 모드 켜고 끌 때 칸 다시 짓기) 간선 · 노드가 남지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadGraph } from '../web/city/traffic.mts';

const road = (pts) => ({ pts: pts.map(([x, y]) => [x, y]), cls: 'residential', width: 6, lanes: 2, level: 0 });
const LINES = [road([[2, 50], [98, 50]]), road([[50, 2], [50, 98]]), road([[10, 10], [90, 90]])];
const BOX = [0, 0, 100, 100];

test('칸 짓기를 중단 지점마다 멈추고 버려도 도로 그래프에 간선이 남지 않는다', () => {
  let stops = 0;
  for (;;) {
    const graph = new RoadGraph(), gen = graph.addCellGen('k', LINES, BOX);
    let done = false;
    for (let i = 0; i <= stops; i++) { if (gen.next().done) { done = true; break } }
    graph.removeCell('k');
    assert.equal(graph.edges.size, 0, `중단 ${stops}번째 뒤 간선이 남음`);
    assert.equal(graph.nodes.size, 0, `중단 ${stops}번째 뒤 노드가 남음`);
    if (done) break;
    stops++;
    assert.ok(stops < 50, '중단 지점이 끝나지 않음');
  }
  assert.ok(stops >= 3, '중단 지점이 몇 개 있어야 한다');
});

test('끝까지 지은 칸을 다시 지으면 간선이 두 배가 되지 않는다', () => {
  const graph = new RoadGraph(); graph.addCell('k', LINES, BOX); const first = graph.edges.size;
  assert.ok(first > 0);
  graph.addCell('k', LINES, BOX); assert.equal(graph.edges.size, first);
});
