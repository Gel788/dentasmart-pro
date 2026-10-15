'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { readTable } from '@/lib/sheet';

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
  employees: { id: string; firstName: string; lastName: string; specialization: string | null; phone: string | null; email: string; commission: number; schedule: { dayOfWeek: number }[] }[];
  cabinets: { id: string; name: string; isActive: boolean }[];
  roles: { id: string; name: string; code: string; seeCost: boolean; maxDiscountPercent: number; editClosedVisits: boolean; editPrice: boolean; seeAllFinance: boolean; canExport: boolean; permissions: string[] }[];
  permissions: { code: string; description: string | null }[];
  promos: { id: string; code: string; discountPct: number; isActive: boolean }[];
  rules: { id: string; name: string; trigger: string; channel: string; body: string; isActive: boolean }[];
  history: { id: string; at: string; email: string; entityType: string; action: string; changes: unknown }[];
};

const SECTIONS = [
  ['price', 'Прайс'],
  ['stock', 'Склад'],
  ['templates', 'Шаблоны'],
  ['brand', 'Клиника'],
  ['staff', 'Сотрудники'],
  ['roles', 'Права'],
  ['offers', 'Акции'],
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
    }
  };

  if (error && !data) return <p className="sd-chip danger">{error}</p>;
  if (!data) return <div className="sd-skel" style={{ height: 240 }} />;
  const q = query.trim().toLowerCase();
  return (
    <div className="cfg">
      <header className="wow-head">
        <div>
          <p className="wow-kicker">Владелец настраивает клинику сам</p>
          <h1>Настройки</h1>
        </div>
        <input className="sd-input" placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} />
      </header>
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
          {section === 'history' && <History rows={data.history} />}
        </div>
      </div>
    </div>
  );
}

function Price({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<void> }) {
  const [draft, setDraft] = useState({ name: '', code: '', price: 5500, durationMin: 60, parentId: '', requiresTooth: true, surfaceMode: 'SURFACES', doctorPercent: 30, itemId: '', quantity: 1 });
  const [percent, setPercent] = useState(10);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const rows = data.services.filter((row) => !query || `${row.name} ${row.code ?? ''}`.toLowerCase().includes(query));
  const categories = data.services.filter((row) => !row.parentId);
  const save = (row: ServiceRow, patch: Partial<ServiceRow> & { norms?: Norm[] }) => flash(() => api('/config/services', {
    method: 'POST',
    body: JSON.stringify({ id: row.id, name: patch.name ?? row.name, code: patch.code ?? row.code, price: patch.price ?? row.price, durationMin: patch.durationMin ?? row.durationMin, parentId: patch.parentId ?? row.parentId, requiresTooth: patch.requiresTooth ?? row.requiresTooth, surfaceMode: patch.surfaceMode ?? row.surfaceMode, doctorPercent: patch.doctorPercent ?? row.doctorPercent, norms: patch.norms ?? row.norms }),
  }));
  return (
    <section className="sd-stack">
      <div className="cfg-bar">
        <input className="sd-input" type="number" value={percent} onChange={(event) => setPercent(Number(event.target.value))} />
        <button className="sd-btn" type="button" onClick={() => void flash(() => api('/config/services/bulk', { method: 'POST', body: JSON.stringify({ percent, ids: Object.entries(picked).filter(([, on]) => on).map(([id]) => id) }) }))}>Изменить цены на {percent}%</button>
        <button className="sd-btn-ghost" type="button" onClick={() => void api<{ csv: string; filename: string }>('/config/services/export').then((file) => download(file.filename, file.csv))}>Excel / CSV</button>
        <label className="sd-btn-ghost">Импорт<input type="file" accept=".csv,.txt,.xlsx" hidden onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void readTable(file).then((sheet) => {
            const rows = sheet.rows.map((cells) => {
              const map = Object.fromEntries(sheet.headers.map((header, index) => [header.toLowerCase(), cells[index] ?? '']));
              return {
                category: map['категория'] || map['category'],
                code: map['код'] || map['code'],
                name: map['название'] || map['name'],
                price: Number(map['цена'] || map['price'] || 0),
                durationMin: Number(map['минуты'] || map['duration'] || 30),
                requiresTooth: (map['зуб'] || '').startsWith('д'),
                surfaceMode: map['поверхности'] || 'NONE',
                doctorPercent: Number(map['% врача'] || 0),
              };
            });
            return flash(() => api('/config/services/import', { method: 'POST', body: JSON.stringify({ rows }) }));
          });
        }} /></label>
      </div>
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/services', { method: 'POST', body: JSON.stringify({ ...draft, parentId: draft.parentId || null, norms: draft.itemId ? [{ itemId: draft.itemId, quantity: draft.quantity }] : [] }) })); }}>
        <label>Название<input className="sd-input" placeholder="Новая услуга" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label>Код<input className="sd-input" placeholder="Код" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label>
        <label>Цена<input className="sd-input" type="number" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
        <label>Минуты<input className="sd-input" type="number" value={draft.durationMin} onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })} /></label>
        <label>Категория<select value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}>
          <option value="">Категория</option>
          {categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <label>Набор расходников<select value={draft.itemId} onChange={(event) => setDraft({ ...draft, itemId: event.target.value })}>
          <option value="">Расходник</option>
          {data.stock.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <button className="sd-btn" type="submit">Добавить</button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className={`cfg-row ${row.isActive ? '' : 'off'}`}>
          <input type="checkbox" checked={!!picked[row.id]} onChange={(event) => setPicked({ ...picked, [row.id]: event.target.checked })} />
          <input className="sd-input" defaultValue={row.name} onBlur={(event) => { if (event.target.value !== row.name) void save(row, { name: event.target.value }); }} />
          <input className="sd-input" defaultValue={row.code ?? ''} onBlur={(event) => void save(row, { code: event.target.value })} />
          <input className="sd-input" type="number" defaultValue={row.price} onBlur={(event) => void save(row, { price: Number(event.target.value) })} />
          <span className="sd-muted">{row.durationMin} мин · {row.doctorPercent}% · {row.norms.map((norm) => `${norm.name} ×${norm.quantity}`).join(', ') || 'без набора'}</span>
          <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api(`/config/services/${row.id}/archive`, { method: 'POST', body: JSON.stringify({ active: !row.isActive }) }))}>{row.isActive ? 'В архив' : 'Вернуть'}</button>
        </article>
      ))}
    </section>
  );
}

function Stock({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState('');
  const rows = data.stock.filter((row) => !query || row.name.toLowerCase().includes(query));
  return (
    <section className="sd-stack">
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/stock', { method: 'POST', body: JSON.stringify({ name, unit: 'шт', minStock: 5, quantity: 10, cost: 100 }) })); setName(''); }}>
        <input className="sd-input" placeholder="Новый материал" value={name} onChange={(event) => setName(event.target.value)} required />
        <button className="sd-btn" type="submit">Приход 10 шт</button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="cfg-row">
          <b>{row.name}</b>
          <span>{row.quantity} {row.unit} · закупка {formatMoney(row.cost)} · мин {row.minStock}</span>
          <button className="sd-btn-ghost" type="button" onClick={() => void flash(() => api(`/config/stock/${row.id}/receive`, { method: 'POST', body: JSON.stringify({ quantity: 1, cost: row.cost || 100 }) }))}>+1</button>
        </article>
      ))}
    </section>
  );
}

function Templates({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<void> }) {
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

function Brand({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<void> }) {
  const [form, setForm] = useState(data.brand);
  const [chair, setChair] = useState('');
  return (
    <section className="sd-stack">
      {(['name', 'legalName', 'phone', 'email', 'inn', 'ogrn', 'address', 'logoUrl', 'brandColor', 'workHours', 'bankName', 'bankAccount', 'bik'] as const).map((key) => (
        <label key={key} className="sd-field">{key}
          <input className="sd-input" value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
        </label>
      ))}
      <button className="sd-btn" type="button" onClick={() => void flash(() => api('/config/brand', { method: 'POST', body: JSON.stringify(form) }))}>Сохранить реквизиты</button>
      <h2>Кресла</h2>
      {data.cabinets.map((cabinet) => <article key={cabinet.id} className="cfg-row"><b>{cabinet.name}</b><span>{cabinet.isActive ? 'работает' : 'архив'}</span></article>)}
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/cabinets', { method: 'POST', body: JSON.stringify({ name: chair }) })); }}>
        <input className="sd-input" placeholder="Новое кресло" value={chair} onChange={(event) => setChair(event.target.value)} />
        <button className="sd-btn" type="submit">Добавить</button>
      </form>
    </section>
  );
}

function Staff({ data, query, flash }: { data: Bundle; query: string; flash: (work: () => Promise<unknown>) => Promise<void> }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', specialization: 'Терапевт', commission: 30 });
  const rows = data.employees.filter((row) => !query || `${row.lastName} ${row.firstName}`.toLowerCase().includes(query));
  return (
    <section className="sd-stack">
      <form className="cfg-new" onSubmit={(event) => { event.preventDefault(); void flash(() => api('/config/employees', { method: 'POST', body: JSON.stringify({ ...form, days: [1, 2, 3, 4, 5], startsAt: '09:00', endsAt: '18:00' }) })); }}>
        <input className="sd-input" placeholder="Имя" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required />
        <input className="sd-input" placeholder="Фамилия" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required />
        <input className="sd-input" placeholder="Почта" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <button className="sd-btn" type="submit">Врач, пн–пт</button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="cfg-row">
          <b>{row.lastName} {row.firstName}</b>
          <span>{row.specialization} · {row.email} · {row.commission}% · смен {row.schedule.length}</span>
          <input className="sd-input" type="number" defaultValue={row.commission} onBlur={(event) => void flash(() => api('/config/employees', { method: 'POST', body: JSON.stringify({ id: row.id, firstName: row.firstName, lastName: row.lastName, specialization: row.specialization, commission: Number(event.target.value) }) }))} />
        </article>
      ))}
    </section>
  );
}

function Roles({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<void> }) {
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

function Offers({ data, flash }: { data: Bundle; flash: (work: () => Promise<unknown>) => Promise<void> }) {
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

function download(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
