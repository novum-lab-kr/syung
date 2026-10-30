#!/usr/bin/env bash
# 배포 뒤 확인: 웹 서버(Caddy) 너머로 화면이 실제로 부르는 주소가 답하는지. 하나라도 실패하면 1.
#   deploy/check_site.sh [릴리스 폴더, 기본 SYUNG_WEB 링크가 가리키는 곳]
# - 정적: 릴리스 안 모든 파일(/ · 모든 .mjs · 자료 · 옛 파일 링크) 200. admin/ 은 200 이 아니어야 한다
#   (Caddy 보호가 빠진 채 올라가면 실패 → 되돌림). 로그인 페이지(admin/login.html)는 보지 않는다 — 관리 화면이
#   syung.novum-lab.com/admin(novum-web 레포 syung-admin/)으로 옮겨 가 map. 에서는 200(옮기기 전) · 301(옮긴 뒤) 둘 다 맞다
# - API: web/ 이 fetch 하는 경로 그대로(./api/route · ./api/live → Caddy 가 서버의 /route · /live 로 넘긴다).
#   /api/route 는 200 JSON. /api/live 는 200 JSON, 또는 서버가 낸 503 JSON(서울 API 실패)은 경고만 남기고 통과
#   (2026-10-10 헤르메스: 서버는 클론에서 돌아 정적 파일을 되돌려도 상류 장애가 안 고쳐진다).
#   서버를 막 재시작했을 수 있어 연결 실패 · 502 · 503 · 504 는 SYUNG_CHECK_WAIT 초까지 다시 묻는다.
#   버스 위치 · 장소 검색은 바깥 API 한도를 써서 묻지 않는다. 응답 본문은 로그에 남기지 않는다(상태 · 주소만).
# SYUNG_CHECK_BASE(기본 지도 주소 https://map.syung.novum-lab.com) · SYUNG_CHECK_RESOLVE(기본 이 기계로, 빈 값이면 안 씀)
# 소개 사이트(syung.novum-lab.com)는 여기서 보지 않는다: novum-web 레포 syung/ 이 /var/www/syung-landing 으로 따로 배포한다(이 릴리스에 없다)
set -uo pipefail
dir=$(readlink -f "${1:-${SYUNG_WEB:-/var/www/syung}}") && [ -d "$dir" ] || { echo "실패: 릴리스 폴더 없음 ${1:-${SYUNG_WEB:-/var/www/syung}}"; exit 1; }
BASE=${SYUNG_CHECK_BASE:-https://map.syung.novum-lab.com}
RESOLVE=${SYUNG_CHECK_RESOLVE-map.syung.novum-lab.com:443:127.0.0.1}   # 이 기계의 DNS 가 늦을 수 있어 직접
WAIT=${SYUNG_CHECK_WAIT:-60}
curl_args=(-sS --max-time 30)
if [ -n "$RESOLVE" ]; then curl_args+=(--resolve "$RESOLVE"); fi
body=$(mktemp)
trap 'rm -f "$body"' EXIT
fail=0

get() {   # → "상태 내용형식", 본문은 $body
  curl "${curl_args[@]}" -o "$body" -w '%{http_code} %{content_type}' "$BASE$1" 2>/dev/null || echo "000 -"
}

is_json() { python3 -c 'import json, sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$body" 2>/dev/null; }

files=$(cd "$dir" && find -L . -type f ! -path './admin/*' -printf '/%P\n' | sort) && [ -n "$files" ] || { echo "실패: 릴리스 파일 목록을 못 만듦"; exit 1; }
n=0
while read -r path; do
  n=$((n + 1))
  read -r code _ < <(get "$path")
  if [ "$code" != 200 ]; then echo "실패 $code $path"; fail=1; fi
done < <(echo /; echo "$files")
echo "정적 $n 개 확인"
while read -r path; do
  [ -n "$path" ] || continue
  read -r code _ < <(get "$path")
  if [ "$code" = 200 ]; then echo "실패 $code $path — 주인 페이지가 로그인 없이 열림"; fail=1; fi
done < <(cd "$dir" && find -L ./admin -type f ! -name login.html -printf '/admin/%P\n' 2>/dev/null | sort)

api() {   # api <경로> <503 JSON 을 경고로 둘지 0|1>
  local path=$1 soft=$2 code type deadline=$((SECONDS + WAIT))
  while :; do
    read -r code type < <(get "$path")
    if [ "$code" = 200 ] && is_json; then echo "API OK $path"; return 0; fi
    if [ "$code" = 503 ] && [ "$soft" = 1 ] && [[ "$type" == application/json* ]] && is_json; then
      echo "경고: $path 503 — 서버는 답했지만 상류 실패"; return 0
    fi
    case "$code" in 000|502|503|504) if [ "$SECONDS" -lt "$deadline" ]; then sleep 2; continue; fi ;; esac
    echo "실패 $code $path"; return 1
  done
}
api "/api/route?from=37.5547,126.9707&to=37.4979,127.0276" 0 || fail=1   # 서울역 → 강남역
api "/api/live?lines=2%ED%98%B8%EC%84%A0" 1 || fail=1   # 2호선
exit $fail
