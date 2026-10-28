// 웹 빌드 — web/ → dist/web/(git 무시). 배포는 이 결과를 올린다(CI 가 빌드해 web-dist 브랜치에 · deploy/deploy.sh 가 꺼낸다)
//   npm run build        # 한 번
//   npm run dev          # 고칠 때마다 다시 빌드 + 로컬 서버(deploy/dev_server.py --dist)
// 원칙: 빌드 전과 같은 파일 · 같은 주소 · 같은 요청 차례(AGENTS.md "속도 기준" — 정적 import 깊이가 첫 화면 시간을 정한다)
// - 모듈 하나 = 파일 하나(preserveModules) · 이름 그대로(.mts → .mjs) — 묶지 않는다. 묶기는 따로 재고 정한다
// - HTML · CSS · 그림 · 자료 · vendor/ 는 손대지 않고 그대로 복사(index.html 의 역 데이터 · 첫 그리기 전 스크립트 · modulepreload 그대로)
// - vendor/(maplibre · three · lottie · uPlot)는 묶지 않는다: maplibre 는 제 옆의 maplibre-gl-worker.mjs 를 import.meta.url 로 찾는다
// - 줄이기(minify) 안 함 — 주석만 빠진다(첫 화면 JS gzip 이 줄어든다). 줄이기는 속도를 재고 따로
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const root = path.join(import.meta.dirname, 'web')
const vendor = path.join(root, 'vendor')
const outDir = path.join(import.meta.dirname, 'dist', 'web')
// 빌드가 만드는 코드(그대로 복사하지 않는다)
const CODE = /\.(mjs|mts|ts|tsx)$/

// 모듈이 아닌 파일(HTML · CSS · 그림 · JSON · vendor/ 전부)을 결과 폴더의 같은 자리로 그대로 복사한다
function staticFiles(dir: string = root): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue   // .DS_Store · 도구 상태 폴더(git 에 점 파일은 없다)
    if (entry.name.endsWith('.d.ts')) continue   // 타입만(vendor/three.module.d.ts) — 결과에 싣지 않는다

    const from = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...staticFiles(from))
    else if (from.startsWith(vendor + path.sep) || !CODE.test(entry.name)) files.push(from)
  }
  return files
}

function copyStatic(): Plugin {
  return {
    name: 'syung-copy-static',
    apply: 'build',
    // npm run dev(빌드 감시): HTML · CSS 를 고쳐도 다시 빌드되게
    buildStart() {
      if (this.meta.watchMode) for (const file of staticFiles()) this.addWatchFile(file)
    },
    closeBundle() {
      for (const from of staticFiles()) {
        const to = path.join(outDir, path.relative(root, from))
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(from, to)
      }
    },
  }
}

// vendor/ 를 부르는 import 는 그대로 둔다(결과에서도 같은 상대 경로 — 폴더 모양이 같다)
function isVendor(id: string, importer: string | undefined): boolean {
  const absolute = importer && id.startsWith('.') ? path.resolve(path.dirname(importer), id) : id
  return absolute.startsWith(vendor + path.sep)
}

// 결과 파일 이름: web/ 밖(node_modules/<패키지>/…)에서 온 모듈은 npm/<패키지>/… 로
// (node_modules 가 링크면 이름 앞에 실제 경로가 붙는다 — 마지막 node_modules/ 뒤만 본다)
const npmPath = (name: string) => name.replace(/^(?:.*\/)?node_modules\//, 'npm/')

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  plugins: [copyStatic()],
  // 화면 조각(.tsx — Preact): JSX 는 preact/jsx-runtime 으로(tsconfig 의 jsxImportSource 와 같다)
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  // city/worker.mts(도시 건물 Worker) — new Worker(new URL(…), { type: 'module' }) 그대로 모듈 Worker
  worker: { format: 'es' },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    // index.html 은 빌드하지 않으므로 Vite 가 미리 싣기 링크를 넣을 곳도 없다 — 동적 import 에도 붙이지 않는다
    modulePreload: false,
    // 본체의 MODE_KIT_DEPS 미리 받기 import(`./${n}.mjs`) 를 그대로 둔다(바꾸면 빈 목록이 되어 미리 받기가 사라진다)
    dynamicImportVarsOptions: { exclude: [/maplibre_runtime\.m[jt]s$/] },
    reportCompressedSize: false,
    rollupOptions: {
      // 페이지가 직접 부르는 모듈: index.html 의 <script type="module" src="./maplibre_runtime.mjs">
      // 관리 화면(admin/*.html 의 <script type="module" src="./<이름>.mjs">) — Preact 로 옮긴 것만
      input: { maplibre_runtime: path.join(root, 'maplibre_runtime.mjs'), 'admin/status': path.join(root, 'admin', 'status.tsx'),
        'admin/members': path.join(root, 'admin', 'members.tsx') },
      preserveEntrySignatures: 'strict',
      treeshake: false,
      external: isVendor,
      output: {
        format: 'es',
        preserveModules: true,
        preserveModulesRoot: root,
        // npm 패키지(preact)는 node_modules/… 대신 npm/… 로 낸다 — 결과(운영 주소)에 node_modules 폴더가 생기지 않게(.gitignore · 검색 도구가 빼고 보는 이름이라 헷갈린다)
        entryFileNames: chunk => `${npmPath(chunk.name)}.mjs`,
        chunkFileNames: chunk => `${npmPath(chunk.name)}.mjs`,
      },
    },
  },
})
