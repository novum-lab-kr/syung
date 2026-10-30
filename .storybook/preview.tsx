// 스토리마다: 토큰 · 슝 스킨 · 기초 컴포넌트 스타일을 싣고, 위 막대의 '테마'로 라이트 · 다크를 바꾼다(지도 화면과 같이 html[data-theme])
import type { Preview } from '@storybook/preact-vite';
import '../web/tokens/tokens.css';
import '../web/syung.css';
import '../web/components/components.css';
import './preview.css';

const preview:Preview = {
  globalTypes: {
    theme: {
      description: '라이트 · 다크',
      toolbar: { title: '테마', icon: 'mirror', items: [{ value: 'light', title: '라이트' }, { value: 'dark', title: '다크' }], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [(Story, context) => {
    const root = document.documentElement;
    if (context.globals['theme'] === 'dark') root.dataset['theme'] = 'dark';
    else delete root.dataset['theme'];
    return <Story />;
  }],
  // 첫 화면은 토큰 표
  parameters: { layout: 'padded', options: { storySort: { order: ['토큰', '컴포넌트'] } } },
};
export default preview;
