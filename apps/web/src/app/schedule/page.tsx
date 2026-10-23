'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { effectiveHours, exceptionOn, visibleHours, weekHoursOf, type DayHours, type ScheduleException, type VisitStatus } from '@dentasmart/shared';
import { Protected } from '@/components/protected';
import { Agenda } from '@/components/schedule/agenda';
import { WeekStrip } from '@/components/schedule/week-strip';
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
type Toast = { tone: 'ok' | 'bad'; text: string; undo?: () => void } | null;

const VIEWS: { id: View; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'agenda', label: 'Повестка' },
];

// One colour per doctor, the same on every screen of the calendar; white text on each stays readable.
const DOCTOR_COLORS = ['#2563eb', '#7c3aed', '#0f8f84', '#db2777', '#c2410c', '#4f46e5', '#0e7490', '#15803d'];

const visitsWord = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return 'визитов';
  if (n % 10 === 1) return 'визит';
  if (n % 10 >= 2 && n % 10 <= 4) return 'визита';
  return 'визитов';
};

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
  const [movingId, setMovingId] = useState<string | null>(null);
  useEffect(() => {
    if (!movingId) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMovingId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [movingId]);
  const [tick, setTick] = useState(0);
  // Outside opening hours stays hidden until asked for; then the whole day opens for a booking out of hours.
  const [allHours, setAllHours] = useState(false);

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
    const timer = window.setTimeout(() => setToast(null), toast.tone === 'bad' ? 7000 : toast.undo ? 8000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const dayVisits = useMemo(() => (shell?.appointments ?? []).filter((visit) => !doctor || visit.doctorId === doctor), [shell, doctor]);
  const weekVisits = useMemo(() => (week?.appointments ?? []).filter((visit) => !doctor || visit.doctorId === doctor), [week, doctor]);
  const allVisits = useMemo(() => [...dayVisits, ...weekVisits], [dayVisits, weekVisits]);
  const selected = allVisits.find((visit) => visit.id === selectedId) ?? null;
  const doctorColor = useMemo(() => {
    const ids = [...(shell?.doctors ?? [])].map((item) => item.id).sort();
    return (id: string | null) => (id && ids.includes(id) ? DOCTOR_COLORS[ids.indexOf(id) % DOCTOR_COLORS.length] : '#64748b');
  }, [shell]);

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
    // A visit with no chair or doctor, or in one switched off since, gets its own column instead of vanishing.
    const withStray = (list: Column[], label: string): Column[] => {
      const stray = (visit: BoardVisit) => !list.some((column) => column.match(visit));
      return dayVisits.some(stray) ? [...list, { id: 'stray', date, label, sub: 'перенесите в нужную колонку', match: stray, move: {} }] : list;
    };
    if (axis === 'doctor') {
      return withStray(shell.doctors
        .filter((item) => !doctor || item.id === doctor)
        .map((item) => ({ id: item.id, date, label: item.name, sub: 'врач', match: (visit: BoardVisit) => visit.doctorId === item.id, move: { doctorId: item.id } })), 'Без врача');
    }
    const many = shell.branches.length > 1;
    return withStray(shell.branches.flatMap((branch) =>
      branch.cabinets.map((cabinet) => ({
        id: cabinet.id,
        date,
        label: cabinet.name,
        sub: many ? branch.name : undefined,
        match: (visit: BoardVisit) => visit.cabinetId === cabinet.id,
        move: { cabinetId: cabinet.id },
      })),
    ), 'Без кабинета');
  }, [shell, date, view, axis, doctor, offset, dayVisits]);

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
    const carried = movingId ? [...dayVisits, ...weekVisits].find((visit) => visit.id === movingId) : null;
    if (carried) {
      setMovingId(null);
      void move(carried, column, minutes);
      return;
    }
    setFocus({
      type: 'slot',
      startsAt: instantAt(column.date, minutes, offset),
      cabinetId: column.move.cabinetId ?? (axis === 'chair' ? undefined : shell.branches[0]?.cabinets[0]?.id),
      doctorId: column.move.doctorId ?? (doctor || shell.doctors[0]?.id),
      label: `${column.label} · ${clock(minutes)}${outsideHours(column, minutes) ? ' · вне графика' : ''}`,
    });
  };

  const book = () => {
    if (!shell || !date) return;
    const now = wallMinutes(new Date().toISOString(), offset);
    const opens = (date ? hoursOfDay(date)?.opensAt : null) ?? month?.hours.opensAt ?? 480;
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
    const before = { startsAt: visit.startsAt, endsAt: visit.endsAt, ...(visit.cabinetId ? { cabinetId: visit.cabinetId } : {}), ...(visit.doctorId ? { doctorId: visit.doctorId } : {}) };
    try {
      await api(`/appointments/${visit.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt, endsAt, ...column.move }) });
      setToast({
        tone: 'ok',
        text: `${visit.patient}: перенесено на ${dayTitle(column.date, { day: 'numeric', month: 'short' })}, ${clock(minutes)}`,
        // One tap puts the visit back where it was, through the same server checks.
        undo: () => {
          setToast(null);
          void api(`/appointments/${visit.id}`, { method: 'PATCH', body: JSON.stringify(before) })
            .then(() => { setToast({ tone: 'ok', text: `${visit.patient}: возвращено на прежнее время` }); refresh(); })
            .catch((err: Error) => setToast({ tone: 'bad', text: err.message || 'Не получилось вернуть: время уже занято' }));
        },
      });
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
  const movingVisit = movingId ? [...dayVisits, ...weekVisits].find((visit) => visit.id === movingId) ?? null : null;
  const weekFrom = weekStart(date);
  const title =
    view === 'day' ? dayTitle(date, { weekday: 'long', day: 'numeric', month: 'long' })
      : view === 'month' ? dayTitle(date, { month: 'long', year: 'numeric' })
        : `${dayTitle(weekFrom, { day: 'numeric', month: 'short' })} – ${dayTitle(addDays(weekFrom, 6), { day: 'numeric', month: 'short' })}`;
  const daySummary = month?.days.find((item) => item.date === date);

  const weekHours = month?.week ?? weekHoursOf(null, null);
  // Holidays, vacations and one-off hours from every payload on screen, each once.
  const exceptions = [...new Map([...(month?.exceptions ?? []), ...(week?.exceptions ?? []), ...(shell?.exceptions ?? [])].map((row) => [row.id ?? `${row.employeeId}-${row.dateFrom}`, row] as const)).values()] as ScheduleException[];
  function hoursOfDay(day: string): DayHours {
    return effectiveHours(weekHours, day, exceptions);
  }
  const shownDates = view === 'week' ? Array.from({ length: 7 }, (_, index) => addDays(weekFrom, index)) : date ? [date] : [];
  const shownVisits = view === 'week' ? weekVisits : dayVisits;
  // A doctor column follows that doctor's own week when one is set; chairs follow the clinic.
  const weekOf = (doctorId: string | undefined) => shell?.doctors.find((item) => item.id === doctorId)?.weekHours ?? weekHours;
  const columnHours = (column: Column): DayHours => {
    if (view === 'day' && axis === 'doctor') return effectiveHours(weekOf(column.id), column.date, exceptions, column.id);
    if (view === 'week' && doctor) return effectiveHours(weekOf(doctor), column.date, exceptions, doctor);
    return hoursOfDay(column.date);
  };
  function outsideHours(column: Column, minutes: number) {
    const hours = columnHours(column);
    return !hours || minutes < hours.opensAt || minutes >= hours.closesAt;
  }
  const gridHours = allHours
    ? { opensAt: 0, closesAt: 24 * 60 }
    : visibleHours([...shownDates.map(hoursOfDay), ...columns.map(columnHours)], shownVisits.map((visit) => ({ start: wallMinutes(visit.startsAt, offset), end: wallMinutes(visit.endsAt, offset) })));
  const dayOff = view === 'day' && !!date && !hoursOfDay(date);
  const todayHours = date ? hoursOfDay(date) : null;
  const hoursLabel = (day: DayHours) => (day ? `${clock(day.opensAt)}–${clock(day.closesAt)}${day.breakFrom !== undefined && day.breakTo !== undefined ? `, перерыв ${clock(day.breakFrom)}–${clock(day.breakTo)}` : ''}` : 'выходной');
  const describe = (row: ScheduleException) => `${row.note || (row.opensAt === null ? 'не работает' : 'другие часы')}${row.opensAt !== null && row.closesAt !== null ? ` ${clock(row.opensAt)}–${clock(row.closesAt)}` : ''}`;
  const clinicNote = view === 'day' && date ? exceptionOn(date, exceptions.filter((row) => row.employeeId === null)) : null;
  const dayNotes = [
    ...(clinicNote ? [`Клиника: ${describe(clinicNote)}`] : []),
    ...(view === 'day' && date
      ? (shell?.doctors ?? []).flatMap((item) => {
          const own = exceptions.find((row) => row.employeeId === item.id && row.dateFrom <= date && date <= row.dateTo);
          return own ? [`${item.name}: ${describe(own)}`] : [];
        })
      : []),
  ];

  // Free windows of at least half an hour, earliest first: one tap books it.
  const windows = (() => {
    if (view !== 'day' || !date) return [];
    const nowMinutes = date === todayIn(offset) ? Math.ceil(wallMinutes(new Date().toISOString(), offset) / 15) * 15 : 0;
    if (date < todayIn(offset)) return [];
    const found: { column: Column; from: number; to: number }[] = [];
    for (const column of columns) {
      if (column.id === 'stray') continue;
      const hours = columnHours(column);
      if (!hours) continue;
      const busy = dayVisits
        .filter((visit) => column.match(visit) && visit.status !== 'CANCELLED' && visit.status !== 'NO_SHOW')
        .map((visit) => ({ from: wallMinutes(visit.startsAt, offset), to: wallMinutes(visit.endsAt, offset) }));
      if (hours.breakFrom !== undefined && hours.breakTo !== undefined) busy.push({ from: hours.breakFrom, to: hours.breakTo });
      busy.sort((a, b) => a.from - b.from);
      let cursor = Math.max(hours.opensAt, nowMinutes);
      for (const slot of [...busy, { from: hours.closesAt, to: hours.closesAt }]) {
        const end = Math.min(slot.from, hours.closesAt);
        if (end - cursor >= 30) found.push({ column, from: cursor, to: end });
        cursor = Math.max(cursor, slot.to);
      }
    }
    return found.sort((a, b) => a.from - b.from).slice(0, 8);
  })();
  const span = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ''}` : `${minutes} мин`);
  const legend = (shell?.doctors ?? []).filter((item) => (view === 'week' ? weekVisits : dayVisits).some((visit) => visit.doctorId === item.id));

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barTop}>
          <div className={`${styles.nav} ${styles.navDesk}`}>
            <button type="button" className={styles.iconBtn} onClick={() => go(-1)} aria-label="Назад"><ChevronLeft size={18} /></button>
            <button type="button" className={styles.todayBtn} onClick={() => setDate(todayIn(offset))}>Сегодня</button>
            <button type="button" className={styles.iconBtn} onClick={() => go(1)} aria-label="Вперёд"><ChevronRight size={18} /></button>
          </div>
          <h1 className={styles.title}>
            <span>{title.charAt(0).toUpperCase() + title.slice(1)}</span>
            <small>
              {view === 'day' && daySummary ? `${daySummary.visits} ${visitsWord(daySummary.visits)} · кресла заняты на ${Math.round(daySummary.ratio * 100)}%` : view === 'agenda' ? 'Повестка на неделю' : 'Расписание клиники'}
            </small>
          </h1>
          <div className={styles.tools}>
            <div className={`${styles.nav} ${styles.navPhone}`}>
              <button type="button" className={styles.iconBtn} onClick={() => go(-1)} aria-label="Назад"><ChevronLeft size={18} /></button>
              <button type="button" className={styles.todayBtn} onClick={() => setDate(todayIn(offset))}>Сегодня</button>
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
          </div>
          <button type="button" className={styles.book} onClick={book} disabled={!shell} aria-label="Записать пациента"><Plus size={18} aria-hidden="true" /><span>Записать</span></button>
        </div>
        {week && view !== 'month' && <WeekStrip days={week.days} selected={date} offset={offset} onPick={setDate} onMonth={() => setView('month')} />}
      </header>

      {error && (
        <div className={styles.error} role="alert">
          <span>Расписание не загрузилось: {error}</span>
          <button type="button" className="sd-btn-ghost" onClick={refresh}>Повторить</button>
        </div>
      )}

      {!shell && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем расписание" />}

      {shell && month && week && (
        <div className={styles.body} data-view={view} data-open={!!selected && view !== 'month'}>
          <div className={styles.work}>
            {(view === 'day' || view === 'week') && (
              <div className={styles.hoursBar}>
                {view === 'day' && date >= todayIn(offset) && (
                  <div className={styles.free}>
                    <b>{windows.length ? 'Свободно:' : dayOff ? 'Выходной по графику' : 'Свободных окон на этот день нет'}</b>
                    {windows.map((slot) => (
                      <button key={`${slot.column.id}-${slot.from}`} type="button" className={styles.freeChip} onClick={() => openSlot(slot.column, slot.from)}>
                        <strong>{clock(slot.from)}</strong>
                        <span>{slot.column.label} · {span(slot.to - slot.from)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {dayNotes.length > 0 && <em className={styles.hoursNote}>{dayNotes.join(' · ')}</em>}
                {legend.length > 0 && (
                  <ul className={styles.legend} aria-label="Цвета врачей">
                    {legend.map((item) => <li key={item.id}><i style={{ background: doctorColor(item.id) }} />{item.name}</li>)}
                  </ul>
                )}
                <button type="button" className={styles.hoursToggle} aria-pressed={allHours} onClick={() => setAllHours((on) => !on)} title={view === 'day' ? `Работаем ${hoursLabel(todayHours)}` : undefined}>{allHours ? 'Только рабочие часы' : 'Всё время'}</button>
              </div>
            )}
            {view === 'day' && dayOff && !allHours && dayVisits.length === 0 && (
              <div className={styles.dayOff}>
                <h2>Выходной по графику</h2>
                <p>В этот день клиника не работает. Если нужно принять пациента, откройте всё время и запишите в свободный час.</p>
                <button type="button" className="sd-btn" onClick={() => setAllHours(true)}>Показать всё время</button>
              </div>
            )}
            {movingVisit && (view === 'day' || view === 'week') && (
              <div className={styles.moveBar} role="status">
                <b>Перенос: {movingVisit.patient}</b>
                <span>Нажмите новое время в сетке — можно другой день или кресло. Сервер проверит, что время свободно.</span>
                <button type="button" className="sd-btn-ghost" onClick={() => setMovingId(null)}>Отмена</button>
              </div>
            )}
            {view === 'day' && !(dayOff && !allHours && dayVisits.length === 0) && (
              columns.length ? (
                <TimeGrid label="День по креслам" showDoctor={axis === 'chair'} colorOf={doctorColor} doctorAxis={axis === 'doctor'} columns={columns} visits={dayVisits} offset={offset} hours={gridHours} dayHours={columnHours} selectedId={selectedId} pendingIds={pending}
                  onSelect={(visit) => setSelectedId(visit.id)} onSlot={openSlot} onMove={move} moving={movingVisit} />
              ) : <p className={styles.empty}>В клинике пока нет кресел. Добавьте их в настройках, чтобы записывать пациентов.</p>
            )}
            {view === 'week' && (
              <TimeGrid label="Неделя" colorOf={doctorColor} columns={columns} visits={weekVisits} offset={offset} hours={gridHours} dayHours={columnHours} selectedId={selectedId} pendingIds={pending}
                onSelect={(visit) => setSelectedId(visit.id)} onSlot={openSlot} onMove={move} moving={movingVisit} />
            )}
            {view === 'month' && <MonthView days={month.days} selected={date} offset={offset} onPick={pick} />}
            {view === 'agenda' && (
              <Agenda dates={Array.from({ length: 7 }, (_, index) => addDays(weekFrom, index))} visits={weekVisits} offset={offset} selectedId={selectedId} onSelect={(visit) => setSelectedId(visit.id)} />
            )}
          </div>
          {view !== 'month' && selected && (
            <VisitPanel visit={selected} offset={offset} busy={busy} onStatus={changeStatus} onReschedule={reschedule} onMoveOnGrid={(view === 'day' || view === 'week') ? (visit) => { setMovingId(visit.id); setSelectedId(null); } : undefined} onClose={() => setSelectedId(null)} />
          )}
        </div>
      )}

      {toast && (
        <div className={styles.toast} data-tone={toast.tone} role={toast.tone === 'bad' ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          {toast.undo && <button type="button" onClick={toast.undo}>Отменить</button>}
          <button type="button" onClick={() => setToast(null)}>{toast.undo ? 'Закрыть' : 'Понятно'}</button>
        </div>
      )}
    </div>
  );
}
