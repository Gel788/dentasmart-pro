'use client';

import { useEffect, useMemo, useState } from 'react';
import { ToothChart, type ToothRecord } from '@/components/tooth-chart';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { PLAN_ITEM_STATUS, TOOTH_CONDITIONS, formatMoney, label } from '@/lib/format';

export type PlanLine = {
  id: string;
  title: string;
  price: string;
  listPrice?: string | null;
  toothNum?: number | null;
  isCompleted: boolean;
  status?: string;
  durationMin?: number;
  service?: { id: string; name: string; basePrice: string } | null;
  invoiceItem?: { id: string } | null;
};

type CatalogService = { id: string; name: string; price: number; code?: string | null };

const LINE_STATUS = ['PROPOSED', 'ACCEPTED', 'DONE', 'REJECTED'] as const;

const STATUS_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  PROPOSED: { bg: 'var(--blue-soft)', fg: 'var(--blue)', border: 'var(--blue-soft)' },
  ACCEPTED: { bg: 'var(--success-soft)', fg: 'var(--success)', border: 'var(--success-soft)' },
  DONE: { bg: 'var(--surface-muted)', fg: 'var(--text-secondary)', border: 'var(--border)' },
  REJECTED: { bg: 'var(--danger-soft)', fg: 'var(--danger)', border: 'var(--danger-soft)' },
};

function money(items: PlanLine[], statuses: string[]) {
  return items
    .filter((item) => statuses.includes(item.status || (item.isCompleted ? 'DONE' : 'PROPOSED')))
    .reduce((sum, item) => sum + Number(item.price), 0);
}

function lineStatus(item: PlanLine) {
  return item.status || (item.isCompleted ? 'DONE' : 'PROPOSED');
}

function catalogPriceOf(item: PlanLine) {
  if (item.listPrice != null && item.listPrice !== '') return Number(item.listPrice);
  if (item.service?.basePrice != null) return Number(item.service.basePrice);
  return null;
}

export function PlanBoard({
  planId,
  patientId,
  items,
  teeth,
  onChanged,
  onClose,
}: {
  planId: string;
  patientId: string;
  items: PlanLine[];
  teeth: ToothRecord[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const { branchId } = useBranch();
  const [tooth, setTooth] = useState<number>();
  const [services, setServices] = useState<CatalogService[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [condition, setCondition] = useState('HEALTHY');
  const [diagnosis, setDiagnosis] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [askLeave, setAskLeave] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [orderIds, setOrderIds] = useState<string[]>([]);

  useEffect(() => {
    api<CatalogService[]>('/clinical/catalog').then(setServices).catch(() => setServices([]));
  }, []);

  const billableKey = items
    .filter((item) => {
      const status = item.status || (item.isCompleted ? 'DONE' : 'PROPOSED');
      return (status === 'ACCEPTED' || status === 'DONE') && !item.invoiceItem;
    })
    .map((item) => item.id)
    .join(',');

  useEffect(() => {
    setPrices(Object.fromEntries(items.map((item) => [item.id, String(Number(item.price))])));
    setOrderIds(billableKey ? billableKey.split(',') : []);
  }, [items, billableKey]);

  const record = teeth.find((item) => item.toothNum === tooth && item.formula !== 'CHILD');

  useEffect(() => {
    setCondition(record?.condition ?? 'HEALTHY');
    setDiagnosis(record?.diagnosis ?? '');
  }, [tooth, record?.condition, record?.diagnosis]);

  const marked = useMemo(
    () => [...new Set(items.map((item) => item.toothNum).filter((n): n is number => typeof n === 'number'))],
    [items],
  );

  const visible = [...(tooth ? items.filter((item) => item.toothNum === tooth) : items)].sort((a, b) => {
    if (a.toothNum == null) return 1;
    if (b.toothNum == null) return -1;
    return a.toothNum - b.toothNum;
  });

  const proposed = money(items, ['PROPOSED']);
  const agreed = money(items, ['ACCEPTED', 'DONE']);
  const done = money(items, ['DONE']);
  const refused = money(items, ['REJECTED']);
  const progress = agreed > 0 ? Math.round((done / agreed) * 100) : 0;
  const picked = services.find((service) => service.id === serviceId);
  const catalog = picked ? Number(picked.price) : null;
  const priceDirty = items.some((item) => {
    const raw = prices[item.id];
    return raw != null && raw !== '' && Number(raw) !== Number(item.price);
  });
  const toothDirty = Boolean(
    tooth &&
      (condition !== (record?.condition ?? 'HEALTHY') || diagnosis !== (record?.diagnosis ?? '')),
  );
  const draftDirty = Boolean(serviceId);
  const dirty = priceDirty || toothDirty || draftDirty;

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не сохранилось');
    } finally {
      setBusy('');
    }
  };

  const setStatus = (item: PlanLine, status: string) =>
    run(item.id, () =>
      status === 'DONE'
        ? api(`/clinical/treatment-plans/items/${item.id}/complete`, {
            method: 'PATCH',
            body: JSON.stringify({ isCompleted: true, branchId }),
          })
        : api(`/clinical/treatment-plans/items/${item.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
          }),
    );

  const persist = async () => {
    for (const item of items) {
      const raw = prices[item.id];
      if (raw == null || raw === '') continue;
      const price = Number(raw);
      if (!Number.isFinite(price) || price < 0) throw new Error('Введите цену строки');
      if (price === Number(item.price)) continue;
      await api(`/clinical/treatment-plans/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ price }),
      });
    }
    if (
      tooth &&
      (condition !== (record?.condition ?? 'HEALTHY') || diagnosis !== (record?.diagnosis ?? ''))
    ) {
      await api(`/clinical/patients/${patientId}/teeth`, {
        method: 'POST',
        body: JSON.stringify({ toothNum: tooth, formula: 'ADULT', condition, diagnosis }),
      });
    }
    if (picked) {
      const price = Number(draftPrice);
      if (!Number.isFinite(price) || price < 0) throw new Error('Введите цену для плана');
      await api(`/clinical/treatment-plans/${planId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          title: picked.name,
          price,
          toothNum: tooth,
          serviceId: picked.id,
        }),
      });
      setServiceId('');
      setDraftPrice('');
    }
  };

  const savePlan = async () => {
    setBusy('save');
    setError('');
    try {
      await persist();
      onChanged();
      setSavedAt(Date.now());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не сохранилось');
      return false;
    } finally {
      setBusy('');
    }
  };

  const requestClose = () => {
    if (dirty) setAskLeave(true);
    else onClose();
  };

  const addService = () => {
    if (!picked) return;
    const price = Number(draftPrice);
    if (!Number.isFinite(price) || price < 0) {
      setError('Введите цену для плана');
      return;
    }
    run('add', async () => {
      await api(`/clinical/treatment-plans/${planId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          title: picked.name,
          price,
          toothNum: tooth,
          serviceId: picked.id,
        }),
      });
      setServiceId('');
      setDraftPrice('');
    });
  };

  const paintTooth = (num: number, next: string) => {
    setTooth(num);
    const current = teeth.find((item) => item.toothNum === num && item.formula !== 'CHILD');
    run('paint', () =>
      api(`/clinical/patients/${patientId}/teeth`, {
        method: 'POST',
        body: JSON.stringify({
          toothNum: num,
          formula: 'ADULT',
          condition: next,
          diagnosis: current?.diagnosis ?? '',
        }),
      }),
    );
  };

  return (
    <>
    <div className="space-y-5 pb-24">
      <section className="ds-card overflow-hidden p-0">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="ds-kicker">Зубная формула</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Нумерация FDI. Цвет зуба — его состояние, номер снизу — строка в плане.</p>
          </div>
          {tooth && (
            <button
              type="button"
              className="rounded-lg px-2.5 py-1 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
              onClick={() => setTooth(undefined)}
            >
              Весь план
            </button>
          )}
        </header>
        <div className="px-5 py-5">
          <ToothChart
            records={teeth}
            selected={tooth}
            marked={marked}
            onSelect={setTooth}
            onPaint={paintTooth}
          />
          {tooth && (
            <div className="mx-auto mt-5 grid max-w-md gap-2">
              <Label>Диагноз зуба {tooth}</Label>
              <Input aria-label="Диагноз зуба" value={diagnosis} placeholder="K02.1" onChange={(e) => setDiagnosis(e.target.value)} />
              <p className="text-xs text-[var(--muted)]">
                Сейчас: {label(TOOTH_CONDITIONS, record?.condition ?? 'HEALTHY')}. Кисть пишется сразу, диагноз — кнопкой «Сохранить».
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="К решению" value={proposed} tone="sky" />
        <Summary label="Согласовано" value={agreed} tone="emerald" />
        <Summary label="Выполнено" value={done} tone="slate" />
        <Summary label="Отказ" value={refused} tone="rose" />
      </div>

      <div className="ds-card px-5 py-4">
        <div className="mb-2 flex justify-between text-xs font-medium text-[var(--muted)]">
          <span>Выполнено от согласованного</span>
          <span className="tabular-nums text-[var(--text-secondary)]">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {error && <p className="rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}

      <section className="ds-card overflow-hidden p-0">
        <header className="border-b border-[var(--border)] px-5 py-4">
          <p className="ds-kicker">План</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--text)]">
            {tooth ? `План · зуб ${tooth}` : 'План лечения'}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">Цена новой строки берётся из прайса. На строке её можно заменить, «Сохранить» записывает суммы.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                <th className="w-8 px-5 py-3" />
                <th className="px-3 py-3">Услуга</th>
                <th className="w-16 px-3 py-3">Зуб</th>
                <th className="w-28 px-3 py-3">Цена</th>
                <th className="w-40 px-3 py-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const status = lineStatus(item);
                const fromList = catalogPriceOf(item);
                const planPrice = Number(prices[item.id] ?? item.price);
                const custom = fromList != null && planPrice !== fromList;
                const tone = STATUS_TONE[status] ?? STATUS_TONE.PROPOSED;
                const billable = (status === 'ACCEPTED' || status === 'DONE') && !item.invoiceItem;
                return (
                  <tr key={item.id} className="ds-table-row last:border-b-0">
                    <td className="px-5 py-3 align-middle">
                      {billable ? (
                        <input
                          type="checkbox"
                          aria-label={`В наряд: ${item.title}`}
                          checked={orderIds.includes(item.id)}
                          onChange={() =>
                            setOrderIds((prev) =>
                              prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
                            )
                          }
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <p className={status === 'REJECTED' ? 'font-medium text-[var(--muted)] line-through' : 'font-medium text-[var(--text)]'}>
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {item.invoiceItem
                          ? 'Уже в наряде'
                          : fromList != null
                            ? `Прайс ${formatMoney(fromList)}${custom ? ' · своя цена' : ''}`
                            : 'Цена вручную'}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-middle font-semibold tabular-nums text-[var(--text)]">{item.toothNum ?? '—'}</td>
                    <td className="px-3 py-3 align-middle">
                      <Input
                        type="number"
                        min={0}
                        aria-label={`Цена ${item.title}`}
                        value={prices[item.id] ?? ''}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <select
                        aria-label={`Статус ${item.title}`}
                        disabled={busy === item.id}
                        value={status}
                        onChange={(e) => setStatus(item, e.target.value)}
                        className="h-9 w-full rounded-lg border px-2 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-[var(--accent-glow)]"
                        style={{ background: tone.bg, color: tone.fg, borderColor: tone.border }}
                      >
                        {LINE_STATUS.map((next) => (
                          <option key={next} value={next}>{label(PLAN_ITEM_STATUS, next)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && (
            <p className="py-10 text-center text-sm text-[var(--muted)]">
              {tooth ? `На зубе ${tooth} строк ещё нет.` : 'В плане ещё нет строк.'}
            </p>
          )}
        </div>
        <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
            <p className="ds-kicker mb-3">
              {tooth ? `Добавить услугу на зуб ${tooth}` : 'Добавить услугу без зуба'}
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <div>
                <Label>Услуга</Label>
                <Select
                  aria-label="Услуга из прайса"
                  value={serviceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setServiceId(id);
                    const service = services.find((item) => item.id === id);
                    setDraftPrice(service ? String(Number(service.price)) : '');
                  }}
                >
                  <option value="">Выберите из прайса</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} — {formatMoney(service.price)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Цена в плане</Label>
                <Input
                  type="number"
                  min={0}
                  aria-label="Цена новой строки"
                  value={draftPrice}
                  onChange={(e) => setDraftPrice(e.target.value)}
                />
              </div>
              <Button disabled={!serviceId || busy === 'add'} onClick={addService}>
                Добавить
              </Button>
            </div>
            {catalog != null && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                В прайсе {formatMoney(catalog)}. Если стереть поле и вписать другую сумму, в план попадёт она, а прайс останется рядом для сверки.
              </p>
            )}
          </div>
      </section>
    </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 lg:left-[272px]">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-sm text-[var(--muted)]">
            {dirty ? 'Есть несохранённые изменения' : savedAt > 0 ? 'Сохранено' : 'Сохранить фиксирует план, Закрыть возвращает в карточку'}
          </p>
          <Button
            variant="ghost"
            disabled={!orderIds.length || !!busy}
            onClick={() =>
              run('order', () =>
                api(`/finance/invoices/from-plan/${planId}`, {
                  method: 'POST',
                  body: JSON.stringify({ itemIds: orderIds }),
                }),
              )
            }
          >
            В наряд{orderIds.length ? ` · ${orderIds.length}` : ''}
          </Button>
          <Button variant="ghost" onClick={requestClose} disabled={busy === 'save'}>
            Закрыть
          </Button>
          <Button onClick={() => void savePlan()} disabled={busy === 'save'}>
            Сохранить
          </Button>
        </div>
      </div>

      <Modal
        open={askLeave}
        onClose={() => setAskLeave(false)}
        title="Сохранить план?"
        description="Закрыть без записи — последние цены и зуб не попадут в карту."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setAskLeave(false)}>
            Отмена
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setAskLeave(false);
              onClose();
            }}
          >
            Не сохранять
          </Button>
          <Button
            disabled={busy === 'save'}
            onClick={() => {
              void savePlan().then((ok) => {
                if (!ok) return;
                setAskLeave(false);
                onClose();
              });
            }}
          >
            Сохранить
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Summary({ label: name, value, tone }: { label: string; value: number; tone: 'sky' | 'emerald' | 'slate' | 'rose' }) {
  const palette = STATUS_TONE[tone === 'sky' ? 'PROPOSED' : tone === 'emerald' ? 'ACCEPTED' : tone === 'rose' ? 'REJECTED' : 'DONE'];
  return (
    <div className="rounded-xl border px-4 py-3" style={{ background: palette.bg, borderColor: palette.border }}>
      <p className="text-xs font-medium" style={{ color: palette.fg }}>{name}</p>
      <p className="ds-display mt-1 text-xl tabular-nums" style={{ color: palette.fg }}>{formatMoney(value)}</p>
    </div>
  );
}
