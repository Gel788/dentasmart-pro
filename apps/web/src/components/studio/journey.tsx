'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ToothChart, type ChartItem, type ChartSurface } from '@/components/studio/chart';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Family } from '@/components/studio/plans';

const PHASE_ICON: Record<string, string> = {
  Терапия: '✦',
  Хирургия: '✚',
  Ортопедия: '◈',
  Гигиена: '✧',
};

export function PlanJourney({
  patientId,
  patientName,
  familyKey,
  surfaces,
  families,
  activeId,
  onPick,
  onBuild,
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
  building: boolean;
}) {
  const router = useRouter();
  const plans = families.flatMap((family) => family.plans);
  const plan = plans.find((item) => item.id === activeId) ?? plans[0];
  const economy = plans.find((item) => item.tier === 'ECONOM');
  const [tooth, setTooth] = useState<number | null>(null);
  const [discount, setDiscount] = useState(plan?.discountPercent ?? 0);
  const [saved, setSaved] = useState('');
  const [sent, setSent] = useState('');

  useEffect(() => { setDiscount(plan?.discountPercent ?? 0); }, [plan?.id, plan?.discountPercent]);

  const phases = plan
    ? (plan.phases.length ? plan.phases : [{ id: 'loose', title: 'Позиции', specialty: null, healingDays: 0, dependsOnTitle: null, waitDays: 0, items: plan.looseItems }])
    : [];
  const visibleItems = phases.flatMap((phase) => phase.items);
  const chartItems: ChartItem[] = tooth
    ? visibleItems.filter((item) => item.toothNum === tooth)
    : visibleItems;
  const subtotal = visibleItems.reduce((sum, item) => sum + item.price, 0);
  const total = Math.round(subtotal * (1 - discount / 100));
  const months = plan && plan.installmentMonths >= 2 ? plan.installmentMonths : 1;
  const perMonth = Math.round(total / months);
  const animated = useCount(total);

  const save = async () => {
    if (!plan) return;
    setSaved('Сохраняем…');
    try {
      const result = await api<{ savedAt: string }>(`/workspace/plans/${plan.id}/save`, {
        method: 'POST',
        body: JSON.stringify({ discountPercent: discount }),
      });
      setSaved(`Сохранено ${new Date(result.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
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

  if (!plan) {
    return (
      <div className="jn-empty">
        <span />
        <h2>Плана ещё нет</h2>
        <p>Отметьте кариес на формуле — соберём три варианта с этапами и ценами.</p>
        <button className="sd-btn" type="button" disabled={building} onClick={onBuild}>{building ? 'Собираем…' : 'Собрать эконом, оптимум и премиум'}</button>
      </div>
    );
  }

  return (
    <div className="jn">
      <div className="jn-tabs">
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
      </div>
      <div className="jn-stage">
        <section className="jn-chart">
          <div className="jn-kicker">Формула · клик по зубу фильтрует этап</div>
          <ToothChart
            surfaces={surfaces}
            items={chartItems}
            view="plan"
            formula="ADULT"
            condition="CARIES"
            selected={tooth}
            onCondition={() => undefined}
            onPaint={() => undefined}
            quiet
            onSelect={(next) => setTooth((current) => current === next ? null : next)}
          />
          {tooth && <button className="sd-btn-ghost" type="button" onClick={() => setTooth(null)}>Показать все зубы</button>}
        </section>
        <section className="jn-road">
          {phases.map((phase, index) => {
            const done = phase.items.filter((item) => item.status === 'DONE' || item.status === 'ACCEPTED').length;
            const progress = phase.items.length ? Math.round((done / phase.items.length) * 100) : 0;
            const minutes = phase.items.reduce((sum, item) => sum + 40, 0);
            const price = phase.items.reduce((sum, item) => sum + item.price, 0);
            const icon = PHASE_ICON[phase.specialty ?? ''] ?? String(index + 1);
            return (
              <article key={phase.id} className="jn-phase">
                <div className="jn-node">{icon}</div>
                <div className="jn-card">
                  <header>
                    <div>
                      <b>{phase.title}</b>
                      <p>{phase.specialty ?? 'Этап'} · {Math.max(30, minutes)} мин{phase.healingDays ? ` · заживление ${phase.healingDays} дн.` : ''}</p>
                    </div>
                    <div className="jn-ring" style={{ ['--p' as string]: String(progress) }}><strong>{formatMoney(price)}</strong></div>
                  </header>
                  {phase.dependsOnTitle && <p className="jn-wait">После «{phase.dependsOnTitle}» пауза {phase.waitDays} дн.</p>}
                  <ul>
                    {phase.items.map((item) => {
                      const dim = tooth != null && item.toothNum !== tooth;
                      return (
                        <li key={item.id} className={dim ? 'dim' : tooth === item.toothNum ? 'hot' : ''}>
                          <span className="jn-badge">{item.toothNum ?? '—'}</span>
                          <Mini surfaces={item.surfaces} />
                          <div>
                            <b>{item.title}</b>
                            <span className="jn-kit">{kitOf(item.title)}</span>
                          </div>
                          <em>{formatMoney(item.price)}</em>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            );
          })}
        </section>
      </div>
      <div className="jn-dock">
        <div>
          <span>Итого</span>
          <strong>{formatMoney(animated)}</strong>
        </div>
        <label>Скидка %
          <input type="number" min={0} max={40} value={discount} onChange={(event) => setDiscount(Number(event.target.value))} />
        </label>
        <div>
          <span>{months > 1 ? `Рассрочка ${months} мес.` : 'Одним платежом'}</span>
          <strong>{formatMoney(perMonth)}{months > 1 ? '/мес' : ''}</strong>
        </div>
        <div className="jn-actions">
          <button className="sd-btn-ghost" type="button" onClick={() => void save()}>Сохранить</button>
          <button className="sd-btn-ghost" type="button" onClick={() => window.open(`/print/plan/${plan.id}`, '_blank')}>Печать / PDF</button>
          <button className="sd-btn-ghost" type="button" onClick={() => void send()}>Пациенту</button>
          <button className="sd-btn" type="button" onClick={() => familyKey && router.push(`/present/${familyKey}`)}>Показать</button>
        </div>
        {(saved || sent) && <p className="jn-note">{saved}{saved && sent ? ' · ' : ''}{sent}</p>}
      </div>
    </div>
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

function kitOf(title: string) {
  const text = title.toLowerCase();
  if (text.includes('канал')) return 'файлы · гипохлорит · коффердам';
  if (text.includes('корон')) return 'цирконий · силикон · цемент';
  if (text.includes('имплант')) return 'имплант · шов · артикаин';
  if (text.includes('удал')) return 'артикаин ×2 · марля';
  if (text.includes('гигиен') || text.includes('отбел')) return 'air flow · фторлак';
  if (text.includes('кариес') || text.includes('пломб')) return 'композит A2 · бонд · матрица';
  return 'перчатки · маска';
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

