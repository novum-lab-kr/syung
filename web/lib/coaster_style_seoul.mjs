// 호환 이름: 공원 자료는 기본 모드(web/modes/basic/park.mjs), 계산 함수는 web/modes/coaster/metrics.mjs 로 옮겼다(4단계 끝에 없앤다).
export { PARK_DEFAULTS as SEOUL_COASTER_STYLE } from '../modes/basic/park.mjs';
export { clamp, zoomFade, metresPerPixel, trackMetrics, distanceGrid, ridePalette } from '../modes/coaster/metrics.mjs';
