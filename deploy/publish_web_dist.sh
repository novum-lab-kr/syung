#!/usr/bin/env bash
# 웹 빌드 결과 올리기(CI build 잡 · main 만): dist/web 을 origin 의 web-dist 브랜치에 커밋 하나로 쌓는다.
#   npm run build && deploy/publish_web_dist.sh      # 레포 뿌리 · 지금 HEAD 를 빌드한 결과
# 커밋 트리 = web/(dist/web 그대로), 메시지 = "web-dist <소스 커밋 40자>" — deploy/deploy.sh 가 이 메시지로 소스 커밋의 빌드를 찾는다.
# 앞 web-dist 커밋을 부모로 이어 붙인다(옛 커밋 다시 배포 · 되돌리기용 기록). 강제로 덮지 않는다: 둘이 겹치면 늦은 쪽이 실패한다
#   (워크플로 concurrency 가 차례로 돌린다). 작업 트리 · 지금 브랜치 · 인덱스는 건드리지 않는다(따로 된 임시 인덱스).
# SYUNG_DIST_BRANCH(기본 web-dist)
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH=${SYUNG_DIST_BRANCH:-web-dist}
[ -f dist/web/index.html ] || { echo "dist/web 이 없음 — npm run build 먼저"; exit 1; }
src=$(git rev-parse --verify HEAD^{commit})
parent=
if git fetch --quiet --depth=1 origin "refs/heads/$BRANCH" 2>/dev/null; then parent=$(git rev-parse FETCH_HEAD); fi
index=$(mktemp)
trap 'rm -f "$index"' EXIT
rm -f "$index"   # 빈 인덱스에서 시작(dist/web 만 담는다)
GIT_INDEX_FILE=$index git --work-tree=dist add --force -- web
tree=$(GIT_INDEX_FILE=$index git write-tree)
commit=$(git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit-tree "$tree" ${parent:+-p "$parent"} -m "web-dist $src")
git push --quiet origin "$commit:refs/heads/$BRANCH"
echo "$BRANCH ${commit:0:12} ← ${src:0:12}"
