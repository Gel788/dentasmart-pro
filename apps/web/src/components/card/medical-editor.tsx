'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { History, X } from 'lucide-react';
import { ANXIETY_LABELS, medicalDiff, type AnxietyLevel, type MedicalFields } from '@dentasmart/shared';
import { api, ApiError } from '@/lib/api';
import { fmt, valueText, type FeedItem, type Medical } from './model';
import styles from './card.module.css';

type Props = {
  patientId: string;
  medical: Medical;
  gender: 'MALE' | 'FEMALE' | null;
  canEdit: boolean;
  log: FeedItem[];
  onSaved: (medical: Medical) => void;
};

const TEXTS: { key: 'chronicConditions' | 'medications' | 'contraindications' | 'anamnesis'; label: string; hint: string }[] = [
  { key: 'chronicConditions', label: 'Хронические заболевания', hint: 'Гипертония, диабет, болезни сердца, щитовидной железы' },
  { key: 'medications', label: 'Постоянные препараты', hint: 'Название и дозировка' },
  { key: 'contraindications', label: 'Противопоказания', hint: 'Что нельзя делать или назначать' },
  { key: 'anamnesis', label: 'Анамнез', hint: 'Перенесённые операции, реакции на анестезию, особенности' },
];

const ANXIETY: AnxietyLevel[] = ['NONE', 'MILD', 'HIGH'];

/** The medical history form: saves against the version it was opened from, never over someone else's edit. */
export function MedicalEditor({ patientId, medical, gender, canEdit, log, onSaved }: Props) {
  const [draft, setDraft] = useState<MedicalFields>(medical.fields);
  const [base, setBase] = useState<Medical>(medical);
  const [allergy, setAllergy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Medical | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (medical.version !== base.version && medicalDiff(base.fields, draft).length === 0) {
      setBase(medical);
      setDraft(medical.fields);
    }
  }, [medical, base, draft]);

  const changes = useMemo(() => medicalDiff(base.fields, draft), [base, draft]);
  const theirs = conflict ? medicalDiff(base.fields, conflict.fields) : [];
  const overlap = theirs.filter((change) => changes.some((own) => own.field === change.field));

  const set = <K extends keyof MedicalFields>(key: K, value: MedicalFields[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const addAllergy = () => {
    const value = allergy.trim();
    if (!value) return;
    if (!draft.allergies.some((item) => item.toLowerCase() === value.toLowerCase())) set('allergies', [...draft.allergies, value]);
    setAllergy('');
  };

  const onAllergyKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addAllergy(); }
    if (event.key === 'Backspace' && !allergy && draft.allergies.length) set('allergies', draft.allergies.slice(0, -1));
  };

  const save = async (against: Medical) => {
    setPending(true);
    setError('');
    try {
      const pendingAllergy = allergy.trim();
      const fields = pendingAllergy && !draft.allergies.includes(pendingAllergy) ? { ...draft, allergies: [...draft.allergies, pendingAllergy] } : draft;
      // Only what this person changed since opening the form, so a save after a conflict
      // lays their edits over the newer version instead of rolling the other edits back.
      const mine = Object.fromEntries(medicalDiff(base.fields, fields).map((change) => [change.field, change.to ?? '']));
      const next = await api<Medical>(`/patients/${patientId}/medical`, {
        method: 'PATCH',
        body: JSON.stringify({ version: against.version, ...mine, confirm }),
      });
      setAllergy('');
      setConflict(null);
      setBase(next);
      setDraft(next.fields);
      setConfirm(false);
      setSaved(true);
      onSaved(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body.current) {
        setConflict(err.body.current as Medical);
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось сохранить медкарту');
      }
    } finally {
      setPending(false);
    }
  };

  const takeTheirs = () => {
    if (!conflict) return;
    setBase(conflict);
    setDraft(conflict.fields);
    setConflict(null);
  };

  const entries = log.filter((item) => item.kind === 'medical');

  return (
    <div className={styles.editorLayout}>
      <form
        className={styles.editor}
        onSubmit={(event) => { event.preventDefault(); void save(base); }}
        aria-labelledby="medical-form-title"
      >
        <div className={styles.sectionHead}>
          <h2 id="medical-form-title">Медкарта</h2>
          <small>версия {base.version}</small>
        </div>

        {conflict && (
          <div className={styles.conflict} role="alert">
            <p><b>Пока вы редактировали, медкарту изменил другой сотрудник.</b> Ваши правки не сохранены.</p>
            {theirs.length > 0 && (
              <ul>
                {theirs.map((change) => (
                  <li key={change.field}>{change.label}: {valueText(change.from)} → <b>{valueText(change.to)}</b></li>
                ))}
              </ul>
            )}
            {overlap.length > 0 && (
              <p>Вы оба меняли: {overlap.map((change) => change.label.toLowerCase()).join(', ')}. Если добавить ваши правки, в этих полях останется ваш вариант.</p>
            )}
            <div>
              <button type="button" className="sd-btn" onClick={() => void save(conflict)} disabled={pending}>Добавить мои правки к новой версии</button>
              <button type="button" className="sd-btn-ghost" onClick={takeTheirs}>Взять новую версию</button>
            </div>
          </div>
        )}

        <fieldset disabled={!canEdit || pending} className={styles.fields}>
          <div className={styles.field} data-wide="true">
            <label htmlFor="allergy-input">Аллергии</label>
            <div className={styles.chips}>
              {draft.allergies.map((item) => (
                <span key={item} className={styles.chip}>
                  {item}
                  <button type="button" onClick={() => set('allergies', draft.allergies.filter((a) => a !== item))} aria-label={`Убрать аллергию ${item}`}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
              <input
                id="allergy-input"
                value={allergy}
                onChange={(event) => setAllergy(event.target.value)}
                onKeyDown={onAllergyKey}
                onBlur={addAllergy}
                placeholder={draft.allergies.length ? 'Ещё…' : 'Лидокаин, латекс, пенициллин…'}
                autoComplete="off"
              />
            </div>
            <small>Enter — добавить. Нет аллергий — оставьте пустым.</small>
          </div>

          <div className={styles.flags} role="group" aria-label="Риски">
            <label className={styles.toggle}>
              <input type="checkbox" checked={draft.anticoagulant} onChange={(event) => set('anticoagulant', event.target.checked)} />
              <span>Принимает антикоагулянты</span>
            </label>
            {gender !== 'MALE' && (
              <label className={styles.toggle}>
                <input type="checkbox" checked={draft.pregnant} onChange={(event) => set('pregnant', event.target.checked)} />
                <span>Беременность</span>
              </label>
            )}
          </div>

          <div className={styles.field} data-wide="true">
            <span id="anxiety-label">Страх лечения</span>
            <div className="sd-seg" role="radiogroup" aria-labelledby="anxiety-label">
              {ANXIETY.map((level) => (
                <button key={level} type="button" role="radio" aria-checked={draft.anxiety === level} className={draft.anxiety === level ? 'on' : ''} onClick={() => set('anxiety', level)}>
                  {ANXIETY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          {TEXTS.map((item) => (
            <div key={item.key} className={styles.field} data-wide={item.key === 'anamnesis' || undefined}>
              <label htmlFor={`medical-${item.key}`}>{item.label}</label>
              <textarea
                id={`medical-${item.key}`}
                rows={item.key === 'anamnesis' ? 4 : 2}
                value={draft[item.key] ?? ''}
                onChange={(event) => set(item.key, event.target.value)}
                placeholder={item.hint}
              />
            </div>
          ))}
        </fieldset>

        {canEdit ? (
          <div className={styles.saveBar}>
            <label className={styles.toggle}>
              <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />
              <span>Проверено с пациентом сегодня</span>
            </label>
            <span className={styles.saveState} aria-live="polite">
              {error ? <span className={styles.error}>{error}</span> : changes.length ? `Изменено: ${changes.map((c) => c.label.toLowerCase()).join(', ')}` : saved ? 'Сохранено' : 'Без изменений'}
            </span>
            <button type="button" className="sd-btn-ghost" disabled={!changes.length || pending} onClick={() => { setDraft(base.fields); setAllergy(''); }}>Отменить</button>
            <button type="submit" className="sd-btn" disabled={pending || (!changes.length && !confirm && !allergy.trim())}>{pending ? 'Сохраняю…' : 'Сохранить'}</button>
          </div>
        ) : (
          <p className={styles.none}>Изменять медкарту может врач или ассистент с правом «Редактирование медкарты».</p>
        )}
      </form>

      <section className={styles.versions} aria-labelledby="medical-log-title">
        <div className={styles.sectionHead}>
          <h2 id="medical-log-title"><History size={16} aria-hidden="true" /> Журнал изменений</h2>
        </div>
        {entries.length === 0 ? (
          <p className={styles.none}>Изменений пока не было. Каждая правка появится здесь с автором и прежним значением.</p>
        ) : (
          <ol>
            {entries.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.at}>{fmt.short(entry.at)} · {fmt.time(entry.at)}</time>
                <b>{entry.title}</b>
                <span>{entry.detail}</span>
                {entry.changes && entry.changes.length > 0 && (
                  <ul>
                    {entry.changes.map((change) => (
                      <li key={change.field}>{change.label}: <s>{valueText(change.from)}</s> → {valueText(change.to)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
