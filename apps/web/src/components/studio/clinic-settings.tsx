'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { employeeWeek, weekHoursOf, weekHoursText, type ScheduleRow, type WeekHours } from '@dentasmart/shared';
import { api } from '@/lib/api';
import { downloadJson, downloadReport } from '@/lib/download';
import { formatMoney } from '@/lib/format';

type Norm = { itemId: string; name?: string; quantity: number };
type ServiceRow = {
  id: string;
  parentId: string | null;
  code: string | null;
  name: string;
  price: number;
  durationMin: number;
  requiresTooth: boolean;
  surfaceMode: string;
  doctorPercent: number;
  isActive: boolean;
  norms: Norm[];
};
type Bundle = {
  brand: Record<string, string | null> & { weekHours?: WeekHours };
  services: ServiceRow[];
  stock: { id: string; name: string; sku: string | null; unit: string; minStock: number; quantity: number; cost: number; isActive: boolean }[];
  planTemplates: { id: string; name: string; note: string | null; isArchived: boolean }[];
  visitTemplates: { id: string; name: string; icd10: string | null; complaints: string; diagnosis: string; treatment: string; recommendations: string; isArchived: boolean }[];
  documents: { id: string; kind: string; name: string; body: string; isArchived: boolean }[];
  employees: { id: string; firstName: string; lastName: string; specialization: string | null; phone: string | null; email: string; commission: number; status?: string; canLogin?: boolean; roles?: { code: string; name: string }[]; schedule: ScheduleRow[]; weekHours?: WeekHours | null }[];
  cabinets: { id: string; name: string; isActive: boolean }[];
  roles: { id: string; name: string; code: string; seeCost: boolean; maxDiscountPercent: number; editClosedVisits: boolean; editPrice: boolean; seeAllFinance: boolean; canExport: boolean; permissions: string[] }[];
  permissions: { code: string; description: string | null }[];
  promos: { id: string; code: string; discountPct: number; isActive: boolean }[];
  rules: { id: string; name: string; trigger: string; channel: string; body: string; isActive: boolean }[];
  history: { id: string; at: string; email: string; entityType: string; action: string; changes: unknown }[];
  aiPlans?: boolean;
};

const SECTIONS = [
  ['brand', 'Клиника'],
  ['staff', 'Сотрудники'],
  ['roles', 'Права'],
  ['chairs', 'Кресла'],
  ['price', 'Прайс'],
  ['stock', 'Склад'],
  ['templates', 'Шаблоны'],
  ['offers', 'Акции и напоминания'],
  ['security', 'Безопасность'],
  ['exchange', 'Обмен данными'],
  ['history', 'История изменений'],
] as const;
type SectionId = (typeof SECTIONS)[number][0];
const SEARCHABLE: SectionId[] = ['staff', 'stock', 'templates'];

/** One look for every section: a heading, one line on what it is for, then the work. */
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="cfg-panel sd-stack">
      <header>
        <h2>{title}</h2>
        {hint && <p className="sd-muted">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

export function ClinicSettings() {
  const [data, setData] = useState<Bundle | null>(null);
  const [section, setSectionState] = useState<SectionId>('brand');
  useEffect(() => {
    const follow = () => {
      const hash = window.location.hash.slice(1) as SectionId;
      if (SECTIONS.some(([id]) => id === hash)) setSectionState(hash);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  const setSection = (id: SectionId) => {
    setSectionState(id);
    window.history.replaceState(null, '', `#${id}`);
  };
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = () => api<Bundle>('/config').then(setData).catch((err: Error) => setError(err.message));
  useEffect(() => { void load(); }, []);

  const flash = async (work: () => Promise<unknown>) => {
    setError('');
    setNotice('');
    try {
      await work();
      setNotice('Сохранено');
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
      return false;
    }
  };

  if (error && !data) return <p className="sd-chip danger">{error}</p>;
  if (!data) return <div className="sd-skel" style={{ height: 240 }} />;
  const q = query.trim().toLowerCase();
  return (
    <div className="cfg">
      <div className="cfg-head">
        <div>
          <h1>Настройки</h1>
          <p className="sd-muted">Клиника, люди и права, прайс, склад, шаблоны и обмен данными.</p>
        </div>
        {SEARCHABLE.includes(section) && (
          <input className="sd-input" type="search" placeholder="Найти в разделе" aria-label="Найти в разделе" value={query} onChange={(event) => setQuery(event.target.value)} />
        )}
      </div>
      <p className="cfg-status" aria-live="polite" data-tone={error ? 'error' : notice ? 'ok' : undefined}>{error || notice}</p>
      <div className="cfg-layout">
        <nav aria-label="Разделы настроек">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={section === id ? 'on' : ''} aria-current={section === id ? 'page' : undefined} type="button" onClick={() => { setSection(id); setQuery(''); }}>{label}</button>
          ))}
        </nav>
        <div>
          {section === 'price' && <Price data={data} query={q} flash={flash} />}
          {section === 'stock' && <Stock data={data} query={q} flash={flash} />}
          {section === 'templates' && <Templates data={data} query={q} flash={flash} aiPlans={data.aiPlans !== false} />}
          {section === 'brand' && <><Brand data={data} flash={flash} /><Hours data={data} flash={flash} /></>}
          {section === 'chairs' && <Chairs data={data} flash={flash} />}
          {section === 'security' && <Panel title="Безопасность" hint="Вход по коду из приложения-аутентификатора для вашей учётки."><TwoFactor /></Panel>}
          {section === 'staff' && <Staff data={data} query={q} flash={flash} />}
          {section === 'roles' && <Roles data={data} flash={flash} />}
          {section === 'offers' && <Offers data={data} flash={flash} />}
          {section === 'exchange' && <Exchange />}
          {section === 'history' && <History rows={data.history} />}
        </div>
      </div>
    </div>
  );
}

function Price({ data }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const count = data.services.filter((row) => row.code && row.isActive).length;
  return (
    <Panel title="Прайс" hint="Услуги, цены, длительность и расходники по каждой услуге — на отдельном экране, там же импорт и выгрузка.">
      <p>{count} {count % 10 === 1 && count % 100 !== 11 ? 'услуга' : 'услуг'} в прайсе.</p>
      <Link className="sd-btn" href="/price" style={{ width: 'fit-content' }}>Открыть прайс</Link>
    </Panel>
  );
}

function Stock({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', quantity: 0, cost: 0 });
  const rows = data.stock.filter((row) => row.isActive !== false && (!query || row.name.toLowerCase().includes(query)));
  return (
    <Panel title="Склад" hint="Материалы, остатки и закупочная цена. Расход по нормам услуг списывается сам при закрытии визита.">
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/stock', { method: 'POST', body: JSON.stringify({ name, unit: 'шт', minStock: 5, quantity: 0, cost: 0 }) })).then((ok) => { if (ok) setName(''); }); }}>
        <label>Новый материал<input className="sd-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Композит A2" required /></label>
        <button className="sd-btn" type="submit">Добавить</button>
      </form>
      {rows.length === 0 && <p className="sd-muted">{query ? 'Ничего не нашли.' : 'Материалов пока нет.'}</p>}
      <ul className="cfg-list">
        {rows.map((row) => (
          <li key={row.id} className="cfg-row" data-low={row.quantity <= row.minStock || undefined}>
            {editing === row.id ? (
              <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/stock', { method: 'POST', body: JSON.stringify({ id: row.id, name: draft.name, quantity: draft.quantity, cost: draft.cost }) })).then((ok) => { if (ok) setEditing(null); }); }}>
                <label>Название<input className="sd-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
                <label>Остаток<input className="sd-input" type="number" min={0} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} /></label>
                <label>Закупка, ₽<input className="sd-input" type="number" min={0} value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: Number(event.target.value) })} /></label>
                <button className="sd-btn" type="submit">Сохранить</button>
                <button className="sd-btn-ghost" type="button" onClick={() => setEditing(null)}>Отмена</button>
              </form>
            ) : (
              <>
                <span className="cfg-main"><b>{row.name}</b><small>закупка {formatMoney(row.cost)} · минимум {row.minStock} {row.unit}</small></span>
                <span className="cfg-qty">{row.quantity} {row.unit}{row.quantity <= row.minStock && <em> · пора заказать</em>}</span>
                <span className="cfg-actions">
                  <button className="sd-btn-ghost" type="button" onClick={() => { setEditing(row.id); setDraft({ name: row.name, quantity: row.quantity, cost: row.cost }); }}>Изменить</button>
                  <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/stock', { method: 'POST', body: JSON.stringify({ id: row.id, isActive: false }) }))}>В архив</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Templates({ data, query, flash, aiPlans }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<boolean>; aiPlans: boolean }) {
  const [name, setName] = useState('');
  const visits = data.visitTemplates.filter((row) => !query || row.name.toLowerCase().includes(query));
  const documents = data.documents.filter((row) => !query || row.name.toLowerCase().includes(query));
  return (
    <>
      <Panel title="Быстрый план" hint="Врач отмечает находки на формуле, и план с этапами и ценами из прайса собирается сам.">
        <label className="cfg-toggle">
          <input type="checkbox" checked={aiPlans} onChange={(event) => void flash(() => api('/config/ai', { method: 'POST', body: JSON.stringify({ enabled: event.target.checked }) }))} />
          <span>Показывать «Находки» и «Собрать план» в карте пациента</span>
        </label>
      </Panel>
      <Panel title="Шаблоны протокола приёма" hint="Подставляются в протокол одной кнопкой на экране визита.">
        <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/visit-templates', { method: 'POST', body: JSON.stringify({ name, icd10: 'K02.1', complaints: 'Реакция на сладкое', diagnosis: 'K02.1 кариес дентина', treatment: 'Пломба', recommendations: 'Контроль через полгода' }) })).then((ok) => { if (ok) setName(''); }); }}>
          <label>Название шаблона<input className="sd-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Кариес дентина" required /></label>
          <button className="sd-btn" type="submit">Добавить</button>
        </form>
        <ul className="cfg-list">
          {visits.map((row) => (
            <li key={row.id} className="cfg-row" data-off={row.isArchived || undefined}>
              <span className="cfg-main"><b>{row.name}</b><small>{[row.icd10, row.diagnosis].filter(Boolean).join(' · ')}</small></span>
              <span className="cfg-actions">
                <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/visit-templates', { method: 'POST', body: JSON.stringify({ ...row, isArchived: !row.isArchived }) }))}>{row.isArchived ? 'Вернуть' : 'В архив'}</button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Шаблоны планов" hint="Готовые наборы этапов и услуг для частых случаев.">
        <ul className="cfg-list">
          {data.planTemplates.map((row) => <li key={row.id} className="cfg-row"><span className="cfg-main"><b>{row.name}</b><small>{row.note}</small></span></li>)}
        </ul>
        <button className="sd-btn-ghost" type="button" style={{ width: 'fit-content' }} onClick={() => void flash(() => api('/config/plan-templates', { method: 'POST', body: JSON.stringify({ name: 'Санация двух зубов', note: 'Эконом', phasesJson: [{ title: 'Санация', items: ['Лечение кариеса'] }] }) }))}>Добавить шаблон плана</button>
      </Panel>
      <Panel title="Документы" hint="Согласия и договоры с подстановкой пациента, клиники и даты.">
        <ul className="cfg-list">
          {documents.map((row) => <li key={row.id} className="cfg-row"><span className="cfg-main"><b>{row.name}</b><small>{row.kind === 'CONSENT' ? 'согласие' : row.kind}</small></span></li>)}
        </ul>
        <button className="sd-btn-ghost" type="button" style={{ width: 'fit-content' }} onClick={() => void flash(() => api('/config/documents', { method: 'POST', body: JSON.stringify({ kind: 'CONSENT', name: 'ИДС на лечение', body: 'Я, {{patient}}, согласен на лечение в {{clinic}} {{date}}.' }) }))}>Добавить согласие на лечение</button>
      </Panel>
    </>
  );
}

const BRAND_GROUPS: { title: string; fields: [string, string][] }[] = [
  { title: 'Клиника', fields: [['name', 'Название'], ['phone', 'Телефон'], ['email', 'Почта'], ['address', 'Адрес']] },
  { title: 'Юрлицо', fields: [['legalName', 'Юрлицо'], ['inn', 'ИНН'], ['ogrn', 'ОГРН'], ['bankName', 'Банк'], ['bankAccount', 'Счёт'], ['bik', 'БИК']] },
  { title: 'Оформление', fields: [['logoUrl', 'Логотип (ссылка)'], ['brandColor', 'Цвет']] },
];

function Brand({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState(data.brand);
  const dirty = BRAND_GROUPS.some((group) => group.fields.some(([key]) => (form[key] ?? '') !== (data.brand[key] ?? '')));
  const fieldsOnly = () => Object.fromEntries(BRAND_GROUPS.flatMap((group) => group.fields.map(([key]) => [key, form[key] ?? ''])));
  return (
    <Panel title="Клиника" hint="Реквизиты печатаются в планах лечения, счетах и согласиях.">
      <form className="cfg-brand" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/brand', { method: 'POST', body: JSON.stringify(fieldsOnly()) })); }}>
        {BRAND_GROUPS.map((group) => (
          <fieldset key={group.title}>
            <legend>{group.title}</legend>
            {group.fields.map(([key, label]) => (
              <label key={key}>{label}
                <input className="sd-input" value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
              </label>
            ))}
          </fieldset>
        ))}
        <div className="cfg-save">
          <button className="sd-btn" type="submit" disabled={!dirty}>Сохранить</button>
          {dirty && <button className="sd-btn-ghost" type="button" onClick={() => setForm(data.brand)}>Отменить</button>}
        </div>
      </form>
    </Panel>
  );
}

const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const fromTime = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : 0;
};
function staffWeekLabel(row: { schedule: ScheduleRow[]; weekHours?: WeekHours | null }) {
  const own = row.weekHours !== undefined ? row.weekHours : employeeWeek(row.schedule);
  return own ? `график: ${weekHoursText(own)}` : 'по часам клиники';
}
const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

/** Opening hours per weekday: the calendar shows only these, the rest opens on request. */
function Hours({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const initial = weekHoursOf(data.brand.weekHours, data.brand.workHours);
  return (
    <Panel title="Часы работы" hint="В расписании видно только рабочее время. Остальные часы открываются кнопкой «Всё время» — туда тоже можно записать.">
      <WeekEditor initial={initial} saveLabel="Сохранить часы" onSave={(week) => flash(() => api('/config/brand', { method: 'POST', body: JSON.stringify({ weekHours: week }) }))} />
    </Panel>
  );
}

/** Seven days with a day-off switch and open/close times; refuses a day that closes before it opens. */
function WeekEditor({ initial, saveLabel, onSave, onCancel }: { initial: WeekHours; saveLabel: string; onSave: (week: WeekHours) => Promise<boolean>; onCancel?: () => void }) {
  const [week, setWeek] = useState<WeekHours>(initial);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(week) !== JSON.stringify(initial);
  const setDay = (index: number, value: WeekHours[number]) => setWeek(week.map((day, i) => (i === index ? value : day)));
  const copyToWeekdays = (index: number) => setWeek(week.map((day, i) => (i < 5 ? (week[index] ? { ...week[index]! } : null) : day)));
  const bad = week.findIndex((day) => day && day.opensAt >= day.closesAt);

  return (
    <form
      className="cfg-hours"
      onSubmit={(event) => {
        event.preventDefault();
        if (bad >= 0) { setError(`${DAY_NAMES[bad]}: закрытие должно быть позже открытия`); return; }
        setError('');
        void onSave(week);
      }}
    >
      <ul>
        {week.map((day, index) => (
          <li key={DAY_NAMES[index]} data-closed={!day || undefined} data-bad={index === bad || undefined}>
            <label className="cfg-hours-day">
              <input type="checkbox" aria-label={`${DAY_NAMES[index]} — рабочий день`} checked={!!day} onChange={(event) => setDay(index, event.target.checked ? { opensAt: 540, closesAt: 1200 } : null)} />
              <span><b>{DAY_NAMES[index]}</b><small>{day ? 'рабочий' : 'выходной'}</small></span>
            </label>
            {day ? (
              <span className="cfg-hours-time">
                <label><span className="sr-only">{DAY_NAMES[index]}, начало</span><input className="sd-input" type="time" step={900} value={toTime(day.opensAt)} onChange={(event) => setDay(index, { ...day, opensAt: fromTime(event.target.value) })} /></label>
                <span aria-hidden="true">—</span>
                <label><span className="sr-only">{DAY_NAMES[index]}, конец</span><input className="sd-input" type="time" step={900} value={toTime(day.closesAt === 1440 ? 1439 : day.closesAt)} onChange={(event) => setDay(index, { ...day, closesAt: fromTime(event.target.value) })} /></label>
              </span>
            ) : <span className="cfg-hours-off">не работает</span>}
            {index === 0 && <button className="sd-btn-ghost cfg-hours-copy" type="button" onClick={() => copyToWeekdays(0)}>На все будни</button>}
          </li>
        ))}
      </ul>
      <p className="cfg-hours-sum">{weekHoursText(week)}</p>
      {error && <p className="cfg-hours-error" role="alert">{error}</p>}
      <div className="cfg-save">
        <button className="sd-btn" type="submit" disabled={!dirty && !onCancel}>{saveLabel}</button>
        {dirty && <button className="sd-btn-ghost" type="button" onClick={() => { setWeek(initial); setError(''); }}>Сбросить</button>}
        {onCancel && <button className="sd-btn-ghost" type="button" onClick={onCancel}>Закрыть</button>}
      </div>
    </form>
  );
}

/** An employee's own week, or the clinic's hours. */
function StaffHours({ data, row, flash, onClose }: { data: Bundle; row: Bundle['employees'][number]; flash: (work: () => Promise<unknown>) => Promise<boolean>; onClose: () => void }) {
  const clinic = weekHoursOf(data.brand.weekHours, data.brand.workHours);
  const own = row.weekHours !== undefined ? row.weekHours : employeeWeek(row.schedule);
  const [custom, setCustom] = useState(!!own);
  const save = (weekHours: WeekHours | null) =>
    flash(() => api('/config/employees', { method: 'POST', body: JSON.stringify({ id: row.id, firstName: row.firstName, lastName: row.lastName, specialization: row.specialization, email: row.email, commission: row.commission, weekHours }) })).then((ok) => { if (ok) onClose(); return ok; });
  return (
    <div className="cfg-staff-hours">
      <div className="sd-seg" role="radiogroup" aria-label={`График: ${row.lastName} ${row.firstName}`}>
        <button type="button" role="radio" aria-checked={!custom} className={!custom ? 'on' : ''} onClick={() => setCustom(false)}>По часам клиники</button>
        <button type="button" role="radio" aria-checked={custom} className={custom ? 'on' : ''} onClick={() => setCustom(true)}>Свой график</button>
      </div>
      {custom ? (
        <WeekEditor initial={own ?? clinic} saveLabel="Сохранить график" onSave={(week) => save(week)} onCancel={onClose} />
      ) : (
        <div className="cfg-staff-hours-clinic">
          <p>Работает по часам клиники: {weekHoursText(clinic)}.</p>
          <div className="cfg-save">
            {own ? <button className="sd-btn" type="button" onClick={() => void save(null)}>Перевести на часы клиники</button> : null}
            <button className="sd-btn-ghost" type="button" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chairs({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [chair, setChair] = useState('');
  return (
    <Panel title="Кресла" hint="Каждое рабочее кресло — колонка в расписании. Кресло в архиве пропадает из записи, прошлые визиты остаются.">
      <ul className="cfg-list">
        {data.cabinets.map((cabinet) => (
          <li key={cabinet.id} className="cfg-row" data-off={!cabinet.isActive || undefined}>
            <span className="cfg-main"><b>{cabinet.name}</b><small>{cabinet.isActive ? 'в расписании' : 'в архиве'}</small></span>
            <span className="cfg-actions">
              <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/cabinets', { method: 'POST', body: JSON.stringify({ id: cabinet.id, name: cabinet.name, isActive: !cabinet.isActive }) }))}>{cabinet.isActive ? 'В архив' : 'Вернуть'}</button>
            </span>
          </li>
        ))}
      </ul>
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/cabinets', { method: 'POST', body: JSON.stringify({ name: chair }) })).then((ok) => { if (ok) setChair(''); }); }}>
        <label>Новое кресло<input className="sd-input" placeholder="Кресло 2" value={chair} onChange={(event) => setChair(event.target.value)} required /></label>
        <button className="sd-btn-ghost" type="submit">Добавить</button>
      </form>
    </Panel>
  );
}

const STAFF_ROLES: [string, string][] = [['doctor', 'Врач'], ['assistant', 'Ассистент'], ['admin', 'Администратор'], ['manager', 'Управляющий'], ['accountant', 'Бухгалтер']];

function Staff({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const blank = { firstName: '', lastName: '', email: '', specialization: '', roleCode: 'doctor', commission: 0 };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [hoursFor, setHoursFor] = useState<string | null>(null);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', specialization: '', phone: '', commission: 0 });
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const off = (status?: string) => status === 'INACTIVE' || status === 'TERMINATED';
  const rows = data.employees.filter((row) => !query || `${row.lastName} ${row.firstName} ${row.email}`.toLowerCase().includes(query));
  return (
    <Panel title="Сотрудники" hint="У каждого свой вход. Роль задаёт, что человек видит и может менять. Сотрудник в архиве не входит в систему, его история остаётся.">
      <form className="cfg-new cfg-staff" onSubmit={(event) => {
        event.preventDefault();
        void flash(async () => {
          // A new employee works by the clinic's hours until a week of their own is set.
          const created = await api<{ id: string; email?: string; password?: string }>('/config/employees', { method: 'POST', body: JSON.stringify(form) });
          if (created.password && created.email) setIssued({ email: created.email, password: created.password });
        }).then((ok) => { if (ok) setForm(blank); });
      }}>
        <label>Фамилия<input className="sd-input" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required /></label>
        <label>Имя<input className="sd-input" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required /></label>
        <label>Почта для входа<input className="sd-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
        <label>Роль
          <select className="sd-input" value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })}>
            {STAFF_ROLES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label>Специализация<input className="sd-input" value={form.specialization} placeholder="Терапевт" onChange={(event) => setForm({ ...form, specialization: event.target.value })} /></label>
        <button className="sd-btn" type="submit">Добавить сотрудника</button>
      </form>
      {issued && (
        <div className="cfg-issued" role="status">
          <p>Вход для <b>{issued.email}</b>: пароль <b className="sd-mono">{issued.password}</b></p>
          <p className="sd-muted">Пароль показан один раз. Передайте его сотруднику лично; после первого входа его лучше сменить.</p>
          <button className="sd-btn-ghost" type="button" onClick={() => setIssued(null)}>Я записал пароль</button>
        </div>
      )}
      <ul className="cfg-list">
        {rows.map((row) => (
          <li key={row.id} className="cfg-row" data-off={off(row.status) || undefined}>
            {editing === row.id ? (
              <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/employees', { method: 'POST', body: JSON.stringify({ id: row.id, ...draft, email: row.email }) })).then((ok) => { if (ok) setEditing(null); }); }}>
                <label>Фамилия<input className="sd-input" value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} required /></label>
                <label>Имя<input className="sd-input" value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} required /></label>
                <label>Специализация<input className="sd-input" value={draft.specialization} onChange={(event) => setDraft({ ...draft, specialization: event.target.value })} /></label>
                <label>Телефон<input className="sd-input" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
                <label>Процент с выручки<input className="sd-input" type="number" min={0} max={100} value={draft.commission} onChange={(event) => setDraft({ ...draft, commission: Number(event.target.value) })} /></label>
                <button className="sd-btn" type="submit">Сохранить</button>
                <button className="sd-btn-ghost" type="button" onClick={() => setEditing(null)}>Отмена</button>
              </form>
            ) : (
              <>
                <span className="cfg-main">
                  <b>{row.lastName} {row.firstName}</b>
                  <small>{[(row.roles ?? []).map((role) => role.name).join(', '), row.specialization, row.email].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="cfg-state" data-off={off(row.status) || undefined}>{off(row.status) ? 'в архиве, вход закрыт' : `${staffWeekLabel(row)}${row.commission ? ` · ${row.commission}%` : ''}`}</span>
                <span className="cfg-actions">
                  <button className="sd-btn-ghost" type="button" aria-expanded={hoursFor === row.id} onClick={() => setHoursFor(hoursFor === row.id ? null : row.id)}>График</button>
                  <button className="sd-btn-ghost" type="button" onClick={() => { setEditing(row.id); setDraft({ firstName: row.firstName, lastName: row.lastName, specialization: row.specialization ?? '', phone: row.phone ?? '', commission: row.commission }); }}>Изменить</button>
                  <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/employees', { method: 'POST', body: JSON.stringify({ id: row.id, firstName: row.firstName, lastName: row.lastName, specialization: row.specialization, email: row.email, commission: row.commission, status: off(row.status) ? 'ACTIVE' : 'INACTIVE' }) }))}>{off(row.status) ? 'Вернуть' : 'В архив'}</button>
                </span>
              </>
            )}
            {hoursFor === row.id && editing !== row.id && <StaffHours data={data} row={row} flash={flash} onClose={() => setHoursFor(null)} />}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Roles({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  return (
    <section className="cfg-panel sd-stack">
      <header><h2>Права</h2><p className="sd-muted">Что видит и может каждая роль: себестоимость, правка закрытых визитов и прайса, максимальная скидка. Сохраняется сразу.</p></header>
      {data.roles.map((role) => (
        <article key={role.id} className="cfg-role">
          <b>{role.name}</b>
          <label>Скидка до %<input className="sd-input" type="number" defaultValue={role.maxDiscountPercent} onBlur={(event) => void flash(() => api('/config/roles', { method: 'POST', body: JSON.stringify({ ...role, maxDiscountPercent: Number(event.target.value) }) }))} /></label>
          <label><input type="checkbox" defaultChecked={role.seeCost} onChange={(event) => void flash(() => api('/config/roles', { method: 'POST', body: JSON.stringify({ ...role, seeCost: event.target.checked }) }))} /> себестоимость</label>
          <label><input type="checkbox" defaultChecked={role.editClosedVisits} onChange={(event) => void flash(() => api('/config/roles', { method: 'POST', body: JSON.stringify({ ...role, editClosedVisits: event.target.checked }) }))} /> закрытый визит</label>
          <label><input type="checkbox" defaultChecked={role.editPrice} onChange={(event) => void flash(() => api('/config/roles', { method: 'POST', body: JSON.stringify({ ...role, editPrice: event.target.checked }) }))} /> прайс</label>
          <label><input type="checkbox" defaultChecked={role.permissions.includes('org.manage')} onChange={(event) => {
            const permissions = event.target.checked ? [...new Set([...role.permissions, 'org.manage'])] : role.permissions.filter((code) => code !== 'org.manage');
            void flash(() => api('/config/roles', { method: 'POST', body: JSON.stringify({ ...role, permissions }) }));
          }} /> настройки клиники</label>
        </article>
      ))}
      <p className="sd-muted">Галочки сохраняются сразу. Администратору можно выдать «настройки клиники» — без этого раздел ему закрыт.</p>
    </section>
  );
}

function Offers({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [code, setCode] = useState('ВЕСНА10');
  return (
    <section className="cfg-panel sd-stack">
      <header><h2>Акции и напоминания</h2><p className="sd-muted">Промокоды для пациентов и правила напоминаний: кому и когда напомнить о визите или гигиене.</p></header>
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/promos', { method: 'POST', body: JSON.stringify({ code, discountPct: 10 }) })); }}>
        <input className="sd-input" value={code} onChange={(event) => setCode(event.target.value)} />
        <button className="sd-btn" type="submit">Скидка 10%</button>
      </form>
      {data.promos.map((promo) => <article key={promo.id} className="cfg-row"><b>{promo.code}</b><span>{promo.discountPct}%</span></article>)}
      <h2>Напоминания</h2>
      {data.rules.map((rule) => <article key={rule.id} className="cfg-row"><b>{rule.name}</b><span>{rule.trigger} · {rule.channel}</span></article>)}
      <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/rules', { method: 'POST', body: JSON.stringify({ name: 'Гигиена 6 месяцев', trigger: 'HYGIENE_6M', channel: 'WHATSAPP', body: '{{name}}, пора на гигиену.' }) }))}>Правило гигиены</button>
    </section>
  );
}

const REPORTS = [
  ['leads', 'Лиды'],
  ['sources', 'Источники выручки'],
  ['unfilled', 'Незаполненные карты'],
  ['warranty', 'Гарантия'],
  ['lab', 'Лаборатория'],
  ['insurance', 'ДМС'],
  ['revenue', 'Выручка'],
] as const;

function Exchange() {
  const [type, setType] = useState<(typeof REPORTS)[number][0]>('leads');
  const [token, setToken] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ keys: { token: string }[] }>('/market/exchange')
      .then((data) => setToken(data.keys[0]?.token ?? ''))
      .catch((err: Error) => setError(err.message));
  }, []);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setError('');
    setNote('');
    try {
      await work();
      setNote(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вышло');
    }
  };

  return (
    <section className="cfg-panel sd-stack">
      <header><h2>Обмен данными</h2><p className="sd-muted">Выгрузка пациентов и отчётов, ключ для внешних сервисов, заявки агрегаторов и 1С.</p></header>
      <form className="sd-card sd-inline" onSubmit={(event) => { event.preventDefault(); void run(() => downloadReport(type), 'Файл скачан'); }}>
        <select className="sd-input" aria-label="Отчёт" value={type} onChange={(event) => setType(event.target.value as (typeof REPORTS)[number][0])}>
          {REPORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button className="sd-btn" type="submit">Скачать Excel</button>
      </form>
      {note && <p className="wow-note">{note}</p>}
      {error && <p className="sd-chip danger">{error}</p>}
      <details className="sd-card">
        <summary>Ключ, агрегаторы и 1С</summary>
        <div className="sd-stack" style={{ marginTop: 10 }}>
          <p className="sd-muted">{token || 'Ключа ещё нет'}</p>
          <div className="sd-inline">
            <button className="sd-btn-ghost" type="button" onClick={() => void run(async () => {
              const key = await api<{ token: string }>('/market/keys', { method: 'POST', body: JSON.stringify({ name: 'Обмен' }) });
              setToken(key.token);
            }, 'Ключ создан')}>Новый ключ</button>
            <button className="sd-btn-ghost" type="button" onClick={() => void run(() => api('/market/aggregators/prodoctorov', { method: 'POST', body: JSON.stringify({}) }), 'Заявка ПроДокторов записана в лиды')}>ПроДокторов</button>
            <button className="sd-btn-ghost" type="button" onClick={() => void run(() => api('/market/aggregators/sber', { method: 'POST', body: JSON.stringify({}) }), 'Заявка СберЗдоровья записана в лиды')}>СберЗдоровье</button>
            <button className="sd-btn-ghost" type="button" onClick={() => void run(() => downloadJson('/market/export-1c', '1c.json'), 'Файл 1С скачан. Во внешнюю 1С ничего не ушло.')}>1С</button>
          </div>
        </div>
      </details>
    </section>
  );
}

function TwoFactor() {
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  return (
    <details className="sd-card">
      <summary>Вход с кодом</summary>
      <div className="sd-inline" style={{ marginTop: 10 }}>
        <button className="sd-btn-ghost" type="button" onClick={() => void api<{ secret: string }>('/auth/2fa/setup', { method: 'POST' }).then((row) => setSecret(row.secret))}>Секрет</button>
        {secret && <span className="sd-muted">{secret}</span>}
        <input className="sd-input" placeholder="Код" value={code} onChange={(event) => setCode(event.target.value)} />
        <button className="sd-btn-ghost" type="button" onClick={() => void api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }).then(() => setNote('Включено')).catch((err: Error) => setNote(err.message))}>Включить</button>
      </div>
      {note && <p className="sd-muted">{note}</p>}
    </details>
  );
}

function History({ rows }: { rows: Bundle['history'] }) {
  const text = useMemo(() => rows, [rows]);
  return (
    <section className="cfg-panel sd-stack">
      <header><h2>История изменений</h2><p className="sd-muted">Кто и когда менял настройки: прайс, роли, сотрудников, шаблоны.</p></header>
      {text.map((row) => (
        <article key={row.id} className="cfg-row">
          <b>{new Date(row.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
          <span>{row.email} · {row.entityType} · {row.action}</span>
          <small className="sd-muted">{JSON.stringify(row.changes)}</small>
        </article>
      ))}
      {text.length === 0 && <p className="sd-muted">Изменений пока нет. Правка прайса или роли появится здесь.</p>}
    </section>
  );
}

