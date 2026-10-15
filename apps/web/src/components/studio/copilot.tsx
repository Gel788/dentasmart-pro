'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';

type Advice = {
  demo: boolean;
  label: string;
  diagnoses: { code: string; title: string; why: string }[];
  variants: { tier: string; title: string; price: number; kit: string[]; note: string }[];
  explanation: string;
};

type SpeechResult = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

export function Copilot({
  patientId,
  note,
  onApply,
}: {
  patientId: string;
  note: string;
  onApply: (patch: { diagnosis?: string; recommendations?: string; complaints?: string }) => void;
}) {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState('');

  const ask = () => {
    setError('');
    api<Advice>(`/showcase/copilot?patientId=${encodeURIComponent(patientId)}&note=${encodeURIComponent(note)}`)
      .then(setAdvice)
      .catch((err: Error) => setError(err.message));
  };

  const dictate = () => {
    const host = window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Ctor) {
      setVoice('В этом браузере нет Web Speech API. Текст можно вписать вручную.');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? '';
      setVoice(text);
      if (text) onApply({ complaints: text });
      setListening(false);
    };
    recognition.onerror = () => {
      setVoice('Диктовка не запустилась. Проверьте микрофон.');
      setListening(false);
    };
    setListening(true);
    recognition.start();
  };

  return (
    <section className="sd-card sd-stack wow-copilot">
      <div className="wow-smile-head">
        <div>
          <span className="wow-demo">Демо-модель</span>
          <strong>Подсказка по приёму</strong>
        </div>
        <div className="wow-smile-actions">
          <button className="sd-btn-ghost" type="button" onClick={dictate}>{listening ? 'Слушаю…' : 'Диктовка'}</button>
          <button className="sd-btn" type="button" onClick={ask}>Предложить</button>
        </div>
      </div>
      {voice && <p className="sd-muted">{voice}</p>}
      {error && <p className="sd-chip danger">{error}</p>}
      {!advice && <p className="sd-muted">По формуле и тексту записи соберёт диагнозы, три варианта плана с расходниками и фразу для пациента.</p>}
      {advice && (
        <>
          <p className="sd-muted">{advice.label}</p>
          {advice.diagnoses.map((row) => (
            <button key={row.code + row.title} className="wow-suggest" type="button" onClick={() => onApply({ diagnosis: `${row.code} ${row.title}` })}>
              <b>{row.code}</b>
              <span>{row.title}<small>{row.why}</small></span>
            </button>
          ))}
          <div className="wow-variants">
            {advice.variants.map((row) => (
              <article key={row.tier}>
                <em>{row.tier}</em>
                <strong>{formatMoney(row.price)}</strong>
                <p>{row.title}</p>
                <small>{row.kit.slice(0, 4).join(' · ')}</small>
              </article>
            ))}
          </div>
          <p>{advice.explanation}</p>
          <div className="sd-inline">
            <button className="sd-btn-ghost" type="button" onClick={() => onApply({ recommendations: advice.explanation })}>В рекомендации пациенту</button>
            <button className="sd-btn" type="button" onClick={() => {
              api<{ title: string; total: number }>(`/market/copilot/apply`, { method: 'POST', body: JSON.stringify({ patientId }) })
                .then((result) => setVoice(`Черновик плана и счёт: ${result.title}, ${formatMoney(result.total)}. Это демо-сборка по прайсу, не диагноз.`))
                .catch((err: Error) => setError(err.message));
            }}>Собрать план и счёт</button>
          </div>
        </>
      )}
    </section>
  );
}
