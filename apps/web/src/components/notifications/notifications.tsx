'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, FileText, Globe, ListChecks, Phone, X } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './notifications.module.css';

type Item = { id: string; kind: string; title: string; detail: string; href: string; at: string };
type Feed = { seenAt: string | null; unread: number; items: Item[] };
const ICON: Record<string, typeof Bell> = { request: Globe, confirm: Phone, task: ListChecks, overdue: AlertTriangle, documents: FileText };

/** The unread count every screen shows, refreshed every minute. */
export function useNotifications() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const load = useCallback(() => api<Feed>('/notifications').then(setFeed).catch(() => undefined), []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  return { feed, reload: load };
}

/** What happened that needs someone: new site requests, tasks, unsigned papers, tomorrow's unconfirmed. */
export function NotificationsPanel({ open, feed, onClose, onSeen }: { open: boolean; feed: Feed | null; onClose: () => void; onSeen: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const seen = feed?.seenAt ?? null;
  const fresh = (feed?.items ?? []).filter((item) => !seen || item.at > seen);
  const older = (feed?.items ?? []).filter((item) => seen && item.at <= seen);
  const markRead = async () => { await api('/notifications/seen', { method: 'POST' }).catch(() => undefined); onSeen(); };
  return (
    <div className={styles.back} onMouseDown={onClose}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="notes-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.head}>
          <h2 id="notes-title">Уведомления</h2>
          {fresh.length > 0 && <button type="button" className={styles.read} onClick={() => void markRead()}>Прочитано</button>}
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </header>
        <div className={styles.body}>
          {!feed ? <p className={styles.none}>Загружаем…</p> : feed.items.length === 0 ? <p className={styles.none}>Ничего не ждёт. Новые заявки, задачи и неподписанные документы появятся здесь.</p> : (
            <>
              {fresh.length > 0 && <Group title="Новые" items={fresh} onClose={onClose} fresh />}
              {older.length > 0 && <Group title="Прочитанные" items={older} onClose={onClose} />}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Group({ title, items, onClose, fresh }: { title: string; items: Item[]; onClose: () => void; fresh?: boolean }) {
  return (
    <div className={styles.group}>
      <h3>{title}<em>{items.length}</em></h3>
      <ul>
        {items.map((item) => {
          const Icon = ICON[item.kind] ?? Bell;
          return (
            <li key={item.id} data-kind={item.kind} data-fresh={fresh || undefined}>
              <Link href={item.href} onClick={onClose}>
                <Icon size={16} aria-hidden="true" />
                <span><b>{item.title}</b><small>{item.detail}</small></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
