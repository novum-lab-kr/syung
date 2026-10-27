// 따라잡기: 새 실시간 자료에서 예측이 화면의 열차보다 앞서 있을 때, 그 차이를 원래 주행 위에 속도를 조금 더해 메워요.
// 더해지는 속도는 CATCHUP_MPS 를 넘지 않고, CATCHUP_ACCEL 로 붙었다 풀려서 열차가 갑자기 질주하거나 멈칫하지 않아요.
export const CATCHUP_MPS=10,CATCHUP_ACCEL=1;   // m/s, m/s²

// gap: 메울 차이(m), v0: 지금 이미 더해지고 있는 속도(m/s, 따라잡는 도중 새 자료가 오면 이어 받음)
// 따라잡기 계획: 붙는 동안(t1) · 그대로(t2) · 풀리는 동안(t3) · 모두(T)
export interface Catchup { gap:number; v0:number; vp:number; a1:number; a3:number; t1:number; t2:number; t3:number; T:number }
export function catchup(gap:number,v0=0,vmax=CATCHUP_MPS,a=CATCHUP_ACCEL):Catchup{
  gap=Math.max(0,gap);v0=Math.max(0,Math.min(vmax,v0));
  if(gap<=0)return {gap:0,v0:0,vp:0,a1:a,a3:a,t1:0,t2:0,t3:0,T:0};
  if(v0*v0/(2*a)>=gap){const a3=v0*v0/(2*gap);return {gap,v0,vp:v0,a1:a,a3,t1:0,t2:0,t3:v0/a3,T:v0/a3}}   // 이미 빠르면 줄이기만(조금 세게)
  const vp=Math.min(vmax,Math.sqrt((2*a*gap+v0*v0)/2)),t1=(vp-v0)/a,t3=vp/a,d13=(vp*vp-v0*v0)/(2*a)+vp*vp/(2*a),t2=Math.max(0,(gap-d13)/vp);
  return {gap,v0,vp,a1:a,a3:a,t1,t2,t3,T:t1+t2+t3};
}

// t 초 뒤: 남은 차이 left(m) 와 더해지는 속도 v(m/s)
export function catchupAt(c:Catchup,t:number):{left:number,v:number,done:boolean}{
  if(t>=c.T)return {left:0,v:0,done:true};
  t=Math.max(0,t);let s:number,v:number;
  if(t<c.t1){v=c.v0+c.a1*t;s=(c.v0+v)/2*t}
  else if(t<c.t1+c.t2){v=c.vp;s=(c.v0+c.vp)/2*c.t1+c.vp*(t-c.t1)}
  else{const u=t-c.t1-c.t2;v=Math.max(0,c.vp-c.a3*u);s=(c.v0+c.vp)/2*c.t1+c.vp*c.t2+(c.vp+v)/2*u}
  return {left:Math.max(0,c.gap-s),v,done:false};
}
