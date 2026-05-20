'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  Phone,
  Search,
  UserPlus,
  Users,
  Armchair,
  Sparkles,
} from 'lucide-react';
import { Protected } from '@/components/protected';
import { PatientAvatar } from '@/components/patient-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  SCHEDULED: 'default',
  CONFIRMED: 'accent',
  WAITING: 'warning',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
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

  return (
    <Protected>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
            <Sparkles size={14} />
            Рабочий стол
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--text)]">Ресепшн сегодня</h1>
          <p className="mt-1 capitalize text-[var(--muted)]">{clock}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/patients">
            <Button variant="ghost">
              <UserPlus size={16} />
              Пациент
            </Button>
          </Link>
          <Link href="/schedule">
            <Button>
              <Calendar size={16} />
              Запись
            </Button>
          </Link>
        </div>
      </div>

      {desk && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Записей сегодня', value: desk.stats.todayTotal, icon: Calendar, tone: 'from-[var(--blue-soft)] to-white' },
            { label: 'Ждут прихода', value: desk.stats.waitingArrival, icon: Clock, tone: 'from-[var(--warning-soft)] to-white' },
            { label: 'В клинике', value: desk.stats.inClinic, icon: Users, tone: 'from-[var(--accent-soft)] to-white' },
            { label: 'В кресле', value: desk.stats.inChair, icon: Armchair, tone: 'from-[var(--success-soft)] to-white' },
          ].map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
        </div>
      )}

      <div className="relative mb-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
        <Input
          className="h-14 rounded-2xl border-2 pl-12 text-base shadow-[var(--shadow-card)] focus:border-[var(--accent)]"
          placeholder="Найти пациента по имени или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchHits.length > 0 && <SearchDropdown hits={searchHits} onPick={(id) => { setSearch(''); router.push(`/patients/${id}`); }} />}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3 !p-0 overflow-hidden">
          <div className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 px-5 py-4">
            <h2 className="font-semibold text-[var(--text)]">Расписание на сегодня</h2>
            <p className="text-sm text-[var(--muted)]">Нажмите «Принять», чтобы поставить в очередь</p>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-3">
            {desk?.appointments.map((a) => (
              <AppointmentRow
                key={a.id}
                appointment={a}
                inQueue={queuePatientIds.has(a.patient.id)}
                onCheckIn={() => checkIn(a.patient.id, a.id)}
              />
            ))}
            {!desk?.appointments.length && (
              <p className="py-16 text-center text-[var(--muted)]">На сегодня записей нет</p>
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
              className="ds-card block p-4 text-center text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
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

function StatCard({ stat: s }: { stat: { label: string; value: number; icon: typeof Calendar; tone: string } }) {
  const Icon = s.icon;
  return (
    <div className={`ds-card flex items-center gap-4 bg-gradient-to-br ${s.tone} p-5`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface)] shadow-sm">
        <Icon size={22} className="text-[var(--accent)]" />
      </div>
      <div>
        <p className="text-3xl font-bold text-[var(--text)]">{s.value}</p>
        <p className="text-sm text-[var(--muted)]">{s.label}</p>
      </div>
    </div>
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
    <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
      {hits.map((p) => (
        <button
          key={p.id}
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--accent-soft)]"
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
  onCheckIn,
}: {
  appointment: DeskData['appointments'][0];
  inQueue: boolean;
  onCheckIn: () => void;
}) {
  const isPast = new Date(a.startsAt) < new Date() && !inQueue && a.status !== 'COMPLETED';

  return (
    <div
      className={`mb-2 flex flex-wrap items-center gap-3 rounded-2xl border p-4 transition ${
        inQueue
          ? 'border-[var(--accent)]/30 bg-[var(--accent-soft)]/40'
          : isPast
            ? 'border-[var(--warning)]/40 bg-[var(--warning-soft)]/30'
            : 'border-[var(--border)] bg-[var(--surface)] hover:shadow-md'
      }`}
    >
      <div className="flex min-w-[52px] flex-col items-center rounded-xl bg-[var(--surface-muted)] px-2 py-1.5 text-center">
        <span className="text-lg font-bold text-[var(--text)]">
          {new Date(a.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <PatientAvatar firstName={a.patient.firstName} lastName={a.patient.lastName} size="sm" />
      <div className="min-w-0 flex-1">
        <Link href={`/patients/${a.patient.id}`} className="font-semibold hover:text-[var(--accent)]">
          {a.patient.lastName} {a.patient.firstName}
        </Link>
        <p className="text-sm text-[var(--muted)]">
          {a.service?.name ?? 'Приём'}
          {a.doctor ? ` · ${a.doctor.lastName}` : ''}
        </p>
        {a.patient.phone && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]">
            <Phone size={12} />
            {a.patient.phone}
          </p>
        )}
      </div>
      <Badge variant={STATUS_VARIANT[a.status] ?? 'default'}>{label(APPOINTMENT_STATUS, a.status)}</Badge>
      {!inQueue && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? (
        <Button size="sm" onClick={onCheckIn}>
          Принять
        </Button>
      ) : inQueue ? (
        <span className="text-xs font-medium text-[var(--accent)]">В очереди</span>
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
      <div className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-soft)] to-[var(--surface)] px-5 py-4">
        <h2 className="font-semibold text-[var(--text)]">Очередь сейчас</h2>
        <p className="text-sm text-[var(--muted)]">{queue.length} в зале ожидания</p>
      </div>
      <div className="space-y-2 p-3">
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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
            {q.position}
          </span>
          <Link href={`/patients/${q.patient.id}`} className="font-semibold hover:text-[var(--accent)]">
            {q.patient.lastName} {q.patient.firstName}
          </Link>
        </div>
        <Badge variant={QUEUE_VARIANT[q.status] ?? 'default'}>{label(QUEUE_STATUS, q.status)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {(['CALLED', 'IN_CHAIR', 'DONE'] as const).map((st) => (
          <Button
            key={st}
            size="sm"
            variant="ghost"
            className="!px-2 !py-1 text-xs"
            onClick={() => onStatus(q.id, st)}
          >
            {label(QUEUE_STATUS, st)}
          </Button>
        ))}
      </div>
    </div>
  );
}
