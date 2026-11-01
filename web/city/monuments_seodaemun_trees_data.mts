// 서대문형무소역사관 안 나무 자리 — 손으로 고치지 않는다(만든 곳: 작업 폴더 밖 시안 gen6.py · 출처 © OpenStreetMap contributors, ODbL).
// 좌표는 SD_AT 기준 동 · 북 방향 0.1 m 정수 짝. 수종: pine 소나무형(침엽) · broad · wide 활엽수형 둘(수종 미상의 활엽수) · persimmon 은 비어 있다(근거 자료 없음).
// 자리 근거: natural=tree 점은 그대로, tree_row 는 6 m 간격, natural=wood 면은 약 7 m 격자에 흔들어 채운 근사. 건물 · 길 · 담 위는 뺐다.
export const SD_TREES:Record<"pine" | "broad" | "wide" | "persimmon", number[]> = {
  pine: [744,809,760,717,741,768,692,816,605,867,880,749,884,673,904,634,1154,625],
  broad: [939,613,908,574,1034,418,904,717,639,828,770,678,1074,-5,1119,-64],
  wide: [956,689,859,627,853,705,911,664,690,748],
  persimmon: [],
};
