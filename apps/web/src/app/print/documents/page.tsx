'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Protected } from '@/components/protected';
import { PaperView, type Paper } from '@/components/documents/paper';
import { api } from '@/lib/api';

/** One or several patient documents on A4, ready to print: /print/documents?ids=a,b,c */
export default function PrintDocumentsPage() {
  return <Protected bare><Suspense fallback={<p style={{ padding: 24 }}>Готовим документы…</p>}><Papers /></Suspense></Protected>;
}

function Papers() {
  const ids = (useSearchParams().get('ids') ?? '').split(',').filter(Boolean).slice(0, 30);
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all(ids.map((id) => api<Paper>(`/documents/${id}`)))
      .then((rows) => { if (live) setPapers(rows); })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const print = () => {
    window.print();
    // Marked once the print dialog closes; a paper never printed stays «к печати».
    void Promise.all((papers ?? []).map((paper) => api(`/documents/${paper.id}/printed`, { method: 'POST' }).catch(() => undefined)));
  };

  if (error) return <p style={{ padding: 24 }}>{error}</p>;
  if (!papers) return <p style={{ padding: 24 }}>Готовим документы…</p>;
  const voided = papers.filter((paper) => paper.status === 'VOID');
  return (
    <div style={{ background: '#e9eaee', minHeight: '100vh', padding: '16px 0' }}>
      <div className="pr-actions" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '0 16px 16px', fontFamily: 'var(--font-body), sans-serif' }}>
        <button className="sd-btn" type="button" onClick={print}>Печать · {papers.length} {papers.length === 1 ? 'документ' : 'документа'}</button>
        <span style={{ color: '#555', fontSize: 14 }}>Каждый документ печатается на отдельном листе. После подписи отметьте «Подписан» на визите.</span>
      </div>
      {voided.length > 0 && <p style={{ textAlign: 'center', color: '#b01a51', fontWeight: 600 }}>Аннулированные документы печатать нельзя: {voided.map((paper) => paper.number).join(', ')}</p>}
      {papers.filter((paper) => paper.status !== 'VOID').map((paper) => <PaperView key={paper.id} paper={paper} />)}
    </div>
  );
}
