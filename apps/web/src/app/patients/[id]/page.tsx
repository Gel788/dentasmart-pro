'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Protected } from '@/components/protected';
import { ToothChart, type ChartItem, type ChartSurface } from '@/components/studio/chart';
import { PerioChart } from '@/components/studio/perio';
import { ImagingBoard } from '@/components/studio/imaging';
import { PlanJourney } from '@/components/studio/journey';
import { MarketStrip } from '@/components/studio/market-strip';
import { type Family, type PlanCard } from '@/components/studio/plans';
import { PatientForm } from '@/components/studio/patient-form';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { useFocus } from '@/lib/focus';

type Alert = { tone: 'danger' | 'warning' | 'info'; text: string };
type Card = {
  patient: {
    id: string; firstName: string; lastName: string; birthDate: string | null; phone: string | null;
    allergies: string[]; chronicConditions: string | null; medications: string | null; anamnesis: string | null;
  };
  debt: number;
  alerts: Alert[];
  timeline: { id: string; at: string; kind: string; title: string; detail: string }[];
  chart: { surfaces: ChartSurface[]; events: { id: string; toothNum: number; note: string | null; condition: string; at: string }[] };
  perio: { notes: string | null; teeth: { toothNum: number; mobility: number; furcation: number; missing: boolean; sites: { position: number; pocket: number; recession: number; bleeding: boolean }[] }[] } | null;
  families: Family[];
};

export default function PatientPage() {
  return <Protected><CardScreen /></Protected>;
}

function CardScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = user?.permissions.includes('patient.write') ?? false;
  const { setPanelOpen } = useFocus();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'plan' | 'formula' | 'perio' | 'imaging' | 'care'>('plan');
  const [view, setView] = useState<'before' | 'plan' | 'after'>('before');
  const [formula, setFormula] = useState<'ADULT' | 'CHILD' | 'MIXED'>('ADULT');
  const [tool, setTool] = useState('CARIES');
  const [tooth, setTooth] = useState<number | null>(16);
  const [face, setFace] = useState('TOOTH');
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const load = () => api<Card>(`/workspace/patients/${params.id}/card`).then((data) => {
    setCard(data);
    const all = data.families.flatMap((family) => family.plans);
    const best = [...data.families].sort((a, b) => b.plans.length - a.plans.length)[0];
    setActivePlan((current) => (current && all.some((plan) => plan.id === current) ? current : best?.plans.find((plan) => plan.tier === 'OPTIMUM')?.id ?? best?.plans[0]?.id ?? null));
  }).catch((err: Error) => setError(err.message));

  const [modeReady, setModeReady] = useState(false);

  useEffect(() => {
    setPanelOpen(false);
    const saved = sessionStorage.getItem(`sd.card.${params.id}.mode`);
    if (saved === 'plan' || saved === 'formula' || saved === 'perio' || saved === 'imaging' || saved === 'care') setMode(saved);
    setModeReady(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!modeReady) return;
    sessionStorage.setItem(`sd.card.${params.id}.mode`, mode);
  }, [mode, params.id, modeReady]);

  const plans = useMemo(() => card?.families.flatMap((family) => family.plans) ?? [], [card]);
  const picked: PlanCard | undefined = plans.find((plan) => plan.id === activePlan) ?? plans[0];
  const items: ChartItem[] = picked
    ? [...picked.phases.flatMap((phase) => phase.items), ...picked.looseItems]
    : [];

  const paint = async (toothNum: number, surface: string) => {
    await api(`/workspace/patients/${params.id}/chart`, {
      method: 'POST',
      body: JSON.stringify({ toothNum, surface, condition: surface === 'TOOTH' && tool === 'CARIES' ? 'CARIES' : tool, diagnosis: 'Осмотр' }),
    });
    await load();
  };

  if (error) return <p>{error}</p>;
  if (!card) return (
    <div className="sd-skel-page">
      <div className="sd-skel" style={{ width: 240, height: 32 }} />
      <div className="sd-skel" style={{ height: 36 }} />
      <div className="sd-skel" style={{ height: 220 }} />
    </div>
  );
  const age = card.patient.birthDate ? years(card.patient.birthDate) : null;
  const history = card.chart.events.filter((event) => event.toothNum === tooth).slice(0, 5);

  return (
    <div className="sd-stack">
      <div className="sd-h" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1>{card.patient.lastName} {card.patient.firstName}</h1>
          <p>{age != null ? `${age} лет` : 'возраст не указан'}{card.patient.phone ? ` · ${card.patient.phone}` : ''} · {card.debt > 0 ? `долг ${formatMoney(card.debt)}` : 'долга нет'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canWrite && <button className="sd-btn-ghost" type="button" onClick={() => setEditing(true)}>Изменить</button>}
          <div className="sd-seg">
            <button type="button" className={mode === 'plan' ? 'on' : ''} onClick={() => setMode('plan')}>План</button>
            <button type="button" className={mode === 'formula' ? 'on' : ''} onClick={() => setMode('formula')}>Формула</button>
            <button type="button" className={mode === 'perio' ? 'on' : ''} onClick={() => setMode('perio')}>Пародонт</button>
            <button type="button" className={mode === 'imaging' ? 'on' : ''} onClick={() => setMode('imaging')}>Снимки</button>
            <button type="button" className={mode === 'care' ? 'on' : ''} onClick={() => setMode('care')}>Сопровождение</button>
          </div>
        </div>
      </div>
      <PatientForm
        open={editing}
        patientId={params.id}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); void load(); }}
        onArchived={() => router.push('/patients')}
      />
      {card.alerts.length > 0 && (
        <div className="sd-alertbar">
          {card.alerts.map((alert) => <span key={alert.text} className={`sd-chip ${alert.tone}`}>{alert.text}</span>)}
        </div>
      )}
      {mode === 'plan' ? (
        <PlanJourney
          patientId={params.id}
          patientName={`${card.patient.lastName} ${card.patient.firstName}`}
          familyKey={(card.families.find((family) => family.plans.some((plan) => plan.id === picked?.id)) ?? [...card.families].sort((a, b) => b.plans.length - a.plans.length)[0])?.key ?? null}
          surfaces={card.chart.surfaces}
          families={card.families}
          activeId={picked?.id ?? null}
          onPick={setActivePlan}
          building={building}
          onAdded={() => load()}
          onBuild={async () => {
            setBuilding(true);
            try { await api('/workspace/plans/from-chart', { method: 'POST', body: JSON.stringify({ patientId: params.id }) }); await load(); }
            catch (err) { setError(err instanceof Error ? err.message : 'Не собрали план'); }
            finally { setBuilding(false); }
          }}
        />
      ) : null}
      {mode === 'care' ? <MarketStrip patientId={params.id} /> : null}
      {(mode === 'formula' || mode === 'perio' || mode === 'imaging') && <div className="sd-split">
        <section className="sd-card sd-stack">
          {mode === 'formula' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div className="sd-seg">
                <button type="button" className={view === 'before' ? 'on' : ''} onClick={() => setView('before')}>Было</button>
                <button type="button" className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')}>План</button>
                <button type="button" className={view === 'after' ? 'on' : ''} onClick={() => setView('after')}>Стало</button>
              </div>
              <div className="sd-seg">
                <button type="button" className={formula === 'ADULT' ? 'on' : ''} onClick={() => setFormula('ADULT')}>Взрослая</button>
                <button type="button" className={formula === 'CHILD' ? 'on' : ''} onClick={() => setFormula('CHILD')}>Молочная</button>
                <button type="button" className={formula === 'MIXED' ? 'on' : ''} onClick={() => setFormula('MIXED')}>Смешанная</button>
              </div>
            </div>
          )}
          {mode === 'imaging' ? (
            <ImagingBoard patientId={params.id} tooth={tooth} />
          ) : mode === 'formula' ? (
            <ToothChart
              surfaces={card.chart.surfaces}
              items={view === 'before' ? [] : items}
              view={view}
              formula={formula}
              condition={tool}
              selected={tooth}
              onCondition={setTool}
              onPaint={paint}
              onSelect={(next, surface) => { setTooth(next); setFace(surface || 'TOOTH'); }}
            />
          ) : (
            <PerioChart
              initial={card.perio}
              onSave={async (teeth, notes) => {
                await api(`/workspace/patients/${params.id}/perio`, { method: 'POST', body: JSON.stringify({ notes, teeth }) });
                await load();
              }}
            />
          )}
          {tooth && (
            <div>
              <strong>Зуб {tooth}{face !== 'TOOTH' ? ` · ${face}` : ''}</strong>
              {history.length === 0 && <p className="sd-muted">Истории пока нет.</p>}
              {history.map((event) => <div key={event.id} className="sd-muted">{new Date(event.at).toLocaleDateString('ru-RU')} · {event.condition}{event.note ? ` · ${event.note}` : ''}</div>)}
            </div>
          )}
          <p className="sd-muted">{card.patient.anamnesis}</p>
          <p className="sd-muted">{[card.patient.chronicConditions, card.patient.medications].filter(Boolean).join(' · ')}</p>
        </section>
        <section className="sd-card">
          <strong>Лента</strong>
          <div className="sd-timeline">
            {card.timeline.map((event) => (
              <div className="sd-tl" key={event.id}>
                <i />
                <div>
                  <b>{event.title}</b>
                  <div>{event.detail}</div>
                  <small>{new Date(event.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>}
    </div>
  );
}

function years(value: string) {
  const born = new Date(value);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now < new Date(born.setFullYear(now.getFullYear()))) age -= 1;
  return age;
}
