// 장소 칸(출발 · 도착): 글자 칸 + 내 위치 단추 + 칸 바로 아래 찾은 곳 목록(PlaceResults). props 만 받아 그린다 — 찾기 · 고르기는 화면 쪽(account.mts).
// 목록에서 고른 단추가 문서에서 빠지면 서랍의 '밖을 눌렀나' 검사가 서랍을 닫는다 — 목록은 늘 문서에 두고 숨기기만 하고, 누름은 거기서 멈춘다
// 내 위치 단추의 핀(길찾기 시트의 jf-here 와 같은 그림)
const PIN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>';

export interface PlaceRow { name:string; address:string }

export interface PlaceResultsProps<Row extends PlaceRow> {
  id:string; label:string; hidden:boolean;
  rows:Row[] | string;   // 찾은 곳 또는 안내 한 줄
  onPick(row:Row):void;
}
export function PlaceResults<Row extends PlaceRow>({ id, label, hidden, rows, onPick }:PlaceResultsProps<Row>) {
  return <ul id={id} class="pp-list tf-list" aria-label={label} hidden={hidden}>{typeof rows === 'string' ? <li class="empty">{rows}</li>
    : rows.map(found => <li><button type="button" onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); onPick(found) }}><b>{found.name}</b><small>{found.address}</small></button></li>)}</ul>;
}

export interface PlaceFieldProps<Row extends PlaceRow> {
  id:string;   // 칸 id(목록은 `${id}List` · 내 위치 단추는 `${id}Here`)
  head:string; name:string; placeholder:string;   // 머리 글자('출발') · 칸 이름('출발지') · 빈 칸 글자
  to?:boolean;   // 도착 칸의 동그라미
  value:string; listHidden:boolean; rows:Row[] | string;
  onFocus():void; onInput(value:string):void; onPick(row:Row):void; onLeave():void; onHere():void; onCloseList():void;
}
export function PlaceField<Row extends PlaceRow>({ id, head, name, placeholder, to = false, value, listHidden, rows, onFocus, onInput, onPick, onLeave, onHere, onCloseList }:PlaceFieldProps<Row>) {
  return <div class="tf-fld" onFocusOut={event => {   // 같은 칸(입력 · 📍 · 결과 목록) 안으로 초점이 옮겨 가면 목록을 남기고, 영역을 벗어나야 닫는다(Tab 으로 결과 고르기)
      const next = event.relatedTarget as Node | null;
      if (!next || !event.currentTarget.contains(next)) onLeave();
    }}><div class="tf-row"><label class="tf-pl"><i class={to ? 'tf-dot to' : 'tf-dot'} aria-hidden="true"></i>
      <span><small>{head}</small><input id={id} type="text" maxlength={40} autocomplete="off" aria-label={name} aria-controls={`${id}List`} placeholder={placeholder} value={value}
        onFocus={event => { onFocus(); event.currentTarget.select() }} onInput={event => onInput(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') event.preventDefault();   // 글자 칸의 Enter 가 발권(폼 제출)이 되지 않게
          else if (event.key === 'Escape' && !listHidden) { event.stopPropagation(); onCloseList() }   // 목록이 떠 있으면 목록만 접고 서랍은 닫지 않는다
        }} /></span></label>
    <button id={`${id}Here`} class="tf-here" type="button" aria-label={`내 위치를 ${name}로`} title="내 위치" onClick={onHere} dangerouslySetInnerHTML={{ __html: PIN }}></button></div>
    <PlaceResults id={`${id}List`} label={`${name} 찾기 결과`} hidden={listHidden} rows={rows} onPick={onPick} /></div>;
}
