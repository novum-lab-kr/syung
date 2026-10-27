import test from 'node:test';
import assert from 'node:assert/strict';
import {catchup,catchupAt,CATCHUP_MPS} from '../web/lib/train_catchup.mts';

// 0.01초 간격으로 따라가며 더해지는 속도 · 남은 차이를 본다
function trace(c,dt=.01){const out=[];for(let t=0;t<=c.T+dt;t+=dt)out.push({t,...catchupAt(c,t)});return out}

test('보정 거리마다 더해지는 속도가 상한을 넘지 않고, 차이를 끝까지 메운다',()=>{
  for(const gap of [1.5,20,100,300,800,2000]){
    const c=catchup(gap),tr=trace(c);
    assert.equal(catchupAt(c,0).left,gap,'시작할 때는 그려진 자리 그대로');
    let prev=gap;
    for(let i=1;i<tr.length;i++){
      const {left,v}=tr[i];
      assert.ok(v<=CATCHUP_MPS+1e-9,`${gap} m: 더해지는 속도 ${v} m/s`);
      assert.ok(left<=prev+1e-9,`${gap} m: 뒤로 가지 않음`);
      assert.ok((prev-left)/.01<=CATCHUP_MPS+1e-6,`${gap} m: 실제로 줄어드는 속도도 상한 안`);
      prev=left;
    }
    assert.ok(catchupAt(c,c.T).done&&catchupAt(c,c.T).left===0,'끝나면 예측과 같은 자리');
    assert.ok(gap/c.T<=CATCHUP_MPS,'평균도 상한 안');
  }
});

test('따라잡는 도중 새 자료가 와도 더하던 속도에서 끊김 없이 이어 간다',()=>{
  const a=catchup(800),mid=catchupAt(a,30);
  assert.ok(mid.v>9,'30초 무렵엔 상한 속도로 따라잡는 중');
  // 새 자료: 남은 차이가 조금 달라졌어도 같은 속도에서 시작
  const b=catchup(mid.left+120,mid.v),start=catchupAt(b,0),soon=catchupAt(b,.05);
  assert.equal(start.v,mid.v);
  assert.equal(start.left,mid.left+120);
  assert.ok(Math.abs(soon.v-mid.v)<.1,'속도가 갑자기 바뀌지 않음');
  assert.ok(catchupAt(b,b.T).left===0);
});

test('빠르게 따라잡던 중 남은 차이가 작으면 줄이기만 하고 지나치지 않는다',()=>{
  const c=catchup(5,10);
  assert.equal(c.t1,0);
  let prev=5;for(const {left,v} of trace(c,.001)){assert.ok(left<=prev+1e-9&&left>=0&&v<=10+1e-9);prev=left}
  assert.ok(Math.abs(c.T-1)<1e-9,'5 m 를 10 m/s 에서 0 으로: 1초');
});

test('차이가 없으면 바로 끝난다',()=>{
  assert.equal(catchup(0).T,0);
  assert.ok(catchupAt(catchup(-3),0).done);
});
