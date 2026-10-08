'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Calendar } from 'lucide-react';
import { Protected } from '@/components/protected';
import { ScheduleCalendar, type CalAppointment } from '@/components/schedule-calendar';
import { ChairDay } from '@/components/chair-day';
import { ScheduleKanban, type KanbanMode } from '@/components/schedule-kanban';
import { VisitCompleteModal } from '@/components/visit-complete-modal';
import { PatientAvatar } from '@/components/patient-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TabBar } from '@/components/ui/tab-bar';
import { PageHeader } from '@/components/ui/page-header';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { APPOINTMENT_STATUS, formatDate } from '@/lib/format';

interface Patient { id: string; firstName: string; lastName: string }
interface Service { id: string; name: string; durationMin: number }
interface Branch { id: string; name: string }
interface Doctor { id: string; firstName: string; lastName: string }
interface WaitEntry {
  id: string;
  patient: { id: string; firstName: string; lastName: string; phone?: string };
  service?: { name: string } | null;
}

type View = 'chairs' | 'calendar' | 'kanban' | 'list' | 'waitlist';

function sameDay(iso: string, day: Date) {
  const s = new Date(iso);
  return (
    s.getFullYear() === day.getFullYear() &&
    s.getMonth() === day.getMonth() &&
    s.getDate() === day.getDate()
  );
}

function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type ApptForm = {
  patientId: string;
  branchId: string;
  serviceId: string;
  doctorId: string;
  cabinetId: string;
  notes: string;
  startsLocal: string;
  endsLocal: string;
};

const EMPTY_FORM = (branchId: string): ApptForm => ({
  patientId: '',
  branchId,
  serviceId: '',
  doctorId: '',
  cabinetId: '',
  notes: '',
  startsLocal: '',
  endsLocal: '',
});

const STATUS_KEYS = ['SCHEDULED', 'CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'danger' | 'warning'> = {
  SCHEDULED: 'default',
  CONFIRMED: 'accent',
  WAITING: 'warning',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
};

function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : '';
}

function applyServiceDuration(startsLocal: string, durationMin: number) {
  if (!startsLocal) return '';
  const s = new Date(startsLocal);
  const e = new Date(s);
  e.setMinutes(e.getMinutes() + durationMin);
  return toLocalInput(e.toISOString());
}

function SchedulePageContent() {
  const searchParams = useSearchParams();
  const { branchId, branch } = useBranch();
  const [view, setView] = useState<View>('chairs');
  const [kanbanMode, setKanbanMode] = useState<KanbanMode>('status');
  const [kanbanDay, setKanbanDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [doctorFilter, setDoctorFilter] = useState('');
  const [cabinetFilter, setCabinetFilter] = useState('');
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + 1);
    return d;
  });
  const [items, setItems] = useState<CalAppointment[]>([]);
  const [waitlist, setWaitlist] = useState<WaitEntry[]>([]);
  const [slots, setSlots] = useState<{ startsAt: string; endsAt: string }[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [apptModal, setApptModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [waitModal, setWaitModal] = useState(false);
  const [form, setForm] = useState<ApptForm>(EMPTY_FORM(branchId));
  const [waitPatientId, setWaitPatientId] = useState('');
  const [waitServiceId, setWaitServiceId] = useState('');
  const [completeApptId, setCompleteApptId] = useState<string | null>(null);
  const [pendingToMake, setPendingToMake] = useState<string | null>(null);
  const [boardRev, setBoardRev] = useState(0);

  const rangeEnd = new Date(weekStart);
  rangeEnd.setDate(rangeEnd.getDate() + 7);

  useEffect(() => {
    if (branchId) setForm((f) => ({ ...f, branchId }));
  }, [branchId]);

  const load = useCallback(() => {
    if (!branchId) return;
    const q = new URLSearchParams({
      from: weekStart.toISOString(),
      to: rangeEnd.toISOString(),
      branchId,
    });
    if (doctorFilter) q.set('doctorId', doctorFilter);
    if (cabinetFilter) q.set('cabinetId', cabinetFilter);
    api<CalAppointment[]>(`/appointments?${q}`).then(setItems);
    api<WaitEntry[]>('/queue/waitlist').then(setWaitlist);
  }, [weekStart, branchId, rangeEnd, doctorFilter, cabinetFilter]);

  useEffect(() => {
    load();
    api<{ items: Patient[] }>('/patients').then((r) => {
      setPatients(r.items);
      const preselect = searchParams.get('patientId');
      if (preselect) {
        setForm((f) => ({ ...f, patientId: preselect }));
        setApptModal(true);
      }
    });
    api<Service[]>('/services').then(setServices);
    api<Branch[]>('/branches').then(setBranches);
    api<Doctor[]>('/employees').then(setDoctors);
  }, [load, searchParams]);

  const onServiceChange = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    setForm((f) => ({
      ...f,
      serviceId,
      endsLocal: svc && f.startsLocal ? applyServiceDuration(f.startsLocal, svc.durationMin) : f.endsLocal,
    }));
  };

  const loadSlots = () => {
    const to = new Date();
    to.setDate(to.getDate() + 7);
    const svc = services.find((s) => s.id === form.serviceId);
    api<{ startsAt: string; endsAt: string }[]>(
      `/appointments/slots?branchId=${form.branchId}&durationMin=${svc?.durationMin ?? 30}&from=${new Date().toISOString()}&to=${to.toISOString()}`,
    ).then(setSlots);
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (status === 'COMPLETED') {
      setCompleteApptId(id);
    } else {
      load();
    }
  };

  const openCreate = (prefill?: Partial<ApptForm>) => {
    setEditId(null);
    setForm({ ...EMPTY_FORM(branchId), ...prefill, branchId });
    setApptModal(true);
  };

  const openEdit = (a: CalAppointment) => {
    setEditId(a.id);
    setForm({
      patientId: a.patient.id,
      branchId,
      serviceId: a.service?.id ?? '',
      doctorId: a.doctor?.id ?? '',
      cabinetId: a.cabinet?.id ?? '',
      notes: '',
      startsLocal: toLocalInput(a.startsAt),
      endsLocal: toLocalInput(a.endsAt),
    });
    setApptModal(true);
  };

  const patchDoctor = async (id: string, doctorId: string | null) => {
    await api(`/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ doctorId: doctorId ?? '' }),
    });
    load();
  };

  const kanbanItems = items.filter((a) => sameDay(a.startsAt, kanbanDay));

  const closeApptModal = () => {
    setApptModal(false);
    setEditId(null);
    setSlots([]);
    setPendingToMake(null);
  };

  const submitAppt = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      patientId: form.patientId,
      branchId: form.branchId,
      serviceId: form.serviceId || undefined,
      doctorId: form.doctorId || undefined,
      cabinetId: form.cabinetId || undefined,
      notes: form.notes || undefined,
      startsAt: fromLocalInput(form.startsLocal),
      endsAt: fromLocalInput(form.endsLocal),
    };
    if (editId) {
      await api(`/appointments/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await api('/appointments', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (!editId && pendingToMake && !pendingToMake.startsWith('hygiene:')) {
      await api(`/appointments/to-make/${pendingToMake}/schedule`, { method: 'POST' });
    }
    closeApptModal();
    setBoardRev((value) => value + 1);
    load();
  };

  const addWaitlist = async (e: FormEvent) => {
    e.preventDefault();
    await api('/queue/waitlist', {
      method: 'POST',
      body: JSON.stringify({
        patientId: waitPatientId,
        branchId,
        serviceId: waitServiceId || undefined,
      }),
    });
    setWaitModal(false);
    setWaitPatientId('');
    setWaitServiceId('');
    load();
  };

  const openSlot = (day: Date, hour: number) => {
    const s = new Date(day);
    s.setHours(hour, 0, 0, 0);
    const e = new Date(s);
    e.setMinutes(30);
    openCreate({
      startsLocal: toLocalInput(s.toISOString()),
      endsLocal: toLocalInput(e.toISOString()),
    });
  };

  const shiftWeek = (n: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + n * 7);
    setWeekStart(d);
  };

  return (
    <Protected>
      <PageHeader
        badge="Расписание"
        title="Записи и слоты"
        description="Календарь, лист ожидания, SMS-напоминания"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => shiftWeek(-1)}>←</Button>
            <Button variant="ghost" onClick={() => shiftWeek(1)}>→</Button>
            <TabBar
              tabs={[
                { id: 'chairs' as View, label: 'Кресла' },
                { id: 'kanban' as View, label: 'Канбан' },
                { id: 'calendar' as View, label: 'Неделя' },
                { id: 'list' as View, label: 'Список' },
                { id: 'waitlist' as View, label: `Ожидание (${waitlist.length})` },
              ]}
              value={view}
              onChange={setView}
            />
            <Button
              variant="ghost"
              onClick={async () => {
                const r = await api<{ queued: number }>('/reminders/queue-tomorrow', { method: 'POST' });
                alert(`В очередь: ${r.queued} напоминаний`);
              }}
            >
              SMS на завтра
            </Button>
            <Select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="max-w-[140px] text-xs">
              <option value="">Все врачи</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.lastName}</option>)}
            </Select>
            <Select value={cabinetFilter} onChange={(e) => setCabinetFilter(e.target.value)} className="max-w-[140px] text-xs">
              <option value="">Все кабинеты</option>
              {branch?.cabinets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button variant="ghost" onClick={() => setWaitModal(true)}>+ В ожидание</Button>
            <Button onClick={() => { setPendingToMake(null); openCreate(); }}>+ Запись</Button>
          </div>
        }
      />

      <div key={view} className="ds-route">
      {view === 'chairs' && branchId && (
        <ChairDay
          branchId={branchId}
          day={kanbanDay}
          onDayChange={setKanbanDay}
          patients={patients}
          services={services}
          revision={boardRev}
          onBook={(prefill) => {
            setPendingToMake(prefill.toMakeId ?? null);
            openCreate(prefill);
          }}
          onEdit={(visit) => {
            setPendingToMake(null);
            openEdit(visit);
          }}
        />
      )}

      {view === 'kanban' && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                const d = new Date(kanbanDay);
                d.setDate(d.getDate() - 1);
                setKanbanDay(d);
              }}
            >
              ←
            </Button>
            <Input
              type="date"
              className="max-w-[180px]"
              value={toDateInput(kanbanDay)}
              onChange={(e) => {
                const d = new Date(e.target.value);
                d.setHours(0, 0, 0, 0);
                setKanbanDay(d);
              }}
            />
            <Button
              variant="ghost"
              onClick={() => {
                const d = new Date(kanbanDay);
                d.setDate(d.getDate() + 1);
                setKanbanDay(d);
              }}
            >
              →
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                setKanbanDay(d);
              }}
            >
              Сегодня
            </Button>
            <span className="text-sm text-[var(--muted)]">
              {kanbanItems.length} записей на день
            </span>
          </div>
          {!kanbanItems.length ? (
            <EmptyState
              icon={Calendar}
              title="Нет записей на этот день"
              description="Выберите другую дату или создайте запись"
              action={<Button onClick={() => openCreate()}>+ Запись</Button>}
            />
          ) : (
            <ScheduleKanban
              appointments={kanbanItems}
              doctors={doctors}
              mode={kanbanMode}
              onModeChange={setKanbanMode}
              onStatusChange={async (id, status) => {
                await setStatus(id, status);
              }}
              onDoctorChange={patchDoctor}
              onCardClick={openEdit}
            />
          )}
        </div>
      )}

      {view === 'calendar' && (
        <div className="mt-2">
          <ScheduleCalendar
            weekStart={weekStart}
            appointments={items}
            onSlotClick={openSlot}
            onAppointmentClick={openEdit}
          />
        </div>
      )}

      {view === 'list' && (
        <div className="mt-6">
          {!items.length ? (
            <EmptyState icon={Calendar} title="Записей на эту неделю нет" description="Создайте запись или переключите неделю" />
          ) : (
            <div className="space-y-3">
              {items.map((a) => (
                <Card key={a.id} className="!p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PatientAvatar firstName={a.patient.firstName} lastName={a.patient.lastName} size="sm" />
                      <div>
                        <Link href={`/patients/${a.patient.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--accent)]">
                          {a.patient.lastName} {a.patient.firstName}
                        </Link>
                        <p className="text-sm text-[var(--muted)]">{formatDate(a.startsAt)}</p>
                        {a.service?.name && <p className="text-xs text-[var(--muted)]">{a.service.name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[a.status] ?? 'default'}>{APPOINTMENT_STATUS[a.status]}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Изменить</Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
                    {STATUS_KEYS.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatus(a.id, st)}
                        className={clsx(
                          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                          a.status === st
                            ? 'bg-[var(--surface)] text-[var(--text)]'
                            : 'text-[var(--muted)] hover:text-[var(--text-secondary)]',
                        )}
                      >
                        {APPOINTMENT_STATUS[st]}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'waitlist' && (
        <Card className="mt-6 !p-3" padding={false}>
          {!waitlist.length ? (
            <EmptyState icon={Calendar} title="Лист ожидания пуст" description="Добавьте пациента, когда нет свободных слотов" />
          ) : (
            <div className="space-y-1">
              {waitlist.map((w) => (
                <ListRow
                  key={w.id}
                  trailing={
                    <Button size="sm" onClick={() => openCreate({ patientId: w.patient.id })}>
                      Записать
                    </Button>
                  }
                >
                  <div className="flex items-center gap-3">
                    <PatientAvatar firstName={w.patient.firstName} lastName={w.patient.lastName} size="sm" />
                    <div>
                      <p className="font-medium text-[var(--text)]">{w.patient.lastName} {w.patient.firstName}</p>
                      {w.patient.phone && <p className="text-sm text-[var(--muted)]">{w.patient.phone}</p>}
                      {w.service?.name && <p className="text-xs text-[var(--accent)]">{w.service.name}</p>}
                    </div>
                  </div>
                </ListRow>
              ))}
            </div>
          )}
        </Card>
      )}
      </div>

      <Modal
        open={apptModal}
        onClose={closeApptModal}
        title={editId ? 'Редактировать запись' : 'Новая запись'}
        description={editId ? 'Время, врач и услуга' : 'Запись пациента на приём'}
        size="lg"
      >
        <form onSubmit={submitAppt} className="space-y-3">
          {!editId && (
            <div>
              <Label>Пациент</Label>
              <Select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                <option value="">—</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>
                ))}
              </Select>
            </div>
          )}
          {editId && (
            <p className="rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm">
              <Link href={`/patients/${form.patientId}`} className="font-medium text-[var(--accent)]">
                Карточка пациента
              </Link>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Начало</Label>
              <Input
                type="datetime-local"
                required
                value={form.startsLocal}
                onChange={(e) => {
                  const startsLocal = e.target.value;
                  const svc = services.find((s) => s.id === form.serviceId);
                  setForm((f) => ({
                    ...f,
                    startsLocal,
                    endsLocal: svc ? applyServiceDuration(startsLocal, svc.durationMin) : f.endsLocal,
                  }));
                }}
              />
            </div>
            <div>
              <Label>Окончание</Label>
              <Input
                type="datetime-local"
                required
                value={form.endsLocal}
                onChange={(e) => setForm({ ...form, endsLocal: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Филиал</Label>
            <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Врач</Label>
            <Select value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">Любой</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Кабинет</Label>
            <Select value={form.cabinetId} onChange={(e) => setForm({ ...form, cabinetId: e.target.value })}>
              <option value="">—</option>
              {branch?.cabinets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Услуга</Label>
            <Select value={form.serviceId} onChange={(e) => onServiceChange(e.target.value)}>
              <option value="">—</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} мин)</option>)}
            </Select>
          </div>
          <div>
            <Label>Заметки</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Пожелания, подготовка…" />
          </div>
          {!editId && (
            <>
              <Button type="button" variant="ghost" onClick={loadSlots}>Подобрать свободные слоты</Button>
              {slots.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] p-2 text-xs">
                  {slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      className="mb-1 block w-full rounded-lg bg-[var(--surface-muted)] px-2 py-1.5 text-left hover:bg-[var(--accent-soft)]"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          startsLocal: toLocalInput(s.startsAt),
                          endsLocal: toLocalInput(s.endsAt),
                        }))
                      }
                    >
                      {formatDate(s.startsAt)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <Button type="submit" className="w-full">{editId ? 'Сохранить' : 'Создать запись'}</Button>
        </form>
      </Modal>

      <VisitCompleteModal
        open={!!completeApptId}
        appointmentId={completeApptId}
        onClose={() => {
          setCompleteApptId(null);
          load();
        }}
        onRefresh={load}
      />

      <Modal open={waitModal} onClose={() => setWaitModal(false)} title="Лист ожидания">
        <form onSubmit={addWaitlist} className="space-y-3">
          <div>
            <Label>Пациент</Label>
            <Select required value={waitPatientId} onChange={(e) => setWaitPatientId(e.target.value)}>
              <option value="">—</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </Select>
          </div>
          <div>
            <Label>Услуга</Label>
            <Select value={waitServiceId} onChange={(e) => setWaitServiceId(e.target.value)}>
              <option value="">—</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <Button type="submit" className="w-full">Добавить</Button>
        </form>
      </Modal>
    </Protected>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<Protected><p className="text-[var(--muted)]">Загрузка расписания…</p></Protected>}>
      <SchedulePageContent />
    </Suspense>
  );
}
