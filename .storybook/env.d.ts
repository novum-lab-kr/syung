// 스토리북 프리뷰가 부르는 CSS(Vite 가 싣는다) — 타입 검사에 '있는 모듈'로 알린다
declare module '*.css';
// 화면 흐름 문서(docs/flows/*.md)를 글자 그대로 읽는다(Vite ?raw)
declare module '*?raw' {
  const text:string;
  export default text;
}
// 화면 기획 자료(docs/flows/screens/)를 한꺼번에 읽는다(Vite import.meta.glob)
interface ImportMeta {
  glob<T>(pattern:string, options:{ eager:true; import:'default'; query?:string }):Record<string, T>;
}
