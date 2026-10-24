# Маршрут лечения: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подписанный план лечения сам строит маршрут пациента: визиты, резерв материалов, заказ-наряды и оплату по этапам, с готовностью по четырём осям, одинаково в API-режиме и в браузерном демо.

**Architecture:** Доменная логика маршрута — чистые функции в `packages/shared/src/route/`, покрытые vitest. NestJS (`apps/api`) и демо (`apps/web/src/lib/demo/handle.ts`) только собирают данные и вызывают эти функции. Готовность не хранится, а вычисляется; хранятся резервы (`MaterialReservation`) и связи заказ-наряда с этапом.

**Tech Stack:** pnpm 9 + turbo, NestJS 11, Prisma 6 + PostgreSQL, Next.js 15 (App Router), Tailwind 4, vitest 2, Playwright 1.48, GitHub Actions.

Спецификация: `docs/superpowers/specs/2026-10-19-treatment-route-design.md`.

## Global Constraints

- Каждый защищённый запрос фильтрует данные по `organizationId` текущего пользователя.
- Логика маршрута живёт только в `packages/shared/src/route/`; API и демо её не дублируют.
- Готовность — четыре оси `visit | materials | lab | payment`, значения `ready | waiting | blocked | none`, у каждой текст причины на русском.
- Срок сдачи лаборатории: за 2 рабочих дня до визита (`labDueAt(startsAt, 2)`).
- В меню 5 разделов: Сегодня, Пациенты, Расписание, Снабжение, Деньги; Настройки внизу.
- Контраст текста не ниже 4.5:1; касание не меньше 44 px.
- Интерфейс и тексты ошибок на русском, без извинений, с указанием, что сделать.
- Создание визитов, резервов и заказ-нарядов при подписи плана — в одной транзакции.

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/route/types.ts` | Типы маршрута, осей, этапов, резервов |
| `packages/shared/src/route/dates.ts` | `labDueAt`, рабочие дни |
| `packages/shared/src/route/readiness.ts` | `readiness`, `routeOf` |
| `packages/shared/src/route/reserve.ts` | `reservationsFor` |
| `packages/shared/src/route/index.ts` | Реэкспорт |
| `packages/shared/src/route/*.test.ts` | Тесты ядра |
| `.github/workflows/ci.yml` | Проверки на push и PR |
| `apps/web/src/app/globals.css` | Токены светлой клинической темы |
| `apps/web/src/app/layout.tsx` | Тема без ошибки гидратации |
| `apps/web/src/components/shell.tsx` | Навигация из 5 разделов |
| `apps/web/src/app/supply/page.tsx`, `apps/web/src/app/money/page.tsx` | Входы в разделы Снабжение и Деньги |
| `packages/database/prisma/schema.prisma` | Резервы, строки закупки, связи лаборатории |
| `apps/api/src/route/route-chain.ts` | Резерв и заказ-наряды при подписи (внутри транзакции) |
| `apps/api/src/route/route.service.ts`, `route.controller.ts`, `route.module.ts` | `GET /route/patients/:id` |
| `apps/api/src/domains/workspace.service.ts` | Вызов цепочки в `accept` и `abandon` |
| `apps/api/src/domains/flow.service.ts` | Резерв → `CONSUMED` при закрытии визита |
| `apps/web/src/lib/demo/route.ts` | Маршрут в демо поверх `bag` |
| `apps/web/src/components/route/*.tsx` | `StatusChip`, `ReadinessAxes`, `ChainProgress`, `StageCard`, `RouteView` |
| `apps/web/src/app/patients/[id]/page.tsx` | Вкладка «Маршрут» |
| `apps/web/e2e/route.spec.ts` | e2e главного сценария в демо |

---

# Этап 0. Фундамент

### Task 1: Тесты в shared и срок лаборатории

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/route/types.ts`
- Create: `packages/shared/src/route/dates.ts`
- Create: `packages/shared/src/route/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/route/dates.test.ts`

**Interfaces:**
- Produces: `labDueAt(visitStartsAt: Date, workdays?: number): Date`; все типы из `types.ts`.

- [ ] **Step 1: Подключить vitest и исключить тесты из сборки**

`packages/shared/package.json`:

```json
{
  "name": "@dentasmart/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^2.1.8"
  }
}
```

В `packages/shared/tsconfig.json` добавить `"exclude": ["src/**/*.test.ts"]` рядом с `include`.

Run: `pnpm install`
Expected: `vitest` появился в `packages/shared/node_modules/.bin`.

- [ ] **Step 2: Типы маршрута**

`packages/shared/src/route/types.ts`:

```ts
export type AxisState = 'ready' | 'waiting' | 'blocked' | 'none';

export interface Axis {
  state: AxisState;
  reason: string;
}

export interface Readiness {
  visit: Axis;
  materials: Axis;
  lab: Axis;
  payment: Axis;
}

export type VisitStatus = 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type ReservationStatus = 'RESERVED' | 'SHORT' | 'CONSUMED' | 'RELEASED';
export type LabStatus = 'WAITING_IMPRESSION' | 'RECEIVED' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'REJECTED';

export interface StageInput {
  id: string;
  title: string;
  sortOrder: number;
  healingDays: number;
  teeth: number[];
  price: number;
  paid: number;
  labWork: string | null;
  appointment: { id: string; startsAt: string; status: VisitStatus } | null;
  reservations: { itemName: string; quantity: number; status: ReservationStatus; expectedAt: string | null }[];
  lab: { id: string; status: LabStatus; dueAt: string | null } | null;
}

export type StageStatus = 'done' | 'current' | 'upcoming';

export interface RouteStage extends StageInput {
  status: StageStatus;
  readiness: Readiness;
}

export interface Route {
  stages: RouteStage[];
  currentIndex: number;
  price: number;
  paid: number;
}

export interface PlanItemNeed {
  planItemId: string;
  serviceId: string | null;
}

export interface MaterialNorm {
  serviceId: string;
  itemId: string;
  quantity: number;
}

export interface ReservationDraft {
  planItemId: string;
  itemId: string;
  quantity: number;
  status: 'RESERVED' | 'SHORT';
}
```

- [ ] **Step 3: Написать падающий тест срока лаборатории**

`packages/shared/src/route/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { labDueAt } from './dates';

describe('labDueAt', () => {
  it('отступает два рабочих дня внутри недели', () => {
    expect(labDueAt(new Date('2026-10-21T06:30:00Z')).toISOString()).toBe('2026-10-19T06:30:00.000Z');
  });

  it('перешагивает выходные', () => {
    expect(labDueAt(new Date('2026-10-26T07:00:00Z')).toISOString()).toBe('2026-10-22T07:00:00.000Z');
  });

  it('принимает другое число рабочих дней', () => {
    expect(labDueAt(new Date('2026-10-23T07:00:00Z'), 1).toISOString()).toBe('2026-10-22T07:00:00.000Z');
  });
});
```

- [ ] **Step 4: Убедиться, что тест падает**

Run: `pnpm --filter @dentasmart/shared test`
Expected: FAIL, `Failed to resolve import "./dates"`.

- [ ] **Step 5: Реализация**

`packages/shared/src/route/dates.ts`:

```ts
/** Lab work must be back this many working days before the visit that needs it. */
export function labDueAt(visitStartsAt: Date, workdays = 2): Date {
  const due = new Date(visitStartsAt.getTime());
  let left = workdays;
  while (left > 0) {
    due.setUTCDate(due.getUTCDate() - 1);
    const day = due.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return due;
}
```

`packages/shared/src/route/index.ts`:

```ts
export * from './types';
export * from './dates';
```

`packages/shared/src/index.ts`:

```ts
export * from './constants';
export * from './types';
export * from './route';
```

- [ ] **Step 6: Тесты зелёные, сборка проходит**

Run: `pnpm --filter @dentasmart/shared test && pnpm --filter @dentasmart/shared build`
Expected: `3 passed`, `tsc` без ошибок, в `dist/route/` нет `*.test.js`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "Add the route core to shared with a lab due-date rule."
```

### Task 2: Готовность этапа и маршрут

**Files:**
- Create: `packages/shared/src/route/readiness.ts`
- Modify: `packages/shared/src/route/index.ts`
- Test: `packages/shared/src/route/readiness.test.ts`

**Interfaces:**
- Consumes: `StageInput`, `Readiness`, `Route` (Task 1).
- Produces: `readiness(stage: StageInput): Readiness`; `routeOf(stages: StageInput[]): Route`.

- [ ] **Step 1: Падающие тесты**

`packages/shared/src/route/readiness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readiness, routeOf } from './readiness';
import type { StageInput } from './types';

function stage(over: Partial<StageInput> = {}): StageInput {
  return {
    id: 's1',
    title: 'Имплантация',
    sortOrder: 1,
    healingDays: 0,
    teeth: [36],
    price: 58000,
    paid: 0,
    labWork: null,
    appointment: { id: 'a1', startsAt: '2026-10-22T07:00:00.000Z', status: 'SCHEDULED' },
    reservations: [],
    lab: null,
    ...over,
  };
}

describe('readiness', () => {
  it('без визита этап заблокирован', () => {
    expect(readiness(stage({ appointment: null })).visit).toEqual({ state: 'blocked', reason: 'Визит не назначен' });
  });

  it('неподтверждённый визит ждёт', () => {
    expect(readiness(stage()).visit.state).toBe('waiting');
  });

  it('подтверждённый и проведённый визит готов', () => {
    expect(readiness(stage({ appointment: { id: 'a1', startsAt: '2026-10-22T07:00:00.000Z', status: 'CONFIRMED' } })).visit.state).toBe('ready');
    expect(readiness(stage({ appointment: { id: 'a1', startsAt: '2026-10-22T07:00:00.000Z', status: 'COMPLETED' } })).visit.reason).toBe('Проведён');
  });

  it('материалы: нет резервов — не нужны', () => {
    expect(readiness(stage()).materials.state).toBe('none');
  });

  it('материалы: дефицит с датой поставки ждёт, без даты блокирует', () => {
    const inTransit = stage({ reservations: [{ itemName: 'Формирователь 4.5', quantity: 1, status: 'SHORT', expectedAt: '2026-10-20T00:00:00.000Z' }] });
    expect(readiness(inTransit).materials).toEqual({ state: 'waiting', reason: 'Формирователь 4.5: в пути до 20.10' });
    const missing = stage({ reservations: [{ itemName: 'Мембрана Bio-Gide', quantity: 1, status: 'SHORT', expectedAt: null }] });
    expect(readiness(missing).materials).toEqual({ state: 'blocked', reason: 'Мембрана Bio-Gide: нет на складе' });
  });

  it('материалы: всё в резерве готово, всё списано готово', () => {
    expect(readiness(stage({ reservations: [{ itemName: 'Имплант', quantity: 1, status: 'RESERVED', expectedAt: null }] })).materials.reason).toBe('В резерве');
    expect(readiness(stage({ reservations: [{ itemName: 'Имплант', quantity: 1, status: 'CONSUMED', expectedAt: null }] })).materials.reason).toBe('Списаны');
  });

  it('лаборатория: опаздывающий заказ блокирует визит', () => {
    const late = stage({ lab: { id: 'l1', status: 'IN_PROGRESS', dueAt: '2026-10-23T15:00:00.000Z' } });
    expect(readiness(late).lab).toEqual({ state: 'blocked', reason: 'Не успевает к визиту' });
  });

  it('лаборатория: готовый заказ готов, ожидающий слепка ждёт', () => {
    expect(readiness(stage({ lab: { id: 'l1', status: 'READY', dueAt: null } })).lab.state).toBe('ready');
    expect(readiness(stage({ lab: { id: 'l1', status: 'WAITING_IMPRESSION', dueAt: null } })).lab).toEqual({ state: 'waiting', reason: 'Ждёт слепок' });
  });

  it('оплата: остаток к визиту', () => {
    expect(readiness(stage({ paid: 8000 })).payment).toEqual({ state: 'waiting', reason: '50 000 ₽ к визиту' });
    expect(readiness(stage({ paid: 58000 })).payment.state).toBe('ready');
    expect(readiness(stage({ price: 0 })).payment.state).toBe('none');
  });
});

describe('routeOf', () => {
  it('сортирует этапы, отмечает проведённые и текущий, считает деньги', () => {
    const route = routeOf([
      stage({ id: 's2', sortOrder: 2, price: 67200, paid: 0, appointment: null }),
      stage({ id: 's1', sortOrder: 1, price: 11000, paid: 11000, appointment: { id: 'a0', startsAt: '2026-10-14T07:00:00.000Z', status: 'COMPLETED' } }),
    ]);
    expect(route.stages.map((item) => [item.id, item.status])).toEqual([['s1', 'done'], ['s2', 'current']]);
    expect(route.currentIndex).toBe(1);
    expect(route.price).toBe(78200);
    expect(route.paid).toBe(11000);
  });

  it('когда всё проведено, текущего этапа нет', () => {
    const route = routeOf([stage({ appointment: { id: 'a0', startsAt: '2026-10-14T07:00:00.000Z', status: 'COMPLETED' } })]);
    expect(route.currentIndex).toBe(-1);
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `pnpm --filter @dentasmart/shared test`
Expected: FAIL, `Failed to resolve import "./readiness"`.

- [ ] **Step 3: Реализация**

`packages/shared/src/route/readiness.ts`:

```ts
import type { Axis, Readiness, Route, RouteStage, StageInput } from './types';

const rub = (value: number) => `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;
const dayMonth = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

function visitAxis(stage: StageInput): Axis {
  const visit = stage.appointment;
  if (!visit || visit.status === 'CANCELLED' || visit.status === 'NO_SHOW') return { state: 'blocked', reason: 'Визит не назначен' };
  if (visit.status === 'COMPLETED') return { state: 'ready', reason: 'Проведён' };
  if (visit.status === 'CONFIRMED' || visit.status === 'IN_PROGRESS') return { state: 'ready', reason: 'Подтверждён' };
  return { state: 'waiting', reason: 'Не подтверждён' };
}

function materialsAxis(stage: StageInput): Axis {
  const active = stage.reservations.filter((row) => row.status !== 'RELEASED');
  if (!active.length) return { state: 'none', reason: 'Не нужны' };
  if (active.every((row) => row.status === 'CONSUMED')) return { state: 'ready', reason: 'Списаны' };
  const missing = active.find((row) => row.status === 'SHORT' && !row.expectedAt);
  if (missing) return { state: 'blocked', reason: `${missing.itemName}: нет на складе` };
  const coming = active.find((row) => row.status === 'SHORT');
  if (coming) return { state: 'waiting', reason: `${coming.itemName}: в пути до ${dayMonth(coming.expectedAt as string)}` };
  return { state: 'ready', reason: 'В резерве' };
}

function labAxis(stage: StageInput): Axis {
  const lab = stage.lab;
  if (!lab) return { state: 'none', reason: 'Не нужна' };
  if (lab.status === 'READY' || lab.status === 'DELIVERED') return { state: 'ready', reason: 'Готово' };
  if (lab.status === 'REJECTED') return { state: 'blocked', reason: 'Работа отклонена' };
  const visit = stage.appointment;
  if (lab.dueAt && visit && Date.parse(lab.dueAt) > Date.parse(visit.startsAt)) return { state: 'blocked', reason: 'Не успевает к визиту' };
  if (lab.status === 'WAITING_IMPRESSION') return { state: 'waiting', reason: 'Ждёт слепок' };
  return { state: 'waiting', reason: lab.dueAt ? `В работе до ${dayMonth(lab.dueAt)}` : 'В работе' };
}

function paymentAxis(stage: StageInput): Axis {
  if (stage.price <= 0) return { state: 'none', reason: 'Без оплаты' };
  const left = stage.price - stage.paid;
  if (left <= 0) return { state: 'ready', reason: 'Оплачено' };
  return { state: 'waiting', reason: `${rub(left)} к визиту` };
}

export function readiness(stage: StageInput): Readiness {
  return { visit: visitAxis(stage), materials: materialsAxis(stage), lab: labAxis(stage), payment: paymentAxis(stage) };
}

export function routeOf(stages: StageInput[]): Route {
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = sorted.findIndex((stage) => stage.appointment?.status !== 'COMPLETED');
  const built: RouteStage[] = sorted.map((stage, index) => ({
    ...stage,
    status: stage.appointment?.status === 'COMPLETED' ? 'done' : index === currentIndex ? 'current' : 'upcoming',
    readiness: readiness(stage),
  }));
  return {
    stages: built,
    currentIndex,
    price: sorted.reduce((sum, stage) => sum + stage.price, 0),
    paid: sorted.reduce((sum, stage) => sum + stage.paid, 0),
  };
}
```

В `packages/shared/src/route/index.ts` добавить строку `export * from './readiness';`.

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @dentasmart/shared test`
Expected: все тесты `dates` и `readiness` PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/route
git commit -m "Compute stage readiness on four axes and build the route."
```

### Task 3: Резерв материалов по нормам

**Files:**
- Create: `packages/shared/src/route/reserve.ts`
- Modify: `packages/shared/src/route/index.ts`
- Test: `packages/shared/src/route/reserve.test.ts`

**Interfaces:**
- Consumes: `PlanItemNeed`, `MaterialNorm`, `ReservationDraft` (Task 1).
- Produces: `reservationsFor(items: PlanItemNeed[], norms: MaterialNorm[], available: Map<string, number>): ReservationDraft[]`. `available` — остаток на складе филиала минус активные резервы; функция его не мутирует.

- [ ] **Step 1: Падающие тесты**

`packages/shared/src/route/reserve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { reservationsFor } from './reserve';

const norms = [
  { serviceId: 'implant', itemId: 'fixture', quantity: 1 },
  { serviceId: 'implant', itemId: 'healing-cap', quantity: 1 },
  { serviceId: 'filling', itemId: 'composite', quantity: 0.5 },
];

describe('reservationsFor', () => {
  it('резервирует по нормам услуги', () => {
    const rows = reservationsFor([{ planItemId: 'p1', serviceId: 'implant' }], norms, new Map([['fixture', 5], ['healing-cap', 2]]));
    expect(rows).toEqual([
      { planItemId: 'p1', itemId: 'fixture', quantity: 1, status: 'RESERVED' },
      { planItemId: 'p1', itemId: 'healing-cap', quantity: 1, status: 'RESERVED' },
    ]);
  });

  it('отмечает дефицит и делит частичный остаток', () => {
    const rows = reservationsFor(
      [{ planItemId: 'p1', serviceId: 'filling' }, { planItemId: 'p2', serviceId: 'filling' }, { planItemId: 'p3', serviceId: 'filling' }],
      norms,
      new Map([['composite', 1.2]]),
    );
    expect(rows).toEqual([
      { planItemId: 'p1', itemId: 'composite', quantity: 0.5, status: 'RESERVED' },
      { planItemId: 'p2', itemId: 'composite', quantity: 0.5, status: 'RESERVED' },
      { planItemId: 'p3', itemId: 'composite', quantity: 0.2, status: 'RESERVED' },
      { planItemId: 'p3', itemId: 'composite', quantity: 0.3, status: 'SHORT' },
    ]);
  });

  it('пропускает строки без услуги и не меняет переданный остаток', () => {
    const available = new Map([['fixture', 0]]);
    const rows = reservationsFor([{ planItemId: 'p1', serviceId: null }, { planItemId: 'p2', serviceId: 'implant' }], norms, available);
    expect(rows.every((row) => row.status === 'SHORT')).toBe(true);
    expect(available.get('fixture')).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `pnpm --filter @dentasmart/shared test`
Expected: FAIL, `Failed to resolve import "./reserve"`.

- [ ] **Step 3: Реализация**

`packages/shared/src/route/reserve.ts`:

```ts
import type { MaterialNorm, PlanItemNeed, ReservationDraft } from './types';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Splits each plan line's material norm into what the shelf covers now and what is short. */
export function reservationsFor(items: PlanItemNeed[], norms: MaterialNorm[], available: Map<string, number>): ReservationDraft[] {
  const left = new Map(available);
  const rows: ReservationDraft[] = [];
  for (const item of items) {
    if (!item.serviceId) continue;
    for (const norm of norms.filter((row) => row.serviceId === item.serviceId)) {
      const onShelf = Math.max(0, left.get(norm.itemId) ?? 0);
      const covered = round3(Math.min(onShelf, norm.quantity));
      const short = round3(norm.quantity - covered);
      if (covered > 0) rows.push({ planItemId: item.planItemId, itemId: norm.itemId, quantity: covered, status: 'RESERVED' });
      if (short > 0) rows.push({ planItemId: item.planItemId, itemId: norm.itemId, quantity: short, status: 'SHORT' });
      left.set(norm.itemId, round3(onShelf - covered));
    }
  }
  return rows;
}
```

В `index.ts` добавить `export * from './reserve';`.

- [ ] **Step 4: Тесты зелёные**

Run: `pnpm --filter @dentasmart/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/route
git commit -m "Reserve materials from service norms and mark shortages."
```

### Task 4: CI на GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @dentasmart/shared build
      - run: pnpm --filter @dentasmart/database db:generate
      - run: pnpm --filter @dentasmart/shared test
      - run: pnpm --filter @dentasmart/web test:import
      - run: pnpm --filter @dentasmart/api exec tsc --noEmit -p .
      - run: pnpm --filter @dentasmart/web exec tsc --noEmit -p .
      - run: pnpm --filter @dentasmart/api build
      - run: pnpm --filter @dentasmart/web build
        env:
          NEXT_TELEMETRY_DISABLED: '1'
```

- [ ] **Step 2: Прогнать те же команды локально**

Run: каждую команду `run:` по очереди из корня.
Expected: все завершаются с кодом 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Run types, tests and both builds on every push and pull request."
```

### Task 5: Светлая клиническая тема и гидратация

**Files:**
- Modify: `apps/web/src/app/globals.css:5-70`
- Modify: `apps/web/src/app/layout.tsx:24`

- [ ] **Step 1: Новые значения токенов (имена не меняются, меняются значения)**

В блоке `:root` заменить значения:

```css
  --bg: #eef2f1;
  --surface: #ffffff;
  --surface-solid: #ffffff;
  --surface-2: #f6f9f8;
  --nav: #ffffff;
  --border: #dce3e1;
  --border-strong: #c5d0cd;
  --text: #10201f;
  --text-secondary: #3b4a48;
  --muted: #52625f;
  --accent: #0b6e66;
  --accent-2: #9fd8cf;
  --accent-hover: #08534d;
  --accent-soft: #e1efec;
  --accent-ink: #08534d;
  --danger: #9b1c12;
  --danger-soft: #fde8e6;
  --warning: #8a3f06;
  --warning-soft: #fbe7cf;
  --info: #1f4e8c;
  --info-soft: #e4edf8;
  --ok: #1b6b3e;
  --ok-soft: #e3f3ea;
```

В `html.dark` добавить `--ok: #86efac; --ok-soft: rgba(134, 239, 172, 0.14);`. Шрифты: подключить Golos Text, Unbounded и IBM Plex Mono через `next/font/google` в `layout.tsx` и выставить `--font-body`, `--font-display`, `--font-mono`.

- [ ] **Step 2: Убрать ошибку гидратации**

В `apps/web/src/app/layout.tsx` у `<html lang="ru" className={inter.variable}>` добавить `suppressHydrationWarning`: класс `dark` и `data-density` ставит скрипт до гидратации, это ожидаемо.

- [ ] **Step 3: Проверить**

Run: `pnpm --filter @dentasmart/web dev`, открыть `/login?role=owner`, затем `/`.
Expected: светлая тема, в консоли нет `hydrated but some attributes`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "Switch to the light clinical palette and stop the theme hydration warning."
```

### Task 6: Навигация из пяти разделов

**Files:**
- Modify: `apps/web/src/components/shell.tsx:13-36`
- Create: `apps/web/src/app/supply/page.tsx`
- Create: `apps/web/src/app/money/page.tsx`

- [ ] **Step 1: Новые списки**

```tsx
const PRIMARY = [
  { href: '/', label: 'Сегодня', icon: Calendar, perm: 'patient.read' },
  { href: '/patients', label: 'Пациенты', icon: Users, perm: 'patient.read' },
  { href: '/schedule', label: 'Расписание', icon: CalendarRange, perm: 'schedule.read' },
  { href: '/supply', label: 'Снабжение', icon: Package, perm: 'warehouse.read' },
  { href: '/money', label: 'Деньги', icon: Wallet, perm: 'finance.read' },
];

const MORE = [
  { href: '/price', label: 'Прайс', icon: Tags, perm: 'patient.read' },
  { href: '/leads', label: 'Заявки', icon: PhoneIncoming, perm: 'patient.read' },
  { href: '/kpis', label: 'Врачи', icon: Trophy, perm: 'patient.read' },
  { href: '/radar', label: 'Радар денег', icon: Radar, perm: 'finance.read' },
  { href: '/return', label: 'Возврат пациентов', icon: RotateCcw, perm: 'medical.read' },
  { href: '/check-in', label: 'QR стойки', icon: QrCode, perm: 'schedule.read' },
  { href: '/import', label: 'Переезд', icon: Upload, perm: 'patient.write' },
  { href: '/settings', label: 'Настройки', icon: Settings, perm: 'org.manage' },
];
```

Импортировать `Package` и `Wallet` из `lucide-react`; удалить из импорта иконки, которые больше не используются. Ссылка «Настройки» рендерится внизу меню (вынести из `more` в отдельный блок над профилем). Пункты `/briefing`, `/pulse`, `/autopilot`, `/quality`, `/insurance`, `/portal`, `/onboarding`, `/lab` уходят из меню, но остаются доступны по адресу и через ⌘K.

- [ ] **Step 2: Входы в разделы**

`apps/web/src/app/supply/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Protected } from '@/components/protected';
import { PageHeader } from '@/components/ui/page-header';

const PARTS = [
  { href: '/warehouse', title: 'Склад', text: 'Остатки, партии, сроки годности' },
  { href: '/lab', title: 'Лаборатория', text: 'Заказ-наряды и сроки сдачи' },
  { href: '/sterilization', title: 'Стерилизация', text: 'Журнал циклов' },
];

export default function SupplyPage() {
  return (
    <Protected>
      <PageHeader badge="Снабжение" title="Снабжение" description="Всё, что нужно к визитам" />
      <div className="grid gap-3 sm:grid-cols-3">
        {PARTS.map((part) => (
          <Link key={part.href} href={part.href} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)]">
            <div className="font-semibold">{part.title}</div>
            <div className="text-sm text-[var(--muted)]">{part.text}</div>
          </Link>
        ))}
      </div>
    </Protected>
  );
}
```

`apps/web/src/app/money/page.tsx` — тот же шаблон с `PARTS`: `/finance` «Касса и счета», `/radar` «Незакрытые планы и долги», `/employees` «Зарплата».

- [ ] **Step 3: Проверить**

Run: `pnpm --filter @dentasmart/web exec tsc --noEmit -p .`, затем открыть демо.
Expected: тип-проверка без ошибок; в меню 5 разделов и «Ещё 7», «Настройки» внизу; `/supply` и `/money` открываются.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/shell.tsx apps/web/src/app/supply apps/web/src/app/money
git commit -m "Cut the menu to five sections with Supply and Money hubs."
```

---

# Этап 1. Маршрут лечения

### Task 7: Модель данных цепочки

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Interfaces:**
- Produces: модели `MaterialReservation`, `PurchaseOrderLine`; поля `PlanPhase.labWork`, `LabOrder.planPhaseId`, `LabOrder.appointmentId`, `PurchaseOrder.expectedAt`, `PurchaseOrder.branchId`, `Patient.routeToken`, `Patient.routeTokenExpiresAt`; значение `LabOrderStatus.WAITING_IMPRESSION`.

- [ ] **Step 1: Изменения схемы**

```prisma
enum ReservationStatus {
  RESERVED
  SHORT
  CONSUMED
  RELEASED
}

model MaterialReservation {
  id             String            @id @default(cuid())
  organizationId String
  planItemId     String
  appointmentId  String?
  itemId         String
  branchId       String
  quantity       Decimal           @db.Decimal(12, 3)
  status         ReservationStatus @default(RESERVED)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  planItem     TreatmentPlanItem @relation(fields: [planItemId], references: [id], onDelete: Cascade)
  appointment  Appointment?      @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  item         InventoryItem     @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@index([organizationId, status])
  @@index([appointmentId])
  @@index([itemId, branchId, status])
  @@map("material_reservations")
}

model PurchaseOrderLine {
  id              String        @id @default(cuid())
  purchaseOrderId String
  itemId          String
  quantity        Decimal       @db.Decimal(12, 3)
  unitPrice       Decimal       @default(0) @db.Decimal(12, 2)
  reason          String        @default("SHORTAGE")

  purchaseOrder PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  item          InventoryItem @relation(fields: [itemId], references: [id])

  @@map("purchase_order_lines")
}
```

Добавить обратные связи: `reservations MaterialReservation[]` в `Organization`, `TreatmentPlanItem`, `Appointment`, `InventoryItem`; `purchaseLines PurchaseOrderLine[]` в `InventoryItem`; `lines PurchaseOrderLine[]`, `expectedAt DateTime?`, `branchId String?` в `PurchaseOrder`; `labWork String?` в `PlanPhase`; `planPhaseId String?`, `appointmentId String?` и `@@index([planPhaseId])` в `LabOrder`; `routeToken String? @unique`, `routeTokenExpiresAt DateTime?` в `Patient`; `WAITING_IMPRESSION` первым значением `LabOrderStatus`.

- [ ] **Step 2: Применить к временной базе и сгенерировать клиент**

Run: `pnpm --filter @dentasmart/database db:push && pnpm --filter @dentasmart/database db:generate && pnpm db:seed`
Expected: `Your database is now in sync`, сид проходит.

- [ ] **Step 3: Типы API не сломались**

Run: `pnpm --filter @dentasmart/api exec tsc --noEmit -p .`
Expected: без ошибок. Если `lab` UI использует `switch` по статусам, добавить подпись `WAITING_IMPRESSION: 'Ждёт слепок'` в карту статусов `apps/web/src/app/lab/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma apps/web/src/app/lab/page.tsx
git commit -m "Store material reservations, purchase lines and lab links to plan stages."
```

### Task 8: Резерв и заказ-наряды при подписи плана

**Files:**
- Create: `apps/api/src/route/route-chain.ts`
- Modify: `apps/api/src/domains/workspace.service.ts` (`accept`, сразу после цикла создания визитов, внутри `$transaction`; `abandon`)
- Test: `apps/api/test/route-chain.int.ts`

**Interfaces:**
- Consumes: `reservationsFor`, `labDueAt` из `@dentasmart/shared`.
- Produces: `reserveForPlan(tx, { organizationId, branchId, planId }): Promise<{ reserved: number; short: number }>`; `openLabOrders(tx, { organizationId, planId, patientId, doctorId }): Promise<number>`; `releaseForPlan(tx, planId): Promise<void>`.

- [ ] **Step 1: Модуль цепочки**

`apps/api/src/route/route-chain.ts`:

```ts
import { Prisma } from '@dentasmart/database';
import { labDueAt, reservationsFor } from '@dentasmart/shared';

type Tx = Prisma.TransactionClient;

export async function reserveForPlan(tx: Tx, input: { organizationId: string; branchId: string; planId: string }) {
  const items = await tx.treatmentPlanItem.findMany({
    where: { planId: input.planId, status: 'ACCEPTED' },
    select: { id: true, serviceId: true, appointmentId: true },
  });
  const serviceIds = [...new Set(items.map((item) => item.serviceId).filter((id): id is string => Boolean(id)))];
  if (!serviceIds.length) return { reserved: 0, short: 0 };
  const norms = await tx.serviceMaterialNorm.findMany({
    where: { organizationId: input.organizationId, serviceId: { in: serviceIds } },
    select: { serviceId: true, itemId: true, quantity: true },
  });
  const itemIds = [...new Set(norms.map((norm) => norm.itemId))];
  const stock = await tx.stockBatch.groupBy({
    by: ['itemId'],
    where: { itemId: { in: itemIds }, branchId: input.branchId },
    _sum: { quantity: true },
  });
  const held = await tx.materialReservation.groupBy({
    by: ['itemId'],
    where: { itemId: { in: itemIds }, branchId: input.branchId, status: 'RESERVED' },
    _sum: { quantity: true },
  });
  const available = new Map<string, number>();
  for (const row of stock) available.set(row.itemId, Number(row._sum.quantity ?? 0));
  for (const row of held) available.set(row.itemId, (available.get(row.itemId) ?? 0) - Number(row._sum.quantity ?? 0));

  const drafts = reservationsFor(
    items.map((item) => ({ planItemId: item.id, serviceId: item.serviceId })),
    norms.map((norm) => ({ serviceId: norm.serviceId, itemId: norm.itemId, quantity: Number(norm.quantity) })),
    available,
  );
  const appointmentOf = new Map(items.map((item) => [item.id, item.appointmentId]));
  if (drafts.length) {
    await tx.materialReservation.createMany({
      data: drafts.map((draft) => ({
        organizationId: input.organizationId,
        planItemId: draft.planItemId,
        appointmentId: appointmentOf.get(draft.planItemId) ?? null,
        itemId: draft.itemId,
        branchId: input.branchId,
        quantity: draft.quantity,
        status: draft.status,
      })),
    });
  }
  return {
    reserved: drafts.filter((draft) => draft.status === 'RESERVED').length,
    short: drafts.filter((draft) => draft.status === 'SHORT').length,
  };
}

export async function openLabOrders(tx: Tx, input: { organizationId: string; planId: string; patientId: string; doctorId: string | null }) {
  const phases = await tx.planPhase.findMany({
    where: { planId: input.planId, labWork: { not: null } },
    include: { items: { where: { appointmentId: { not: null } }, select: { appointment: { select: { id: true, startsAt: true } } }, take: 1 } },
  });
  let opened = 0;
  for (const phase of phases) {
    const visit = phase.items[0]?.appointment ?? null;
    await tx.labOrder.create({
      data: {
        organizationId: input.organizationId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        title: phase.labWork as string,
        status: 'WAITING_IMPRESSION',
        planPhaseId: phase.id,
        appointmentId: visit?.id ?? null,
        dueAt: visit ? labDueAt(visit.startsAt) : null,
      },
    });
    opened += 1;
  }
  return opened;
}

export async function releaseForPlan(tx: Tx, planId: string) {
  await tx.materialReservation.updateMany({
    where: { planItem: { planId }, status: { in: ['RESERVED', 'SHORT'] } },
    data: { status: 'RELEASED' },
  });
  await tx.labOrder.updateMany({
    where: { planPhase: { planId }, status: 'WAITING_IMPRESSION' },
    data: { status: 'REJECTED' },
  });
}
```

Для `labOrder.planPhase` в последнем запросе нужна связь: в Task 7 у `LabOrder` объявить `planPhase PlanPhase? @relation(fields: [planPhaseId], references: [id], onDelete: SetNull)` и `labOrders LabOrder[]` в `PlanPhase`.

- [ ] **Step 2: Вызов из `accept`**

В `workspace.service.ts`, внутри `await this.prisma.$transaction(async (tx) => { … })` после цикла `for (const phase of phases)` и до `const number = …`:

```ts
      chain = await reserveForPlan(tx, { organizationId: orgId, branchId: branch.id, planId: plan.id });
      await openLabOrders(tx, { organizationId: orgId, planId: plan.id, patientId: plan.patientId, doctorId });
```

Перед транзакцией объявить `let chain = { reserved: 0, short: 0 };`, в ответ `accept` добавить `materials: chain`. Импорт: `import { openLabOrders, releaseForPlan, reserveForPlan } from '../route/route-chain';`. В `abandon` внутри его обновления плана вызвать `await releaseForPlan(tx, planId)` (обернуть существующее обновление в `$transaction`, если его там нет).

- [ ] **Step 3: Интеграционный тест на временной базе**

`apps/api/test/route-chain.int.ts`:

```ts
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { reserveForPlan, openLabOrders } from '../src/route/route-chain';

const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.treatmentPlan.findFirstOrThrow({
    where: { items: { some: { serviceId: { not: null } } } },
    include: { items: true, patient: true },
  });
  const branch = await prisma.branch.findFirstOrThrow({ where: { organizationId: plan.organizationId } });
  const service = plan.items.find((item) => item.serviceId)!.serviceId!;
  const item = await prisma.inventoryItem.findFirstOrThrow({ where: { organizationId: plan.organizationId } });
  await prisma.serviceMaterialNorm.upsert({
    where: { serviceId_itemId: { serviceId: service, itemId: item.id } },
    create: { organizationId: plan.organizationId, serviceId: service, itemId: item.id, quantity: 1 },
    update: { quantity: 1 },
  });
  await prisma.treatmentPlanItem.updateMany({ where: { planId: plan.id }, data: { status: 'ACCEPTED' } });
  const phase = await prisma.planPhase.findFirst({ where: { planId: plan.id } });
  if (phase) await prisma.planPhase.update({ where: { id: phase.id }, data: { labWork: 'Коронка цирконий' } });

  const result = await prisma.$transaction(async (tx) => {
    const reserved = await reserveForPlan(tx, { organizationId: plan.organizationId, branchId: branch.id, planId: plan.id });
    const labs = await openLabOrders(tx, { organizationId: plan.organizationId, planId: plan.id, patientId: plan.patientId, doctorId: plan.doctorId });
    return { ...reserved, labs };
  });

  assert.ok(result.reserved + result.short > 0, 'резерв создан');
  const rows = await prisma.materialReservation.findMany({ where: { planItem: { planId: plan.id } } });
  assert.ok(rows.every((row) => row.organizationId === plan.organizationId), 'резерв в своей клинике');
  if (phase) assert.equal(result.labs, 1, 'заказ-наряд открыт');
  console.log('route-chain ok', result);
}

main().finally(() => prisma.$disconnect());
```

В `apps/api/package.json` добавить скрипт `"test:int": "tsx test/route-chain.int.ts"`.

Run: `DATABASE_URL=<временная база> pnpm --filter @dentasmart/api test:int`
Expected: `route-chain ok { reserved: …, short: …, labs: 1 }`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/route/route-chain.ts apps/api/src/domains/workspace.service.ts apps/api/test apps/api/package.json
git commit -m "Reserve materials and open lab orders in the same transaction that signs the plan."
```

### Task 9: Закрытие визита и перенос

**Files:**
- Modify: `apps/api/src/domains/flow.service.ts` (`complete`, после `appointment.update`)
- Modify: `apps/api/src/appointments/appointments.service.ts` (метод переноса времени визита)

**Interfaces:**
- Consumes: `labDueAt`.

- [ ] **Step 1: Резерв списан при закрытии**

В `complete` после `await this.prisma.appointment.update({ where: { id }, data: { status: 'COMPLETED' } });`:

```ts
    // Stock leaves the shelf through the visit kit (kits.service); the reservation only records that it was used.
    await this.prisma.materialReservation.updateMany({
      where: { organizationId: orgId, appointmentId: id, status: { in: ['RESERVED', 'SHORT'] } },
      data: { status: 'CONSUMED' },
    });
```

- [ ] **Step 2: Перенос пересчитывает срок лаборатории**

В методе, который меняет `startsAt` визита, после обновления:

```ts
    await this.prisma.labOrder.updateMany({
      where: { organizationId: orgId, appointmentId: id, status: { in: ['WAITING_IMPRESSION', 'RECEIVED', 'IN_PROGRESS'] } },
      data: { dueAt: labDueAt(new Date(startsAt)) },
    });
```

- [ ] **Step 3: Проверить**

Run: `pnpm --filter @dentasmart/api exec tsc --noEmit -p .` и ручной сценарий на временной базе: подписать план, закрыть визит, `select status from material_reservations where "appointmentId" = '<id>'`.
Expected: `CONSUMED`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/domains/flow.service.ts apps/api/src/appointments/appointments.service.ts
git commit -m "Mark reservations used when a visit closes and move lab deadlines with the visit."
```

### Task 10: `GET /route/patients/:id`

**Files:**
- Create: `apps/api/src/route/route.service.ts`
- Create: `apps/api/src/route/route.controller.ts`
- Create: `apps/api/src/route/route.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `routeOf`, `StageInput`.
- Produces: `GET /api/v1/route/patients/:patientId` → `{ planId: string; title: string; signedAt: string | null; route: Route } | null`.

- [ ] **Step 1: Сервис**

`apps/api/src/route/route.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { routeOf, type StageInput } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RouteService {
  constructor(private readonly prisma: PrismaService) {}

  async forPatient(orgId: string, patientId: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { organizationId: orgId, patientId, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] } },
      orderBy: { acceptedAt: 'desc' },
      include: {
        phases: {
          orderBy: { sortOrder: 'asc' },
          include: {
            labOrders: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, dueAt: true } },
            items: {
              where: { status: { not: 'REJECTED' } },
              include: {
                appointment: { select: { id: true, startsAt: true, status: true } },
                reservations: { include: { item: { select: { name: true } } } },
              },
            },
          },
        },
        invoices: { select: { paidAmount: true, totalAmount: true } },
      },
    });
    if (!plan) return null;
    const paidTotal = plan.invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount), 0);
    let paidLeft = paidTotal;
    const stages: StageInput[] = plan.phases.map((phase) => {
      const price = phase.items.reduce((sum, item) => sum + Number(item.price), 0);
      const paid = Math.min(price, Math.max(0, paidLeft));
      paidLeft -= paid;
      const visit = phase.items.find((item) => item.appointment)?.appointment ?? null;
      return {
        id: phase.id,
        title: phase.title,
        sortOrder: phase.sortOrder,
        healingDays: phase.healingDays,
        teeth: [...new Set(phase.items.map((item) => item.toothNum).filter((num): num is number => typeof num === 'number'))],
        price,
        paid,
        labWork: phase.labWork,
        appointment: visit ? { id: visit.id, startsAt: visit.startsAt.toISOString(), status: visit.status } : null,
        reservations: phase.items.flatMap((item) =>
          item.reservations.map((row) => ({ itemName: row.item.name, quantity: Number(row.quantity), status: row.status, expectedAt: null })),
        ),
        lab: phase.labOrders[0] ? { id: phase.labOrders[0].id, status: phase.labOrders[0].status, dueAt: phase.labOrders[0].dueAt?.toISOString() ?? null } : null,
      };
    });
    return { planId: plan.id, title: plan.title, signedAt: plan.signedAt?.toISOString() ?? null, route: routeOf(stages) };
  }
}
```

Оплата распределяется по этапам по порядку: сначала закрывается первый этап. `expectedAt` в этапе 1 всегда `null` (дефицит показывается как «нет на складе»); дату поставки подставит этап 3, когда у закупок появятся строки и `expectedAt`. Поля `toothNum`, `price`, `appointment` у `TreatmentPlanItem` и связи `phases.items`, `invoices` у `TreatmentPlan` уже есть в схеме.

- [ ] **Step 2: Контроллер и модуль**

`apps/api/src/route/route.controller.ts`:

```ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { RouteService } from './route.service';

@ApiTags('route')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('route')
export class RouteController {
  constructor(private readonly route: RouteService) {}

  @Get('patients/:patientId')
  @RequirePermissions('patient.read')
  forPatient(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.route.forPatient(orgId, patientId);
  }
}
```

`apps/api/src/route/route.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RouteController } from './route.controller';
import { RouteService } from './route.service';

@Module({ controllers: [RouteController], providers: [RouteService] })
export class RouteModule {}
```

В `app.module.ts` добавить `RouteModule` в `imports`.

- [ ] **Step 3: Проверить на временной базе**

Run: поднять API, войти `owner@demo.local`, `curl -H "Authorization: Bearer $TOKEN" localhost:4000/api/v1/route/patients/<id пациента с подписанным планом>`.
Expected: JSON с `route.stages[*].readiness.visit.state`; для пациента другой клиники — `null`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/route apps/api/src/app.module.ts
git commit -m "Serve the patient's treatment route with readiness per stage."
```

### Task 11: Маршрут в демо

**Files:**
- Create: `apps/web/src/lib/demo/route.ts`
- Modify: `apps/web/src/lib/demo/handle.ts` (маршрутизация запросов около строки 371; `acceptPlan` около строки 1149)

**Interfaces:**
- Consumes: `routeOf`, `reservationsFor`, `labDueAt`.
- Produces: демо отвечает на `GET /route/patients/:id` той же формой, что API.

- [ ] **Step 1: Модуль**

`apps/web/src/lib/demo/route.ts`:

```ts
import { labDueAt, routeOf, type StageInput } from '@dentasmart/shared';

type AnyRec = Record<string, any>;

/** Demo plans live inside patient cards in the browser bag; this maps them to the shared route shape. */
export function demoRoute(plan: AnyRec | null, appointments: AnyRec[], labOrders: AnyRec[]) {
  if (!plan || plan.status !== 'ACCEPTED') return null;
  const stages: StageInput[] = (plan.phases as AnyRec[]).map((phase, index) => {
    const visit = appointments.find((row) => row.planPhaseId === phase.id) ?? null;
    const lab = labOrders.find((row) => row.planPhaseId === phase.id) ?? null;
    const items = (phase.items ?? []) as AnyRec[];
    return {
      id: phase.id,
      title: phase.title,
      sortOrder: index + 1,
      healingDays: phase.healingDays ?? 0,
      teeth: [...new Set(items.map((item) => item.toothNum).filter((num) => typeof num === 'number'))] as number[],
      price: items.reduce((sum, item) => sum + Number(item.price ?? 0), 0),
      paid: Number(phase.paid ?? 0),
      labWork: phase.labWork ?? null,
      appointment: visit ? { id: visit.id, startsAt: visit.startsAt, status: visit.status ?? 'SCHEDULED' } : null,
      reservations: (phase.reservations ?? []) as StageInput['reservations'],
      lab: lab ? { id: lab.id, status: lab.status, dueAt: lab.dueAt ?? (visit ? labDueAt(new Date(visit.startsAt)).toISOString() : null) } : null,
    };
  });
  return { planId: plan.id, title: plan.title, signedAt: plan.signedAt ?? null, route: routeOf(stages) };
}
```

- [ ] **Step 2: Подключить**

В `acceptPlan` в демо при создании визита записать `row.planPhaseId = phase.id`; если у этапа есть `phase.labWork`, добавить заказ-наряд через существующий `addLab(bag, { patientId, title: phase.labWork })` и проставить ему `planPhaseId` и `status: 'WAITING_IMPRESSION'`. Резервы в демо: `phase.reservations = reservationsFor(...)` по нормам из `bag.gets['/config']` (если норм нет — пустой массив) с подстановкой `itemName`.

В диспетчере запросов рядом с `/workspace/plans/...`:

```ts
  const route = pathname.match(/^\/route\/patients\/([^/]+)$/);
  if (route) return demoRoute(acceptedPlanOf(bag, route[1]), allAppointments(bag), bag.gets['/lab/orders'] as AnyRec[]);
```

`acceptedPlanOf` и `allAppointments` — маленькие хелперы в `handle.ts` поверх уже существующих `eachPlan` и списка визитов расписания.

- [ ] **Step 3: Проверить**

Run: `pnpm --filter @dentasmart/web exec tsc --noEmit -p .`
Expected: тип-проверка без ошибок. Поведение в браузере проверяет Task 12 (вкладка «Маршрут») и Task 13 (e2e).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/demo
git commit -m "Give the browser demo the same treatment route as the API."
```

### Task 12: Вкладка «Маршрут» в карте пациента

**Files:**
- Create: `apps/web/src/components/route/status-chip.tsx`
- Create: `apps/web/src/components/route/stage-card.tsx`
- Create: `apps/web/src/components/route/route-view.tsx`
- Modify: `apps/web/src/app/patients/[id]/page.tsx:45,66,112,132`

**Interfaces:**
- Consumes: `GET /route/patients/:id`, типы `Route`, `RouteStage`, `Axis`.
- Produces: `<RouteView patientId={string} />`.

- [ ] **Step 1: Чип состояния**

`apps/web/src/components/route/status-chip.tsx`:

```tsx
import type { Axis } from '@dentasmart/shared';

const TONE: Record<Axis['state'], string> = {
  ready: 'bg-[var(--ok-soft)] text-[var(--ok)]',
  waiting: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  blocked: 'bg-[var(--danger-soft)] text-[var(--danger)] font-semibold',
  none: 'bg-[var(--surface-2)] text-[var(--muted)]',
};

export function StatusChip({ label, axis }: { label: string; axis: Axis }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[13px] ${TONE[axis.state]}`}>
      {label} · {axis.reason}
    </span>
  );
}
```

- [ ] **Step 2: Карточка этапа**

`apps/web/src/components/route/stage-card.tsx`:

```tsx
import type { RouteStage } from '@dentasmart/shared';
import { StatusChip } from './status-chip';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function StageCard({ stage, index }: { stage: RouteStage; index: number }) {
  const current = stage.status === 'current';
  return (
    <article className={`flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5 ${current ? 'border-2 border-[var(--accent)]' : 'border border-[var(--border)]'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${stage.status === 'done' ? 'bg-[var(--accent)] text-white' : 'border-2 border-[var(--border-strong)] text-[var(--muted)]'}`}>
          {index + 1}
        </span>
        <h3 className="m-0 text-[17px] font-bold">{stage.title}</h3>
        {stage.teeth.length ? (
          <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[13px] text-[var(--text-secondary)]">{stage.teeth.join(' · ')}</span>
        ) : null}
        <span className="ml-auto text-[13px] font-semibold text-[var(--text-secondary)]">
          {stage.appointment ? when(stage.appointment.startsAt) : 'Визит не назначен'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusChip label="Визит" axis={stage.readiness.visit} />
        <StatusChip label="Материалы" axis={stage.readiness.materials} />
        <StatusChip label="Лаборатория" axis={stage.readiness.lab} />
        <StatusChip label="Оплата" axis={stage.readiness.payment} />
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Экран маршрута**

`apps/web/src/components/route/route-view.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Route } from '@dentasmart/shared';
import { api } from '@/lib/api';
import { StageCard } from './stage-card';

type Payload = { planId: string; title: string; signedAt: string | null; route: Route } | null;

const rub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

export function RouteView({ patientId }: { patientId: string }) {
  const [data, setData] = useState<Payload | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Payload>(`/route/patients/${patientId}`).then(setData).catch((err: Error) => setError(err.message));
  }, [patientId]);

  if (error) return <p className="text-[var(--danger)]">Маршрут не загрузился: {error}. Обновите страницу.</p>;
  if (data === undefined) return <p className="text-[var(--muted)]">Загружаем маршрут…</p>;
  if (data === null) return <p className="text-[var(--muted)]">Маршрута пока нет. Он появится, когда пациент подпишет план на вкладке «План».</p>;

  const { route } = data;
  const left = route.price - route.paid;
  return (
    <div className="flex flex-wrap items-start gap-5">
      <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3" aria-label="Маршрут лечения">
        <p className="m-0 text-[var(--muted)]">
          {data.title}
          {data.signedAt ? ` · подписан ${new Date(data.signedAt).toLocaleDateString('ru-RU')}` : ''} · {route.stages.length} этапа · {rub(route.price)}
        </p>
        {route.stages.map((stage, index) => <StageCard key={stage.id} stage={stage} index={index} />)}
      </section>
      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5" aria-label="Деньги по плану">
        <h2 className="m-0 text-base font-bold">Деньги по плану</h2>
        <div className="text-2xl font-semibold tabular-nums">{rub(left)}</div>
        <div className="text-sm text-[var(--muted)]">осталось из {rub(route.price)}</div>
        <div className="h-2 overflow-hidden rounded bg-[var(--surface-2)]" role="img" aria-label={`Оплачено ${route.price ? Math.round((route.paid / route.price) * 100) : 0} процентов`}>
          <div className="h-full bg-[var(--accent)]" style={{ width: `${route.price ? (route.paid / route.price) * 100 : 0}%` }} />
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Вкладка**

В `patients/[id]/page.tsx`: тип `mode` расширить `'route'`, поставить его значением по умолчанию; в проверку сохранённого режима (строка 66) добавить `saved === 'route'`; первой кнопкой перед «План» вставить `<button type="button" className={mode === 'route' ? 'on' : ''} onClick={() => setMode('route')}>Маршрут</button>`; перед `{mode === 'plan' ? (` добавить `{mode === 'route' ? <RouteView patientId={id} /> : null}` и импорт `import { RouteView } from '@/components/route/route-view';`. `id` — та же переменная, по которой страница уже загружает пациента.

- [ ] **Step 5: Проверить**

Run: `pnpm --filter @dentasmart/web exec tsc --noEmit -p .`, затем демо: карта Смирновой Анны → «План» → подписать → «Маршрут».
Expected: этапы с четырьмя чипами, текущий этап в бирюзовой рамке, сумма к оплате справа.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/route apps/web/src/app/patients/[id]/page.tsx
git commit -m "Show the treatment route as the first tab of the patient card."
```

### Task 13: e2e главного сценария

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/route.spec.ts`
- Modify: `apps/web/package.json` (скрипт `test:e2e`, devDependency `@playwright/test@1.48.2`)
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Конфиг**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'pnpm dev', port: 3000, reuseExistingServer: true, timeout: 120_000 },
});
```

- [ ] **Step 2: Тест**

```ts
import { expect, test } from '@playwright/test';

test('подписанный план превращается в маршрут', async ({ page }) => {
  await page.goto('/login?role=doctor');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/patients/seed-patient-anna');
  await page.getByRole('button', { name: 'План' }).click();
  await page.getByRole('button', { name: 'Показать' }).click();
  await page.getByRole('button', { name: /Подписать|Принять/ }).first().click();
  await page.getByRole('button', { name: 'Маршрут' }).click();
  await expect(page.getByRole('region', { name: 'Маршрут лечения' })).toBeVisible();
  await expect(page.getByText(/Визит · /).first()).toBeVisible();
  await expect(page.getByText(/Оплата · /).first()).toBeVisible();
});
```

Названия кнопок подписи сверить с текущим экраном презентации плана (`apps/web/src/app/present/[familyKey]/page.tsx`) и поправить селекторы при расхождении.

- [ ] **Step 3: Прогон**

Run: `pnpm --filter @dentasmart/web exec playwright install chromium && pnpm --filter @dentasmart/web test:e2e`
Expected: `1 passed`.

- [ ] **Step 4: CI**

В `ci.yml` после сборки веба:

```yaml
      - run: pnpm --filter @dentasmart/web exec playwright install --with-deps chromium
      - run: pnpm --filter @dentasmart/web test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e apps/web/package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "Cover signing a plan and seeing its route end to end."
```

---

# Дорожная карта этапов 2–5

Каждый этап получает свой подробный план после завершения предыдущего: так названия функций и данные берутся из уже написанного кода, а не угадываются.

**Этап 2. Сегодня.** `nextActions(role, snapshot, now)` в `packages/shared/src/route/actions.ts` с тестами на каждую группу («Сейчас», «Подтвердить», «Визит не готов», «Деньги», «Вернуть в план»); `GET /today?role=`; экран по макету «Сегодня» на месте `/`; компонент `ChairLanes` из визитов дня; исправление наложения визитов в `schedule-calendar.tsx` (раскладка пересекающихся визитов по колонкам).

**Этап 3. Снабжение.** `purchaseDraft(shortages, minStock, onHand)` в ядре; `GET /supply/needs`, `POST /supply/purchase-drafts`, `POST /supply/purchase-orders/:id/send`, приёмка поставки с переводом `SHORT` → `RESERVED`; `expectedAt` из строки закупки идёт в ось «Материалы» («в пути до …»); вкладки «К визитам», «Склад», «Закупки», «Лаборатория» на `/supply` по макету; доска лаборатории со сроками от визитов.

**Этап 4. Пациент и деньги.** Публичный маршрут `GET /public/route/:token` (только этапы, даты, суммы; лимит запросов как у виджета); страница маршрута для телефона; ссылка на оплату этапа; график рассрочки по этапам; «Отправить итог пациенту» из презентации плана; `/money` получает долги и рассрочки.

**Этап 5. Умные слои.** Разметка снимка (`xray.tsx`) создаёт строку плана на зуб; голосовая перио-карта (`voice-chart.tsx`) пишет в формулу и предлагает этап; воронка «заявка → контроль» и деньги в незакрытых планах на `/money`.
