// 환구단 안 나무 자리 — 손으로 고치지 않는다(만든 곳: 시안 폴더 gen3.py · 출처 © OpenStreetMap contributors, ODbL).
// 좌표는 HG_AT 기준 동 · 북 방향 0.1 m 정수 짝. 수종: pine 소나무형(침엽) · broad · wide 활엽수형 둘(수종 미상의 활엽수) · persimmon 은 비어 있다(근거 자료 없음).
// 자리 근거: natural=tree 점은 그대로, natural=wood 면(leaf_type 표기 따라 침엽 · 활엽, 표기 없음은 소나무 35% · 활엽 65% 로 섞음 — 수종 미상)은 약 7 m 격자에 흔들어 채운 근사 자리. 건물 · 길 · 담장 · 연못 위는 뺐다.
export const HG_TREES:Record<"pine" | "broad" | "wide" | "persimmon", number[]> = {
  pine: [],
  broad: [-321,-86,-442,-160,-390,47,-318,141,-218,115,22,189,262,-237,184,-268],
  wide: [-78,284,-48,-343,312,-104,-486,-226,-500,-302,-241,220,-283,36,281,35,544,-116,149,210],
  persimmon: [],
};
