# 슝 (syung) — 에이전트 안내

수도권 지하철 실시간 위치 지도(MapLibre + 직접 짠 WebGL). 모드: 기본 · 심시티 · 조선 · 롤코 · 스타크래프트(종족 셋 — 테란 · 저그 · 프로토스, 모드 하나씩). 웹은 Vite 로 빌드(`web/` → `dist/web` · 모듈 하나 = 파일 하나 · 묶지 않음), 서버는 Python 표준 라이브러리.

## 어디서 무엇을 고치나
| 경로 | 내용 |
|---|---|
| `web/maplibre_runtime.mjs` | 본체: 부팅 · 조립(모든 모듈을 import 해 deps 로 넘김) · 모드 전환(`prepareMode` · `commitMode`) · 선로 도형 · 열차 자세 |
| `web/modes/index.mts` · `merge.mjs` | 모드 목록 · 설정 상속(합치기 · 검사 · 얼리기), `settings(이름, 내 설정)` |
| `web/modes/transition.mjs` | 모드 상태의 주인(지금 · 원하는 모드, 요청 번호, 롤코 배속) |
| `web/modes/basic/` | 모든 설정의 원본: `index.mts`(설정 묶음) · `palette.mts`(지도 색) · `city.mts`(도시 팩) · `park.mts`(공원 자료) |
| `web/modes/<모드>/` | 그 모드의 다른 값만(`index.mts`) + 모드 전용 콘텐츠(조선: 한옥 · 거북선 · 가마, 롤코: 선로 · 88열차 · 1인칭 · 놀이기구 · 밤) |
| `web/city/` | 공용 도시 엔진: 건물(`buildings` · `mesh` · `worker`) · 고가(`viaduct*`) · 땅(`style`) · 도시 생활(`life`) · 랜드마크 · 부품 등록(`parts`) |
| `web/map/` | 지도 층: 승강장 · 이름표 · 해 그림자 · 테마 · 열차 캔버스 그리기 차례(`overlay`) · 정적 층 등록(`layers`) |
| `web/trains/` | 실시간 받기(`live_feed`) · 예측(`plan`) · 열차 그리기(`draw`) |
| `web/ui/` | 아래 시트 · 정보창 · 검색 · 여정 지도 표시. 시트 몸통의 화면 조각은 `.tsx`(Preact — 지금 역 도착 시트 `station_sheet.tsx`, `openSheetView` 로 연다) |
| `web/bus/` | 버스 층 · 도로 · 메시(모양 등록 `registerBusLook`) · 움직임 |
| `web/user/prefs.mjs` | 내 설정 창구(지금은 기기 저장, 이름 `subway-theme` · `subway-map-color`) |
| `web/lib/` | 남은 공용 도우미(routing · station_signs · sun · platform_* · journey-ui …) |
| `web/index.html` | 역 데이터는 안에 둔다 — 손으로 고치지 말고 `python3 pipeline/build_stations.py` |
| `server/` | `app.py`(주소 → 담당) → `routes/` → `services/` → `sources/`(바깥 API) · `store/`(파일), `jobs/` 배경 작업, `config.py` 환경 변수 · 비밀값 |
| `pipeline/` | 자료 만들기(역 · 선로 · 고가 · 버스). 실행하면 바깥에서 받거나 web/ 의 생성 파일을 덮는다 — `--help` 도 그대로 도는 스크립트가 있다. 확인만 할 땐 `node --check` · `python3 -m py_compile` |

## 실행 · 시험
| 할 일 | 명령 |
|---|---|
| 로컬 화면 | `npm ci` 한 번 → `npm run dev [-- 포트]`(기본 8080 · 고치면 dist/web 다시 빌드 · `/api/live` 는 운영으로 넘김). `python3 deploy/dev_server.py [포트]` 는 빌드된 dist/web 만 띄운다(web/ 에 .mts 가 있어 원본은 브라우저가 못 읽는다) |
| 웹 빌드 · 타입 | `npm run build` → `dist/web`(git 무시 · 설정 `vite.config.mts`) · `npm run typecheck`(tsc · `tsconfig.json`) |
| JS 시험 | `node --test tests/*.test.mjs` |
| Python 시험 | `python3 -m unittest discover -s tests`(OSM 캐시 없으면 일부 건너뜀) |
| 배포 | main push → Actions(시험 → 빌드해 `web-dist` 브랜치에 올림 `deploy/publish_web_dist.sh`) → `deploy/remote_deploy.sh`(그 커밋의 빌드 결과 + 자료로 릴리스 폴더 → 링크 바꿔 끼우기 · 되돌리기). 서버는 빌드하지 않는다. 서버에서 직접 고치지 않는다 |

## 모드 규칙
- 기본이 원본, 모드는 **다른 것만** 적는다(`from` 생략 = basic, 상속 두 단계까지). 묶음은 안쪽까지 합치고 값 · 목록은 통째로, `null` 은 끄기 — 단 아는 묶음(map · city · city.life · park · track · trains · buses · sun · sky)은 `null` 대신 그 키(`enabled:false` 등)로.
- 본체 · 엔진은 모드 이름을 묻지 않는다: `modeCtl.settings()` 의 키(`track.kind` · `trains.look` · `city.enabled` · `city.tone` · `buses.look` · `park.enabled` …)를 묻는다. 새 키는 `basic/index.mts` 에 기본값 + `modes/index.mts` `checkKnown` 에 값 검사.
- 설정은 데이터뿐(함수 · 클래스 · getter 금지). 모드 전용 코드는 이름으로 등록해 쓴다(`city/parts.mjs` · `bus/mesh.mjs registerBusLook`).
- 도시 팩 참조가 바뀌면 건물 타일을 전부 다시 짓는다: 설정은 레지스트리가 한 번 합쳐 얼린 것을 쓰고, 테마 · 색마다 새 팩을 만들지 않는다.
- 새 모드: `web/modes/<이름>/index.mts`(id · from · label · settings) → 본체에서 import 해 `createModeRegistry([...])` 에 넣기 → 버튼 · `prepareMode` · `commitMode` 연결.
- 모드 전용 GL 자원은 그 모드를 나가면 그리는 쪽이 치운다(`trains/draw.mjs kit(look)` · overlay 의 놀이기구 · 롤코 선로 버퍼).

## 서버 층 규칙
- 한 방향으로만: routes → services → sources · store(`tests/test_server_layers.py` 가 막는다). 환경 변수 · 비밀값은 `config.py` 에서만.
- 검사: `ruff check` · `pyright`(설정 `pyproject.toml` — 도구만 `pip install --group dev`, CI test 잡이 돈다). `server/` 는 pyright strict 라 새 함수 · 고친 함수는 타입을 다 적는다(JSON 은 `dict[str, Any]`, 타입으로만 쓰는 import 는 `if TYPE_CHECKING:` 안). Python 3.10 문법까지만(로컬 `deploy/dev_server.py` 가 server 코드를 import 한다 — `datetime.UTC` 같은 3.11+ 는 쓰지 않는다). 타입 검사기가 못 따라가는 "위에서 이미 봤다"는 `typing.cast("타입", 값)`(실행 동작 그대로) — `assert` 로 바꾸지 않는다.
- 지금 주소(`/live` · `/route` · `/bus/live` …)와 응답 모양은 바꾸지 않는다. 새 API 는 `/api/…`, 오류 모양 `{"error":{"code","message"}}`. 비밀값 · 개인정보는 로그에 안 찍는다.

## 속도 기준(렌더링이 1초도 늦어지면 안 된다)
- 첫 화면 정적 import 그래프의 **깊이**가 요청 시간을 정한다(4G rtt 150 ms 한 단계씩). 새 파일은 본체가 직접 import 하는 모듈만 import 한다 — 자식만 부르는 모듈은 한 단계 늦게 요청된다.
- 모드의 큰 코드(도시 건물 · 랜드마크 · 한옥 · 거북선 · 88열차 · 1인칭 레일 · 놀이기구 · 놀이기구 자리)는 첫 화면에서 받지 않는다: `loadModeKit` 의 `import()` + `MODE_KIT_DEPS`(그 모듈들이 다시 부르는 것 — `tests/mode_kit_deps.test.mjs`). 가마 · 1인칭 카메라 · 밤 조명 · 롤코 선로는 첫 화면 코드.
- `index.html` 의 modulepreload 는 vendor 둘뿐. 시험 통과 ≠ 속도 통과 — 4G 흉내로 기준(origin/main)과 같은 방식(두 쪽 모든 파일을 같은 경로로)으로 잰다. 단 바꿔 끼운 파일은 대역폭을 나눠 쓰지 않아 큰 파일이 바뀌면 차이가 묻힌다 — 절대 숫자는 바꿔 끼우기 없이 운영 주소에 잰다(8093 은 압축이 없어 더 느리다).
- 빌드(`vite.config.mts`)는 요청 차례를 바꾸지 않는다: 모듈 하나 = 파일 하나 · 이름 그대로 · `treeshake: false`(켜면 본체의 "같은 단계에서 요청" `import './x.mjs'` 줄이 빠져 11개 파일이 한 단계 늦어진다 — 2026-10-27 잼) · 본체의 `import(\`./${n}.mjs\`)` 는 그대로(`dynamicImportVarsOptions.exclude`). 묶기 · 줄이기(minify)는 속도를 재고 따로 정한다.
- 기준 숫자(2026-10-22 다시 정함 — 맥 capd, 4G rtt 150 ms · 4 Mbps, 1000×700, 파일 바꿔 끼우기 없이, 운영 659931f): 운영(gzip) 첫 노선 2.90~2.95 s · 지도 다 뜸 5.72~5.93 s · 받은 양 1449 KB(3회). 같은 잡을 개발 서버 8093(압축 없음)에 대면 7.09~7.34 s · 11.63 s · 3975 KB.
  - 옛 숫자 첫 노선 약 5.0 s · 지도 약 9.5 s(2026-10-10)는 **일부 파일만 바꿔 낀 잡 값**이다(바꿔 낀 파일은 4 Mbps 를 나눠 쓰지 않아 빨리 온다). 같은 날 바꿔 끼우기 없이 8093 에 잰 값은 5.78 s · 10.15 s(`syung-struct/fair-slowload.json`).
  - 지켜볼 것: 첫 화면 JS 가 2026-10-22 밤 gzip 약 +35 KB(스타 도시 팩 · 유닛 모양, 나라 팩 넷, 레트로 팩 — 지연 로드는 아직 안 함). 2026-10-28 Preact 들이기로 약 +8 KB(preact 5.6 · jsx-runtime 1.0 · 역 도착 시트 1.3 — gzip -9, 4G 흉내 압축 없는 8093 꼴에서 본체 +0.05~0.11 s). 첫 노선을 막는 파일은 `city/viaduct_snap.mjs`(8093 353 KB · 운영 gzip 115 KB) — 첫 화면에 같이 받는 것이 늘면 이 파일이 늦게 끝난다.
  - 첫 화면 JS gzip 약 560 KB(2026-10-10 값, 이후 다시 안 잼). 이 서버의 점검 스크립트: `/var/lib/capd/work/syung-struct/`(slowload · modes · modesv · themecheck · lightcheck · journeycheck · ridecheck2 · reentry · errlog …, 공용 캡처 서버 capd 로만).

## 함정
- **TypeScript(섞어 쓰는 중)**: 새 파일 · 옮기는 파일은 `.mts`, import 는 확장자까지(`./x.mts`), 지울 수 있는 문법만(enum · namespace · 매개변수 속성 금지 — `erasableSyntaxOnly`). 시험(`node --test`)은 Node 22.18+ 가 `.mts` 를 그대로 읽고(서버 22.23 · CI 22), 빌드는 `.mjs` 로 낸다(이름 그대로 — 결과 주소 · 요청 차례 같음). `.mjs` 는 맨 위 `// @ts-check` 를 붙인 것만 검사. 지도 타입은 `import type { Map } from 'maplibre-gl'`(devDependency 6.11.1 = `web/vendor` 와 같은 판 · 타입만 — 실행은 vendor 그대로). 본체가 넘기는 deps 는 그 파일이 쓰는 칸만 interface 로 적는다. 본체의 `import(\`./${n}.mjs\`)`(MODE_KIT_DEPS) 목록에 든 모듈을 `.mts` 로 옮기면 `tests/mode_kit_deps.test.mjs` 의 `.mjs` 붙이기도 맞춘다. `.mjs` → `.mts` 로 옮길 땐 web/ 밖에서 부르는 곳도 찾는다(`grep -rn '<파일>.mjs' tests pipeline tools`) — `pipeline/map_replay.mjs` 등이 web 모듈을 직접 import 한다(경로만 고친다)
- **화면 조각(Preact · `.tsx`)**: 아래 시트 몸통처럼 바닐라 껍데기 안의 칸만 Preact 로 그린다(`preact` 11 — `dependencies`, JSX 는 `preact/jsx-runtime` · tsconfig `jsxImportSource`). DOM 모양 · class · 문구 · aria 는 옛 HTML 그대로(스타일 · 단추 찾기가 맞게). Node 시험은 `.tsx` 를 못 읽으니 고르기 · 셈은 `.mts` 에 두고 `.tsx` 는 그리기만, `.tsx` 를 시험이 부르는 모듈에서 import 하지 않는다. 첫 화면 조각과 preact 는 본체가 같은 단계에서 요청한다(`import 'preact'` 줄 — 아니면 한 단계 늦다). 빌드 결과에서 npm 패키지는 `npm/<패키지>/…`(vite.config `npmPath`). 관리 화면은 `web/admin/<이름>.tsx` 를 vite `input` 에 더하고 HTML 이 인라인 스크립트 대신 `<script type="module" src="./<이름>.mjs">` 로 부른다(첫 그림은 HTML 에 두고 모듈이 비우고 그린다) — `admin/` 아래라 운영에서는 주인 쿠키 뒤이고, `deploy/check_site.sh` 는 로그인 없이 200 이 나오면 실패로 본다(운영 Caddy: `/admin/login.html` 만 열림, 그 밖의 `/admin/*` 는 확장자와 상관없이 로그인 뒤). 로그인 페이지(`admin/login.html`)가 모듈을 쓰게 되면 그 모듈은 `/admin/` 밖에 둔다(`/npm/…` 공용 preact 는 공개).
- **웹은 빌드 결과가 올라간다**: 운영은 `dist/web`(CI 빌드 → `web-dist` 브랜치). HTML · CSS · 그림 · JSON · `vendor/` 는 그대로 복사, `.mjs` 는 본체에서 import 로 닿아야 결과에 들어간다 — import 로 닿지 않는 모듈(시험만 부르는 것)은 운영에 없다. 도시 건물 Worker(`city/worker.mjs`)와 `new URL('…', import.meta.url)` 자산은 Vite 가 `assets/<이름>-<해시>` 로 옮긴다.
- **본체를 글자로 잘라 실행하는 시험**: `tests/coaster_mode_transition` · `coaster_occlusion` · `platform_*_fixture` 가 본체 함수 구간을 표지 글자로 자른다. 그 구간을 옮기거나 표지를 바꾸면 시험의 표지도 맞춘다.
- **빠진 deps 는 node 시험이 못 잡는다**(그리기 경로). 나눈 파일은 범위 검사 · 실제 화면의 pageerror · 콘솔 오류로 확인.
- 셰이더 uniform 이름이 겹치면 컴파일 오류(그 층만 꺼진다) — 이름을 바꿀 땐 같은 파일의 기존 uniform 을 먼저 찾는다.
- 본체의 끌어올려지는 wrapper(`effectiveTheme` · `applyTheme` …)는 앞에서 만든 층이 값으로 받아 간 이름이다 — 지우지 않는다. 늦게 생기는 값은 `live:{get x(){…}}` getter 로 넘긴다(값 복사 금지).
- `window.__subwayWebGL`(setSimcity · setCoaster · simcity · coaster · plans · cityBuildings …)은 점검 스크립트가 쓴다 — 이름 유지. 전환 함수는 준비됐으면 바로 true, 기다리면 Promise(바꿨으면 true), 할 일이 없으면 undefined.
- Worker(`city/worker.mjs`)에는 데이터만 보낸다. 한옥 같은 코드는 Worker 가 정적 import 로 스스로 등록한다.
- 휴대폰 메모리 한도: 도시 건물 캐시 18타일 · 56 MB(조선 타일로 탭이 죽은 적 있음). 엔진은 하나를 같이 쓴다.
- 모드 건물 모형을 건물마다 꼭짓점으로 짓지 않는다: 스타크래프트 모형을 그렇게 지었더니 휴대폰 화면 타일 2~3장에 110~231 MB(2026-10-22). 모양은 템플릿 하나를 같이 쓰고 건물마다 기록만(`race_buildings.mjs raceTemplates` · `mesh.mjs packModels` · `buildings.mjs drawModels` → 3.8~6.3 MB). 재기: `/var/lib/capd/work/syung-star/memory.mjs`(맥 capd, 390×844).
- 실시간 자료는 20초~1분 늦다. 시간표만으로 "N분 뒤" 안내를 하지 않는다. 위치 피드는 15~25초마다만 바뀐다(받기 주기: 보통 20초 · 열차 시트 10초).
- 지도 위 노선 · 열차에 브랜드 노랑(#FFD400) 금지. 열차는 단색 금지(멀티톤 셰이더). 자산 URL 에 `?v=` 금지(no-store).
