// 기본 프리셋(expo)에 하나만 더한다: 프리셋은 .ts · .tsx 만 TypeScript 로 읽어 웹 토큰 생성물(web/tokens/tokens.mts)에서 구문 오류가 난다.
// 프리셋은 expo 패키지 안에 있어 expo 기준으로 찾는다. test 가 함수인 이유: 메트로가 파일 이름 없이 설정을 읽을 때 정규식은 오류를 낸다.
const expoPreset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [expoPreset],
    overrides: [{ test: (filename) => Boolean(filename?.endsWith('.mts')), plugins: ['@babel/plugin-transform-typescript'] }],
  };
};
