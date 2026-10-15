'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Norm = { itemId: string; name?: string; quantity: number };
type ServiceRow = {
  id: string;
  parentId: string | null;
  code: string | null;
  name: string;
  price: number;
  durationMin: number;
  isActive: boolean;
  isCategory: boolean;
  norms: Norm[];
};
type Stock = { id: string; name: string };
type Draft = {
  id: string;
  name: string;
  code: string;
  price: number;
  durationMin: number;
  parentId: string;
  itemId: string;
  quantity: number;
};

const emptyDraft = (): Draft => ({ id: '', name: '', code: '', price: 5500, durationMin: 60, parentId: '', itemId: '', quantity: 1 });

export default function PricePage() {
  return <Protected><Book /></Protected>;
}

function Book() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [categoryName, setCategoryName] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = () => api<{ services: ServiceRow[]; stock: Stock[] }>('/config')
    .then((data) => { setServices(data.services); setStock(data.stock); })
    .catch((err: Error) => setError(err.message));

  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => services.filter((row) => row.isCategory || (!row.parentId && !row.code)), [services]);
  const groups = useMemo(() => {
    const named = categories.map((category) => ({
      category,
      items: services.filter((row) => row.parentId === category.id && (showArchive || row.isActive)),
    }));
    const loose = services.filter((row) => !row.isCategory && row.code && !row.parentId && (showArchive || row.isActive));
    return { named, loose };
  }, [categories, services, showArchive]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/config/services', {
        method: 'POST',
        body: JSON.stringify({
          id: draft.id || undefined,
          name: draft.name,
          code: draft.code,
          price: draft.price,
          durationMin: draft.durationMin,
          parentId: draft.parentId || null,
          norms: draft.itemId ? [{ itemId: draft.itemId, quantity: draft.quantity || 1 }] : [],
        }),
      });
      setNotice(draft.id ? 'Услуга обновлена' : 'Услуга добавлена в прайс');
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
    }
  };

  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    await api('/config/services', { method: 'POST', body: JSON.stringify({ name: categoryName.trim(), price: 0, durationMin: 0 }) });
    setCategoryName('');
    setNotice('Категория добавлена');
    await load();
  };

  const archive = async (row: ServiceRow) => {
    await api(`/config/services/${row.id}/archive`, { method: 'POST', body: JSON.stringify({ active: !row.isActive }) });
    setNotice(row.isActive ? 'Услуга в архиве' : 'Услуга возвращена в прайс');
    await load();
  };

  const edit = (row: ServiceRow) => {
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      price: row.price,
      durationMin: row.durationMin,
      parentId: row.parentId ?? '',
      itemId: row.norms[0]?.itemId ?? '',
      quantity: row.norms[0]?.quantity ?? 1,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="sd-stack price-book">
      <div className="sd-h">
        <div>
          <h1>Прайс</h1>
          <p>Категории и услуги. Цена, код, длительность и набор расходников меняются здесь, без настроек.</p>
        </div>
        <button className="sd-btn-ghost" type="button" onClick={() => setShowArchive((value) => !value)}>{showArchive ? 'Скрыть архив' : 'Показать архив'}</button>
      </div>
      {notice && <p className="wow-note">{notice}</p>}
      {error && <p className="sd-chip danger">{error}</p>}

      <form className="sd-card sd-stack" onSubmit={save}>
        <strong>{draft.id ? 'Изменить услугу' : 'Новая услуга'}</strong>
        <div className="price-fields">
          <label>Название<input className="sd-input" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Код<input className="sd-input" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="CARIES" /></label>
          <label>Цена, ₽<input className="sd-input" type="number" min={0} required value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
          <label>Длительность, мин<input className="sd-input" type="number" min={0} required value={draft.durationMin} onChange={(event) => setDraft({ ...draft, durationMin: Number(event.target.value) })} /></label>
          <label>Категория
            <select className="sd-input" value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}>
              <option value="">Без категории</option>
              {categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label>Набор расходников
            <select className="sd-input" value={draft.itemId} onChange={(event) => setDraft({ ...draft, itemId: event.target.value })}>
              <option value="">Без набора</option>
              {stock.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Количество<input className="sd-input" type="number" min={1} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} /></label>
        </div>
        <div className="sd-inline">
          <button className="sd-btn" type="submit">{draft.id ? 'Сохранить услугу' : 'Добавить услугу'}</button>
          {draft.id && <button className="sd-btn-ghost" type="button" onClick={() => setDraft(emptyDraft())}>Отменить правку</button>}
        </div>
      </form>

      <form className="sd-inline" onSubmit={addCategory}>
        <input className="sd-input" placeholder="Новая категория, например Терапия" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
        <button className="sd-btn-ghost" type="submit">Добавить категорию</button>
      </form>

      {groups.named.map(({ category, items }) => (
        <section key={category.id} className="sd-card sd-stack">
          <div className="sd-inline">
            <h2>{category.name}</h2>
            <span className="sd-muted">{items.length} услуг</span>
          </div>
          {items.length === 0 && <p className="sd-muted">В категории пока нет услуг.</p>}
          {items.map((row) => <ServiceLine key={row.id} row={row} onEdit={() => edit(row)} onArchive={() => archive(row)} />)}
        </section>
      ))}
      {groups.loose.length > 0 && (
        <section className="sd-card sd-stack">
          <h2>Без категории</h2>
          {groups.loose.map((row) => <ServiceLine key={row.id} row={row} onEdit={() => edit(row)} onArchive={() => archive(row)} />)}
        </section>
      )}
    </div>
  );
}

function ServiceLine({ row, onEdit, onArchive }: { row: ServiceRow; onEdit: () => void; onArchive: () => void }) {
  const kit = row.norms.map((norm) => `${norm.name ?? 'материал'} ×${norm.quantity}`).join(', ');
  return (
    <article className={`price-line ${row.isActive ? '' : 'off'}`}>
      <div>
        <b>{row.name}</b>
        <p className="sd-muted">{row.code || 'без кода'} · {row.durationMin} мин · {kit || 'без набора расходников'}</p>
      </div>
      <strong>{formatMoney(row.price)}</strong>
      <button className="sd-btn-ghost" type="button" onClick={onEdit}>Изменить</button>
      <button className="sd-btn-ghost" type="button" onClick={onArchive}>{row.isActive ? 'В архив' : 'Вернуть'}</button>
    </article>
  );
}
