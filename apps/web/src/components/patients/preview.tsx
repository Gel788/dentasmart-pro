'use client';

import { useEffect } from 'react';
import { CalendarPlus, Phone, TriangleAlert, X } from 'lucide-react';
import { formatRub, kopecks } from '@dentasmart/shared';
import { ageOf, alertsOf, dateLabel, daysFrom, fullName, hasDebt, hasDeposit, phoneLabel, visitLabel, years, type RegistryPatient } from './model';
import styles from './registry.module.css';

type Props = {
  patient: RegistryPatient | null;
  onClose: () => void;
  onOpen: (patient: RegistryPatient) => void;
  onBook: (patient: RegistryPatient) => void;
};

function when(days: number) {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days > 1) return `через ${days} дн.`;
  const ago = -days;
  if (ago < 31) return `${ago} дн. назад`;
  if (ago < 365) return `${Math.round(ago / 30)} мес. назад`;
  return `${Math.floor(ago / 365)} г. назад`;
}

/** The selected patient at a glance: what to watch out for, when they come next, what they owe. */
export function PatientPreview({ patient, onClose, onOpen, onBook }: Props) {
  useEffect(() => {
    if (!patient) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && window.matchMedia('(max-width: 1359px)').matches) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [patient, onClose]);

  if (!patient) {
    return (
      <aside className={styles.preview} data-empty="true" aria-label="Сведения о пациенте">
        <p className={styles.previewHint}>
          Выберите пациента, чтобы увидеть алерты, ближайший визит и долг.
          <span><kbd>↑</kbd> <kbd>↓</kbd> выбор · <kbd>Enter</kbd> карта · <kbd>/</kbd> поиск</span>
        </p>
      </aside>
    );
  }

  const age = ageOf(patient.birthDate);
  const alerts = alertsOf(patient);
  const phone = phoneLabel(patient.phone);
  const debt = hasDebt(patient);
  const deposit = hasDeposit(patient);

  return (
    <>
      <button type="button" className={styles.scrim} aria-label="Закрыть сведения" onClick={onClose} />
      <aside className={styles.preview} aria-labelledby="patient-preview-name">
        <div className={styles.previewHead}>
          <div>
            <h2 id="patient-preview-name">{fullName(patient)}</h2>
            <p>
              {[
                age !== null ? years(age) : null,
                patient.birthDate ? `${patient.gender === 'FEMALE' ? 'родилась' : 'родился'} ${dateLabel(patient.birthDate)}` : null,
                patient.clientType && !patient.segments.includes('declined') ? patient.clientType.toLowerCase() : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Возраст не указан'}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть сведения">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {patient.segments.includes('declined') && (
          <p className={styles.declined}>Отказался от лечения{patient.clientType ? ` · ${patient.clientType.toLowerCase()}` : ''}</p>
        )}

        {alerts.length > 0 && (
          <div className={styles.alerts} role="note" aria-label="Медицинские алерты">
            <TriangleAlert size={18} aria-hidden="true" />
            <ul>{alerts.map((alert) => <li key={alert.id} data-strong={alert.strong || undefined}>{alert.label}</li>)}</ul>
          </div>
        )}

        <dl className={styles.facts}>
          <div>
            <dt>Телефон</dt>
            <dd>
              {phone ? (
                <a className={styles.mono} href={`tel:${patient.phone?.replace(/[^\d+]/g, '')}`}>
                  <Phone size={15} aria-hidden="true" /> {phone}
                </a>
              ) : (
                <span className={styles.none}>нет телефона</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Следующий визит</dt>
            <dd>
              {patient.nextVisit ? (
                <>
                  {visitLabel(patient.nextVisit)}
                  <small>{when(daysFrom(patient.nextVisit))}</small>
                </>
              ) : (
                <span className={styles.none}>не записан</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Последний визит</dt>
            <dd>
              {patient.lastVisit ? (
                <>
                  {dateLabel(patient.lastVisit)}
                  <small data-dormant={patient.segments.includes('dormant') || undefined}>{when(daysFrom(patient.lastVisit))}</small>
                </>
              ) : (
                <span className={styles.none}>не было</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Баланс</dt>
            <dd className={styles.mono}>
              {debt ? (
                <span className={styles.debt}>долг {formatRub(kopecks(patient.debt))}</span>
              ) : deposit ? (
                <span className={styles.deposit}>аванс {formatRub(kopecks(patient.deposit))}</span>
              ) : (
                <span className={styles.none}>расчёты закрыты</span>
              )}
            </dd>
          </div>
        </dl>

        {patient.tags.length > 0 && (
          <p className={styles.marks}>{patient.tags.map((tag) => <span key={tag} className={styles.tag}>{tag}</span>)}</p>
        )}

        <div className={styles.actions}>
          <button type="button" className="sd-btn" onClick={() => onOpen(patient)}>Открыть карту</button>
          <button type="button" className="sd-btn-ghost" onClick={() => onBook(patient)}>
            <CalendarPlus size={18} aria-hidden="true" /> Записать
          </button>
        </div>
      </aside>
    </>
  );
}
