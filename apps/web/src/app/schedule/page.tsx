'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { VisitStatus } from '@dentasmart/shared';
import { Protected } from '@/components/protected';
import { Agenda } from '@/components/schedule/agenda';
import { MonthStrip } from '@/components/schedule/month-strip';
import { MonthView } from '@/components/schedule/month-view';
import { TimeGrid } from '@/components/schedule/time-grid';
import { VisitPanel } from '@/components/schedule/visit-panel';
import {
  addDays, clock, dayTitle, instantAt, monthBounds, STATUS, todayIn, wallMinutes, weekStart,
  type BoardVisit, type Column, type DayShell, type RangePayload,
} from '@/components/schedule/model';
import styles from '@/components/schedule/schedule.module.css';
import { api } from '@/lib/api';
import { useFocus } from '@/lib/focus';

type View = 'day' | 'week' | 'month' | 'agenda';
type Axis = 'chair' | 'doctor';
type Toast = { tone: 'ok' | 'bad'; text: string } | null;

const VIEWS: { id: View; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'agenda', label: 'Повестка' },
];

export default function SchedulePage() {
  return <Protected><Calendar /></Protected>;
}

function Calendar() {
  const { setFocus, revision } = useFocus();
  const [view, setView] = useState<View>('day');
  const [axis, setAxis] = useState<Axis>('chair');
  const [doctor, setDoctor] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [shell, setShell] = useState<DayShell | null>(null);
  const [month, setMonth] = useState<RangePayload | null>(null);
  const [week, setWeek] = useState<RangePayload | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [tick, setTick] = useState(0);

  const offset = month?.offsetMinutes ?? 180;

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('sd.calendar') ?? '{}') as { view?: View; axis?: Axis; date?: string; doctor?: string };
      if (saved.view && VIEWS.some((item) => item.id === saved.view)) setView(saved.view);
      if (saved.axis === 'doctor') setAxis('doctor');
      if (saved.doctor) setDoctor(saved.doctor);
      setDate(saved.date && /^\d{4}-\d{2}-\d{2}$/.test(saved.date) ? saved.date : todayIn(180));
    } catch {
      setDate(todayIn(180));
    }
  }, []);

  useEffect(() => {
    if (!date) return;
    try { sessionStorage.setItem('sd.calendar', JSON.stringify({ view, axis, date, doctor })); } catch { /* private mode: state just is not remembered */ }
  }, [view, axis, date, doctor]);

  useEffect(() => {
    if (!date) return;
    let alive = true;
    const { first, last } = monthBounds(date);
    const from = weekStart(date);
    setError('');
    Promise.all([
      api<DayShell>(`/workspace/schedule?date=${date}`),
      api<RangePayload>(`/workspace/schedule/range?from=${first}&to=${last}`),
      api<RangePayload>(`/workspace/schedule/range?from=${from}&to=${addDays(from, 6)}`),
    ])
      .then(([day, monthRange, weekRange]) => {
        if (!alive) return;
        setShell(day);
        setMonth(monthRange);
        setWeek(weekRange);
      })
      .catch((err: Error) => alive && setError(err.message || 'Расписание не загрузилось'));
    return () => { alive = false; };
  }, [date, revision, tick]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === 'bad' ? 7000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const dayVisits = useMemo(() => (shell?.appointments ?? []).filter((visit) => !doctor || visit.doctorId === doctor), [shell, doctor]);
  const weekVisits = useMemo(() => (week?.appointments ?? []).filter((visit) => !doctor || visit.doctorId === doctor), [week, doctor]);
  const allVisits = useMemo(() => [...dayVisits, ...weekVisits], [dayVisits, weekVisits]);
  const selected = allVisits.find((visit) => visit.id === selectedId) ?? null;

  const columns: Column[] = useMemo(() => {
    if (!shell || !date) return [];
    if (view === 'week') {
      const from = weekStart(date);
      return Array.from({ length: 7 }, (_, index) => {
        const day = addDays(from, index);
        return {
          id: day,
          date: day,
          label: dayTitle(day, { weekday: 'short', day: 'numeric' }),
          sub: dayTitle(day, { month: 'long' }),
          match: (visit: BoardVisit) => new Date(Date.parse(visit.startsAt) + offset * 60000).toISOString().slice(0, 10) === day,
          move: {},
        };
      });
    }
    if (axis === 'doctor') {
      return shell.doctors
        .filter((item) => !doctor || item.id === doctor)
        .map((item) => ({ id: item.id, date, label: item.name, sub: 'врач', match: (visit: BoardVisit) => visit.doctorId === item.id, move: { doctorId: item.id } }));
    }
    const many = shell.branches.length > 1;
    return shell.branches.flatMap((branch) =>
      branch.cabinets.map((cabinet) => ({
        id: cabinet.id,
        date,
        label: cabinet.name,
        sub: many ? branch.name : undefined,
        match: (visit: BoardVisit) => visit.cabinetId === cabinet.id,
        move: { cabinetId: cabinet.id },
      })),
    );
  }, [shell, date, view, axis, doctor, offset]);

  const go = (days: number) => {
    if (!date) return;
    if (view === 'month') {
      const [y, m] = date.split('-').map(Number);
      setDate(new Date(Date.UTC(y, m - 1 + Math.sign(days), 1)).toISOString().slice(0, 10));
    } else {
      setDate(addDays(date, view === 'day' ? days : days * 7));
    }
  };

  const openSlot = (column: Column, minutes: number) => {
    if (!shell) return;
    setFocus({
      type: 'slot',
      startsAt: instantAt(column.date, minutes, offset),
      cabinetId: column.move.cabinetId ?? (axis === 'chair' ? undefined : shell.branches[0]?.cabinets[0]?.id),
      doctorId: column.move.doctorId ?? (doctor || shell.doctors[0]?.id),
      label: `${column.label} · ${clock(minutes)}`,
    });
  };

  const book = () => {
    if (!shell || !date) return;
    const now = wallMinutes(new Date().toISOString(), offset);
    const opens = month?.hours.opensAt ?? 480;
    const minutes = date === todayIn(offset) ? Math.max(opens, Math.ceil(now / 15) * 15) : opens;
    const column = columns[0];
    if (column) openSlot(column, minutes);
  };

  /** Move only after the server agrees; the card waits in place and returns if refused. */
  const move = async (visit: BoardVisit, column: Column, minutes: number) => {
    const length = Date.parse(visit.endsAt) - Date.parse(visit.startsAt);
    const startsAt = instantAt(column.date, minutes, offset);
    const endsAt = new Date(Date.parse(startsAt) + length).toISOString();
    const sameSeat = (!column.move.cabinetId || column.move.cabinetId === visit.cabinetId) && (!column.move.doctorId || column.move.doctorId === visit.doctorId);
    if (startsAt === visit.startsAt && sameSeat) return;
    setPending((current) => new Set(current).add(visit.id));
    try {
      await api(`/appointments/${visit.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt, endsAt, ...column.move }) });
      setToast({ tone: 'ok', text: `${visit.patient}: перенесено на ${dayTitle(column.date, { day: 'numeric', month: 'short' })}, ${clock(minutes)}` });
      refresh();
    } catch (err) {
      setToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Перенос не прошёл. Визит остался на прежнем месте' });
    } finally {
      setPending((current) => { const next = new Set(current); next.delete(visit.id); return next; });
    }
  };

  const changeStatus = async (visit: BoardVisit, status: VisitStatus) => {
    setBusy(true);
    try {
      await api(`/appointments/${visit.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setToast({ tone: 'ok', text: `${visit.patient}: ${STATUS[status].label.toLowerCase()}` });
      refresh();
    } catch (err) {
      setToast({ tone: 'bad', text: err instanceof Error ? err.message : 'Статус не изменился' });
    } finally {
      setBusy(false);
    }
  };

  const reschedule = (visit: BoardVisit) =>
    setFocus({ type: 'slot', startsAt: visit.startsAt, cabinetId: visit.cabinetId ?? undefined, doctorId: visit.doctorId ?? undefined, label: visit.patient, appointmentId: visit.id });

  const pick = (next: string) => {
    setDate(next);
    if (view === 'month') setView('day');
  };

  if (!date) return null;
  const weekFrom = weekStart(date);
  const title =
    view === 'day' ? dayTitle(date, { weekday: 'long', day: 'numeric', month: 'long' })
      : view === 'month' ? dayTitle(date, { month: 'long', year: 'numeric' })
        : `${dayTitle(weekFrom, { day: 'numeric', month: 'short' })} – ${dayTitle(addDays(weekFrom, 6), { day: 'numeric', month: 'short' })}`;
  const daySummary = month?.days.find((item) => item.date === date);

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <h1 className={styles.title}>
          <span>{title.charAt(0).toUpperCase() + title.slice(1)}</span>
          <small>
            {view === 'day' && daySummary ? `${daySummary.visits} визитов · кресла заняты на ${Math.round(daySummary.ratio * 100)}%` : view === 'agenda' ? 'Повестка на неделю' : 'Расписание клиники'}
          </small>
        </h1>
        <div className={styles.nav}>
          <button type="button" className={styles.iconBtn} onClick={() => go(-1)} aria-label="Назад"><ChevronLeft size={18} /></button>
          <button type="button" className="sd-btn-ghost" onClick={() => setDate(todayIn(offset))}>Сегодня</button>
          <button type="button" className={styles.iconBtn} onClick={() => go(1)} aria-label="Вперёд"><ChevronRight size={18} /></button>
        </div>
        <div className="sd-seg" role="tablist" aria-label="Вид календаря">
          {VIEWS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? 'on' : ''} onClick={() => setView(item.id)}>{item.label}</button>
          ))}
        </div>
        {view === 'day' && (
          <div className="sd-seg" role="group" aria-label="Колонки дня">
            <button type="button" aria-pressed={axis === 'chair'} className={axis === 'chair' ? 'on' : ''} onClick={() => setAxis('chair')}>Кресла</button>
            <button type="button" aria-pressed={axis === 'doctor'} className={axis === 'doctor' ? 'on' : ''} onClick={() => setAxis('doctor')}>Врачи</button>
          </div>
        )}
        <label className="sr-only" htmlFor="calendar-doctor">Врач</label>
        <select id="calendar-doctor" className={styles.filter} value={doctor} onChange={(event) => setDoctor(event.target.value)}>
          <option value="">Все врачи</option>
          {shell?.doctors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button type="button" className="sd-btn" onClick={book} disabled={!shell}>Записать</button>
      </div>

      {month && <MonthStrip days={month.days} selected={date} offset={offset} onPick={pick} />}

      {error && (
        <div className={styles.error} role="alert">
          <span>Расписание не загрузилось: {error}</span>
          <button type="button" className="sd-btn-ghost" onClick={refresh}>Повторить</button>
        </div>
      )}

      {!shell && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем расписание" />}

      {shell && month && week && (
        <div className={styles.body} data-view={view}>
          <div className={styles.work}>
            {view === 'day' && (
              columns.length ? (
                <TimeGrid label="День по креслам" columns={columns} visits={dayVisits} offset={offset} hours={month.hours} selectedId={selectedId} pendingIds={pending}
                  onSelect={(visit) => setSelectedId(visit.id)} onSlot={openSlot} onMove={move} />
              ) : <p className={styles.empty}>В клинике пока нет кресел. Добавьте их в настройках, чтобы записывать пациентов.</p>
            )}
            {view === 'week' && (
              <TimeGrid label="Неделя" columns={columns} visits={weekVisits} offset={offset} hours={month.hours} selectedId={selectedId} pendingIds={pending}
                onSelect={(visit) => setSelectedId(visit.id)} onSlot={openSlot} onMove={move} />
            )}
            {view === 'month' && <MonthView days={month.days} selected={date} offset={offset} onPick={pick} />}
            {view === 'agenda' && (
              <Agenda dates={Array.from({ length: 7 }, (_, index) => addDays(weekFrom, index))} visits={weekVisits} offset={offset} selectedId={selectedId} onSelect={(visit) => setSelectedId(visit.id)} />
            )}
          </div>
          {view !== 'month' && (
            <VisitPanel visit={selected} offset={offset} busy={busy} onStatus={changeStatus} onReschedule={reschedule} onClose={() => setSelectedId(null)} />
          )}
        </div>
      )}

      {toast && (
        <div className={styles.toast} data-tone={toast.tone} role={toast.tone === 'bad' ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)}>Понятно</button>
        </div>
      )}
    </div>
  );
}
