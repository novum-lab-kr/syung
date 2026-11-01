// 석촌동 고분군 나무 자리 — 손으로 고치지 않는다(만든 곳: 시안 폴더 tombs/gen_tombs.mjs · 출처 © OpenStreetMap contributors, ODbL).
// 좌표는 SKC_AT 기준 동 · 북 방향 0.1 m 정수 짝. 수종: pine 소나무형(침엽) · broad · wide 활엽수형 둘(수종 미상의 활엽수) · persimmon 은 비어 있다(근거 자료 없음).
// 자리 근거: natural=tree 점은 그대로, natural=wood · landuse=forest 면(leaf_type 표기 따라 침엽 · 활엽, 표기 없음은 소나무 35% · 활엽 65% 로 섞음 — 수종 미상)은 약 7 m 격자에 흔들어 채운 근사 자리.
// 건물 · 봉분 · 둔덕 · 곡장 · 길 · 연못 · 성벽 위는 뺐다.
export const SKC_TREES:Record<"pine" | "broad" | "wide" | "persimmon", number[]> = {
  pine: [],
  broad: [226,-321],
  wide: [246,-883],
  persimmon: [],
};
