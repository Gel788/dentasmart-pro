'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Plus, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './tasks.module.css';

type Task = { id: string; title: string; notes: string | null; dueAt: string | null; status: string; overdue: boolean; assignee: { id: string; name: string } | null; createdBy: string | null; patient: { id: string; name: string } | null; doneAt: string | null; createdAt: string; mine: boolean };
type Person = { id: string; name: string };
type Scope = 'mine' | 'all' | 'done';
const SCOPES: { id: Scope; label: string }[] = [{ id: 'mine', label: 'Мои' }, { id: 'all', label: 'Все открытые' }, { id: 'done', label: 'Выполненные' }];

const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dueLabel = (iso: string) => {
  const due = new Date(iso);
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  const day = ymd(due);
  const time = due.getHours() || due.getMinutes() ? `, ${due.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '';
  if (day === today) return `сегодня${time}`;
  if (day === tomorrow) return `завтра${time}`;
  return due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + time;
};

/** Clinic to-dos: what to do, by when, for whom; one tap to mark done. */
export function Tasks() {
  const params = useSearchParams();
  const router = useRouter();
  const scope = (SCOPES.find((item) => item.id === params.get('scope'))?.id ?? 'mine') as Scope;
  const [rows, setRows] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => api<Task[]>(`/tasks?scope=${scope}`).then((data) => { setRows(data); setError(''); }).catch((err: Error) => setError(err.message || 'Задачи не загрузились')), [scope]);
  useEffect(() => { setRows(null); void load(); }, [load]);
  useEffect(() => { api<Person[]>('/tasks/people').then(setPeople).catch(() => setPeople([])); }, []);

  const act = async (id: string, path: 'done' | 'reopen' | 'cancel') => {
    setBusy(id);
    try { await api(`/tasks/${id}/${path}`, { method: 'POST' }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не получилось'); }
    finally { setBusy(''); }
  };

  const groups = useMemo(() => {
    const list = rows ?? [];
    if (scope === 'done') return [{ title: 'Выполненные и отменённые', items: list }];
    const today = ymd(new Date());
    return [
      { title: 'Просрочено', items: list.filter((row) => row.overdue), tone: 'owe' },
      { title: 'Сегодня', items: list.filter((row) => !row.overdue && row.dueAt && ymd(new Date(row.dueAt)) === today) },
      { title: 'Дальше', items: list.filter((row) => !row.overdue && row.dueAt && ymd(new Date(row.dueAt)) > today) },
      { title: 'Без срока', items: list.filter((row) => !row.dueAt) },
    ].filter((group) => group.items.length);
  }, [rows, scope]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>Задачи</h1>
        <p>Перезвонить пациенту, заказать материал, проверить документ. Задача на сегодня и просроченная появляются на главной и в уведомлениях исполнителя.</p>
      </header>
      <NewTask people={people} focus={params.get('new') === '1'} onCreated={() => { if (scope === 'done') router.replace('/tasks'); else void load(); }} />
      <nav className={styles.tabs} aria-label="Какие задачи">
        {SCOPES.map((item) => <button key={item.id} type="button" aria-current={scope === item.id ? 'page' : undefined} onClick={() => router.replace(`/tasks?scope=${item.id}`)}>{item.label}</button>)}
      </nav>
      {error && <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" />{error}</p>}
      {rows === null ? <div className={styles.skeleton} aria-label="Загружаем задачи" /> : groups.length === 0 ? (
        <p className={styles.none}>{scope === 'done' ? 'Выполненных задач пока нет.' : 'Открытых задач нет. Добавьте задачу выше — себе или коллеге.'}</p>
      ) : groups.map((group) => (
        <section key={group.title} className={styles.m} data-tone={'tone' in group ? group.tone : undefined}>
          <h2>{group.title}<em>{group.items.length}</em></h2>
          <ul className={styles.list}>
            {group.items.map((task) => (
              <li key={task.id} className={styles.row} data-status={task.status}>
                {task.status === 'OPEN' ? (
                  <button type="button" className={styles.check} disabled={busy === task.id} onClick={() => void act(task.id, 'done')} aria-label={`Выполнено: ${task.title}`}><Check size={16} strokeWidth={3} /></button>
                ) : <span className={styles.checked} aria-hidden="true">{task.status === 'DONE' ? <Check size={16} strokeWidth={3} /> : <X size={14} />}</span>}
                <div className={styles.what}>
                  <b>{task.title}</b>
                  <span>
                    {[task.dueAt ? (task.overdue ? `просрочена · ${dueLabel(task.dueAt)}` : dueLabel(task.dueAt)) : null, scope !== 'mine' && task.assignee ? task.assignee.name : null, task.createdBy && !task.mine ? `от ${task.createdBy}` : null, task.status === 'CANCELLED' ? 'отменена' : null].filter(Boolean).join(' · ')}
                    {task.patient && <> · <Link href={`/patients/${task.patient.id}`}>{task.patient.name}</Link></>}
                  </span>
                  {task.notes && <p>{task.notes}</p>}
                </div>
                <div className={styles.acts}>
                  {task.status === 'OPEN'
                    ? <button type="button" className={styles.link} disabled={busy === task.id} onClick={() => void act(task.id, 'cancel')}>Отменить</button>
                    : <button type="button" className={styles.link} disabled={busy === task.id} onClick={() => void act(task.id, 'reopen')}><RotateCcw size={14} aria-hidden="true" />Вернуть</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NewTask({ people, focus, onCreated }: { people: Person[]; focus: boolean; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focus) input.current?.focus(); }, [focus]);
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const handle = setTimeout(() => { api<typeof hits>(`/workspace/search?q=${encodeURIComponent(query)}`).then(setHits).catch(() => setHits([])); }, 160);
    return () => clearTimeout(handle);
  }, [query]);
  const quick = [{ label: 'Сегодня', value: ymd(new Date()) }, { label: 'Завтра', value: ymd(new Date(Date.now() + 86400000)) }, { label: 'Через неделю', value: ymd(new Date(Date.now() + 7 * 86400000)) }];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/tasks', { method: 'POST', body: JSON.stringify({ title, dueAt: due ? new Date(`${due}T18:00:00`).toISOString() : null, assigneeId: assignee || null, patientId: patient?.id ?? null }) });
      setTitle(''); setDue(''); setPatient(null); setQuery('');
      onCreated();
      input.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Задача не создана');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={styles.new} onSubmit={(event) => void submit(event)}>
      <div className={styles.line}>
        <label className="sr-only" htmlFor="task-title">Что сделать</label>
        <input id="task-title" ref={input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Что сделать: перезвонить Орловой про снимок…" maxLength={300} />
        <button type="submit" className="sd-btn" disabled={!title.trim() || busy}><Plus size={16} aria-hidden="true" />{busy ? 'Добавляю…' : 'Добавить'}</button>
      </div>
      <div className={styles.opts}>
        <div className={styles.due} role="group" aria-label="Срок">
          {quick.map((item) => <button key={item.label} type="button" aria-pressed={due === item.value} onClick={() => setDue(due === item.value ? '' : item.value)}>{item.label}</button>)}
          <input type="date" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Срок" />
        </div>
        <label className={styles.field}><span>Кому</span>
          <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="">Себе</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <div className={styles.field}>
          <span>Пациент</span>
          {patient ? (
            <div className={styles.chip}>{patient.name}<button type="button" onClick={() => setPatient(null)} aria-label="Убрать пациента"><X size={14} /></button></div>
          ) : (
            <div className={styles.search}>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="необязательно" aria-label="Пациент" />
              {hits.length > 0 && <div className={styles.hits}>{hits.map((hit) => <button key={hit.id} type="button" onClick={() => { setPatient({ id: hit.id, name: `${hit.lastName} ${hit.firstName}` }); setQuery(''); }}>{hit.lastName} {hit.firstName}</button>)}</div>}
            </div>
          )}
        </div>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  );
}
