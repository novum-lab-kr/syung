// 모드 id → 화면 이름. 값은 웹 web/modes/<모드>/index.mts 의 label 그대로(다리 ready.modes 는 id 만 준다). 모르는 id 는 id 그대로 보인다
const LABELS: Record<string, string> = {
  basic: '기본', simcity: '심시티', joseon: '조선', coaster: '롤러코스터', retro: '레트로',
  terran: '테란', zerg: '저그', protoss: '프로토스', greece: '그리스', netherlands: '네덜란드', paris: '파리', egypt: '이집트',
};

export const modeLabel = (id: string): string => LABELS[id] ?? id;
