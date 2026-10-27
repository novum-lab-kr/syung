#!/usr/bin/env bash
# 메뉴 아바타 칸의 캐릭터 얼굴 PNG(web/brand/sprout-face-28 · 56 · 84.png)와 내 정보에서 고르는 프로필 캐릭터 얼굴
# (web/brand/faces/<이름>-84 · 240.png, 일곱)을 다시 만든다.
# face.html · faces.html 을 헤드리스 크롬으로 열어(지도와 같은 AvatarRenderer, 소프트웨어 WebGL) 페이지가 적은 data URL 을 파일로 푼다.
# 캐릭터 모양(web/map/avatars/*.mjs)이나 자르는 범위(face.html 의 SIZE · CENTER · HALF, faces.html 의 CROPS)를 바꿨을 때만 돌린다.
#   tools/avatar_face/make.sh            # CHROME=<크롬 실행 파일> 로 바꿀 수 있다
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=${PORT:-8097}
PY=$(command -v python3.13 || command -v python3)
"$PY" -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
DOM=$("$CHROME" --headless --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:$PORT/tools/avatar_face/face.html" 2>/dev/null)
COUNT=0
while read -r name url; do
  [[ $name == sprout-face-*.png && $url == data:image/png\;base64,* ]] || continue
  printf '%s' "${url#data:image/png;base64,}" | base64 -d > "$ROOT/web/brand/$name"
  echo "web/brand/$name $(wc -c < "$ROOT/web/brand/$name" | tr -d ' ') B"
  COUNT=$((COUNT + 1))
done <<< "$(printf '%s\n' "$DOM" | grep -o 'sprout-face-[0-9]*\.png data:image/png;base64,[A-Za-z0-9+/=]*')"
[ "$COUNT" = 3 ] || { echo "PNG 3장을 받지 못함($COUNT) — face.html 을 브라우저로 열어 콘솔 오류를 본다"; exit 1; }
# 프로필 캐릭터 얼굴(faces.html — 일곱 × 84 · 240)
DOM=$("$CHROME" --headless --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:$PORT/tools/avatar_face/faces.html" 2>/dev/null)
mkdir -p "$ROOT/web/brand/faces"
COUNT=0
while read -r name url; do
  [[ $name =~ ^faces/[a-z]+-(84|240)\.png$ && $url == data:image/png\;base64,* ]] || continue
  printf '%s' "${url#data:image/png;base64,}" | base64 -d > "$ROOT/web/brand/$name"
  echo "web/brand/$name $(wc -c < "$ROOT/web/brand/$name" | tr -d ' ') B"
  COUNT=$((COUNT + 1))
done <<< "$(printf '%s\n' "$DOM" | grep -o 'faces/[a-z]*-[0-9]*\.png data:image/png;base64,[A-Za-z0-9+/=]*')"
[ "$COUNT" = 14 ] || { echo "프로필 캐릭터 PNG 14장을 받지 못함($COUNT) — faces.html 을 브라우저로 열어 콘솔 오류를 본다"; exit 1; }
