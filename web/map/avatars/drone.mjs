// 저그 드론: 보랏빛 갈색 등딱지와 짧은 등뼈, 상아색 턱과 늘어진 발톱으로 떠다니는 일꾼.
export const name = '저그 드론';
export const rig = {hip: .43, shoulder: .53};
export function build({box, quad}) {
  const shell = '#92667f', ridge = '#bb8b9b', flesh = '#b57f69', horn = '#edcba2';
  box(-.38,-.24,.43,.23,.24,.76,shell);
  box(-.3,-.3,.48,.16,.3,.7,shell);
  box(-.29,-.2,.75,.13,.2,.86,ridge);
  box(-.41,-.18,.48,-.3,.18,.72,'#78566e');
  box(-.47,-.115,.49,-.4,.115,.65,flesh);
  box(-.29,-.22,.37,.22,.22,.48,flesh);
  box(.16,-.19,.47,.34,.19,.69,flesh);
  box(.24,-.16,.66,.35,.16,.74,shell);
  box(.335,-.12,.51,.355,.12,.59,'#69435a');
  for (const s of [-1, 1]) {
    const part = s > 0 ? 'armL' : 'armR';
    const lo = (a, b) => [Math.min(s*a,s*b), Math.max(s*a,s*b)];
    const limb = (x0,a,z0,x1,b,z1,color,p = 'body') => {
      const [y0,y1] = lo(a,b); box(x0,y0,z0,x1,y1,z1,color,p);
    };
    limb(.334,.105,.62,.36,.155,.663,'#f7bf75');
    limb(.27,.09,.46,.43,.16,.515,horn,part);
    limb(.4,.07,.49,.46,.12,.57,horn,part);
    limb(.02,.26,.44,.24,.34,.54,shell,part);
    limb(.2,.29,.34,.38,.37,.45,flesh,part);
    limb(.34,.26,.31,.47,.32,.38,horn,part);
    limb(-.26,.22,.26,-.17,.3,.47,flesh,s > 0 ? 'legL' : 'legR');
    limb(-.2,.23,.16,-.1,.28,.29,horn,s > 0 ? 'legL' : 'legR');
    limb(-.22,.21,.66,-.16,.305,.76,ridge);
    limb(-.03,.21,.66,.03,.305,.76,ridge);
  }
  // 등뼈는 날개 대신 세 개의 짧은 쐐기. 네 면을 닫아 어느 방향에서도 실루엣이 남는다.
  for (const [x, top] of [[-.23,.98],[-.06,1],[.11,.92]]) {
    const a=[x-.055,-.055,.81], b=[x+.065,-.055,.81];
    const c=[x+.065,.055,.81], d=[x-.055,.055,.81], tip=[x-.045,0,top];
    quad(a,b,tip,tip,[0,-.93,.37],horn);
    quad(c,d,tip,tip,[0,.93,.37],ridge);
    quad(d,a,tip,tip,[-.97,0,.24],shell);
    quad(b,c,tip,tip,[.83,0,.56],horn);
  }
}
