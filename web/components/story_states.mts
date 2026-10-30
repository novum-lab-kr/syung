// 스토리 전용(운영에서 부르지 않는다): 누름 · 포커스를 멈춰 보인다. syung.css 의 :active · :focus-visible · :focus-within 규칙을 .is-pressed · .is-focus 로 복사해 넣는다
// — 화면 스타일에 스토리용 class 를 더하지 않고 지금 규칙을 그대로 보이기 위해서
const STYLE_ID = 'sb-frozen-states';
function copyRules() {
  if (document.getElementById(STYLE_ID)) return;
  const copied:string[] = [];
  for (const sheet of document.styleSheets) {
    let rules:CSSRuleList;
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && /:active|:focus-visible|:focus-within/.test(rule.selectorText))
        copied.push(rule.cssText.replace(/:active/g, '.is-pressed').replace(/:focus-visible|:focus-within/g, '.is-focus'));
    }
  }
  const style = document.createElement('style');
  style.id = STYLE_ID; style.textContent = copied.join('\n');
  document.head.append(style);
}
// 스토리 play 에서: 고른 칸들에 표시를 붙인다
export function freeze(root:Element, selector:string, state:'is-pressed' | 'is-focus') {
  copyRules();
  root.querySelectorAll(selector).forEach(element => element.classList.add(state));
}
