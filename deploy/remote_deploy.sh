#!/usr/bin/env bash
# Run by GitHub Actions over SSH (forced command for the deploy key). Refuses to deploy over local edits.
# 주의: bash 는 처음 연 이 파일을 끝까지 돈다 — 아래 merge 가 이 파일을 바꿔도 이번 배포는 옛 내용, 고친 것은 다음 배포부터(#15).
#   그 배포에 바로 돌아야 하는 단계는 따로 된 파일로 두고 merge 뒤에 부른다(install_backup_units.sh 처럼).
# 순서: origin/main 커밋 하나를 정해 → 그 커밋을 임시 폴더에 꺼내 테스트 → 통과하면 merge · 정적 릴리스 바꿔 끼우기 →
#   server/ 가 마지막 성공 배포와 달라졌으면 프록시 재시작 → 배포 뒤 확인(실패하면 직전 릴리스로) → 성공 기록 → 회원 DB 백업 유닛 설치(실패해도 경고만) → 오래된 릴리스 정리.
# 테스트가 실패하면 HEAD 도 링크도 안 움직인다. 재시작은 HEAD 가 아니라 마지막 성공 기록(deployed-commit)과 비교해서
#   정한다: 실패한 뒤 재시도나, 옛 방식으로 HEAD 만 앞서 나간 경우에도 재시작을 놓치지 않게(기록이 없으면 한 번 재시작).
# 서버는 클론에서 돈다(2026-10-10 헤르메스 결정 A): 자동 되돌리기는 정적 파일만.
# 경로(테스트는 임시 폴더로): SYUNG_CLONE · SYUNG_STATE · SYUNG_DEPLOY_LOG, deploy.sh · check_site.sh · install_backup_units.sh 의 SYUNG_* 도 그대로 넘어간다.
set -euo pipefail
cd "${SYUNG_CLONE:-/root/syung}"
STATE=${SYUNG_STATE:-/var/lib/subway-live}
RELEASES=${SYUNG_RELEASES:-/var/www/syung-releases}   # deploy.sh 와 같은 기본값
DEPLOYED=$STATE/deployed-commit   # 마지막으로 확인까지 성공한 배포의 커밋
exec > >(tee -a "${SYUNG_DEPLOY_LOG:-/var/log/subway-deploy.log}") 2>&1
mkdir -p "$RELEASES"
exec 8>"$RELEASES/.lock"
flock 8   # 손으로 하는 deploy.sh(되돌리기 등)와도 겹치지 않게 끝까지 쥔다
export SYUNG_DEPLOY_LOCKED=1
echo "=== $(date -Is) deploy requested"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "local uncommitted changes on the server — not deploying"; git status --short; exit 1
fi
git fetch --quiet origin main
target=$(git rev-parse origin/main)   # 테스트 · merge · 릴리스 모두 이 커밋 하나로
deployed=$(cat "$DEPLOYED" 2>/dev/null || true)
echo "HEAD $(git rev-parse HEAD), 마지막 성공 ${deployed:-없음} -> $target"

# 테스트: 새 커밋을 임시 폴더에 꺼내서. 클론에만 있는 git 밖 자료(길찾기 버스 · OSM 원본 캐시)는 링크로 같이 둬서 지금과 같은 테스트를 돈다
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git archive "$target" | tar -x -C "$work"
for f in data/bus.json data/bus-shapes.json data/bus-stop-fix.json data/osm-tracks/line-*.json; do
  if [ -f "$f" ] && [ ! -e "$work/$f" ]; then ln -s "$PWD/$f" "$work/$f"; fi
done
# 배포 장치(deploy/ · 그 시험 · 워크플로)가 마지막 성공 배포와 같으면 배포 장치 시험은 건너뛴다: 대부분의 시간을 쓰고(가짜 배포를 여러 번),
#   느린 서버에서는 시간 검사에 걸려 배포를 막았다(2026-10-11). GitHub Actions 는 늘 모든 시험을 돈다
skip_deploy_tests=0
if [ -n "$deployed" ] && git cat-file -e "$deployed^{commit}" 2>/dev/null \
   && git diff --quiet "$deployed" "$target" -- deploy/ tests/test_deploy_release.py tests/test_deploy_remote.py .github/; then
  skip_deploy_tests=1; echo "배포 장치가 마지막 성공 배포와 같음 — 배포 장치 시험은 건너뜀"
fi
if ! (cd "$work" && node --test tests/*.test.mjs && SYUNG_SKIP_DEPLOY_TESTS=$skip_deploy_tests python3 -m unittest discover -s tests); then
  echo "tests failed — HEAD · 링크 그대로"; exit 1
fi

if ! git merge-base --is-ancestor HEAD "$target"; then   # HEAD 가 앞서 있으면 merge 가 HEAD 를 target 으로 못 옮긴다
  echo "HEAD 가 origin/main 의 조상이 아님 — not deploying"; exit 1
fi
git merge --ff-only --quiet "$target"
deploy/deploy.sh "$target"
publish() {   # 링크를 바꾼 뒤: 필요하면 재시작, 그리고 확인
  if [ -z "$deployed" ] || ! git cat-file -e "$deployed^{commit}" 2>/dev/null || ! git diff --quiet "$deployed" "$target" -- server/; then
    python3 -m py_compile server/subway_live_proxy.py || return 1
    systemctl restart subway-live || return 1
    echo "subway-live restarted"
  fi
  deploy/check_site.sh
}
if ! publish; then
  deploy/deploy.sh --rollback
  echo "check failed — 정적 파일을 직전 릴리스로 되돌림(서버 코드는 그대로, 성공 기록 안 바뀜)"; exit 1
fi
echo "$target" > "$DEPLOYED.new" && mv -T "$DEPLOYED.new" "$DEPLOYED"
# 회원 DB 하루 백업 유닛: 설치는 따로 된 파일이 한다 — merge 뒤에 부르므로 이 배포가 가져온 새 내용으로 돈다(이 파일의 고친 단계는 다음 배포부터).
#   실패해도 배포는 성공(경고만, 다음 배포 때 다시)
if ! deploy/install_backup_units.sh; then
  echo "경고: 회원 DB 백업 유닛 설치 실패 — 배포는 성공, 다음 배포 때 다시 시도"
fi
deploy/deploy.sh --prune
echo "=== deployed $(git log --oneline -1)"
