#!/usr/bin/env bash
# 지도 올리기: 한 커밋에 들어 있는 web/ 전체 + 자료 파일 → 새 릴리스 폴더, 그다음 웹 폴더 링크를 한 번에 바꿔 끼운다.
#   deploy/deploy.sh [커밋]       # 기본 HEAD. 릴리스를 만들고 링크를 바꾼다(마지막 줄: deployed <sha> → <폴더>)
#   deploy/deploy.sh --rollback   # 링크를 직전 릴리스로(바꿔 끼운 기록을 거꾸로 따라간다)
#   deploy/deploy.sh --prune      # 최근 SYUNG_KEEP_COUNT 개 + 지금 · 직전 릴리스만 남긴다(배포 확인이 끝난 뒤에 부른다)
#   deploy/deploy.sh --adopt      # 처음 한 번: 진짜 폴더인 웹 폴더를 <시각>-before-releases 릴리스로 옮기고 그 자리에 링크
# 커밋 안 된 파일은 섞이지 않고(git archive), web/ 아래 새 폴더는 저절로 따라온다.
# 경로(테스트는 임시 폴더로): SYUNG_WEB 링크(Caddy root) · SYUNG_RELEASES 릴리스들 · SYUNG_KEEP_DIR 옛 파일 고정 폴더 ·
#   SYUNG_STATE 밤 재학습 자료 · SYUNG_KEEP_COUNT 남길 릴리스 수
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WEB=${SYUNG_WEB:-/var/www/syung}   # syung.novum-lab.com
RELEASES=${SYUNG_RELEASES:-/var/www/syung-releases}
KEEP_DIR=${SYUNG_KEEP_DIR:-/var/www/syung-keep}
STATE=${SYUNG_STATE:-/var/lib/subway-live}
KEEP=${SYUNG_KEEP_COUNT:-5}
HISTORY=$RELEASES/.history   # 링크가 가리킨 릴리스 이름, 한 줄에 하나(마지막 줄 = 지금)
# 웹 폴더에 바로 쓰이는 파일(밤 재학습의 학습 현황 숫자): 지금 걸린 릴리스에서 이어 받는다
CARRY=(admin/learning.json)
# 커밋에서 꺼내 릴리스 맨 위에 두는 자료 파일
DATA=(data/osm-tracks/track_shapes.json data/osm-tracks/exits.json data/ktdb-gtfs-2025/edge_times.json
      data/osm-tracks/coaster_buildings.bin data/osm-tracks/coaster_towers.json)   # 롤러코스터: 노선 따라 건물 높이
# 배포가 만들지 않는데 운영 폴더에 있던 옛 파일: --adopt 때 고정 폴더로 한 번 복사하고, 릴리스마다 그 폴더 목록만 링크한다
# (2026-10-10 헤르메스 결정: 옛 주소가 깨지지 않게. 운영 폴더 전체를 자동으로 이어 받지는 않는다)
LEGACY=(gallery webgl.html subway-utilization-case.png subwayStationMaster_tdata.csv verification_report.md)

point() {   # 새 링크를 옆에 만들고 rename 한 번으로 바꾼다(요청이 빈 폴더를 보는 틈이 없다)
  ln -sfn "$RELEASES/$1" "$WEB.new"
  mv -T "$WEB.new" "$WEB"
}

current() { basename "$(readlink -f "$WEB")"; }

previous() {   # 기록에서 지금 것 바로 앞의, 아직 남아 있는 릴리스
  local now name
  now=$(current)
  [ -f "$HISTORY" ] || return 0
  # 거꾸로 읽어 지금 것(맨 끝의 같은 이름들)을 건너뛴 다음 처음 만나는 남은 릴리스
  tac "$HISTORY" | awk -v now="$now" 'seen || $0 != now { seen = 1 } seen' | while read -r name; do
    if [ -d "$RELEASES/$name" ]; then echo "$name"; break; fi
  done || true
}

need_link() {
  if [ -d "$WEB" ] && [ ! -L "$WEB" ]; then
    echo "$WEB 이 아직 진짜 폴더 — 처음 한 번 deploy/deploy.sh --adopt 를 먼저"; exit 1
  fi
}

adopt() {
  if [ -L "$WEB" ]; then echo "이미 링크: $WEB → $(readlink "$WEB")"; return 0; fi
  [ -d "$WEB" ] || { echo "$WEB 이 없음"; exit 1; }
  [ "$(stat -c %d "$WEB")" = "$(stat -c %d "$RELEASES")" ] || { echo "$WEB 와 $RELEASES 가 다른 디스크라 rename 으로 옮길 수 없음"; exit 1; }
  local name f
  name=$(date -u +%Y%m%dT%H%M%SZ)-before-releases
  if [ ! -e "$KEEP_DIR" ]; then
    rm -rf "$KEEP_DIR.new" && mkdir -p "$KEEP_DIR.new"
    for f in "${LEGACY[@]}"; do if [ -e "$WEB/$f" ]; then cp -a "$WEB/$f" "$KEEP_DIR.new/"; fi; done
    chmod -R u=rwX,go=rX "$KEEP_DIR.new" && mv -T "$KEEP_DIR.new" "$KEEP_DIR"
  fi
  ln -sfn "$RELEASES/$name" "$WEB.new"
  mv -T "$WEB" "$RELEASES/$name"
  if ! mv -T "$WEB.new" "$WEB"; then   # 두 rename 사이 아주 짧은 틈. 둘째가 실패하면 진짜 폴더를 되돌려 둔다
    mv -T "$RELEASES/$name" "$WEB"; rm -f "$WEB.new"; echo "링크로 바꾸지 못해 원래 폴더로 되돌림"; exit 1
  fi
  echo "$name" >> "$HISTORY"
  echo "adopted: 진짜 폴더 → $RELEASES/$name, 옛 파일 → $KEEP_DIR"
}

rollback() {
  need_link
  local prev; prev=$(previous)
  [ -n "$prev" ] || { echo "되돌릴 직전 릴리스가 없음($(current))"; exit 1; }
  point "$prev"
  # 기록을 직전 것까지 접는다: 한 번 더 되돌리면 그 앞으로 간다
  tac "$HISTORY" | awk -v prev="$prev" 'seen || $0 == prev { seen = 1 } seen' | tac > "$HISTORY.new"
  mv -T "$HISTORY.new" "$HISTORY"
  echo "rolled back → $RELEASES/$prev"
}

prune() {   # 처음 옮긴 옛 폴더(-before-releases)는 손으로 지울 때까지 둔다
  need_link
  local keep name
  keep=$( { current; previous; if [ -f "$HISTORY" ]; then tac "$HISTORY" | awk -v n="$KEEP" '!seen[$0]++ && n-- > 0'; fi; } | sort -u)
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.*' ! -name '*-before-releases' -printf '%f\n' | while read -r name; do
    if ! grep -qxF "$name" <<<"$keep"; then rm -rf "${RELEASES:?}/$name"; echo "pruned $name"; fi
  done
  if [ -f "$HISTORY" ]; then   # 기록도 남은 릴리스만
    while read -r name; do if [ -d "$RELEASES/$name" ]; then echo "$name"; fi; done < "$HISTORY" > "$HISTORY.new"
    mv -T "$HISTORY.new" "$HISTORY"
  fi
}

mkdir -p "$RELEASES" && chmod go+rx "$RELEASES"
if [ -z "${SYUNG_DEPLOY_LOCKED:-}" ]; then   # remote_deploy.sh 는 같은 잠금을 처음부터 끝까지 쥐고 부른다
  exec 9>"$RELEASES/.lock"
  flock 9   # 배포 · 되돌리기 · 정리가 겹치지 않게
fi
case "${1:-}" in
  --adopt) adopt; exit 0 ;;
  --rollback) rollback; exit 0 ;;
  --prune) prune; exit 0 ;;
  -*) echo "모르는 옵션: $1"; exit 2 ;;
esac
need_link

sha=$(git -C "$ROOT" rev-parse --verify "${1:-HEAD}^{commit}")
tmp=$(mktemp -d "$RELEASES/.new-XXXXXX")
trap 'rm -rf "$tmp"' EXIT
paths=(web "${DATA[@]}" data/live-timing.json)
if git -C "$ROOT" cat-file -e "$sha:data/bus/routes.json" 2>/dev/null; then paths+=(data/bus); fi
git -C "$ROOT" archive "$sha" -- "${paths[@]}" | tar -x -C "$tmp"
out=$tmp/web
# admin/ 아래(학습 · 디버깅 · learning.json)는 주인만: Caddy 가 서버의 /auth 로 묻는다(admin/login.html 만 열림)
for f in "${DATA[@]}"; do mv "$tmp/$f" "$out/"; done
# bus: v1 정적 주소(/data/bus/*.json)를 길찾기의 bus.json 과 따로 둔다
if [ -d "$tmp/data/bus" ]; then mkdir -p "$out/data/bus" && mv "$tmp"/data/bus/*.json "$out/data/bus/"; fi
# live timing: 밤마다 다시 배운 것(pipeline/retrain_live_timing.py)이 있으면 그것
if [ -f "$STATE/live-timing.json" ]; then cp "$STATE/live-timing.json" "$out/"; else mv "$tmp/data/live-timing.json" "$out/"; fi
# bus pace: 밤마다 배운 노선 구간 빠르기(pipeline/bus_pace.mjs)가 있으면 새 릴리스에도(/data/bus/pace/)
if [ -d "$STATE/bus-pace/web" ]; then mkdir -p "$out/data/bus/pace" && cp -p "$STATE"/bus-pace/web/*.json "$out/data/bus/pace/" 2>/dev/null || true; fi
for f in "${CARRY[@]}"; do
  from=$WEB/$f
  if [ ! -f "$from" ] && [ -f "$WEB/$(basename "$f")" ]; then from=$WEB/$(basename "$f"); fi   # admin/ 로 옮기기 전 릴리스(2026-10-12)
  if [ -f "$from" ]; then mkdir -p "$out/$(dirname "$f")" && cp -p "$from" "$out/$f"; fi
done
chmod -R u=rwX,go=rX "$out"   # 웹 서버(caddy 사용자)가 읽게
if [ -d "$KEEP_DIR" ]; then   # 옛 파일: 고정 폴더에 있는 것만 링크, 커밋에 같은 이름이 있으면 커밋 것
  for f in "$KEEP_DIR"/*; do
    if [ -e "$f" ] && [ ! -e "$out/$(basename "$f")" ]; then ln -s "$f" "$out/"; fi
  done
fi

name=$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}
while [ -e "$RELEASES/$name" ]; do name=$name-1; done
mv -T "$out" "$RELEASES/$name"
point "$name"
echo "$name" >> "$HISTORY"
echo "deployed ${sha:0:12} → $RELEASES/$name"
