'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Check, FileText, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './visit-documents.module.css';

export type VisitDoc = { id: string; kind: string; number: string; title: string; status: string; signedAt: string | null; scanUrl: string | null; blocking: boolean };
type Pack = { documents: VisitDoc[]; unsigned: VisitDoc[]; requisitesMissing: string[] };

const STATE: Record<string, string> = { CREATED: 'к печати', PRINTED: 'распечатан, ждёт подписи', SIGNED: 'подписан' };

/**
 * The papers this visit needs, issued on their own: print them, have the patient sign, tick each one.
 * The visit does not start until every required one is signed.
 */
export function VisitDocuments({ visitId, refresh, onUnsigned }: { visitId: string; refresh: number; onUnsigned: (count: number) => void }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const photo = useRef<HTMLInputElement>(null);
  const target = useRef<string>('');

  const load = useCallback(async () => {
    try {
      const data = await api<Pack>(`/documents/visit/${visitId}`, { method: 'POST' });
      setPack(data);
      onUnsigned(data.unsigned.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Документы не загрузились');
    }
  }, [visitId, onUnsigned]);

  useEffect(() => { void load(); }, [load, refresh]);

  const open = (ids: string[]) => window.open(`/print/documents?ids=${ids.join(',')}`, '_blank', 'noopener');

  const sign = async (id: string, scanUrl?: string) => {
    setBusy(id);
    setError('');
    try {
      await api(`/documents/${id}/signed`, { method: 'POST', body: JSON.stringify({ scanUrl }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось отметить подпись');
    } finally {
      setBusy('');
    }
  };

  const upload = async (file: File) => {
    const id = target.current;
    if (!id) return;
    setBusy(id);
    try {
      const form = new FormData();
      form.append('file', file);
      const { url } = await api<{ url: string }>('/uploads/imaging', { method: 'POST', body: form });
      await sign(id, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Фото не загрузилось');
      setBusy('');
    }
  };

  if (!pack) return error ? <p className={styles.error}>{error}</p> : null;
  const toPrint = pack.documents.filter((doc) => doc.status !== 'SIGNED');

  return (
    <section className={styles.box} aria-labelledby="visit-docs-title" data-ready={pack.unsigned.length === 0 || undefined}>
      <div className={styles.head}>
        <h3 id="visit-docs-title"><FileText size={16} aria-hidden="true" />Документы к приёму</h3>
        <span className={styles.summary}>
          {pack.unsigned.length ? `Не подписано обязательных: ${pack.unsigned.length}. Без подписи приём не начнётся.` : 'Все обязательные документы подписаны.'}
        </span>
        {toPrint.length > 0 && (
          <button type="button" className={styles.printAll} onClick={() => open(toPrint.map((doc) => doc.id))}><Printer size={16} aria-hidden="true" />Распечатать {toPrint.length}</button>
        )}
      </div>
      {pack.requisitesMissing.length > 0 && (
        <p className={styles.warn}>В документах не хватает данных клиники: {pack.requisitesMissing.join(', ')}. <Link href="/documents?tab=clinic">Заполнить реквизиты</Link></p>
      )}
      <ul className={styles.list}>
        {pack.documents.map((doc) => (
          <li key={doc.id} data-status={doc.status}>
            <span className={styles.mark} aria-hidden="true">{doc.status === 'SIGNED' ? <Check size={14} strokeWidth={3} /> : null}</span>
            <span className={styles.text}>
              <b>{doc.title}</b>
              <small>№ {doc.number} · {STATE[doc.status] ?? doc.status}{doc.blocking ? '' : ' · необязательный'}{doc.scanUrl ? ' · фото приложено' : ''}</small>
            </span>
            <span className={styles.acts}>
              <button type="button" className="sd-btn-ghost" onClick={() => open([doc.id])}>Печать</button>
              {doc.status !== 'SIGNED' && (
                <>
                  <button type="button" className="sd-btn-ghost" disabled={busy === doc.id} title="Сфотографировать подписанный лист" aria-label={`Фото подписанного: ${doc.title}`} onClick={() => { target.current = doc.id; photo.current?.click(); }}><Camera size={16} /></button>
                  <button type="button" className="sd-btn" disabled={busy === doc.id} onClick={() => void sign(doc.id)}>{busy === doc.id ? '…' : 'Подписан'}</button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <input ref={photo} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
    </section>
  );
}
