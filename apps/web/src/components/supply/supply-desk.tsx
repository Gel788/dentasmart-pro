'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FlaskConical, Package, ShoppingCart, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateOnly, formatMoney, LAB_STATUS, label } from '@/lib/format';
import styles from './supply.module.css';

type Item = { id: string; name: string; unit: string; minStock: string | number; category: string; batches: { quantity: string | number; expiresAt?: string | null }[] };
type Purchase = { id: string; supplierName: string; status: string; orderedAt: string; expectedAt: string | null; totalAmount: string | number; lines?: { id: string; quantity: string | number; item: { name: string; unit: string } }[] };
type LabOrder = { id: string; title: string; status: string; dueAt: string | null; fittingAt: string | null; labName: string | null; costAmount: string | number | null; patient: { firstName: string; lastName: string } | null; doctor: { firstName: string; lastName: string } | null };

const PO_STATUS: Record<string, string> = { DRAFT: 'Черновик', SENT: 'Заказано', PARTIAL: 'Пришло частично', RECEIVED: 'Получено', CANCELLED: 'Отменён' };
const LAB_FLOW = ['WAITING_IMPRESSION', 'RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED'];

type Level = 'out' | 'low' | 'ok';
const LEVEL: Record<Level, string> = { out: 'Закончилось', low: 'Заканчивается', ok: 'В норме' };

/**
 * Supply at a glance: what runs out first, one tap to order it, what the suppliers are bringing, and the
 * lab's work with its due dates. Each part shows only to those allowed to see it.
 */
export function SupplyDesk() {
  const { user } = useAuth();
  const can = (perm: string) => !!user?.permissions.includes(perm);
  const [items, setItems] = useState<Item[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [lab, setLab] = useState<LabOrder[] | null>(null);
  const [error, setError] = useState('');
  const [onlyLow, setOnlyLow] = useState(true);
  const [cart, setCart] = useState<Record<string, string>>({});
  const [ordering, setOrdering] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [expected, setExpected] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [stock, orders, labOrders] = await Promise.all([
        can('warehouse.read') ? api<Item[]>('/warehouse/items') : Promise.resolve(null),
        can('warehouse.read') ? api<Purchase[]>('/warehouse/purchase-orders') : Promise.resolve([]),
        can('medical.read') ? api<LabOrder[]>('/lab/orders') : Promise.resolve(null),
      ]);
      setItems(stock);
      setPurchases(orders ?? []);
      setLab(labOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не загрузилось');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => (items ?? []).map((item) => {
    const quantity = Math.round(item.batches.reduce((sum, batch) => sum + Number(batch.quantity), 0) * 1000) / 1000;
    const min = Number(item.minStock);
    const level: Level = quantity <= 0 ? 'out' : quantity <= min ? 'low' : 'ok';
    const suggest = Math.max(1, Math.ceil(min * 2 - quantity));
    return { ...item, quantity, min, level, suggest, fill: min > 0 ? Math.min(100, Math.round((quantity / (min * 2)) * 100)) : 100 };
  }).sort((a, b) => ['out', 'low', 'ok'].indexOf(a.level) - ['out', 'low', 'ok'].indexOf(b.level) || a.name.localeCompare(b.name, 'ru')), [items]);

  const short = rows.filter((row) => row.level !== 'ok');
  const shown = onlyLow && short.length ? short : rows;
  const chosen = Object.entries(cart).filter(([, qty]) => Number(qty.replace(',', '.')) > 0);
  const today = new Date().toISOString().slice(0, 10);

  const toggle = (row: (typeof rows)[number]) => setCart((current) => {
    const next = { ...current };
    if (next[row.id] !== undefined) delete next[row.id];
    else next[row.id] = String(row.suggest);
    return next;
  });
  const orderAllShort = () => {
    setCart(Object.fromEntries(short.map((row) => [row.id, String(row.suggest)])));
    setOrdering(true);
  };
  const send = async () => {
    setSending(true);
    setError('');
    try {
      await api('/warehouse/purchase-orders', { method: 'POST', body: JSON.stringify({ supplierName: supplier, expectedAt: expected || undefined, lines: chosen.map(([itemId, qty]) => ({ itemId, quantity: Number(qty.replace(',', '.')) })) }) });
      setNotice(`Заказ отправлен: ${chosen.length} поз.${supplier ? ` · ${supplier}` : ''}`);
      setCart({});
      setOrdering(false);
      setSupplier('');
      setExpected('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Заказ не создался');
    } finally {
      setSending(false);
    }
  };

  const openLab = (lab ?? []).filter((order) => order.status !== 'DELIVERED' && order.status !== 'REJECTED')
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const lateLab = openLab.filter((order) => order.dueAt && order.dueAt.slice(0, 10) < today && order.status !== 'READY').length;
  const coming = purchases.filter((row) => row.status === 'SENT' || row.status === 'PARTIAL');

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Снабжение</h1>
          <p>Что заканчивается, что едет от поставщиков и что делает лаборатория.</p>
        </div>
        <nav className={styles.links} aria-label="Разделы снабжения">
          <Link href="/warehouse"><Package size={16} aria-hidden="true" />Склад</Link>
          <Link href="/lab"><FlaskConical size={16} aria-hidden="true" />Лаборатория</Link>
          <Link href="/sterilization">Стерилизация</Link>
        </nav>
      </header>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <div className={styles.kpis}>
        <div data-tone={short.length ? 'warn' : 'ok'}><span>Заканчивается</span><b>{items ? short.length : '—'}</b><small>{items ? `из ${rows.length} позиций` : 'нет доступа к складу'}</small></div>
        <div><span>Едет от поставщиков</span><b>{coming.length}</b><small>{coming[0]?.expectedAt ? `ближайший ${formatDateOnly(coming[0].expectedAt)}` : 'заказов в пути нет'}</small></div>
        <div><span>В лаборатории</span><b>{lab ? openLab.length : '—'}</b><small>{lab ? 'заказ-нарядов в работе' : 'нет доступа'}</small></div>
        <div data-tone={lateLab ? 'bad' : 'ok'}><span>Срок прошёл</span><b>{lab ? lateLab : '—'}</b><small>{lateLab ? 'работы лаборатории просрочены' : 'всё в срок'}</small></div>
      </div>

      {items && (
        <section className={styles.m} aria-labelledby="stock-h">
          <header className={styles.mHead}>
            <h2 id="stock-h">Остатки</h2>
            <div className={styles.seg} role="group" aria-label="Что показать">
              <button type="button" aria-pressed={onlyLow} onClick={() => setOnlyLow(true)}>Заканчивается{short.length ? ` · ${short.length}` : ''}</button>
              <button type="button" aria-pressed={!onlyLow} onClick={() => setOnlyLow(false)}>Все</button>
            </div>
            {can('warehouse.write') && (
              <div className={styles.mActs}>
                {short.length > 0 && <button type="button" className="sd-btn-ghost" onClick={orderAllShort}>Заказать всё, что заканчивается</button>}
                <button type="button" className="sd-btn" disabled={!chosen.length} onClick={() => setOrdering(true)}><ShoppingCart size={16} aria-hidden="true" />Заказать{chosen.length ? ` (${chosen.length})` : ''}</button>
              </div>
            )}
          </header>
          {onlyLow && !short.length && rows.length > 0 && <p className={styles.ok}>Всё в достатке — ничего не заканчивается. Ниже весь склад.</p>}
          {!rows.length ? <p className={styles.empty}>Склад пуст. Добавьте материалы в разделе <Link href="/warehouse">Склад</Link>.</p> : (
            <ul className={styles.stock}>
              {shown.map((row) => (
                <li key={row.id} data-level={row.level}>
                  {can('warehouse.write') && <input type="checkbox" aria-label={`Заказать ${row.name}`} checked={cart[row.id] !== undefined} onChange={() => toggle(row)} />}
                  <span className={styles.stockName}><b>{row.name}</b><small>минимум {row.min} {row.unit}</small></span>
                  <span className={styles.bar} aria-hidden="true"><i style={{ width: `${row.fill}%` }} /></span>
                  <span className={styles.qty}>{row.quantity} {row.unit}</span>
                  <span className={styles.chip} data-level={row.level}>{row.level !== 'ok' && <AlertTriangle size={13} aria-hidden="true" />}{LEVEL[row.level]}</span>
                  {cart[row.id] !== undefined && (
                    <label className={styles.cartQty}>заказать
                      <input inputMode="decimal" value={cart[row.id]} onChange={(event) => setCart((current) => ({ ...current, [row.id]: event.target.value }))} aria-label={`Сколько заказать: ${row.name}`} />
                      {row.unit}
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
          {ordering && chosen.length > 0 && (
            <div className={styles.order} role="dialog" aria-label="Заказ поставщику">
              <b>Заказ поставщику · {chosen.length} поз.</b>
              <label>Поставщик<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Например, «Дентал Сервис»" /></label>
              <label>Ждём к<input type="date" value={expected} min={today} onChange={(event) => setExpected(event.target.value)} /></label>
              <div className={styles.orderActs}>
                <button type="button" className="sd-btn-ghost" onClick={() => setOrdering(false)} disabled={sending}>Отмена</button>
                <button type="button" className="sd-btn" onClick={() => void send()} disabled={sending}>{sending ? 'Отправляю…' : 'Отправить заказ'}</button>
              </div>
            </div>
          )}
        </section>
      )}

      <div className={styles.split}>
        {lab && (
          <section className={styles.m} aria-labelledby="lab-h">
            <header className={styles.mHead}>
              <h2 id="lab-h">Заказы в лабораторию</h2>
              {can('medical.write') && <Link className="sd-btn" href="/lab"><FlaskConical size={16} aria-hidden="true" />Заказать работу</Link>}
            </header>
            {!openLab.length ? <p className={styles.empty}>Открытых заказ-нарядов нет.</p> : (
              <ul className={styles.lab}>
                {openLab.slice(0, 12).map((order) => {
                  const late = !!order.dueAt && order.dueAt.slice(0, 10) < today && order.status !== 'READY';
                  const step = Math.max(0, LAB_FLOW.indexOf(order.status));
                  return (
                    <li key={order.id} data-late={late || undefined}>
                      <span className={styles.labMain}>
                        <b>{order.title}</b>
                        <small>{[order.patient && `${order.patient.lastName} ${order.patient.firstName}`, order.doctor && `${order.doctor.lastName} ${order.doctor.firstName[0]}.`, order.labName].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className={styles.steps} aria-label={`Этап: ${label(LAB_STATUS, order.status)}`}>
                        {LAB_FLOW.slice(0, 4).map((code, index) => <i key={code} data-on={index <= step || undefined} />)}
                      </span>
                      <span className={styles.labStatus} data-status={order.status}>{label(LAB_STATUS, order.status)}</span>
                      <span className={styles.due} data-late={late || undefined}>{order.dueAt ? `${late ? 'срок прошёл · ' : 'до '}${formatDateOnly(order.dueAt)}` : 'без срока'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {items && (
          <section className={styles.m} aria-labelledby="po-h">
            <header className={styles.mHead}><h2 id="po-h">Заказы поставщикам</h2></header>
            {!purchases.length ? <p className={styles.empty}>Заказов ещё не было. Отметьте позиции в остатках и нажмите «Заказать».</p> : (
              <ul className={styles.lab}>
                {purchases.slice(0, 10).map((order) => (
                  <li key={order.id}>
                    <span className={styles.labMain}>
                      <b><Truck size={14} aria-hidden="true" /> {order.supplierName}</b>
                      <small>{order.lines?.length ? order.lines.slice(0, 3).map((line) => `${line.item.name} — ${Number(line.quantity)} ${line.item.unit}`).join(', ') + (order.lines.length > 3 ? ` и ещё ${order.lines.length - 3}` : '') : `от ${formatDateOnly(order.orderedAt)}`}</small>
                    </span>
                    <span className={styles.labStatus} data-status={order.status}>{PO_STATUS[order.status] ?? order.status}</span>
                    <span className={styles.due}>{order.expectedAt ? `ждём ${formatDateOnly(order.expectedAt)}` : Number(order.totalAmount) ? formatMoney(order.totalAmount) : `заказ ${formatDateOnly(order.orderedAt)}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
