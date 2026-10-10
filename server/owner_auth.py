"""옛 주인 로그인 모듈 — 이제 비밀번호를 정하는 CLI 껍데기만 남았다.

Set or change it: python3 owner_auth.py set <user> <password>   (deploy/set-learning-password.sh 가 server/ 에서 부른다)
바꾸면 서명 비밀값도 새로 만들어 모든 브라우저가 로그아웃된다.
실제 코드: store/auth_file.py(파일) · services/owner_auth.py(비밀번호 · 서명) · routes/owner.py(/auth · /login · /logout)
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parent.parent)   # cd server; python3 owner_auth.py set … 로 불러도 server 패키지를 찾게
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.services.owner_auth import OwnerAuth  # noqa: E402

if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "set":
        OwnerAuth().set_password(sys.argv[2], sys.argv[3])
        print(f"saved login for {sys.argv[2]} (browsers signed in before must log in again)")
    else:
        sys.exit("usage: owner_auth.py set <user> <password>")
