#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🛑 Убиваем зависшие prisma-процессы..."
pkill -9 -f "prisma/build/index.js" 2>/dev/null || true
pkill -9 -f "schema-engine" 2>/dev/null || true
pkill -9 -f "npm exec prisma" 2>/dev/null || true
sleep 1

echo "🧹 Чистим сломанные engines и generated..."
rm -rf packages/database/src/generated/prisma
rm -rf node_modules/.pnpm/@prisma+engines@*
rm -rf node_modules/.pnpm/prisma@*
rm -rf packages/database/node_modules/.prisma

echo "📦 Переустанавливаем prisma..."
pnpm --filter @dentasmart/database install

echo "🔓 Снимаем macOS quarantine с бинарников..."
xattr -cr node_modules/.pnpm/@prisma+engines@* 2>/dev/null || true
xattr -cr node_modules/.pnpm/prisma@* 2>/dev/null || true

echo "⚙️  Генерируем Prisma Client..."
cd packages/database
node node_modules/prisma/build/index.js generate
cd "$ROOT"

echo "✅ Prisma Client готов: packages/database/src/generated/prisma"
