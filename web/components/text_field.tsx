// 입력 칸: 글자 칸(노란 테두리 · 오른쪽 글자 수). 지금은 프로필 닉네임이 쓴다. props 만 받는다
export interface TextFieldProps {
  id:string; label:string; value:string; class?:string; maxLength?:number; autocomplete?:string; placeholder?:string; disabled?:boolean;
  count?:string; countId?:string; over?:boolean;   // count: 오른쪽 글자 수(over 면 넘침 색)
  onInput?:(value:string) => void;
}

export function TextField({ id, label, value, class:extra, maxLength, autocomplete, placeholder, disabled, count, countId, over, onInput }:TextFieldProps) {
  return <label class={extra ? `tf-in ${extra}` : 'tf-in'}><input id={id} maxlength={maxLength} autocomplete={autocomplete} placeholder={placeholder} enterkeyhint="done" aria-label={label} aria-describedby={countId} value={value} disabled={disabled}
    onInput={event => onInput?.(event.currentTarget.value)} />{count !== undefined && <small id={countId} class={over ? 'over' : undefined}>{count}</small>}</label>;
}
