// 원작 1편 건물 그림을 보고 만든 낮은 독립 모형 50종. 도시 건물 높이는 사용하지 않는다.
// 참고: classic.battle.net/scc/{terran,zerg,protoss}/{bbuild,abuild}.shtml 및 제공된 검색 격자(무관한 결과는 공식 그림으로 보완).
import type { ModelBuilder as MB, BuildingModel, Look } from './race_buildings.mts';
type Pair = [number, number];
type V3 = [number, number, number];
const A = (slot:number) => ({look:'accent' as Look,slot});
const G = (slot:number) => ({look:'glow' as Look,slot});
const D = {look:'roof' as Look};
const fit = (minArea:number,maxAspect:number,weight:number) => ({minArea,maxArea:Infinity,maxAspect,tall:false,weight});
const rect = (x:number,y:number,hx:number,hy:number):Pair[] => [[x-hx,y-hy],[x+hx,y-hy],[x+hx,y+hy],[x-hx,y+hy]];
const ngon = (M:MB,x:number,y:number,r:number,n=8) => Array.from({length:n},(_,i):Pair=>[x+Math.cos(i*Math.PI*2/n)*r/M.aspect,y+Math.sin(i*Math.PI*2/n)*r]);
function box(M:MB,x:number,y:number,hx:number,hy:number,z:number,h:number,slot=0) { M.box(x,y,hx,hy,z,z+h,A(slot)) }
function bevel(M:MB,x:number,y:number,hx:number,hy:number,z:number,h:number,slot=0) {
  M.loft(rect(x,y,hx,hy),z,rect(x,y,hx*.77,hy*.77),z+h,{...A(slot),top:true});
}
function drum(M:MB,x:number,y:number,r:number,z:number,h:number,slot=0,r1=r,n=8) { M.frustum(x,y,r,r1,z,z+h,{n,...A(slot)}) }
function dome(M:MB,x:number,y:number,r:number,z:number,h:number,slot=0,light=false) { M.dome(x,y,r,z,h,{n:8,rings:3,...(light?G(slot):A(slot))}) }
function sphere(M:MB,x:number,y:number,r:number,z:number,h:number,slot=0,light=true) {
  M.frustum(x,y,r*.32,r,z,z+h*.4,{n:8,...(light?G(slot):A(slot))});
  dome(M,x,y,r,z+h*.4,h*.6,slot,light);
}
function crystal(M:MB,x:number,y:number,r:number,z:number,h:number,slot=0) {
  M.frustum(x,y,r*.02,r,z,z+h*.43,{n:6,...G(slot)});
  M.frustum(x,y,r,0,z+h*.43,z+h,{n:6,...G(slot)});
}
function bone(M:MB,a:V3,b:V3,c:V3,r=.09,slot=1) {
  // 뿔은 수직 원뿔 대신 굽은 두 마디. 끝이 안쪽/바깥쪽으로 휘는 원작 갈고리를 남긴다.
  const p=ngon(M,a[0],a[1],r,6),q=ngon(M,b[0],b[1],r*.55,6),tip=q.map(():Pair=>[c[0],c[1]]);
  M.loft(p,a[2],q,b[2],{...A(slot),top:false});
  M.loft(q,b[2],tip,c[2],{...A(slot),top:false});
}
function strut(M:MB,a:V3,b:V3,w=.055,slot=1) {
  const lo=a[2]<=b[2]?a:b,hi=a[2]<=b[2]?b:a;
  M.loft(rect(lo[0],lo[1],w,w),lo[2],rect(hi[0],hi[1],w*.8,w*.8),Math.max(lo[2]+.02,hi[2]),{...A(slot),top:true});
}
function ring(M:MB,x:number,y:number,r:number,z:number,width=.09,slot=1,n=8) {
  const a=ngon(M,x,y,r,n),b=ngon(M,x,y,r-width,n);
  for(let i=0;i<n;i++) {
    const j=(i+1)%n,p=[b[i]!,a[i]!,a[j]!,b[j]!];
    M.loft(p,z,p,z+.045,{...A(slot),top:true});
  }
}
function slit(M:MB,x:number,y:number,hx:number,hy:number,z:number,h=.08,slot=1) { M.box(x,y,hx,hy,z,z+h,G(slot)) }
function grille(M:MB,x:number,y:number,z:number,count=4) {
  for(let i=0;i<count;i++) M.box(x+(i-(count-1)/2)*.085,y,.018,.13,z,z+.035,D);
}
function legs(M:MB) {
  for(const x of [-.57,.57])for(const y of [-.57,.57]) {
    bevel(M,x,y,.16,.14,0,.12,1);
    strut(M,[x,y,.12],[x*.77,y*.77,.43],.075,0);
  }
}
function tendrils(M:MB,count=6) {
  for(let i=0;i<count;i++) {
    const a=i*Math.PI*2/count,x=Math.cos(a),y=Math.sin(a);
    M.loft(ngon(M,x*.48,y*.48,.13,6),.04,ngon(M,x*.7,y*.7,.055,6),.14,{...A(2),top:true});
  }
}
function maw(M:MB,x:number,y:number,z:number,w=.23) {
  M.box(x,y,w,.035,z,z+.2,D);
  for(const s of [-1,1])bone(M,[x+s*w,y,.09+z],[x+s*w*.85,y-.035,z+.27],[x+s*w*.48,y-.02,z+.37],.065);
}
function ribs(M:MB,z:number,count=4) {
  for(let i=0;i<count;i++) {
    const x=(i-(count-1)/2)*.16;
    strut(M,[x,-.5,z],[x,-.1,z+.32],.035,1);
    strut(M,[x,.5,z],[x,.1,z+.32],.035,1);
  }
}
export const BUILDING_MODELS:Record<string, BuildingModel[]> = {
  terran:[
    // 팔각 비행 몸통, 네 착륙 다리, 한쪽으로 치우친 관제 상자와 뒤 배기통.
    {id:'commandCenter',name:'커맨드 센터',fit:{...fit(220,2.2,3), big:true},build(M) {
      legs(M);
      drum(M,0,0,.85,.32,.25,0,.66);
      drum(M,0,0,.66,.57,.44,1);
      drum(M,0,0,.73,1.01,.16,0,.5);
      bevel(M,-.1,.07,.25,.25,1.17,.25,2);
      box(M,-.1,.07,.22,.22,1.42,.16,1);
      slit(M,-.1,-.155,.18,.018,1.45,.07);
      box(M,-.1,.07,.11,.11,1.58,.035,0);
      drum(M,.31,.28,.13,1.04,.3,2);
      ring(M,.31,.28,.15,1.34,.045,1,6);
      for(const x of [-.44,0,.44]) {
        bevel(M,x,-.56,.13,.14,.42,.28,0);
        slit(M,x,-.71,.08,.02,.48,.06,0);
      }
      grille(M,-.12,.15,1.625,3);
    }},
    // 두꺼운 쌍벽 사이의 검은 중앙 홈, 높은 어깨 배기구와 아래 수송문.
    {id:'barracks',name:'배럭',fit:{...fit(90,3.8,3), big:true},build(M) {
      legs(M);
      box(M,0,0,.72,.59,.33,.26,2);
      for(const s of [-1,1]) {
        box(M,s*.43,.07,.22,.51,.59,.49,0);
        bevel(M,s*.43,.07,.24,.54,1.08,.2,1);
        box(M,s*.43,.39,.17,.17,1.28,.21,2);
        M.box(s*.43,.39,.11,.11,1.49,1.51,D);
        slit(M,s*.43,-.45,.17,.02,.79,.07,0);
      }
      M.box(0,-.59,.23,.03,.4,.82,D);
      box(M,0,-.65,.3,.1,.32,.08,1);
      slit(M,0,-.635,.19,.015,.82,.05);
      grille(M,0,.25,.6,4);
    }},
    // 원작 디팟의 낮은 기계 묶음: 앞 사각 저장고, 뒤 원형 팬, 옆 둥근 탱크 셋.
    {id:'supplyDepot',name:'서플라이 디팟',fit:{...fit(30,3.8,5), small:true},build(M) {
      bevel(M,0,0,.85,.73,0,.16,2);
      box(M,-.21,-.15,.48,.38,.16,.39,0);
      bevel(M,-.21,-.15,.51,.41,.55,.16,1);
      slit(M,-.23,-.57,.35,.02,.28,.15,2);
      drum(M,-.18,.28,.34,.2,.48,1);
      ring(M,-.18,.28,.32,.68,.075,2,8);
      drum(M,-.18,.28,.19,.68,.035,2);
      for(const y of [-.4,0,.4]) {
        drum(M,.51,y,.17,.13,.27,0);
        dome(M,.51,y,.17,.4,.14,1);
        slit(M,.65,y,.025,.065,.26,.06,0);
      }
      grille(M,-.22,-.12,.72,4);
      box(M,-.61,.38,.07,.09,.3,.15,2);
    }},
    // 세로로 패인 경사 격납 지붕, 세 개의 검은 문, 오른쪽 외부 장비실.
    {id:'factory',name:'팩토리',fit:{...fit(150,4,3), big:true},build(M) {
      bevel(M,0,0,.86,.73,0,.17,2);
      box(M,-.13,0,.65,.58,.17,.58,0);
      for(const x of [-.53,-.1,.33]) {
        M.loft(rect(x,0,.19,.62),.75,rect(x,.09,.16,.4),1.18,{...A(1),top:true});
        M.box(x,-.51,.12,.018,.73,1.03,D);
        box(M,x,-.62,.16,.1,.17,.14,1);
        slit(M,x,-.73,.1,.018,.24,.06,0);
      }
      box(M,.68,.1,.16,.38,.17,.64,2);
      slit(M,.845,.09,.018,.25,.55,.06,0);
      for(const y of [-.11,.21]) drum(M,.63,y,.08,.81,.33,1);
      grille(M,-.1,.12,1.19,4);
      box(M,-.55,.36,.09,.08,1.16,.28,2);
    }},
    // 하나의 큰 원형 착륙 갑판, 앞 진입팔과 네 착륙발, 뒤쪽의 가는 유도등.
    {id:'starport',name:'스타포트',fit:{...fit(160,3,2), big:true},build(M) {
      legs(M);
      box(M,0,0,.58,.49,.3,.24,0);
      drum(M,0,.05,.75,.54,.12,1);
      ring(M,0,.05,.73,.66,.11,2,8);
      drum(M,0,.05,.57,.65,.035,2);
      for(const x of [-.4,.4]) {
        box(M,x,-.58,.1,.27,.3,.09,1);
        slit(M,x,-.81,.07,.02,.39,.04,0);
        strut(M,[x,.46,.57],[x,.62,1.03],.025,2);
        slit(M,x,.62,.03,.03,1.03,.05);
      }
      for(const x of [-.16,.16])slit(M,x,.05,.025,.19,.69,.025);
      slit(M,0,.05,.16,.025,.69,.025);
    }},
    // 원작 엔지니어링 베이의 뭉툭한 정비동, 두 팬·옆 원통·네 벌어진 착륙발.
    {id:'engineeringBay',name:'엔지니어링 베이',fit:{...fit(100,3.4,2), big:true},build(M) {
      legs(M);
      bevel(M,0,0,.7,.63,.28,.32,0);
      box(M,-.12,.07,.49,.42,.6,.28,1);
      for(const x of [-.35,.11]) {
        drum(M,x,.07,.18,.88,.07,2);
        ring(M,x,.07,.17,.95,.045,1,6);
      }
      for(const s of [-1,1]) {
        drum(M,s*.62,-.1,.14,.36,.35,2);
        dome(M,s*.62,-.1,.14,.71,.14,0);
        slit(M,s*.62,-.25,.06,.02,.49,.07,0);
      }
      M.box(0,-.6,.2,.025,.39,.62,D);
    }},
    // 네 사다리꼴 진입판과 가운데 뭉툭한 장갑 지붕, 낮은 측면 총안.
    {id:'bunker',name:'벙커',fit:{...fit(30,2.6,3), small:true},build(M) {
      drum(M,0,0,.86,0,.15,2,.73);
      drum(M,0,0,.73,.15,.29,0,.62);
      dome(M,0,0,.61,.44,.37,1);
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2,x=Math.cos(a),y=Math.sin(a);
        const px=x*.66,py=y*.66;
        M.box(px,py,.075,.075,.3,.39,D);
        bevel(M,x*.64,y*.64,x?.22:.29,x?.29:.22,.025,.12,1);
        slit(M,x*.76,y*.76,.03,.03,.17,.04,0);
      }
      grille(M,0,0,.79,3);
      box(M,0,.18,.08,.08,.74,.13,2);
    }},
    // 작은 회전 받침 위 쌍열 미사일 포드, 뒤로 붙은 레이더판.
    {id:'missileTurret',name:'미사일 터렛',fit:{...fit(30,2.6,2), small:true},build(M) {
      bevel(M,0,0,.63,.61,0,.15,1);
      drum(M,0,0,.36,.15,.2,2);
      box(M,0,0,.14,.16,.35,.51,0);
      drum(M,0,0,.29,.86,.1,1);
      for(const s of [-1,1]) {
        box(M,s*.26,0,.18,.36,.96,.26,0);
        bevel(M,s*.26,0,.2,.38,1.22,.1,1);
        for(const x of [-.07,.07])for(const z of [1.02,1.14]) M.box(s*.26+x,-.37,.04,.02,z,z+.045,D);
        slit(M,s*.26,.34,.12,.02,1.04,.04,0);
      }
      strut(M,[0,.17,.89],[0,.4,1.42],.03,2);
      box(M,0,.41,.17,.025,1.36,.16,1);
    }},
    // 원작 아카데미의 비대칭 원통 연구실 둘, 뒤 배기통 묶음과 가운데 기울어진 제어실.
    {id:'academy',name:'아카데미',fit:{...fit(70,3.4,2), big:true},build(M) {
      bevel(M,0,0,.77,.71,0,.15,2);
      drum(M,-.37,-.18,.27,.15,.43,0);
      ring(M,-.37,-.18,.28,.58,.075,1,8);
      drum(M,-.37,-.18,.18,.57,.035,2);
      drum(M,.34,.2,.31,.15,.65,0);
      ring(M,.34,.2,.3,.8,.075,1,6);
      drum(M,.34,.2,.2,.79,.035,2);
      M.loft(rect(.03,-.19,.27,.28),.28,rect(.07,-.05,.23,.17),.69,{...A(1),top:true});
      slit(M,.03,-.48,.2,.02,.4,.13);
      for(const x of [-.39,-.17,.05]) {
        drum(M,x,.38,.08,.15,.9,2,.065,6);
        dome(M,x,.38,.065,1.05,.09,1);
      }
      for(const x of [-.48,-.21,.06,.33])bevel(M,x,-.56,.08,.16,.02,.21,1);
      box(M,-.1,-.39,.29,.055,.19,.08,0);
      box(M,.3,.18,.11,.12,.84,.05,1);
    }},
    // 가운데 검은 가스 굴뚝, 네 개 은색 저장통과 굽은 수집관.
    {id:'refinery',name:'리파이너리',fit:{...fit(30,2.8,2), small:true},build(M) {
      bevel(M,0,0,.77,.72,0,.14,0);
      drum(M,0,0,.35,.14,.65,2);
      drum(M,0,0,.25,.79,.39,2);
      ring(M,0,0,.28,1.18,.065,1,8);
      for(const x of [-.48,.48])for(const y of [-.4,.4]) {
        drum(M,x,y,.18,.1,.45,1);
        dome(M,x,y,.18,.55,.19,1);
        strut(M,[x,y,.65],[x*.4,y*.4,.91],.055,1);
        slit(M,x,y-.18,.07,.02,.24,.06,0);
      }
      box(M,0,-.58,.23,.14,.12,.3,0);
      grille(M,0,-.58,.43,3);
    }},
    // 무기고: 낮은 원형 장비실에서 사방으로 뻗은 팔과 세 배기 기둥.
    {id:'armory',name:'무기고',fit:{...fit(70,3.2,2), big:true},build(M) {
      bevel(M,0,0,.76,.69,0,.14,2);
      drum(M,0,0,.4,.14,.25,0);
      ring(M,0,0,.36,.39,.08,1,6);
      for(const s of [-1,1]) {
        box(M,s*.48,0,.24,.1,.17,.14,1);
        bevel(M,s*.69,0,.1,.2,.04,.21,0);
        drum(M,s*.52,.37,.07,.13,.83,2,.05,6);
        slit(M,s*.52,.37,.025,.025,.97,.06,0);
      }
      drum(M,0,.43,.1,.12,.91,0,.07,6);
      box(M,0,-.47,.23,.19,.13,.29,0);
      grille(M,0,-.47,.43,4);
      slit(M,0,-.67,.15,.02,.24,.06);
      for(const x of [-.24,.24])box(M,x,-.29,.07,.1,.08,.14,2);
    }},
    // 컴샛: 낮은 부속동의 접시 안테나, 중앙 수신봉과 작은 장비 상자.
    {id:'comsatStation',name:'컴샛 스테이션',fit:{...fit(30,3,2), small:true},build(M) {
      bevel(M,0,0,.71,.64,0,.13,2);
      box(M,0,.1,.47,.38,.13,.24,0);
      drum(M,0,.12,.17,.37,.25,1,.12,6);
      drum(M,0,.12,.2,.62,.16,2,.54);
      ring(M,0,.12,.54,.78,.09,1,8);
      drum(M,0,.12,.44,.77,.035,2);
      strut(M,[0,.12,.8],[0,.12,1.1],.025,1);
      slit(M,0,.12,.04,.04,1.1,.06);
      box(M,-.48,-.27,.18,.21,.13,.31,0);
      grille(M,-.48,-.27,.45,3);
      for(const x of [-.26,.08,.4])slit(M,x,-.3,.07,.02,.23,.06,0);
    }},
    // 머신샵: 원형 정비판을 둘러싼 낮은 팔각 작업대와 뒤쪽 파이프.
    {id:'machineShop',name:'머신샵',fit:{...fit(30,3.8,3), small:true},build(M) {
      bevel(M,0,0,.81,.66,0,.13,2);
      drum(M,.16,-.12,.49,.13,.2,0);
      ring(M,.16,-.12,.46,.33,.085,1,8);
      drum(M,.16,-.12,.31,.32,.03,2);
      box(M,-.43,.19,.23,.34,.13,.27,0);
      for(const x of [-.54,-.32]) {
        drum(M,x,.37,.075,.4,.39,1,.06,6);
        drum(M,x,.37,.09,.79,.055,2,.09,6);
      }
      for(const x of [-.35,0,.35])bevel(M,x,-.5,.12,.12,.13,.1,1);
      grille(M,-.43,.1,.41,3);
      slit(M,.12,-.58,.18,.02,.22,.06,0);
      box(M,.52,.27,.16,.16,.13,.21,2);
    }},
    // 컨트롤 타워: 낮은 원형 관제실과 경고 띠, 한쪽의 격자 통신 기둥.
    {id:'controlTower',name:'컨트롤 타워',fit:{...fit(30,3,2), small:true},build(M) {
      bevel(M,0,0,.7,.65,0,.14,2);
      drum(M,-.15,-.06,.39,.14,.48,0);
      drum(M,-.15,-.06,.43,.62,.12,1);
      for(const x of [-.4,-.15,.1])slit(M,x,-.42,.065,.02,.48,.08);
      for(const y of [-.18,.15]) {
        strut(M,[.44,y,.14],[.44,y,1.22],.035,2);
        slit(M,.44,y,.035,.035,1.22,.07,0);
      }
      for(const z of [.38,.64,.9,1.15])box(M,.44,-.015,.065,.2,z,.04,1);
      box(M,-.16,-.06,.19,.15,.74,.16,2);
      grille(M,-.16,-.06,.91,3);
      box(M,.39,-.43,.19,.12,.13,.14,0);
      slit(M,.39,-.56,.11,.015,.2,.04,0);
    }},
    // 사이언스 퍼실리티: 원형 연구실 위 낮은 흰 원반과 둘레 네 보조 탱크.
    {id:'scienceFacility',name:'사이언스 퍼실리티',fit:{...fit(130,2.8,2), big:true},build(M) {
      legs(M);
      drum(M,0,0,.58,.3,.36,0,.49);
      drum(M,0,0,.45,.66,.27,1);
      drum(M,0,0,.5,.93,.11,1,.47);
      dome(M,0,0,.43,1.04,.16,1);
      M.box(0,0,.025,.31,1.19,1.23,D);
      for(const x of [-.46,.46])for(const y of [-.39,.39]) {
        drum(M,x,y,.14,.35,.33,0);
        dome(M,x,y,.14,.68,.12,1);
        slit(M,x,y-.14,.045,.02,.43,.1,2);
      }
      box(M,0,-.57,.22,.12,.29,.18,2);
      grille(M,0,-.57,.48,3);
    }},
    // 사일로: 둥근 미사일 해치 셋과 경고 테, 뒤로 선 작은 설비 기둥.
    {id:'nuclearSilo',name:'뉴클리어 사일로',fit:{...fit(50,3,1), big:true},build(M) {
      bevel(M,0,0,.77,.71,0,.13,2);
      drum(M,.17,.08,.47,.13,.4,0);
      ring(M,.17,.08,.45,.53,.085,2,8);
      dome(M,.17,.08,.36,.54,.13,1);
      M.box(.17,.08,.02,.31,.665,.7,D);
      for(const y of [-.37,.28]) {
        drum(M,-.44,y,.19,.13,.28,0);
        dome(M,-.44,y,.19,.41,.12,1);
      }
      drum(M,-.49,.3,.055,.54,.52,2,.035,6);
      slit(M,-.49,.3,.035,.035,1.06,.06,0);
      grille(M,0,-.47,.27,4);
      for(const x of [-.15,.15,.45])slit(M,x,-.39,.05,.025,.22,.055,0);
    }},
    // 피직스 랩: 큰 경사진 원형 실험판과 뒤로 뻗은 쌍열 장치.
    {id:'physicsLab',name:'피직스 랩',fit:{...fit(45,3.8,1), small:true},build(M) {
      bevel(M,0,0,.78,.69,0,.14,2);
      box(M,-.12,0,.48,.43,.14,.23,0);
      M.loft(ngon(M,-.18,-.14,.38,8),.37,ngon(M,-.18,.03,.33,8),.85,{...A(1),top:true});
      ring(M,-.18,.03,.32,.85,.07,2,8);
      drum(M,-.18,.03,.21,.85,.035,1);
      for(const x of [.27,.53]) {
        box(M,x,.12,.095,.44,.23,.21,0);
        bevel(M,x,.12,.11,.46,.44,.16,1);
        slit(M,x,-.34,.06,.02,.33,.05,0);
      }
      box(M,-.18,-.52,.2,.13,.13,.13,2);
      grille(M,-.18,-.52,.27,3);
      slit(M,-.56,.1,.02,.09,.31,.08);
    }},
    // 코버트 옵스: 쌍열 비스듬한 지붕, 옆 위성 접시와 낮은 수송문.
    {id:'covertOps',name:'코버트 옵스',fit:{...fit(45,3.8,1), small:true},build(M) {
      bevel(M,0,0,.79,.69,0,.12,2);
      box(M,0,.05,.61,.43,.12,.25,0);
      for(const x of [-.24,.24]) {
        M.loft(rect(x,.03,.19,.5),.37,rect(x,.16,.14,.31),.71,{...A(1),top:true});
        M.box(x,-.39,.11,.025,.25,.51,D);
        grille(M,x,.13,.72,3);
      }
      drum(M,-.54,.37,.12,.24,.43,2,.09,6);
      drum(M,-.54,.37,.1,.67,.12,1,.24,6);
      ring(M,-.54,.37,.24,.79,.06,2,6);
      for(const x of [-.44,0,.44])slit(M,x,-.48,.065,.02,.21,.05,0);
      box(M,.57,.4,.11,.12,.13,.16,0);
    }},
  ],
  zerg:[
    // 낮은 육질 바닥에 방사형 뼈 갈비와 굴 입, 뒤쪽의 부푼 목.
    {id:'hatchery',name:'해처리',fit:{...fit(180,2.8,4), big:true},build(M) {
      tendrils(M);
      dome(M,0,0,.76,.03,.62,0);
      dome(M,0,.29,.34,.5,.51,2);
      maw(M,0,-.63,.18,.27);
      for(const s of [-1,1])for(const x of [-.45,.45]) {
        bone(M,[x,s*.44,.2],[x*.8,s*.38,.65],[x*.57,s*.23,.97],.11);
      }
      dome(M,0,.29,.19,1.01,.15,0);
      slit(M,0,-.67,.14,.018,.24,.1,1);
    }},
    // 해처리 몸통에서 위로 벌어진 큰 갈고리 네 개와 높아진 육질 목.
    {id:'lair',name:'레어',fit:{...fit(220,2.6,2), big:true},build(M) {
      tendrils(M);
      dome(M,0,0,.76,.04,.64,0);
      drum(M,0,.2,.29,.52,.42,2,.24);
      dome(M,0,.2,.3,.94,.25,0);
      maw(M,0,-.64,.19,.28);
      for(const s of [-1,1])for(const x of [-.43,.43]) {
        bone(M,[x,s*.47,.25],[x*1.28,s*.57,1.11],[x*1.1,s*.47,1.68],.13);
      }
      for(const s of [-1,1])dome(M,s*.47,-.32,.18,.27,.2,2);
    }},
    // 일그러진 두 웅덩이와 낮은 껍질 테. 큰 알이나 탑으로 바꾸지 않는다.
    {id:'spawningPool',name:'스포닝 풀',fit:{...fit(50,3.8,3), big:true},build(M) {
      tendrils(M,5);
      drum(M,-.13,-.02,.67,.02,.12,2);
      drum(M,.46,.22,.3,.02,.14,0);
      M.frustum(-.13,-.02,.56,.56,.14,.17,{n:8,...G(0)});
      M.frustum(.46,.22,.22,.22,.16,.18,{n:8,...G(2)});
      ring(M,-.13,-.02,.65,.16,.09,2,8);
      for(const s of [-1,1])bone(M,[s*.52,-.3,.14],[s*.64,-.24,.31],[s*.65,-.1,.43],.06);
      for(const x of [-.29,.08,.34])dome(M,x,-.12,.065,.18,.065,0,true);
    }},
    // 분기하는 검은 뿔 두 줄, 비대칭 육질 주머니와 앞으로 늘어진 촉수.
    {id:'evolutionChamber',name:'에볼루션 챔버',fit:{...fit(40,4,3), big:true},build(M) {
      tendrils(M,5);
      dome(M,-.16,.02,.48,.04,.61,2);
      dome(M,.43,-.27,.27,.04,.44,0);
      for(const s of [-1,1]) {
        bone(M,[-.23,s*.25,.36],[-.39,s*.4,.91],[-.28,s*.47,1.26],.13,2);
        bone(M,[.06,s*.22,.36],[.18,s*.32,.77],[.3,s*.36,1.06],.1,2);
      }
      for(const x of [.26,.43,.6])dome(M,x,-.3,.09,.37,.12,0);
      maw(M,-.13,-.38,.13,.17);
    }},
    // 껍질이 양쪽으로 갈라진 둥근 굴과 그 테를 따라 솟은 가시 갈기.
    {id:'hydraliskDen',name:'히드라리스크 덴',fit:{...fit(60,4,3), big:true},build(M) {
      tendrils(M,5);
      for(const s of [-1,1]) {
        dome(M,s*.31,.06,.39,.08,.69,0);
        for(let i=0;i<3;i++)bone(M,[s*.52,-.31+i*.28,.35],[s*.58,-.24+i*.28,.85],[s*.42,-.18+i*.28,1.22-i*.08],.085);
      }
      maw(M,0,-.38,.17,.22);
      dome(M,0,.4,.27,.24,.45,2);
      dome(M,.26,-.5,.18,.05,.21,0);
      slit(M,0,-.42,.1,.018,.25,.07,1);
    }},
    // 짧은 뿌리, 울퉁불퉁한 육질 혹, 사방으로 벌어진 작은 뿔.
    {id:'creepColony',name:'크립 콜로니',fit:{...fit(30,3,5), small:true},build(M) {
      tendrils(M,6);
      dome(M,0,0,.52,.03,.47,2);
      dome(M,0,0,.31,.46,.46,0);
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2,x=Math.cos(a),y=Math.sin(a);
        bone(M,[x*.4,y*.4,.2],[x*.59,y*.59,.49],[x*.66,y*.66,.64],.065);
      }
      for(const s of [-1,1])dome(M,s*.16,-.23,.095,.53,.14,0);
    }},
    // 지면에 붙은 긴 육질 몸과 좌우 뼈, 중앙에서 솟는 공격 촉수.
    {id:'sunkenColony',name:'성큰 콜로니',fit:{...fit(30,3,3), small:true},build(M) {
      tendrils(M);
      dome(M,0,0,.55,.03,.4,2);
      drum(M,0,0,.2,.4,.41,0,.14,6);
      bone(M,[0,0,.81],[.12,-.02,1.08],[.06,-.16,1.32],.14,2);
      for(const s of [-1,1])for(const y of [-.32,.32])bone(M,[s*.37,y,.14],[s*.56,y,.35],[s*.66,y-.06,.58],.09);
      for(const s of [-1,1])dome(M,s*.25,-.36,.09,.27,.12,0);
    }},
    // 두툼한 줄기 위 앞쪽으로 열린 포자 분출구, 옆 갈고리와 아래 뿌리.
    {id:'sporeColony',name:'스포어 콜로니',fit:{...fit(30,3,3), small:true},build(M) {
      tendrils(M);
      drum(M,0,0,.39,.05,.48,2,.23);
      drum(M,0,0,.23,.53,.45,0,.34);
      ring(M,0,0,.36,.98,.11,2,8);
      M.frustum(0,0,.23,.23,.97,1,{n:8,...G(0)});
      for(const s of [-1,1])bone(M,[s*.3,0,.62],[s*.46,.02,.93],[s*.4,-.04,1.22],.08);
      dome(M,0,.27,.16,.75,.24,0);
    }},
    // 굽은 상아 뿔로 둘러싼 세 가스 주머니와 앞쪽 늑골 수집관.
    {id:'extractor',name:'익스트랙터',fit:{...fit(30,2.8,2), small:true},build(M) {
      tendrils(M,5);
      dome(M,0,.04,.56,.04,.54,2);
      for(const s of [-1,1]) {
        drum(M,s*.48,.07,.24,.05,.52,2,.19);
        dome(M,s*.48,.07,.2,.57,.29,0,true);
        bone(M,[s*.63,.08,.36],[s*.63,.13,1.1],[s*.42,.12,1.5],.13);
        bone(M,[s*.3,.34,.38],[s*.35,.4,1.07],[s*.16,.32,1.57],.1);
      }
      dome(M,0,-.35,.24,.19,.51,0);
      for(let i=0;i<4;i++)box(M,0,-.57,.14,.025,.24+i*.09,.035,1);
    }},
    // 원작 스파이어의 가는 다리 여러 개와 꼭대기의 넓적한 접시형 껍질.
    {id:'spire',name:'스파이어',fit:{...fit(40,2.8,2), big:true},build(M) {
      tendrils(M,5);
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3,x=Math.cos(a),y=Math.sin(a);
        strut(M,[x*.49,y*.49,.12],[x*.19,y*.19,1.24],.04,2);
        box(M,x*.19,y*.19,.035,.035,1.24,.12,0);
      }
      drum(M,0,0,.24,1.2,.18,2,.54);
      dome(M,0,0,.54,1.38,.32,0);
      ring(M,0,0,.49,1.39,.075,2,6);
      dome(M,0,0,.15,1.69,.1,2);
    }},
    // 하이브: 낮은 군체의 부푼 중심을 둘러싼 여섯 거대 갈고리와 겹친 목.
    {id:'hive',name:'하이브',fit:{...fit(230,2.6,2), big:true},build(M) {
      tendrils(M);
      dome(M,0,0,.77,.04,.65,0);
      drum(M,0,.17,.33,.57,.42,2,.27);
      dome(M,0,.17,.32,.99,.29,0);
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3,x=Math.cos(a),y=Math.sin(a);
        bone(M,[x*.51,y*.51,.24],[x*.64,y*.64,1.28],[x*.54,y*.54,1.94],.12);
      }
      maw(M,0,-.64,.2,.29);
      dome(M,0,-.19,.25,.54,.21,2);
      slit(M,0,-.68,.11,.02,.29,.09,1);
    }},
    // 퀸즈 네스트: 구멍 난 둥근 알집과 아래로 펼쳐진 육질 다리 여섯.
    {id:'queensNest',name:'퀸즈 네스트',fit:{...fit(90,3,2), big:true},build(M) {
      tendrils(M);
      dome(M,0,0,.53,.1,.77,0);
      dome(M,0,.02,.32,.79,.29,2);
      ring(M,0,.02,.21,1.04,.07,2,6);
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3,x=Math.cos(a),y=Math.sin(a);
        bone(M,[x*.36,y*.36,.24],[x*.54,y*.54,.58],[x*.55,y*.55,.88],.07,2);
      }
      maw(M,0,-.45,.2,.19);
      for(const s of [-1,1])slit(M,s*.19,-.41,.035,.02,.56,.09,1);
    }},
    // 울트라 동굴: 겹친 큰 등딱지와 정면의 넓은 검은 입, 양쪽 상아 엄니.
    {id:'ultraliskCavern',name:'울트라리스크 캐번',fit:{...fit(140,3.5,2), big:true},build(M) {
      tendrils(M);
      dome(M,0,.2,.64,.05,.83,2);
      dome(M,0,.35,.4,.73,.31,0);
      for(const s of [-1,1]) {
        dome(M,s*.42,-.15,.27,.08,.56,0);
        bone(M,[s*.38,-.44,.13],[s*.4,-.49,.64],[s*.22,-.49,.86],.12);
      }
      M.box(0,-.48,.27,.035,.13,.66,D);
      for(let i=0;i<4;i++) {
        const y=-.02+i*.14;
        strut(M,[-.48,y,.28],[-.17,y,.83],.035,1);
        strut(M,[.48,y,.28],[.17,y,.83],.035,1);
      }
      dome(M,0,.35,.12,1.02,.1,0);
    }},
    // 디파일러 마운드: 긴 벌레 같은 둔덕과 톱니 갈기, 몸 옆으로 말린 관.
    {id:'defilerMound',name:'디파일러 마운드',fit:{...fit(65,4,2), big:true},build(M) {
      tendrils(M,4);
      for(const x of [-.42,0,.42])dome(M,x,0,.28,.03,.39,2);
      for(let i=0;i<5;i++)bone(M,[-.45+i*.21,.04,.33],[-.43+i*.21,.1,.66],[-.49+i*.21,.08,.87],.07,2);
      for(const s of [-1,1]) {
        ring(M,s*.39,s*.38,.2,.17,.065,0,6);
        maw(M,s*.57,-.16,.12,.12);
      }
    }},
    // 나이더스: 올라온 근육 관의 넓은 입과 젖혀진 양쪽 입술, 뿌리 다발.
    {id:'nydusCanal',name:'나이더스 커널',fit:{...fit(30,2.8,2), small:true},build(M) {
      tendrils(M);
      drum(M,0,0,.37,.05,.38,2,.25);
      drum(M,0,0,.25,.43,.36,0,.34);
      ring(M,0,0,.36,.79,.11,0,8);
      M.frustum(0,0,.22,.22,.78,.8,{n:8,look:'roof'});
      for(const s of [-1,1])bone(M,[s*.28,0,.63],[s*.4,.02,1.04],[s*.28,.12,1.19],.08);
      dome(M,0,.31,.18,.47,.28,0);
      slit(M,0,-.31,.07,.02,.46,.09,1);
    }},
    // 그레이터 스파이어: 굵은 뿌리 다리와 돌출된 살주머니 관, 뾰족한 꽃받침.
    {id:'greaterSpire',name:'그레이터 스파이어',fit:{...fit(110,2.8,2), big:true},build(M) {
      tendrils(M);
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2,x=Math.cos(a),y=Math.sin(a);
        strut(M,[x*.48,y*.48,.12],[x*.17,y*.17,.91],.07,2);
        dome(M,x*.31,y*.31,.19,.87,.52,0);
        bone(M,[x*.39,y*.39,1.12],[x*.43,y*.43,1.55],[x*.27,y*.27,1.76],.07,2);
      }
      drum(M,0,0,.23,.84,.59,2,.34);
      ring(M,0,0,.35,1.43,.08,0,8);
      dome(M,0,0,.18,1.45,.18,2);
    }},
  ],
  protoss:[
    // 정사각 피라미드와 네 모서리 기둥, 빗살 경사면, 꼭대기 작은 푸른 구슬.
    {id:'nexus',name:'넥서스',fit:{...fit(200,2.2,4), big:true},build(M) {
      bevel(M,0,0,.82,.82,0,.14,2);
      M.loft(rect(0,0,.7,.7),.14,rect(0,0,.18,.18),.95,{...A(0),top:true});
      for(const x of [-.63,.63])for(const y of [-.63,.63]) {
        bevel(M,x,y,.13,.13,.08,.15,1);
        bone(M,[x,y,.23],[x*.93,y*.93,.83],[x*.91,y*.91,1.19],.065,1);
      }
      for(let i=0;i<5;i++) {
        const t=(i-2)*.135;
        strut(M,[t,-.67,.18],[t*.3,-.23,.87],.018,1);
        strut(M,[.67,t,.18],[.23,t*.3,.87],.018,1);
      }
      sphere(M,0,0,.13,.95,.25,0);
      for(const s of [-1,1])bevel(M,0,s*.74,.21,.16,.05,.15,1);
    }},
    // 두 장갑 기둥이 안으로 기울어 만나는 뾰족한 삼각문. 중앙 빛과 뒤로 뻗은 발.
    {id:'gateway',name:'게이트웨이',fit:{...fit(70,3.8,3), big:true},build(M) {
      for(const s of [-1,1]) {
        bevel(M,s*.4,0,.26,.67,0,.17,2);
        M.loft(rect(s*.43,0,.19,.35),.17,rect(s*.2,.06,.14,.23),1.16,{...A(0),top:true});
        M.loft(rect(s*.2,.06,.14,.23),1.16,rect(s*.06,.1,.055,.11),1.55,{...A(1),top:true});
        bevel(M,s*.58,.5,.21,.27,.1,.14,1);
        strut(M,[s*.52,-.4,.2],[s*.21,-.19,1.12],.035,2);
        slit(M,s*.49,-.36,.035,.035,.28,.12,0);
      }
      M.box(0,.08,.035,.06,.21,1.23,D);
      crystal(M,0,-.15,.12,.88,.52,0);
      for(const s of [-1,1]) {
        box(M,s*.09,-.28,.035,.17,.12,.11,1);
        slit(M,s*.09,-.28,.02,.12,.235,.035,1);
      }
      bevel(M,0,.65,.27,.19,.03,.18,0);
      strut(M,[0,.65,.2],[0,.25,.44],.04,1);
    }},
    // 원작의 큰 마름모 수정은 받침 위에 떠 있고, 세 갈고리가 아래쪽을 감싼다.
    {id:'pylon',name:'파일런',fit:{...fit(30,2.8,5), small:true},build(M) {
      drum(M,0,0,.43,0,.11,2,.35,6);
      crystal(M,0,0,.38,.35,1.62,0);
      for(let i=0;i<3;i++) {
        const a=i*Math.PI*2/3,x=Math.cos(a),y=Math.sin(a);
        bevel(M,x*.4,y*.4,.11,.11,.02,.13,1);
        bone(M,[x*.43,y*.43,.12],[x*.46,y*.46,.72],[x*.29,y*.29,1.01],.085,0);
        slit(M,x*.41,y*.41,.035,.035,.29,.09,1);
        strut(M,[x*.27,y*.27,.13],[x*.36,y*.36,.3],.035,2);
      }
      ring(M,0,0,.32,.16,.065,1,6);
    }},
    // 앞쪽 노즐과 뒤의 큰 돔, 옆의 작은 돔·한 쌍의 가는 금빛 굴뚝.
    {id:'forge',name:'포지',fit:{...fit(50,3.8,3), big:true},build(M) {
      bevel(M,0,0,.79,.68,0,.15,2);
      drum(M,.25,.26,.33,.15,.34,0,.29);
      dome(M,.25,.26,.3,.49,.38,1);
      sphere(M,.25,.26,.1,.85,.12,0);
      dome(M,.34,-.42,.24,.12,.3,1);
      sphere(M,.34,-.42,.1,.41,.1,0);
      bevel(M,-.4,-.14,.3,.29,.1,.36,0);
      drum(M,-.6,-.23,.15,.25,.26,2,.12,6);
      for(const x of [-.3,-.08]) {
        drum(M,x,.18,.07,.2,.65,1,.055,6);
        bone(M,[x,.18,.85],[x,.18,1.02],[x-.025,.18,1.16],.055,1);
      }
      for(let i=0;i<4;i++)strut(M,[-.32+i*.14,-.4,.15],[-.23+i*.14,-.1,.57],.022,1);
      box(M,.12,0,.19,.07,.2,.09,2);
    }},
    // 큰 원형 천장 원판과 그 주위를 둘러싼 푸른 구체 네 개, 뒤 장갑 핀.
    {id:'cyberneticsCore',name:'사이버네틱스 코어',fit:{...fit(70,2.6,2), big:true},build(M) {
      drum(M,0,0,.62,.03,.21,2,.54);
      drum(M,0,.12,.38,.24,.45,0,.34);
      ring(M,0,.12,.4,.69,.08,1,8);
      M.frustum(0,.12,.29,.29,.69,.73,{n:8,...G(1)});
      for(let i=0;i<4;i++) {
        const a=Math.PI+(i+1)*Math.PI/5,x=Math.cos(a)*.54,y=Math.sin(a)*.54;
        drum(M,x,y,.15,.1,.21,1,.11,6);
        sphere(M,x,y,.14,.31,.27,0);
      }
      for(const x of [-.3,0,.3])bone(M,[x,.48,.22],[x,.53,.67],[x,.43,.99],.075,1);
    }},
    // 작은 원형 포대와 네 방사형 발, 가운데의 가늘고 낮은 쌍갈래 포신.
    {id:'photonCannon',name:'포톤 캐논',fit:{...fit(30,2.8,3), small:true},build(M) {
      drum(M,0,0,.53,.02,.14,2,.46);
      ring(M,0,0,.47,.16,.08,1,8);
      drum(M,0,0,.24,.17,.21,0,.19,6);
      sphere(M,0,0,.13,.38,.2,0);
      for(const s of [-1,1])bone(M,[s*.14,0,.3],[s*.12,0,.65],[s*.075,0,.82],.045,1);
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2,x=Math.cos(a),y=Math.sin(a);
        bevel(M,x*.55,y*.55,.12,.12,.02,.12,0);
        slit(M,x*.55,y*.55,.065,.065,.145,.035,1);
      }
    }},
    // 원작의 두 갈래 비행선 같은 금빛 날개. 가운데 빈 공간과 양쪽 푸른 창열.
    {id:'stargate',name:'스타게이트',fit:{...fit(130,4,2), big:true},build(M) {
      for(const s of [-1,1]) {
        const low:Pair[]=[[-.8,s*.22],[.48,s*.2],[.83,s*.52],[.48,s*.76],[-.54,s*.63]];
        const p=s>0?low:[...low].reverse();
        const high=p.map(([x,y]):Pair=>[x*.84,y*.9]);
        M.loft(p,.11,high,.39,{...A(0),top:true});
        for(let i=0;i<4;i++)slit(M,-.55+i*.2,s*.38,.065,.075,.395,.035,1);
        M.loft(rect(.38,s*.53,.25,.15),.39,rect(.22,s*.49,.12,.1),1.02,{...A(1),top:true});
        for(let i=0;i<3;i++)strut(M,[.29+i*.1,s*.67,.43],[.16+i*.05,s*.58,.83],.025,2);
        bone(M,[-.62,s*.36,.25],[-.78,s*.44,.52],[-.6,s*.46,.69],.06,1);
      }
      box(M,.54,0,.12,.24,.08,.18,2);
      sphere(M,.54,0,.1,.26,.16,0);
    }},
    // 앞면의 큰 청록 타원 가스실과 이를 덮은 늑골, 세 꼭짓점 배기 굴뚝.
    {id:'assimilator',name:'어시밀레이터',fit:{...fit(30,2.8,2), small:true},build(M) {
      drum(M,0,0,.63,.02,.19,2,.55);
      dome(M,0,.02,.53,.21,.7,0);
      sphere(M,0,-.3,.32,.21,.47,0);
      for(const x of [-.34,.34]) {
        drum(M,x,.36,.12,.05,.75,1,.1,6);
        drum(M,x,.36,.13,.8,.13,2,.11,6);
      }
      drum(M,.46,-.3,.13,.08,.59,1,.1,6);
      drum(M,.46,-.3,.14,.67,.12,2,.12,6);
      for(let i=0;i<5;i++) {
        const y=-.2+i*.15;
        strut(M,[-.41,y,.24],[-.18,y,.82],.028,1);
        strut(M,[.41,y,.24],[.18,y,.82],.028,1);
      }
      slit(M,0,-.59,.12,.02,.28,.06,1);
    }},
    // 가운데 둥근 성소, 양옆으로 뻗은 축과 세워진 두 날개형 장갑판.
    {id:'citadelOfAdun',name:'시타델 오브 아둔',fit:{...fit(100,3.8,2), big:true},build(M) {
      drum(M,0,0,.49,.03,.18,2,.37);
      dome(M,0,0,.39,.21,.69,0);
      sphere(M,0,-.19,.18,.58,.28,0);
      for(const s of [-1,1]) {
        box(M,s*.4,.1,.24,.055,.32,.09,1);
        const p=rect(s*.69,.1,.12,.32);
        M.loft(p,.2,rect(s*.64,.12,.075,.21),1.08,{...A(1),top:true});
        slit(M,s*.69,-.225,.06,.02,.37,.23,1);
        for(let i=0;i<3;i++)box(M,s*.69,-.16+i*.14,.125,.022,.51+i*.1,.03,2);
        bone(M,[s*.2,.06,.52],[s*.2,.1,.96],[s*.12,.08,1.15],.065,1);
      }
      bevel(M,0,-.47,.24,.15,.05,.18,1);
      slit(M,0,-.47,.14,.08,.235,.035,0);
    }},
    // 낮은 타원 성소와 기울어진 청록 천창, 왼쪽·뒤쪽 두 뾰족한 첨장.
    {id:'templarArchives',name:'템플러 아카이브',fit:{...fit(80,3.5,2), big:true},build(M) {
      drum(M,0,0,.69,.02,.15,2,.6);
      dome(M,.12,0,.49,.17,.57,0);
      sphere(M,.12,0,.27,.66,.2,0);
      for(const s of [-1,1])bone(M,[-.44,s*.33,.16],[-.48,s*.34,.9],[-.39,s*.3,1.21],.1,1);
      for(let i=0;i<6;i++) {
        const a=Math.PI*.12+i*Math.PI*.15,x=Math.cos(a),y=Math.sin(a);
        strut(M,[x*.61,y*.61,.13],[x*.4+.07,y*.38,.55],.022,1);
      }
      bevel(M,.62,-.33,.18,.18,.06,.14,1);
      sphere(M,.62,-.33,.11,.2,.11,0);
      box(M,-.27,-.2,.13,.17,.17,.22,2);
      for(const x of [-.15,.05,.25])strut(M,[x,-.45,.14],[x,-.2,.54],.02,1);
    }},
    // 로보틱스: 넓은 타원 격자 입구 뒤에 선 삼각 장갑 지붕과 청록 수정.
    {id:'roboticsFacility',name:'로보틱스 퍼실리티',fit:{...fit(110,3.8,3), big:true},build(M) {
      bevel(M,0,0,.79,.69,0,.14,2);
      M.loft(rect(0,.21,.5,.39),.14,rect(0,.31,.11,.14),1.28,{...A(0),top:true});
      M.box(0,-.31,.54,.035,.14,.58,D);
      for(let i=0;i<7;i++)strut(M,[-.48+i*.16,-.35,.16],[-.28+i*.09,-.32,.62],.018,1);
      for(const z of [.24,.37,.5])box(M,0,-.36,.5,.015,z,.025,1);
      for(const s of [-1,1]) {
        bevel(M,s*.59,-.14,.15,.34,.08,.23,1);
        slit(M,s*.59,-.14,.07,.18,.315,.035,0);
        bone(M,[s*.31,.33,.38],[s*.24,.35,1.05],[s*.09,.33,1.4],.07,1);
      }
      crystal(M,0,.13,.12,.84,.43,0);
    }},
    // 옵저버토리: 열린 삼각 마당과 서로 다른 높이의 수정 기둥 세 개.
    {id:'observatory',name:'옵저버토리',fit:{...fit(45,3,2), small:true},build(M) {
      const p:Pair[]=[[-.66,-.48],[.66,-.48],[0,.66]];
      M.loft(p,.02,p,.13,{...A(2),top:true});
      const posts:V3[]=[[-.55,-.38,.65],[.55,-.38,.81],[0,.54,1.08]];
      for(const [x,y,h]of posts) {
        drum(M,x,y,.12,.13,h-.13,1,.08,6);
        sphere(M,x,y,.1,h,.22,0);
        for(const z of [.24,.39])drum(M,x,y,.13,z,.04,2,.13,6);
      }
      for(let i=0;i<3;i++) {
        const a=posts[i]!,b=posts[(i+1)%3]!;
        strut(M,[a[0],a[1],.25],[b[0],b[1],.43],.025,1);
      }
      sphere(M,0,0,.16,.14,.2,1);
      box(M,0,-.41,.2,.08,.13,.13,0);
    }},
    // 로보틱스 서포트 베이: 푸른 바닥 렌즈에서 바깥으로 벌어진 세 장비 팔.
    {id:'roboticsSupportBay',name:'로보틱스 서포트 베이',fit:{...fit(100,3.2,2), big:true},build(M) {
      drum(M,0,0,.69,.03,.13,2,.62);
      ring(M,0,0,.59,.16,.1,1,8);
      M.frustum(0,0,.38,.38,.16,.2,{n:8,...G(1)});
      for(let i=0;i<3;i++) {
        const a=Math.PI/2+i*Math.PI*2/3,x=Math.cos(a),y=Math.sin(a);
        M.loft(ngon(M,x*.21,y*.21,.15,6),.17,ngon(M,x*.51,y*.51,.105,6),1.03,{...A(1),top:true});
        sphere(M,x*.51,y*.51,.09,1.03,.16,0);
        bone(M,[x*.13,y*.13,.18],[x*.3,y*.3,.66],[x*.39,y*.39,.99],.045,0);
        slit(M,x*.56,y*.56,.04,.04,.2,.05,0);
      }
      crystal(M,0,0,.11,.21,.24,0);
    }},
    // 플릿 비콘: 가운데 큰 푸른 구체와 세 갈래로 벌어진 둥근 장갑 가지.
    {id:'fleetBeacon',name:'플릿 비콘',fit:{...fit(140,3,2), big:true},build(M) {
      drum(M,0,0,.49,.04,.23,2,.36);
      sphere(M,0,0,.32,.43,.67,0);
      for(let i=0;i<3;i++) {
        const a=-Math.PI/2+i*Math.PI*2/3,x=Math.cos(a),y=Math.sin(a);
        M.loft(ngon(M,x*.24,y*.24,.18,6),.13,ngon(M,x*.58,y*.58,.12,6),.4,{...A(0),top:true});
        drum(M,x*.6,y*.6,.16,.33,.15,1,.14,6);
        sphere(M,x*.6,y*.6,.11,.48,.14,1);
        bone(M,[x*.25,y*.25,.32],[x*.34,y*.34,.62],[x*.23,y*.23,.89],.06,1);
      }
      ring(M,0,0,.4,.42,.06,1,6);
    }},
    // 아비터 트리뷰널: 네 갈래 받침과 중앙 수정 제단, 뒷면의 높은 세 기둥.
    {id:'arbiterTribunal',name:'아비터 트리뷰널',fit:{...fit(110,3.2,2), big:true},build(M) {
      bevel(M,0,0,.64,.59,.02,.16,2);
      for(const x of [-.5,.5])for(const y of [-.45,.45]) {
        bevel(M,x,y,.2,.18,.02,.18,0);
        slit(M,x,y,.08,.065,.205,.045,1);
      }
      drum(M,0,0,.32,.18,.23,1,.28);
      sphere(M,0,0,.24,.41,.25,0);
      for(const x of [-.4,0,.4]) {
        drum(M,x,.42,.09,.18,.64,0,.065,6);
        sphere(M,x,.42,.08,.82,.23,1);
        strut(M,[x,.42,.25],[x*.47,.12,.53],.04,1);
      }
      for(const s of [-1,1])bone(M,[s*.36,-.18,.19],[s*.36,-.28,.48],[s*.2,-.35,.67],.055,1);
    }},
    // 실드 배터리: 여섯 가는 충전 팔과 바닥 수정, 중앙 작은 발광 구.
    {id:'shieldBattery',name:'실드 배터리',fit:{...fit(30,2.8,4), small:true},build(M) {
      drum(M,0,0,.32,.02,.13,2,.23);
      sphere(M,0,0,.14,.15,.24,0);
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3,x=Math.cos(a),y=Math.sin(a);
        strut(M,[x*.2,y*.2,.12],[x*.53,y*.53,.26],.025,0);
        bone(M,[x*.53,y*.53,.26],[x*.58,y*.58,.41],[x*.48,y*.48,.52],.035,1);
        slit(M,x*.51,y*.51,.025,.025,.31,.065,1);
      }
      crystal(M,0,0,.075,.39,.2,0);
    }},
  ],
};
