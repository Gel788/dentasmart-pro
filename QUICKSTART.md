# Sedrakoich dent — быстрый старт (5 минут)

## 1. База данных

**Docker:**
```bash
docker compose up -d
```

**Или Homebrew PostgreSQL 14** (без Docker):
```bash
brew services start postgresql@14
# один раз: пользователь и БД
psql postgres -c "CREATE ROLE dentasmart LOGIN PASSWORD 'dentasmart';" 2>/dev/null || true
psql postgres -c "CREATE DATABASE dentasmart OWNER dentasmart;" 2>/dev/null || true
```

**Окружение:**
```bash
cp .env.example .env
cp .env.example packages/database/.env
cp .env.example apps/api/.env
```

**Один скрипт:** `./scripts/start-local.sh` (push + seed)

## 2. Установка и миграция

```bash
pnpm install
pnpm db:push
pnpm db:seed
```

## 3. Запуск

```bash
# API (терминал 1) — важно: не tsx, а nest (DI работает корректно)
cd apps/api && pnpm dev

# Web (терминал 2)
cd apps/web && pnpm dev
```

Или из корня: `pnpm api:dev` + `cd apps/web && pnpm dev`

| Сервис | URL |
|--------|-----|
| **CRM** | http://localhost:3000 |
| **API** | http://localhost:4000/api/v1 |
| **Swagger** | http://localhost:4000/api/docs |

## Вход

- Email: `owner@demo.local`
- Пароль: `demo12345`

## Что проверить за 2 минуты

1. **Дашборд** — KPI
2. **Пациенты** → карточка → зубная формула
3. **Расписание** — сетка + «Подобрать слоты» + напоминания
4. **Финансы** — кассовая смена
5. **Склад** — инвентаризация
6. **Клиника** → план → этапы (↑↓)

Готово к демо. Внешние интеграции не нужны.
