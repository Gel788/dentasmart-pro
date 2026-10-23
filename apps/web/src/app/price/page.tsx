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
  const [namingCategory, setNamingCategory] = useState(false);
  const [percent, setPercent] = useState(10);
  const [showArchive, setShowArchive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = () => api<{ services: ServiceRow[]; stock: Stock[] }>('/config')
    .then((data) => { setServices(data.services); setStock(data.stock); })
    .catch((err: Error) => setError(err.message));

  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => services.filter((row) => row.isCategory && row.isActive), [services]);
  const groups = useMemo(() => {
    const named = categories.map((category) => ({
      category,
      items: services.filter((row) => !row.isCategory && row.parentId === category.id && (showArchive || row.isActive)),
    }));
    const known = new Set(categories.map((row) => row.id));
    const loose = services.filter((row) => !row.isCategory && (!row.parentId || !known.has(row.parentId)) && (showArchive || row.isActive));
    return { named, loose };
  }, [categories, services, showArchive]);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; moveTo: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (job: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try { await job(); setNotice(done); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не получилось'); }
    finally { setBusy(false); }
  };
  const renameCategory = (id: string, name: string) => run(async () => {
    await api(`/config/categories/${id}`, { method: 'POST', body: JSON.stringify({ name }) });
    setRenaming(null);
  }, 'Категория переименована');
  const removeCategory = (id: string, moveTo: string, count: number) => run(async () => {
    await api(`/config/categories/${id}/delete`, { method: 'POST', body: JSON.stringify({ moveTo: moveTo || null }) });
    setRemoving(null);
  }, count ? `Категория удалена, услуги перенесены${moveTo ? '' : ' в «Без категории»'}` : 'Категория удалена');

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
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не сохранилось');
    }
  };

  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    await run(async () => {
      await api('/config/categories', { method: 'POST', body: JSON.stringify({ name: categoryName.trim() }) });
      setCategoryName('');
      setNamingCategory(false);
    }, 'Категория добавлена');
  };

  const downloadPrice = async () => {
    const file = await api<{ filename: string; csv: string }>('/config/services/export');
    const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const archive = async (row: ServiceRow) => {
    await api(`/config/services/${row.id}/archive`, { method: 'POST', body: JSON.stringify({ active: !row.isActive }) });
    setNotice(row.isActive ? 'Услуга в архиве' : 'Услуга возвращена в прайс');
    setDraft(emptyDraft());
    setAdding(false);
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
    setAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const composing = adding || Boolean(draft.id);
  const listed = groups.named;

  return (
    <div className="sd-stack price-book">
      <div className="sd-h">
        <div>
          <h1>Прайс</h1>
          <p>{ruServices(services.filter((row) => row.code && row.isActive).length)} в прайсе.</p>
        </div>
        <div className="sd-inline">
          <button className="sd-btn-ghost" type="button" onClick={() => setNamingCategory((value) => !value)}>Новая категория</button>
          {!composing && <button className="sd-btn" type="button" onClick={() => { setDraft(emptyDraft()); setAdding(true); }}>Добавить услугу</button>}
        </div>
      </div>
      {notice && <p className="wow-note">{notice}</p>}
      {error && <p className="sd-chip danger">{error}</p>}

      {composing && <form className="sd-card sd-stack price-composer" onSubmit={save}>
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
          <button className="sd-btn-ghost" type="button" onClick={() => { setDraft(emptyDraft()); setAdding(false); setNamingCategory(false); }}>Закрыть</button>
          {draft.id && <button className="sd-btn-ghost" type="button" onClick={() => { const row = services.find((item) => item.id === draft.id); if (row) void archive(row); }}>{services.find((item) => item.id === draft.id)?.isActive ? 'В архив' : 'Вернуть'}</button>}
        </div>
      </form>}
      {namingCategory && (
        <form className="sd-card sd-inline price-composer" onSubmit={addCategory}>
          <input className="sd-input" placeholder="Название категории, например «Терапия»" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} autoFocus maxLength={120} />
          <button className="sd-btn" type="submit" disabled={busy || !categoryName.trim()}>Добавить категорию</button>
          <button className="sd-btn-ghost" type="button" onClick={() => { setNamingCategory(false); setCategoryName(''); }}>Отмена</button>
        </form>
      )}

      <details className="sd-card">
        <summary>Цены пакетом и Excel</summary>
        <div className="sd-inline" style={{ marginTop: 10 }}>
          <input className="sd-input" type="number" value={percent} onChange={(event) => setPercent(Number(event.target.value))} aria-label="Процент изменения цен" />
          <button className="sd-btn-ghost" type="button" onClick={() => void api('/config/services/bulk', { method: 'POST', body: JSON.stringify({ percent }) }).then(() => { setNotice(`Цены сдвинуты на ${percent}%`); return load(); }).catch((err: Error) => setError(err.message))}>Применить {percent}%</button>
          <button className="sd-btn-ghost" type="button" onClick={() => downloadPrice().catch((err: Error) => setError(err.message))}>Скачать Excel</button>
          <button className="sd-btn-ghost" type="button" onClick={() => setShowArchive((value) => !value)}>{showArchive ? 'Скрыть архив' : 'Показать архив'}</button>
        </div>
      </details>

      {listed.map(({ category, items }) => (
        <section key={category.id} className="sd-card sd-stack price-cat">
          {renaming?.id === category.id ? (
            <form className="price-cat-head" onSubmit={(event) => { event.preventDefault(); if (renaming.name.trim()) void renameCategory(category.id, renaming.name.trim()); }}>
              <input className="sd-input" aria-label="Новое название категории" value={renaming.name} onChange={(event) => setRenaming({ id: category.id, name: event.target.value })} autoFocus maxLength={120} onKeyDown={(event) => { if (event.key === 'Escape') setRenaming(null); }} />
              <button className="sd-btn" type="submit" disabled={busy || !renaming.name.trim()}>Сохранить</button>
              <button className="sd-btn-ghost" type="button" onClick={() => setRenaming(null)}>Отмена</button>
            </form>
          ) : (
            <div className="price-cat-head">
              <h2>{category.name}</h2>
              <span className="sd-muted">{ruServices(items.length)}</span>
              <span className="price-cat-acts">
                <button className="price-link" type="button" onClick={() => { setRemoving(null); setRenaming({ id: category.id, name: category.name }); }}>Переименовать</button>
                <button className="price-link danger" type="button" onClick={() => { setRenaming(null); setRemoving({ id: category.id, moveTo: '' }); }}>Удалить</button>
              </span>
            </div>
          )}
          {removing?.id === category.id && (
            <div className="price-cat-remove" role="alertdialog" aria-label={`Удалить категорию ${category.name}`}>
              {items.length > 0 ? (
                <label>В категории {ruServices(items.length)}. Куда их перенести?
                  <select className="sd-input" value={removing.moveTo} onChange={(event) => setRemoving({ id: category.id, moveTo: event.target.value })}>
                    <option value="">Без категории</option>
                    {categories.filter((row) => row.id !== category.id).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </label>
              ) : <p>Категория пустая — удалить её?</p>}
              <div className="sd-inline">
                <button className="sd-btn-ghost" type="button" onClick={() => setRemoving(null)}>Отмена</button>
                <button className="sd-btn price-danger" type="button" disabled={busy} onClick={() => void removeCategory(category.id, removing.moveTo, items.length)}>Удалить категорию</button>
              </div>
            </div>
          )}
          {items.map((row) => <ServiceLine key={row.id} row={row} onEdit={() => edit(row)} />)}
          {items.length === 0 && <p className="sd-muted price-cat-empty">Пусто. Добавьте услугу и выберите эту категорию.</p>}
        </section>
      ))}
      {listed.length === 0 && groups.loose.length === 0 && (
        <div className="sd-empty sd-card">
          <span className="sd-empty-mark" />
          <b>Прайс ещё пуст</b>
          <p className="sd-muted">Добавьте первую услугу — цена и длительность появятся в записи.</p>
        </div>
      )}
      {groups.loose.length > 0 && (
        <section className="sd-card sd-stack">
          <h2>Без категории</h2>
          {groups.loose.map((row) => <ServiceLine key={row.id} row={row} onEdit={() => edit(row)} />)}
        </section>
      )}
    </div>
  );
}

function ruServices(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'услуга' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'услуги' : 'услуг';
  return `${n} ${word}`;
}

function ServiceLine({ row, onEdit }: { row: ServiceRow; onEdit: () => void }) {
  const kit = row.norms.map((norm) => `${norm.name ?? 'материал'} ×${norm.quantity}`).join(', ');
  return (
    <button type="button" className={`price-line ${row.isActive ? '' : 'off'}`} onClick={onEdit}>
      <span>
        <b>{row.name}</b>
        <p className="sd-muted">{row.code || 'без кода'} · {row.durationMin} мин · {kit || 'без набора расходников'}</p>
      </span>
      <strong>{formatMoney(row.price)}</strong>
    </button>
  );
}
