// 호환 이름: 조선 팩 = 기본 도시 팩 + 조선의 다른 것(web/modes/joseon/style.mjs). 화면은 모드 목록(settings('joseon').city.pack)을 쓴다.
// 이 이름은 시험 · 옛 경로용(4단계 끝에 없앤다). 같은 합치기라 값은 화면 것과 같다(참조는 다르다).
import SEOUL from '../modes/basic/city.mjs';
import { JOSEON_DELTA } from '../modes/joseon/style.mjs';
import { mergeSettings } from '../modes/merge.mjs';

export const JOSEON_CITY_STYLE = mergeSettings(SEOUL, JOSEON_DELTA);
export default JOSEON_CITY_STYLE;
