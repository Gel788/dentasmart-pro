'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  brand: Record<string, string | null>;
  services: ServiceRow[];
  stock: { id: string; name: string; sku: string | null; unit: string; minStock: number; quantity: number; cost: number; isActive: boolean }[];
  planTemplates: { id: string; name: string; note: string | null; isArchived: boolean }[];
  visitTemplates: { id: string; name: string; icd10: string | null; complaints: string; diagnosis: string; treatment: string; recommendations: string; isArchived: boolean }[];
  documents: { id: string; kind: string; name: string; body: string; isArchived: boolean }[];
  employees: { id: string; firstName: string; lastName: string; specialization: string | null; phone: string | null; email: string; commission: number; status?: string; schedule: { dayOfWeek: number }[] }[];
  cabinets: { id: string; name: string; isActive: boolean }[];
  roles: { id: string; name: string; code: string; seeCost: boolean; maxDiscountPercent: number; editClosedVisits: boolean; editPrice: boolean; seeAllFinance: boolean; canExport: boolean; permissions: string[] }[];
  permissions: { code: string; description: string | null }[];
  promos: { id: string; code: string; discountPct: number; isActive: boolean }[];
  rules: { id: string; name: string; trigger: string; channel: string; body: string; isActive: boolean }[];
  history: { id: string; at: string; email: string; entityType: string; action: string; changes: unknown }[];
  aiPlans?: boolean;
};

const SECTIONS = [
  ['price', 'Прайс'],
  ['stock', 'Склад'],
  ['templates', 'Шаблоны'],
  ['brand', 'Клиника'],
  ['staff', 'Сотрудники'],
  ['roles', 'Права'],
  ['offers', 'Акции'],
  ['exchange', 'Обмен'],
  ['history', 'История'],
] as const;

export function ClinicSettings() {
  const [data, setData] = useState<Bundle | null>(null);
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>('price');
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
      <div className="sd-h">
        <div>
          <h1>Настройки</h1>
          <p>Клиника, люди, склад и обмен.</p>
          <label className="jn-toggle">
            <input
              type="checkbox"
              checked={data.aiPlans !== false}
              onChange={(event) => void flash(() => api('/config/ai', { method: 'POST', body: JSON.stringify({ enabled: event.target.checked }) }))}
            />
            Быстрый план на карте пациента
          </label>
        </div>
        <input className="sd-input" placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} style={{ maxWidth: 240 }} />
      </div>
      {notice && <p className="wow-note">{notice}</p>}
      {error && <p className="sd-chip danger">{error}</p>}
      <div className="cfg-layout">
        <nav>
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={section === id ? 'on' : ''} type="button" onClick={() => setSection(id)}>{label}</button>
          ))}
        </nav>
        <div>
          {section === 'price' && <Price data={data} query={q} flash={flash} />}
          {section === 'stock' && <Stock data={data} query={q} flash={flash} />}
          {section === 'templates' && <Templates data={data} query={q} flash={flash} />}
          {section === 'brand' && <Brand data={data} flash={flash} />}
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
    <section className="sd-card sd-stack">
      <h2>Прайс на своём экране</h2>
      <p className="sd-muted">{count} услуг. Название, код, цена, длительность и набор расходников правятся там.</p>
      <Link className="sd-btn" href="/price" style={{ width: 'fit-content' }}>Открыть прайс</Link>
    </section>
  );
}

function Stock({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', quantity: 0, cost: 0 });
  const rows = data.stock.filter((row) => row.isActive !== false && (!query || row.name.toLowerCase().includes(query)));
  return (
    <section className="sd-stack">
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/stock', { method: 'POST', body: JSON.stringify({ name, unit: 'шт', minStock: 5, quantity: 10, cost: 100 }) })); setName(''); }}>
        <input className="sd-input" placeholder="Новый материал" value={name} onChange={(event) => setName(event.target.value)} required />
        <button className="sd-btn" type="submit">Приход 10 шт</button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="cfg-row">
          {editing === row.id ? (
            <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/stock', { method: 'POST', body: JSON.stringify({ id: row.id, name: draft.name, quantity: draft.quantity, cost: draft.cost }) })).then((ok) => { if (ok) setEditing(null); }); }}>
              <input className="sd-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
              <input className="sd-input" type="number" aria-label="Количество" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} />
              <input className="sd-input" type="number" aria-label="Закупка" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: Number(event.target.value) })} />
              <button className="sd-btn" type="submit">Сохранить</button>
            </form>
          ) : (
            <>
              <b>{row.name}</b>
              <span>{row.quantity} {row.unit} · закупка {formatMoney(row.cost)} · мин {row.minStock}</span>
              <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api(`/config/stock/${row.id}/receive`, { method: 'POST', body: JSON.stringify({ quantity: 1, cost: row.cost || 100 }) }))}>+1</button>
              <button className="sd-btn-ghost" type="button" onClick={() => { setEditing(row.id); setDraft({ name: row.name, quantity: row.quantity, cost: row.cost }); }}>Изменить</button>
              <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/stock', { method: 'POST', body: JSON.stringify({ id: row.id, isActive: false }) }))}>В архив</button>
            </>
          )}
        </article>
      ))}
    </section>
  );
}

function Templates({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [name, setName] = useState('Осмотр');
  const visits = data.visitTemplates.filter((row) => !query || row.name.toLowerCase().includes(query));
  return (
    <section className="sd-stack">
      <h2>Осмотры и диагнозы</h2>
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/visit-templates', { method: 'POST', body: JSON.stringify({ name, icd10: 'K02.1', complaints: 'Реакция на сладкое', diagnosis: 'K02.1 кариес дентина', treatment: 'Пломба', recommendations: 'Контроль через полгода' }) })); }}>
        <input className="sd-input" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="sd-btn" type="submit">Шаблон приёма</button>
      </form>
      {visits.map((row) => (
        <article key={row.id} className="cfg-row">
          <b>{row.name}</b>
          <span>{row.icd10} · {row.diagnosis}</span>
          <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/visit-templates', { method: 'POST', body: JSON.stringify({ ...row, isArchived: !row.isArchived }) }))}>{row.isArchived ? 'Вернуть' : 'В архив'}</button>
        </article>
      ))}
      <h2>Планы</h2>
      {data.planTemplates.map((row) => <article key={row.id} className="cfg-row"><b>{row.name}</b><span>{row.note}</span></article>)}
      <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/plan-templates', { method: 'POST', body: JSON.stringify({ name: 'Санация двух зубов', note: 'Эконом', phasesJson: [{ title: 'Санация', items: ['Лечение кариеса'] }] }) }))}>Добавить шаблон плана</button>
      <h2>Документы</h2>
      {data.documents.filter((row) => !query || row.name.toLowerCase().includes(query)).map((row) => (
        <article key={row.id} className="cfg-row"><b>{row.name}</b><span>{row.kind}</span></article>
      ))}
      <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/documents', { method: 'POST', body: JSON.stringify({ kind: 'CONSENT', name: 'ИДС на лечение', body: 'Я, {{patient}}, согласен на лечение в {{clinic}} {{date}}.' }) }))}>Добавить ИДС</button>
    </section>
  );
}

function Brand({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState(data.brand);
  const [chair, setChair] = useState('');
  return (
    <section className="sd-stack">
      {([
        ['name', 'Название'],
        ['legalName', 'Юрлицо'],
        ['phone', 'Телефон'],
        ['email', 'Почта'],
        ['inn', 'ИНН'],
        ['ogrn', 'ОГРН'],
        ['address', 'Адрес'],
        ['logoUrl', 'Логотип'],
        ['brandColor', 'Цвет'],
        ['workHours', 'Часы'],
        ['bankName', 'Банк'],
        ['bankAccount', 'Счёт'],
        ['bik', 'БИК'],
      ] as const).map(([key, label]) => (
        <label key={key} className="sd-field">{label}
          <input className="sd-input" value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
        </label>
      ))}
      <button className="sd-btn" type="button" onClick={() => void flash(() => api('/config/brand', { method: 'POST', body: JSON.stringify(form) }))}>Сохранить реквизиты</button>
      <TwoFactor />
      <h2>Кресла</h2>
      {data.cabinets.map((cabinet) => <article key={cabinet.id} className="cfg-row"><b>{cabinet.name}</b><span>{cabinet.isActive ? 'работает' : 'архив'}</span></article>)}
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/cabinets', { method: 'POST', body: JSON.stringify({ name: chair }) })); }}>
        <input className="sd-input" placeholder="Новое кресло" value={chair} onChange={(event) => setChair(event.target.value)} />
        <button className="sd-btn-ghost" type="submit">Добавить</button>
      </form>
    </section>
  );
}

function Staff({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', specialization: 'Терапевт', commission: 30 });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', specialization: '', phone: '', commission: 0 });
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const off = (status?: string) => status === 'INACTIVE' || status === 'TERMINATED';
  const rows = data.employees.filter((row) => !query || `${row.lastName} ${row.firstName}`.toLowerCase().includes(query));
  return (
    <section className="sd-stack">
      <form className="cfg-new" onSubmit={(event) => {
        event.preventDefault();
        void flash(async () => {
          const created = await api<{ id: string; email?: string; password?: string }>('/config/employees', { method: 'POST', body: JSON.stringify({ ...form, days: [1, 2, 3, 4, 5], startsAt: '09:00', endsAt: '18:00' }) });
          if (created.password && created.email) setIssued({ email: created.email, password: created.password });
        }).then((ok) => { if (!ok) return;
          setForm({ firstName: '', lastName: '', email: '', specialization: 'Терапевт', commission: 30 });
        });
      }}>
        <label>Имя<input className="sd-input" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required /></label>
        <label>Фамилия<input className="sd-input" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required /></label>
        <label>Почта<input className="sd-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
        <button className="sd-btn" type="submit">Врач, пн–пт</button>
      </form>
      {issued && (
        <p className="sd-chip info" role="status">
          Вход для {issued.email}: пароль <b className="sd-mono">{issued.password}</b>. Он показан один раз — передайте его сотруднику, после входа пароль лучше сменить.
          <button className="sd-btn-ghost" type="button" onClick={() => setIssued(null)}>Скрыть</button>
        </p>
      )}
      {rows.map((row) => (
        <article key={row.id} className={`cfg-row${off(row.status) ? ' off' : ''}`}>
          {editing === row.id ? (
            <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/employees', { method: 'POST', body: JSON.stringify({ id: row.id, ...draft, email: row.email }) })).then((ok) => { if (ok) setEditing(null); }); }}>
              <label>Фамилия<input className="sd-input" value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} required /></label>
              <label>Имя<input className="sd-input" value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} required /></label>
              <label>Специализация<input className="sd-input" value={draft.specialization} onChange={(event) => setDraft({ ...draft, specialization: event.target.value })} /></label>
              <label>Телефон<input className="sd-input" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
              <label>Процент<input className="sd-input" type="number" value={draft.commission} onChange={(event) => setDraft({ ...draft, commission: Number(event.target.value) })} /></label>
              <button className="sd-btn" type="submit">Сохранить</button>
            </form>
          ) : (
            <>
              <b>{row.lastName} {row.firstName}</b>
              <span>{row.specialization} · {row.email} · {row.commission}% · смен {row.schedule.length}{off(row.status) ? ' · в архиве, вход закрыт' : ''}</span>
              <button className="sd-btn-ghost" type="button" onClick={() => { setEditing(row.id); setDraft({ firstName: row.firstName, lastName: row.lastName, specialization: row.specialization ?? '', phone: row.phone ?? '', commission: row.commission }); }}>Изменить</button>
              <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api('/config/employees', { method: 'POST', body: JSON.stringify({ id: row.id, firstName: row.firstName, lastName: row.lastName, specialization: row.specialization, email: row.email, commission: row.commission, status: off(row.status) ? 'ACTIVE' : 'INACTIVE' }) }))}>{off(row.status) ? 'Вернуть' : 'В архив'}</button>
            </>
          )}
        </article>
      ))}
    </section>
  );
}

function Roles({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<boolean> }) {
  return (
    <section className="sd-stack">
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
    <section className="sd-stack">
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
    <section className="sd-stack">
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
    <section className="sd-stack">
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

