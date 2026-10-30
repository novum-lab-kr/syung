#!/usr/bin/env bash
# Set the login for the owner-only learning page (https://map.syung.novum-lab.com/admin/learning).
# Usage: set-learning-password.sh <new password> [user]     (user defaults to the current one)
# Stored hashed in /etc/subway-live-auth.json (server/owner_auth.py); changing it logs every
# browser out.
set -euo pipefail
PW="${1:?usage: set-learning-password.sh <new password> [user]}"
[ ${#PW} -ge 8 ] || { echo "비밀번호는 8자 이상으로 해 주세요"; exit 1; }
USER_NAME="${2:-$(python3 -c 'import json;print(json.load(open("/etc/subway-live-auth.json"))["user"])' 2>/dev/null || echo mcsung85)}"
cd "$(dirname "$0")/../server"
python3 owner_auth.py set "$USER_NAME" "$PW" >/dev/null
echo "바꿨어요: 아이디 $USER_NAME (다른 기기는 다시 로그인해야 해요)"
