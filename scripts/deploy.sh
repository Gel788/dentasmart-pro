#!/usr/bin/env bash
# Ships the committed HEAD to the clinic server and restarts only DentaSmart.
# Usage: scripts/deploy.sh            (host and key below; override with DEPLOY_HOST / DEPLOY_KEY)
# Never touches the neighbouring zaven projects; checks them after the restart.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@194.58.126.200}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/dentasmart_deploy}"
REV="$(git rev-parse --short HEAD)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Есть незакоммиченные изменения — выкатывается только закоммиченный HEAD ($REV)." >&2
fi

SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$HOST")
git archive HEAD | "${SSH[@]}" "cat > /tmp/dentasmart-$REV.tar"
"${SSH[@]}" "REV=$REV bash -s" <<'REMOTE'
set -euo pipefail
cd /var/www/dentasmart

echo "== backup"
/usr/local/bin/dentasmart-backup >/dev/null
ls -t /root/dentasmart-backups/*.dump | head -1

echo "== code"
tar -xf "/tmp/dentasmart-$REV.tar" && rm -f "/tmp/dentasmart-$REV.tar"

set -a; . ./.env; set +a

echo "== dependencies"
# The first install after unpacking can purge the workspace node_modules and still report "Done".
for attempt in 1 2 3; do
  CI=true nice pnpm install --frozen-lockfile --config.confirmModulesPurge=false >/tmp/dentasmart-install.log 2>&1 || true
  if [ -x packages/database/node_modules/.bin/prisma ] && [ -d apps/api/node_modules ] && [ -d apps/web/node_modules ]; then
    echo "installed (attempt $attempt)"; break
  fi
  if [ "$attempt" = 3 ]; then tail -20 /tmp/dentasmart-install.log; echo "install failed; nothing restarted" >&2; exit 1; fi
done

echo "== database"
( cd packages/database \
  && pnpm exec prisma generate >/dev/null \
  && pnpm exec prisma db push --skip-generate --accept-data-loss | tail -1 \
  && pnpm exec prisma db execute --file prisma/sql/appointment-overlap.sql --schema prisma/schema.prisma | tail -1 )

echo "== build"
NODE_OPTIONS=--max-old-space-size=1280 nice pnpm build > /tmp/dentasmart-build.log 2>&1 || { tail -40 /tmp/dentasmart-build.log; echo "build failed; nothing restarted" >&2; exit 1; }
grep -E "Tasks:" /tmp/dentasmart-build.log | tail -1

echo "== restart"
pm2 restart dentasmart-api dentasmart-web --update-env >/dev/null
echo "deployed: $REV" > DEPLOYED_REV
sleep 7

echo "== checks"
check() { code=$(curl -s -o /dev/null -w "%{http_code}" "$2"); echo "$1 $code"; [ "$code" = "$3" ] || FAIL=1; }
FAIL=0
check api    http://127.0.0.1:4100/api/v1/health 200
check web    http://127.0.0.1:3100/login 200
check public http://194.58.126.200:8080/login 200
check zaven  http://127.0.0.1/ 307
check wallet http://127.0.0.1/wallet/ 200
[ "$FAIL" = 0 ] || { echo "a check failed" >&2; exit 1; }
echo "ok $REV"
REMOTE
