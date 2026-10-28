// 프로토스 프로브: 둥근 금청동 머리와 청록 수정 눈, 아래로 벌어진 네 개의 가는 침.
import type { AvatarPart, AvatarTools } from '../avatar.mts';
export const name = '프로토스 프로브';
export const rig = {hip: .52, shoulder: .52};
export function build({box, quad}:AvatarTools) {
  const gold = '#dcb963', light = '#f3d990', bronze = '#9b743f', cyan = '#70efeb';
  // 상자를 겹친 계단형 곡면: 넓은 가운데와 작은 정수리로 둥근 탐사정 머리.
  box(-.27,-.24,.56,.25,.24,.86,gold);
  box(-.21,-.29,.61,.18,.29,.81,gold);
  box(-.21,-.19,.85,.2,.19,.94,light);
  box(-.12,-.12,.93,.11,.12,.99,light);
  box(-.22,-.2,.49,.2,.2,.57,bronze);
  box(-.15,-.14,.46,.14,.14,.5,'#e4c477');
  box(-.3,-.12,.64,-.265,.12,.81,bronze);
  box(-.315,-.075,.68,-.3,.075,.77,cyan);
  // 눈은 앞쪽 장갑 테두리 밖으로 솟은 수정. 밝은 중심은 기존 조명 아래에서도 보인다.
  box(.25,-.145,.635,.276,.145,.825,bronze);
  box(.276,-.112,.665,.305,.112,.795,'#258f9c');
  box(.305,-.078,.69,.334,.078,.775,cyan);
  box(.334,-.033,.715,.342,.033,.756,'#d5fffa');
  box(-.06,-.035,.99,.06,.035,1.015,bronze);
  // 네 침은 사각 단면의 가늘어지는 금속 봉. 앞뒤로 갈라져 떠 있는 몸을 받친다.
  const spar = (a:readonly number[],b:readonly number[],wa:number,wb:number,color:string,part:AvatarPart,rootX:number) => {
    const ends = (p:readonly number[],w:number):number[][] => [[p[0]!-w,p[1]!-w,p[2]!],[p[0]!+w,p[1]!-w,p[2]!],
      [p[0]!+w,p[1]!+w,p[2]!],[p[0]!-w,p[1]!+w,p[2]!]];
    const A=ends(a,wa), B=ends(b,wb), pivot=[rootX,rig.hip];
    quad(A[0]!,A[1]!,B[1]!,B[0]!,[0,-1,0],color,part,pivot);
    quad(A[1]!,A[2]!,B[2]!,B[1]!,[1,0,0],light,part,pivot);
    quad(A[2]!,A[3]!,B[3]!,B[2]!,[0,1,0],color,part,pivot);
    quad(A[3]!,A[0]!,B[0]!,B[3]!,[-1,0,0],bronze,part,pivot);
    quad(A[3]!,A[2]!,A[1]!,A[0]!,[0,0,1],light,part,pivot);
    quad(B[0]!,B[1]!,B[2]!,B[3]!,[0,0,-1],color,part,pivot);
  };
  for (const sx of [-1,1]) for (const sy of [-1,1]) {
    const part = sy > 0 ? 'legL' : 'legR';
    const x=sx*.155, y=sy*.19;
    box(x-.065,y-.065,.5,x+.065,y+.065,.63,bronze,part);
    box(x-.046,y-.046,.49,x+.046,y+.046,.57,cyan,part);
    spar([x,y,.52],[sx*.32,sy*.34,.34],.047,.033,gold,part,x);
    spar([sx*.32,sy*.34,.34],[sx*.4,sy*.37,.14],.033,.006,gold,part,x);
  }
}
