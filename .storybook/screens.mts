// 화면 기획 자료(docs/flows/screens/<흐름>/) 읽기 — 화면마다 JSON 하나(제목 · 설명 · 번호) + 찍은 PNG. 원본은 그 JSON 하나(여기 다시 적지 않는다)
// PNG 는 tools/flows/capture.mjs 가 찍는다. 스토리북 전용(운영 dist/web 에 안 들어간다)

export interface Mark { n:number; at:string; what:string; tap?:string; edge?:string }
export interface ScreenSpec { title:string; summary?:string; marks?:Mark[] }
export interface FlowSpec { title:string; rows:{ screens:string[]; taps:string[] }[] }
export interface Screen { name:string; spec:ScreenSpec; url:string }

const ROOT = '../docs/flows/screens/';
const files = import.meta.glob<unknown>('../docs/flows/screens/*/*.json', { eager: true, import: 'default' });
const pictures = import.meta.glob<string>('../docs/flows/screens/*/*.png', { eager: true, import: 'default', query: '?url' });

// md 안의 그림 주소(screens/03-tickets/list.png) → 스토리북이 내는 주소. 없으면 undefined
export const pictureUrl = (src:string) => pictures[`../docs/flows/${src}`];

// 흐름 폴더 하나: 흐름 한 장(flow.json)과 화면들(흐름에 나온 차례 · 흐름에 없는 화면은 뒤에 이름 차례)
export function readFlow(flow:string) {
  const prefix = `${ROOT}${flow}/`;
  const flowSpec = files[`${prefix}flow.json`] as FlowSpec | undefined;
  const names = Object.keys(files)
    .filter(path => path.startsWith(prefix) && !path.endsWith('/flow.json'))
    .map(path => path.slice(prefix.length, -'.json'.length));
  const order = [...new Set(flowSpec?.rows.flatMap(row => row.screens) ?? [])];
  names.sort((left, right) => rank(order, left) - rank(order, right) || left.localeCompare(right));
  const screens:Screen[] = names.flatMap(name => {
    const url = pictures[`${prefix}${name}.png`];
    return url ? [{ name, spec: files[`${prefix}${name}.json`] as ScreenSpec, url }] : [];
  });
  return { flowSpec, screens };
}

const rank = (order:string[], name:string) => {
  const at = order.indexOf(name);
  return at < 0 ? order.length : at;
};
