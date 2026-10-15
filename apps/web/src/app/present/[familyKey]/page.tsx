'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Protected } from '@/components/protected';
import { api, assetUrl } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { PlanCard } from '@/components/studio/plans';
import { SmilePreview } from '@/components/studio/smile';

type Payload = {
  patient: { id: string; firstName: string; lastName: string };
  alerts: { tone: string; text: string }[];
  plans: PlanCard[];
};

const STORY: Record<string, string> = {
  Санация: 'Сначала убираем всё, что болит или может вспыхнуть. Без этой базы красивый зуб не простоит.',
  'Санация и удаление': 'То, что ещё можно спасти, лечим. То, что уже нельзя, убираем спокойно и сразу понимаем, чем закрыть место.',
  Ортопедия: 'Когда ткани спокойны, возвращаем форму: коронка или имплант снова берут жевательную нагрузку.',
  Эстетика: 'Финал — цвет и гладкость. Улыбка выглядит собранной, а не «только что из кресла».',
};

export default function PresentPage() {
  return <Protected bare><Story /></Protected>;
}

function Story() {
  const params = useParams<{ familyKey: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [photos, setPhotos] = useState<{ before: string | null; after: string | null; xray: string | null }>({ before: null, after: null, xray: null });
  const [step, setStep] = useState(0);
  const [months, setMonths] = useState(6);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ appointments: { startsAt: string; title: string }[] } | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const ink = useRef(false);

  useEffect(() => {
    api<Payload>(`/workspace/families/${params.familyKey}`).then((payload) => {
      setData(payload);
      setName(`${payload.patient.lastName} ${payload.patient.firstName}`);
      const recommended = payload.plans.find((plan) => plan.tier === 'OPTIMUM');
      if (recommended && recommended.installmentMonths >= 2) setMonths(recommended.installmentMonths);
      if (recommended) setChosen(Object.fromEntries(recommended.phases.map((phase) => [phase.id, true])));
      api<{ compare: { before: string | null; after: string | null }; studies: { type: string; fileUrl: string }[] }>(`/flow/patients/${payload.patient.id}/imaging`)
        .then((imaging) => setPhotos({
          before: imaging.compare.before,
          after: imaging.compare.after,
          xray: imaging.studies.find((study) => study.type === 'INTRAORAL' || study.type === 'OPG')?.fileUrl ?? null,
        }))
        .catch(() => undefined);
    }).catch((err: Error) => setError(err.message));
  }, [params.familyKey]);

  if (error && !data) return <p>{error}</p>;
  if (!data) return <p className="sd-muted" style={{ padding: 24 }}>Готовим историю лечения…</p>;
  const recommended = data.plans.find((plan) => plan.tier === 'OPTIMUM') ?? data.plans[0];
  const total = recommended.total;
  const perMonth = Math.round(total / Math.max(1, months));

  const accept = async () => {
    if (!ink.current) { setError('Нужна подпись пальцем в рамке'); return; }
    setPending(true);
    setError('');
    try {
      const signatureSvg = canvas.current?.toDataURL('image/png') ?? '';
      const phaseIds = recommended.phases.filter((phase) => chosen[phase.id] !== false).map((phase) => phase.id);
      const partial = phaseIds.length > 0 && phaseIds.length < recommended.phases.length;
      const response = await api<{ appointments: { startsAt: string; title: string }[] }>(`/workspace/plans/${recommended.id}/${partial ? 'accept-partial' : 'accept'}`, {
        method: 'POST',
        body: JSON.stringify({ signedName: name, signatureSvg, phaseIds }),
      });
      setDone(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не приняли план');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="pv">
      <header className="pv-top">
        <div className="pv-brand">Седракович Дент</div>
        <div className="pv-steps">
          {[0, 1, 2, 3, 4, 5].map((index) => <button key={index} className={index === step ? 'on' : ''} type="button" onClick={() => setStep(index)}>{index + 1}</button>)}
        </div>
      </header>
      {step === 0 && (
        <section className="pv-hero">
          <p className="sd-muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Как есть сейчас</p>
          <h1>{data.patient.firstName}, давайте спокойно посмотрим.</h1>
          <p className="lead">Ниже — то, что видно на снимке и на фото. Красные пометки — то, что нельзя откладывать. Дальше будет план простыми словами, без прайса для врача.</p>
          <div className="sd-chips" style={{ marginTop: 12 }}>
            {data.alerts.filter((alert) => alert.tone === 'danger').map((alert) => <span key={alert.text} className="sd-chip danger">{alert.text}</span>)}
          </div>
          <div className="pv-photos">
            {photos.xray ? <img src={assetUrl(photos.xray)} alt="Снимок" /> : <div className="pv-shot" />}
            {photos.before ? <img src={assetUrl(photos.before)} alt="До" /> : <div className="pv-shot" />}
          </div>
        </section>
      )}
      {step === 1 && (
        <section className="pv-chapter">
          <h2>Что предлагаем</h2>
          <p className="lead">Рекомендуем вариант «{recommended.tierLabel}». Этапы идут по очереди: следующий начинается, когда предыдущий зажил.</p>
          {recommended.phases.map((phase, index) => (
            <div className="pv-phase" key={phase.id}>
              <div className="pv-num">0{index + 1}</div>
              <div>
                <b>{phase.title}</b>
                <p>{STORY[phase.title] ?? phase.specialty ?? 'Этот этап идёт следом за предыдущим.'}</p>
                <p className="sd-muted">{phase.items.map((item) => item.toothNum ? `зуб ${item.toothNum}` : item.title).join(' · ')}</p>
              </div>
            </div>
          ))}
        </section>
      )}
      {step === 2 && (
        <section className="pv-chapter">
          <h2>Как изменится улыбка</h2>
          <p className="lead">Слева — сейчас. Справа — после ортопедии. Это ориентир, не обещание голливудской улыбки за один визит.</p>
          {photos.before && photos.after ? (
            <div className="pv-photos">
              <img src={assetUrl(photos.before)} alt="До" />
              <img src={assetUrl(photos.after)} alt="После" />
            </div>
          ) : <p>Фотопротокола пока нет.</p>}
          <SmilePreview sampleUrl={photos.before ? assetUrl(photos.before) : null} />
        </section>
      )}
      {step === 3 && (
        <section className="pv-chapter">
          <h2>Три пути</h2>
          <table className="pv-table">
            <thead><tr><th></th>{data.plans.map((plan) => <th key={plan.id}>{plan.tier === 'OPTIMUM' && <span className="pv-ribbon">рекомендуем</span>} {plan.tierLabel}</th>)}</tr></thead>
            <tbody>
              <tr className="rec"><td>Стоимость</td>{data.plans.map((plan) => <td key={plan.id}>{formatMoney(plan.total)}</td>)}</tr>
              <tr><td>Срок</td>{data.plans.map((plan) => <td key={plan.id}>{plan.durationWeeks} нед.</td>)}</tr>
              <tr><td>Гарантия</td>{data.plans.map((plan) => <td key={plan.id}>{plan.guaranteeMonths} мес.</td>)}</tr>
              <tr><td>Рассрочка</td>{data.plans.map((plan) => <td key={plan.id}>{plan.installmentMonths >= 2 ? `${plan.installmentMonths} мес.` : 'нет'}</td>)}</tr>
            </tbody>
          </table>
        </section>
      )}
      {step === 4 && (
        <section className="pv-chapter">
          <h2>Сколько в месяц</h2>
          <p className="pv-price">{formatMoney(perMonth)}</p>
          <p>при {months === 1 ? 'оплате сразу' : `рассрочке на ${months} мес.`} · всего {formatMoney(total)}</p>
          <input type="range" min={1} max={12} value={months} onChange={(event) => setMonths(Number(event.target.value))} style={{ width: '100%', marginTop: 16 }} />
        </section>
      )}
      {step === 5 && (
        <section className="pv-chapter">
          <h2>{done ? 'Договорились' : 'Подпись'}</h2>
          {done ? (
            <>
              <Confetti />
              <p className="lead">План принят. Ближайшие визиты уже стоят в расписании.</p>
              {done.appointments.map((item) => <p key={item.startsAt}>{item.title} · {new Date(item.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>)}
            </>
          ) : (
            <div className="pv-sign">
              <p>Я, {name || data.patient.firstName}, выбираю вариант «{recommended.tierLabel}».</p>
              {recommended.phases.map((phase) => (
                <label key={phase.id} className="sd-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <input type="checkbox" checked={chosen[phase.id] !== false} onChange={(event) => setChosen({ ...chosen, [phase.id]: event.target.checked })} />
                  <span>{phase.title}</span>
                </label>
              ))}
              <p className="sd-muted">Снимите галочку с этапа, если пациент согласен только на часть плана.</p>
              <canvas
                ref={canvas}
                className="sd-sign"
                width={640}
                height={180}
                onPointerDown={(event) => {
                  ink.current = true;
                  const ctx = canvas.current?.getContext('2d');
                  if (!ctx) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  ctx.beginPath();
                  ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
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
              <input className="sd-input" style={{ marginTop: 10 }} value={name} onChange={(event) => setName(event.target.value)} />
              {error && <p className="sd-chip danger">{error}</p>}
              <button className="sd-btn" type="button" disabled={pending} onClick={() => void accept()}>{pending ? 'Фиксируем…' : 'Согласен'}</button>
            </div>
          )}
        </section>
      )}
      <div className="pv-nav">
        <button className="sd-btn-ghost" type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Назад</button>
        <button className="sd-btn" type="button" disabled={step === 5} onClick={() => setStep((value) => value + 1)}>Дальше</button>
      </div>
    </div>
  );
}

function Confetti() {
  const bits = Array.from({ length: 28 }, (_, index) => index);
  return (
    <div className="pv-confetti">
      {bits.map((bit) => <i key={bit} style={{ left: `${(bit * 37) % 100}%`, background: bit % 2 ? '#5eead4' : '#fbbf24', animationDelay: `${bit * 30}ms` }} />)}
    </div>
  );
}
