// 운현궁 안 나무 자리 — 손으로 고치지 않는다(만든 곳: 시안 폴더 palaces2/gen.py · 출처 © OpenStreetMap contributors, ODbL).
// 좌표는 UHG_AT(126.9873 · 37.576) 기준 동 · 북 방향 0.1 m 정수 짝. 수종: pine 소나무형(침엽) · broad · wide 활엽수형 둘(수종 미상의 활엽수) · persimmon 은 비어 있다(근거 자료 없음).
// 자리 근거: natural=tree 점은 그대로, natural=wood 면(leaf_type 표기 따라 침엽 · 활엽, 표기 없음은 소나무 35% · 활엽 65% 로 섞음 — 수종 미상)은 약 7 m 격자에 흔들어 채운 근사 자리. 건물 · 길 · 담장 · 연못 위는 뺐다.
export const UHG_TREES:Record<"pine" | "broad" | "wide" | "persimmon", number[]> = {
  pine: [],
  broad: [-452,49,-431,-34,-398,-134],
  wide: [],
  persimmon: [],
};
