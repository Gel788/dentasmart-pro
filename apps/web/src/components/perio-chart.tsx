'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];
const MOLARS = new Set([18, 17, 16, 28, 27, 26, 38, 37, 36, 48, 47, 46, 55, 54, 64, 65, 75, 74, 84, 85]);
const SITES = ['ДВ', 'В', 'МВ', 'МО', 'О', 'ДО'];

type Site = { position: number; pocket: number; recession: number; bleeding: boolean };
type Tooth = { toothNum: number; missing: boolean; mobility: number; furcation: number; sites: Site[] };
type Summary = { sites: number; bleeding: number; bopPercent: number; pockets4: number; pockets6: number; meanPocket: number };
type Exam = { id: string; examinedAt: string; teeth: Tooth[]; summary: Summary };

function emptySites(): Site[] {
  return SITES.map((_, position) => ({ position, pocket: 0, recession: 0, bleeding: false }));
}

function blankTooth(toothNum: number, missing: boolean): Tooth {
  return { toothNum, missing, mobility: 0, furcation: 0, sites: missing ? [] : emptySites() };
}

function pocketColor(pocket: number) {
  if (pocket >= 6) return 'var(--danger)';
  if (pocket >= 4) return 'var(--warning)';
  return 'var(--text)';
}

export function PerioChart({ patientId }: { patientId: string }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [missingTeeth, setMissingTeeth] = useState<number[]>([]);
  const [draft, setDraft] = useState<Tooth[] | null>(null);
  const [active, setActive] = useState(16);
  const [formula, setFormula] = useState<'adult' | 'child'>('adult');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ exams: Exam[]; missingTeeth: number[] }>(`/clinical/patients/${patientId}/perio`)
      .then((res) => {
        setExams(res.exams);
        setMissingTeeth(res.missingTeeth);
        if (res.exams[0]?.teeth.some((tooth) => tooth.toothNum >= 51)) setFormula('child');
      })
      .catch((e: Error) => setError(e.message));
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = exams[0];
  const shown = draft ?? latest?.teeth ?? [];
  const tooth = shown.find((row) => row.toothNum === active);
  const summary = draft ? null : latest?.summary;

  const startExam = () => {
    const numbers = formula === 'child' ? [...CHILD_UPPER, ...CHILD_LOWER] : [...ADULT_UPPER, ...ADULT_LOWER];
    const previous = new Map((latest?.teeth ?? []).map((row) => [row.toothNum, row]));
    const missing = new Set(missingTeeth);
    setActive(numbers[0]);
    setDraft(
      numbers.map((toothNum) => {
        const saved = previous.get(toothNum);
        if (saved) {
          return {
            ...saved,
            sites: saved.missing ? [] : SITES.map((_, position) => saved.sites.find((site) => site.position === position) ?? emptySites()[position]),
          };
        }
        return blankTooth(toothNum, missing.has(toothNum));
      }),
    );
    setError('');
  };

  const patchTooth = (toothNum: number, next: Partial<Tooth>) => {
    setDraft((rows) => (rows ? rows.map((row) => (row.toothNum === toothNum ? { ...row, ...next } : row)) : rows));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      await api(`/clinical/patients/${patientId}/perio`, {
        method: 'POST',
        body: JSON.stringify({
          teeth: draft.map((row) => ({
            toothNum: row.toothNum,
            missing: row.missing,
            mobility: row.mobility,
            furcation: row.furcation,
            sites: row.missing ? [] : row.sites,
          })),
        }),
      });
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Осмотр не сохранился');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="ds-kicker">Пародонт</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--text)]">Пародонтологическая карта</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Шесть точек на зуб. Формулу кариеса этот осмотр не меняет.</p>
        </div>
        {draft ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>Отмена</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить осмотр'}</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant={formula === 'adult' ? 'primary' : 'ghost'} onClick={() => { setFormula('adult'); setActive(16); }}>Взрослые</Button>
            <Button variant={formula === 'child' ? 'primary' : 'ghost'} onClick={() => { setFormula('child'); setActive(55); }}>Детские</Button>
            <Button onClick={startExam}>{latest ? 'Новый осмотр' : 'Начать осмотр'}</Button>
          </div>
        )}
      </header>
      {error && <p className="rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
      {summary && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Кровоточивость" value={`${summary.bopPercent}%`} />
          <Stat label="Карманы ≥ 4 мм" value={String(summary.pockets4)} />
          <Stat label="Карманы ≥ 6 мм" value={String(summary.pockets6)} />
          <Stat label="Средняя глубина" value={`${summary.meanPocket} мм`} />
        </div>
      )}
      {latest && !draft && (
        <p className="text-xs text-[var(--muted)]">Осмотр {new Date(latest.examinedAt).toLocaleString('ru-RU')}</p>
      )}
      <Arch teeth={shown} active={active} onPick={setActive} formula={formula} />
      {tooth ? (
        <section className="ds-card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[var(--border)] pb-3">
            <p className="font-semibold text-[var(--text)]">Зуб {tooth.toothNum}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tooth.missing}
                disabled={!draft}
                onChange={(e) => patchTooth(tooth.toothNum, { missing: e.target.checked, sites: e.target.checked ? [] : emptySites() })}
              />
              Отсутствует
            </label>
            {!tooth.missing && (
              <label className="flex items-center gap-2 text-sm">
                Подвижность
                <select
                  aria-label="Подвижность"
                  className="ds-input !w-16"
                  disabled={!draft}
                  value={tooth.mobility}
                  onChange={(e) => patchTooth(tooth.toothNum, { mobility: Number(e.target.value) })}
                >
                  {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
            {!tooth.missing && MOLARS.has(tooth.toothNum) && (
              <label className="flex items-center gap-2 text-sm">
                Фуркация
                <select
                  aria-label="Фуркация"
                  className="ds-input !w-16"
                  disabled={!draft}
                  value={tooth.furcation}
                  onChange={(e) => patchTooth(tooth.toothNum, { furcation: Number(e.target.value) })}
                >
                  {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
          </div>
          {!tooth.missing && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SITES.map((label, position) => {
                const site = tooth.sites.find((row) => row.position === position) ?? emptySites()[position];
                return (
                  <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
                    <label className="mt-1 block text-[10px] text-[var(--muted)]">
                      Карман, мм
                      <input
                        aria-label={`Карман ${label}`}
                        type="number"
                        min={0}
                        max={15}
                        disabled={!draft}
                        className="ds-input mt-1"
                        style={{ color: pocketColor(site.pocket) }}
                        value={site.pocket}
                        onChange={(e) => {
                          const sites = emptySites().map((blank) => tooth.sites.find((row) => row.position === blank.position) ?? blank);
                          sites[position] = { ...site, pocket: Number(e.target.value) };
                          patchTooth(tooth.toothNum, { sites });
                        }}
                      />
                    </label>
                    <label className="mt-1 block text-[10px] text-[var(--muted)]">
                      Рецессия
                      <input
                        aria-label={`Рецессия ${label}`}
                        type="number"
                        min={-5}
                        max={15}
                        disabled={!draft}
                        className="ds-input mt-1"
                        value={site.recession}
                        onChange={(e) => {
                          const sites = emptySites().map((blank) => tooth.sites.find((row) => row.position === blank.position) ?? blank);
                          sites[position] = { ...site, recession: Number(e.target.value) };
                          patchTooth(tooth.toothNum, { sites });
                        }}
                      />
                    </label>
                    <label className="mt-2 flex items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        disabled={!draft}
                        checked={site.bleeding}
                        onChange={(e) => {
                          const sites = emptySites().map((blank) => tooth.sites.find((row) => row.position === blank.position) ?? blank);
                          sites[position] = { ...site, bleeding: e.target.checked };
                          patchTooth(tooth.toothNum, { sites });
                        }}
                      />
                      Кровь
                    </label>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-[var(--muted)]">Потеря прикрепления = карман + рецессия. ДВ В МВ — вестибулярно, МО О ДО — орально.</p>
        </section>
      ) : (
        <p className="text-sm text-[var(--muted)]">Осмотров ещё нет. Новый осмотр скопирует отсутствующие зубы из формулы.</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="ds-display mt-1 text-xl text-[var(--text)]">{value}</p>
    </div>
  );
}

function Arch({ teeth, active, onPick, formula }: { teeth: Tooth[]; active: number; onPick: (n: number) => void; formula: 'adult' | 'child' }) {
  const maxPocket = (toothNum: number) => {
    const tooth = teeth.find((row) => row.toothNum === toothNum);
    if (!tooth || tooth.missing) return null;
    return tooth.sites.reduce((max, site) => Math.max(max, site.pocket), 0);
  };
  const row = (nums: number[]) => (
    <div className="flex flex-wrap gap-1">
      {nums.map((num) => {
        const pocket = maxPocket(num);
        const tooth = teeth.find((row) => row.toothNum === num);
        return (
          <button
            key={num}
            type="button"
            onClick={() => onPick(num)}
            className="h-9 w-9 rounded-lg border text-xs font-semibold transition-colors duration-150"
            style={{
              borderColor: num === active ? 'var(--accent)' : 'var(--border)',
              background: num === active ? 'var(--accent-soft)' : 'var(--surface)',
              color: tooth?.missing ? 'var(--muted)' : pocketColor(pocket ?? 0),
            }}
          >
            {tooth?.missing ? '×' : num}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="ds-card space-y-2 p-4">
      {row(formula === 'child' ? CHILD_UPPER : ADULT_UPPER)}
      <div className="h-px bg-[var(--border)]" />
      {row(formula === 'child' ? CHILD_LOWER : ADULT_LOWER)}
    </div>
  );
}
