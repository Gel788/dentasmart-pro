'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Protected } from '@/components/protected';
import { stageKind, type JawStage } from '@/lib/jaw';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

const Jaw = dynamic(() => import('@/components/studio/jaw').then((mod) => mod.JawScene), {
  ssr: false,
  loading: () => <div className="jaw-canvas jaw-wait">Собираем челюсть…</div>,
});

type Item = { id: string; title: string; toothNum: number | null; price: number };
type Phase = { id: string; title: string; items: Item[] };
type Plan = { id: string; tier: string | null; tierLabel: string; status: string; phases: Phase[]; looseItems?: Item[]; signedName: string | null };
type Payload = { patient: { id: string; firstName: string; lastName: string }; plans: Plan[] };

export default function SmilePage() {
  return <Protected bare><Smile /></Protected>;
}

function Smile() {
  const params = useParams<{ familyKey: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState('');
  const [done, setDone] = useState('');
  const [pending, setPending] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ink = useRef(false);

  useEffect(() => {
    api<Payload>(`/workspace/families/${params.familyKey}`).then((payload) => {
      setData(payload);
      setName(`${payload.patient.lastName} ${payload.patient.firstName}`);
    }).catch((err: Error) => setError(err.message));
  }, [params.familyKey]);

  if (error && !data) return <p style={{ padding: 24 }}>{error}</p>;
  if (!data) return <p className="sd-muted" style={{ padding: 24 }}>Открываем челюсть…</p>;
  const plan = data.plans.find((item) => item.tier === 'OPTIMUM') ?? data.plans[0];
  const stages = stagesOf(plan);
  const current = progress === 0 ? null : stages[progress - 1];
  const sum = stages.slice(0, progress).reduce((total, stage) => total + stage.price, 0);
  const link = typeof window === 'undefined' ? `/smile/${params.familyKey}` : window.location.href;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('Ссылка у пациента');
    } catch {
      setCopied(link);
    }
  };

  const agree = async () => {
    if (!ink.current) {
      setError('Нужна подпись в рамке');
      return;
    }
    setPending(true);
    setError('');
    try {
      const phaseIds = plan.phases.map((phase) => phase.id);
      await api(`/workspace/plans/${plan.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({ signedName: name, signatureSvg: canvas.current?.toDataURL('image/png') ?? '', phaseIds }),
      });
      setDone(`${name} согласен`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Согласие не записалось');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="pv jaw">
      <header className="pv-top">
        <div className="pv-brand">Седракович Дент</div>
        <div className="pv-steps">
          <Link href={`/present/${params.familyKey}`}>История</Link>
          <button type="button" className="on">Челюсть</button>
        </div>
      </header>
      <div className="jaw-grid">
        <section>
          <p className="pv-kicker">Для {data.patient.firstName}</p>
          <h1>{current ? current.title : 'Как есть сейчас'}</h1>
          <p className="lead">{current ? `${current.phase}${current.tooth ? ` · зуб ${current.tooth}` : ''}` : 'Крутите челюсть. Дальше — этап за этапом.'}</p>
          <div className="jaw-canvas">
            <Jaw stages={stages} progress={progress} />
          </div>
        </section>
        <aside className="jaw-side">
          <p className="jaw-price">{formatMoney(current?.price ?? 0)}</p>
          <p className="sd-muted">{progress === 0 ? 'ещё ничего не сделано' : `в этом этапе · всего ${formatMoney(sum)}`}</p>
          <input className="pv-range" type="range" min={0} max={Math.max(stages.length, 1)} value={progress} onChange={(event) => setProgress(Number(event.target.value))} aria-label="Этап плана" />
          <ol className="jaw-time">
            <li className={progress === 0 ? 'on' : ''}>
              <button type="button" onClick={() => setProgress(0)}>Сейчас</button>
            </li>
            {stages.map((stage, index) => (
              <li key={stage.id} className={progress === index + 1 ? 'on' : progress > index + 1 ? 'done' : ''}>
                <button type="button" onClick={() => setProgress(index + 1)}>
                  <b>{stage.title}</b>
                  <span>{stage.tooth ? `зуб ${stage.tooth}` : stage.phase} · {formatMoney(stage.price)}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="jaw-sign">
            {done ? <p>{done}. Визиты стоят в расписании.</p> : (
              <>
                <p>Я, {name || data.patient.firstName}, согласен на этот план.</p>
                <canvas
                  ref={canvas}
                  className="sd-sign"
                  width={520}
                  height={120}
                  onPointerDown={(event) => {
                    ink.current = true;
                    const ctx = canvas.current?.getContext('2d');
                    const rect = event.currentTarget.getBoundingClientRect();
                    ctx?.beginPath();
                    ctx?.moveTo(event.clientX - rect.left, event.clientY - rect.top);
                  }}
                  onPointerMove={(event) => {
                    if (!event.buttons) return;
                    const ctx = canvas.current?.getContext('2d');
                    if (!ctx) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    ctx.lineWidth = 2.2;
                    ctx.lineCap = 'round';
                    ctx.strokeStyle = '#134e4a';
                    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
                    ctx.stroke();
                  }}
                />
                <input className="sd-input" value={name} onChange={(event) => setName(event.target.value)} aria-label="Имя" />
                {error && <p className="sd-chip danger">{error}</p>}
                <button className="sd-btn" type="button" disabled={pending} onClick={() => void agree()}>{pending ? 'Фиксируем…' : 'Согласен'}</button>
              </>
            )}
            <button className="sd-btn-ghost" type="button" onClick={() => void share()}>{copied || 'Ссылка пациенту'}</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function stagesOf(plan: Plan | undefined): JawStage[] {
  if (!plan) return [];
  const rows: JawStage[] = [];
  for (const phase of plan.phases ?? []) {
    for (const item of phase.items ?? []) {
      rows.push({ id: item.id, title: item.title, phase: phase.title, tooth: item.toothNum, price: item.price, kind: stageKind(item.title) });
    }
  }
  for (const item of plan.looseItems ?? []) {
    rows.push({ id: item.id, title: item.title, phase: plan.tierLabel, tooth: item.toothNum, price: item.price, kind: stageKind(item.title) });
  }
  return rows;
}
