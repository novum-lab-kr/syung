// 화면 기획(스토리보드) 자동 촬영: docs/flows/screens/<흐름>/*.json 의 차례(steps)대로 화면을 열어 폰 폭(390px)으로 찍고,
// 번호 표식(marks 의 CSS 선택자로 요소 위치를 읽어 자동 배치)을 얹은 PNG 와 흐름 한 장(flow.png), 흐름 문서(docs/flows/*.md)의 '화면 기획' 칸을 만든다.
//   node tools/flows/capture.mjs [흐름 폴더 이름…]     # 예: 03-tickets · 비우면 전부
// 매번 같은 화면이 나오게:
//  - 웹은 먼저 빌드(dist/web — 운영과 같은 파일)하고 deploy/dev_server.py --dist 를 빈 포트에 띄운다(8080 은 안 쓴다)
//  - /api/* 는 모두 가로채 tools/flows/fixtures/ 의 고정 응답으로 답한다(로그인 · 승차권 · 통계 · 기기 · 역 도착은 직접 만든 값, 길찾기 · 장소 · 날씨는 운영에서 한 번 받아 둔 것). 실시간 열차는 빈 목록
//  - 시계는 FIXED_NOW(서울 시각)부터 흐르고, 움직임 줄이기(prefers-reduced-motion)로 찍는다. 지도 바탕 타일만 바깥(openfreemap)에서 받는다
// 화면 코드(web/)는 건드리지 않는다 — 고르는 단추 · 칸은 지금 화면의 id · class 그대로
import { spawn, spawnSync } from 'node:child_process'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { get } from 'node:http'
import { createServer } from 'node:net'
import path from 'node:path'
import { build } from 'vite'
import { openChrome } from './cdp.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const screensDir = path.join(root, 'docs/flows/screens')
const fixturesDir = path.join(import.meta.dirname, 'fixtures')
const WIDTH = 390, HEIGHT = 844, SCALE = 2
const FIXED_NOW = '2026-11-02T07:30:00+09:00'   // 월요일 아침(승차권 '출근' 이 오늘 타는 날)
const sleep = (ms) => new Promise(done => setTimeout(done, ms))
const debug = (...args) => { if (process.env.FLOWS_DEBUG) console.error(new Date().toISOString().slice(11, 23), ...args) }

// ---- 고정 응답 ----
const fixture = async (name) => readFile(path.join(fixturesDir, name), 'utf8')
// spec.session 이 'out' 이면 로그인 안 된 사람으로 답한다
async function answerFor(url, spec) {
  const { pathname, searchParams } = new URL(url)
  const json = async (name) => ({ status: 200, body: await fixture(name) })
  if (pathname.endsWith('/api/auth/providers')) {
    if (spec.session !== 'out') return json('providers.json')
    return { status: 200, body: JSON.stringify({ ...JSON.parse(await fixture('providers.json')), me: null }) }
  }
  if (pathname.endsWith('/api/me/stats')) return json('stats.json')
  if (pathname.endsWith('/api/me/sessions')) return json('sessions.json')
  if (pathname.endsWith('/api/me/tickets')) return json('tickets.json')
  if (pathname.endsWith('/api/route')) return json('route.json')
  if (pathname.endsWith('/api/weather')) return json('weather.json')
  if (pathname.endsWith('/api/place')) return json(searchParams.get('q')?.startsWith('강남') ? 'place-gangnam.json' : 'place-seoul.json')
  if (pathname.endsWith('/api/live')) {
    if (searchParams.has('arrivals')) return json('arrivals.json')
    const lines = (searchParams.get('lines') ?? '').split(',').filter(Boolean)
    return { status: 200, body: JSON.stringify({ ok: true, trains: [], lines, fetchedAt: FIXED_NOW }) }
  }
  if (pathname.endsWith('/api/bus/live')) return { status: 200, body: JSON.stringify({ ok: true, buses: [] }) }
  return { status: 404, body: JSON.stringify({ error: { code: 'not_found', message: '촬영용 고정 응답 없음' } }) }
}

// 시계 고정: 인자 없는 new Date() · Date.now() 가 FIXED_NOW 부터 흐른다(움직임은 그대로 돈다)
const CLOCK = `(() => {
  const Real = Date, start = Real.now(), fixed = Real.parse(${JSON.stringify(FIXED_NOW)});
  const now = () => fixed + (Real.now() - start);
  class FixedDate extends Real { constructor(...args) { if (args.length) super(...args); else super(now()); } static now() { return now(); } }
  globalThis.Date = FixedDate;
})();`

// ---- 서버 ----
function freePort() {
  return new Promise((done, fail) => {
    const server = createServer().listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => done(port)) })
    server.on('error', fail)
  })
}
// 3.10 이상 파이썬(맥 기본 python3 는 3.9)
function python() {
  for (const name of [process.env.SYUNG_PYTHON, 'python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'].filter(Boolean)) {
    const check = spawnSync(name, ['-c', 'import sys; sys.exit(sys.version_info < (3, 10))'])
    if (check.status === 0) return name
  }
  throw new Error('파이썬 3.10 이상이 필요함(SYUNG_PYTHON 으로 알려 주세요)')
}
// 서버가 답하나(node 의 fetch 는 이 파이썬 서버가 연결을 끊는 모양에서 멈출 때가 있어 http.get 으로)
const answers = (url) => new Promise(done => get(url, response => { response.resume(); done(response.statusCode === 200) }).on('error', () => done(false)))
async function startServer() {
  await build({ configFile: path.join(root, 'vite.config.mts'), logLevel: 'warn' })
  debug('빌드 끝')
  const port = await freePort()
  const server = spawn(python(), ['deploy/dev_server.py', '--dist', String(port)], { cwd: root, stdio: 'ignore' })
  for (let tries = 0; tries < 100; tries++) {
    await sleep(100)
    if (await answers(`http://127.0.0.1:${port}/`)) return { url: `http://127.0.0.1:${port}/`, stop: () => server.kill() }
  }
  server.kill()
  throw new Error('개발 서버가 뜨지 않음')
}

// ---- 한 화면 ----
async function preparePage(chrome, spec) {
  const { send, on } = chrome
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' })
  await send('Emulation.setLocaleOverride', { locale: 'ko-KR' })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }] })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK })
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] })
  on('Fetch.requestPaused', async ({ requestId, request }) => {
    const { status, body } = await answerFor(request.url, spec)
    await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from(body).toString('base64') }).catch(() => {})
  })
  // 마지막 요청 움직임(시작 · 끝) 시각 — 잠깐 조용해질 때까지 기다리려고(지도 타일은 계속 오가서 '받는 중 0개'는 기다리지 않는다)
  const network = { last: Date.now() }
  for (const event of ['Network.requestWillBeSent', 'Network.loadingFinished', 'Network.loadingFailed']) on(event, () => { network.last = Date.now() })
  const errors = []
  on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text))
  return { network, errors }
}

async function evaluate(send, expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
  return result.value
}
async function waitFor(send, selector, timeout = 15000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const found = await evaluate(send, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0 })()`)
    if (found) return
    await sleep(100)
  }
  throw new Error(`기다린 칸이 안 보임: ${selector}`)
}
async function quiet(network, timeout = 8000) {
  const until = Date.now() + timeout
  await sleep(150)
  while (Date.now() < until && Date.now() - network.last < 500) await sleep(100)
}
// 누르기: 진짜 손가락처럼(그 요소 가운데를 탭) — 화면 코드의 '바깥을 눌렀나' 검사도 그대로 돈다
async function tap(send, selector) {
  await waitFor(send, selector)
  const box = await evaluate(send, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'nearest' }); const box = el.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 } })()`)
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
}
async function runSteps(chrome, steps, network) {
  const { send } = chrome
  for (const step of steps) {
    debug('차례', JSON.stringify(step))
    if (step.tap) await tap(send, step.tap)
    else if (step.type) { await tap(send, step.type[0]); await send('Input.insertText', { text: step.type[1] }) }
    else if (step.key) for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: step.key, code: step.key, windowsVirtualKeyCode: step.key === 'Escape' ? 27 : 0 })
    else if (step.wait) await waitFor(send, step.wait)
    else if (step.sleep) await sleep(step.sleep)
    else if (step.eval) await evaluate(send, step.eval)
    else throw new Error(`모르는 차례: ${JSON.stringify(step)}`)
    await quiet(network)
  }
}

// 번호 표식: 선택자마다 요소 테두리 + 왼쪽 위 동그라미 번호. 요소가 없거나 안 보이면 멈춘다(설명이 화면과 어긋난 것)
const MARKER_CSS = `.flowmark-box{position:fixed;z-index:2147483646;border:2px solid #e5484d;border-radius:8px;pointer-events:none;box-sizing:border-box}
.flowmark-n{position:fixed;z-index:2147483647;width:24px;height:24px;border-radius:50%;background:#e5484d;color:#fff;font:700 13px/24px -apple-system,"Apple SD Gothic Neo",sans-serif;text-align:center;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.35);pointer-events:none}`
async function drawMarks(send, marks) {
  return evaluate(send, `(() => {
    const marks = ${JSON.stringify(marks.map(({ n, at, badge }) => ({ n, at, badge })))}, missing = [], placed = [];
    const style = document.createElement('style'); style.textContent = ${JSON.stringify(MARKER_CSS)}; document.head.append(style);
    for (const { n, at, badge } of marks) {
      const el = document.querySelector(at), box = el?.getBoundingClientRect();
      if (!box || !box.width || !box.height || box.bottom < 0 || box.top > innerHeight) { missing.push(n + ' ' + at); continue; }
      const frame = document.createElement('div'); frame.className = 'flowmark-box';
      Object.assign(frame.style, { left: box.left - 3 + 'px', top: box.top - 3 + 'px', width: box.width + 6 + 'px', height: box.height + 6 + 'px' });
      // 번호는 요소 왼쪽 위 모서리. 글자를 가리면 badge 로 옮긴다 — "right" 오른쪽 위 · "above" 칸 위 가운데 · "left" 칸 왼쪽 바깥. 먼저 놓은 번호와 겹치면 오른쪽으로 비킨다
      const left = badge === 'right' ? box.right - 18 : badge === 'above' ? box.left + box.width / 2 - 12 : badge === 'left' ? box.left - 30 : box.left - 10;
      let x = Math.min(Math.max(left, 4), innerWidth - 28), y = Math.min(Math.max(badge === 'above' ? box.top - 22 : badge === 'left' ? box.top + box.height / 2 - 12 : box.top - 10, 4), innerHeight - 28);
      while (placed.some(([px, py]) => Math.abs(px - x) < 26 && Math.abs(py - y) < 26)) x += 28;
      if (x > innerWidth - 24) { missing.push(n + ' 번호 자리가 화면 밖'); continue; }
      placed.push([x, y]);
      const dot = document.createElement('div'); dot.className = 'flowmark-n'; dot.textContent = n;
      Object.assign(dot.style, { left: x + 'px', top: y + 'px' });
      document.body.append(frame, dot);
    }
    return missing;
  })()`)
}
async function screenshot(send) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  return Buffer.from(data, 'base64')
}

async function captureScreen(server, flow, name, spec) {
  const chrome = await openChrome()
  try {
    const { network, errors } = await preparePage(chrome, spec)
    debug('크롬 준비', server.url)
    await chrome.send('Page.navigate', { url: server.url })
    await waitFor(chrome.send, '#map canvas', 30000)
    await quiet(network)
    await sleep(1500)   // 첫 그리기 · 지도 타일이 자리 잡게
    debug('첫 화면')
    await runSteps(chrome, spec.allSteps, network)
    await sleep(600)
    await evaluate(chrome.send, 'document.fonts.ready.then(() => true)')
    const missing = await drawMarks(chrome.send, spec.marks ?? [])
    if (missing.length) throw new Error(`${flow}/${name}: 번호 칸을 화면에서 못 찾음 — ${missing.join(' · ')}`)
    if (errors.length) console.warn(`${flow}/${name}: 화면 오류 ${errors.length}개\n  ${errors.join('\n  ')}`)
    return await screenshot(chrome.send)
  } finally { await chrome.close() }
}

// ---- 흐름 한 장: 찍은 화면을 작은 그림으로 가로로 놓고 사이에 화살표 + 무엇을 누르면 ----
const esc = (text) => String(text).replace(/[&<>"]/g, mark => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[mark])
function flowHtml(flowSpec, shots) {
  const order = screenOrder(flowSpec)
  const rows = flowSpec.rows.map(row => `<div class="row">${row.screens.map((name, index) => {
    const arrow = index ? `<div class="arrow"><span>${esc(row.taps[index - 1] ?? '')}</span><i>→</i></div>` : ''
    return `${arrow}<figure><img src="data:image/png;base64,${shots[name].toString('base64')}"><figcaption><b>${order.indexOf(name) + 1}</b>${esc(shots[name].title)}</figcaption></figure>`
  }).join('')}</div>`).join('')
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#f4f1ea;font:14px/1.4 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#1d1d1f;width:max-content}
    h1{margin:0;padding:20px 24px 4px;font-size:20px}
    .row{display:flex;align-items:center;padding:12px 24px 20px}
    figure{margin:0;width:195px;text-align:center}
    img{width:195px;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.18);display:block}
    figcaption{margin-top:8px;font-weight:600}
    figcaption b{display:inline-block;width:20px;height:20px;margin-right:6px;border-radius:50%;background:#1d1d1f;color:#fff;font-size:12px;line-height:20px}
    .arrow{width:110px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:0 6px;text-align:center;font-size:12px;color:#55524c}
    .arrow i{font-style:normal;font-size:26px;color:#1d1d1f}
  </style><h1>${esc(flowSpec.title)}</h1>${rows}`
}
// 흐름에 나오는 화면(줄마다 겹쳐 나와도 한 번) — 처음 나온 차례
const screenOrder = (flowSpec) => [...new Set(flowSpec.rows.flatMap(row => row.screens))]
async function captureFlowSheet(flowSpec, shots) {
  const chrome = await openChrome()
  try {
    const { send } = chrome
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 400, deviceScaleFactor: 1, mobile: false })
    const { frameId } = await send('Page.getFrameTree').then(tree => tree.frameTree.frame).then(frame => ({ frameId: frame.id }))
    await send('Page.setDocumentContent', { frameId, html: flowHtml(flowSpec, shots) })
    await sleep(300)
    const size = await evaluate(send, '({ width: document.body.scrollWidth, height: document.body.scrollHeight })')
    await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false })
    await sleep(200)
    return await screenshot(send)
  } finally { await chrome.close() }
}

// ---- 흐름 문서의 '화면 기획' 칸(<!-- screens:start --> ~ <!-- screens:end -->) — 설명 원본은 화면마다 JSON, 문서는 그것으로 다시 쓴다 ----
function screensMarkdown(flow, flowSpec, specs) {
  const lines = ['<!-- screens:start — tools/flows/capture.mjs 가 docs/flows/screens/ 의 JSON 으로 다시 쓴다. 손으로 고치지 말 것 -->', '## 화면 기획', '',
    `흐름 한 장 — 폰 폭(390px) 실제 화면을 고정 자료로 찍었다(${FIXED_NOW.slice(0, 10)} 월 07:30 · 지도 위 실시간 열차 없음).`, '',
    `![${flowSpec.title}](screens/${flow}/flow.png)`, '']
  screenOrder(flowSpec).forEach((name, index) => {
    const spec = specs[name]
    lines.push(`### ${index + 1}. ${spec.title}`, '')
    if (spec.summary) lines.push(spec.summary, '')
    lines.push(`<img src="screens/${flow}/${name}.png" width="320" alt="${esc(spec.title)}">`, '')
    lines.push('| 번호 | 무엇 | 누르면 | 예외 · 빈 상태 |', '|---|---|---|---|')
    for (const mark of spec.marks ?? []) lines.push(`| ${mark.n} | ${mark.what} | ${mark.tap ?? '—'} | ${mark.edge ?? '—'} |`)
    lines.push('')
  })
  lines.push('<!-- screens:end -->')
  return lines.join('\n')
}
async function writeMarkdown(flow, flowSpec, specs) {
  const file = path.join(root, 'docs/flows', `${flow}.md`)
  const source = await readFile(file, 'utf8'), block = screensMarkdown(flow, flowSpec, specs)
  const start = source.indexOf('<!-- screens:start'), end = source.indexOf('<!-- screens:end -->')
  let next
  if (start >= 0 && end > start) next = source.slice(0, start) + block + source.slice(end + '<!-- screens:end -->'.length)
  else {   // 처음: 첫 문단(제목 + 소개) 바로 뒤, 기존 글 · 흐름도 앞
    const firstSection = source.indexOf('\n## ')
    next = `${source.slice(0, firstSection + 1)}${block}\n\n${source.slice(firstSection + 1)}`
  }
  await writeFile(file, next)
}

// 화면 하나의 설명 파일. after 가 있으면 그 화면까지 가는 차례를 먼저 밟는다(같은 흐름 안 · 앞 화면에서 이어 가는 화면)
async function readSpec(dir, name, seen = []) {
  if (seen.includes(name)) throw new Error(`after 가 돌고 돎: ${[...seen, name].join(' → ')}`)
  const spec = JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'))
  const before = spec.after ? (await readSpec(dir, spec.after, [...seen, name])).allSteps : []
  return { ...spec, allSteps: [...before, ...(spec.steps ?? [])] }
}

// ---- 차례 ----
const wanted = process.argv.slice(2)
const flows = (await readdir(screensDir, { withFileTypes: true })).filter(entry => entry.isDirectory() && (!wanted.length || wanted.includes(entry.name))).map(entry => entry.name).sort()
if (!flows.length) throw new Error(`찍을 흐름이 없음: ${wanted.join(' ') || screensDir}`)
const server = await startServer()
try {
  for (const flow of flows) {
    const dir = path.join(screensDir, flow)
    const flowSpec = JSON.parse(await readFile(path.join(dir, 'flow.json'), 'utf8'))
    const specs = {}, shots = {}
    for (const name of screenOrder(flowSpec)) {
      specs[name] = await readSpec(dir, name)
      process.stdout.write(`${flow}/${name} 찍는 중… `)
      const png = await captureScreen(server, flow, name, specs[name])
      await writeFile(path.join(dir, `${name}.png`), png)
      shots[name] = Object.assign(png, { title: specs[name].title })
      console.log(`${Math.round(png.length / 1024)} KB`)
    }
    await mkdir(dir, { recursive: true })
    const sheet = await captureFlowSheet(flowSpec, shots)
    await writeFile(path.join(dir, 'flow.png'), sheet)
    await writeMarkdown(flow, flowSpec, specs)
    console.log(`${flow}/flow.png ${Math.round(sheet.length / 1024)} KB · docs/flows/${flow}.md 화면 기획 칸`)
  }
} finally { server.stop() }
