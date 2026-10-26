"""Owner login for private pages (the learning page): a password, then a signed token for 30 days.

The login lives in AUTH_FILE (root-only, store/auth_file.py): the password as PBKDF2-SHA256; `secret`
signs tokens and is renewed with every password change, which logs every browser out.
쿠키 · 리다이렉트 같은 HTTP 모양은 routes/owner.py 가 맡는다.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time

from server.config import AuthConfig
from server.store.auth_file import AuthFile

MAX_AGE = 30 * 24 * 3600
ITERATIONS = 240_000
TRIES, TRY_WINDOW = 8, 600   # failed logins per address per window


def _sign(secret: str, payload: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


class OwnerAuth:
    def __init__(self, config: AuthConfig | None = None):
        self.store = AuthFile((config or AuthConfig.from_env()).auth_file)
        self._fails: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def blocked(self, address: str) -> bool:
        now = time.time()
        with self._lock:
            recent = [t for t in self._fails.get(address, []) if now - t < TRY_WINDOW]
            if recent:
                self._fails[address] = recent
            else:
                self._fails.pop(address, None)   # 틀린 적 없는 주소는 키를 남기지 않는다
            return len(recent) >= TRIES

    def _note_failure(self, address: str) -> None:
        now = time.time()
        with self._lock:
            # 창이 지난 주소는 지운다(주소를 바꿔 가며 틀려도 최근 10분 것만 남는다)
            for old in [key for key, times in self._fails.items() if now - times[-1] >= TRY_WINDOW]:
                del self._fails[old]
            self._fails.setdefault(address, []).append(now)

    def check_password(self, user: str, password: str, address: str) -> bool:
        cfg = self.store.read()
        if not cfg or self.blocked(address):
            return False
        got = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(cfg["salt"]), cfg["iterations"]).hex()
        # bytes 로 비교한다 — str 끼리는 한글 같은 ASCII 밖 글자에서 TypeError(틀린 횟수로도 안 셌다)
        ok = hmac.compare_digest(user.encode(), cfg["user"].encode()) & hmac.compare_digest(got, cfg["hash"])
        if not ok:
            self._note_failure(address)
        return bool(ok)

    def issue_token(self) -> str:
        """user.expires.sig — 쿠키 값."""
        cfg = self.store.read() or {}
        expires = str(int(time.time()) + MAX_AGE)
        return f"{cfg['user']}.{expires}.{_sign(cfg['secret'], cfg['user'] + '|' + expires)}"

    def valid_token(self, value: str | None) -> bool:
        cfg = self.store.read()
        if not cfg or value is None:
            return False
        try:
            user, expires, sig = value.rsplit(".", 2)
        except ValueError:
            return False
        return (user == cfg["user"] and expires.isdigit() and int(expires) > time.time()
                and hmac.compare_digest(sig, _sign(cfg["secret"], user + "|" + expires)))

    def set_password(self, user: str, password: str) -> None:
        salt = secrets.token_bytes(16)
        self.store.write({"user": user, "salt": salt.hex(), "iterations": ITERATIONS,
                          "hash": hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS).hex(),
                          "secret": secrets.token_hex(32)})
