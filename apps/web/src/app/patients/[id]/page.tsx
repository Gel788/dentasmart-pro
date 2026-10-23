'use client';

import { PatientVisits } from '@/components/card/patient-visits';
import { PatientMoney } from '@/components/card/patient-money';
import { Journal } from '@/components/documents/documents';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Protected } from '@/components/protected';
import { ToothChart, type ChartItem, type ChartSurface } from '@/components/studio/chart';
import { PerioChart } from '@/components/studio/perio';
import { ImagingBoard } from '@/components/studio/imaging';
import { PlanJourney } from '@/components/studio/journey';
import { MarketStrip } from '@/components/studio/market-strip';
import { type Family, type PlanCard } from '@/components/studio/plans';
import { PatientForm } from '@/components/studio/patient-form';
import { RouteView } from '@/components/route/route-view';
import { Dossier } from '@/components/card/dossier';
import { MedicalEditor } from '@/components/card/medical-editor';
import { Overview } from '@/components/card/overview';
import { fmt, type CardAlert, type CardPatient, type FeedItem, type Medical, type NextVisit } from '@/components/card/model';
import styles from '@/components/card/card.module.css';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useFocus } from '@/lib/focus';

type Card = {
  patient: CardPatient;
  medical: Medical;
  debt: number;
  deposit: number;
  nextVisit: NextVisit | null;
  alerts: CardAlert[];
  timeline: FeedItem[];
  chart: { surfaces: ChartSurface[]; events: { id: string; toothNum: number; note: string | null; condition: string; at: string }[] };
  perio: { notes: string | null; teeth: { toothNum: number; mobility: number; furcation: number; missing: boolean; sites: { position: number; pocket: number; recession: number; bleeding: boolean }[] }[] } | null;
  families: Family[];
};

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'medical', label: 'Медкарта' },
  { id: 'visits', label: 'Визиты' },
  { id: 'route', label: 'Маршрут' },
  { id: 'plan', label: 'План' },
  { id: 'formula', label: 'Формула' },
  { id: 'perio', label: 'Пародонт' },
  { id: 'imaging', label: 'Снимки' },
  { id: 'money', label: 'Оплаты' },
  { id: 'docs', label: 'Документы' },
  { id: 'care', label: 'Сопровождение' },
] as const;

type Tab = (typeof TABS)[number]['id'];
const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.id === value);

export default function PatientPage() {
  return <Protected><CardScreen /></Protected>;
}

function CardScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = user?.permissions.includes('patient.write') ?? false;
  const canMedical = user?.permissions.includes('medical.write') ?? false;
  const canMoney = user?.permissions.includes('finance.read') ?? false;
  const { setPanelOpen } = useFocus();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [view, setView] = useState<'before' | 'plan' | 'after'>('before');
  const [formula, setFormula] = useState<'ADULT' | 'CHILD' | 'MIXED'>('ADULT');
  const [tool, setTool] = useState('CARIES');
  const [tooth, setTooth] = useState<number | null>(16);
  const [face, setFace] = useState('TOOTH');
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(
    () =>
      api<Card>(`/workspace/patients/${params.id}/card`)
        .then((data) => {
          setCard(data);
          setError('');
          const all = data.families.flatMap((family) => family.plans);
          const best = [...data.families].sort((a, b) => b.plans.length - a.plans.length)[0];
          setActivePlan((current) => (current && all.some((plan) => plan.id === current) ? current : best?.plans.find((plan) => plan.tier === 'OPTIMUM')?.id ?? best?.plans[0]?.id ?? null));
        })
        .catch((err: Error) => setError(err.message || 'Карта не загрузилась')),
    [params.id],
  );

  useEffect(() => {
    setPanelOpen(false);
    const asked = new URLSearchParams(window.location.search).get('tab');
    const saved = sessionStorage.getItem(`sd.card.${params.id}.mode`);
    setTab(isTab(asked) ? asked : isTab(saved) ? saved : 'overview');
    setReady(true);
    void load();
  }, [params.id, load, setPanelOpen]);

  useEffect(() => {
    if (ready) sessionStorage.setItem(`sd.card.${params.id}.mode`, tab);
  }, [tab, params.id, ready]);

  const plans = useMemo(() => card?.families.flatMap((family) => family.plans) ?? [], [card]);
  const picked: PlanCard | undefined = plans.find((plan) => plan.id === activePlan) ?? plans[0];
  const items: ChartItem[] = picked ? [...picked.phases.flatMap((phase) => phase.items), ...picked.looseItems] : [];

  const paint = async (toothNum: number, surface: string) => {
    await api(`/workspace/patients/${params.id}/chart`, {
      method: 'POST',
      body: JSON.stringify({ toothNum, surface, condition: surface === 'TOOTH' && tool === 'CARIES' ? 'CARIES' : tool, diagnosis: 'Осмотр' }),
    });
    await load();
  };

  const book = () => {
    if (!card) return;
    sessionStorage.setItem('sd_book_patient', JSON.stringify({ id: card.patient.id, name: `${card.patient.lastName} ${card.patient.firstName}` }));
    router.push('/schedule');
  };

  const confirmMedical = async () => {
    if (!card) return;
    await api<Medical>(`/patients/${params.id}/medical`, { method: 'PATCH', body: JSON.stringify({ version: card.medical.version, confirm: true }) });
    await load();
  };

  if (error && !card) {
    return (
      <div className={styles.failed} role="alert">
        <p>{error}</p>
        <div>
          <button type="button" className="sd-btn" onClick={() => void load()}>Повторить</button>
          <Link className="sd-btn-ghost" href="/patients">К списку пациентов</Link>
        </div>
      </div>
    );
  }
  if (!card) {
    return (
      <div className={styles.layout} aria-busy="true">
        <div className={styles.dossier}><div className="sd-skel" style={{ height: 28, width: '70%' }} /><div className="sd-skel" style={{ height: 120 }} /></div>
        <div className={styles.work}><div className="sd-skel" style={{ height: 44 }} /><div className="sd-skel" style={{ height: 260 }} /></div>
      </div>
    );
  }

  const history = card.chart.events.filter((event) => event.toothNum === tooth).slice(0, 5);

  return (
    <div className={styles.page}>
      <Link href="/patients" className={styles.back}><ChevronLeft size={16} aria-hidden="true" /> Пациенты</Link>
      <div className={styles.layout}>
        <Dossier
          patient={card.patient}
          alerts={card.alerts}
          medical={card.medical}
          canEditMedical={canMedical}
          canEditPatient={canWrite}
          onEditPatient={() => setEditing(true)}
          onEditMedical={() => setTab('medical')}
          onConfirm={confirmMedical}
        />

        <div className={styles.work}>
          <nav className={styles.tabs} aria-label="Разделы карты">
            {TABS.filter((item) => (item.id !== 'money' || canMoney) && item.id !== 'perio' && item.id !== 'imaging').map((item) => (
              <button key={item.id} type="button" aria-current={tab === item.id || (item.id === 'formula' && (tab === 'perio' || tab === 'imaging')) ? 'page' : undefined} onClick={() => setTab(item.id)}>
                {item.id === 'formula' ? 'Зубы' : item.label}
                {item.id === 'medical' && card.medical.reviewDue && <i className={styles.dot} aria-label="нужно подтвердить" />}
              </button>
            ))}
          </nav>
          {error && <p className={styles.error} role="alert">{error}</p>}

          {tab === 'overview' && <Overview nextVisit={card.nextVisit} debt={card.debt} deposit={card.deposit} feed={card.timeline} onBook={book} />}
          {tab === 'medical' && (
            <MedicalEditor
              patientId={params.id}
              medical={card.medical}
              gender={card.patient.gender}
              canEdit={canMedical}
              log={card.timeline}
              onSaved={() => void load()}
            />
          )}
          {tab === 'visits' && <PatientVisits patientId={params.id} onBook={book} />}
          {tab === 'money' && canMoney && <PatientMoney patientId={params.id} patientName={`${card.patient.lastName} ${card.patient.firstName}`} />}
          {tab === 'docs' && <Journal waiting={false} patientId={params.id} />}
          {tab === 'route' && <RouteView patientId={params.id} onOpenPlan={() => setTab('plan')} />}
          {tab === 'plan' && (
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
          )}
          {tab === 'care' && <MarketStrip patientId={params.id} />}
          {(tab === 'formula' || tab === 'perio' || tab === 'imaging') && (
            <section className={styles.panel}>
              <div className="sd-seg" role="group" aria-label="Зубы">
                <button type="button" className={tab === 'formula' ? 'on' : ''} onClick={() => setTab('formula')}>Формула</button>
                <button type="button" className={tab === 'perio' ? 'on' : ''} onClick={() => setTab('perio')}>Пародонт</button>
                <button type="button" className={tab === 'imaging' ? 'on' : ''} onClick={() => setTab('imaging')}>Снимки</button>
              </div>
              {tab === 'formula' && (
                <div className={styles.toolbar}>
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
              {tab === 'imaging' ? (
                <ImagingBoard patientId={params.id} tooth={tooth} />
              ) : tab === 'formula' ? (
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
              {tab === 'formula' && tooth && (
                <div className={styles.toothLog}>
                  <b>Зуб {tooth}{face !== 'TOOTH' ? ` · ${face}` : ''}</b>
                  {history.length === 0 ? (
                    <p className={styles.none}>Истории по зубу пока нет.</p>
                  ) : (
                    <ul>{history.map((event) => <li key={event.id}>{fmt.short(event.at)} · {event.condition}{event.note ? ` · ${event.note}` : ''}</li>)}</ul>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <PatientForm
        open={editing}
        patientId={params.id}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); void load(); }}
        onArchived={() => router.push('/patients')}
      />
    </div>
  );
}
