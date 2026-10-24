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
  const [addNote, setAddNote] = useState('');
  const [starting, setStarting] = useState(false);
  const [sent, setSent] = useState('');
  const [versions, setVersions] = useState<{ id: string; note: string | null; createdAt: string }[] | null>(null);
  const [payMonths, setPayMonths] = useState(plan && plan.installmentMonths >= 2 ? plan.installmentMonths : 1);
  const [aiOn, setAiOn] = useState(true);
  const marker = useRef<((tooth: number) => boolean) | null>(null);

  useEffect(() => { setDiscount(plan?.discountPercent ?? 0); }, [plan?.id, plan?.discountPercent]);
  useEffect(() => { setPayMonths(plan && plan.installmentMonths >= 2 ? plan.installmentMonths : 1); }, [plan?.id, plan?.installmentMonths]);
  useEffect(() => { setDisclosure(plan?.showBreakdown !== false); }, [plan?.id, plan?.showBreakdown]);
  const shownPlan = useRef(plan?.id);
  useEffect(() => {
    // Switching plans clears the picker; the first plan appearing (just created for a service) keeps it open.
    if (shownPlan.current && shownPlan.current !== plan?.id) { setPicker(null); setTooth(null); }
    shownPlan.current = plan?.id;
  }, [plan?.id]);
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
    setAddNote('');
    try {
      await api(`/workspace/plans/${plan.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ phaseId, serviceId: service.id, toothNum: targetTooth }),
      });
      await onAdded();
      setAddNote(`Добавлено: ${service.name}${targetTooth ? ` · зуб ${targetTooth}` : ''}`);
      setPicker(null);
    } catch (err) {
      setAddNote(err instanceof Error ? `Не добавили: ${err.message}` : 'Не добавили услугу. Попробуйте ещё раз');
      setPicker(null);
    }
  };

  /** A patient without a plan gets an empty draft first, then the price list opens. */
  const openPicker = async (forTooth: number | null) => {
    if (plan) { setPicker({ phaseId: defaultPhaseId(), tooth: forTooth }); return; }
    setStarting(true);
    setAddNote('');
    try {
      await api(`/workspace/patients/${patientId}/plans`, { method: 'POST', body: '{}' });
      await onAdded();
      setPicker({ phaseId: 'loose', tooth: forTooth });
    } catch (err) {
      setAddNote(err instanceof Error ? `Не создали план: ${err.message}` : 'Не создали план. Попробуйте ещё раз');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="jn">
      {plan && <div className="jn-tabs" role="group" aria-label="Варианты плана">
        {plans.map((item) => {
          const delta = economy ? item.total - economy.total : 0;
          return (
            <button key={item.id} type="button" aria-pressed={item.id === plan.id} className={`jn-tab ${item.id === plan.id ? 'on' : ''} ${item.tier === 'OPTIMUM' ? 'rec' : ''}`} onClick={() => onPick(item.id)}>
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
        <div className="jn-left">
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
        <section className="jn-chart" aria-label="Зубная формула">
          <div className="jn-addbar">
            <p>Нажмите зуб, чтобы добавить услугу на него, или добавьте услугу без зуба</p>
            <button className="sd-btn-ghost" type="button" data-plan-add="global" disabled={starting} onClick={() => void openPicker(tooth)}>{starting ? 'Создаём план…' : '+ Услуга'}</button>
          </div>
          {addNote && <p className="jn-note" role={addNote.startsWith('Не ') ? 'alert' : 'status'}>{addNote}</p>}
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
              onAdd={() => void openPicker(tooth)}
            />
          )}
          {tooth && <button className="sd-btn-ghost" type="button" onClick={() => setTooth(null)}>Показать все зубы</button>}
        </section>
        </div>
        <div className="jn-side">
        {!plan && (
          <div className="jn-empty">
            <h2>Плана ещё нет</h2>
            <p>Отметьте находки слева и нажмите «Собрать план» — получится три варианта с этапами и ценами из прайса. Или добавьте услугу вручную.</p>
            <div>
              <button className="sd-btn" type="button" disabled={starting} onClick={() => void openPicker(tooth)}>{starting ? 'Создаём план…' : '+ Услуга'}</button>
              <button className="sd-btn-ghost" type="button" disabled={building} onClick={onBuild}>{building ? 'Собираем…' : 'По отмеченной формуле'}</button>
            </div>
          </div>
        )}
        {plan && <section className="jn-road" aria-label="Этапы плана">
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
                        <button className="sd-btn-ghost" type="button" onClick={() => void api<{ startsAt: string }>(`/workspace/plans/${plan.id}/phases/${phase.id}/book`, { method: 'POST', body: '{}' }).then((result) => setSaved(`«${phase.title}» записан на ${new Date(result.startsAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)).catch((err: Error) => setSaved(err.message))}>Записать</button>
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
      </div>
      {plan && <div className="jn-dock">
        <div className="jn-sum">
          <span>Итого{discount > 0 ? ` со скидкой ${discount}%` : ''}</span>
          <strong>{formatMoney(animated)}</strong>
          {discount > 0 && <small>без скидки {formatMoney(subtotal)} · скидка −{formatMoney(subtotal - total)}</small>}
          {months > 1 && <small>{formatMoney(perMonth)}/мес · {months} мес.</small>}
        </div>
        <PlanDiscount subtotal={subtotal} percent={discount} onApply={async (next) => {
          const result = await api<{ savedAt: string }>(`/workspace/plans/${plan.id}/save`, { method: 'POST', body: JSON.stringify({ discountPercent: next }) });
          setDiscount(next);
          setSaved(`Скидка ${next}% сохранена ${new Date(result.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
          await onAdded();
        }} />
        <label className="jn-months">Оплата
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
        <div className="jn-actions">
          <details className="jn-more">
            <summary>Ещё</summary>
            <div className="jn-menu">
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
                  Показывать расшифровку пациенту
                </label>
              )}
              {months > 1 && <small className="jn-pay">{schedule.map((part) => `${part.index}. ${formatMoney(part.amount)}`).join(' · ')}</small>}
              <button className="sd-btn-ghost" type="button" onClick={() => void api<{ id: string; note: string | null; createdAt: string }[]>(`/workspace/plans/${plan.id}/versions`).then(setVersions).catch((err: Error) => setSaved(err.message))}>Версии</button>
              <button className="sd-btn-ghost" type="button" onClick={() => window.open(`/print/plan/${plan.id}`, '_blank')}>Печать</button>
              <button className="sd-btn-ghost" type="button" onClick={() => void send()}>Ссылка</button>
              <button className="sd-btn-ghost" type="button" onClick={() => familyKey && router.push(`/smile/${familyKey}`)}>3D</button>
            </div>
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
                {new Date(version.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} {version.note}
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
  // The line is edited as a draft: nothing is saved or reloaded while the numbers are being typed.
  const base = { qty: String(item.qty ?? 1), unit: String(item.unitPrice ?? item.price), discount: String(item.discountPercent ?? 0), kit: item.kit || kitOf(item.title) };
  const [draft, setDraft] = useState(base);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!editing) setDraft({ qty: String(item.qty ?? 1), unit: String(item.unitPrice ?? item.price), discount: String(item.discountPercent ?? 0), kit: item.kit || kitOf(item.title) });
  }, [editing, item.id, item.price, item.qty, item.unitPrice, item.discountPercent, item.kit, item.title]);
  const num = (value: string) => Number(value.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  const qty = Math.max(1, Math.min(99, Math.round(num(draft.qty)) || 1));
  const unit = Math.max(0, num(draft.unit));
  const lineDiscount = Math.min(100, Math.max(0, num(draft.discount)));
  const preview = Math.round(unit * qty * (1 - lineDiscount / 100) * 100) / 100;
  const changed = qty !== (item.qty ?? 1) || unit !== (item.unitPrice ?? item.price) || lineDiscount !== (item.discountPercent ?? 0) || draft.kit !== (item.kit || kitOf(item.title));
  const save = async () => {
    if (!changed || saving) { setEditing(false); return; }
    setSaving(true);
    setError('');
    try {
      await api(`/workspace/plans/${planId}/items/${item.id}`, { method: 'POST', body: JSON.stringify({ qty, unitPrice: unit, discountPercent: lineDiscount, kit: draft.kit }) });
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => { setDraft(base); setEditing(false); setError(''); };
  const [toothOpen, setToothOpen] = useState(false);
  const [toothDraft, setToothDraft] = useState(item.toothNum ? String(item.toothNum) : '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const locked = item.status === 'DONE';
  const saveTooth = async (value: string) => {
    const tooth = value.trim() ? Number(value) : null;
    const quadrant = tooth === null ? 0 : Math.floor(tooth / 10);
    const unit = tooth === null ? 0 : tooth % 10;
    const valid = tooth === null || (quadrant >= 1 && quadrant <= 4 && unit >= 1 && unit <= 8) || (quadrant >= 5 && quadrant <= 8 && unit >= 1 && unit <= 5);
    if (!valid) { setError('Номер зуба по FDI: 11–18, 21–28, 31–38, 41–48 (детские 51–85)'); return; }
    setSaving(true);
    setError('');
    try {
      await api(`/workspace/plans/${planId}/items/${item.id}`, { method: 'POST', body: JSON.stringify({ toothNum: tooth }) });
      setToothOpen(false);
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Зуб не сохранился'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      await api(`/workspace/plans/${planId}/items/${item.id}/remove`, { method: 'POST' });
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалилось'); setConfirmRemove(false); }
    finally { setSaving(false); }
  };
  const onKey = (event: React.KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } if (event.key === 'Escape') cancel(); };
  const dim = tooth != null && item.toothNum !== tooth;
  const parts = consumablesFor(item.title, catalog.services, catalog.stock);
  const explanation = explainPrice(item.price, parts);
  return (
    <li className={dim ? 'dim' : tooth === item.toothNum ? 'hot' : ''}>
      {locked ? <span className="jn-badge">{item.toothNum ?? '—'}</span> : (
        <button type="button" className="jn-badge jn-badge-btn" onClick={() => { setToothDraft(item.toothNum ? String(item.toothNum) : ''); setToothOpen((open) => !open); }} title={item.toothNum ? `Зуб ${item.toothNum} — изменить` : 'Указать зуб'} aria-label={item.toothNum ? `Зуб ${item.toothNum}, изменить` : 'Указать зуб'}>
          {item.toothNum ?? '+зуб'}
        </button>
      )}
      <Mini surfaces={item.surfaces} />
      <div className="jn-line">
        <b>{item.title}</b>
        {((item.qty ?? 1) > 1 || (item.discountPercent ?? 0) > 0) && (
          <small>{(item.qty ?? 1) > 1 ? `${item.qty} × ${formatMoney(item.unitPrice ?? item.price)}` : formatMoney(item.unitPrice ?? item.price)}{(item.discountPercent ?? 0) > 0 ? ` − ${item.discountPercent}%` : ''}</small>
        )}
        {toothOpen && (
          <form className="jn-tooth" onSubmit={(event) => { event.preventDefault(); void saveTooth(toothDraft); }}>
            <label>Зуб (FDI)<input aria-label={`Зуб для ${item.title}`} inputMode="numeric" maxLength={2} value={toothDraft} onChange={(event) => setToothDraft(event.target.value.replace(/\D/g, ''))} placeholder="36" autoFocus /></label>
            <button type="submit" className="sd-btn" disabled={saving}>Сохранить</button>
            {item.toothNum != null && <button type="button" className="sd-btn-ghost" disabled={saving} onClick={() => void saveTooth('')}>Без зуба</button>}
            <button type="button" className="sd-btn-ghost" onClick={() => setToothOpen(false)}>Отмена</button>
          </form>
        )}
        {!editing ? (
          <span className="jn-line-acts">
            <button type="button" className="jn-edit-open" onClick={() => setEditing(true)}>Изменить цену и количество</button>
            {!locked && (confirmRemove ? (
              <span className="jn-remove-ask">Удалить строку?
                <button type="button" className="jn-remove-yes" disabled={saving} onClick={() => void remove()}>{saving ? '…' : 'Удалить'}</button>
                <button type="button" className="jn-edit-open" onClick={() => setConfirmRemove(false)}>Нет</button>
              </span>
            ) : <button type="button" className="jn-remove" onClick={() => setConfirmRemove(true)}>Удалить</button>)}
          </span>
        ) : (
          <div className="jn-edit" onKeyDown={onKey}>
            <label>Кол-во<input aria-label={`Количество ${item.title}`} inputMode="numeric" value={draft.qty} onChange={(event) => setDraft({ ...draft, qty: event.target.value })} autoFocus /></label>
            <label>Цена, ₽<input aria-label={`Цена ${item.title}`} inputMode="decimal" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} /></label>
            <label>Скидка %<input aria-label={`Скидка ${item.title}`} inputMode="numeric" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} /></label>
            <label className="jn-edit-kit">Расходники<input aria-label={`Расходники ${item.title}`} value={draft.kit} onChange={(event) => setDraft({ ...draft, kit: event.target.value })} /></label>
            <p className="jn-edit-sum">
              Итого по строке: <b>{formatMoney(preview)}</b>
              {lineDiscount >= 30 && <span className="jn-edit-warn"> · скидка {lineDiscount}% — проверьте</span>}
              {unit === 0 && <span className="jn-edit-warn"> · цена 0 ₽</span>}
            </p>
            <div className="jn-edit-acts">
              <button type="button" className="sd-btn-ghost" onClick={cancel} disabled={saving}>Отмена</button>
              <button type="button" className="sd-btn" onClick={() => void save()} disabled={saving || !changed}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="jn-edit-warn jn-line-error" role="alert">{error}</p>}
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

/** Discount on the whole plan, in percent or in roubles; saved at once, within the role's limit. */
function PlanDiscount({ subtotal, percent, onApply }: { subtotal: number; percent: number; onApply: (percent: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'pct' | 'rub'>('pct');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const raw = Number(value.replace(',', '.')) || 0;
  const next = mode === 'pct' ? Math.min(100, Math.max(0, raw)) : subtotal > 0 ? Math.min(100, Math.max(0, Math.round((raw / subtotal) * 10000) / 100)) : 0;
  const apply = async (target: number) => {
    setBusy(true);
    setError('');
    try { await onApply(target); setOpen(false); setValue(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Скидка не сохранилась'); }
    finally { setBusy(false); }
  };
  if (!open) {
    return (
      <div className="jn-plan-discount">
        <button type="button" className="sd-btn-ghost" onClick={() => { setOpen(true); setValue(percent ? String(percent) : ''); setMode('pct'); }}>{percent > 0 ? `Скидка ${percent}%` : 'Скидка на итог'}</button>
        {percent > 0 && <button type="button" className="jn-remove" disabled={busy} onClick={() => void apply(0)}>Убрать</button>}
      </div>
    );
  }
  return (
    <form className="jn-plan-discount open" onSubmit={(event) => { event.preventDefault(); void apply(next); }}>
      <div className="sd-seg" role="group" aria-label="Скидка в">
        <button type="button" className={mode === 'pct' ? 'on' : ''} onClick={() => setMode('pct')}>%</button>
        <button type="button" className={mode === 'rub' ? 'on' : ''} onClick={() => setMode('rub')}>₽</button>
      </div>
      <input aria-label={mode === 'pct' ? 'Скидка в процентах' : 'Скидка в рублях'} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === 'pct' ? '10' : '5000'} autoFocus />
      <small>{next > 0 ? `${next}% · −${formatMoney(Math.round(subtotal * next / 100))} · итого ${formatMoney(Math.round(subtotal * (1 - next / 100)))}` : 'без скидки'}</small>
      <button type="submit" className="sd-btn" disabled={busy}>{busy ? '…' : 'Применить'}</button>
      <button type="button" className="sd-btn-ghost" onClick={() => setOpen(false)}>Отмена</button>
      {error && <p className="jn-edit-warn" role="alert">{error}</p>}
    </form>
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
