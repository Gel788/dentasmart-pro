'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Minus, Plus, Search, UserPlus, X } from 'lucide-react';
import { effectiveHours, weekHoursOf, type DayHours, type ScheduleException } from '@dentasmart/shared';
import { PatientForm, type PatientSeed } from '@/components/studio/patient-form';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useFocus } from '@/lib/focus';
import { phoneDigits, splitName } from '@/lib/phone';
import styles from './booking.module.css';

type CatalogItem = { id: string; name: string; price: number; durationMin: number };
type Hit = { id: string; firstName: string; lastName: string; phone: string | null };
type Brief = { id: string; firstName: string; lastName: string; phone: string | null; debt: number; alerts: { tone: string; text: string }[] };
type Shell = {
  branches: { id: string; name: string; cabinets: { id: string; name: string }[] }[];
  doctors: { id: string; name: string; weekHours?: DayHours[] | null }[];
  exceptions?: ScheduleException[];
  appointments: { id: string; patientId: string; patient: string; service: string; startsAt: string; endsAt: string }[];
};

const LENGTHS = [15, 30, 45, 60, 90, 120];
type Range = { offsetMinutes: number; week?: DayHours[]; exceptions?: ScheduleException[] };
const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Booking a slot: who, what, how long, with whom and where, then one button. A side sheet on the desk,
 * a full screen with the button pinned to the bottom on a phone.
 */
export function BookingSheet() {
  const { focus, setFocus, bump } = useFocus();
  const slot = focus?.type === 'slot' ? focus : null;
  const [startsAt, setStartsAt] = useState(slot?.startsAt ?? '');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [patient, setPatient] = useState<Brief | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [duration, setDuration] = useState(30);
  const [shell, setShell] = useState<Shell | null>(null);
  const [doctorId, setDoctorId] = useState(slot?.doctorId ?? '');
  const [cabinetId, setCabinetId] = useState(slot?.cabinetId ?? '');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [range, setRange] = useState<Range | null>(null);
  const [confirmOutside, setConfirmOutside] = useState(false);
  const [done, setDone] = useState<{ name: string; patientId: string; when: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setConfirmOutside(false); }, [startsAt, doctorId, duration]);

  const editing = !!slot?.appointmentId;
  const day = (startsAt || slot?.startsAt || '').slice(0, 10);

  useEffect(() => {
    if (!slot) return;
    setStartsAt(slot.startsAt);
    setDoctorId(slot.doctorId ?? '');
    setCabinetId(slot.cabinetId ?? '');
    setError('');
    setConfirmCancel(false);
    setDone(null);
  }, [slot?.startsAt, slot?.doctorId, slot?.cabinetId, slot?.appointmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slot) return;
    api<CatalogItem[]>('/workspace/catalog').then(setCatalog).catch(() => setCatalog([]));
  }, [!!slot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slot || !day) return;
    api<Shell>(`/workspace/schedule?date=${day}`).then(setShell).catch(() => setShell(null));
    api<Range>(`/workspace/schedule/range?from=${day}&to=${day}`).then(setRange).catch(() => setRange(null));
  }, [!!slot, day]); // eslint-disable-line react-hooks/exhaustive-deps

  // A patient chosen earlier (from the card's «Записать») or the visit being edited comes in ready.
  useEffect(() => {
    if (!slot) return;
    if (slot.appointmentId) return;
    try {
      const raw = sessionStorage.getItem('sd_book_patient');
      if (raw) void choose((JSON.parse(raw) as { id: string }).id);
    } catch {
      sessionStorage.removeItem('sd_book_patient');
    }
  }, [slot?.appointmentId, !!slot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slot?.appointmentId || !shell) return;
    const appt = shell.appointments.find((item) => item.id === slot.appointmentId);
    if (!appt) return;
    void choose(appt.patientId);
    const service = catalog.find((item) => item.name === appt.service);
    if (service) setServiceId(service.id);
    const minutes = Math.round((Date.parse(appt.endsAt) - Date.parse(appt.startsAt)) / 60000);
    if (minutes > 0) setDuration(minutes);
  }, [slot?.appointmentId, shell, catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const handle = setTimeout(() => {
      api<Hit[]>(`/workspace/search?q=${encodeURIComponent(query)}`).then(setHits).catch(() => setHits([]));
    }, 160);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!slot) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !creating) setFocus(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slot, creating, setFocus]);

  const services = useMemo(() => {
    const words = serviceQuery.trim().toLowerCase();
    const list = words ? catalog.filter((item) => item.name.toLowerCase().includes(words)) : catalog;
    return list.slice(0, words ? 30 : 8);
  }, [catalog, serviceQuery]);
  const service = catalog.find((item) => item.id === serviceId) ?? null;

  if (!slot) return null;
  // Until the sheet's own clock has caught up with a new slot, the slot's time is the time.
  const at = startsAt || slot.startsAt;

  async function choose(id: string) {
    setQuery('');
    setHits([]);
    try {
      setPatient(await api<Brief>(`/workspace/patients/${id}/brief`));
    } catch {
      setPatient(null);
    }
  }

  const close = () => setFocus(null);
  const ends = new Date(Date.parse(at) + duration * 60000).toISOString();
  // Does the visit fit the chosen doctor's day (their week, holidays, vacation, break)?
  const offset = range?.offsetMinutes ?? 180;
  const wall = (iso: string) => { const date = new Date(Date.parse(iso) + offset * 60000); return date.getUTCHours() * 60 + date.getUTCMinutes(); };
  const localDay = new Date(Date.parse(at) + offset * 60000).toISOString().slice(0, 10);
  const doctorRow = shell?.doctors.find((item) => item.id === doctorId);
  const allExceptions = [...(range?.exceptions ?? []), ...(shell?.exceptions ?? [])];
  const workday = range ? effectiveHours(doctorRow?.weekHours ?? range.week ?? weekHoursOf(null, null), localDay, allExceptions, doctorId || null) : undefined;
  const from = wall(at);
  const to = from + duration;
  const outside = workday === undefined ? null
    : workday === null ? `${doctorRow ? doctorRow.name : 'Клиника'}: в этот день не работает`
    : from < workday.opensAt || to > workday.closesAt ? `${doctorRow ? doctorRow.name : 'Клиника'} работает ${toClock(workday.opensAt)}–${toClock(workday.closesAt)}`
    : workday.breakFrom !== undefined && workday.breakTo !== undefined && from < workday.breakTo && to > workday.breakFrom ? `Попадает на перерыв ${toClock(workday.breakFrom)}–${toClock(workday.breakTo)}`
    : null;
  const shift = (minutes: number) => setStartsAt(new Date(Date.parse(at) + minutes * 60000).toISOString());
  const cabinets = shell?.branches.flatMap((branch) => branch.cabinets.map((cabinet) => ({ ...cabinet, branch: branch.name }))) ?? [];
  const many = (shell?.branches.length ?? 0) > 1;

  const submit = async () => {
    if (!patient) { setError('Выберите пациента или добавьте нового'); searchRef.current?.focus(); return; }
    if (outside && !confirmOutside) { setConfirmOutside(true); return; }
    setPending(true);
    setError('');
    try {
      const body = { patientId: patient.id, startsAt: at, durationMin: duration, doctorId: doctorId || undefined, cabinetId: cabinetId || undefined, serviceId: serviceId || undefined };
      if (slot.appointmentId) await api(`/appointments/${slot.appointmentId}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/workspace/appointments', { method: 'POST', body: JSON.stringify(body) });
      bump();
      // The sheet answers in place; the old context panel no longer pops up over the calendar.
      setDone({ name: `${patient.lastName} ${patient.firstName}`, patientId: patient.id, when: `${new Date(at).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}, ${hm(at)}–${hm(ends)}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось записать');
    } finally {
      setPending(false);
    }
  };

  const cancelVisit = async () => {
    setPending(true);
    try {
      await api(`/appointments/${slot.appointmentId}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) });
      bump();
      setFocus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отменить');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.back} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="booking-title">
        <header className={styles.head}>
          <button type="button" className={styles.icon} onClick={close} aria-label="Закрыть"><span className={styles.backIcon}><ArrowLeft /></span><span className={styles.closeIcon}><X /></span></button>
          <h2 id="booking-title">{editing ? 'Изменить запись' : 'Новая запись'}</h2>
        </header>

        {done ? (
          <div className={styles.done} role="status">
            <CheckCircle2 className={styles.doneIcon} aria-hidden="true" />
            <h3>{editing ? 'Запись изменена' : 'Записано'}</h3>
            <p><b>{done.name}</b><span>{done.when}</span></p>
            <div className={styles.doneActs}>
              <button type="button" className={styles.submit} onClick={close}>Готово</button>
              <Link className="sd-btn-ghost" href={`/patients/${done.patientId}`} onClick={close}>Открыть карту</Link>
              {!editing && <button type="button" className="sd-btn-ghost" onClick={() => { setDone(null); setPatient(null); setServiceId(''); }}>Записать ещё</button>}
            </div>
          </div>
        ) : (<>
        <div className={styles.body}>
          {/* When: the time as the big figure, nudged by a quarter hour. */}
          <section className={styles.when} aria-label="Время">
            <p className={styles.date}>{new Date(at).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <div className={styles.timeRow}>
              <button type="button" className={styles.step} onClick={() => shift(-15)} aria-label="На 15 минут раньше"><Minus /></button>
              <span className={styles.time}>{hm(at)}<small>–{hm(ends)}</small></span>
              <button type="button" className={styles.step} onClick={() => shift(15)} aria-label="На 15 минут позже"><Plus /></button>
            </div>
            {outside && <p className={styles.note}><AlertTriangle size={16} aria-hidden="true" />Вне графика. {outside}. Записать можно, но подтвердите.</p>}
          </section>

          {/* Who. */}
          <section className={styles.block} aria-labelledby="booking-patient">
            <h3 id="booking-patient">Пациент</h3>
            {patient ? (
              <div className={styles.chosen}>
                <span className={styles.avatar} aria-hidden="true">{patient.lastName[0]}{patient.firstName[0]}</span>
                <span className={styles.chosenText}>
                  <b>{patient.lastName} {patient.firstName}</b>
                  <small>{[patient.phone, patient.debt > 0 ? `долг ${formatMoney(patient.debt)}` : null].filter(Boolean).join(' · ') || 'без телефона'}</small>
                </span>
                {!editing && <button type="button" className={styles.link} onClick={() => { setPatient(null); setTimeout(() => searchRef.current?.focus(), 0); }}>Другой</button>}
                {patient.alerts.length > 0 && (
                  <ul className={styles.alerts}>{patient.alerts.map((alert) => <li key={alert.text} data-tone={alert.tone}>{alert.text}</li>)}</ul>
                )}
              </div>
            ) : (
              <>
                <label className={styles.search}>
                  <Search aria-hidden="true" />
                  <span className="sr-only">Фамилия или телефон</span>
                  <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Фамилия или телефон" autoComplete="off" autoFocus={!editing} enterKeyHint="search" />
                </label>
                <ul className={styles.options}>
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button type="button" onClick={() => void choose(hit.id)}>
                        <b>{hit.lastName} {hit.firstName}</b>
                        <small>{hit.phone ?? 'без телефона'}</small>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" className={styles.addNew} onClick={() => setCreating(true)}>
                      <UserPlus aria-hidden="true" />
                      <b>{query.trim().length >= 2 && hits.length === 0 ? `«${query.trim()}» нет в базе — добавить` : 'Новый пациент'}</b>
                    </button>
                  </li>
                </ul>
              </>
            )}
          </section>

          {/* What. */}
          <section className={styles.block} aria-labelledby="booking-service">
            <h3 id="booking-service">Услуга {service && <em>{formatMoney(service.price)}</em>}</h3>
            {service ? (
              <div className={styles.chosen}>
                <span className={styles.chosenText}><b>{service.name}</b><small>{service.durationMin} мин по прайсу</small></span>
                <button type="button" className={styles.link} onClick={() => setServiceId('')}>Убрать</button>
              </div>
            ) : (
              <>
                <label className={styles.search}>
                  <Search aria-hidden="true" />
                  <span className="sr-only">Найти услугу</span>
                  <input value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Найти услугу в прайсе" autoComplete="off" />
                </label>
                <ul className={styles.options}>
                  {services.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => { setServiceId(item.id); setDuration(item.durationMin || duration); setServiceQuery(''); }}>
                        <b>{item.name}</b>
                        <small>{item.durationMin} мин · {formatMoney(item.price)}</small>
                      </button>
                    </li>
                  ))}
                  {services.length === 0 && <li className={styles.empty}>В прайсе такой услуги нет. Можно записать без услуги.</li>}
                </ul>
              </>
            )}
          </section>

          {/* How long. */}
          <section className={styles.block} aria-labelledby="booking-length">
            <h3 id="booking-length">Длительность</h3>
            <div className={styles.chips} role="radiogroup" aria-labelledby="booking-length">
              {LENGTHS.map((minutes) => (
                <button key={minutes} type="button" role="radio" aria-checked={duration === minutes} onClick={() => setDuration(minutes)}>{minutes < 60 ? `${minutes} мин` : `${minutes / 60} ч`}</button>
              ))}
              {!LENGTHS.includes(duration) && <button type="button" role="radio" aria-checked="true">{duration} мин</button>}
            </div>
          </section>

          {/* With whom and where. */}
          {shell && (shell.doctors.length > 0 || cabinets.length > 0) && (
            <section className={styles.block} aria-labelledby="booking-place">
              <h3 id="booking-place">Врач и кабинет</h3>
              {shell.doctors.length > 0 && (
                <div className={styles.chips} role="radiogroup" aria-label="Врач">
                  {shell.doctors.map((item) => (
                    <button key={item.id} type="button" role="radio" aria-checked={doctorId === item.id} onClick={() => setDoctorId(item.id)}>{item.name}</button>
                  ))}
                </div>
              )}
              {cabinets.length > 0 && (
                <div className={styles.chips} role="radiogroup" aria-label="Кабинет">
                  {cabinets.map((item) => (
                    <button key={item.id} type="button" role="radio" aria-checked={cabinetId === item.id} onClick={() => setCabinetId(item.id)}>{many ? `${item.name} · ${item.branch}` : item.name}</button>
                  ))}
                </div>
              )}
            </section>
          )}

          {editing && (
            <section className={styles.danger}>
              {confirmCancel ? (
                <>
                  <p>Отменить запись {patient ? `${patient.lastName} ${patient.firstName}` : ''} на {hm(at)}? Визит останется в истории как отменённый.</p>
                  <div><button type="button" className="sd-btn-ghost" onClick={() => setConfirmCancel(false)}>Нет, оставить</button><button type="button" className={styles.cancelBtn} disabled={pending} onClick={() => void cancelVisit()}>Да, отменить</button></div>
                </>
              ) : (
                <button type="button" className={styles.cancelLink} onClick={() => setConfirmCancel(true)}>Отменить запись</button>
              )}
            </section>
          )}
        </div>

        <footer className={styles.foot}>
          {error && <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}
          {outside && confirmOutside && <p className={styles.warn} role="alert">{outside}. Нажмите ещё раз, если запись согласована.</p>}
          <div className={styles.summary}>
            <span><Clock size={15} aria-hidden="true" />{hm(at)}–{hm(ends)} · {duration} мин</span>
            {service && <b>{formatMoney(service.price)}</b>}
          </div>
          <button type="button" className={styles.submit} data-outside={outside && confirmOutside ? "" : undefined} disabled={pending} onClick={() => void submit()}>
            {pending ? 'Сохраняем…' : outside && confirmOutside ? <><AlertTriangle aria-hidden="true" />Да, записать вне графика</> : <><Check aria-hidden="true" />{editing ? 'Сохранить изменения' : `Записать на ${hm(at)}`}</>}
          </button>
        </footer>
        </>)}
      </section>

      <PatientForm
        open={creating}
        seed={seedFromQuery(query)}
        onClose={() => setCreating(false)}
        onSaved={(created) => {
          setCreating(false);
          void choose(created.id);
        }}
      />
    </div>
  );
}

function hm(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function seedFromQuery(query: string): PatientSeed {
  if (phoneDigits(query).length >= 4) return { phone: query, source: 'WALK_IN' };
  return { ...splitName(query), source: 'WALK_IN' };
}
