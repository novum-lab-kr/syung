# subway-live-map

수도권 전철 실시간 노선도. MapLibre GL(WebGL) 위에 KTDB GTFS 노선·역, OpenStreetMap 선로 형태,
서울시 실시간 열차 정보를 올려 열차가 선로를 따라 움직이는 모습을 보여 줍니다.

- 운영 중: https://office.nol-meok.cloud/artifacts/subway-preview/
- 열차는 줌 13 이상에서 표시, 3D 건물·해 그림자, 라이트/다크(자동: 서울 일출·일몰)

## 구성

```
web/        정적 페이지 (index.html, maplibre_runtime.mjs, vendor/maplibre-gl)
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

## 로컬에서 보기

```bash
deploy/deploy.sh /tmp/subway-site          # web + data를 한 폴더로
python3 -m http.server -d /tmp/subway-site 8080
```
실시간 열차는 `./api/live`(프록시)가 있어야 나옵니다. 없으면 노선·역만 보입니다.

## 실시간 프록시

`server/subway_live_proxy.py` — 서울시 `realtimeStationArrival/ALL`을 90초마다 한 번만 불러
캐시하고, `/live?lines=2호선,5호선`처럼 노선을 골라 돌려줍니다. 하루 호출 한도(기본 950) 안에서
동작하며, 실패하면 노선별 `realtimePosition` API로 전환합니다.

```bash
cp server/subway-live.env.example /etc/subway-live.env   # 키 입력
cp server/subway-live.service /etc/systemd/system/ && systemctl enable --now subway-live
```

## 데이터 다시 만들기

원본은 git에 없습니다.
- KTDB 대중교통 GTFS(2025년 기준) → `data/ktdb-gtfs-2025/202503_GTFS_DataSet/`
- OSM 선로·역·도로는 Overpass에서 받아 `data/osm-tracks/`에 캐시 (git 제외)

```bash
python3 pipeline/extract_ktdb_capital_metro.py   # GTFS → capital-metro.json
python3 pipeline/build_edge_times.py             # 역간 운행 시간
python3 pipeline/build_track_shapes.py           # OSM 선로 형태 (처음엔 Overpass 조회로 오래 걸림)
python3 pipeline/build_ktdb_gtfs_preview.py      # build/index.html 재생성 → web/index.html과 비교 후 반영
```
`ROAD_MATCH=1`을 주면 지하 구간을 도로에 맞추는 실험 기능이 켜집니다(기본 꺼짐).

실측 보정용: `pipeline/sample_live_positions.py`(실시간 기록 수집) → `pipeline/analyse_live_samples.py`.

## 출처·라이선스

- 노선·역·시간표: 한국교통연구원(KTDB) 대중교통 GTFS — 상업 이용 조건 확인 필요
- 선로·역·도로·배경 지도: © OpenStreetMap contributors (ODbL), © OpenMapTiles, OpenFreeMap
- 실시간 열차: 서울 열린데이터광장 지하철 실시간 도착·위치 정보
