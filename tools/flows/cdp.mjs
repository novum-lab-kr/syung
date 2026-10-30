// 화면 기획 촬영용 작은 크롬 조종기 — 헤드리스 크롬을 띄우고 DevTools 프로토콜(CDP)로 말한다.
// 설치 없이 돈다(node 22 의 WebSocket · 내장 모듈만). 크롬 위치는 CHROME 환경 변수, 없으면 맥 기본 자리
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise(done => setTimeout(done, ms))

// 크롬을 띄우고 첫 탭에 붙는다. 돌려주는 것: send(명령) · on(사건) · close()
export async function openChrome() {
  const profile = await mkdtemp(path.join(tmpdir(), 'syung-flows-'))
  const chrome = spawn(process.env.CHROME ?? MAC_CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',   // 지도 WebGL 을 GPU 없이(어느 기계에서나 같은 그림에 가깝게)
    'about:blank',
  ], { stdio: 'ignore' })
  // 크롬이 고른 포트는 프로필 폴더의 DevToolsActivePort 에 적힌다
  let port = ''
  for (let tries = 0; tries < 100 && !port; tries++) {
    await sleep(100)
    port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')).split('\n')[0] ?? ''
  }
  if (!port) { chrome.kill(); throw new Error('크롬 DevTools 포트를 받지 못함 — CHROME 환경 변수로 크롬 위치를 알려 주세요') }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find(target => target.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })

  let nextId = 0
  const waiting = new Map(), listeners = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id !== undefined) {
      const pending = waiting.get(message.id)
      waiting.delete(message.id)
      if (message.error) pending?.fail(new Error(`${pending.method}: ${message.error.message}`))
      else pending?.done(message.result)
      return
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params)
  }
  // 명령마다 30초 안에 답이 없으면 실패(멈춘 채로 기다리지 않게)
  const send = (method, params = {}) => new Promise((done, fail) => {
    const id = ++nextId
    const timer = setTimeout(() => { waiting.delete(id); fail(new Error(`${method}: 30초 동안 답 없음`)) }, 30000)
    waiting.set(id, { done: (value) => { clearTimeout(timer); done(value) }, fail: (error) => { clearTimeout(timer); fail(error) }, method })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener])
  const close = async () => {
    socket.close()
    chrome.kill()
    await sleep(300)
    await rm(profile, { recursive: true, force: true })
  }
  return { send, on, close }
}
