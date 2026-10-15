'use client';

import { useMemo, useState } from 'react';

type Site = { position: number; pocket: number; recession: number; bleeding: boolean };
type Tooth = { toothNum: number; mobility: number; furcation: number; missing: boolean; sites: Site[] };

const ADULT = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export function PerioChart({
  initial,
  onSave,
}: {
  initial: { notes: string | null; teeth: Tooth[] } | null;
  onSave: (teeth: Tooth[], notes: string) => Promise<void>;
}) {
  const [teeth, setTeeth] = useState<Tooth[]>(() => initial?.teeth?.length ? normalize(initial.teeth) : blank(ADULT));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [pending, setPending] = useState(false);
  const bleeding = useMemo(() => teeth.reduce((sum, tooth) => sum + tooth.sites.filter((site) => site.bleeding).length, 0), [teeth]);

  const patch = (toothNum: number, change: (tooth: Tooth) => Tooth) => {
    setTeeth((rows) => rows.map((tooth) => tooth.toothNum === toothNum ? change(tooth) : tooth));
  };

  return (
    <div className="sd-stack">
      <div className="sd-h" style={{ marginBottom: 0 }}>
        <p className="sd-muted" style={{ margin: 0 }}>6 точек на зуб: карман, рецессия, кровоточивость. Подвижность 0–3. Точек с кровью: {bleeding}.</p>
        <button className="sd-btn" type="button" disabled={pending} onClick={async () => { setPending(true); try { await onSave(teeth, notes); } finally { setPending(false); } }}>
          {pending ? 'Сохраняем…' : 'Сохранить осмотр'}
        </button>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="sd-table">
          <thead>
            <tr>
              <th>Зуб</th>
              <th>П</th>
              <th>Ф</th>
              {[0, 1, 2, 3, 4, 5].map((n) => <th key={n}>{n < 3 ? `В${n + 1}` : `Я${n - 2}`}</th>)}
            </tr>
          </thead>
          <tbody>
            {teeth.map((tooth) => (
              <tr key={tooth.toothNum}>
                <td>{tooth.toothNum}</td>
                <td><input className="sd-input" style={{ width: 48 }} type="number" min={0} max={3} value={tooth.mobility} onChange={(e) => patch(tooth.toothNum, (row) => ({ ...row, mobility: Number(e.target.value) }))} /></td>
                <td><input className="sd-input" style={{ width: 48 }} type="number" min={0} max={3} value={tooth.furcation} onChange={(e) => patch(tooth.toothNum, (row) => ({ ...row, furcation: Number(e.target.value) }))} /></td>
                {tooth.sites.map((site) => (
                  <td key={site.position}>
                    <input className="sd-input" style={{ width: 48, borderColor: site.pocket >= 4 ? 'var(--danger)' : undefined }} type="number" min={0} max={12} value={site.pocket} onChange={(e) => patch(tooth.toothNum, (row) => ({ ...row, sites: row.sites.map((item) => item.position === site.position ? { ...item, pocket: Number(e.target.value) } : item) }))} />
                    <button type="button" className={`sd-chip ${site.bleeding ? 'danger' : ''}`} onClick={() => patch(tooth.toothNum, (row) => ({ ...row, sites: row.sites.map((item) => item.position === site.position ? { ...item, bleeding: !item.bleeding } : item) }))}>BOP</button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <input className="sd-input" value={notes} placeholder="Комментарий пародонтолога" onChange={(e) => setNotes(e.target.value)} />
    </div>
  );
}

function blank(nums: number[]): Tooth[] {
  return nums.map((toothNum) => ({
    toothNum,
    mobility: 0,
    furcation: 0,
    missing: false,
    sites: [0, 1, 2, 3, 4, 5].map((position) => ({ position, pocket: 0, recession: 0, bleeding: false })),
  }));
}

function normalize(teeth: Tooth[]) {
  return teeth.map((tooth) => ({
    ...tooth,
    sites: [0, 1, 2, 3, 4, 5].map((position) => tooth.sites.find((site) => site.position === position) ?? { position, pocket: 0, recession: 0, bleeding: false }),
  }));
}
