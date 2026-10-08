'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { api } from '@/lib/api';

const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const SLOT = 15;
const PX = 1.15;

const PALETTE = [
  { bg: '#e3f1ff', fg: '#1d4e89', bar: '#1d7ed8' },
  { bg: '#d7f5ef', fg: '#0b7d6e', bar: '#0f9d8a' },
  { bg: '#fff1d6', fg: '#8a5a06', bar: '#c47b09' },
  { bg: '#e7f6d8', fg: '#3f6212', bar: '#65a30d' },
  { bg: '#e6f4f1', fg: '#115e59', bar: '#0f766e' },
  { bg: '#e0f2fe', fg: '#075985', bar: '#0284c7' },
];

type Person = { id: string; firstName: string; lastName: string; phone?: string | null };
type Svc = { id: string; name: string; durationMin?: number };
type Visit = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: Person;
  doctor?: { id: string; firstName: string; lastName: string } | null;
  service?: Svc | null;
  cabinet?: { id: string; name: string } | null;
};
type Block = { id: string; cabinetId: string; startsAt: string; endsAt: string; reason: string };
type ToMake = {
  id: string;
  source: string;
  dueAfter?: string | null;
  notes?: string | null;
  virtual?: boolean;
  patient: Person;
  service?: Svc | null;
};

const SOURCE: Record<string, string> = {
  RECEPTION: 'Ресепшн',
  PATIENT: 'Пациент',
  SYSTEM: 'Система',
};

function tone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[hash];
}

function minutes(iso: string) {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

function sameDay(iso: string, day: Date) {
  const date = new Date(iso);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function dateInput(day: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function localStamp(day: Date, total: number) {
  const next = new Date(day);
  next.setHours(Math.floor(total / 60), total % 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

export function ChairDay({
  branchId,
  day,
  onDayChange,
  patients,
  services,
  revision,
  onBook,
  onEdit,
}: {
  branchId: string;
  day: Date;
  onDayChange: (day: Date) => void;
  patients: { id: string; firstName: string; lastName: string }[];
  services: Svc[];
  revision: number;
  onBook: (prefill: {
    cabinetId?: string;
    patientId?: string;
    serviceId?: string;
    startsLocal: string;
    endsLocal: string;
    toMakeId?: string;
  }) => void;
  onEdit: (visit: Visit) => void;
}) {
  const [cabinets, setCabinets] = useState<{ id: string; name: string }[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [queue, setQueue] = useState<ToMake[]>([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [source, setSource] = useState('RECEPTION');
  const [dueAfter, setDueAfter] = useState('');
  const [blockCabinet, setBlockCabinet] = useState('');
  const [blockStart, setBlockStart] = useState('13:00');
  const [blockEnd, setBlockEnd] = useState('14:00');
  const [blockReason, setBlockReason] = useState('Обед');
  const [ready, setReady] = useState(false);
  const [drag, setDrag] = useState<{
    id: string;
    name: string;
    duration: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    moved: boolean;
    cabinetId: string;
    startMin: number;
    originCabinet: string;
    originMin: number;
  } | null>(null);
  const dragRef = useRef(drag);

  const load = useCallback(() => {
    if (!branchId) return;
    api<{ cabinets: { id: string; name: string }[]; appointments: Visit[]; blocks: Block[] }>(
      `/appointments/day?branchId=${branchId}&date=${dateInput(day)}`,
    )
      .then((board) => {
        setError('');
        setCabinets(board.cabinets);
        setVisits(board.appointments);
        setBlocks(board.blocks);
        setBlockCabinet((current) => current || board.cabinets[0]?.id || '');
      })
      .catch((e: Error) => setError(e.message));
    api<{ items: ToMake[] }>(`/appointments/to-make?branchId=${branchId}`)
      .then((res) => setQueue(res.items))
      .catch(() => setQueue([]));
  }, [branchId, day]);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    load();
  }, [load, revision]);

  const columns = [
    ...cabinets.map((cabinet) => ({ id: cabinet.id, name: cabinet.name })),
    ...(visits.some((visit) => !visit.cabinet) ? [{ id: 'none', name: 'Без кресла' }] : []),
  ];
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);
  const height = (DAY_END - DAY_START) * PX;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = ready && sameDay(now.toISOString(), day) && nowMin >= DAY_START && nowMin <= DAY_END;

  const bookSlot = (cabinetId: string, startMin: number) => {
    onBook({
      cabinetId: cabinetId === 'none' ? undefined : cabinetId,
      startsLocal: localStamp(day, startMin),
      endsLocal: localStamp(day, startMin + 30),
    });
  };

  const addToMake = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await api('/appointments/to-make', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          patientId,
          source,
          serviceId: serviceId || undefined,
          dueAfter: dueAfter ? new Date(`${dueAfter}T00:00:00`).toISOString() : undefined,
        }),
      });
      setAdding(false);
      setPatientId('');
      setServiceId('');
      setDueAfter('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не сохранилось');
    }
  };

  const addBlock = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const start = new Date(day);
    const [sh, sm] = blockStart.split(':').map(Number);
    const [eh, em] = blockEnd.split(':').map(Number);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(day);
    end.setHours(eh, em, 0, 0);
    try {
      await api('/appointments/blocks', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          cabinetId: blockCabinet,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          reason: blockReason,
        }),
      });
      setBlocking(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не закрылось');
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => { const next = new Date(day); next.setDate(next.getDate() - 1); onDayChange(next); }}>←</Button>
          <Input
            type="date"
            className="max-w-[180px]"
            value={dateInput(day)}
            onChange={(e) => {
              const next = new Date(`${e.target.value}T00:00:00`);
              onDayChange(next);
            }}
          />
          <Button variant="ghost" onClick={() => { const next = new Date(day); next.setDate(next.getDate() + 1); onDayChange(next); }}>→</Button>
          <Button variant="ghost" onClick={() => { const next = new Date(); next.setHours(0, 0, 0, 0); onDayChange(next); }}>Сегодня</Button>
          <Button variant="ghost" onClick={() => setBlocking((v) => !v)}>Закрыть слот</Button>
          <span className="text-sm text-[var(--muted)]">{visits.length} записей</span>
          <span className="text-xs text-[var(--muted)]">Потяните запись на другое время или кресло</span>
        </div>
        {error && <p className="mb-3 rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
        {blocking && (
          <form onSubmit={addBlock} className="ds-card mb-3 grid gap-2 p-4 sm:grid-cols-[1fr_110px_110px_1fr_auto] sm:items-end">
            <div>
              <Label>Кресло</Label>
              <Select aria-label="Кресло для блока" value={blockCabinet} onChange={(e) => setBlockCabinet(e.target.value)}>
                {cabinets.map((cabinet) => <option key={cabinet.id} value={cabinet.id}>{cabinet.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>С</Label>
              <Input type="time" aria-label="Начало блока" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
            </div>
            <div>
              <Label>До</Label>
              <Input type="time" aria-label="Конец блока" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
            </div>
            <div>
              <Label>Причина</Label>
              <Input aria-label="Причина блока" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
            </div>
            <Button type="submit">Закрыть</Button>
          </form>
        )}
        {!columns.length ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] py-16 text-center text-sm text-[var(--muted)]">В филиале нет кресел</p>
        ) : (
          <div className="ds-card overflow-auto">
            <div className="flex min-w-max">
              <div className="sticky left-0 z-20 w-14 shrink-0 bg-[var(--surface-muted)]">
                <div className="h-10 border-b border-[var(--border)]" />
                <div className="relative" style={{ height }}>
                  {hours.map((hour) => (
                    <span key={hour} className="absolute left-1 text-[10px] text-[var(--muted)]" style={{ top: (hour * 60 - DAY_START) * PX - 6 }}>
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>
              </div>
              {columns.map((column) => (
                <div key={column.id} className="w-44 shrink-0 border-l border-[var(--border)]">
                  <div className="sticky top-0 z-10 flex h-10 items-center border-b border-[var(--border)] bg-[var(--surface-muted)] px-2 text-xs font-semibold">
                    {column.name}
                  </div>
                  <div className="relative" style={{ height }}>
                    {hours.map((hour) => (
                      <div key={hour} className="absolute inset-x-0 border-t border-[var(--border)]/70" style={{ top: (hour * 60 - DAY_START) * PX }} />
                    ))}
                    {Array.from({ length: (DAY_END - DAY_START) / SLOT }, (_, index) => {
                      const startMin = DAY_START + index * SLOT;
                      return (
                        <button
                          key={startMin}
                          type="button"
                          aria-label={`Запись в ${column.name} на ${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`}
                          data-slot=""
                          data-cabinet={column.id}
                          data-min={startMin}
                          className={
                            drag?.moved && drag.cabinetId === column.id && drag.startMin === startMin
                              ? 'absolute inset-x-0 bg-[var(--accent-soft)]'
                              : 'absolute inset-x-0 hover:bg-[var(--accent-soft)]/50'
                          }
                          style={{ top: index * SLOT * PX, height: SLOT * PX }}
                          onClick={() => bookSlot(column.id, startMin)}
                        />
                      );
                    })}
                    {blocks
                      .filter((block) => block.cabinetId === column.id)
                      .map((block) => {
                        const top = (minutes(block.startsAt) - DAY_START) * PX;
                        const h = Math.max((minutes(block.endsAt) - minutes(block.startsAt)) * PX - 2, 18);
                        return (
                          <button
                            key={block.id}
                            type="button"
                            className="absolute inset-x-1 z-10 overflow-hidden rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-1.5 py-1 text-left text-[11px] text-[var(--muted)]"
                            style={{ top, height: h }}
                            onClick={() => {
                              void api(`/appointments/blocks/${block.id}`, { method: 'DELETE' }).then(load);
                            }}
                          >
                            {block.reason}
                          </button>
                        );
                      })}
                    {visits
                      .filter((visit) => (visit.cabinet?.id ?? 'none') === column.id)
                      .map((visit) => {
                        const top = (minutes(visit.startsAt) - DAY_START) * PX;
                        const h = Math.max((minutes(visit.endsAt) - minutes(visit.startsAt)) * PX - 2, 22);
                        const color = tone(visit.service?.name ?? 'Приём');
                        const cancelled = visit.status === 'CANCELLED' || visit.status === 'NO_SHOW';
                        const dragging = drag?.id === visit.id && drag.moved;
                        return (
                          <button
                            key={visit.id}
                            type="button"
                            className="absolute inset-x-1 z-10 cursor-grab overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight active:cursor-grabbing"
                            style={{
                              top,
                              height: h,
                              background: cancelled ? '#f4f4f5' : color.bg,
                              color: cancelled ? '#71717a' : color.fg,
                              borderColor: cancelled ? '#e4e4e7' : color.bar,
                              textDecoration: cancelled ? 'line-through' : undefined,
                              opacity: dragging ? 0.35 : 1,
                              pointerEvents: dragging ? 'none' : undefined,
                            }}
                            onPointerDown={(event) => {
                              if (cancelled || event.button !== 0) return;
                              event.currentTarget.setPointerCapture(event.pointerId);
                              const next = {
                                id: visit.id,
                                name: visit.patient.lastName,
                                duration: Math.max(minutes(visit.endsAt) - minutes(visit.startsAt), SLOT),
                                x: event.clientX,
                                y: event.clientY,
                                originX: event.clientX,
                                originY: event.clientY,
                                moved: false,
                                cabinetId: visit.cabinet?.id ?? 'none',
                                startMin: minutes(visit.startsAt),
                                originCabinet: visit.cabinet?.id ?? 'none',
                                originMin: minutes(visit.startsAt),
                              };
                              dragRef.current = next;
                              setDrag(next);
                            }}
                            onPointerMove={(event) => {
                              const current = dragRef.current;
                              if (!current || current.id !== visit.id) return;
                              const moved = current.moved || Math.hypot(event.clientX - current.originX, event.clientY - current.originY) > 6;
                              if (moved) event.currentTarget.style.pointerEvents = 'none';
                              const hit = document.elementFromPoint(event.clientX, event.clientY);
                              const slot = hit?.closest<HTMLElement>('[data-slot]');
                              const cabinetId = slot?.dataset.cabinet ?? current.cabinetId;
                              const startMin = slot?.dataset.min ? Number(slot.dataset.min) : current.startMin;
                              const next = {
                                ...current,
                                x: event.clientX,
                                y: event.clientY,
                                moved,
                                cabinetId,
                                startMin: Math.min(startMin, DAY_END - current.duration),
                              };
                              dragRef.current = next;
                              setDrag(next);
                            }}
                            onPointerUp={(event) => {
                              const current = dragRef.current;
                              dragRef.current = null;
                              setDrag(null);
                              event.currentTarget.style.pointerEvents = '';
                              if (!current || current.id !== visit.id) return;
                              const travel = Math.hypot(event.clientX - current.originX, event.clientY - current.originY);
                              if (travel <= 6 && !current.moved) {
                                onEdit(visit);
                                return;
                              }
                              event.currentTarget.style.pointerEvents = 'none';
                              const hit = document.elementFromPoint(event.clientX, event.clientY);
                              event.currentTarget.style.pointerEvents = '';
                              const slot = hit?.closest<HTMLElement>('[data-slot]');
                              const cabinetId = slot?.dataset.cabinet ?? current.cabinetId;
                              const startMin = slot?.dataset.min
                                ? Math.min(Number(slot.dataset.min), DAY_END - current.duration)
                                : current.startMin;
                              if (cabinetId === 'none') return;
                              if (cabinetId === current.originCabinet && startMin === current.originMin) return;
                              const start = new Date(day);
                              start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
                              const end = new Date(start.getTime() + current.duration * 60_000);
                              void api(`/appointments/${visit.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({
                                  startsAt: start.toISOString(),
                                  endsAt: end.toISOString(),
                                  cabinetId: current.cabinetId,
                                }),
                              })
                                .then(() => load())
                                .catch((e: Error) => setError(e.message));
                            }}
                          >
                            <span className="font-semibold">{visit.patient.lastName}</span>
                            <span className="block truncate">{visit.service?.name ?? 'Приём'}{visit.doctor ? ` · ${visit.doctor.lastName}` : ''}</span>
                          </button>
                        );
                      })}
                    {showNow && (
                      <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-[var(--danger)]" style={{ top: (nowMin - DAY_START) * PX }} />
                    )}
                    {drag?.moved && drag.cabinetId === column.id && (
                      <div
                        className="pointer-events-none absolute inset-x-1 z-[15] rounded-md border-2 border-[var(--accent)] bg-[var(--accent-soft)]/80"
                        style={{
                          top: (drag.startMin - DAY_START) * PX,
                          height: Math.max(drag.duration * PX - 2, 22),
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {drag?.moved && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-[var(--sidebar)] px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {drag.name} · {String(Math.floor(drag.startMin / 60)).padStart(2, '0')}:{String(drag.startMin % 60).padStart(2, '0')}
        </div>
      )}

      <aside className="ds-card w-full shrink-0 xl:w-80">
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">Надо записать</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">Гигиена и те, кого попросили поставить в расписание. Уже записанные на будущее сюда не попадают.</p>
        </div>
        <div className="space-y-2 p-3">
          <Button variant="ghost" className="w-full" onClick={() => setAdding((v) => !v)}>Добавить</Button>
          {adding && (
            <form onSubmit={addToMake} className="space-y-2 rounded-xl bg-[var(--surface-muted)] p-3">
              <Select aria-label="Пациент" value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
                <option value="">Пациент</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patient.lastName} {patient.firstName}</option>
                ))}
              </Select>
              <Select aria-label="Услуга" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Услуга</option>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </Select>
              <Select aria-label="Откуда задача" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="RECEPTION">Ресепшн</option>
                <option value="PATIENT">Пациент</option>
                <option value="SYSTEM">Система</option>
              </Select>
              <Input type="date" aria-label="Не раньше" value={dueAfter} onChange={(e) => setDueAfter(e.target.value)} />
              <Button type="submit" className="w-full" disabled={!patientId}>В список</Button>
            </form>
          )}
          {queue.map((row) => (
            <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{row.patient.lastName} {row.patient.firstName}</p>
                {!row.virtual && (
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)]"
                    onClick={() => {
                      void api(`/appointments/to-make/${row.id}`, { method: 'DELETE' }).then(load);
                    }}
                  >
                    Убрать
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {SOURCE[row.source] ?? row.source}
                {row.service ? ` · ${row.service.name}` : ''}
                {row.dueAfter ? ` · не раньше ${new Date(row.dueAfter).toLocaleDateString('ru-RU')}` : ''}
              </p>
              {row.notes && <p className="mt-1 text-xs text-[var(--text-secondary)]">{row.notes}</p>}
              <Button
                size="sm"
                className="mt-2"
                onClick={() =>
                  onBook({
                    patientId: row.patient.id,
                    serviceId: row.service?.id,
                    toMakeId: row.id,
                    startsLocal: localStamp(day, 9 * 60),
                    endsLocal: localStamp(day, 9 * 60 + (row.service?.durationMin ?? 30)),
                  })
                }
              >
                Записать
              </Button>
            </div>
          ))}
          {!queue.length && <p className="py-6 text-center text-xs text-[var(--muted)]">Список пуст</p>}
        </div>
      </aside>
    </div>
  );
}
