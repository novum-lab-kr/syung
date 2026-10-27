#!/usr/bin/env bash
# 회원 DB 하루 백업 유닛 설치(2026-10-27 사용자 결정 A). remote_deploy.sh 가 merge 뒤에 부른다 — 따로 된 파일이라 그 배포가 가져온
#   새 내용으로 돈다(remote_deploy.sh 자신은 bash 가 처음 연 옛 내용을 끝까지 돌아, 고친 단계는 다음 배포부터 돈다 — #15 배포에서 겪음).
# 이 둘만 깐다(retrain · healthcheck 등 다른 유닛은 손으로 — 건드리지 않는다).
#   서버 사본과 다르거나 · 타이머가 enabled · active 가 아니거나 · 지난 설치가 끝나지 않았으면(재시도 표시가 남음) 복사 → daemon-reload →
#   enable --now. 재시도 표시는 시작 전에 남기고 두 명령이 다 성공한 뒤에만 지운다(복사만 되고 reload · 시작이 실패해도 다음 배포가 다시 한다).
# 실패하면 0 이 아닌 값으로 끝난다 — 부르는 쪽이 경고만 남기고 배포는 성공으로 둔다.
# 경로(테스트는 임시 폴더로): 클론 안에서 부른다(server/ 기준) · SYUNG_STATE · SYUNG_SYSTEMD_DIR
set -uo pipefail
STATE=${SYUNG_STATE:-/var/lib/subway-live}
DIR=${SYUNG_SYSTEMD_DIR:-/etc/systemd/system}
UNITS=(subway-member-backup.service subway-member-backup.timer)
PENDING=$STATE/backup-units-pending

needed=0
[ -e "$PENDING" ] && needed=1
for unit in "${UNITS[@]}"; do
  cmp -s "server/$unit" "$DIR/$unit" || needed=1
done
systemctl is-enabled --quiet subway-member-backup.timer || needed=1
systemctl is-active --quiet subway-member-backup.timer || needed=1
[ "$needed" = 1 ] || exit 0
touch "$PENDING" || exit 1
for unit in "${UNITS[@]}"; do
  cmp -s "server/$unit" "$DIR/$unit" || install -m 0644 "server/$unit" "$DIR/$unit" || exit 1
done
systemctl daemon-reload || exit 1
systemctl enable --now subway-member-backup.timer || exit 1
rm -f "$PENDING"
echo "회원 DB 백업 타이머 설치 · 켬"
