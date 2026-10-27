// 로컬 개발: web/ 을 고칠 때마다 dist/web 으로 다시 빌드하고(vite build --watch · 0.1초 안팎), 그 결과를 로컬 서버로 보여 준다
//   npm run dev [-- 포트]      # 기본 8080 · 새로고침하면 방금 고친 것
// 서버는 deploy/dev_server.py --dist(실시간 열차 · 길찾기는 운영으로 넘김 · 회원 · 관리 주소는 서버 코드 그대로)
// 파이썬은 SYUNG_PYTHON(없으면 python3)
import { spawn } from 'node:child_process'
import path from 'node:path'
import { build } from 'vite'

const root = path.resolve(import.meta.dirname, '..')
const port = process.argv[2] ?? '8080'

const configFile = path.join(root, 'vite.config.mts')
// 처음 한 번은 dist/web 을 비우고 깨끗이 빌드, 감시 중 다시 빌드할 때는 비우지 않는다(비우는 순간 새로고침하면 파일이 없어 404)
await build({ configFile, logLevel: 'warn' })
// 감시 시작 빌드가 끝나면(watcher 의 첫 END) 서버를 띄운다
const watcher = await build({ configFile, logLevel: 'warn', build: { watch: {}, emptyOutDir: false } })
if (!('on' in watcher)) throw new Error('vite build --watch 를 시작하지 못함')

let server = null
watcher.on('event', (event) => {
  if (event.code === 'ERROR') console.error('빌드 실패 — 고치면 다시 빌드한다:', event.error?.message ?? event.error)
  if (event.code === 'END' && !server) {
    server = spawn(process.env.SYUNG_PYTHON ?? 'python3', ['deploy/dev_server.py', '--dist', port], { cwd: root, stdio: 'inherit' })
    server.on('exit', (code) => { void watcher.close(); process.exit(code ?? 0) })
  }
})

const stop = () => { server?.kill(); void watcher.close().then(() => process.exit(0)) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
