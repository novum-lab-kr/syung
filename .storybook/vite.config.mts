// 스토리북 전용 Vite 설정 — JSX 만 웹 빌드(vite.config.mts)와 같게(preact/jsx-runtime). 웹 빌드의 복사 · 결과 폴더 설정은 싣지 않는다
import { defineConfig } from 'vite';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
});
