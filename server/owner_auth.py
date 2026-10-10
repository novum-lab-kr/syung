"""Owner login for private pages (the learning page): a password, then a signed cookie for 30 days.

Caddy asks GET /auth (forward_auth) before serving /learning*: 204 with a valid cookie, else a
redirect to /login.html (a page) or 401 (data). POST /login checks the password and sets the cookie;
POST /logout clears it.
The login lives in AUTH_FILE (root-only): {"user", "salt", "hash", "iterations", "secret"} — the
password as PBKDF2-SHA256; `secret` signs cookies and is renewed with every password change, which
logs every browser out.
Set or change it: python3 owner_auth.py set <user> <password>   (deploy/set-learning-password.sh)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import time
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parent.parent)   # cd server; python3 owner_auth.py set … 로 불러도 server 패키지를 찾게
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.config import AuthConfig  # noqa: E402

AUTH_FILE = AuthConfig.from_env().auth_file
COOKIE = "syung_owner"
MAX_AGE = 30 * 24 * 3600
ITERATIONS = 240_000
TRIES, TRY_WINDOW = 8, 600   # failed logins per address per window

_fails: dict[str, list[float]] = {}
_lock = threading.Lock()


def _load() -> dict | None:
    try:
        return json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _sign(secret: str, payload: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def blocked(address: str) -> bool:
    now = time.time()
    with _lock:
        recent = [t for t in _fails.get(address, []) if now - t < TRY_WINDOW]
        _fails[address] = recent
        return len(recent) >= TRIES


def check_password(user: str, password: str, address: str) -> bool:
    cfg = _load()
    if not cfg or blocked(address):
        return False
    got = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(cfg["salt"]), cfg["iterations"]).hex()
    ok = hmac.compare_digest(user, cfg["user"]) & hmac.compare_digest(got, cfg["hash"])
    if not ok:
        with _lock:
            _fails.setdefault(address, []).append(time.time())
    return bool(ok)


def make_cookie() -> str:
    cfg = _load() or {}
    expires = str(int(time.time()) + MAX_AGE)
    value = f"{cfg['user']}.{expires}.{_sign(cfg['secret'], cfg['user'] + '|' + expires)}"
    return f"{COOKIE}={value}; Max-Age={MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax"


def clear_cookie() -> str:
    return f"{COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"


def valid(cookie_header: str | None) -> bool:
    cfg = _load()
    if not cfg or not cookie_header:
        return False
    for part in cookie_header.split(";"):
        name, _, value = part.strip().partition("=")
        if name != COOKIE:
            continue
        try:
            user, expires, sig = value.rsplit(".", 2)
        except ValueError:
            return False
        return (user == cfg["user"] and expires.isdigit() and int(expires) > time.time()
                and hmac.compare_digest(sig, _sign(cfg["secret"], user + "|" + expires)))
    return False


def safe_next(path: str) -> str:
    """Only back to a private page of this site."""
    return path if path.startswith("/learning") and "//" not in path and "\\" not in path else "/learning"


def set_password(user: str, password: str) -> None:
    salt = secrets.token_bytes(16)
    cfg = {"user": user, "salt": salt.hex(), "iterations": ITERATIONS,
           "hash": hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS).hex(),
           "secret": secrets.token_hex(32)}
    tmp = AUTH_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(AUTH_FILE)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "set":
        set_password(sys.argv[2], sys.argv[3])
        print(f"saved login for {sys.argv[2]} (browsers signed in before must log in again)")
    else:
        sys.exit("usage: owner_auth.py set <user> <password>")
