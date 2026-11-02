#!/usr/bin/env python3
"""배포 시험 고르기: 두 커밋 사이에 바뀐 경로로 돌릴 시험을 정한다(표준 라이브러리만).
  select_tests.py [--repo 폴더] 기준커밋 대상커밋         # 고른 결과만 출력(js=0|1 · python=all|web|none — CI 의 GITHUB_OUTPUT 용)
  select_tests.py [--repo 폴더] --run 기준커밋 대상커밋   # 고른 시험을 지금 폴더에서 돌린다(remote_deploy.sh · CI)
쓰는 곳: main 배포(Actions test 잡 · 서버 remote_deploy.sh)만. PR · 넘긴 작업(athena-handoff)의 머지 전 검증은 기준 없이 불러 늘 전부 돈다.
모르면 전부 돈다: 기준이 없거나 · 조상이 아니거나 · 바뀐 것이 없거나(손으로 다시 돌리기) · 표에 없는 경로가 있을 때."""
import argparse
import glob
import os
import re
import subprocess
import sys

# 웹만 바뀌었을 때 도는 Python 시험: web/ 을 읽거나 web/ 에 쓰는 pipeline 을 부르는 것(tests/test_deploy_select.py 가 빠진 것을 잡는다)
WEB_PYTHON_TESTS = ("test_build_stations", "test_platform_fit", "test_viaduct_flags")
PYTHON_ORDER = {"none": 0, "web": 1, "all": 2}
FULL = (True, "all")


def pick_for_path(path):
    """경로 하나에 필요한 시험. 서버 코드(server/ · 서버가 돌리는 pipeline/ · 서버가 읽는 data/)와 배포 장치 · 설정은 표에 넣지 않아 전부 돈다."""
    if path.startswith("docs/") or ("/" not in path and path.endswith(".md")):
        return (False, "none")
    if path.startswith("web/"):
        return (True, "web")
    if path.startswith(("app/", "tools/", ".storybook/")):   # 운영에 안 올라가거나 개발 도구 — 토큰 · 빌드만 JS 쪽 시험이 본다
        return (True, "none")
    if path.startswith("tests/") and "/" not in path[len("tests/"):]:
        if path.endswith(".mjs"):
            return (True, "none")
        if path.endswith(".py"):
            return (False, "all")
    return FULL


def pick_for_paths(paths):
    if not paths:
        return FULL
    picks = [pick_for_path(path) for path in paths]
    return (any(js for js, _ in picks), max((python for _, python in picks), key=PYTHON_ORDER.__getitem__))


def git_ok(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def changed_paths(repo, base, head):
    """바뀐 경로. 믿을 수 없으면 None."""
    if not re.fullmatch(r"[0-9a-f]{40}", base or ""):
        return None
    if not git_ok(repo, "merge-base", "--is-ancestor", base, head):
        return None
    # --no-renames: 옮긴 파일은 옛 자리와 새 자리 둘 다 본다(내용을 받지 않아도 되어 얕은 내려받기에서도 돈다)
    done = subprocess.run(["git", "-C", repo, "diff", "--no-renames", "--name-only", "-z", base, head],
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if done.returncode != 0:
        return None
    return [path for path in done.stdout.decode("utf-8", "surrogateescape").split("\0") if path]


def select(repo, base, head):
    paths = changed_paths(repo, base, head)
    return FULL if paths is None else pick_for_paths(paths)


def run_tests(js, python):
    commands = []
    env = dict(os.environ)
    if js:
        commands.append(["node", "--test", *sorted(glob.glob("tests/*.test.mjs"))])
    if python == "all":
        commands.append([sys.executable, "-m", "unittest", "discover", "-s", "tests"])
    elif python == "web":
        # 시험끼리 이름으로 import 하는 discover 와 같게 tests/ 를 경로에 둔다
        names = [name for name in WEB_PYTHON_TESTS if os.path.exists(f"tests/{name}.py")]
        env["PYTHONPATH"] = "tests"
        if names:
            commands.append([sys.executable, "-m", "unittest", *names])
    for command in commands:
        if subprocess.run(command, env=env).returncode != 0:
            return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="배포 시험 고르기")
    parser.add_argument("--repo", default=".")
    parser.add_argument("--run", action="store_true")
    parser.add_argument("base")
    parser.add_argument("head")
    args = parser.parse_args()
    js, python = select(args.repo, args.base, args.head)
    if args.run:
        print(f"고른 시험: js={int(js)} python={python}", flush=True)
        return run_tests(js, python)
    print(f"js={int(js)}\npython={python}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
