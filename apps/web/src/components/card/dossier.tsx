'use client';

import { useState } from 'react';
import { Check, Mail, Pencil, Phone, ShieldAlert } from 'lucide-react';
import { ANXIETY_LABELS } from '@dentasmart/shared';
import { ageOf, phoneLabel, years } from '@/components/patients/model';
import { fmt, relative, type CardAlert, type CardPatient, type Medical } from './model';
import styles from './card.module.css';

type Props = {
  patient: CardPatient;
  alerts: CardAlert[];
  medical: Medical;
  canEditMedical: boolean;
  canEditPatient: boolean;
  onEditPatient: () => void;
  onEditMedical: () => void;
  onConfirm: () => Promise<void>;
};

/** Always on screen while the card is open: who this is and what must not be missed before treatment. */
export function Dossier({ patient, alerts, medical, canEditMedical, canEditPatient, onEditPatient, onEditMedical, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const age = ageOf(patient.birthDate);
  const phone = phoneLabel(patient.phone);
  const name = [patient.lastName, patient.firstName === '—' ? '' : patient.firstName].filter(Boolean).join(' ');
  const f = medical.fields;
  const clinical = alerts.filter((alert) => !alert.text.startsWith('Долг'));
  const facts = [
    { label: 'Хронические заболевания', value: f.chronicConditions },
    { label: 'Постоянные препараты', value: f.medications },
    { label: 'Противопоказания', value: f.contraindications },
    { label: 'Анамнез', value: f.anamnesis },
  ];
  const empty = !f.allergies.length && facts.every((fact) => !fact.value) && !f.anticoagulant && !f.pregnant && f.anxiety === 'NONE';

  const confirm = async () => {
    setConfirming(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подтвердить');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <aside className={styles.dossier} aria-label="Досье пациента">
      <header className={styles.who}>
        <h1>{name}</h1>
        {patient.middleName && <p className={styles.middle}>{patient.middleName}</p>}
        <p className={styles.meta}>
          {[
            age !== null ? years(age) : null,
            patient.birthDate ? fmt.long(patient.birthDate) : null,
            patient.gender === 'FEMALE' ? 'жен.' : patient.gender === 'MALE' ? 'муж.' : null,
          ].filter(Boolean).join(' · ') || 'Возраст не указан'}
        </p>
        <div className={styles.contacts}>
          {phone ? (
            <a href={`tel:${patient.phone?.replace(/[^\d+]/g, '')}`}><Phone size={15} aria-hidden="true" />{phone}</a>
          ) : (
            <span className={styles.none}>Нет телефона</span>
          )}
          {patient.email && <a href={`mailto:${patient.email}`}><Mail size={15} aria-hidden="true" />{patient.email}</a>}
        </div>
        {(patient.tags.length > 0 || patient.clientType) && (
          <p className={styles.tags}>
            {patient.clientType && <span data-tone="muted">{patient.clientType.toLowerCase()}</span>}
            {patient.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </p>
        )}
        {canEditPatient && (
          <button type="button" className={styles.textBtn} onClick={onEditPatient}>
            <Pencil size={14} aria-hidden="true" /> Контакты и данные
          </button>
        )}
      </header>

      {clinical.length > 0 && (
        <section className={styles.alerts} aria-label="Медицинские алерты">
          <ShieldAlert size={18} aria-hidden="true" />
          <ul>
            {clinical.map((alert) => <li key={alert.text} data-tone={alert.tone}>{alert.text}</li>)}
          </ul>
        </section>
      )}

      <section className={styles.medical} aria-labelledby="dossier-medical">
        <div className={styles.sectionHead}>
          <h2 id="dossier-medical">Медкарта</h2>
          {canEditMedical && (
            <button type="button" className={styles.textBtn} onClick={onEditMedical}>
              <Pencil size={14} aria-hidden="true" /> Изменить
            </button>
          )}
        </div>
        {empty ? (
          <p className={styles.none}>Медкарта не заполнена. Перед лечением соберите анамнез.</p>
        ) : (
          <dl>
            {facts.filter((fact) => fact.value).map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
            {f.anxiety !== 'NONE' && (
              <div>
                <dt>Страх лечения</dt>
                <dd>{ANXIETY_LABELS[f.anxiety]}</dd>
              </div>
            )}
          </dl>
        )}
        <div className={styles.review} data-due={medical.reviewDue || undefined}>
          {medical.confirmedAt ? (
            <p>
              Подтверждена с пациентом {fmt.short(medical.confirmedAt)}
              {medical.confirmedBy ? `, ${medical.confirmedBy}` : ''}
              <small>{medical.reviewDue ? `${relative(medical.confirmedAt)} — пора уточнить` : relative(medical.confirmedAt)}</small>
            </p>
          ) : (
            <p>Ни разу не подтверждена с пациентом</p>
          )}
          {canEditMedical && (
            <button type="button" className="sd-btn-ghost" onClick={confirm} disabled={confirming}>
              <Check size={16} aria-hidden="true" /> {confirming ? 'Сохраняю…' : 'Подтвердить без изменений'}
            </button>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </section>

      {patient.notes && (
        <section className={styles.notes} aria-label="Заметки">
          <h2>Заметки</h2>
          <p>{patient.notes}</p>
        </section>
      )}
    </aside>
  );
}
