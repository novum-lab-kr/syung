// 하나의 연결된 리본으로 그려 선분마다 생기던 둥근 끝과 겹침을 없애요.
interface XY { x:number; y:number }
// 리본 꼭짓점: 메르카토르 자리 · 길이 방향 s(가운데 0, px) · 폭 방향 t(px)
export interface StrokeVertex extends XY { s:number; t:number }
export function platformStroke(points:readonly XY[],unit:number,width:number){
  const p:XY[]=[];
  for(const q of points)if(!p.length||Math.hypot(q.x-p.at(-1)!.x,q.y-p.at(-1)!.y)>1e-12)p.push(q);
  if(p.length<2)return {vertices:[] as StrokeVertex[],length:0};
  const dirs:[number, number][]=[],cum=[0];
  for(let i=1;i<p.length;i++){
    const dx=p[i]!.x-p[i-1]!.x,dy=p[i]!.y-p[i-1]!.y,d=Math.hypot(dx,dy);
    dirs.push([dx/d,dy/d]);cum.push(cum.at(-1)!+d/unit);
  }
  const length=cum.at(-1)!,pairs:StrokeVertex[][]=[],half=width/2+1;
  for(let i=0;i<p.length;i++){
    const a=dirs[Math.max(0,i-1)]!,b=dirs[Math.min(i,dirs.length-1)]!;
    const nx=-a[1]-b[1],ny=a[0]+b[0],norm=Math.hypot(nx,ny);
    const mx=norm>1e-9?nx/norm:-b[1],my=norm>1e-9?ny/norm:b[0];
    const scale=half/Math.max(.5,mx*(-b[1])+my*b[0]);
    const end=i===0?-1:i===p.length-1?1:0,s=cum[i]!+end;
    pairs.push([-1,1].map(side=>({x:p[i]!.x+(b[0]*end+mx*scale*side)*unit,y:p[i]!.y+(b[1]*end+my*scale*side)*unit,s:s-length/2,t:half*side})));
  }
  const vertices:StrokeVertex[]=[];
  for(let i=1;i<pairs.length;i++){
    const a=pairs[i-1]!,b=pairs[i]!;vertices.push(a[0]!,b[0]!,b[1]!,a[0]!,b[1]!,a[1]!);
  }
  return {vertices,length};
}
