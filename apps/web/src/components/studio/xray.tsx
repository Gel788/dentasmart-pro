'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { isDemo } from '@/lib/demo/mode';
import { activeReader, chartOf, type XrayFinding } from '@/lib/xray';

type Shot = { id: string; label: string; url: string };

const DEMOS: Shot[] = [
  { id: 'opg', label: 'Панорама', url: '/demo/opg.svg' },
  { id: 'bite', label: 'Прицельный', url: '/demo/tooth-16.svg' },
];

/**
 * A showcase of reading an X-ray: the pictures and findings are canned examples, not a reading of the
 * patient's images. It exists only in the public demo and renders nothing against a real clinic, so a
 * made-up finding can never reach a real patient's chart or plan.
 */
export function XrayAssistant({ patientId, primary = true }: { patientId: string; primary?: boolean }) {
  if (!isDemo()) return null;
  return <XrayShowcase patientId={patientId} primary={primary} />;
}

function XrayShowcase({ patientId, primary }: { patientId: string; primary: boolean }) {
  const [shots, setShots] = useState<Shot[]>(DEMOS);
  const [current, setCurrent] = useState<Shot>(DEMOS[0]);
  const [phase, setPhase] = useState<'idle' | 'scan' | 'done'>('idle');
  const [findings, setFindings] = useState<XrayFinding[]>([]);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const btn = primary ? 'sd-btn' : 'sd-btn-ghost';

  const scan = async (shot = current) => {
    setError('');
    setSaved('');
    setFindings([]);
    setPhase('scan');
    setCurrent(shot);
    try {
      const rows = await activeReader().read({ fileUrl: shot.url, fileName: shot.label });
      await wait(1500);
      setFindings(rows);
      setPhase('done');
    } catch (err) {
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Снимок не прочитан');
    }
  };

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ count: number; total: number }>(`/showcase/xray/apply`, {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          findings: findings.map((row) => {
            const chart = chartOf(row.kind);
            return { toothNum: row.toothNum, surface: chart.surface, condition: chart.condition, title: chart.title, price: chart.price };
          }),
        }),
      });
      setSaved(`В карте и в плане: ${result.count}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не перенесли находки');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    const url = await readFile(file);
    const shot = { id: `up-${Date.now()}`, label: file.name, url };
    setShots((list) => [shot, ...list.filter((item) => item.id !== shot.id)]);
    setCurrent(shot);
    setPhase('idle');
    setFindings([]);
    setSaved('');
  };

  return (
    <section className="xr">
      <div className="xr-head">
        <div>
          <p className="sd-kicker">Снимок</p>
          <strong>Находки на плёнке</strong>
        </div>
        <div className="xr-shots">
          {shots.map((shot) => (
            <button key={shot.id} type="button" className={shot.id === current.id ? 'on' : ''} onClick={() => { setCurrent(shot); setPhase('idle'); setFindings([]); setSaved(''); }}>
              {shot.label}
            </button>
          ))}
          <label>
            Свой файл
            <input hidden type="file" accept="image/*,.svg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          </label>
        </div>
      </div>
      <div className="xr-stage">
        <img src={current.url} alt={current.label} />
        {phase === 'scan' && <div className="xr-beam" />}
        {phase === 'done' && findings.map((row, index) => (
          <span key={row.id} className={`xr-box ${row.kind.toLowerCase()}`} style={{ left: `${row.x * 100}%`, top: `${row.y * 100}%`, width: `${row.w * 100}%`, height: `${row.h * 100}%`, animationDelay: `${index * 90}ms` }}>
            <em>Зуб {row.toothNum} · {row.label}</em>
            <b>{Math.round(row.confidence * 100)}%</b>
          </span>
        ))}
      </div>
      <div className="xr-foot">
        {phase !== 'done' && <button className={btn} type="button" onClick={() => void scan()}>{phase === 'scan' ? 'Читаю снимок…' : 'Сканировать'}</button>}
        {phase === 'done' && <button className={btn} type="button" disabled={busy} onClick={() => void apply()}>{busy ? 'Переносим…' : saved ? 'В карте' : 'В карту и план'}</button>}
        {phase === 'done' && <button className="sd-btn-ghost" type="button" onClick={() => void scan()}>Ещё раз</button>}
        <p className="sd-muted">Демо читает готовые находки. Тот же интерфейс потом отдаёт снимок в Diagnocat.</p>
      </div>
      {saved && <p className="xr-saved">{saved}</p>}
      {error && <p className="sd-chip danger">{error}</p>}
    </section>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Файл не открылся'));
    reader.readAsDataURL(file);
  });
}
