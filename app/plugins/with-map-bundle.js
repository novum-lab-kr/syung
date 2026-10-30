// @ts-check
// 지도 빌드 싣기(계획서 D5): 레포 루트 `npm run build` 결과 dist/web 을 앱 묶음 안 `map/` 폴더로 넣는다.
// - iOS: ios/<프로젝트>/map 에 복사하고 Xcode 에 폴더 참조(파란 폴더)로 더한다 → 앱 안 <번들>/map/index.html
// - Android: android/app/src/main/assets/map 에 복사한다 → file:///android_asset/map/index.html
// 앱은 이 폴더를 앱 안 작은 http 서버(modules/map-server, http://127.0.0.1:<포트>)로 연다 — Android 는 그 주소의
// 암호화 안 된 연결만 허락한다(network_security_config · 디버그 빌드는 Metro 때문에 전부 허락).
// prebuild 때마다 다시 복사한다 — 지도 화면이 바뀌면 루트에서 다시 빌드하고 `npx expo prebuild` 를 다시 돌린다.
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const FOLDER = 'map';
// 앱에 싣지 않는 것: 관리 화면(운영에서는 주인 로그인 뒤에만 열린다 — 앱 묶음은 누구나 열어 본다)
const SKIP = new Set(['admin']);

/** @param {string} projectRoot */
function mapBuildDir(projectRoot) {
  const dir = path.resolve(projectRoot, '..', 'dist', 'web');
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    throw new Error(`지도 빌드가 없다: ${dir} — 레포 루트에서 npm ci · npm run build 를 먼저 돌린다`);
  }
  return dir;
}

/** @param {string} from @param {string} to */
function copyFresh(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: (source) => !SKIP.has(path.relative(from, source).split(path.sep)[0] ?? '') });
}

const SECURITY_CONFIG = 'network_security_config';
const RELEASE_SECURITY = `<?xml version="1.0" encoding="utf-8"?>
<!-- 앱 안 지도 서버(127.0.0.1)만 http 허락 · 그 밖은 https 만 -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;
const DEBUG_SECURITY = `<?xml version="1.0" encoding="utf-8"?>
<!-- 디버그 빌드: Metro(개발 서버)도 http 라 전부 허락 -->
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

/** @param {string} file @param {string} text */
function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withMapBundle = (config) => {
  config = withDangerousMod(config, ['android', async (modConfig) => {
    const { projectRoot, platformProjectRoot } = modConfig.modRequest;
    copyFresh(mapBuildDir(projectRoot), path.join(platformProjectRoot, 'app', 'src', 'main', 'assets', FOLDER));
    writeFile(path.join(platformProjectRoot, 'app', 'src', 'main', 'res', 'xml', `${SECURITY_CONFIG}.xml`), RELEASE_SECURITY);
    writeFile(path.join(platformProjectRoot, 'app', 'src', 'debug', 'res', 'xml', `${SECURITY_CONFIG}.xml`), DEBUG_SECURITY);
    return modConfig;
  }]);
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error('AndroidManifest 에 application 이 없다');
    application.$['android:networkSecurityConfig'] = `@xml/${SECURITY_CONFIG}`;
    return modConfig;
  });
  config = withDangerousMod(config, ['ios', async (modConfig) => {
    const { projectRoot, platformProjectRoot, projectName } = modConfig.modRequest;
    if (!projectName) throw new Error('iOS 프로젝트 이름을 모른다');
    copyFresh(mapBuildDir(projectRoot), path.join(platformProjectRoot, projectName, FOLDER));
    return modConfig;
  }]);
  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    if (!projectName) throw new Error('iOS 프로젝트 이름을 모른다');
    const filepath = `${projectName}/${FOLDER}`;
    IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath, groupName: projectName, isBuildFile: true, project, verbose: false });
    // 확장자가 없으면 파일 종류가 unknown 으로 들어간다 — 폴더 참조로 바꿔야 안의 파일 구조째 묶음에 실린다
    const references = project.pbxFileReferenceSection();
    for (const key of Object.keys(references)) {
      const reference = references[key];
      if (typeof reference !== 'object' || !reference) continue;
      if (![filepath, `"${filepath}"`].includes(reference.path)) continue;
      reference.lastKnownFileType = 'folder';
      delete reference.explicitFileType;
      delete reference.fileEncoding;
    }
    return modConfig;
  });
  return config;
};

module.exports = withMapBundle;
