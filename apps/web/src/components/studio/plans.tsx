'use client';

import Link from 'next/link';
import { formatMoney } from '@/lib/format';

export type PlanItem = {
  id: string;
  title: string;
  toothNum: number | null;
  surfaces: string[];
  price: number;
  discountPercent: number;
  status: string;
  result: string;
  kit?: string;
};
export type Phase = {
  id: string;
  title: string;
  specialty: string | null;
  healingDays: number;
  dependsOnTitle: string | null;
  waitDays: number;
  items: PlanItem[];
};
export type PlanCard = {
  id: string;
  tier: string | null;
  tierLabel: string;
  title: string;
  status: string;
  total: number;
  discountPercent: number;
  guaranteeMonths: number;
  durationWeeks: number;
  installmentMonths: number;
  signedAt: string | null;
  explanation: string;
  phases: Phase[];
  looseItems: PlanItem[];
};
export type Family = { key: string; title: string; plans: PlanCard[] };

const STATUS: Record<string, string> = {
  PROPOSED: 'предложен',
  ACCEPTED: 'принят',
  IN_PROGRESS: 'в работе',
  COMPLETED: 'закрыт',
  REJECTED: 'не выбран',
  DRAFT: 'черновик',
  CANCELLED: 'отменён',
};

export function PlanBoard({
  families,
  activeId,
  onPick,
  onBuild,
  onAbandon,
  building,
}: {
  families: Family[];
  activeId: string | null;
  onPick: (id: string) => void;
  onBuild: () => void;
  onAbandon: (id: string) => void;
  building: boolean;
}) {
  if (!families.length) {
    return (
      <div className="sd-card sd-stack">
        <strong>Планов пока нет</strong>
        <p className="sd-muted">Отметьте кариес или зуб к удалению на формуле и соберите три варианта: эконом, оптимум и премиум. Цены берутся из прайса, этапы ждут заживления.</p>
        <button className="sd-btn" type="button" disabled={building} onClick={onBuild}>{building ? 'Собираем…' : 'Собрать 3 варианта по формуле'}</button>
      </div>
    );
  }
  return (
    <div className="sd-stack">
      {families.map((family) => (
        <section key={family.key}>
          <div className="sd-h">
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>{family.title}</h2>
              <p>Рядом: цена, срок, гарантия и рассрочка. Выбранный столбец рисуется на формуле.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link className="sd-btn" href={`/present/${family.key}`}>Показать пациенту</Link>
              {family.plans.some((plan) => plan.status === 'PROPOSED') && (
                <button className="sd-btn-ghost" type="button" onClick={() => onAbandon(family.plans[0].id)}>В брошенные</button>
              )}
            </div>
          </div>
          <div className="sd-plans">
            {family.plans.map((plan) => (
              <article key={plan.id} className={`sd-plan ${activeId === plan.id ? 'pick' : ''}`}>
                <header>
                  <b>{plan.tierLabel}</b>
                  <span className="sd-muted">{STATUS[plan.status] ?? plan.status}</span>
                </header>
                <div className="price">{formatMoney(plan.total)}</div>
                <p className="sd-muted">{plan.durationWeeks} нед. · гарантия {plan.guaranteeMonths} мес. · {plan.installmentMonths >= 2 ? `рассрочка ${plan.installmentMonths} мес.` : 'без рассрочки'}</p>
                {(plan.phases.length ? plan.phases : [{ id: 'loose', title: 'Позиции', specialty: null, healingDays: 0, dependsOnTitle: null, waitDays: 0, items: plan.looseItems }]).map((phase) => (
                  <div className="sd-phase" key={phase.id}>
                    <b>{phase.title}</b>
                    {phase.dependsOnTitle && phase.waitDays > 0 && <div className="sd-muted">после «{phase.dependsOnTitle}», пауза {phase.waitDays} дн.</div>}
                    {phase.specialty && <div className="sd-muted">{phase.specialty}{phase.healingDays ? ` · заживление ${phase.healingDays} дн.` : ''}</div>}
                    {phase.items.map((item) => (
                      <div key={item.id}>{item.title}{item.toothNum ? ` · ${item.toothNum}` : ''}{item.surfaces.length ? ` ${item.surfaces.join('')}` : ''} · {formatMoney(item.price)}{item.discountPercent ? ` (−${item.discountPercent}%)` : ''}</div>
                    ))}
                  </div>
                ))}
                <p>{plan.explanation}</p>
                <button className="sd-btn-ghost" type="button" onClick={() => onPick(plan.id)}>Смотреть на формуле</button>
              </article>
            ))}
          </div>
        </section>
      ))}
      <button className="sd-btn-ghost" type="button" disabled={building} onClick={onBuild}>{building ? 'Собираем…' : 'Новое сравнение по текущей формуле'}</button>
    </div>
  );
}
