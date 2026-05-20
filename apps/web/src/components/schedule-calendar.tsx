'use client';

import clsx from 'clsx';
import { APPOINTMENT_STATUS } from '@/lib/format';

export interface CalAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { id: string; firstName: string; lastName: string };
  doctor?: { id: string; firstName: string; lastName: string } | null;
  service?: { id: string; name: string; durationMin?: number } | null;
  cabinet?: { id: string; name: string } | null;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

export function ScheduleCalendar({
  weekStart,
  appointments,
  onSlotClick,
  onAppointmentClick,
}: {
  weekStart: Date;
  appointments: CalAppointment[];
  onSlotClick?: (day: Date, hour: number) => void;
  onAppointmentClick?: (a: CalAppointment) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const byDayHour = (day: Date, hour: number) => {
    return appointments.filter((a) => {
      const s = new Date(a.startsAt);
      return (
        s.getFullYear() === day.getFullYear() &&
        s.getMonth() === day.getMonth() &&
        s.getDate() === day.getDate() &&
        s.getHours() === hour
      );
    });
  };

  return (
    <div className="ds-card overflow-hidden">
      <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="grid grid-cols-8 border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-medium text-[var(--muted)]">
          <div className="p-2" />
          {days.map((d) => (
            <div key={d.toISOString()} className="p-2 text-center">
              {d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          ))}
        </div>
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-8 border-b border-[var(--border)]/50">
            <div className="p-2 text-xs text-[var(--muted)]">{hour}:00</div>
            {days.map((day) => {
              const items = byDayHour(day, hour);
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className="min-h-[52px] border-l border-[var(--border)]/30 p-1 hover:bg-[var(--surface-hover)]"
                  onClick={() => onSlotClick?.(day, hour)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={() => {}}
                >
                  {items.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick?.(a);
                      }}
                      className={clsx(
                        'mb-1 block w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight transition hover:ring-1 hover:ring-[var(--accent)]/40',
                        a.status === 'CANCELLED' ? 'bg-gray-400/20 line-through text-[var(--muted)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]',
                      )}
                    >
                      {a.patient.lastName} {a.service?.name && `· ${a.service.name}`}
                      <span className="block opacity-70">{APPOINTMENT_STATUS[a.status]}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
