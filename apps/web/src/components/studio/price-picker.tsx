'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { serviceKit, type NormLine } from '@/lib/service-kit';

const RECENT = 'sd.price.recent';

export type PriceService = {
  id: string;
  name: string;
  code: string | null;
  price: number;
  parentId: string | null;
  norms: NormLine[];
};

type PhaseOption = { id: string; title: string };

type RawService = {
  id: string;
  name: string;
  code?: string | null;
  price?: number;
  parentId?: string | null;
  isCategory?: boolean;
  isActive?: boolean;
  norms?: NormLine[];
};

export function PricePicker({
  tooth,
  phases,
  phaseId,
  onClose,
  onPick,
}: {
  tooth: number | null;
  phases: PhaseOption[];
  phaseId: string;
  onClose: () => void;
  onPick: (service: PriceService, phaseId: string) => Promise<void>;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [services, setServices] = useState<PriceService[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [phase, setPhase] = useState(phaseId);
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPhase(phaseId); }, [phaseId]);

  useEffect(() => {
    searchRef.current?.focus();
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT) || '[]');
      if (Array.isArray(saved)) setRecent(saved.filter((id) => typeof id === 'string').slice(0, 5));
    } catch {
      setRecent([]);
    }
    let live = true;
    api<{ services: RawService[] }>('/config').then((data) => {
      if (!live) return;
      const rows = data.services ?? [];
      setCategories(rows.filter((row) => row.isCategory).map((row) => ({ id: row.id, name: row.name })));
      setServices(rows.filter((row) => !row.isCategory && row.code && row.isActive !== false).map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code ?? null,
        price: Number(row.price) || 0,
        parentId: row.parentId ?? null,
        norms: row.norms ?? [],
      })));
    }).catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => services.filter((row) => {
    if (category !== 'all' && row.parentId !== category) return false;
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle) || (row.code ?? '').toLowerCase().includes(needle);
  }), [services, category, needle]);

  const recentRows = !needle && category === 'all'
    ? recent.map((id) => services.find((row) => row.id === id)).filter((row): row is PriceService => Boolean(row))
    : [];

  const choose = async (service: PriceService) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onPick(service, phase);
      const next = [service.id, ...recent.filter((id) => id !== service.id)].slice(0, 5);
      window.localStorage.setItem(RECENT, JSON.stringify(next));
      setRecent(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не добавилось');
      setBusy(false);
    }
  };

  return (
    <div className="sd-sheet-back" onMouseDown={onClose}>
      <div className="sd-sheet pp" role="dialog" aria-label={tooth ? `Услуга на зуб ${tooth}` : 'Новая услуга'} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sd-sheet-head">
          <div>
            <h2>{tooth ? `Зуб ${tooth}` : 'Новая услуга'}</h2>
            <p className="sd-muted">Комплект расходников прикрепится к строке плана.</p>
          </div>
          <button className="sd-btn-ghost" type="button" onClick={onClose}>Закрыть</button>
        </div>
        <label className="sd-field">Поиск услуги
          <input ref={searchRef} className="sd-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Кариес, коронка, гигиена" />
        </label>
        <label className="sd-field">Этап
          <select className="sd-input" value={phase} onChange={(event) => setPhase(event.target.value)}>
            {phases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <div className="pp-head">Категория</div>
        <div className="pp-cats">
          <button type="button" className={`sd-chip ${category === 'all' ? 'info' : ''}`} onClick={() => setCategory('all')}>Все</button>
          {categories.map((item) => (
            <button key={item.id} type="button" className={`sd-chip ${category === item.id ? 'info' : ''}`} onClick={() => setCategory(item.id)}>{item.name}</button>
          ))}
        </div>
        {!needle && category === 'all' && (
          <>
            <div className="pp-head">Недавние</div>
            {recentRows.length === 0 ? <p className="sd-muted">Пока пусто. Выбранные услуги запомнятся здесь.</p> : (
              <div className="pp-list">
                {recentRows.map((service) => <ServiceRow key={`recent-${service.id}`} service={service} busy={busy} onPick={choose} />)}
              </div>
            )}
          </>
        )}
        <div className="pp-head">{needle ? 'Нашлось' : 'Прайс'}</div>
        <div className="pp-list">
          {visible.length === 0 && <p className="sd-muted">В прайсе ничего не нашлось.</p>}
          {visible.map((service) => <ServiceRow key={service.id} service={service} busy={busy} onPick={choose} />)}
        </div>
        {error && <p className="pp-error">{error}</p>}
      </div>
    </div>
  );
}

function ServiceRow({ service, busy, onPick }: { service: PriceService; busy: boolean; onPick: (service: PriceService) => void }) {
  return (
    <button className="pp-row" type="button" disabled={busy} onClick={() => onPick(service)}>
      <b>{service.name}</b>
      <span>Расходники: {serviceKit(service.name, service.norms)}</span>
      <em>{formatMoney(service.price)}</em>
    </button>
  );
}
