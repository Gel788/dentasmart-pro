'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, FileText, Mic, Square } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import styles from './dictation.module.css';

type Fields = { complaints: string; anamnesis: string; objective: string; diagnosis: string; treatment: string; recommendations: string };
type Draft = { transcript: string; fields: Fields; services: { serviceId: string; name: string; price: number; toothNum: number | null }[] };

const LABELS: Record<keyof Fields, string> = {
  complaints: 'Жалобы', anamnesis: 'Анамнез', objective: 'Объективно', diagnosis: 'Диагноз', treatment: 'Лечение', recommendations: 'Рекомендации',
};
const MAX_SECONDS = 5 * 60;

/**
 * Dictation for the visit protocol: the doctor speaks (or types), Russian-hosted models turn it into a
 * draft, and nothing reaches the card until the doctor picks what goes in.
 */
export function Dictation({
  visitId,
  current,
  onApply,
  onAddService,
}: {
  visitId: string;
  current: Fields;
  onApply: (fields: Partial<Fields>) => void;
  onAddService: (serviceId: string, toothNum: number | null) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [useField, setUseField] = useState<Record<string, boolean>>({});
  const [useService, setUseService] = useState<Record<number, boolean>>({});
  const [applied, setApplied] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const [canRecord, setCanRecord] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>('/flow/dictation').then((data) => setEnabled(data.enabled)).catch(() => setEnabled(false));
    // The microphone is only offered to pages served over https (or localhost).
    setCanRecord(typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
    return () => { if (timer.current) window.clearInterval(timer.current); recorder.current?.stream.getTracks().forEach((track) => track.stop()); };
  }, []);

  const receive = (data: Draft) => {
    setDraft(data);
    setUseField(Object.fromEntries(Object.entries(data.fields).map(([key, value]) => [key, !!value.trim()])));
    setUseService(Object.fromEntries(data.services.map((_, index) => [index, true])));
    setApplied('');
  };

  const send = async (body: FormData | string) => {
    setBusy(true);
    setError('');
    try {
      const data = await api<Draft>(`/flow/visits/${visitId}/dictation`, typeof body === 'string' ? { method: 'POST', body: JSON.stringify({ text: body }) } : { method: 'POST', body });
      receive(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось разобрать диктовку');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((item) => MediaRecorder.isTypeSupported(item));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const form = new FormData();
        form.append('audio', blob, `dictation.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
        void send(form);
      };
      recorder.current = rec;
      rec.start(1000);
      setRecording(true);
      setSeconds(0);
      timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError('Нет доступа к микрофону. Разрешите его в настройках браузера или продиктуйте текстом ниже.');
    }
  };

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  // A recording stops on its own at five minutes: longer dictations belong in two parts.
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, seconds]);

  const apply = async () => {
    if (!draft) return;
    const patch: Partial<Fields> = {};
    for (const key of Object.keys(LABELS) as (keyof Fields)[]) {
      const value = draft.fields[key].trim();
      if (!useField[key] || !value) continue;
      patch[key] = current[key].trim() ? `${current[key].trim()}\n${value}` : value;
    }
    onApply(patch);
    const services = draft.services.filter((_, index) => useService[index]);
    setBusy(true);
    try {
      for (const service of services) await onAddService(service.serviceId, service.toothNum);
      setApplied(`Подставлено полей: ${Object.keys(patch).length}${services.length ? `, услуг: ${services.length}` : ''}. Проверьте протокол — он сохранится как обычно.`);
      setDraft(null);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не все услуги добавились');
    } finally {
      setBusy(false);
    }
  };

  if (enabled === false) return null;

  return (
    <section className={styles.box} aria-labelledby="dictation-title">
      <div className={styles.head}>
        <h3 id="dictation-title"><Mic size={16} aria-hidden="true" />Диктовка приёма</h3>
        <span className={styles.note}>Распознаётся на российских серверах. В карту попадёт только то, что вы подтвердите.</span>
      </div>

      {canRecord ? (
        <div className={styles.rec}>
          {recording ? (
            <button type="button" className={styles.stop} onClick={stop}><Square size={16} aria-hidden="true" />Готово · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</button>
          ) : (
            <button type="button" className={styles.start} disabled={busy || enabled === null} onClick={() => void start()}><Mic size={17} aria-hidden="true" />{busy ? 'Разбираем…' : 'Диктовать'}</button>
          )}
          <span className={styles.hint}>Говорите как обычно: жалобы, что видите, диагноз, что сделали, рекомендации. Номера зубов — по FDI.</span>
        </div>
      ) : (
        <p className={styles.hint}>Запись голоса в браузере работает только по https. Пока можно продиктовать в поле ниже кнопкой микрофона на клавиатуре телефона.</p>
      )}

      <div className={styles.typed}>
        <label><span className="sr-only">Текст приёма</span>
          <textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="Или текстом: жалобы на боль в 36 на холодное, глубокая кариозная полость, средний кариес, поставлена пломба…" />
        </label>
        <button type="button" className="sd-btn-ghost" disabled={busy || !text.trim()} onClick={() => void send(text)}><FileText size={16} aria-hidden="true" />{busy ? 'Разбираем…' : 'Разобрать'}</button>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {applied && <p className={styles.ok} role="status"><Check size={16} aria-hidden="true" />{applied}</p>}

      {draft && (
        <div className={styles.draft}>
          <details className={styles.transcript}>
            <summary>Что распознано</summary>
            <p>{draft.transcript}</p>
          </details>
          <ul className={styles.fields}>
            {(Object.keys(LABELS) as (keyof Fields)[]).filter((key) => draft.fields[key].trim()).map((key) => (
              <li key={key}>
                <label>
                  <input type="checkbox" checked={!!useField[key]} onChange={(event) => setUseField({ ...useField, [key]: event.target.checked })} />
                  <span><b>{LABELS[key]}</b>{draft.fields[key]}{current[key].trim() && <em>допишется к уже введённому</em>}</span>
                </label>
              </li>
            ))}
          </ul>
          {draft.services.length > 0 && (
            <>
              <h4>Услуги из прайса</h4>
              <ul className={styles.fields}>
                {draft.services.map((service, index) => (
                  <li key={`${service.serviceId}-${index}`}>
                    <label>
                      <input type="checkbox" checked={!!useService[index]} onChange={(event) => setUseService({ ...useService, [index]: event.target.checked })} />
                      <span><b>{service.toothNum ? `${service.toothNum} · ` : ''}{service.name}</b>{formatMoney(service.price)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={styles.acts}>
            <button type="button" className="sd-btn-ghost" disabled={busy} onClick={() => setDraft(null)}>Отбросить</button>
            <button type="button" className={styles.start} disabled={busy} onClick={() => void apply()}><Check size={17} aria-hidden="true" />Подставить в протокол</button>
          </div>
        </div>
      )}
    </section>
  );
}
