// 시험용: 화면과 같은 조선 도시 팩(모드 목록이 기본 팩 + 조선 덧쓰기를 합친 것). 옛 web/lib/city_style_joseon.mjs 대신
import {createModeRegistry} from '../web/modes/index.mts';
const defs=await Promise.all(['basic','simcity','joseon','coaster'].map(n=>import(`../web/modes/${n}/index.mts`).then(m=>m.default)));
export const JOSEON_CITY_STYLE=createModeRegistry(defs).settings('joseon').city.pack;
export default JOSEON_CITY_STYLE;
