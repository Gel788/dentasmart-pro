'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import styles from './line-tools.module.css';

type Line = { id: string; planId: string; title: string; toothNum: number | null; price: number; qty?: number; unitPrice?: number; discountPercent?: number; doneHere: boolean; status: string };

const fdi = (tooth: number) => {
  const quadrant = Math.floor(tooth / 10);
  const unit = tooth % 10;
  return (quadrant >= 1 && quadrant <= 4 && unit >= 1 && unit <= 8) || (quadrant >= 5 && quadrant <= 8 && unit >= 1 && unit <= 5);
};

/** The visit's plan line, fixed right at the chair: its tooth, its price, or removed if added by mistake. */
export function ToothButton({ line, enabled, onSaved }: { line: Line; enabled: boolean; onSaved: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(line.toothNum ? String(line.toothNum) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!enabled || line.doneHere || line.status === 'DONE') return <span className={styles.tooth}>{line.toothNum ?? '—'}</span>;
  const save = async (raw: string) => {
    const tooth = raw.trim() ? Number(raw) : null;
    if (tooth !== null && !fdi(tooth)) { setError('Зуб по FDI: 11–48, детские 51–85'); return; }
    setBusy(true);
    setError('');
    try {
      await api(`/workspace/plans/${line.planId}/items/${line.id}`, { method: 'POST', body: JSON.stringify({ toothNum: tooth }) });
      setOpen(false);
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Не сохранилось'); }
    finally { setBusy(false); }
  };
  return (
    <span className={styles.toothWrap}>
      <button type="button" className={`${styles.tooth} ${styles.toothBtn}`} onClick={(event) => { event.preventDefault(); setValue(line.toothNum ? String(line.toothNum) : ''); setOpen((now) => !now); }} aria-label={line.toothNum ? `Зуб ${line.toothNum}, изменить` : 'Указать зуб'} title={line.toothNum ? 'Изменить зуб' : 'Указать зуб'}>
        {line.toothNum ?? '+зуб'}
      </button>
      {open && (
        <span className={styles.pop} onClick={(event) => event.preventDefault()}>
          <input aria-label={`Зуб для ${line.title}`} inputMode="numeric" maxLength={2} value={value} placeholder="36" autoFocus
            onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(value); } if (event.key === 'Escape') setOpen(false); }} />
          <button type="button" className="sd-btn" disabled={busy} onClick={() => void save(value)}>OK</button>
          {line.toothNum != null && <button type="button" className="sd-btn-ghost" disabled={busy} onClick={() => void save('')}>Без зуба</button>}
          {error && <em>{error}</em>}
        </span>
      )}
    </span>
  );
}

export function LineActions({ line, enabled, onSaved }: { line: Line; enabled: boolean; onSaved: () => Promise<unknown> }) {
  const [mode, setMode] = useState<'idle' | 'price' | 'remove'>('idle');
  const [qty, setQty] = useState(String(line.qty ?? 1));
  const [unit, setUnit] = useState(String(line.unitPrice ?? line.price));
  const [discount, setDiscount] = useState(String(line.discountPercent ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!enabled || line.doneHere || line.status === 'DONE') return null;
  const num = (value: string) => Number(value.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  const q = Math.max(1, Math.min(99, Math.round(num(qty)) || 1));
  const u = Math.max(0, num(unit));
  const d = Math.min(100, Math.max(0, num(discount)));
  const total = Math.round(u * q * (1 - d / 100) * 100) / 100;
  const run = async (job: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await job(); setMode('idle'); await onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не получилось'); }
    finally { setBusy(false); }
  };
  const open = (next: 'price' | 'remove') => {
    setQty(String(line.qty ?? 1)); setUnit(String(line.unitPrice ?? line.price)); setDiscount(String(line.discountPercent ?? 0));
    setError(''); setMode(next);
  };
  return (
    <div className={styles.actions}>
      {mode === 'idle' && (
        <>
          <button type="button" className={styles.link} onClick={() => open('price')}>Цена</button>
          <button type="button" className={`${styles.link} ${styles.danger}`} onClick={() => open('remove')}>Удалить</button>
        </>
      )}
      {mode === 'price' && (
        <form className={styles.edit} onSubmit={(event) => { event.preventDefault(); void run(() => api(`/workspace/plans/${line.planId}/items/${line.id}`, { method: 'POST', body: JSON.stringify({ qty: q, unitPrice: u, discountPercent: d }) })); }}>
          <label>Кол-во<input inputMode="numeric" value={qty} onChange={(event) => setQty(event.target.value)} aria-label={`Количество ${line.title}`} autoFocus /></label>
          <label>Цена, ₽<input inputMode="decimal" value={unit} onChange={(event) => setUnit(event.target.value)} aria-label={`Цена ${line.title}`} /></label>
          <label>Скидка %<input inputMode="numeric" value={discount} onChange={(event) => setDiscount(event.target.value)} aria-label={`Скидка ${line.title}`} /></label>
          <span className={styles.sum}>Итого: <b>{formatMoney(total)}</b>{d >= 30 && <em> · скидка {d}% — проверьте</em>}</span>
          <span className={styles.buttons}>
            <button type="button" className="sd-btn-ghost" onClick={() => setMode('idle')} disabled={busy}>Отмена</button>
            <button type="submit" className="sd-btn" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
          </span>
        </form>
      )}
      {mode === 'remove' && (
        <span className={styles.ask}>Удалить «{line.title}» из плана?
          <button type="button" className={styles.yes} disabled={busy} onClick={() => void run(() => api(`/workspace/plans/${line.planId}/items/${line.id}/remove`, { method: 'POST' }))}>{busy ? '…' : 'Удалить'}</button>
          <button type="button" className={styles.link} onClick={() => setMode('idle')}>Нет</button>
        </span>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
