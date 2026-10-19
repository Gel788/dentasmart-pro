'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import {
  FINDINGS,
  chartCondition,
  composeFamily,
  marksFromChart,
  marksFromText,
  type CatalogPrice,
  type FindingCode,
  type Mark,
} from '@/lib/plan-engine';
import { refineFamily } from '@/lib/plan-llm';

type Template = { id: string; name: string; note: string | null; isArchived?: boolean; marks?: Mark[]; phases?: unknown[] };

export function AiPlan({
  patientId,
  services,
  enabled,
  owner,
  tooth,
  surfaces,
  planId,
  onBind,
  onDone,
}: {
  patientId: string;
  services: CatalogPrice[];
  enabled: boolean;
  owner: boolean;
  tooth: number | null;
  surfaces: { toothNum: number; condition: string }[];
  planId: string | null;
  onBind: (handler: ((tooth: number) => boolean) | null) => void;
  onDone: (planId?: string) => Promise<unknown> | void;
}) {
  const [armed, setArmed] = useState<FindingCode | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [note, setNote] = useState('');
  const [listening, setListening] = useState(false);
  const [reel, setReel] = useState<string[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [query, setQuery] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMarks(marksFromChart(surfaces));
  }, [patientId]);

  useEffect(() => {
    api<{ planTemplates?: Template[]; aiPlans?: boolean }>('/config')
      .then((data) => setTemplates((data.planTemplates ?? []).filter((row) => !row.isArchived)))
      .catch(() => undefined);
  }, [templatesOpen]);

  useEffect(() => {
    onBind((next) => {
      if (!armed) return false;
      setMarks((current) => {
        const exists = current.some((mark) => mark.tooth === next && mark.code === armed);
        const nextMarks = exists
          ? current.filter((mark) => !(mark.tooth === next && mark.code === armed))
          : [...current, { tooth: next, code: armed }];
        return nextMarks;
      });
      void api(`/workspace/patients/${patientId}/chart`, {
        method: 'POST',
        body: JSON.stringify({ toothNum: next, surface: 'O', condition: chartCondition(armed), diagnosis: FINDINGS.find((item) => item.code === armed)?.label }),
      }).then(() => onDone()).catch(() => undefined);
      return true;
    });
    return () => onBind(null);
  }, [armed, patientId, onBind, onDone]);

  const labelOf = (code: FindingCode) => FINDINGS.find((item) => item.code === code)?.label ?? code;

  const dictate = () => {
    const sample = 'Зуб 16 кариес, зуб 46 пульпит, зуб 36 отсутствует, профгигиена';
    const host = window as Window & { SpeechRecognition?: new () => SpeechSession; webkitSpeechRecognition?: new () => SpeechSession };
    const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Ctor) {
      setNote(sample);
      setMarks((current) => mergeMarks(current, marksFromText(sample)));
      return;
    }
    const session = new Ctor();
    session.lang = 'ru-RU';
    session.interimResults = true;
    let heard = '';
    session.onresult = (event) => {
      heard = Array.from(event.results).map((row) => row[0]?.transcript ?? '').join(' ').trim();
      if (heard) setNote(heard);
    };
    session.onerror = () => {
      if (!heard) {
        setNote(sample);
        setMarks((current) => mergeMarks(current, marksFromText(sample)));
      }
      setListening(false);
    };
    session.onend = () => {
      setListening(false);
      const text = heard || sample;
      if (!heard) setNote(sample);
      setMarks((current) => mergeMarks(current, marksFromText(text)));
    };
    try {
      session.start();
      setListening(true);
      window.setTimeout(() => { try { session.stop(); } catch { /* already stopped */ } }, 4000);
    } catch {
      setNote(sample);
      setMarks((current) => mergeMarks(current, marksFromText(sample)));
    }
  };

  const generate = async () => {
    setError('');
    const typed = marksFromText(note);
    const typedTeeth = new Set(typed.map((mark) => mark.tooth).filter((tooth): tooth is number => tooth != null));
    const kept = marks.filter((mark) => mark.tooth == null || !typedTeeth.has(mark.tooth));
    const all = mergeMarks(kept, typed);
    if (!all.length) {
      setError('Отметьте зуб диагнозом или напишите жалобу');
      return;
    }
    const family = composeFamily(all, services);
    if (!family) {
      setError('По этим находкам план не собрался');
      return;
    }
    const optimum = family.plans.find((plan) => plan.tier === 'OPTIMUM') ?? family.plans[0];
    const lines = optimum.phases.flatMap((phase) => phase.items.map((item) => `${phase.title} · ${item.toothNum ? `зуб ${item.toothNum} · ` : ''}${item.title}${item.qty > 1 ? ` ×${item.qty}` : ''} · ${formatMoney(item.price)}`));
    setBusy(true);
    setReel([]);
    const phrases = ['Смотрим формулу', 'Сверяем с прайсом', 'Раскладываем этапы', 'Считаем варианты'];
    for (let index = 0; index < lines.length; index += 1) {
      setStatus(phrases[Math.min(phrases.length - 1, Math.floor((index / lines.length) * phrases.length))]);
      setReel(lines.slice(0, index + 1));
      await wait(lines.length > 18 ? 40 : 70);
    }
    setStatus('Записываем три варианта');
    let next = family;
    if (enabled) {
      const refined = await refineFamily(family, note);
      if (refined) next = refined;
    }
    try {
      const saved = await api<{ planId: string }>('/workspace/plans/compose', {
        method: 'POST',
        body: JSON.stringify({ patientId, title: next.title, plans: next.plans }),
      });
      setReel(null);
      setStatus('');
      await onDone(saved.planId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'План не записался');
    } finally {
      setBusy(false);
    }
  };

  const visibleTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((row) => !needle || `${row.name} ${row.note ?? ''}`.toLowerCase().includes(needle));
  }, [templates, query]);

  const apply = async (template: Template) => {
    setError('');
    const needsTooth = (template.marks ?? []).some((mark) => mark.code !== 'hygiene' && mark.tooth == null) && !(template.phases as unknown[] | undefined)?.length;
    if (needsTooth && tooth == null && !planId) {
      setError('Сначала выберите зуб на формуле');
      return;
    }
    setBusy(true);
    try {
      if (!planId) {
        const marksForPlan = (template.marks ?? []).map((mark) => ({ ...mark, tooth: mark.tooth ?? tooth }));
        const family = composeFamily(marksForPlan, services);
        if (!family) throw new Error('Шаблон пустой');
        const saved = await api<{ planId: string }>('/workspace/plans/compose', {
          method: 'POST',
          body: JSON.stringify({ patientId, title: template.name, plans: family.plans }),
        });
        await onDone(saved.planId);
      } else {
        await api(`/workspace/plans/${planId}/apply-template`, {
          method: 'POST',
          body: JSON.stringify({ templateId: template.id, toothNum: tooth }),
        });
        await onDone();
      }
      setTemplatesOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Шаблон не применился');
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    if (!planId || !templateName.trim()) {
      setError('Сначала соберите план и назовите шаблон');
      return;
    }
    setBusy(true);
    try {
      await api(`/workspace/plans/${planId}/template`, { method: 'POST', body: JSON.stringify({ name: templateName.trim() }) });
      setTemplateName('');
      setStatus('Шаблон сохранён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Шаблон не сохранился');
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return owner ? <p className="ai-off">Быстрый план выключен. <Link href="/settings">Включить в настройках</Link></p> : null;
  }

  return (
    <section className="ai">
      <div className="ai-head">
        <div>
          <p className="ai-kicker">Быстрый план</p>
          <h2>Отметьте находки — соберём этапы и цены из прайса</h2>
        </div>
        <button className="sd-btn" type="button" disabled={busy} onClick={() => void generate()}>{busy ? 'Собираем…' : 'Собрать план'}</button>
      </div>
      <div className="ai-chips">
        {FINDINGS.map((item) => (
          <button key={item.code} type="button" className={armed === item.code ? 'on' : ''} onClick={() => setArmed(armed === item.code ? null : item.code)}>{item.label}</button>
        ))}
      </div>
      <p className="ai-hint">{armed ? `Нажмите зуб, чтобы поставить «${labelOf(armed)}». Повторный клик снимает.` : 'Выберите диагноз, затем зуб. Или продиктуйте жалобу.'}</p>
      {marks.length > 0 && (
        <div className="ai-marks">
          {marks.map((mark) => (
            <button key={`${mark.code}-${mark.tooth}`} type="button" onClick={() => setMarks((current) => current.filter((item) => item !== mark))}>
              {mark.tooth ? `зуб ${mark.tooth}` : 'полость'} · {labelOf(mark.code)}
            </button>
          ))}
        </div>
      )}
      <div className="ai-note">
        <textarea aria-label="Жалоба или находка" placeholder="Например: зуб 16 кариес, 36 нет зуба" value={note} onChange={(event) => setNote(event.target.value)} />
        <button className="sd-btn-ghost" type="button" onClick={dictate}>{listening ? 'Слушаем…' : 'Надиктовать'}</button>
      </div>
      {reel && (
        <ol className="ai-reel">
          <li className="ai-status">{status}</li>
          {reel.map((line) => <li key={line}>{line}</li>)}
        </ol>
      )}
      {!reel && status && <p className="ai-status">{status}</p>}
      {error && <p className="sd-chip danger">{error}</p>}
      <div className="ai-actions">
        <button className="sd-btn-ghost" type="button" onClick={() => setTemplatesOpen(true)}>Применить шаблон</button>
        <label>Сохранить как шаблон
          <input aria-label="Название шаблона" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Название" />
        </label>
        <button className="sd-btn-ghost" type="button" disabled={busy} onClick={() => void saveTemplate()}>Сохранить</button>
      </div>
      {templatesOpen && (
        <div className="sd-sheet-back" role="presentation" onClick={() => setTemplatesOpen(false)}>
          <div className="sd-sheet" role="dialog" aria-label="Шаблоны планов" onClick={(event) => event.stopPropagation()}>
            <div className="sd-sheet-head">
              <h2>Шаблоны</h2>
              <button className="sd-btn-ghost" type="button" onClick={() => setTemplatesOpen(false)}>Закрыть</button>
            </div>
            <input className="sd-input" placeholder="Найти шаблон" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="ai-templates">
              {visibleTemplates.map((template) => (
                <button key={template.id} type="button" disabled={busy} onClick={() => void apply(template)}>
                  <b>{template.name}</b>
                  <span>{template.note}</span>
                </button>
              ))}
              {visibleTemplates.length === 0 && <p>Такого шаблона нет.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function mergeMarks(left: Mark[], right: Mark[]) {
  const out = [...left];
  for (const mark of right) {
    const key = `${mark.code}:${mark.tooth ?? 0}:${mark.canals ?? ''}`;
    if (!out.some((item) => `${item.code}:${item.tooth ?? 0}:${item.canals ?? ''}` === key)) out.push(mark);
  }
  return out;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SpeechSession = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
