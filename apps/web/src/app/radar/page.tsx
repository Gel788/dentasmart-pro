'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';

type Row = {
  id: string;
  bucket: string;
  title: string;
  who: string;
  phone: string | null;
  patientId: string;
  amount: number;
  action: 'call' | 'book' | 'message';
  actionLabel: string;
  message: string;
};

const LOG = 'sd.radar.v1';

export default function RadarPage() {
  return <Protected><Radar /></Protected>;
}

function Radar() {
  const { user } = useAuth();
  const allowed = user?.permissions.includes('finance.read') || user?.permissions.includes('org.manage');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [template, setTemplate] = useState('');
  const [done, setDone] = useState<string[]>([]);
  const [recovered, setRecovered] = useState(0);

  useEffect(() => {
    const saved = readLog();
    setDone(saved.ids);
    setRecovered(saved.amount);
    if (!allowed) return;
    void load().then(setRows).catch((err: Error) => setError(err.message));
  }, [allowed]);

  const open = rows.filter((row) => !done.includes(row.id));
  const lost = open.reduce((sum, row) => sum + row.amount, 0);
  const lead = useMemo(() => [...open].sort((a, b) => b.amount - a.amount)[0], [open]);

  const act = async (row: Row) => {
    setError('');
    setNote('');
    try {
      if (row.action === 'call') {
        await api('/market/calls/missed', { method: 'POST', body: JSON.stringify({ name: row.who, phone: row.phone, source: 'Радар' }) });
        setNote(`Звонок: ${row.who}`);
        setTemplate('');
      } else if (row.action === 'book') {
        const today = new Date().toISOString().slice(0, 10);
        const board = await api<{ doctors: { id: string }[]; branches: { cabinets: { id: string }[] }[] }>(`/workspace/schedule?date=${today}`);
        const start = new Date();
        start.setDate(start.getDate() + 1);
        start.setHours(10, 0, 0, 0);
        await api('/workspace/appointments', {
          method: 'POST',
          body: JSON.stringify({
            patientId: row.patientId,
            startsAt: start.toISOString(),
            durationMin: 30,
            doctorId: board.doctors[0]?.id,
            cabinetId: board.branches[0]?.cabinets[0]?.id,
          }),
        });
        setNote(`${row.who} на завтра, 10:00`);
        setTemplate('');
      } else {
        setTemplate(row.message);
        setNote('Шаблон готов');
      }
      const next = writeLog(row.id, row.amount);
      setDone(next.ids);
      setRecovered(next.amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Действие не вышло');
    }
  };

  if (!allowed) {
    return (
      <div className="sd-empty">
        <b>Радар у владельца</b>
        <p className="sd-muted">Суммы и возврат денег видит тот, у кого открыты финансы.</p>
      </div>
    );
  }

  return (
    <div className="radar">
      <header className="radar-hero">
        <div>
          <p className="sd-kicker">Радар денег</p>
          <h1>{formatMoney(lost)}</h1>
          <p>ещё можно вернуть</p>
        </div>
        <div className="radar-orb" aria-hidden>
          <i />
          {open.slice(0, 6).map((row, index) => <b key={row.id} style={{ ['--i' as string]: String(index) }} />)}
        </div>
        <div className="radar-back">
          <span>Вернули в этом месяце</span>
          <strong>{formatMoney(recovered)}</strong>
        </div>
      </header>
      {error && <p className="sd-chip danger">{error}</p>}
      {note && <p className="sd-chip info">{note}</p>}
      {template && <pre className="radar-template">{template}</pre>}
      <div className="radar-grid">
        {['Незакрытый план', 'Неявка', 'Просроченный отзыв', 'Неоплаченный счёт'].map((bucket) => {
          const list = rows.filter((row) => row.bucket === bucket);
          const sum = list.filter((row) => !done.includes(row.id)).reduce((total, row) => total + row.amount, 0);
          return (
            <section key={bucket} className="sd-card radar-col">
              <div className="radar-col-h">
                <strong>{bucket}</strong>
                <b>{formatMoney(sum)}</b>
              </div>
              {list.length === 0 && <p className="sd-muted">Пусто</p>}
              {list.map((row) => {
                const closed = done.includes(row.id);
                return (
                  <article key={row.id} className={closed ? 'done' : ''}>
                    <div>
                      <b>{row.who}</b>
                      <p>{row.title}</p>
                    </div>
                    <strong>{formatMoney(row.amount)}</strong>
                    <button className={row.id === lead?.id ? 'sd-btn' : 'sd-btn-ghost'} type="button" disabled={closed} onClick={() => void act(row)}>
                      {closed ? 'Готово' : row.actionLabel}
                    </button>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      <p className="sd-muted"><Link href="/">К сегодня</Link></p>
    </div>
  );
}

async function load(): Promise<Row[]> {
  const [abandoned, retention, day, invoices] = await Promise.all([
    api<{ rows: { planId: string; title: string; patientId: string; patient: string; phone: string | null; total: number; days: number }[] }>('/workspace/plans/abandoned'),
    api<{ followUps: { id: string; patientId: string; patient: string; phone: string | null; dueAt: string; reason: string }[]; recall: { patientId: string; patient: string; phone: string | null; lastVisit: string }[] }>('/flow/retention'),
    api<{ noShows: { id: string; service: string; reason: string; patient: { id: string; firstName: string; lastName: string; phone: string | null } }[] }>('/queue/clinic-day'),
    api<{ id: string; number: string; status: string; totalAmount: string | number; paidAmount: string | number; patient: { id: string; firstName: string; lastName: string } }[]>('/finance/invoices'),
  ]);
  const rows: Row[] = [];
  for (const plan of abandoned.rows) {
    rows.push({
      id: `plan-${plan.planId}`,
      bucket: 'Незакрытый план',
      title: `${plan.title} · ${plan.days} дн.`,
      who: plan.patient,
      phone: plan.phone,
      patientId: plan.patientId,
      amount: plan.total,
      action: 'call',
      actionLabel: 'Позвонить',
      message: '',
    });
  }
  for (const miss of day.noShows) {
    const who = `${miss.patient.lastName} ${miss.patient.firstName}`;
    rows.push({
      id: `miss-${miss.id}`,
      bucket: 'Неявка',
      title: `${miss.service} · ${miss.reason}`,
      who,
      phone: miss.patient.phone,
      patientId: miss.patient.id,
      amount: priceOf(miss.service),
      action: 'book',
      actionLabel: 'Записать',
      message: '',
    });
  }
  const now = Date.now();
  for (const row of retention.recall) {
    if (now - Date.parse(row.lastVisit) < 180 * 86400000) continue;
    rows.push({
      id: `recall-${row.patientId}`,
      bucket: 'Просроченный отзыв',
      title: 'Гигиена не была больше полугода',
      who: row.patient,
      phone: row.phone,
      patientId: row.patientId,
      amount: 6500,
      action: 'message',
      actionLabel: 'Шаблон',
      message: `Здравствуйте, ${row.patient}! Это Седракович Дент. Пора на профессиональную гигиену — подберём удобное время.`,
    });
  }
  for (const row of retention.followUps) {
    if (Date.parse(row.dueAt) > now) continue;
    rows.push({
      id: `follow-${row.id}`,
      bucket: 'Просроченный отзыв',
      title: row.reason,
      who: row.patient,
      phone: row.phone,
      patientId: row.patientId,
      amount: 5500,
      action: 'message',
      actionLabel: 'Шаблон',
      message: `Здравствуйте, ${row.patient}! Напоминаем: ${row.reason}. Седракович Дент.`,
    });
  }
  for (const invoice of invoices) {
    const due = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (invoice.status === 'PAID' || due <= 0) continue;
    const who = `${invoice.patient.lastName} ${invoice.patient.firstName}`;
    rows.push({
      id: `bill-${invoice.id}`,
      bucket: 'Неоплаченный счёт',
      title: invoice.number,
      who,
      phone: null,
      patientId: invoice.patient.id,
      amount: due,
      action: 'message',
      actionLabel: 'Напомнить',
      message: `Здравствуйте, ${who}! По счёту ${invoice.number} осталось ${formatMoney(due)}. Можно закрыть на стойке до следующего визита. Седракович Дент.`,
    });
  }
  return rows;
}

function priceOf(service: string) {
  if (/консульт/i.test(service)) return 1500;
  if (/гигиен/i.test(service)) return 6500;
  if (/кариес|пломб/i.test(service)) return 5500;
  if (/корон/i.test(service)) return 28000;
  if (/имплант/i.test(service)) return 45000;
  return 5500;
}

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

function readLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG) ?? '') as { month: string; amount: number; ids: string[] };
    if (raw.month === monthKey()) return raw;
  } catch { /* fresh month */ }
  return { month: monthKey(), amount: 0, ids: [] as string[] };
}

function writeLog(id: string, amount: number) {
  const current = readLog();
  if (current.ids.includes(id)) return current;
  const next = { month: monthKey(), amount: current.amount + amount, ids: [...current.ids, id] };
  localStorage.setItem(LOG, JSON.stringify(next));
  return next;
}
