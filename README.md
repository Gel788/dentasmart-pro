# Sedrakoich dent

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

## Стек

Next.js 15 · NestJS 11 · PostgreSQL · Prisma · TypeScript · Tailwind CSS 4
