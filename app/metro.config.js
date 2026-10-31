// 메트로 설정: 웹 디자인 토큰 생성물(web/tokens/tokens.mts — 앱용으로 만든 파일)을 앱이 복사 없이 바로 import 한다(계획서 6절 확정 (나)).
// 레포 루트 전체가 아니라 그 폴더 하나만 지켜본다 — 웹 node_modules · dist 를 메트로가 훑지 않게.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '..', 'web', 'tokens')];
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mts'];

module.exports = config;
