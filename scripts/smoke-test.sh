#!/usr/bin/env bash
# scripts/smoke-test.sh - Elite Dialer integration smoke test
set -euo pipefail

CLEANUP=0
for arg in "$@"; do
  case "$arg" in
    --cleanup) CLEANUP=1 ;;
  esac
done

BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:-changeme}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { printf "${GREEN}PASS${NC} %s\n" "$1"; }
fail() { printf "${RED}FAIL${NC} %s\n" "$1"; exit 1; }
warn() { printf "${YELLOW}WARN${NC} %s\n" "$1"; }

echo "==> Checking prerequisites"
command -v docker >/dev/null 2>&1 || fail "docker not installed"
command -v curl   >/dev/null 2>&1 || fail "curl not installed"
pass "prereqs present"

echo "==> Starting stack"
docker compose up -d
pass "docker compose up -d"

echo "==> Waiting for backend health (timeout 60s)"
deadline=$(( $(date +%s) + 60 ))
until curl -sf "${BACKEND_URL}/health" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    docker compose logs backend | tail -n 80
    fail "backend did not become healthy in 60s"
  fi
  sleep 2
done
pass "backend /health"

echo "==> POST /api/auth/login"
login_resp=$(curl -s -o /tmp/login.json -w "%{http_code}" -X POST "${BACKEND_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" || echo "000")

if [ "$login_resp" != "200" ]; then
  warn "auth/login returned ${login_resp} (likely CRM not reachable). Using a static JWT if provided."
  if [ -n "${SMOKE_JWT:-}" ]; then
    TOKEN="$SMOKE_JWT"
  else
    fail "no token available. Set SMOKE_JWT or make CRM reachable."
  fi
else
  TOKEN=$(python3 -c "import json,sys;print(json.load(open('/tmp/login.json'))['token'])" 2>/dev/null || \
          node -e "console.log(require('/tmp/login.json').token)")
  pass "login succeeded"
fi

test_get() {
  local path="$1"
  local code
  code=$(curl -s -o /tmp/smoke_body.json -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "${BACKEND_URL}${path}")
  if [ "$code" != "200" ]; then
    cat /tmp/smoke_body.json || true
    fail "GET ${path} expected 200 got ${code}"
  fi
  if ! head -c 1 /tmp/smoke_body.json | grep -qE '\{|\['; then
    fail "GET ${path} did not return JSON"
  fi
  pass "GET ${path}"
}

test_get "/api/campaigns"
test_get "/api/phone-numbers"
test_get "/api/did-groups"

echo "==> Testing Socket.IO handshake"
sio_code=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/socket.io/?EIO=4&transport=polling")
if [ "$sio_code" != "200" ]; then
  fail "Socket.IO handshake expected 200 got ${sio_code}"
fi
pass "Socket.IO handshake"

echo ""
printf "${GREEN}============================${NC}\n"
printf "${GREEN}SMOKE TEST SUCCESS${NC}\n"
printf "${GREEN}============================${NC}\n"

if [ "$CLEANUP" -eq 1 ]; then
  echo "==> Cleanup"
  docker compose down
fi
