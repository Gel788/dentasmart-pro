# Седракович Дент

CRM для стоматологических клиник. Веб-приложение (SPA/PWA) с мультифилиальностью, RBAC и модульной архитектурой.

## Структура

```
apps/
  api/     — NestJS REST API
  web/     — Next.js 15 (интерфейс)
packages/
  database/ — Prisma + PostgreSQL
  shared/   — общие типы и константы
docs/
  ROADMAP.md — этапы разработки по ТЗ
```

## Быстрый старт

### 1. Инфраструктура

```bash
docker compose up -d
cp .env.example .env
cp .env.example packages/database/.env
```

### 2. Зависимости и БД

```bash
pnpm install
pnpm db:push
pnpm db:seed
```

### 3. Запуск

```bash
pnpm dev
```

- **Web:** http://localhost:3000  
- **API:** http://localhost:4000/api/v1  
- **Swagger:** http://localhost:4000/api/docs  

### Демо-доступ

| Поле | Значение |
|------|----------|
| Email | `owner@demo.local` |
| Пароль | `demo12345` |

## Модули (все из ТЗ — каркас + API + UI)

| Модуль | API | UI |
|--------|-----|-----|
| Пациенты, расписание, филиалы | ✅ | ✅ |
| Клиника (планы, зубы, снимки, ИДС) | ✅ | ✅ |
| Финансы (счета, оплаты, прайсы) | ✅ | ✅ |
| Склад и закупки | ✅ | ✅ |
| Зуботехническая лаборатория | ✅ | ✅ |
| Маркетинг и лояльность | ✅ | ✅ |
| Коммуникации и колл-центр | ✅ | ✅ |
| Аналитика и AI-инсайты | ✅ | ✅ |
| Сотрудники, графики, зарплата | ✅ | ✅ |
| Очередь / лист ожидания | ✅ | ✅ |
| Интеграции, webhooks, blockchain-аудит | ✅ | ✅ |
| Виджет онлайн-записи (public API) | ✅ | ✅ |

Внешние интеграции (1С, ЮKassa, ЕГИСЗ, телефония) **не используются** — весь учёт и UI работают внутри системы.

Подробный план — [docs/ROADMAP.md](docs/ROADMAP.md).

### Виджет

```bash
pnpm --filter @dentasmart/widget build
# dist/dentasmart-widget.js → встрой на сайт
```

## Публичное демо

Вход в один клик на `/login` (или сразу `/login?role=owner`, `doctor`, `admin`).

| Роль | Email | Куда попадает |
|------|--------|----------------|
| Владелец | `owner@demo.local` | Дашборд, финансы, персонал |
| Врач | `doctor@demo.local` | Карта пациента и план лечения |
| Ресепшн | `admin@demo.local` | Расписание, запись, касса |

Пароль у всех: `demo12345`.

### Деплой

Сайт собирается на **Vercel**. В настройках проекта корень — `apps/web` (команды в `apps/web/vercel.json`).

API на Vercel не деплоится. Nest слушает порт и ходит в PostgreSQL, поэтому сервис описан в `render.yaml` и поднимается на **Render** (`sedrakovich-dent-api`). Проекты Vercel с API в имени (`dentasmart-pro-api` и похожие) сборку пропускают: `ignoreCommand` в корневом `vercel.json` и в `apps/api/vercel.json` завершается с кодом 0. Проверка на pull request остаётся зелёной, наружу API не выкладывается.

1. PostgreSQL (Neon, Supabase или Render Postgres). Строка `DATABASE_URL`.
2. API: Blueprint Render из `render.yaml`. Вручную те же шаги из корня: `pnpm install`, `pnpm --filter @dentasmart/shared build`, `pnpm --filter @dentasmart/database db:generate`, `pnpm db:push`, `pnpm db:seed`, `pnpm --filter @dentasmart/api build`, старт `pnpm --filter @dentasmart/api start`. Переменные: `DATABASE_URL`, `JWT_SECRET` (длинный), `CORS_ORIGIN=https://<ваш-vercel-домен>`.
3. Vercel, root directory `apps/web`. На сборке задать `NEXT_PUBLIC_API_URL=https://<api>/api/v1` — это значение вшивается в клиент, после смены нужен новый деплой веба.
4. Готовый обзор: `https://<сайт>/login?role=owner`.

Локально по-прежнему `docker compose up -d`, `pnpm db:push`, `pnpm db:seed`, `pnpm dev`.

## Стек

Next.js 15 · NestJS 11 · PostgreSQL · Prisma · TypeScript · Tailwind CSS 4
