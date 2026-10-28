# syung

수도권 전철 실시간 노선도. MapLibre GL(WebGL) 위에 KTDB GTFS 노선·역, OpenStreetMap 선로 형태,
서울시 실시간 열차 정보를 올려 열차가 선로를 따라 움직이는 모습을 보여 줍니다.

- 운영 중: https://syung.novum-lab.com/
- 열차는 줌 13 이상에서 표시, 3D 건물·해 그림자, 라이트/다크(자동: 서울 일출·일몰)

## 구성

```
web/        정적 페이지 원본 (index.html, maplibre_runtime.mts, vendor/maplibre-gl) — npm run build 가 dist/web 으로 빌드
data/       빌드된 데이터 (git에 포함)
  ktdb-gtfs-2025/capital-metro.json   노선·역 (KTDB GTFS에서 추출)
  ktdb-gtfs-2025/edge_times.json      역간 시간표 운행 시간·정차 시간
  osm-tracks/track_shapes.json        역간 선로 형태·노선별 역 위치·역 방향
  osm-tracks/manual_routes.json       수동 지정 선로 (필요할 때만)
pipeline/   데이터 빌드 스크립트
server/     실시간 열차 프록시 (서울시 API 캐시) + systemd·Caddy 예시
deploy/     배포 스크립트
docs/       열차 모델 설계 메모
```

## 로컬에서 작업하기

```bash
git clone https://github.com/novum-lab-kr/syung.git && cd syung
npm ci                              # 웹 빌드 도구(Vite)
npm run dev                         # http://localhost:8080 — web/ 을 고칠 때마다 dist/web 으로 다시 빌드
```
`npm run dev`는 `web/`을 `dist/web`으로 빌드하고(고치면 0.1초 안팎에 다시, 새로고침) `deploy/dev_server.py --dist`로 띄웁니다.
`data/`는 그대로, 실시간 열차(`/api/live`)는 운영 서버 프록시로 넘겨서 로컬에 API 키가 필요 없습니다. 다른 프록시를 쓰려면
`SUBWAY_LIVE_UPSTREAM`을 지정하세요. `python3 deploy/dev_server.py`는 빌드된 `dist/web`을 띄웁니다(`web/`에 TypeScript(`.mts`)가 있어 원본은 브라우저가 못 읽어요).
필요한 것: Python 3.10+, Node 22.18+. 시험(`node --test` · `unittest`)과 서버는 설치 없이 돌고, 웹 빌드에만 `npm ci`가 필요합니다.

웹 빌드(`vite.config.mts`): 모듈 하나 = 파일 하나로 이름 · 폴더 그대로 옮기고(묶지 않는다 — 첫 화면 요청 차례가 그대로),
HTML · CSS · 그림 · 자료 · `web/vendor/`는 그대로 복사합니다. 결과 `dist/`는 git에 넣지 않습니다.
타입 검사: `npm run typecheck`(`tsconfig.json` — strict · `.mts` 는 늘, `.mjs` 는 `// @ts-check` 를 붙인 것만).

배포는 자동이에요. `main`에 푸시(또는 PR 머지)하면 GitHub Actions(`.github/workflows/deploy.yml`)가 테스트를
돌리고, 통과하면 웹을 빌드해 `web-dist` 브랜치에 커밋으로 올린 뒤(`deploy/publish_web_dist.sh` — 트리 `web/` = `dist/web`,
메시지 `web-dist <소스 커밋>`) 서버에 SSH로 접속해 `deploy/remote_deploy.sh`를 실행해요(최신 코드 받기 → 테스트 → 배포,
`server/`가 바뀌었으면 프록시 재시작). 서버는 node 빌드를 하지 않고 `web-dist`에서 그 커밋의 빌드 결과를 꺼내요.
배포 키는 서버에서 이 스크립트만 실행하도록 제한돼 있어요. PR에는 테스트와 빌드 확인만 돌아요. 수동 배포: Actions 탭에서 `test-and-deploy` → Run workflow. 서버 로그: `/var/log/subway-deploy.log`.

`remote_deploy.sh` 순서: `origin/main` 커밋 하나를 정해(빌드가 아직이면 마지막으로 빌드된 커밋) 임시 폴더에 꺼내 테스트 → 통과해야 merge → `deploy/deploy.sh`가
그 커밋의 빌드 결과(`web-dist` — 빌드 도입 전 커밋이면 커밋의 `web/` 그대로) 전체와 자료 파일로 새 릴리스(`/var/www/syung-releases/<시각>-<커밋>`)를 만들고 `/var/www/syung` 링크를 한 번에
바꿔 끼움 → `server/`가 마지막 성공 배포(`/var/lib/subway-live/deployed-commit`)와 다르면 프록시 재시작 → `deploy/check_site.sh`가
화면이 부르는 주소(정적 파일 전부, `/api/route`, `/api/live`)를 확인 → 실패하면 정적 파일을 직전 릴리스로 되돌림(서버는 클론에서
돌아서 코드는 그대로). 커밋 안 된 파일은 릴리스에 섞이지 않고, `web/` 아래 새 폴더는 저절로 따라가요. 손으로 둔 옛 파일은
`/var/www/syung-keep/`에 두면 릴리스마다 링크돼요. 손으로 되돌리기: `deploy/deploy.sh --rollback`(한 번 더 하면 그 앞으로).
처음 한 번(진짜 폴더 → 링크): `deploy/deploy.sh --adopt`.
데이터 다시 만들기(pipeline/)는 GTFS 원본과 OSM 캐시가 있는 서버에서 하는 게 편합니다.

## 테스트

```bash
node --test tests/*.test.mjs
```
열차 경로·방향 예측(`web/lib/routing.mjs`)과 일출·일몰·해 위치(`web/lib/sun.mjs`)를, 실제로 고쳤던 사례(청량리 종착, 화랑대 방향, 응암순환 고리, 오전 9시 전 다크 모드 등)로 검증합니다.

## 실시간 프록시

`server/subway_live_proxy.py` — 서울시 `realtimeStationArrival/ALL`을 90초마다 한 번만 불러
캐시하고, `/live?lines=2호선,5호선`처럼 노선을 골라 돌려줍니다. 하루 호출 한도(기본 950) 안에서
동작하며, 실패하면 노선별 `realtimePosition` API로 전환합니다. 같은 프로세스가 버스(`/bus/live`) · 길찾기(`/route` · `/place`) ·
학습 페이지 로그인(`/auth` · `/login`)도 받습니다.

서버 코드는 층으로 나뉘어 한 방향으로만 부릅니다(`tests/test_server_layers.py`가 import 방향을 검사):
`server/app.py`(조립 · 배경 작업 시작) → `routes/`(입력 검사 · 응답 모양) → `services/`(실제 일, HTTP 모름) →
`sources/`(바깥 API: 서울 지하철 · 버스 · 카카오 · OSRM) · `store/`(호출 한도 · 기록 파일). 배경 작업은 `jobs/`, 환경 변수는
`server/config.py`만 읽습니다(따로 도는 `healthcheck.py`는 예외). `subway_live_proxy.py` · `bus_live_proxy.py` · `owner_auth.py`는 옛 실행 경로를 잇는 얇은 진입점입니다.

```bash
cp server/subway-live.env.example /etc/subway-live.env   # 키 입력
cp server/subway-live.service /etc/systemd/system/ && systemctl enable --now subway-live
```
운영 설정 예시: Caddy 는 `server/Caddyfile.example`(운영 `/etc/caddy/Caddyfile` 의 슝 블록과 같게 둔다), 환경 변수(키 · 회원 로그인)는
`server/subway-live.env.example`. 둘 다 서버에서 고쳤으면 예시도 같이 맞춘다.
회원 DB 백업: `subway-member-backup.timer` 가 매일 03:30 `/var/backups/syung/members-YYYYMMDD.sqlite3.gz` 로 남기고 14일 보관한다
(서버 밖 사본은 없음). 이 유닛 둘은 배포(`deploy/remote_deploy.sh`)가 깔고 켠다. 되살리기는 서버를 멈추고 옛 WAL 을 치운 뒤에(남은 `-wal` 이 새 파일에 덧씌워진다):
`systemctl stop subway-live` → `/var/lib/subway-live/members.sqlite3-wal` · `-shm` 지우기 →
`(umask 077; gunzip -c <사본> > /var/lib/subway-live/members.sqlite3)`(0600) → `systemctl start subway-live`.

## 데이터 다시 만들기

원본은 git에 없습니다.
- KTDB 대중교통 GTFS(2025년 기준) → `data/ktdb-gtfs-2025/202503_GTFS_DataSet/`
- OSM 선로·역·도로는 Overpass에서 받아 `data/osm-tracks/`에 캐시 (git 제외)

```bash
python3 pipeline/extract_ktdb_capital_metro.py   # GTFS → capital-metro.json
python3 pipeline/build_edge_times.py             # 역간 운행 시간
python3 pipeline/build_track_shapes.py           # OSM 선로 형태 (처음엔 Overpass 조회로 오래 걸림)
python3 pipeline/build_stations.py              # web/index.html 안 역 데이터 칸만 교체 (--check: 최신인지 확인)
```
`ROAD_MATCH=1`을 주면 지하 구간을 도로에 맞추는 실험 기능이 켜집니다(기본 꺼짐).

실측 보정용: `pipeline/sample_live_positions.py`(실시간 기록 수집) → `pipeline/analyse_live_samples.py`.

## 출처·라이선스

- 노선·역·시간표: 한국교통연구원(KTDB) 대중교통 GTFS — 상업 이용 조건 확인 필요
- 선로·역·도로·배경 지도: © OpenStreetMap contributors (ODbL), © OpenMapTiles, OpenFreeMap
- 실시간 열차: 서울 열린데이터광장 지하철 실시간 도착·위치 정보

## 브랜드 (슝)

`web/brand/` — 앱 아이콘과 파비콘. 라이트는 노란 바탕 검은 열차, 다크는 반대.

| 파일 | 용도 |
|---|---|
| `syung-{light,dark}.svg`, `-192/-512.png` | 앱 아이콘 (둥근 모서리) |
| `syung-{light,dark}-180.png`, `-1024.png` | 애플 터치 아이콘·스토어용 (정사각형, 모서리는 OS가 둥글게) |
| `favicon-{light,dark}.svg`, `-16/-32/-48.png` | 작은 크기용 단순화 파비콘 |
| `favicon.svg` | OS 테마를 따라 바뀌는 파비콘 한 파일 |
| `favicon.ico` | 16·32·48 라이트, 구형 브라우저용 |
| `syung-mono.svg` | 단색 (알림 아이콘 등) |

웹 지도에서는 파비콘이 지도 테마(자동·라이트·다크)를 따라 바뀝니다.
