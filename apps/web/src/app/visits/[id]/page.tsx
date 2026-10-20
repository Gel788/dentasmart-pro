'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, ChevronLeft, ShieldAlert } from 'lucide-react';
import { Protected } from '@/components/protected';
import { ToothChart, type ChartSurface } from '@/components/studio/chart';
import { ToothFocus } from '@/components/studio/tooth-focus';
import { Copilot } from '@/components/studio/copilot';
import { VoiceChart } from '@/components/studio/voice-chart';
import { XrayAssistant } from '@/components/studio/xray';
import type { Medical } from '@/components/card/model';
import styles from '@/components/visit/visit.module.css';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { VoiceNote } from '@/lib/voice';

type Note = { complaints: string; anamnesis: string; objective: string; diagnosis: string; treatment: string; recommendations: string };
type Line = { id: string; planId: string; planTitle: string; title: string; toothNum: number | null; surfaces: string[]; price: number; status: string; booked: boolean; doneHere: boolean };
type Visit = {
  id: string;
  status: string;
  startsAt: string;
  actions: string[];
  service: string;
  doctor: string | null;
  cabinet: string | null;
  debt: number;
  medical: Medical;
  today: Line[];
  patient: { id: string; firstName: string; lastName: string; phone: string | null; allergies: string[]; anxiety: string; pregnant: boolean; anticoagulant: boolean; contraindications: string | null };
  note: Note | null;
};

const EMPTY: Note = { complaints: '', anamnesis: '', objective: '', diagnosis: '', treatment: '', recommendations: '' };
const FIELDS: { key: keyof Note; label: string; hint: string; rows: number; required?: boolean }[] = [
  { key: 'complaints', label: 'Жалобы', hint: 'Со слов пациента', rows: 2 },
  { key: 'objective', label: 'Осмотр', hint: 'Что увидели', rows: 2 },
  { key: 'diagnosis', label: 'Диагноз', hint: 'Например, K02.1 кариес дентина 16', rows: 2, required: true },
  { key: 'treatment', label: 'Что сделали', hint: 'Анестезия, препарирование, материал', rows: 3, required: true },
  { key: 'recommendations', label: 'Рекомендации', hint: 'Что делать дома, когда прийти', rows: 2 },
];
const TEMPLATES = [
  { id: 'caries', label: 'Кариес', note: { complaints: 'Реакция на сладкое', objective: 'Кариозная полость', diagnosis: 'K02.1 кариес дентина', treatment: 'Пломба композитом', recommendations: 'Не есть 2 часа' } },
  { id: 'exam', label: 'Осмотр', note: { complaints: 'Профилактический осмотр', objective: 'Осмотр, формула', diagnosis: 'Z01.2 обследование', treatment: 'Осмотр, план лечения', recommendations: 'Согласовать план' } },
  { id: 'pain', label: 'Боль', note: { complaints: 'Ночная боль', objective: 'Перкуссия болезненна', diagnosis: 'K04.0 пульпит', treatment: 'Обезболивание, раскрытие полости', recommendations: 'Ибупрофен при боли' } },
];
const STATUS: Record<string, string> = {
  SCHEDULED: 'записан', CONFIRMED: 'подтвердил', WAITING: 'ждёт в холле', IN_PROGRESS: 'в кресле', COMPLETED: 'визит закрыт', NO_SHOW: 'не пришёл', CANCELLED: 'отменён',
};

export default function VisitPage() {
  return <Protected><Chair /></Protected>;
}

function Chair() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const medicalWrite = user?.permissions.includes('medical.write') ?? false;
  const [visit, setVisit] = useState<Visit | null>(null);
  const [surfaces, setSurfaces] = useState<ChartSurface[]>([]);
  const [note, setNote] = useState<Note>(EMPTY);
  const [savedNote, setSavedNote] = useState<Note>(EMPTY);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [library, setLibrary] = useState<{ id: string; label: string; note: Partial<Note> }[]>([]);
  const [spoken, setSpoken] = useState<ChartSurface[]>([]);
  const [hot, setHot] = useState<number[]>([]);
  const [tooth, setTooth] = useState<number | null>(null);
  const [face, setFace] = useState('TOOTH');
  const [closing, setClosing] = useState(false);
  const [followDate, setFollowDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [seconds, setSeconds] = useState(0);
  const pickKey = `sd.visit.${params.id}.done`;

  const loadChart = useCallback((patientId: string) => {
    api<{ chart: { surfaces: ChartSurface[] } }>(`/workspace/patients/${patientId}/card`)
      .then((card) => setSurfaces(card.chart.surfaces))
      .catch(() => undefined);
  }, []);

  const take = useCallback((data: Visit) => {
    setVisit(data);
    const next = { ...EMPTY, ...(data.note ?? {}) };
    setNote(next);
    setSavedNote(next);
  }, []);

  const load = useCallback(() => api<Visit>(`/flow/visits/${params.id}`).then((data) => {
    take(data);
    loadChart(data.patient.id);
  }).catch((err: Error) => setError(err.message || 'Визит не открылся')), [params.id, take, loadChart]);

  useEffect(() => {
    void load();
    try { setPicked(JSON.parse(sessionStorage.getItem(pickKey) ?? '{}') as Record<string, boolean>); } catch { /* fresh start */ }
    api<{ id: string; name: string; complaints: string; diagnosis: string; treatment: string; recommendations: string; objective?: string }[]>('/config/visit-templates')
      .then((rows) => setLibrary(rows.map((row) => ({ id: row.id, label: row.name, note: { complaints: row.complaints, objective: row.objective ?? '', diagnosis: row.diagnosis, treatment: row.treatment, recommendations: row.recommendations } }))))
      .catch(() => undefined);
  }, [load, pickKey]);

  useEffect(() => {
    try { sessionStorage.setItem(pickKey, JSON.stringify(picked)); } catch { /* private mode */ }
  }, [picked, pickKey]);

  // Time in the chair, counted from when the visit was started in this browser.
  useEffect(() => {
    if (visit?.status !== 'IN_PROGRESS') return;
    const key = `sd-timer-${visit.id}`;
    const started = Number(sessionStorage.getItem(key)) || Date.now();
    sessionStorage.setItem(key, String(started));
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [visit?.status, visit?.id]);

  const act = useCallback(async (path: string, body?: unknown) => {
    const data = await api<Visit>(`/flow/visits/${params.id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : '{}' });
    take(data);
    return data;
  }, [params.id, take]);

  const run = async (label: string, job: () => Promise<unknown>) => {
    setBusy(label);
    setError('');
    try { await job(); } catch (err) { setError(err instanceof Error ? err.message : 'Не получилось. Попробуйте ещё раз'); } finally { setBusy(''); }
  };

  // The protocol saves itself a moment after typing stops, so nothing is lost if the tab closes.
  const dirty = useMemo(() => (Object.keys(EMPTY) as (keyof Note)[]).some((key) => note[key] !== savedNote[key]), [note, savedNote]);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty || visit?.status !== 'IN_PROGRESS' || !medicalWrite) return;
    if (timer.current) window.clearTimeout(timer.current);
    setSaveState('Есть несохранённые правки');
    timer.current = window.setTimeout(() => {
      api<Visit>(`/flow/visits/${params.id}/note`, { method: 'POST', body: JSON.stringify(note) })
        .then(() => { setSavedNote(note); setSaveState(`Сохранено ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`); })
        .catch((err: Error) => setSaveState(`Не сохранилось: ${err.message}`));
    }, 1200);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [note, dirty, visit?.status, medicalWrite, params.id]);

  const hear = (parsed: { findings: { tooth: number; surface: string; condition: string }[]; note: VoiceNote; activeTooth: number | null }) => {
    setHot(parsed.activeTooth ? [parsed.activeTooth] : parsed.findings.map((item) => item.tooth));
    setSpoken(parsed.findings.map((item) => ({ toothNum: item.tooth, formula: 'ADULT', surface: item.surface, condition: item.condition, layer: 'CURRENT' })));
    setNote((prev) => mergeNote(prev, parsed.note));
  };

  if (!visit) {
    return error
      ? <div className={styles.failed} role="alert"><p>{error}</p><button type="button" className="sd-btn" onClick={() => void load()}>Повторить</button></div>
      : <div className={styles.loading} aria-busy="true"><div className="sd-skel" style={{ height: 72 }} /><div className="sd-skel" style={{ height: 320 }} /></div>;
  }

  const live = visit.status === 'IN_PROGRESS';
  const closed = visit.status === 'COMPLETED';
  const before = ['SCHEDULED', 'CONFIRMED', 'WAITING'].includes(visit.status);
  const alerts = [
    ...visit.patient.allergies.map((item) => `Аллергия: ${item}`),
    visit.patient.anticoagulant ? 'Антикоагулянты' : '',
    visit.patient.pregnant ? 'Беременность' : '',
    visit.patient.contraindications ?? '',
    visit.patient.anxiety === 'HIGH' ? 'Сильный страх' : '',
  ].filter(Boolean);
  const chosen = visit.today.filter((line) => picked[line.id] && !line.doneHere);
  const doneHere = visit.today.filter((line) => line.doneHere);
  const toBill = chosen.reduce((sum, line) => sum + line.price, 0);
  const missing = FIELDS.filter((field) => field.required && !note[field.key].trim());
  const name = `${visit.patient.lastName} ${visit.patient.firstName === '—' ? '' : visit.patient.firstName}`.trim();

  const confirmMedical = () => run('confirm', async () => {
    await api(`/patients/${visit.patient.id}/medical`, { method: 'PATCH', body: JSON.stringify({ version: visit.medical.version, confirm: true }) });
    await load();
  });

  const finish = () => run('close', async () => {
    await act('note', note);
    setSavedNote(note);
    await act('complete', { followUpDate: followDate || undefined, followUpReason: 'Контроль', doneItemIds: chosen.map((line) => line.id) });
    setPicked({});
    setClosing(false);
    loadChart(visit.patient.id);
  });

  return (
    <div className={styles.page}>
      <Link href={`/patients/${visit.patient.id}`} className={styles.back}><ChevronLeft size={16} aria-hidden="true" /> Карта пациента</Link>

      <header className={styles.head}>
        <div className={styles.who}>
          <h1>{name}</h1>
          <p>{[visit.service, visit.doctor, visit.cabinet, new Date(visit.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}</p>
          {alerts.length > 0 && (
            <ul className={styles.alerts} aria-label="Медицинские алерты">
              {alerts.map((alert) => <li key={alert}>{alert}</li>)}
            </ul>
          )}
        </div>
        <div className={styles.state}>
          <span className={styles.status} data-status={visit.status}>{STATUS[visit.status] ?? visit.status}</span>
          {live && <span className={styles.clock} aria-label="Время в кресле">{clock(seconds)}</span>}
          <div className={styles.primary}>
            {visit.actions.includes('check-in') && visit.status !== 'WAITING' && (
              <button type="button" className="sd-btn-ghost" disabled={!!busy} onClick={() => void run('check-in', () => act('check-in'))}>Пациент пришёл</button>
            )}
            {visit.actions.includes('start') && medicalWrite && (
              <button type="button" className="sd-btn" disabled={!!busy || visit.medical.reviewDue} onClick={() => void run('start', () => act('start'))}>
                {busy === 'start' ? 'Начинаем…' : 'Начать приём'}
              </button>
            )}
            {live && medicalWrite && (
              <button type="button" className="sd-btn" disabled={!!busy} onClick={() => setClosing(true)}>Завершить визит</button>
            )}
            {closed && <Link className="sd-btn-ghost" href={`/finance?patient=${encodeURIComponent(visit.patient.lastName)}`}>К оплате</Link>}
          </div>
        </div>
      </header>

      {before && visit.medical.reviewDue && (
        <section className={styles.review} aria-labelledby="review-title">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <h2 id="review-title">Перед приёмом уточните анамнез</h2>
            <p>
              {visit.medical.confirmedAt
                ? `Медкарту подтверждали ${new Date(visit.medical.confirmedAt).toLocaleDateString('ru-RU')}. Спросите пациента, не изменилось ли здоровье и лекарства.`
                : 'Медкарту ни разу не подтверждали с пациентом. Спросите об аллергиях, болезнях, лекарствах и беременности.'}
            </p>
            <div>
              {medicalWrite && <button type="button" className="sd-btn" disabled={!!busy} onClick={() => void confirmMedical()}><Check size={16} aria-hidden="true" /> {busy === 'confirm' ? 'Сохраняю…' : 'Всё верно, подтверждаю'}</button>}
              <Link className="sd-btn-ghost" href={`/patients/${visit.patient.id}`} onClick={() => sessionStorage.setItem(`sd.card.${visit.patient.id}.mode`, 'medical')}>Изменить медкарту</Link>
            </div>
          </div>
        </section>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.body}>
        <section className={styles.work} aria-labelledby="today-title">
          <div className={styles.sectionHead}>
            <h2 id="today-title">Сегодня по плану</h2>
            {chosen.length > 0 && <span className={styles.sum}>{formatMoney(toBill)}</span>}
          </div>
          {visit.today.length === 0 ? (
            <p className={styles.none}>В плане пациента нет открытых услуг. <Link href={`/patients/${visit.patient.id}`} onClick={() => sessionStorage.setItem(`sd.card.${visit.patient.id}.mode`, 'plan')}>Добавить в план</Link></p>
          ) : (
            <ul className={styles.lines}>
              {visit.today.map((line) => {
                const on = line.doneHere || !!picked[line.id];
                return (
                  <li key={line.id} data-hot={tooth != null && tooth === line.toothNum ? true : undefined}>
                    <label className={styles.line} data-on={on || undefined} data-done={line.doneHere || undefined}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!live || line.doneHere || !medicalWrite}
                        onChange={(event) => setPicked((current) => ({ ...current, [line.id]: event.target.checked }))}
                      />
                      <span className={styles.tooth}>{line.toothNum ?? '—'}</span>
                      <span className={styles.lineText}>
                        <b>{line.title}</b>
                        <small>{line.doneHere ? 'выполнено на этом визите' : line.booked ? 'запланировано на этот визит' : line.planTitle}</small>
                      </span>
                      <span className={styles.price}>{formatMoney(line.price)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {!live && !closed && visit.today.length > 0 && <p className={styles.none}>Отметить выполненное можно после «Начать приём».</p>}

          <div className={styles.chart}>
            <ToothChart
              surfaces={[...surfaces, ...spoken]}
              items={visit.today.map((line) => ({ toothNum: line.toothNum, surfaces: line.surfaces, result: 'FILLED', status: line.status, title: line.title }))}
              view="plan"
              formula="ADULT"
              condition="CARIES"
              selected={tooth}
              quiet
              pulse={hot}
              onCondition={() => undefined}
              onPaint={() => undefined}
              onSelect={(next, surface) => { setTooth(next); setFace(surface || 'TOOTH'); }}
            />
            {tooth != null && (
              <ToothFocus
                tooth={tooth}
                surface={face}
                surfaces={[...surfaces, ...spoken]}
                services={visit.today.filter((line) => line.toothNum === tooth).map((line) => ({ id: line.id, title: line.title, status: line.status }))}
                onStatus={medicalWrite ? (condition, surface) => {
                  void api(`/workspace/patients/${visit.patient.id}/chart`, { method: 'POST', body: JSON.stringify({ toothNum: tooth, surface, condition, diagnosis: 'Приём' }) })
                    .then(() => loadChart(visit.patient.id))
                    .catch((err: Error) => setError(err.message));
                } : undefined}
              />
            )}
          </div>
          <details className={styles.fold}>
            <summary>Снимки</summary>
            <XrayAssistant patientId={visit.patient.id} primary={false} />
          </details>
        </section>

        <section className={styles.protocol} aria-labelledby="protocol-title">
          <div className={styles.sectionHead}>
            <h2 id="protocol-title">Протокол приёма</h2>
            <span className={styles.saveState} aria-live="polite">{saveState}</span>
          </div>
          {(live || (closed && medicalWrite)) && (
            <div className={styles.templates} role="group" aria-label="Шаблоны протокола">
              {[...library, ...TEMPLATES].map((template) => (
                <button key={template.id} type="button" onClick={() => setNote((current) => ({ ...current, ...template.note }))}>{template.label}</button>
              ))}
            </div>
          )}
          {live && (
            <VoiceChart
              canWrite={medicalWrite}
              onChange={hear}
              onConfirm={async (parsed) => {
                for (const item of parsed.findings) {
                  await api(`/workspace/patients/${visit.patient.id}/chart`, { method: 'POST', body: JSON.stringify({ toothNum: item.tooth, surface: item.surface, condition: item.condition, diagnosis: item.label }) });
                }
                setNote((current) => mergeNote(current, parsed.note));
                loadChart(visit.patient.id);
                setSpoken([]);
                setHot([]);
              }}
            />
          )}
          <div className={styles.fields}>
            {FIELDS.map((field) => (
              <label key={field.key} className={styles.field}>
                <span>{field.label}{field.required && <em aria-hidden="true"> · нужно для закрытия</em>}</span>
                <textarea
                  rows={field.rows}
                  value={note[field.key]}
                  placeholder={field.hint}
                  readOnly={!medicalWrite || (!live && !closed)}
                  aria-required={field.required}
                  onChange={(event) => setNote({ ...note, [field.key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          {closed && medicalWrite && dirty && (
            <div className={styles.amend}>
              <input className="sd-input" placeholder="Причина правки закрытого визита" value={reason} onChange={(event) => setReason(event.target.value)} />
              <button type="button" className="sd-btn-ghost" disabled={!!busy || reason.trim().length < 3} onClick={() => void run('amend', async () => { await act('note', { ...note, reason }); setReason(''); })}>Исправить с причиной</button>
            </div>
          )}
          {live && (
            <details className={styles.fold}>
              <summary>Подсказки по протоколу</summary>
              <Copilot patientId={visit.patient.id} note={`${note.complaints} ${note.diagnosis}`} onApply={(patch) => setNote({ ...note, ...patch })} />
            </details>
          )}
        </section>
      </div>

      {closed && (
        <section className={styles.result} aria-labelledby="result-title">
          <h2 id="result-title">Визит закрыт</h2>
          <p>{doneHere.length ? `Выполнено: ${doneHere.map((line) => `${line.title}${line.toothNum ? ` (${line.toothNum})` : ''}`).join(', ')}.` : 'Услуги из плана на этом визите не отмечены.'}</p>
          <p>{visit.debt > 0 ? `К оплате у пациента: ${formatMoney(visit.debt)}.` : 'Долгов у пациента нет.'} Материалы списаны по нормам услуг.</p>
          <div>
            <Link className="sd-btn" href={`/finance?patient=${encodeURIComponent(visit.patient.lastName)}`}>Принять оплату</Link>
            <button type="button" className="sd-btn-ghost" onClick={() => window.print()}>Распечатать протокол</button>
          </div>
        </section>
      )}

      {closing && (
        <div className={styles.sheetBack} role="presentation" onClick={() => !busy && setClosing(false)}>
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="close-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="close-title">Закрыть визит</h2>
            {chosen.length ? (
              <ul className={styles.closeList}>
                {chosen.map((line) => <li key={line.id}><span>{line.toothNum ? `${line.toothNum} · ` : ''}{line.title}</span><b>{formatMoney(line.price)}</b></li>)}
                <li className={styles.closeTotal}><span>В счёт</span><b>{formatMoney(toBill)}</b></li>
              </ul>
            ) : (
              <p className={styles.warn}>Не отмечено ни одной услуги из плана. Визит закроется без счёта, например, если был только осмотр.</p>
            )}
            {missing.length > 0 && <p className={styles.warn}>Заполните в протоколе: {missing.map((field) => field.label.toLowerCase()).join(', ')}.</p>}
            <label className={styles.field}>
              <span>Контрольный визит</span>
              <input className="sd-input" type="date" value={followDate} onChange={(event) => setFollowDate(event.target.value)} />
            </label>
            <p className={styles.none}>Отмеченные услуги станут выполненными, материалы спишутся по нормам, счёт появится в «Деньгах».</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.sheetActions}>
              <button type="button" className="sd-btn-ghost" disabled={!!busy} onClick={() => setClosing(false)}>Вернуться к приёму</button>
              <button type="button" className="sd-btn" disabled={!!busy || missing.length > 0} onClick={() => void finish()}>{busy === 'close' ? 'Закрываем…' : 'Закрыть визит'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mergeNote(prev: Note, spoken: VoiceNote): Note {
  return {
    ...prev,
    ...(spoken.complaints ? { complaints: spoken.complaints } : {}),
    ...(spoken.objective ? { objective: spoken.objective } : {}),
    ...(spoken.diagnosis ? { diagnosis: spoken.diagnosis } : {}),
    ...(spoken.treatment ? { treatment: spoken.treatment } : {}),
    ...(spoken.recommendations ? { recommendations: spoken.recommendations } : {}),
  };
}

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}
