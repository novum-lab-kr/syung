// 조계사 안 나무 자리 — 손으로 고치지 않는다(만든 곳: 작업 폴더 밖 시안 gen6.py · 출처 © OpenStreetMap contributors, ODbL).
// 좌표는 JG_AT 기준 동 · 북 방향 0.1 m 정수 짝. 수종: pine 소나무형(침엽) · broad · wide 활엽수형 둘(수종 미상의 활엽수) · persimmon 은 비어 있다(근거 자료 없음).
// 자리 근거: natural=tree 점은 그대로, tree_row 는 6 m 간격, natural=wood 면은 약 7 m 격자에 흔들어 채운 근사. 건물 · 길 · 담 위는 뺐다.
export const JG_TREES:Record<"pine" | "broad" | "wide" | "persimmon", number[]> = {
  pine: [-19,-213],
  broad: [],
  wide: [],   // 회화나무는 공용 나무가 아니라 monuments_jogyesa.mts 의 전용 모델(높이 24 m)
  persimmon: [],
};
