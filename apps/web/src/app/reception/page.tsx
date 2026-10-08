'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Search, UserPlus } from 'lucide-react';
import { Protected } from '@/components/protected';
import { PatientAvatar } from '@/components/patient-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { VisitCompleteModal } from '@/components/visit-complete-modal';
import { api } from '@/lib/api';
import { useBranch } from '@/lib/branch-context';
import { APPOINTMENT_STATUS, label, QUEUE_STATUS } from '@/lib/format';

type DeskData = {
  appointments: {
    id: string;
    startsAt: string;
    status: string;
    patient: { id: string; firstName: string; lastName: string; phone?: string };
    doctor?: { firstName: string; lastName: string } | null;
    service?: { name: string; durationMin: number } | null;
  }[];
  queue: {
    id: string;
    position: number;
    status: string;
    appointmentId?: string | null;
    patient: { id: string; firstName: string; lastName: string };
  }[];
  waitlistCount: number;
  stats: { todayTotal: number; inClinic: number; inChair: number; waitingArrival: number };
};

const STATUS_RAIL: Record<string, string> = {
  SCHEDULED: '#8aa8ae',
  CONFIRMED: '#1d7ed8',
  WAITING: '#c47b09',
  IN_PROGRESS: '#0f9d8a',
  COMPLETED: '#128a4e',
  CANCELLED: '#d14343',
  NO_SHOW: '#d14343',
};

const QUEUE_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'warning'> = {
  WAITING: 'warning',
  CALLED: 'accent',
  IN_CHAIR: 'accent',
  DONE: 'success',
  SKIPPED: 'default',
};

export default function ReceptionDeskPage() {
  const router = useRouter();
  const { branchId } = useBranch();
  const [desk, setDesk] = useState<DeskData | null>(null);
  const [search, setSearch] = useState('');
  const [searchHits, setSearchHits] = useState<{ id: string; firstName: string; lastName: string; phone?: string }[]>([]);
  const [clock, setClock] = useState('');
  const [completeApptId, setCompleteApptId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!branchId) return;
    api<DeskData>(`/queue/reception-desk?branchId=${branchId}`).then(setDesk);
  }, [branchId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (search.length < 2) {
      setSearchHits([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: typeof searchHits }>(`/patients?search=${encodeURIComponent(search)}&pageSize=6`).then((r) =>
        setSearchHits(r.items),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const checkIn = async (patientId: string, appointmentId?: string) => {
    await api('/queue/reception/check-in', {
      method: 'POST',
      body: JSON.stringify({ patientId, branchId, appointmentId }),
    });
    load();
  };

  const setQueueStatus = async (id: string, status: string) => {
    const qItem = desk?.queue.find((q) => q.id === id);
    const apptId = qItem?.appointmentId ?? null;
    await api(`/queue/reception/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
    if (status === 'DONE' && apptId) {
      setCompleteApptId(apptId);
    }
  };

  const queuePatientIds = new Set(desk?.queue.map((q) => q.patient.id) ?? []);
  const nextId = desk?.appointments.find((appointment) => {
    const upcoming = new Date(appointment.startsAt) >= new Date();
    return upcoming && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status);
  })?.id;

  return (
    <Protected>
      <PageHeader
        badge="Рабочий стол"
        title="Сегодня"
        description={<span className="capitalize">{clock}</span>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/patients">
              <Button variant="ghost">
                <UserPlus size={16} />
                Пациент
              </Button>
            </Link>
            <Link href="/queues">
              <Button variant="ghost">Очереди дня</Button>
            </Link>
            <Link href="/schedule">
              <Button>
                <Calendar size={16} />
                Запись
              </Button>
            </Link>
          </div>
        }
      />

      {desk && (
        <div className="ds-card mb-6 flex flex-wrap gap-x-6 gap-y-2 px-5 py-4 text-sm">
          <DayStat label="Записей" value={desk.stats.todayTotal} />
          <DayStat label="Ждут прихода" value={desk.stats.waitingArrival} tone="warning" />
          <DayStat label="В клинике" value={desk.stats.inClinic} tone="accent" />
          <DayStat label="В кресле" value={desk.stats.inChair} tone="success" />
        </div>
      )}

      <div className="relative mb-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <Input
          className="h-12 rounded-xl pl-12 text-sm"
          placeholder="Найти пациента по имени или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchHits.length > 0 && <SearchDropdown hits={searchHits} onPick={(id) => { setSearch(''); router.push(`/patients/${id}`); }} />}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3 !p-0 overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">Расписание на сегодня</h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">Нажмите «Принять», чтобы поставить в очередь</p>
          </div>
          <div>
            {desk?.appointments.map((a) => (
              <AppointmentRow
                key={a.id}
                appointment={a}
                inQueue={queuePatientIds.has(a.patient.id)}
                isNext={a.id === nextId}
                onCheckIn={() => checkIn(a.patient.id, a.id)}
              />
            ))}
            {!desk?.appointments.length && (
              <p className="py-16 text-center text-sm text-[var(--muted)]">На сегодня записей нет</p>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card className="!p-0 overflow-hidden">
            <QueuePanel queue={desk?.queue ?? []} onStatus={setQueueStatus} />
          </Card>
          {desk && desk.waitlistCount > 0 && (
            <Link
              href="/schedule"
              className="ds-card-hover block p-4 text-center text-sm font-medium text-[var(--accent)]"
            >
              Лист ожидания: {desk.waitlistCount} пациент(ов) →
            </Link>
          )}
        </div>
      </div>

      <VisitCompleteModal
        open={!!completeApptId}
        appointmentId={completeApptId}
        onClose={() => {
          setCompleteApptId(null);
          load();
        }}
        onRefresh={load}
      />
    </Protected>
  );
}

function DayStat({ label: name, value, tone }: { label: string; value: number; tone?: 'warning' | 'accent' | 'success' }) {
  const color = tone === 'warning' ? 'var(--warning)' : tone === 'success' ? 'var(--success)' : tone === 'accent' ? 'var(--accent)' : 'var(--text)';
  return (
    <p className="text-[var(--muted)]">
      {name}{' '}
      <span className="ds-display text-xl" style={{ color }}>{value}</span>
    </p>
  );
}

function SearchDropdown({
  hits,
  onPick,
}: {
  hits: { id: string; firstName: string; lastName: string; phone?: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="ds-card absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden">
      {hits.map((p) => (
        <button
          key={p.id}
          type="button"
          className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface-muted)]"
          onClick={() => onPick(p.id)}
        >
          <PatientAvatar firstName={p.firstName} lastName={p.lastName} size="sm" />
          <span className="font-medium">
            {p.lastName} {p.firstName}
          </span>
          {p.phone && <span className="ml-auto text-sm text-[var(--muted)]">{p.phone}</span>}
        </button>
      ))}
    </div>
  );
}

function AppointmentRow({
  appointment: a,
  inQueue,
  isNext,
  onCheckIn,
}: {
  appointment: DeskData['appointments'][0];
  inQueue: boolean;
  isNext: boolean;
  onCheckIn: () => void;
}) {
  const late = new Date(a.startsAt) < new Date() && !inQueue && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status);

  return (
    <div className="ds-table-row flex flex-wrap items-center gap-3 px-5 py-3 last:border-b-0">
      <div className="w-14 shrink-0 text-center">
        <p className="text-sm font-semibold text-[var(--text)]">
          {new Date(a.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </p>
        {isNext && <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Далее</p>}
      </div>
      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: late ? '#c47b09' : STATUS_RAIL[a.status] ?? '#8aa8ae' }} aria-hidden />
      <PatientAvatar firstName={a.patient.firstName} lastName={a.patient.lastName} size="sm" />
      <div className="min-w-0 flex-1">
        {a.patient.id ? (
          <Link href={`/patients/${a.patient.id}`} className="font-semibold hover:text-[var(--accent)]">
            {a.patient.lastName} {a.patient.firstName}
          </Link>
        ) : (
          <p className="font-semibold">{a.patient.lastName} {a.patient.firstName}</p>
        )}
        <p className="truncate text-sm text-[var(--muted)]">
          {a.service?.name ?? 'Приём'}
          {a.doctor ? ` · ${a.doctor.lastName}` : ''}
          {a.patient.phone ? ` · ${a.patient.phone}` : ''}
        </p>
      </div>
      <span className="text-xs font-medium" style={{ color: STATUS_RAIL[a.status] ?? 'var(--muted)' }}>
        {late ? 'Опаздывает' : label(APPOINTMENT_STATUS, a.status)}
      </span>
      <Link href={`/visit/${a.id}`}>
        <Button size="sm" variant="ghost">Приём</Button>
      </Link>
      {!inQueue && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? (
        <Button size="sm" onClick={onCheckIn}>Принять</Button>
      ) : inQueue ? (
        <span className="text-xs font-semibold text-[var(--accent)]">В очереди</span>
      ) : null}
    </div>
  );
}

function QueuePanel({
  queue,
  onStatus,
}: {
  queue: DeskData['queue'];
  onStatus: (id: string, status: string) => void;
}) {
  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">Очередь сейчас</h2>
        <p className="mt-0.5 text-sm text-[var(--muted)]">{queue.length} в зале ожидания</p>
      </div>
      <div className="space-y-2 p-4">
        {queue.map((q) => (
          <QueueRow key={q.id} item={q} onStatus={onStatus} />
        ))}
        {!queue.length && <p className="py-8 text-center text-sm text-[var(--muted)]">Очередь пуста</p>}
      </div>
    </>
  );
}

function QueueRow({
  item: q,
  onStatus,
}: {
  item: DeskData['queue'][0];
  onStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="ds-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-hover)]">
            {q.position}
          </span>
          {q.patient.id ? (
            <Link href={`/patients/${q.patient.id}`} className="font-semibold hover:text-[var(--accent)]">
              {q.patient.lastName} {q.patient.firstName}
            </Link>
          ) : (
            <p className="font-semibold">{q.patient.lastName} {q.patient.firstName}</p>
          )}
        </div>
        <Badge variant={QUEUE_VARIANT[q.status] ?? 'default'}>{label(QUEUE_STATUS, q.status)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        <Button size="sm" variant={q.status === 'WAITING' ? 'primary' : 'ghost'} onClick={() => onStatus(q.id, 'CALLED')}>Вызвать</Button>
        <Button size="sm" variant={q.status === 'CALLED' ? 'primary' : 'ghost'} onClick={() => onStatus(q.id, 'IN_CHAIR')}>В кресло</Button>
        <Button size="sm" variant={q.status === 'IN_CHAIR' ? 'primary' : 'ghost'} onClick={() => onStatus(q.id, 'DONE')}>Завершить</Button>
      </div>
    </div>
  );
}
