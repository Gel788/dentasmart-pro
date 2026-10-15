'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { PLAN_ITEM_STATUS, PLAN_STATUS, formatMoney, label } from '@/lib/format';

type PrintPlan = {
  title: string;
  status: string;
  totalPrice: string;
  discountPercent?: string | number;
  notes?: string | null;
  acceptedAt?: string | null;
  validUntil?: string | null;
  patient: { firstName: string; lastName: string; middleName?: string | null; phone?: string | null };
  doctor?: { firstName: string; lastName: string; specialization?: string | null } | null;
  items: {
    id: string;
    title: string;
    phase?: number;
    toothNum?: number | null;
    surfaces?: string[];
    price: string;
    listPrice?: string | null;
    discountPercent?: string | number | null;
    status?: string;
  }[];
  organization?: { name: string };
};

export default function PlanPrintPage() {
  const { planId } = useParams<{ planId: string }>();
  const [plan, setPlan] = useState<PrintPlan | null>(null);

  useEffect(() => {
    api<PrintPlan>(`/clinical/treatment-plans/${planId}`).then(setPlan);
  }, [planId]);

  if (!plan) {
    return (
      <Protected>
        <p className="p-8 text-sm text-[var(--muted)]">Готовим план…</p>
      </Protected>
    );
  }

  const phases = [...new Set(plan.items.map((item) => item.phase ?? 1))].sort((a, b) => a - b);
  const patient = [plan.patient.lastName, plan.patient.firstName, plan.patient.middleName].filter(Boolean).join(' ');

  return (
    <Protected>
      <div className="mx-auto mb-4 flex max-w-3xl justify-end gap-2 print:hidden">
        <Button onClick={() => window.print()}>Печать / PDF</Button>
      </div>
      <article className="ds-card mx-auto max-w-3xl bg-white p-8 text-[#1c1915] print:fixed print:inset-0 print:z-[80] print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">Седракович Дент · план лечения</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl">{plan.title}</h1>
        <p className="mt-2 text-sm text-[#74695d]">
          {patient}
          {plan.patient.phone ? ` · ${plan.patient.phone}` : ''}
          {plan.doctor ? ` · врач ${plan.doctor.lastName} ${plan.doctor.firstName}` : ''}
        </p>
        <p className="mt-1 text-sm">Статус: {label(PLAN_STATUS, plan.status)}</p>
        {plan.notes && <p className="mt-4 text-sm leading-relaxed">{plan.notes}</p>}

        {phases.map((phase) => (
          <section key={phase} className="mt-6">
            <h2 className="text-sm font-semibold">Этап {phase}</h2>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-[#74695d]">
                  <th className="py-2">Услуга</th>
                  <th className="py-2">Зуб</th>
                  <th className="py-2 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {plan.items
                  .filter((item) => (item.phase ?? 1) === phase && item.status !== 'REJECTED')
                  .map((item) => (
                    <tr key={item.id} className="border-b border-[#e3dcd0]">
                      <td className="py-2">
                        {item.title}
                        <span className="block text-xs text-[#74695d]">{label(PLAN_ITEM_STATUS, item.status || 'PROPOSED')}</span>
                      </td>
                      <td className="py-2 tabular-nums">
                        {item.toothNum ?? '—'}
                        {item.surfaces?.length ? ` ${item.surfaces.join('')}` : ''}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(item.price)}
                        {Number(item.discountPercent) > 0 && (
                          <span className="block text-xs text-[#74695d]">скидка {Number(item.discountPercent)}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}

        <p className="mt-6 text-right text-lg font-semibold">Итого {formatMoney(plan.totalPrice)}</p>
        {Number(plan.discountPercent) > 0 && (
          <p className="text-right text-xs text-[#74695d]">Включая скидку плана {Number(plan.discountPercent)}%</p>
        )}

        <div className="mt-10 grid gap-8 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#74695d]">Пациент согласен с планом и стоимостью</p>
            <div className="mt-8 border-b border-[#1c1915]" />
            <p className="mt-1 text-xs text-[#74695d]">{plan.acceptedAt ? `Согласовано ${new Date(plan.acceptedAt).toLocaleDateString('ru-RU')}` : 'Подпись и дата'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#74695d]">Врач</p>
            <div className="mt-8 border-b border-[#1c1915]" />
            <p className="mt-1 text-xs text-[#74695d]">{plan.doctor ? `${plan.doctor.lastName} ${plan.doctor.firstName}` : 'Подпись'}</p>
          </div>
        </div>
      </article>
    </Protected>
  );
}
