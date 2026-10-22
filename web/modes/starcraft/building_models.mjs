// 스타크래프트 건물을 통째로 세우는 장난감 모형. 일반 도시 몸통 없이 각 유닛 고유의 기단·껍질·장갑부터 만든다.
// 좌표는 내접 직사각형 안, 높이는 반 짧은 변 단위. 돔은 6~8면·3단, 고층도 작은 수의 큰 덩어리로 만든다.
const A = slot => ({look:'accent',slot});
const G = slot => ({look:'glow',slot});
const rect = (x,y,hx,hy) => [[x-hx,y-hy],[x+hx,y-hy],[x+hx,y+hy],[x-hx,y+hy]];
function slab(M,x,y,hx,hy,z,h,slot=0) { M.box(x,y,hx,hy,z,z+h,A(slot)) }
function armor(M,x,y,hx,hy,z,h,slot=0) {
  const variation=.96+.04*M.rand(17);
  hx*=variation; hy*=variation;
  M.loft(rect(x,y,hx,hy),z,rect(x,y,hx*.78,hy*.78),z+h,{...A(slot),top:true});
}
function orb(M,x,y,r,z,h,slot=0,light=false) {
  r*=.96+.04*M.rand(23);
  M.dome(x,y,r,z,h,{n:8,rings:3,...(light?G(slot):A(slot))});
}
function cone(M,x,y,r,z,h,slot=1) {
  M.frustum(x,y,r,0,z,z+h,{n:6,...A(slot)});
}
function gem(M,x,y,r,z,h,slot=0) {
  M.frustum(x,y,r*.16,r,z,z+h*.42,{n:6,rot:Math.PI/6,...G(slot)});
  M.frustum(x,y,r,0,z+h*.42,z+h,{n:6,rot:Math.PI/6,...G(slot)});
}
function horns(M,count,spread,z,h) {
  for(let i=0;i<count;i++) {
    const a=(i/count+.07)*Math.PI*2;
    cone(M,Math.cos(a)*spread,Math.sin(a)*spread,.09,z,h*(.8+M.rand(40+i)*.2));
  }
}
function feet(M,z=.34) {
  for(const x of [-.55,.55]) for(const y of [-.53,.53]) {
    slab(M,x,y,.16,.15,0,.12,2);
    armor(M,x,y,.1,.1,.12,z-.12,1);
  }
}
function lamps(M,z,count=4) {
  for(let i=0;i<count;i++) M.box(-.48+i*.96/Math.max(1,count-1),-.72,.045,.025,z,z+.06,G(i%2));
}
function vents(M,z,count=3) {
  for(let i=0;i<count;i++) M.box(-.26+i*.26,.22,.07,.24,z,z+.07,{look:'metal'});
}
function mouth(M,x,y,z,size=.3) {
  // 입구는 장갑·뼈 밑의 깊은 틈과 양옆 엄니로 표현한다.
  slab(M,x,y,size,.05,z,.22,2);
  for(const s of [-1,1]) cone(M,x+s*size*.8,y-.02,.075,z,.32,1);
}
function ring(M,x,y,r,z,thickness=.09,slot=0) {
  // 사다리꼴 여섯 조각으로 가운데가 뚫린 고리를 만든다.
  const n=6,inner=r-thickness;
  for(let i=0;i<n;i++) {
    const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;
    const p=[[x+Math.cos(a)*inner/M.aspect,y+Math.sin(a)*inner],
      [x+Math.cos(a)*r/M.aspect,y+Math.sin(a)*r],
      [x+Math.cos(b)*r/M.aspect,y+Math.sin(b)*r],
      [x+Math.cos(b)*inner/M.aspect,y+Math.sin(b)*inner]];
    M.loft(p,z,p,z+.08,{...A(slot),top:true});
  }
}
function arch(M,z,h,slot=0) {
  for(const s of [-1,1]) {
    M.loft(rect(0,s*.59,.24,.17),z,rect(0,s*.53,.19,.14),z+h*.6,{...A(slot),top:true});
    M.loft(rect(0,s*.53,.19,.14),z+h*.6,rect(0,s*.28,.18,.14),z+h*.92,{...A(slot),top:true});
  }
  armor(M,0,0,.2,.4,z+h*.91,h*.09,1);
}
const fit = (minArea=30,maxAspect=4,weight=1,tall=false) => ({minArea,maxArea:Infinity,maxAspect,tall,weight});
export const BUILDING_MODELS = {
  terran: [
    {id:'commandCenter',name:'커맨드 센터',fit:fit(250,2.2,3),build(M) {
      feet(M);
      M.frustum(0,0,.86,.66,.3,.68,{n:8,...A(0)});
      M.frustum(0,0,.66,.66,.68,1.12,{n:8,...A(1)});
      M.frustum(0,0,.73,.55,1.12,1.28,{n:8,...A(0)});
      armor(M,-.12,.05,.3,.27,1.28,.24,2);
      M.box(-.12,-.225,.24,.025,1.53,1.65,G(1));
      slab(M,-.12,.05,.28,.25,1.65,.12,0);
      M.frustum(-.12,.05,.035,0,1.77,2.12,{n:6,look:'metal'});
      lamps(M,.77); vents(M,1.3,2);
    }},
    {id:'barracks',name:'배럭',fit:fit(100,4,3),build(M) {
      armor(M,0,0,.9,.73,0,.22,2);
      slab(M,0,.06,.77,.6,.22,.66,0);
      M.loft(rect(0,.06,.81,.65),.88,rect(0,.1,.73,.4),1.2,{...A(1),top:true});
      slab(M,.08,-.57,.39,.035,.22,.59,2);
      for(const s of [-1,1]) {
        armor(M,s*.65,-.52,.13,.23,.14,.87,0);
        M.box(s*.65,-.755,.07,.02,.65,.86,G(0));
      }
      M.box(.08,-.615,.32,.025,.82,.88,G(1));
      vents(M,1.21,3); lamps(M,.26,3);
    }},
    {id:'supplyDepot',name:'서플라이 디팟',fit:fit(30,4,4),build(M) {
      armor(M,0,0,.88,.78,0,.18,2);
      for(const s of [-1,1]) {
        slab(M,0,s*.39,.79,.24,.18,.55,0);
        armor(M,0,s*.39,.81,.26,.73,.4,1);
        M.box(0,s*.39,.5,.12,1.135,1.17,G(0));
      }
      slab(M,0,0,.71,.1,.18,.07,2);
      for(const x of [-.57,.57]) slab(M,x,0,.09,.16,.25,.28,1);
      vents(M,1.17,3);
    }},
    {id:'factory',name:'팩토리',fit:fit(180,4,3),build(M) {
      armor(M,0,0,.9,.75,0,.18,2);
      slab(M,-.13,0,.66,.58,.18,.77,0);
      armor(M,-.13,0,.7,.63,.95,.22,1);
      slab(M,-.2,-.59,.33,.025,.2,.54,2);
      M.box(-.2,-.62,.3,.025,.76,.82,G(0));
      for(const x of [-.52,-.21]) {
        M.frustum(x,.32,.12,.095,1.17,1.72,{n:6,...A(2)});
        M.frustum(x,.32,.14,.14,1.7,1.78,{n:6,...A(1)});
      }
      slab(M,.68,.35,.08,.1,.18,1.49,2);
      slab(M,.39,.35,.38,.1,1.67,.13,0);
      M.box(.08,.35,.025,.025,1.13,1.67,{look:'metal'});
      slab(M,.08,.35,.08,.08,1.08,.09,1);
      lamps(M,.35,3);
    }},
    {id:'starport',name:'스타포트',fit:fit(200,3.5,2),build(M) {
      armor(M,0,0,.88,.76,0,.2,2);
      slab(M,0,.15,.65,.37,.2,.35,0);
      for(const x of [-.48,.48]) {
        M.frustum(x,-.18,.36,.36,.25,.45,{n:8,...A(1)});
        M.frustum(x,-.18,.3,.3,.45,.48,{n:8,look:'roof'});
        M.box(x,-.18,.16,.025,.49,.53,G(1));
        M.box(x,-.18,.025,.14,.49,.53,G(1));
      }
      armor(M,0,.47,.2,.19,.55,.65,0);
      slab(M,0,.47,.24,.23,1.2,.14,1);
      M.box(0,.23,.17,.02,1.21,1.31,G(1));
      M.frustum(0,.47,.025,0,1.34,1.68,{n:6,look:'metal'});
    }},
    {id:'engineeringBay',name:'엔지니어링 베이',fit:fit(120,2.5,2),build(M) {
      feet(M,.25);
      M.frustum(0,0,.83,.73,.22,.5,{n:8,...A(2)});
      orb(M,0,0,.72,.5,.71,1);
      slab(M,0,-.61,.3,.13,.3,.41,0);
      M.box(0,-.75,.23,.02,.49,.62,G(1));
      for(const s of [-1,1]) slab(M,s*.66,.05,.13,.24,.31,.3,0);
      vents(M,1.14,2);
    }},
    {id:'bunker',name:'벙커',fit:fit(30,3,3),build(M) {
      armor(M,0,0,.86,.76,0,.16,2);
      M.frustum(0,0,.78,.62,.16,.58,{n:8,...A(0)});
      orb(M,0,0,.63,.58,.64,1);
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3, x=Math.cos(a)*.64,y=Math.sin(a)*.64;
        M.box(x,y,.09,.055,.42,.52,{rot:a,...A(2)});
      }
      lamps(M,.2,3);
    }},
    {id:'missileTurret',name:'미사일 터렛',fit:fit(30,2.5,2),build(M) {
      armor(M,0,0,.6,.59,0,.17,2);
      for(const s of [-1,1]) slab(M,s*.44,0,.12,.4,.17,.12,0);
      M.frustum(0,0,.28,.19,.17,1.03,{n:8,...A(1)});
      M.frustum(0,0,.37,.37,1.03,1.17,{n:8,...A(2)});
      for(const s of [-1,1]) {
        armor(M,0,s*.32,.42,.19,1.17,.37,0);
        for(const x of [-.22,.03,.27]) M.box(x,s*.32,.065,.195,1.43,1.5,G(0));
      }
      M.box(0,0,.045,.045,1.55,1.66,G(1));
    }},
    {id:'scienceFacility',name:'사이언스 퍼실리티',fit:fit(100,3,2,true),build(M) {
      const h=Math.max(3,M.Hn);
      feet(M,h*.12);
      M.frustum(0,0,.63,.38,h*.1,h*.64,{n:8,...A(0)});
      M.frustum(0,0,.38,.78,h*.64,h*.72,{n:8,...A(1)});
      M.frustum(0,0,.78,.78,h*.72,h*.78,{n:8,...A(2)});
      orb(M,0,0,.7,h*.78,h*.13,1);
      M.frustum(0,0,.055,0,h*.91,h,{n:6,look:'metal'});
      for(const s of [-1,1]) M.box(s*.3,-.29,.04,.025,h*.2,h*.61,G(1));
      lamps(M,h*.73,3);
    }},
    {id:'communicationsTower',name:'통신탑',fit:fit(30,4,2,true),build(M) {
      const h=Math.max(3,M.Hn);
      armor(M,0,0,.75,.68,0,h*.07,2);
      for(const s of [-1,1]) {
        M.loft(rect(s*.46,0,.13,.2),h*.07,rect(s*.13,0,.07,.1),h*.78,{...A(0),top:true});
        for(const t of [.25,.47,.68]) slab(M,0,0,.43*(1-t)+.08,.12,h*t,h*.018,1);
      }
      M.frustum(0,0,.62,.48,h*.78,h*.83,{n:8,...A(1)});
      M.frustum(0,0,.045,.02,h*.83,h*.97,{n:6,look:'metal'});
      M.box(0,0,.06,.06,h*.97,h,G(0));
      M.box(0,-.13,.09,.035,h*.13,h*.18,G(1));
      for(const s of [-1,1]) M.box(0,s*.25,.04,.14,h*.85,h*.9,A(2));
    }},
  ],
  zerg: [
    {id:'hatchery',name:'해처리',fit:fit(200,2.5,4),build(M) {
      M.frustum(0,0,.9,.8,0,.22,{n:8,...A(2)});
      orb(M,0,.04,.78,.22,.78,0);
      orb(M,-.18,.12,.49,.85,.35,2);
      mouth(M,0,-.73,.22,.3);
      horns(M,4,.63,.66,.7+M.rand(1)*.18);
      for(const s of [-1,1]) orb(M,s*.63,-.22,.21,.16,.29,2);
      M.box(0,-.79,.17,.02,.26,.39,G(1));
    }},
    {id:'lair',name:'레어',fit:fit(250,2.5,2),build(M) {
      M.frustum(0,0,.89,.76,0,.28,{n:8,...A(2)});
      orb(M,0,0,.75,.28,1.03,0);
      mouth(M,0,-.73,.25,.28);
      horns(M,5,.62,.9,1.05);
      orb(M,0,.16,.35,1.22,.36,2);
      gem(M,0,.15,.13,1.57,.3,1);
    }},
    {id:'spawningPool',name:'스포닝 풀',fit:fit(60,3,3),build(M) {
      M.frustum(0,0,.88,.85,0,.2,{n:8,...A(2)});
      M.frustum(0,0,.7,.7,.2,.23,{n:8,...G(0)});
      ring(M,0,0,.83,.23,.14,1);
      horns(M,3,.72,.3,.9);
      for(const s of [-1,1]) orb(M,s*.26,0,.12,.23,.13,0,true);
    }},
    {id:'evolutionChamber',name:'에볼루션 챔버',fit:fit(50,4,3),build(M) {
      M.frustum(0,0,.77,.68,0,.24,{n:8,...A(2)});
      orb(M,-.26,0,.48,.24,.78,0);
      orb(M,.32,0,.43,.2,.62,2);
      for(const s of [-1,1]) {
        orb(M,-.22,s*.46,.21,.25,.31,2);
        cone(M,-.28,s*.48,.1,.55,.56,1);
      }
      mouth(M,.42,-.36,.23,.2);
      gem(M,-.24,0,.12,1.01,.25,1);
    }},
    {id:'hydraliskDen',name:'히드라리스크 덴',fit:fit(80,4,3),build(M) {
      M.loft(rect(0,0,.87,.62),0,rect(0,.08,.73,.41),.47,{...A(2),top:true});
      orb(M,-.15,.06,.53,.47,.57,0);
      orb(M,.42,.04,.34,.23,.48,2);
      mouth(M,.1,-.55,.18,.32);
      for(let i=0;i<5;i++) cone(M,-.57+i*.24,.14,.095,.7+Math.sin(i/4*Math.PI)*.28,.55+M.rand(i)*.25,1);
      M.box(.1,-.61,.16,.02,.22,.34,G(1));
    }},
    {id:'creepColony',name:'크립 콜로니',fit:fit(30,3,3),build(M) {
      M.frustum(0,0,.75,.64,0,.17,{n:8,...A(2)});
      orb(M,0,0,.58,.17,.74,0);
      orb(M,0,-.12,.24,.76,.27,2);
      horns(M,4,.57,.28,.48);
      for(const s of [-1,1]) orb(M,s*.29,-.4,.12,.3,.16,1,true);
    }},
    {id:'sunkenColony',name:'성큰 콜로니',fit:fit(30,3,2),build(M) {
      orb(M,0,0,.7,0,.48,2);
      M.frustum(0,0,.32,.19,.43,1.14,{n:6,...A(0)});
      M.frustum(0,0,.19,.27,1.14,1.34,{n:6,...A(2)});
      cone(M,0,0,.27,1.34,.78,1);
      horns(M,4,.59,.23,.47);
      for(const s of [-1,1]) orb(M,s*.41,-.27,.13,.22,.16,1,true);
    }},
    {id:'extractor',name:'익스트랙터',fit:fit(60,3,3),build(M) {
      M.frustum(0,0,.78,.57,0,.61,{n:8,...A(2)});
      for(let i=0;i<3;i++) {
        const a=i*Math.PI*2/3;
        orb(M,Math.cos(a)*.39,Math.sin(a)*.39,.29,.35,.61,i%3);
      }
      M.frustum(0,0,.27,.21,.78,1.33,{n:6,...A(0)});
      M.frustum(0,0,.29,.29,1.33,1.4,{n:6,...A(1)});
      M.frustum(0,0,.2,.2,1.4,1.43,{n:6,...G(0)});
      horns(M,3,.59,.56,.47);
    }},
    {id:'spire',name:'스파이어',fit:fit(30,3.5,3,true),build(M) {
      const h=Math.max(3,M.Hn);
      orb(M,0,0,.69,0,h*.13,2);
      for(let i=0;i<5;i++) {
        const x=Math.sin(i*1.25)*.12,y=Math.cos(i*1.25)*.09;
        M.frustum(x,y,.38-i*.045,.33-i*.045,h*(.1+i*.14),h*(.24+i*.14),{n:6,rot:i*.4,...A(i%3)});
      }
      orb(M,0,0,.37,h*.8,h*.09,0);
      cone(M,0,0,.21,h*.88,h*.12,1);
      horns(M,4,.48,h*.08,h*.14);
      gem(M,0,-.27,.09,h*.77,h*.07,1);
    }},
    {id:'greaterSpire',name:'그레이터 스파이어',fit:fit(100,3,2,true),build(M) {
      const h=Math.max(3,M.Hn);
      orb(M,0,0,.72,0,h*.14,2);
      M.frustum(0,0,.45,.21,h*.1,h*.61,{n:8,...A(0)});
      M.frustum(0,0,.21,.63,h*.61,h*.75,{n:8,...A(2)});
      orb(M,0,0,.61,h*.75,h*.11,0);
      horns(M,5,.53,h*.81,h*.19);
      cone(M,0,0,.18,h*.86,h*.14,1);
      for(const s of [-1,1]) orb(M,s*.43,0,.17,h*.72,h*.07,1,true);
    }},
    {id:'fleshTower',name:'살덩이 탑',fit:fit(30,4,1,true),build(M) {
      const h=Math.max(3,M.Hn);
      orb(M,0,0,.76,0,h*.12,2);
      for(let i=0;i<4;i++) {
        M.frustum(0,0,.52-i*.08,.45-i*.08,h*(.09+i*.19),h*(.28+i*.19),{n:6,rot:i*.3,...A(i%3)});
        orb(M,(i%2?-.24:.24),0,.16,h*(.2+i*.17),h*.08,i%2,true);
      }
      cone(M,0,0,.23,h*.85,h*.15,1);
      horns(M,3,.56,h*.1,h*.16);
    }},
  ],
  protoss: [
    {id:'nexus',name:'넥서스',fit:fit(200,2.2,4),build(M) {
      armor(M,0,0,.88,.88,0,.3,2);
      M.loft(rect(0,0,.73,.73),.3,rect(0,0,.39,.39),.91,{...A(0),top:true});
      for(const s of [-1,1]) {
        armor(M,s*.63,0,.16,.37,.18,.37,1);
        armor(M,0,s*.63,.37,.16,.18,.37,1);
      }
      M.frustum(0,0,.42,.38,.91,1.02,{n:8,...A(1)});
      orb(M,0,0,.36,1.02,.51,0,true);
      cone(M,0,0,.13,1.52,.43,1);
      for(const s of [-1,1]) gem(M,s*.48,-.44,.09,.49,.3,1);
    }},
    {id:'gateway',name:'게이트웨이',fit:fit(80,4,3),build(M) {
      armor(M,0,0,.83,.83,0,.17,2);
      arch(M,.17,1.48);
      M.box(0,0,.025,.27,.24,1.31,G(2));
      for(const s of [-1,1]) {
        armor(M,s*.57,0,.19,.4,.17,.26,0);
        gem(M,0,s*.58,.095,.42,.58,0);
      }
      gem(M,0,0,.18,1.65,.4,1);
    }},
    {id:'pylon',name:'파일런',fit:fit(30,3,4),build(M) {
      armor(M,0,0,.66,.66,0,.2,2);
      M.frustum(0,0,.48,.28,.2,.43,{n:6,...A(0)});
      gem(M,0,0,.39,.64,1.4+M.rand(3)*.18,0);
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2;
        M.frustum(Math.cos(a)*.49,Math.sin(a)*.49,.13,.06,.22,.71,{n:6,...A(1)});
        cone(M,Math.cos(a)*.49,Math.sin(a)*.49,.06,.71,.26,0);
      }
    }},
    {id:'forge',name:'포지',fit:fit(50,3.5,3),build(M) {
      armor(M,0,0,.79,.72,0,.22,2);
      M.frustum(0,.04,.64,.58,.22,.43,{n:8,...A(0)});
      orb(M,0,.04,.58,.43,.61,1);
      slab(M,0,-.57,.23,.18,.2,.34,0);
      M.frustum(0,-.6,.16,.16,.54,.64,{n:6,...G(0)});
      for(const s of [-1,1]) {
        armor(M,s*.53,.05,.14,.29,.25,.35,2);
        gem(M,s*.53,.05,.1,.6,.29,1);
      }
      cone(M,0,.04,.1,1.04,.3,0);
    }},
    {id:'cyberneticsCore',name:'사이버네틱스 코어',fit:fit(80,2.5,2),build(M) {
      M.frustum(0,0,.75,.53,0,.22,{n:8,...A(2)});
      M.frustum(0,0,.3,.22,.22,.46,{n:6,...A(1)});
      orb(M,0,0,.43,.46,.72,1,true);
      ring(M,0,0,.65,.74,.11,0);
      for(const s of [-1,1]) {
        armor(M,s*.58,0,.12,.22,.2,.35,1);
        cone(M,s*.58,0,.09,.55,.47,0);
      }
    }},
    {id:'photonCannon',name:'포톤 캐논',fit:fit(30,3,3),build(M) {
      armor(M,0,0,.6,.59,0,.18,2);
      M.frustum(0,0,.44,.26,.18,.48,{n:8,...A(0)});
      M.frustum(0,0,.27,.42,.48,.64,{n:8,...A(1)});
      orb(M,0,0,.35,.64,.5,0,true);
      for(const s of [-1,1]) {
        armor(M,s*.4,0,.12,.25,.22,.26,0);
        cone(M,s*.4,0,.09,.48,.4,1);
      }
      gem(M,0,-.38,.12,.54,.34,2);
      M.box(0,.37,.12,.045,.55,.63,G(1));
    }},
    {id:'stargate',name:'스타게이트',fit:fit(150,3,2),build(M) {
      M.frustum(0,0,.86,.73,0,.2,{n:8,...A(2)});
      M.frustum(0,0,.73,.58,.2,.4,{n:8,...A(0)});
      ring(M,0,0,.68,.65,.14,1);
      for(const s of [-1,1]) {
        armor(M,s*.48,0,.13,.2,.35,.3,0);
        gem(M,s*.48,0,.12,.73,.48,1);
      }
      M.frustum(0,0,.29,.29,.4,.43,{n:8,...G(0)});
    }},
    {id:'templarArchives',name:'템플러 아카이브',fit:fit(100,3,2,true),build(M) {
      const h=Math.max(3,M.Hn);
      armor(M,0,0,.82,.77,0,h*.08,2);
      M.loft(rect(0,0,.45,.4),h*.08,rect(0,0,.23,.22),h*.72,{...A(0),top:true});
      for(const s of [-1,1]) {
        M.loft(rect(s*.59,0,.12,.25),h*.08,rect(s*.3,0,.08,.14),h*.68,{...A(1),top:true});
        gem(M,s*.3,0,.1,h*.68,h*.12,1);
      }
      M.frustum(0,0,.41,.27,h*.72,h*.78,{n:8,...A(1)});
      gem(M,0,0,.24,h*.8,h*.2,0);
      for(const s of [-1,1]) M.box(s*.19,-.24,.035,.025,h*.2,h*.58,G(2));
      armor(M,0,-.52,.29,.2,h*.04,h*.15,1);
      cone(M,0,.51,.12,h*.09,h*.25,0);
    }},
    {id:'highPylon',name:'높은 파일런 탑',fit:fit(30,4,3,true),build(M) {
      const h=Math.max(3,M.Hn);
      armor(M,0,0,.7,.65,0,h*.07,2);
      M.loft(rect(0,0,.34,.32),h*.07,rect(0,0,.15,.15),h*.62,{...A(0),top:true});
      for(const s of [-1,1]) {
        M.loft(rect(s*.5,0,.1,.19),h*.07,rect(s*.3,0,.055,.1),h*.54,{...A(1),top:true});
        cone(M,s*.3,0,.08,h*.54,h*.12,0);
        M.box(0,s*.24,.035,.025,h*.18,h*.54,G(2));
      }
      M.frustum(0,0,.29,.21,h*.62,h*.68,{n:6,...A(1)});
      gem(M,0,0,.33,h*.71,h*.29,0);
      for(const s of [-1,1]) gem(M,0,s*.46,.1,h*.06,h*.17,1);
    }},
  ],
};
