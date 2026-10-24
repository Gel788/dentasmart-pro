'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Protected } from '@/components/protected';
import { api, assetUrl } from '@/lib/api';
import { formatDateOnly, formatMoney } from '@/lib/format';
import type { PlanCard } from '@/components/studio/plans';
import { BreakdownTable } from '@/components/studio/breakdown-table';
import { SmilePreview } from '@/components/studio/smile';
import { consumablesFor, patientLines, type CatalogService, type CatalogStock } from '@/lib/breakdown';

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

const STUDY: Record<string, string> = { OPG: 'Панорамный снимок', CBCT: 'КТ', INTRAORAL: 'Прицельный снимок', PHOTO: 'Фото', INTRAORAL_PHOTO: 'Фото во рту', SCAN: '3D-скан', CEPH: 'ТРГ' };

export default function PresentPage() {
  return <Protected bare><Story /></Protected>;
}

function Story() {
  const params = useParams<{ familyKey: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [catalog, setCatalog] = useState<{ services: CatalogService[]; stock: CatalogStock[] }>({ services: [], stock: [] });
  const [priced, setPriced] = useState(false);
  const [photos, setPhotos] = useState<{ before: string | null; after: string | null; xray: string | null }>({ before: null, after: null, xray: null });
  // Every real picture of the patient, newest first: X-rays, scans and photos, one of each series.
  const [shots, setShots] = useState<{ id: string; url: string; title: string; takenAt: string | null }[]>([]);
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
      api<{ compare: { before: string | null; after: string | null }; studies: { id: string; type: string; title: string | null; fileUrl: string; takenAt: string | null; seriesKey: string | null }[] }>(`/flow/patients/${payload.patient.id}/imaging`)
        .then((imaging) => {
          setPhotos({
            before: imaging.compare.before,
            after: imaging.compare.after,
            xray: imaging.studies.find((study) => study.type === 'INTRAORAL' || study.type === 'OPG')?.fileUrl ?? null,
          });
          const seen = new Set<string>();
          const picked = [...imaging.studies]
            .filter((study) => !!study.fileUrl && !/\.(dcm|stl|ply|obj|zip)(\?|$)/i.test(study.fileUrl))
            .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''))
            .filter((study) => { const key = study.seriesKey ?? study.id; if (seen.has(key)) return false; seen.add(key); return true; })
            .slice(0, 6)
            .map((study) => ({ id: study.id, url: study.fileUrl, title: study.title || STUDY[study.type] || 'Снимок', takenAt: study.takenAt }));
          setShots(picked);
        })
        .catch(() => undefined);
    }).catch((err: Error) => setError(err.message));
    api<{ services: CatalogService[]; stock: CatalogStock[] }>('/config')
      .then((config) => setCatalog({ services: config.services ?? [], stock: config.stock ?? [] }))
      .catch(() => undefined)
      .finally(() => setPriced(true));
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
          <Link href={`/smile/${params.familyKey}`}>Челюсть 3D</Link>
          {['Сейчас', 'План', 'Улыбка', 'Пути', 'Месяц', 'Подпись'].map((label, index) => (
            <button key={label} className={index === step ? 'on' : ''} type="button" onClick={() => setStep(index)}>{label}</button>
          ))}
        </div>
      </header>
      {step === 0 && (
        <section className="pv-hero" key="now">
          <p className="pv-kicker">Как есть сейчас</p>
          <h1>{data.patient.firstName}, давайте спокойно посмотрим.</h1>
          <p className="lead">Снимок и фото. Красное — то, что нельзя откладывать.</p>
          <div className="sd-chips" style={{ marginTop: 12 }}>
            {data.alerts.filter((alert) => alert.tone === 'danger').map((alert) => <span key={alert.text} className="sd-chip danger">{alert.text}</span>)}
          </div>
          {shots.length ? (
            <div className="pv-gallery" data-count={Math.min(shots.length, 3)}>
              {shots.slice(0, 6).map((shot) => (
                <figure key={shot.id}>
                  <img src={assetUrl(shot.url)} alt={shot.title} />
                  <figcaption><b>{shot.title}</b>{shot.takenAt && <span>{formatDateOnly(shot.takenAt)}</span>}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="pv-none">
              <b>Снимков пока нет</b>
              <span>Загрузите снимок или фото в карте пациента — они появятся здесь.</span>
              <Link href={`/patients/${data.patient.id}?tab=formula`}>Открыть карту</Link>
            </div>
          )}
        </section>
      )}
      {step === 1 && (
        <section className="pv-chapter" key="plan">
          <h2>Что предлагаем</h2>
          <p className="lead">Рекомендуем вариант «{recommended.tierLabel}». Этапы идут по очереди: следующий начинается, когда предыдущий зажил.</p>
          {recommended.phases.map((phase, index) => {
            const subtotal = phase.items.reduce((sum, item) => sum + item.price, 0);
            const show = recommended.showBreakdown !== false;
            return (
              <div className="pv-phase" key={phase.id}>
                <div className="pv-num">0{index + 1}</div>
                <div>
                  <b>{phase.title}</b>
                  <p>{STORY[phase.title] ?? phase.specialty ?? 'Этот этап идёт следом за предыдущим.'}</p>
                  {!show && <p className="sd-muted">{phase.items.map((item) => item.toothNum ? `зуб ${item.toothNum}` : item.title).join(' · ')}</p>}
                  {show && priced && phase.items.map((item) => (
                    <div key={item.id}>
                      <div className="pr-svc">
                        <span>{item.toothNum ? `Зуб ${item.toothNum} · ` : ''}{item.title}</span>
                        <b>{formatMoney(item.price)}</b>
                      </div>
                      <BreakdownTable lines={patientLines(item.price, consumablesFor(item.title, catalog.services, catalog.stock))} />
                    </div>
                  ))}
                  {show && <div className="pr-sub"><span>Подытог</span><b>{formatMoney(subtotal)}</b></div>}
                </div>
              </div>
            );
          })}
          {recommended.showBreakdown !== false && <p className="pr-grand">Итого {formatMoney(recommended.total)}</p>}
        </section>
      )}
      {step === 2 && (
        <section className="pv-chapter" key="smile">
          <h2>Как изменится улыбка</h2>
          <p className="lead">Слева сейчас, справа после. Это ориентир.</p>
          {photos.before && photos.after ? (
            <div className="pv-photos">
              <img src={assetUrl(photos.before)} alt="До" />
              <img src={assetUrl(photos.after)} alt="После" />
            </div>
          ) : shots[0] ? (
            <div className="pv-gallery" data-count={1}>
              <figure><img src={assetUrl(shots.find((shot) => /фото|улыб/i.test(shot.title))?.url ?? shots[0].url)} alt="Сейчас" /><figcaption><b>Сейчас</b><span>фото «после» появится после лечения</span></figcaption></figure>
            </div>
          ) : null}
          <SmilePreview sampleUrl={photos.before ? assetUrl(photos.before) : null} />
        </section>
      )}
      {step === 3 && (
        <section className="pv-chapter" key="paths">
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
        <section className="pv-chapter" key="month">
          <h2>Сколько в месяц</h2>
          <p className="pv-price">{formatMoney(perMonth)}</p>
          <p>при {months === 1 ? 'оплате сразу' : `рассрочке на ${months} мес.`} · всего {formatMoney(total)}</p>
          <input className="pv-range" type="range" min={1} max={12} value={months} onChange={(event) => setMonths(Number(event.target.value))} aria-label="Срок рассрочки" />
        </section>
      )}
      {step === 5 && (
        <section className="pv-chapter" key="sign">
          <h2>{done ? 'Договорились' : 'Подпись'}</h2>
          {done ? (
            <>
              <Confetti />
              <p className="lead">План принят. Ближайшие визиты уже стоят в расписании.</p>
              {done.appointments.map((item) => <p key={item.startsAt}>{item.title} · {new Date(item.startsAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>)}
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
        {step < 5 && <button className="sd-btn" type="button" onClick={() => setStep((value) => value + 1)}>Дальше</button>}
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
