#!/usr/bin/env bash
# Set the login for the owner-only learning page (https://syung.nol-meok.cloud/learning).
# Usage: set-learning-password.sh <new password> [user]     (user defaults to the current one)
# Only a bcrypt hash goes into /etc/caddy/Caddyfile; Caddy is validated before it reloads.
set -euo pipefail
PW="${1:?usage: set-learning-password.sh <new password> [user]}"
[ ${#PW} -ge 8 ] || { echo "비밀번호는 8자 이상으로 해 주세요"; exit 1; }
CF=/etc/caddy/Caddyfile
USER_NAME="${2:-$(awk '/@learning/{f=1} f&&/basic_auth/{getline; print $1; exit}' "$CF")}"
HASH=$(caddy hash-password --plaintext "$PW")
BAK="$CF.bak-learning-$(date +%s)"; cp "$CF" "$BAK"
python3 - "$CF" "$USER_NAME" "$HASH" <<'PY'
import re, sys
path, user, h = sys.argv[1:]
s = open(path).read()
block = re.search(r"(handle @learning \{\s*basic_auth \{\s*)(\S+) (\S+)", s)
if not block:
    sys.exit("learning block not found in Caddyfile")
s = s[:block.start(2)] + f"{user} {h}" + s[block.end(3):]
open(path, "w").write(s)
PY
caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1 || { cp "$BAK" "$CF"; echo "설정 검사 실패: 되돌렸어요"; exit 1; }
systemctl reload caddy
echo "바꿨어요: 아이디 $USER_NAME"
