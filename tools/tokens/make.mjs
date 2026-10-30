// 디자인 토큰 원본(web/tokens/tokens.json) 하나로 두 파일을 만든다 — node 내장만(설치 없이)
//   ① web/tokens/tokens.css — 웹 CSS 변수(:root · 다크는 html[data-theme=dark]). index.html 이 syung.css 바로 앞에서 부른다
//   ② web/tokens/tokens.mts — 앱(React Native)용 TS 객체. 숫자는 단위를 뺀 수(px → 수 · 초 → 밀리초 · cubic-bezier → 네 수)
//   node tools/tokens/make.mjs           # 만들기
//   node tools/tokens/make.mjs --check   # 원본과 생성물이 어긋나면 1(시험 tests/design_tokens.test.mjs 도 같은 셈을 한다)
// 원본 이름 규칙: 그룹의 $prefix + 키(키 DEFAULT 는 접두어만 · 키의 . 은 -). 값이 { light, dark } 면 다크에서 바뀐다
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../../web/tokens/tokens.json', import.meta.url));
const CSS_OUT = fileURLToPath(new URL('../../web/tokens/tokens.css', import.meta.url));
const TS_OUT = fileURLToPath(new URL('../../web/tokens/tokens.mts', import.meta.url));
const HEAD = '생성물 — 직접 고치지 말 것. 원본 web/tokens/tokens.json 을 고치고 node tools/tokens/make.mjs';

const isThemed = value => typeof value === 'object' && value !== null;
const entries = group => Object.entries(group).filter(([key]) => !key.startsWith('$'));
const groups = tokens => entries(tokens).map(([name, group]) => ({ name, prefix: group.$prefix ?? '', items: entries(group) }));

/** 원본 키 → CSS 변수 이름(--…) */
export function cssName(prefix, key) {
  if (key === 'DEFAULT') return `--${prefix.replace(/-$/, '')}`;
  return `--${prefix}${key.replaceAll('.', '-')}`;
}

export function renderCss(tokens) {
  const light = [];
  const dark = [];
  for (const { prefix, items } of groups(tokens)) {
    for (const [key, value] of items) {
      const name = cssName(prefix, key);
      if (isThemed(value)) {
        light.push(`  ${name}:${value.light};`);
        dark.push(`  ${name}:${value.dark};`);
      } else light.push(`  ${name}:${value};`);
    }
  }
  return `/* ${HEAD} */\n:root{\n${light.join('\n')}\n}\nhtml[data-theme=dark]{\n${dark.join('\n')}\n}\n`;
}

// 앱 쪽 값: px · ms 는 수, cubic-bezier 는 네 수, 그 밖(색 · 그림자 · 글꼴 · 굵기 · %)은 글자 그대로
function appValue(value) {
  const px = /^(-?\d*\.?\d+)px$/.exec(value);
  if (px) return Number(px[1]);
  const seconds = /^(\d*\.?\d+)s$/.exec(value);
  if (seconds) return Math.round(Number(seconds[1]) * 1000);
  const bezier = /^cubic-bezier\(([^)]*)\)$/.exec(value);
  if (bezier) return bezier[1].split(',').map(Number);
  return value;
}

const camel = key => key.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());

export function appTokens(tokens) {
  const out = {};
  for (const { name, items } of groups(tokens)) {
    const themed = items.some(([, value]) => isThemed(value));
    const pick = scheme => Object.fromEntries(items.map(([key, value]) => [camel(key), appValue(isThemed(value) ? value[scheme] : value)]));
    out[name] = themed ? { light: pick('light'), dark: pick('dark') } : pick('light');
  }
  return out;
}

export function renderTs(tokens) {
  const body = JSON.stringify(appTokens(tokens), null, 2);
  return `// ${HEAD}\n// 앱(React Native)용: 색 · 그림자는 tokens.color[scheme] 처럼 light · dark 로 고른다. px → 수, 시간 → 밀리초, ease → cubic-bezier 네 수\nexport const tokens = ${body} as const;\n\nexport type Tokens = typeof tokens;\n`;
}

export const readTokens = () => JSON.parse(readFileSync(SOURCE, 'utf8'));
export const OUTPUTS = { css: CSS_OUT, ts: TS_OUT };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tokens = readTokens();
  const files = [[CSS_OUT, renderCss(tokens)], [TS_OUT, renderTs(tokens)]];
  if (process.argv.includes('--check')) {
    const stale = files.filter(([file, text]) => readFileSync(file, 'utf8') !== text).map(([file]) => file);
    if (stale.length) {
      console.error(`토큰 생성물이 원본과 다르다 — node tools/tokens/make.mjs:\n${stale.join('\n')}`);
      process.exit(1);
    }
  } else for (const [file, text] of files) writeFileSync(file, text);
}
