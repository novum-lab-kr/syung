#!/usr/bin/env python3
"""Quota-aware proxy for Seoul realtime subway positions — 옛 진입점(subway-live.service 의 ExecStart · 배포 재시작이 이 경로).

이제 server/app.py 의 main() 을 부르는 얇은 껍데기다: 서비스 · 주소 표 · 배경 작업(길찾기 미리 준비 · burst · 버스 수집)은 app 이 조립한다.
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parent.parent)   # python3 server/subway_live_proxy.py 로 띄워도 server 패키지를 찾게
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

if __name__ == "__main__":   # forkserver 가 이 파일을 __mp_main__ 으로 다시 읽어도 서버는 다시 뜨지 않는다
    from server.app import main
    main()
