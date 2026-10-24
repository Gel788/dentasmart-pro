'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { formatRub, kopecks, SEGMENTS, type PatientSegment } from '@dentasmart/shared';
import { Protected } from '@/components/protected';
import { PatientForm } from '@/components/studio/patient-form';
import { PatientPreview } from '@/components/patients/preview';
import {
  ageOf,
  alertsOf,
  dateLabel,
  daysFrom,
  fullName,
  hasDebt,
  hasDeposit,
  phoneLabel,
  visitLabel,
  years,
  type RegistryPage,
  type RegistryPatient,
  type RegistrySort,
} from '@/components/patients/model';
import styles from '@/components/patients/registry.module.css';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const PAGE_SIZE = 30;
const STORE = 'sd.patients.view';

type View = { search: string; segment: PatientSegment | 'all'; sort: RegistrySort; page: number };

const COLUMNS: { id: string; label: string; sort?: RegistrySort }[] = [
  { id: 'name', label: 'Пациент', sort: 'name' },
  { id: 'phone', label: 'Телефон' },
  { id: 'last', label: 'Последний визит', sort: 'lastVisit' },
  { id: 'next', label: 'Следующий визит', sort: 'nextVisit' },
  { id: 'balance', label: 'Баланс', sort: 'debt' },
];

export default function PatientsPage() {
  return <Protected><Registry /></Protected>;
}

function Registry() {
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = user?.permissions.includes('patient.write') ?? false;
  const [view, setView] = useState<View | null>(null);
  const [data, setData] = useState<RegistryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // «Новый пациент» from the home screen opens the form straight away.
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new') === '1') setCreating(true); }, []);
  const [attempt, setAttempt] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    let saved: Partial<View> = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(STORE) ?? '{}') as Partial<View>;
    } catch {
      sessionStorage.removeItem(STORE);
    }
    setView({ search: saved.search ?? '', segment: saved.segment ?? 'all', sort: saved.sort ?? 'name', page: saved.page ?? 1 });
  }, []);

  useEffect(() => {
    if (view) sessionStorage.setItem(STORE, JSON.stringify(view));
  }, [view]);

  useEffect(() => {
    if (!view) return;
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(view.page), pageSize: String(PAGE_SIZE), segment: view.segment, sort: view.sort });
    if (view.search.trim()) params.set('search', view.search.trim());
    const handle = setTimeout(() => {
      api<RegistryPage>(`/patients?${params}`)
        .then((res) => {
          if (!live) return;
          setData(res);
          setError('');
          const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
          if (view.page > pages) setView((current) => (current ? { ...current, page: pages } : current));
        })
        .catch((err: Error) => live && setError(err.message || 'Список не загрузился'))
        .finally(() => live && setLoading(false));
    }, view.search ? 180 : 0);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [view, attempt]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !target.closest('input, textarea, select, [contenteditable]')) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rows = useMemo(() => data?.items ?? [], [data]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const update = (patch: Partial<View>) => setView((current) => (current ? { ...current, page: 1, ...patch } : current));

  const book = useCallback(
    (row: RegistryPatient) => {
      sessionStorage.setItem('sd_book_patient', JSON.stringify({ id: row.id, name: fullName(row) }));
      router.push('/schedule');
    },
    [router],
  );

  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    setSelectedId(row.id);
    tableRef.current?.querySelector<HTMLElement>(`[data-row="${row.id}"]`)?.focus();
  };

  const onRowsKey = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const index = rows.findIndex((row) => row.id === selectedId);
    if (event.key === 'ArrowDown') { event.preventDefault(); focusRow(Math.min(rows.length - 1, index + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); focusRow(Math.max(0, index - 1)); }
    if (event.key === 'Enter' && selected) router.push(`/patients/${selected.id}`);
    if (event.key === 'Escape') setSelectedId(null);
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && rows.length) { event.preventDefault(); focusRow(0); }
    if (event.key === 'Escape' && view?.search) update({ search: '' });
  };

  if (!view) return null;

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (view.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, view.page * PAGE_SIZE);
  const counts = data?.segments;
  const segmentLabel = SEGMENTS.find((item) => item.id === view.segment)?.label ?? 'Все';

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <h1 className={styles.title}>
          Пациенты
          <small>{counts ? `${counts.all.toLocaleString('ru-RU')} ${view.search.trim() ? 'найдено' : 'в базе'}` : ' '}</small>
        </h1>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Поиск по фамилии, имени или телефону</span>
          <input
            ref={searchRef}
            type="search"
            value={view.search}
            onChange={(event) => update({ search: event.target.value })}
            onKeyDown={onSearchKey}
            placeholder="Фамилия, имя или телефон"
            autoComplete="off"
            spellCheck={false}
          />
          {view.search ? (
            <button type="button" className={styles.clear} onClick={() => { update({ search: '' }); searchRef.current?.focus(); }} aria-label="Очистить поиск">
              <X size={16} aria-hidden="true" />
            </button>
          ) : (
            <kbd className={styles.hint} aria-hidden="true">/</kbd>
          )}
        </label>
        {canWrite && (
          <button className="sd-btn" type="button" onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" /> Новый пациент
          </button>
        )}
      </header>

      <div className={styles.segments} role="group" aria-label="Сегменты пациентов">
        {SEGMENTS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.segment}
            data-id={item.id}
            aria-pressed={view.segment === item.id}
            onClick={() => update({ segment: item.id })}
          >
            <span>{item.label}</span>
            <b data-zero={counts ? counts[item.id] === 0 : undefined}>{counts ? counts[item.id].toLocaleString('ru-RU') : '·'}</b>
          </button>
        ))}
      </div>

      <div className={styles.body}>
        <section className={styles.list} aria-busy={loading}>
          {error && (
            <div className={styles.error} role="alert">
              <span>{error}</span>
              <button type="button" className="sd-btn-ghost" onClick={() => setAttempt((n) => n + 1)}>Повторить</button>
            </div>
          )}
          <table className={styles.table} data-loading={loading && !!data}>
            <caption className="sr-only">
              Пациенты, сегмент «{segmentLabel}». Стрелки вверх и вниз выбирают строку, Enter открывает карту.
            </caption>
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const active = column.sort && view.sort === column.sort;
                  return (
                    <th key={column.id} data-col={column.id} aria-sort={active ? (column.sort === 'name' || column.sort === 'nextVisit' ? 'ascending' : 'descending') : undefined}>
                      {column.sort ? (
                        <button type="button" onClick={() => update({ sort: column.sort })} data-active={active || undefined}>
                          {column.label}
                          {active && (column.sort === 'name' || column.sort === 'nextVisit' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />)}
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody ref={tableRef} onKeyDown={onRowsKey}>
              {!data && loading && Array.from({ length: 8 }, (_, index) => (
                <tr key={`s${index}`} className={styles.skeleton} aria-hidden="true">
                  {COLUMNS.map((column) => <td key={column.id} data-col={column.id}><i /></td>)}
                </tr>
              ))}
              {rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  selected={row.id === selectedId}
                  onSelect={() => setSelectedId(row.id)}
                  onOpen={() => router.push(`/patients/${row.id}`)}
                />
              ))}
            </tbody>
          </table>

          {data && rows.length === 0 && (
            <div className={styles.empty}>
              {view.search.trim() ? (
                <>
                  <p>По запросу «{view.search.trim()}»{view.segment !== 'all' ? ` в сегменте «${segmentLabel}»` : ''} никого нет.</p>
                  <div>
                    {view.segment !== 'all' && <button type="button" className="sd-btn-ghost" onClick={() => update({ segment: 'all' })}>Искать во всех</button>}
                    {canWrite && <button type="button" className="sd-btn" onClick={() => setCreating(true)}>Новый пациент</button>}
                  </div>
                </>
              ) : view.segment !== 'all' ? (
                <>
                  <p>В сегменте «{segmentLabel}» сейчас никого.</p>
                  <div><button type="button" className="sd-btn-ghost" onClick={() => update({ segment: 'all' })}>Показать всех</button></div>
                </>
              ) : (
                <>
                  <p>В базе пока нет пациентов. Добавьте первого или перенесите базу из прошлой программы в настройках.</p>
                  <div>{canWrite && <button type="button" className="sd-btn" onClick={() => setCreating(true)}>Новый пациент</button>}</div>
                </>
              )}
            </div>
          )}

          {total > 0 && (
            <footer className={styles.pager}>
              <span>{from}–{to} из {total.toLocaleString('ru-RU')}</span>
              <div>
                <button type="button" className={styles.pageBtn} disabled={view.page <= 1} onClick={() => setView({ ...view, page: view.page - 1 })} aria-label="Предыдущая страница">
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <span className={styles.pageNo}>{view.page} / {pages}</span>
                <button type="button" className={styles.pageBtn} disabled={view.page >= pages} onClick={() => setView({ ...view, page: view.page + 1 })} aria-label="Следующая страница">
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </footer>
          )}
        </section>

        <PatientPreview
          patient={selected}
          onClose={() => setSelectedId(null)}
          onOpen={(row) => router.push(`/patients/${row.id}`)}
          onBook={book}
        />
      </div>

      <PatientForm open={creating} onClose={() => setCreating(false)} onSaved={(patient) => router.push(`/patients/${patient.id}`)} />
    </div>
  );
}

function Row({ row, selected, onSelect, onOpen }: { row: RegistryPatient; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const age = ageOf(row.birthDate);
  const alerts = alertsOf(row);
  const next = row.nextVisit ? daysFrom(row.nextVisit) : null;
  const debt = hasDebt(row);
  const declined = row.segments.includes('declined');
  const dormant = row.segments.includes('dormant');
  return (
    <tr
      data-row={row.id}
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      className={styles.row}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <td data-col="name">
        <button type="button" className={styles.name} onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`${fullName(row)}, показать сведения`}>
          <b>{fullName(row)}</b>
          {(age !== null || alerts.length > 0 || declined || row.tags.length > 0) && (
            <span className={styles.marks}>
              {age !== null && <small>{years(age)}</small>}
              {declined && <span className={styles.tag} data-tone="muted">отказ</span>}
              {alerts.slice(0, 2).map((alert) => (
                <span key={alert.id} className={styles.tag} data-tone={alert.strong ? 'alert' : 'warn'}>{alert.label}</span>
              ))}
              {alerts.length > 2 && <span className={styles.tag} data-tone="alert">ещё {alerts.length - 2}</span>}
              {row.tags.slice(0, 2).map((tag) => <span key={tag} className={styles.tag}>{tag}</span>)}
            </span>
          )}
        </button>
      </td>
      <td data-col="phone" className={styles.mono}>{phoneLabel(row.phone) ?? <span className={styles.none}>нет телефона</span>}</td>
      <td data-col="last" data-dormant={dormant || undefined}>
        {dateLabel(row.lastVisit) ?? <span className={styles.none}>не было</span>}
      </td>
      <td data-col="next" data-soon={next !== null && next <= 7 ? true : undefined}>
        {visitLabel(row.nextVisit) ?? <span className={styles.none}>не записан</span>}
      </td>
      <td data-col="balance" className={styles.mono}>
        {debt ? (
          <span className={styles.debt}>−{formatRub(kopecks(row.debt))}</span>
        ) : hasDeposit(row) ? (
          <span className={styles.deposit}>+{formatRub(kopecks(row.deposit))}</span>
        ) : (
          <span className={styles.none} data-zero="true" aria-label="Долгов нет">—</span>
        )}
      </td>
    </tr>
  );
}
