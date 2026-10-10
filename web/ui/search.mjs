// 역 검색: 입력 칸 아래 맞는 역 목록(노선 고르면 그 노선만), 고르면 그 역으로 날아가 도착 정보를 연다. 검색 상태(타이머 · 목록 · 고른 줄)의 주인.
// 다른 화면 파일을 import 하지 않는다: 역 팝업 · 지도 · 역 자료는 본체가 넘기고, 고른 노선은 getSelected 로 그때그때 읽는다.
export function createStationSearch({map,stations,colors,esc,input,list,getSelected,showStationPopup}){
  let searchTimer=0;
  // search: matching stations in a list; picking one flies there and opens its arrivals
  const searchIn=input,searchList=list;let searchHits=[],searchAt=-1;
  function searchShow(open){searchList.hidden=!open;searchIn.setAttribute('aria-expanded',String(open));if(!open){searchAt=-1;searchIn.removeAttribute('aria-activedescendant')}}
  function searchMark(i){searchAt=i;[...searchList.children].forEach((li,k)=>li.setAttribute('aria-selected',String(k===i)));if(i>=0)searchIn.setAttribute('aria-activedescendant','sr-'+i)}
  function searchPick(st){if(!st)return;searchShow(false);searchIn.value=st.name;searchIn.blur();
    map.flyTo({center:[st.lon,st.lat],zoom:Math.max(map.getZoom(),15),duration:900});showStationPopup(st)}
  searchIn.oninput=()=>{clearTimeout(searchTimer);searchHits=[];searchMark(-1);searchIn.removeAttribute('aria-activedescendant');searchTimer=setTimeout(()=>{
    const q=searchIn.value.trim().replace(/역$/,'');if(!q){searchShow(false);return}
    const selected=getSelected(),ok=x=>selected==='all'||x.lines.some(l=>l.name===selected);
    const rank=x=>x.name===q?0:x.name.startsWith(q)?1:2;   // 서울 → 서울역 before 서울대입구
    searchHits=stations.filter(x=>ok(x)&&x.name.includes(q)).sort((a,b)=>rank(a)-rank(b)||a.name.length-b.name.length).slice(0,8);
    searchList.innerHTML=searchHits.length?searchHits.map((x,k)=>`<li id="sr-${k}" role="option" aria-selected="false" data-k="${k}"><b>${esc(x.name)}</b><span>${x.lines.map(l=>`<i style="--c:${colors[l.name]||'#52646a'}">${esc(l.name)}</i>`).join('')}</span></li>`).join(''):'<li class="search-empty" role="option" aria-disabled="true">찾는 역이 없어요</li>';
    searchShow(true)},120)};
  searchList.addEventListener('pointerdown',e=>e.preventDefault());   // keep focus so the tap lands
  searchList.addEventListener('click',e=>{const li=e.target.closest('li[data-k]');if(li)searchPick(searchHits[+li.dataset.k])});
  searchIn.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;   // 한글 조합 중인 Enter는 글자 입력
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!searchHits.length)return;e.preventDefault();searchShow(true);searchMark((searchAt+(e.key==='ArrowDown'?1:searchHits.length-1))%searchHits.length)}
    else if(e.key==='Enter'){e.preventDefault();searchPick(searchHits[Math.max(searchAt,0)])}
    else if(e.key==='Escape')searchShow(false)});
  searchIn.addEventListener('focus',()=>{if(searchIn.value.trim()&&searchHits.length)searchShow(true)});
  searchIn.addEventListener('blur',()=>setTimeout(()=>searchShow(false),150));
  searchIn.addEventListener('search',()=>{if(!searchIn.value)searchShow(false)});
  return {show:searchShow,mark:searchMark,pick:searchPick};
}
