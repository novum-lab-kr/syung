#!/usr/bin/env bash
# Run by GitHub Actions over SSH (forced command for the deploy key): update to origin/main, test,
# publish, and restart the live proxy only if server/ changed. Refuses to deploy over local edits.
set -euo pipefail
cd /root/subway-live-map
exec > >(tee -a /var/log/subway-deploy.log) 2>&1
echo "=== $(date -Is) deploy requested"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "local uncommitted changes on the server — not deploying"; git status --short; exit 1
fi
before=$(git rev-parse HEAD)
git fetch --quiet origin main
git merge --ff-only --quiet origin/main
after=$(git rev-parse HEAD)
echo "HEAD $before -> $after"
node --test tests/*.test.mjs
deploy/deploy.sh
if ! git diff --quiet "$before" "$after" -- server/; then
  python3 -m py_compile server/subway_live_proxy.py && systemctl restart subway-live && echo "subway-live restarted"
fi
# check through this machine (its own resolver may lag behind public DNS)
curl -fsS -o /dev/null --resolve transit.nol-meok.cloud:443:127.0.0.1 https://transit.nol-meok.cloud/ && echo "site OK" || { echo "site DOWN"; exit 1; }
echo "=== deployed $(git log --oneline -1)"
