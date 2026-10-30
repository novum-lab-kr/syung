// 스토리북(개발 도구 — 운영 dist/web 에 안 들어간다): npm run storybook(로컬 6006) · npm run build-storybook(→ dist/storybook, PR 마다 CI 가 빌드만 확인)
// 스토리는 web/ 의 *.stories.tsx + 여기 .storybook/ 의 화면 흐름(docs/flows/*.md 를 읽어 그림). 레포의 vite.config.mts(웹 빌드 — dist/web 을 비우고 복사한다)는 쓰지 않고 옆의 vite.config.mts 만 쓴다
import type { StorybookConfig } from '@storybook/preact-vite';

const config:StorybookConfig = {
  framework: { name: '@storybook/preact-vite', options: { builder: { viteConfigPath: '.storybook/vite.config.mts' } } },
  stories: ['../web/**/*.stories.tsx', './*.stories.tsx'],
  staticDirs: [{ from: '../web/brand', to: '/brand' }],   // 프로필 캐릭터 · 로그인 로고(화면과 같은 ./brand/… 주소)
  core: { disableTelemetry: true },
};
export default config;
