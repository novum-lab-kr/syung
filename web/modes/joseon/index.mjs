// 조선 모드: 심시티와 같은 도시를 조선 팩으로(흙바닥 · 기와집 · 수로 · 거북선 · 가마). 다른 것만 적는다 — 설정 키는 4단계 커밋마다 옮겨 온다.
import { JOSEON_DELTA } from './style.mjs';

export default {
  id: 'joseon',
  from: 'simcity',
  label: '조선',
  settings: {
    city: { pack: JOSEON_DELTA },   // 도시 팩에서 조선만 다른 것(흙바닥 · 한옥 · 수로 …)
  },
};
