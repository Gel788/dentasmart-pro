'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { GripVertical } from 'lucide-react';
import { PatientAvatar } from '@/components/patient-avatar';
import { Badge } from '@/components/ui/badge';
import type { CalAppointment } from '@/components/schedule-calendar';
import { APPOINTMENT_STATUS, label } from '@/lib/format';

export type KanbanMode = 'status' | 'doctor';

const STATUS_COLUMNS = ['SCHEDULED', 'CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED'] as const;
const ARCHIVE_COLUMNS = ['CANCELLED', 'NO_SHOW'] as const;

const STATUS_VARIANT: Record<string, 'default' | 'accent' | 'success' | 'danger' | 'warning'> = {
  SCHEDULED: 'default',
  CONFIRMED: 'accent',
  WAITING: 'warning',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
};

const UNASSIGNED = '__unassigned__';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function KanbanCard({
  appointment: a,
  onClick,
  dragging,
}: {
  appointment: CalAppointment;
  onClick?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/appointment-id', a.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      className={clsx(
        'group cursor-grab rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm transition active:cursor-grabbing',
        dragging ? 'opacity-40 ring-2 ring-[var(--accent)]' : 'hover:border-[var(--accent)]/40 hover:shadow-md',
      )}
    >
      <div className="flex gap-2">
        <GripVertical size={14} className="mt-0.5 shrink-0 text-[var(--muted)] opacity-0 group-hover:opacity-100" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <PatientAvatar firstName={a.patient.firstName} lastName={a.patient.lastName} size="sm" />
            <div className="min-w-0">
              <Link
                href={`/patients/${a.patient.id}`}
                onClick={(e) => e.stopPropagation()}
                className="block truncate font-semibold text-[var(--text)] hover:text-[var(--accent)]"
              >
                {a.patient.lastName} {a.patient.firstName}
              </Link>
              <p className="text-xs font-medium text-[var(--accent)]">
                {formatTime(a.startsAt)} – {formatTime(a.endsAt)}
              </p>
            </div>
          </div>
          {a.service?.name && <p className="mt-1.5 truncate text-xs text-[var(--muted)]">{a.service.name}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {a.doctor ? (
              <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                {a.doctor.lastName}
              </span>
            ) : (
              <span className="rounded-md bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--warning)]">
                Без врача
              </span>
            )}
            <Badge variant={STATUS_VARIANT[a.status] ?? 'default'}>
              <span className="text-[10px]">{label(APPOINTMENT_STATUS, a.status)}</span>
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  id,
  title,
  subtitle,
  count,
  tone,
  children,
  onDrop,
  isDragOver,
  onColumnDragEnter,
}: {
  id: string;
  title: string;
  subtitle?: string;
  count: number;
  tone?: string;
  children: React.ReactNode;
  onDrop: (appointmentId: string) => void;
  isDragOver: boolean;
  onColumnDragEnter?: (id: string) => void;
}) {
  return (
    <div
      className={clsx(
        'flex min-h-[420px] w-[280px] shrink-0 flex-col rounded-2xl border transition',
        isDragOver
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/50 shadow-inner'
          : 'border-[var(--border)] bg-[var(--surface-muted)]/40',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => onColumnDragEnter?.(id)}
      onDrop={(e) => {
        e.preventDefault();
        const appointmentId = e.dataTransfer.getData('application/appointment-id');
        if (appointmentId) onDrop(appointmentId);
      }}
      data-column-id={id}
    >
      <div
        className={clsx(
          'border-b border-[var(--border)] px-4 py-3',
          tone ?? 'bg-[var(--surface)]',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-[var(--text)]">{title}</h3>
          <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--surface-muted)] px-2 text-xs font-bold text-[var(--muted)]">
            {count}
          </span>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

export function ScheduleKanban({
  appointments,
  doctors,
  mode,
  onModeChange,
  onStatusChange,
  onDoctorChange,
  onCardClick,
}: {
  appointments: CalAppointment[];
  doctors: { id: string; firstName: string; lastName: string }[];
  mode: KanbanMode;
  onModeChange: (mode: KanbanMode) => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDoctorChange: (id: string, doctorId: string | null) => Promise<void>;
  onCardClick?: (a: CalAppointment) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const byStatus = useMemo(() => {
    const map: Record<string, CalAppointment[]> = {};
    for (const st of [...STATUS_COLUMNS, ...ARCHIVE_COLUMNS]) map[st] = [];
    for (const a of appointments) {
      if (map[a.status]) map[a.status].push(a);
      else map.SCHEDULED.push(a);
    }
    for (const st of Object.keys(map)) {
      map[st].sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
    }
    return map;
  }, [appointments]);

  const byDoctor = useMemo(() => {
    const map: Record<string, CalAppointment[]> = { [UNASSIGNED]: [] };
    for (const d of doctors) map[d.id] = [];
    for (const a of appointments) {
      const key = a.doctor?.id ?? UNASSIGNED;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    for (const list of Object.values(map)) {
      list.sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
    }
    return map;
  }, [appointments, doctors]);

  const columnTones: Record<string, string> = {
    SCHEDULED: 'bg-gradient-to-br from-[var(--surface)] to-[var(--blue-soft)]/30',
    CONFIRMED: 'bg-gradient-to-br from-[var(--surface)] to-[var(--accent-soft)]/40',
    WAITING: 'bg-gradient-to-br from-[var(--surface)] to-[var(--warning-soft)]/50',
    IN_PROGRESS: 'bg-gradient-to-br from-[var(--accent-soft)]/60 to-[var(--surface)]',
    COMPLETED: 'bg-gradient-to-br from-[var(--surface)] to-[var(--success-soft)]/50',
    CANCELLED: 'bg-[var(--surface-muted)]',
    NO_SHOW: 'bg-[var(--surface-muted)]',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Канбан:</span>
        <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          {(
            [
              { id: 'status' as KanbanMode, label: 'По статусу' },
              { id: 'doctor' as KanbanMode, label: 'По врачу' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onModeChange(m.id)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                mode === m.id
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--muted)]">Перетащите карточку в другую колонку</p>
      </div>

      <div
        className="flex gap-4 overflow-x-auto pb-4"
        onDragEnd={() => {
          setDraggingId(null);
          setDragOverCol(null);
        }}
      >
        {mode === 'status' &&
          [...STATUS_COLUMNS, ...ARCHIVE_COLUMNS].map((st) => (
            <KanbanColumn
              key={st}
              id={st}
              title={label(APPOINTMENT_STATUS, st)}
              count={byStatus[st]?.length ?? 0}
              tone={columnTones[st]}
              isDragOver={dragOverCol === st}
              onColumnDragEnter={setDragOverCol}
              onDrop={async (appointmentId) => {
                setDragOverCol(null);
                if (appointments.find((a) => a.id === appointmentId)?.status !== st) {
                  await onStatusChange(appointmentId, st);
                }
              }}
            >
              {(byStatus[st] ?? []).map((a) => (
                <div
                  key={a.id}
                  onDragEnter={() => {
                    setDraggingId(a.id);
                    setDragOverCol(st);
                  }}
                >
                  <KanbanCard
                    appointment={a}
                    dragging={draggingId === a.id}
                    onClick={() => onCardClick?.(a)}
                  />
                </div>
              ))}
            </KanbanColumn>
          ))}

        {mode === 'doctor' && (
          <>
            <KanbanColumn
              id={UNASSIGNED}
              title="Без врача"
              subtitle="Назначьте перетаскиванием"
              count={byDoctor[UNASSIGNED]?.length ?? 0}
              tone="bg-[var(--warning-soft)]/30"
              isDragOver={dragOverCol === UNASSIGNED}
              onColumnDragEnter={setDragOverCol}
              onDrop={async (appointmentId) => {
                setDragOverCol(null);
                const cur = appointments.find((a) => a.id === appointmentId);
                if (cur?.doctor?.id) await onDoctorChange(appointmentId, null);
              }}
            >
              {(byDoctor[UNASSIGNED] ?? []).map((a) => (
                <KanbanCard key={a.id} appointment={a} dragging={draggingId === a.id} onClick={() => onCardClick?.(a)} />
              ))}
            </KanbanColumn>
            {doctors.map((d) => (
              <KanbanColumn
                key={d.id}
                id={d.id}
                title={`${d.lastName} ${d.firstName}`}
                subtitle="Переназначение врача"
                count={byDoctor[d.id]?.length ?? 0}
                tone="bg-gradient-to-br from-[var(--surface)] to-[var(--accent-soft)]/30"
                isDragOver={dragOverCol === d.id}
                onColumnDragEnter={setDragOverCol}
                onDrop={async (appointmentId) => {
                  setDragOverCol(null);
                  const cur = appointments.find((a) => a.id === appointmentId);
                  if (cur?.doctor?.id !== d.id) await onDoctorChange(appointmentId, d.id);
                }}
              >
                {(byDoctor[d.id] ?? []).map((a) => (
                  <KanbanCard key={a.id} appointment={a} dragging={draggingId === a.id} onClick={() => onCardClick?.(a)} />
                ))}
              </KanbanColumn>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
