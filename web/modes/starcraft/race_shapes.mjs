// 종족마다 저층 원형 여섯 가지와 고층 원형 하나. 윤곽 몸통과 내접원 장식만 써서 이웃 땅을 침범하지 않는다.
// 고정 난수로 비율과 장식 수를 바꾸며, 작은 필지는 돔의 면 수와 부품 수를 줄인다.
const TAU = Math.PI * 2;
const accent = slot => ({ look: 'accent', slot });
const glow = slot => ({ look: 'glow', slot });
function site(B) {
  if (!(B.r >= 2 && B.H > B.minH)) return null;
  return { r: B.r, z: B.minH, h: B.H - B.minH, H: B.H,
    small: B.A < 150, n: B.A < 150 ? 8 : 10, v: B.rand(1) };
}
function crystal(B, x, y, r, z, h, slot = 0) {
  B.frustum(x,y,r*.4,r,z,z+h*.4,{ n:4,rot:Math.PI/4,...glow(slot) });
  B.frustum(x,y,r,0,z+h*.4,z+h,{ n:4,rot:Math.PI/4,...glow(slot) });
}
function spikes(B, r, z, h, count, slot = 1) {
  for (let i=0;i<count;i++) {
    const a=TAU*(i/count+B.rand(7)*.15), x=Math.cos(a)*r*.64, y=Math.sin(a)*r*.64;
    B.frustum(x,y,r*.12,0,z,z+h*(.75+B.rand(20+i)*.25),{ n:4,...accent(slot) });
  }
}
function pad(B, r, z, slot = 0) {
  const top=z+Math.min(r*.07,.7);
  B.frustum(0,0,r*.83,r*.83,z,top,{ n:8,...accent(slot) });
  B.box(0,0,r*.42,r*.045,top+.01,top+.07,glow(1));
  B.box(0,0,r*.045,r*.24,top+.01,top+.07,glow(1));
}
function radar(B,r,z) {
  B.box(-r*.35,0,r*.055,r*.055,z,z+r*.3,{look:'metal'});
  B.box(-r*.35,0,r*.06,r*.23,z+r*.28,z+r*.47,{rot:.3,...accent(2)});
}
export const RACE_SHAPES = {
  terran(B, R) {
    const S=site(B); if (!S) return false;
    const {r,z,h,H,small,v}=S, rim=Math.min(r*.16,2);
    // 고층: 원래 높이의 강철 탑, 사선 장갑 크라운, 통신 안테나와 경고등.
    if (H>40) {
      B.body(z,H-h*.12); B.taper(H-h*.12,H,0,rim,accent(0));
      B.roof(H,{inset:rim});
      B.box(0,0,r*.3,r*.23,H,H+r*.15,accent(1));
      B.frustum(0,0,r*.055,r*.025,H+r*.15,H+r*(.65+v*.25),{n:4,look:'metal'});
      B.box(0,0,r*.055,r*.055,H+r*.78,H+r*.87,glow(0));
      if (!small) radar(B,r,H);
      return;
    }
    const long=B.len/Math.max(B.wid,1)>2;
    const kind=small ? (v<.5?2:5) : B.type==='civic'?0 : B.type==='industrial'?(v<.5?3:4) : long?1 : Math.floor(v*6);
    const deck=H-Math.min(h*.22,r*.3);
    B.body(z,deck,{windows:kind===0 || kind===1});
    B.taper(deck,H,0,rim,accent(kind===2?1:0)); B.roof(H,{inset:rim});
    if (kind===0) { // 커맨드 센터: 장갑 테, 지붕 착륙 패드, 레이더.
      pad(B,r,H,1); radar(B,r,H+r*.08);
      B.box(r*.57,0,r*.08,r*.18,deck,H,glow(0));
    } else if (kind===1) { // 배럭: 긴 윤곽의 경사 지붕과 격납문, 평행 환기구.
      B.box(0,0,r*.13,r*.59,deck-r*.12,H,accent(2));
      B.box(r*.18,0,r*.035,r*.43,deck,H-r*.04,accent(1));
      for (const s of [-1,1]) B.box(-r*.27,s*r*.4,r*.24,r*.055,H,H+r*.13,{look:'metal'});
      B.box(r*.23,0,r*.04,r*.38,H,H+r*.045,glow(0));
    } else if (kind===2) { // 서플라이 디팟: 세 개의 낮은 저장 상자와 환기구.
      for (let i=-1;i<=1;i++) B.box(i*r*.37,0,r*.14,r*.35,H,H+r*(.15+.05*B.rand(30+i)),accent((i+2)%3));
      B.box(0,0,r*.08,r*.25,H+r*.22,H+r*.27,{look:'metal'});
    } else if (kind===3) { // 스타포트: 넓은 원판과 한쪽 관제탑.
      pad(B,r,H,0);
      B.box(-r*.49,0,r*.15,r*.23,H,H+r*.45,accent(1));
      B.box(-r*.49,0,r*.17,r*.25,H+r*.45,H+r*.52,glow(1));
    } else if (kind===4) { // 팩토리·엔지니어링 베이: 기계실, 크레인 기둥과 가로 보.
      B.box(-r*.28,0,r*.25,r*.4,H,H+r*.22,accent(1));
      B.box(r*.39,-r*.25,r*.065,r*.065,H,H+r*.65,accent(2));
      B.box(r*.1,-r*.25,r*.35,r*.07,H+r*.58,H+r*.68,accent(2));
      B.box(-r*.18,-r*.25,r*.025,r*.025,H+r*.26,H+r*.58,{look:'metal'});
      B.box(-r*.3,r*.27,r*.1,r*.1,H+r*.22,H+r*.32,glow(0));
    } else { // 미사일 터렛: 회전 받침과 쌍열 미사일 포드.
      B.frustum(0,0,r*.46,r*.28,H,H+r*.24,{n:8,...accent(1)});
      for (const s of [-1,1]) {
        B.box(0,s*r*.27,r*.36,r*.13,H+r*.24,H+r*.46,accent(0));
        B.box(r*.36,s*r*.27,r*.025,r*.09,H+r*.29,H+r*.4,glow(0));
      }
    }
  },
  zerg(B, R) {
    const S=site(B); if (!S) return false;
    const {r,z,h,H,small,n,v}=S;
    if (H>40) { // 살덩이 탑·스파이어: 긴 몸통을 살리고 두 번 좁아지는 껍질과 머리 가시.
      B.body(z,H-h*.24,{windows:false});
      B.taper(H-h*.24,H-h*.1,0,r*.18,accent(0));
      B.taper(H-h*.1,H,r*.18,r*.36,accent(2));
      B.roof(H,{inset:r*.36,look:'accent',slot:2});
      B.dome(0,0,r*.58,H,r*.33,{n:8,rings:3,...accent(0)});
      B.frustum(0,0,r*.23,0,H+r*.23,H+r*.95,{n:6,...accent(1)});
      spikes(B,r,H-h*.1,r*.4,small?2:3);
      return;
    }
    const kind=small?(v<.5?3:4):B.type==='industrial'?5:B.type==='civic'?0:B.type==='office'?2:Math.floor(v*6);
    const shoulder=z+h*(kind===1?.68:.52);
    B.body(z,shoulder,{windows:false});
    B.taper(shoulder,H,0,r*.38,accent(0));
    B.roof(H,{inset:r*.38,look:'accent',slot:0});
    if (kind===0) { // 해처리·레어: 큰 알과 둘레 가시, 옆의 작은 부화낭.
      B.dome(0,0,r*.68,H,r*(.42+v*.18),{n,rings:3,...accent(0)});
      spikes(B,r,H,r*.72,small?2:3);
      if (!small) B.dome(r*.5,0,r*.19,H,r*.25,{n:8,rings:3,...accent(2)});
    } else if (kind===1) { // 스포닝 풀: 껍질 테 안에 낮게 고인 연두 생체 웅덩이.
      B.frustum(0,0,r*.82,r*.74,H,H+r*.12,{n,...accent(1)});
      B.frustum(0,0,r*.62,r*.62,H+r*.12,H+r*.135,{n,...glow(0)});
      for (const s of [-1,1]) B.dome(s*r*.58,0,r*.18,H+r*.1,r*.24,{n:8,rings:3,...accent(2)});
    } else if (kind===2) { // 스파이어: 목이 좁은 유기질 첨탑과 부푼 관.
      B.frustum(0,0,r*.5,r*.22,H,H+r*.4,{n:8,...accent(2)});
      B.dome(0,0,r*.43,H+r*.4,r*.32,{n:8,rings:3,...accent(0)});
      spikes(B,r*.66,H+r*.56,r*.35,3);
    } else if (kind===3) { // 크립 콜로니: 낮은 종양, 중앙 생체광과 짧은 뿔.
      B.dome(0,0,r*.78,H,r*.35,{n:8,rings:3,...accent(2)});
      B.dome(0,0,r*.22,H+r*.31,r*.13,{n:8,rings:2,...glow(1)});
      spikes(B,r,H,r*.36,2);
    } else if (kind===4) { // 성큰 콜로니: 중앙의 굵은 촉수 가시와 장갑 목.
      B.frustum(0,0,r*.62,r*.34,H,H+r*.24,{n:8,...accent(0)});
      B.frustum(0,0,r*.27,r*.11,H+r*.24,H+r*.57,{n:6,...accent(2)});
      B.frustum(0,0,r*.11,0,H+r*.57,H+r*.96,{n:4,...accent(1)});
    } else { // 익스트랙터: 가스낭 세 개와 중앙 분출구.
      for (let i=0;i<3;i++) {
        const a=i*TAU/3;
        B.dome(Math.cos(a)*r*.4,Math.sin(a)*r*.4,r*.3,H,r*.38,{n:8,rings:3,...accent(i)});
      }
      B.frustum(0,0,r*.22,r*.17,H+r*.28,H+r*.66,{n:6,...accent(2)});
      B.frustum(0,0,r*.14,r*.14,H+r*.66,H+r*.69,{n:6,...glow(0)});
    }
  },
  protoss(B, R) {
    const S=site(B); if (!S) return false;
    const {r,z,h,H,small,n,v}=S;
    if (H>40) { // 금빛 고층: 높은 몸통과 사선 왕관, 떠오른 수정 끝.
      B.body(z,H-h*.18); B.taper(H-h*.18,H,0,r*.3,accent(0));
      B.roof(H,{inset:r*.3});
      B.frustum(0,0,r*.6,r*.36,H,H+r*.22,{n:8,...accent(1)});
      crystal(B,0,0,r*.28,H+r*.22,r*(.6+v*.15),0);
      return;
    }
    const kind=small?(v<.5?2:5):B.type==='civic'?0:B.len/Math.max(B.wid,1)>2?1:B.type==='industrial'?3:Math.floor(v*6);
    const deck=H-Math.min(h*.25,r*.3);
    B.body(z,deck,{windows:false});
    B.taper(deck,H,0,r*.2,accent(0)); B.roof(H,{inset:r*.2});
    if (kind===0) { // 넥서스: 넓은 금빛 기단과 큰 돔, 중앙 수정.
      B.dome(0,0,r*.8,H,r*.45,{n,rings:3,...accent(1)});
      crystal(B,0,0,r*.19,H+r*.44,r*.45,0);
      if (!small) for (const s of [-1,1]) B.frustum(0,s*r*.61,r*.14,0,H,H+r*.38,{n:4,...accent(2)});
    } else if (kind===1) { // 게이트웨이: 양쪽 금속 기둥 사이에 빛나는 입구, 위로 걸친 반돔.
      for (const s of [-1,1]) B.box(0,s*r*.49,r*.2,r*.15,H,H+r*.47,accent(1));
      B.box(0,0,r*.06,r*.31,H,H+r*.37,glow(2));
      B.dome(0,0,r*.67,H+r*.47,r*.27,{n:8,rings:3,...accent(0)});
    } else if (kind===2) { // 파일런: 네모 금속 받침 위 길고 날카로운 수정.
      B.frustum(0,0,r*.63,r*.38,H,H+r*.18,{n:4,rot:Math.PI/4,...accent(0)});
      crystal(B,0,0,r*.34,H+r*.18,r*.77,0);
      for (const s of [-1,1]) B.frustum(0,s*r*.5,r*.13,0,H,H+r*.48,{n:4,...accent(2)});
    } else if (kind===3) { // 포지: 납작한 돔과 금속 테, 앞쪽 수정 가공구.
      B.frustum(0,0,r*.83,r*.8,H,H+r*.1,{n,...accent(2)});
      B.dome(0,0,r*.68,H+r*.1,r*.36,{n,rings:3,...accent(1)});
      crystal(B,r*.56,0,r*.14,H+r*.08,r*.28,1);
    } else if (kind===4) { // 사이버네틱스 코어: 둥근 중앙 수정과 양옆 장갑 포드.
      B.dome(0,0,r*.46,H,r*.48,{n:8,rings:3,...glow(1)});
      for (const s of [-1,1]) B.dome(0,s*r*.52,r*.24,H,r*.3,{n:8,rings:3,...accent(0)});
      B.frustum(0,0,r*.6,r*.53,H,H+r*.12,{n:8,...accent(2)});
    } else { // 포톤 캐논: 회전 받침, 작은 금빛 머리와 돌출 수정 포구.
      B.frustum(0,0,r*.62,r*.32,H,H+r*.2,{n:8,...accent(0)});
      B.dome(0,0,r*.39,H+r*.2,r*.32,{n:8,rings:3,...accent(1)});
      crystal(B,r*.46,0,r*.16,H+r*.22,r*.24,0);
    }
  },
};
