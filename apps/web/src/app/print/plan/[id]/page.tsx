'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Protected } from '@/components/protected';
import { BreakdownTable } from '@/components/studio/breakdown-table';
import { api } from '@/lib/api';
import { consumablesFor, patientLines, type CatalogService, type CatalogStock } from '@/lib/breakdown';
import { formatMoney } from '@/lib/format';
import type { Phase, PlanCard } from '@/components/studio/plans';

type Sheet = {
  clinic: string;
  city: string;
  patient: { firstName: string; lastName: string };
  doctor: string;
  plan: PlanCard;
  parts: { dueDate: string; amount: number }[];
  share: string;
};

export default function PrintPlanPage() {
  return <Protected bare><SheetBody /></Protected>;
}

function SheetBody() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Sheet | null>(null);
  const [catalog, setCatalog] = useState<{ services: CatalogService[]; stock: CatalogStock[] }>({ services: [], stock: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    Promise.all([
      api<Sheet>(`/workspace/plans/${params.id}/sheet`),
      api<{ services: CatalogService[]; stock: CatalogStock[] }>('/config').catch(() => ({ services: [] as CatalogService[], stock: [] as CatalogStock[] })),
    ]).then(([sheet, config]) => {
      if (!live) return;
      setData(sheet);
      setCatalog({ services: config.services ?? [], stock: config.stock ?? [] });
    }).catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [params.id]);
  if (error) return <p>{error}</p>;
  if (!data) return <p style={{ padding: 24 }}>Собираем лист…</p>;
  const link = data.share ? `${window.location.origin}${data.share}` : window.location.href;
  return (
    <div>
      <div className="pr-actions" style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12 }}>
        <button className="sd-btn" type="button" onClick={() => window.print()}>Сохранить PDF / печатать</button>
      </div>
      <article className="pr-page">
        <header className="pr-cover">
          <div>
            <strong>Седракович Дент</strong>
            <div>Sedrakovich Dent · {data.city}</div>
          </div>
          <div>
            <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 12, color: '#0f766e' }}>План лечения</div>
            <h1>{data.plan.tierLabel}</h1>
            <div className="pr-name">{data.patient.lastName} {data.patient.firstName}</div>
          </div>
        </header>
        <p>Гарантия {data.plan.guaranteeMonths} мес. · срок около {data.plan.durationWeeks} нед. · цена действительна 14 дней.</p>
        <h2>Этапы</h2>
        <PlanStages plan={data.plan} catalog={catalog} />
        <p className="pr-grand">Итого {formatMoney(data.plan.total)}</p>
        {data.parts.length > 0 && (
          <>
            <h2>График платежей</h2>
            {data.parts.map((part) => (
              <div key={part.dueDate} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{new Date(part.dueDate).toLocaleDateString('ru-RU')}</span>
                <span>{formatMoney(part.amount)}</span>
              </div>
            ))}
          </>
        )}
        <footer style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, alignItems: 'end' }}>
          <div>
            <div>Врач {data.doctor}</div>
            <div style={{ marginTop: 28, borderTop: '1px solid #1c1917', width: 180 }}>подпись</div>
            <div style={{ marginTop: 18 }}>Пациент {data.patient.lastName}</div>
            <div style={{ marginTop: 28, borderTop: '1px solid #1c1917', width: 180 }}>подпись</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Qr text={link} />
            <div style={{ fontSize: 11, maxWidth: 160 }}>{link}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

function PlanStages({ plan, catalog }: { plan: PlanCard; catalog: { services: CatalogService[]; stock: CatalogStock[] } }) {
  const show = plan.showBreakdown !== false;
  const stages: Phase[] = plan.phases.length
    ? plan.phases
    : [{ id: 'loose', title: 'Позиции', specialty: null, healingDays: 0, dependsOnTitle: null, waitDays: 0, items: plan.looseItems }];
  return (
    <>
      {stages.map((phase) => {
        const subtotal = phase.items.reduce((sum, item) => sum + item.price, 0);
        return (
          <section key={phase.id} className="pr-phase" data-breakdown={show ? 'on' : 'off'}>
            <h3>{phase.title}</h3>
            <div className="pr-meta">{phase.specialty}{phase.healingDays ? ` · заживление ${phase.healingDays} дн.` : ''}</div>
            {phase.items.map((item) => (
              <div key={item.id}>
                <div className="pr-svc">
                  <span>{item.toothNum ? `Зуб ${item.toothNum} · ` : ''}{item.title}{item.surfaces.length ? ` (${item.surfaces.join('')})` : ''}</span>
                  <b>{formatMoney(item.price)}</b>
                </div>
                {show && <BreakdownTable lines={patientLines(item.price, consumablesFor(item.title, catalog.services, catalog.stock))} />}
              </div>
            ))}
            <div className="pr-sub"><span>Подытог</span><b>{formatMoney(subtotal)}</b></div>
          </section>
        );
      })}
    </>
  );
}

function Qr({ text }: { text: string }) {
  const cells = 21;
  const bits = Array.from({ length: cells * cells }, (_, index) => {
    let hash = 0;
    const seed = `${text}:${index}`;
    for (let i = 0; i < seed.length; i++) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
    const edge = index % cells === 0 || Math.floor(index / cells) === 0 || index % cells > cells - 3 || Math.floor(index / cells) > cells - 3;
    const finder = (index % cells < 4 && Math.floor(index / cells) < 4) || (index % cells > cells - 5 && Math.floor(index / cells) < 4);
    return finder || (!edge && hash % 3 !== 0);
  });
  return (
    <svg viewBox={`0 0 ${cells} ${cells}`} width="96" height="96" role="img" aria-label={text}>
      {bits.map((on, index) => on ? <rect key={index} x={index % cells} y={Math.floor(index / cells)} width="1" height="1" fill="#10211c" /> : null)}
    </svg>
  );
}
