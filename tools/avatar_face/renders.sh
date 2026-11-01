#!/usr/bin/env bash
# 소개 페이지에 넣는 캐릭터 전신 PNG(새싹 · 선비 · 건설자 · 방문자, 왼쪽 · 오른쪽 두 장씩)를 지정한 폴더에 만든다.
# renders.html 을 헤드리스 크롬으로 열어(지도와 같은 AvatarRenderer, 소프트웨어 WebGL) 페이지가 적은 data URL 을 파일로 푼다.
#   tools/avatar_face/renders.sh <폴더>   # CHROME=<크롬 실행 파일> · PORT=<포트> 로 바꿀 수 있다
set -euo pipefail
OUT=${1:?저장할 폴더를 적는다}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=${PORT:-8097}
PY=$(command -v python3.13 || command -v python3)
# 캐릭터 모양은 TypeScript 라 브라우저가 원본을 못 읽는다 — 빌드 결과(dist/web)를 부른다
(cd "$ROOT" && npm run build >/dev/null)
"$PY" -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
DOM=$("$CHROME" --headless --disable-gpu-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --virtual-time-budget=20000 --dump-dom "http://127.0.0.1:$PORT/tools/avatar_face/renders.html" 2>/dev/null)
mkdir -p "$OUT"
COUNT=0
while read -r name url; do
  [[ $name =~ ^renders/[a-z]+-(left|right)\.png$ && $url == data:image/png\;base64,* ]] || continue
  file=$OUT/${name#renders/}
  printf '%s' "${url#data:image/png;base64,}" | base64 -d > "$file"
  echo "$file $(wc -c < "$file" | tr -d ' ') B"
  COUNT=$((COUNT + 1))
done <<< "$(printf '%s\n' "$DOM" | grep -o 'renders/[a-z]*-[a-z]*\.png data:image/png;base64,[A-Za-z0-9+/=]*')"
[ "$COUNT" = 8 ] || { echo "전신 PNG 8장을 받지 못함($COUNT) — renders.html 을 브라우저로 열어 콘솔 오류를 본다"; exit 1; }
