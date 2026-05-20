#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🛑 Останавливаем старые процессы..."
lsof -ti :3000,:4000 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -9 -f "prisma/build/index.js" 2>/dev/null || true
pkill -9 -f "npm exec prisma" 2>/dev/null || true
sleep 2

echo "📦 Подготовка (последовательно)..."
rm -rf packages/database/src/generated/prisma
pnpm --filter @dentasmart/shared build
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm --filter @dentasmart/api build

cleanup() {
  echo ""
  echo "🛑 Останавливаем серверы..."
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "🚀 Запуск API + Web в одном терминале..."
echo "   CRM:     http://localhost:3000"
echo "   API:     http://localhost:4000/api/v1"
echo "   Swagger: http://localhost:4000/api/docs"
echo "   Логин:   owner@demo.local / demo12345"
echo "   Ctrl+C — остановить всё"
echo ""

pnpm --filter @dentasmart/api dev &
API_PID=$!

pnpm --filter @dentasmart/web dev &
WEB_PID=$!

wait
