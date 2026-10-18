'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ToothChart, type ChartItem, type ChartSurface } from '@/components/studio/chart';
import { ToothFocus } from '@/components/studio/tooth-focus';
import { PricePicker, type PriceService } from '@/components/studio/price-picker';
import { BreakdownTable } from '@/components/studio/breakdown-table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { AiPlan } from '@/components/studio/ai-plan';
import { consumablesFor, explainPrice, type CatalogService, type CatalogStock } from '@/lib/breakdown';
import { formatMoney } from '@/lib/format';
import { paymentSchedule } from '@/lib/plan-engine';
import { kitOf } from '@/lib/service-kit';
import type { Family, PlanItem } from '@/components/studio/plans';

export function PlanJourney({
  patientId,
  patientName,
  familyKey,
  surfaces,
  families,
  activeId,
  onPick,
  onBuild,
  onAdded,
  building,
}: {
  patientId: string;
  patientName: string;
  familyKey: string | null;
  surfaces: ChartSurface[];
  families: Family[];
  activeId: string | null;
  onPick: (id: string) => void;
  onBuild: () => void;
  onAdded: () => Promise<unknown>;
  building: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const owner = user?.permissions.includes('org.manage') ?? false;
  const [catalog, setCatalog] = useState<{ services: CatalogService[]; stock: CatalogStock[] }>({ services: [], stock: [] });
  const [priced, setPriced] = useState(false);
  const family = families.find((item) => item.key === familyKey)
    ?? families.find((item) => item.plans.some((plan) => plan.id === activeId))
    ?? [...families].sort((a, b) => b.plans.length - a.plans.length)[0];
  const plans = family?.plans ?? [];
  const plan = plans.find((item) => item.id === activeId) ?? plans[0];
  const economy = plans.find((item) => item.tier === 'ECONOM');
  const [tooth, setTooth] = useState<number | null>(null);
  const [face, setFace] = useState('TOOTH');
  const [picker, setPicker] = useState<{ phaseId: string; tooth: number | null } | null>(null);
  const [discount, setDiscount] = useState(plan?.discountPercent ?? 0);
  const [disclosure, setDisclosure] = useState(plan?.showBreakdown !== false);
  const [saved, setSaved] = useState('');
  const [sent, setSent] = useState('');
  const [versions, setVersions] = useState<{ id: string; note: string | null; createdAt: string }[] | null>(null);
  const [payMonths, setPayMonths] = useState(plan && plan.installmentMonths >= 2 ? plan.installmentMonths : 1);
  const [aiOn, setAiOn] = useState(true);
  const marker = useRef<((tooth: number) => boolean) | null>(null);

  useEffect(() => { setDiscount(plan?.discountPercent ?? 0); }, [plan?.id, plan?.discountPercent]);
  useEffect(() => { setPayMonths(plan && plan.installmentMonths >= 2 ? plan.installmentMonths : 1); }, [plan?.id, plan?.installmentMonths]);
  useEffect(() => { setDisclosure(plan?.showBreakdown !== false); }, [plan?.id, plan?.showBreakdown]);
  useEffect(() => { setPicker(null); setTooth(null); }, [plan?.id]);
  useEffect(() => {
    if (tooth == null) return;
    document.querySelector('.jn-road li.hot')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tooth, plan?.id]);
  useEffect(() => {
    api<{ services: CatalogService[]; stock: CatalogStock[]; aiPlans?: boolean }>('/config')
      .then((data) => {
        setCatalog({ services: data.services ?? [], stock: data.stock ?? [] });
        setAiOn(data.aiPlans !== false);
      })
      .catch(() => undefined)
      .finally(() => setPriced(true));
  }, []);

  const phases = plan
    ? (plan.phases.length ? plan.phases : [{ id: 'loose', title: 'Позиции', specialty: null, healingDays: 0, dependsOnTitle: null, waitDays: 0, items: plan.looseItems }])
    : [];
  const visibleItems = phases.flatMap((phase) => phase.items);
  const subtotal = visibleItems.reduce((sum, item) => sum + item.price, 0);
  const total = Math.round(subtotal * (1 - discount / 100));
  const months = payMonths >= 2 ? payMonths : 1;
  const perMonth = Math.round(total / months);
  const schedule = paymentSchedule(total, months);
  const animated = useCount(total);
  const defaultPhaseId = () => {
    const open = phases.find((phase) => phase.items.some((line) => line.status !== 'DONE' && line.status !== 'ACCEPTED'));
    return (open ?? phases[0])?.id ?? 'loose';
  };

  const save = async () => {
    if (!plan) return;
    setSaved('Сохраняем…');
    try {
      const result = await api<{ savedAt: string }>(`/workspace/plans/${plan.id}/save`, {
        method: 'POST',
        body: JSON.stringify({ discountPercent: discount }),
      });
      setSaved(`Сохранено ${new Date(result.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · версия записана`);
    } catch (err) {
      setSaved(err instanceof Error ? err.message : 'Не сохранилось');
    }
  };

  const send = async () => {
    if (!familyKey) return;
    const link = `${window.location.origin}/present/${familyKey}`;
    await navigator.clipboard.writeText(link);
    const text = encodeURIComponent(`Седракович Дент: план лечения для ${patientName}. ${link}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
    setSent('Ссылка скопирована и открыт WhatsApp');
  };

  const addService = async (service: PriceService, phaseId: string) => {
    if (!plan) return;
    const targetTooth = picker?.tooth ?? null;
    await api(`/workspace/plans/${plan.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ phaseId, serviceId: service.id, toothNum: targetTooth }),
    });
    await onAdded();
    setSaved(`Добавлено: ${service.name}${targetTooth ? ` · зуб ${targetTooth}` : ''}`);
    setPicker(null);
  };

  return (
    <div className="jn">
      <AiPlan
        patientId={patientId}
        services={catalog.services}
        enabled={aiOn}
        owner={owner}
        tooth={tooth}
        surfaces={surfaces}
        planId={plan?.id ?? null}
        onBind={(handler) => { marker.current = handler; }}
        onDone={async (nextId) => { if (nextId) onPick(nextId); await onAdded(); }}
      />
      {!plan && (
        <div className="jn-empty">
          <span />
          <h2>Плана ещё нет</h2>
          <p>Отметьте находки и соберите план за минуту. Или возьмите три варианта по уже отмеченной формуле.</p>
          <button className="sd-btn-ghost" type="button" disabled={building} onClick={onBuild}>{building ? 'Собираем…' : 'Собрать по формуле'}</button>
        </div>
      )}
      {plan && <div className="jn-tabs">
        {plans.map((item) => {
          const delta = economy ? item.total - economy.total : 0;
          return (
            <button key={item.id} type="button" className={`jn-tab ${item.id === plan.id ? 'on' : ''} ${item.tier === 'OPTIMUM' ? 'rec' : ''}`} onClick={() => onPick(item.id)}>
              {item.tier === 'OPTIMUM' && <em>рекомендуем</em>}
              <span>{item.tierLabel}</span>
              <strong>{formatMoney(item.total)}</strong>
              {item.tier !== 'ECONOM' && delta !== 0 && <small>{delta > 0 ? `+${formatMoney(delta)}` : formatMoney(delta)} к эконому</small>}
              {item.tier === 'ECONOM' && <small>база</small>}
            </button>
          );
        })}
      </div>}
      <div className="jn-stage">
        <section className="jn-chart">
          <div className="jn-addbar">
            <p>{plan ? 'Нажмите зуб, чтобы добавить услугу' : 'Выберите диагноз и нажмите зуб'}</p>
            {plan && <button className="sd-btn-ghost" type="button" data-plan-add="global" onClick={() => setPicker({ phaseId: defaultPhaseId(), tooth })}>+ Услуга</button>}
          </div>
          <ToothChart
            surfaces={surfaces}
            items={visibleItems as ChartItem[]}
            view="plan"
            formula="ADULT"
            condition="CARIES"
            selected={tooth}
            onCondition={() => undefined}
            onPaint={() => undefined}
            quiet
            onSelect={(next, surface) => {
              setTooth(next);
              setFace(surface || 'TOOTH');
              marker.current?.(next);
            }}
          />
          {tooth != null && (
            <ToothFocus
              tooth={tooth}
              surface={face}
              surfaces={surfaces}
              services={visibleItems.filter((item) => item.toothNum === tooth).map((item) => ({ id: item.id, title: item.title, status: item.status }))}
              onStatus={(condition, surface) => {
                void api(`/workspace/patients/${patientId}/chart`, {
                  method: 'POST',
                  body: JSON.stringify({ toothNum: tooth, surface, condition, diagnosis: 'Осмотр' }),
                }).then(() => onAdded()).catch((err: Error) => setSaved(err.message));
              }}
              onAdd={plan ? () => setPicker({ phaseId: defaultPhaseId(), tooth }) : undefined}
            />
          )}
          {tooth && <button className="sd-btn-ghost" type="button" onClick={() => setTooth(null)}>Показать все зубы</button>}
        </section>
        {plan && <section className="jn-road">
          {phases.map((phase, index) => {
            const current = phases.findIndex((item) => item.items.some((line) => line.status !== 'DONE' && line.status !== 'ACCEPTED'));
            const done = phase.items.filter((item) => item.status === 'DONE' || item.status === 'ACCEPTED').length;
            const minutes = phase.items.reduce((sum) => sum + 40, 0);
            const price = phase.items.reduce((sum, item) => sum + item.price, 0);
            return (
              <article key={phase.id} className="jn-phase">
                <div className="jn-card">
                  <header>
                    <div>
                      <b><span className="jn-step">{index + 1}</span>{phase.title}</b>
                      <p>{phase.specialty ?? 'Этап'} · {Math.max(30, minutes)} мин{phase.healingDays ? ` · заживление ${phase.healingDays} дн.` : ''}</p>
                    </div>
                    <div className="jn-price">
                      {index === current && phase.id !== 'loose' && (
                        <button className="sd-btn-ghost" type="button" onClick={() => void api<{ startsAt: string }>(`/workspace/plans/${plan.id}/phases/${phase.id}/book`, { method: 'POST', body: '{}' }).then((result) => setSaved(`«${phase.title}» записан на ${new Date(result.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`)).catch((err: Error) => setSaved(err.message))}>Записать</button>
                      )}
                      <span>{done} из {phase.items.length}</span>
                      <span>Подытог</span>
                      <b>{formatMoney(price)}</b>
                    </div>
                  </header>
                  {phase.dependsOnTitle && <p className="jn-wait">После «{phase.dependsOnTitle}» пауза {phase.waitDays} дн.</p>}
                  <ul>
                    {phase.items.map((item) => (
                      <ServiceLine key={item.id} planId={plan.id} item={item} tooth={tooth} catalog={catalog} show={disclosure && priced} owner={owner} onSaved={onAdded} />
                    ))}
                  </ul>
                  <button className="sd-btn-ghost jn-add" type="button" data-plan-add="stage" onClick={() => setPicker({ phaseId: phase.id, tooth })}>+ Услуга</button>
                </div>
              </article>
            );
          })}
        </section>}
      </div>
      {plan && <div className="jn-dock">
        <div>
          <span>Итого</span>
          <strong>{formatMoney(animated)}</strong>
        </div>
        <label>Скидка, %
          <input aria-label="Скидка, %" type="number" min={0} max={40} value={discount} onChange={(event) => setDiscount(Number(event.target.value))} />
        </label>
        {owner && (
          <label className="jn-toggle">
            <input
              type="checkbox"
              checked={disclosure}
              onChange={(event) => {
                const show = event.target.checked;
                setDisclosure(show);
                void api(`/workspace/plans/${plan.id}/disclosure`, { method: 'POST', body: JSON.stringify({ showBreakdown: show }) })
                  .then(() => onAdded())
                  .catch((err: Error) => setSaved(err.message));
              }}
            />
            Показывать расшифровку
          </label>
        )}
        <label>Оплата
          <select aria-label="Рассрочка" value={months} onChange={(event) => {
            const next = Number(event.target.value);
            setPayMonths(next);
            void api(`/workspace/plans/${plan.id}/installment`, { method: 'POST', body: JSON.stringify({ months: next }) })
              .then(() => onAdded())
              .catch((err: Error) => setSaved(err.message));
          }}>
            <option value={1}>Сразу</option>
            <option value={3}>3 месяца</option>
            <option value={6}>6 месяцев</option>
            <option value={12}>12 месяцев</option>
          </select>
        </label>
        <div>
          <span>{months > 1 ? `Рассрочка ${months} мес.` : 'Одним платежом'}</span>
          <strong>{formatMoney(perMonth)}{months > 1 ? '/мес' : ''}</strong>
          {months > 1 && <small className="jn-pay">{schedule.map((part) => `${part.index}. ${formatMoney(part.amount)}`).join(' · ')}</small>}
        </div>
        <div className="jn-actions">
          <details className="jn-more">
            <summary>Ещё</summary>
            <button className="sd-btn-ghost" type="button" onClick={() => void api<{ id: string; note: string | null; createdAt: string }[]>(`/workspace/plans/${plan.id}/versions`).then(setVersions).catch((err: Error) => setSaved(err.message))}>Версии</button>
            <button className="sd-btn-ghost" type="button" onClick={() => window.open(`/print/plan/${plan.id}`, '_blank')}>Печать</button>
            <button className="sd-btn-ghost" type="button" onClick={() => void send()}>Ссылка</button>
            <button className="sd-btn-ghost" type="button" onClick={() => familyKey && router.push(`/smile/${familyKey}`)}>3D</button>
          </details>
          <button className="sd-btn-ghost" type="button" onClick={() => void save()}>Сохранить</button>
          <button className="sd-btn-ghost" type="button" onClick={() => familyKey && router.push(`/present/${familyKey}`)}>Показать</button>
        </div>
        {(saved || sent) && <p className="jn-note">{saved}{saved && sent ? ' · ' : ''}{sent}</p>}
        {versions && (
          <div className="jn-note">
            {versions.length === 0 && 'Версий ещё нет — нажмите «Сохранить».'}
            {versions.map((version) => (
              <button key={version.id} className="sd-btn-ghost" type="button" onClick={() => void api(`/workspace/plans/${plan.id}/versions/${version.id}/restore`, { method: 'POST', body: '{}' }).then(() => setSaved('Версия восстановлена')).catch((err: Error) => setSaved(err.message))}>
                {new Date(version.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} {version.note}
              </button>
            ))}
          </div>
        )}
      </div>}
      {picker && plan && (
        <PricePicker
          tooth={picker.tooth}
          phaseId={picker.phaseId}
          phases={phases.map((phase) => ({ id: phase.id, title: phase.title }))}
          onClose={() => setPicker(null)}
          onPick={addService}
        />
      )}
    </div>
  );
}

function ServiceLine({
  planId,
  item,
  tooth,
  catalog,
  show,
  owner,
  onSaved,
}: {
  planId: string;
  item: PlanItem;
  tooth: number | null;
  catalog: { services: CatalogService[]; stock: CatalogStock[] };
  show: boolean;
  owner: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [qty, setQty] = useState(item.qty ?? 1);
  const [unit, setUnit] = useState(item.unitPrice ?? item.price);
  const [lineDiscount, setLineDiscount] = useState(item.discountPercent ?? 0);
  const [kit, setKit] = useState(item.kit || kitOf(item.title));
  const timer = useRef<number | null>(null);
  useEffect(() => {
    setQty(item.qty ?? 1);
    setUnit(item.unitPrice ?? item.price);
    setLineDiscount(item.discountPercent ?? 0);
    setKit(item.kit || kitOf(item.title));
  }, [item.id, item.price, item.qty, item.unitPrice, item.discountPercent, item.kit, item.title]);
  const commit = (next: { qty: number; unitPrice: number; discountPercent: number; kit: string }) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void api(`/workspace/plans/${planId}/items/${item.id}`, { method: 'POST', body: JSON.stringify(next) }).then(() => onSaved()).catch(() => undefined);
    }, 350);
  };
  const dim = tooth != null && item.toothNum !== tooth;
  const parts = consumablesFor(item.title, catalog.services, catalog.stock);
  const explanation = explainPrice(item.price, parts);
  return (
    <li className={dim ? 'dim' : tooth === item.toothNum ? 'hot' : ''}>
      <span className="jn-badge">{item.toothNum ?? '—'}</span>
      <Mini surfaces={item.surfaces} />
      <div>
        <b>{item.title}</b>
        <span className="jn-edit">
          <label>Кол-во<input aria-label={`Количество ${item.title}`} type="number" min={1} value={qty} onChange={(event) => { const next = Math.max(1, Number(event.target.value) || 1); setQty(next); commit({ qty: next, unitPrice: unit, discountPercent: lineDiscount, kit }); }} /></label>
          <label>Цена<input aria-label={`Цена ${item.title}`} type="number" min={0} value={unit} onChange={(event) => { const next = Math.max(0, Number(event.target.value) || 0); setUnit(next); commit({ qty, unitPrice: next, discountPercent: lineDiscount, kit }); }} /></label>
          <label>Скидка %<input aria-label={`Скидка ${item.title}`} type="number" min={0} max={100} value={lineDiscount} onChange={(event) => { const next = Math.min(100, Math.max(0, Number(event.target.value) || 0)); setLineDiscount(next); commit({ qty, unitPrice: unit, discountPercent: next, kit }); }} /></label>
          <label>Расходники<input aria-label={`Расходники ${item.title}`} value={kit} onChange={(event) => { setKit(event.target.value); commit({ qty, unitPrice: unit, discountPercent: lineDiscount, kit: event.target.value }); }} /></label>
        </span>
      </div>
      <em>{formatMoney(item.price)}</em>
      {show && (
        <details className="jn-fold">
          <summary>Расшифровка</summary>
          <BreakdownTable lines={explanation.lines} />
          {owner && <p className="jn-own">Себестоимость {formatMoney(explanation.internalCost)} · маржа {formatMoney(explanation.margin)}</p>}
        </details>
      )}
      {owner && explanation.overflow && <p className="jn-flag">Расходники дороже цены на {formatMoney(explanation.overflowAmount)}. Работа врача — 0 ₽.</p>}
      {owner && !explanation.overflow && explanation.internalCost > item.price && <p className="jn-flag">Себестоимость расходников выше цены на {formatMoney(explanation.internalCost - item.price)}.</p>}
      {owner && !show && <p className="jn-own">Себестоимость {formatMoney(explanation.internalCost)} · маржа {formatMoney(explanation.margin)}</p>}
    </li>
  );
}

function Mini({ surfaces }: { surfaces: string[] }) {
  const on = new Set(surfaces);
  const cells = ['B', 'M', 'O', 'D', 'L'];
  return (
    <span className="jn-mini" aria-hidden>
      {cells.map((cell) => <i key={cell} className={on.has(cell) || on.has('TOOTH') ? 'on' : ''} />)}
    </span>
  );
}

function useCount(value: number) {
  const [n, setN] = useState(value);
  useEffect(() => {
    let frame = 0;
    const from = n;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 500);
      setN(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return n;
}
