// 간판 글자: 한국 상가 간판처럼 업종 이름을 굵은 고딕으로 쓴 글자 묶음 그림(1024 × 1024, 한 채널). 도시 건물 셰이더(buildings.mjs kind 7)가
// 간판마다 낱말 하나를 골라 간판 크기에 맞춰 가운데에 쓴다. 상호(브랜드)는 넣지 않고 업종 이름만(행님 2026-10-22: 한국 간판처럼).
// 칸: 가로 낱말 64개(256 × 40 px, 4열 × 16줄 — 0~39 1층 가로 간판, 40~63 2층 창 간판), 세로 낱말 24개(40 × 256 px, y 656 부터).
// 메인 스레드에서만 만든다(캔버스). 캔버스가 없으면 null — 셰이더는 그때 예전 획 무늬로 쓴다.
export const SIGN_WORDS = {
  fascia: ['치킨', '편의점', '약국', '부동산', '미용실', '노래방', 'PC방', '김밥', '분식', '세탁소', '안경원', '카페', '커피', '떡볶이', '국밥', '순대국', '삼겹살', '갈비', '횟집', '반점',
    '정육점', '마트', '슈퍼마켓', '꽃집', '빵집', '베이커리', '휴대폰', '철물점', '감자탕', '호프', '당구장', '사진관', '문구', '서점', '헤어', '네일', '족발 · 보쌈', '냉면', '칼국수', '부대찌개'],
  upper: ['수학학원', '영어학원', '태권도', '피아노', '치과', '내과', '소아과', '한의원', '정형외과', '피부과', '이비인후과', '공인중개사', '세무회계', '법무사', '필라테스', '헬스',
    '스터디카페', '독서실', '미술학원', '교회', '노래연습장', '당구클럽', '보습학원', '안과'],
  blade: ['치킨', '약국', '노래방', '호프', '당구장', 'PC방', '미용실', '한의원', '치과', '내과', '학원', '태권도', '사우나', '감자탕', '국밥', '카페', '노래연습장', '부동산', '피아노', '헬스', '교회', '안경', '세탁', '분식'],
};
export const SIGN_ATLAS = { size: 1024, hW: 256, hH: 40, hCols: 4, vW: 40, vH: 256, vY: 656 };
const FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","Nanum Gothic",sans-serif';

// → { data: Uint8Array(size²) 글자 진하기, hWidth: Float32Array(64) 가로 낱말 폭(칸 폭 비), vLen: Float32Array(24) 세로 낱말 길이(칸 높이 비) } 또는 null
export function buildSignAtlas():{ data:Uint8Array; hWidth:Float32Array; vLen:Float32Array } | null {
  const A = SIGN_ATLAS, doc = globalThis.document; if (!doc?.createElement) return null;
  const c = doc.createElement('canvas'); c.width = c.height = A.size; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.fillStyle = '#000'; g.fillRect(0, 0, A.size, A.size); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
  const hWidth = new Float32Array(64), vLen = new Float32Array(24), horiz = [...SIGN_WORDS.fascia, ...SIGN_WORDS.upper];
  horiz.forEach((w, i) => {   // 가로: 칸 높이의 80 % 글자, 넘치면 가로로만 줄인다(간판 글씨처럼 장평)
    const x0 = (i % A.hCols) * A.hW, y0 = Math.floor(i / A.hCols) * A.hH, fs = Math.round(A.hH * .8);
    g.font = `900 ${fs}px ${FONT}`; const m = g.measureText(w).width, k = Math.min(1, (A.hW - 8) / m);
    g.save(); g.translate(x0 + 4, y0 + A.hH / 2 + 1); g.scale(k, 1); g.fillText(w, 0, 0); g.restore();
    hWidth[i] = (Math.min(m, A.hW - 8) + 8) / A.hW;
  });
  SIGN_WORDS.blade.forEach((w, i) => {   // 세로: 글자를 위에서 아래로 한 자씩(영문 · 숫자 묶음은 한 자로)
    const chars = w.match(/[A-Za-z0-9]+|./g)!, x0 = i * A.vW, fs = Math.round(A.vW * .8), step = Math.min(fs * 1.08, (A.vH - 8) / chars.length);
    g.font = `900 ${fs}px ${FONT}`; g.textAlign = 'center';
    chars.forEach((ch, j) => { const m = g.measureText(ch).width, k = Math.min(1, (A.vW - 4) / m); g.save(); g.translate(x0 + A.vW / 2, A.vY + 4 + step * (j + .5)); g.scale(k, Math.min(1, step / fs)); g.fillText(ch, 0, 0); g.restore() });
    g.textAlign = 'left'; vLen[i] = (step * chars.length + 8) / A.vH;
  });
  const px = g.getImageData(0, 0, A.size, A.size).data, data = new Uint8Array(A.size * A.size);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4]!;
  return { data, hWidth, vLen };
}
