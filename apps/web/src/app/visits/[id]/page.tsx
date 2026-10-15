'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Protected } from '@/components/protected';
import { ToothChart, type ChartSurface } from '@/components/studio/chart';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import { Copilot } from '@/components/studio/copilot';

type Visit = {
  id: string;
  status: string;
  startsAt: string;
  actions: string[];
  service: string;
  servicePrice: number;
  doctor: string | null;
  cabinet: string | null;
  debt: number;
  patient: { id: string; firstName: string; lastName: string; phone: string | null; allergies: string[]; anxiety: string; pregnant: boolean; anticoagulant: boolean; contraindications: string | null };
  note: { complaints: string; anamnesis: string; objective: string; diagnosis: string; treatment: string; recommendations: string } | null;
};
type PlanItem = { id: string; title: string; toothNum: number | null; price: number; status: string };
type KitLine = { name: string; qty: number; cost: number };

const TEMPLATES = [
  { id: 'caries', label: 'Кариес', note: { complaints: 'Реакция на сладкое', anamnesis: 'Без общей патологии', objective: 'Кариозная полость', diagnosis: 'K02.1 кариес дентина', treatment: 'Пломба композитом', recommendations: 'Не есть 2 часа' } },
  { id: 'exam', label: 'Осмотр', note: { complaints: 'Профилактический осмотр', anamnesis: '', objective: 'Осмотр, формула', diagnosis: 'Z01.2 обследование', treatment: 'Осмотр, план', recommendations: 'Согласовать план' } },
  { id: 'pain', label: 'Боль', note: { complaints: 'Ночная боль', anamnesis: '', objective: 'Перкуссия болезненна', diagnosis: 'K04.0 пульпит', treatment: 'Обезболивание, раскрытие', recommendations: 'Ибупрофен при боли' } },
];

export default function VisitPage() {
  return <Protected><Cockpit /></Protected>;
}

function Cockpit() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const medical = user?.permissions.includes('medical.write');
  const [visit, setVisit] = useState<Visit | null>(null);
  const [surfaces, setSurfaces] = useState<ChartSurface[]>([]);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState({ complaints: '', anamnesis: '', objective: '', diagnosis: '', treatment: '', recommendations: '' });
  const [kit, setKit] = useState<KitLine[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [summary, setSummary] = useState(false);
  const [error, setError] = useState('');
  const [voice, setVoice] = useState('');
  const [followDate, setFollowDate] = useState('');
  const [reason, setReason] = useState('');
  const [library, setLibrary] = useState<{ id: string; label: string; note: typeof TEMPLATES[number]['note'] }[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);

  const load = () => api<Visit>(`/flow/visits/${params.id}`).then((data) => {
    setVisit(data);
    if (data.note) setNote(data.note);
    setKit(kitFor(data.service));
    api<{ chart: { surfaces: ChartSurface[] }; families: { plans: { tier: string | null; phases: { items: PlanItem[] }[]; looseItems: PlanItem[] }[] }[] }>(`/workspace/patients/${data.patient.id}/card`).then((card) => {
      setSurfaces(card.chart.surfaces);
      const plan = card.families[0]?.plans.find((item) => item.tier === 'OPTIMUM') ?? card.families[0]?.plans[0];
      const lines = plan ? [...plan.phases.flatMap((phase) => phase.items), ...plan.looseItems] : [];
      setItems(lines);
    }).catch(() => undefined);
  });

  useEffect(() => { void load().catch((err: Error) => setError(err.message)); }, [params.id]);
  useEffect(() => {
    api<{ id: string; name: string; complaints: string; diagnosis: string; treatment: string; recommendations: string; anamnesis?: string; objective?: string }[]>('/config/visit-templates')
      .then((rows) => setLibrary(rows.map((row) => ({
        id: row.id,
        label: row.name,
        note: { complaints: row.complaints, anamnesis: row.anamnesis ?? '', objective: row.objective ?? '', diagnosis: row.diagnosis, treatment: row.treatment, recommendations: row.recommendations },
      }))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (visit?.status !== 'IN_PROGRESS') return;
    const key = `sd-timer-${visit.id}`;
    const started = Number(sessionStorage.getItem(key) ?? Date.now());
    sessionStorage.setItem(key, String(started));
    const tick = () => setSeconds(Math.floor((Date.now() - started) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [visit?.status, visit?.id]);

  const act = async (path: string, body?: unknown) => {
    setError('');
    const data = await api<Visit>(`/flow/visits/${params.id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    setVisit(data);
    if (data.note) setNote(data.note);
    return data;
  };

  const finish = async () => {
    try {
      await act('note', note);
      await act('complete', { followUpDate: followDate || undefined, followUpReason: 'Контроль' });
      setSummary(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Визит не закрылся');
      setSummary(true);
    }
  };

  const record = async () => {
    if (recorder.current) {
      recorder.current.stop();
      recorder.current = null;
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const media = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => chunks.push(event.data);
    media.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks));
      setVoice(url);
      stream.getTracks().forEach((track) => track.stop());
    };
    media.start();
    recorder.current = media;
    setVoice('идёт запись…');
  };

  if (!visit) return <p className="sd-muted">{error || 'Открываем приём…'}</p>;
  const alerts = [
    ...visit.patient.allergies.map((item) => `Аллергия: ${item}`),
    visit.patient.anticoagulant ? 'Антикоагулянты' : '',
    visit.patient.pregnant ? 'Беременность' : '',
    visit.patient.anxiety === 'HIGH' ? 'Сильный страх' : '',
    visit.patient.contraindications ?? '',
    visit.debt > 0 ? `Долг ${formatMoney(visit.debt)}` : '',
  ].filter(Boolean);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const materialCost = kit.reduce((sum, line) => sum + line.qty * line.cost, 0);
  const checked = items.filter((item) => done[item.id]);

  return (
    <div className="ck">
      <header className="ck-head">
        <div>
          <p style={{ margin: 0, opacity: 0.75 }}>{visit.service} · {visit.cabinet ?? 'кресло'} · {visit.doctor ?? ''}</p>
          <h1>{visit.patient.lastName} {visit.patient.firstName}</h1>
          <div className="sd-chips">{alerts.map((alert) => <span key={alert} className="sd-chip danger">{alert}</span>)}</div>
        </div>
        <div className="ck-clock">
          <div className="ck-timer">{visit.status === 'IN_PROGRESS' ? clock : '—'}</div>
          <div>{visit.status === 'IN_PROGRESS' ? 'в кресле' : visit.status === 'COMPLETED' ? 'закрыт' : 'ожидает'}</div>
        </div>
      </header>
      {error && <p className="sd-chip danger">{error}</p>}
      <div className="ck-grid">
        <section className="sd-card sd-stack">
          <strong>Что делаем сегодня</strong>
          {items.length === 0 && (
            <div className="sd-empty">
              <span className="sd-empty-mark" />
              <b>План ещё пуст</b>
              <p className="sd-muted">Формула остаётся перед глазами. Позиции появятся из плана пациента.</p>
            </div>
          )}
          {items.slice(0, 6).map((item) => (
            <label key={item.id} className={`ck-item ${done[item.id] ? 'on' : ''}`}>
              <input type="checkbox" checked={!!done[item.id]} onChange={(event) => setDone({ ...done, [item.id]: event.target.checked })} />
              <span><b>{item.toothNum ? `Зуб ${item.toothNum}` : item.title}</b><div className="sd-muted">{item.title} · {formatMoney(item.price)}</div></span>
            </label>
          ))}
          <ToothChart surfaces={surfaces} items={[]} view="before" formula="ADULT" condition="CARIES" selected={null} quiet onCondition={() => undefined} onPaint={() => undefined} onSelect={() => undefined} />
        </section>
        <section className="sd-stack">
          <div className="sd-card sd-stack">
            <strong>Запись</strong>
            <div className="sd-chips">
              {[...library, ...TEMPLATES].map((template) => (
                <button key={template.id} className="sd-chip" type="button" onClick={() => setNote({ ...note, ...template.note })}>{template.label}</button>
              ))}
              <button className="sd-chip" type="button" onClick={() => void record().catch(() => setVoice('Микрофон недоступен'))}>{recorder.current ? 'Стоп' : 'Голос'}</button>
            </div>
            {voice && <p className="sd-muted">{voice.startsWith('blob:') ? <audio controls src={voice} /> : voice}</p>}
            {(['complaints', 'diagnosis', 'treatment', 'recommendations'] as const).map((field) => (
              <label key={field} className="sd-field">{field === 'complaints' ? 'Жалобы' : field === 'diagnosis' ? 'Диагноз' : field === 'treatment' ? 'Что сделали' : 'Рекомендации'}
                <input className="sd-input" value={note[field]} onChange={(event) => setNote({ ...note, [field]: event.target.value })} />
              </label>
            ))}
            {medical && visit.status === 'IN_PROGRESS' && <button className="sd-btn-ghost" type="button" onClick={() => void act('note', note).catch((err: Error) => setError(err.message))}>Сохранить запись</button>}
            {medical && visit.status === 'COMPLETED' && (
              <>
                <input className="sd-input" placeholder="Причина правки закрытого визита" value={reason} onChange={(event) => setReason(event.target.value)} />
                <button className="sd-btn-ghost" type="button" onClick={() => void act('note', { ...note, reason }).catch((err: Error) => setError(err.message))}>Исправить с причиной</button>
              </>
            )}
          </div>
          <Copilot
            patientId={visit.patient.id}
            note={`${note.complaints} ${note.diagnosis}`}
            onApply={(patch) => setNote({ ...note, ...patch })}
          />
          <div className="sd-card sd-stack">
            <strong>Расходники</strong>
            {kit.map((line, index) => (
              <div key={line.name} className="sd-row" style={{ gridTemplateColumns: '1fr 70px auto' }}>
                <span>{line.name}</span>
                <input className="sd-input" type="number" min={0} step={0.1} value={line.qty} onChange={(event) => setKit(kit.map((item, i) => i === index ? { ...item, qty: Number(event.target.value) } : item))} />
                <span>{formatMoney(line.qty * line.cost)}</span>
              </div>
            ))}
            <p className="sd-muted">Себестоимость {formatMoney(materialCost)}</p>
          </div>
        </section>
      </div>
      <div className="jn-dock">
        <div>
          <span>К оплате</span>
          <strong>{formatMoney(visit.servicePrice || visit.debt)}</strong>
        </div>
        <label>Следующий визит<input className="sd-input" type="date" value={followDate} onChange={(event) => setFollowDate(event.target.value)} /></label>
        <div className="jn-actions">
          <Link className="sd-btn-ghost" href={`/patients/${visit.patient.id}`} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>План</Link>
          {visit.actions.includes('start') && medical && <button className="sd-btn" type="button" onClick={() => void act('start').catch((err: Error) => setError(err.message))}>Начать приём</button>}
          {visit.actions.includes('complete') && medical && <button className="sd-btn" type="button" onClick={() => setSummary(true)}>Завершить визит</button>}
          {visit.actions.includes('check-in') && <button className="sd-btn" type="button" onClick={() => void act('check-in').catch((err: Error) => setError(err.message))}>Пациент пришёл</button>}
          {visit.status === 'COMPLETED' && <button className="sd-btn-ghost" type="button" onClick={() => router.push(`/patients/${visit.patient.id}`)}>К плану</button>}
        </div>
      </div>
      {summary && (
        <div className="ck-summary">
          <div className="ck-sheet">
            <h2>{visit.status === 'COMPLETED' ? 'Визит закрыт' : 'Итог приёма'}</h2>
            <p>Сделано: {checked.length ? checked.map((item) => item.title).join(', ') : note.treatment || 'запись ещё пустая'}</p>
            <p>Материалы: {formatMoney(materialCost)}</p>
            <p>К счёту: {formatMoney(visit.servicePrice || 0)}</p>
            <p>Дальше: {followDate || 'дату контроля можно поставить позже'}</p>
            <p>Время в кресле: {clock}</p>
            {error && <p className="sd-chip danger">{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="sd-btn-ghost" type="button" onClick={() => setSummary(false)}>Вернуться</button>
              {visit.status !== 'COMPLETED' && <button className="sd-btn" type="button" onClick={() => void finish()}>Закрыть визит</button>}
              {visit.status === 'COMPLETED' && <button className="sd-btn" type="button" onClick={() => window.print()}>Протокол PDF</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function kitFor(service: string): KitLine[] {
  const text = service.toLowerCase();
  if (text.includes('кариес') || text.includes('пломб')) {
    return [
      { name: 'Карпула артикаина', qty: 1, cost: 85 },
      { name: 'Композит A2, г', qty: 0.2, cost: 180 },
      { name: 'Бонд, мл', qty: 0.05, cost: 480 },
      { name: 'Матрица', qty: 1, cost: 45 },
      { name: 'Перчатки, пара', qty: 2, cost: 12 },
    ];
  }
  if (text.includes('канал')) return [{ name: 'Файлы NiTi', qty: 1, cost: 420 }, { name: 'Гипохлорит, мл', qty: 10, cost: 2 }, { name: 'Артикаин', qty: 2, cost: 85 }];
  if (text.includes('гигиен')) return [{ name: 'Порошок Air Flow, г', qty: 8, cost: 12 }, { name: 'Фторлак, мл', qty: 0.3, cost: 60 }];
  return [{ name: 'Перчатки, пара', qty: 1, cost: 12 }, { name: 'Маска', qty: 1, cost: 6 }, { name: 'Слюноотсос', qty: 1, cost: 4 }];
}
