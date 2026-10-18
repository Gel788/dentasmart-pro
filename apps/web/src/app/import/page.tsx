'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { samplePatients, sampleVisits } from '@/lib/migrate-fixture';
import {
  PATIENT_FIELDS,
  SOURCE_LABEL,
  VISIT_FIELDS,
  detectSource,
  guessPatientMap,
  guessVisitMap,
  readPatients,
  readVisits,
  sheetKind,
  type Issue,
  type PatientDraft,
  type Sheet,
  type SourceKind,
  type VisitDraft,
} from '@/lib/migrate';
import { readWorkbook } from '@/lib/sheet';

type Recall = {
  checkups: { id: string; patient: string; phone: string | null; lastVisit: string; days: number }[];
  plans: { planId: string; patientId: string; patient: string; phone: string | null; title: string; total: number }[];
};

type Report = { created: number; skipped: number; appointments: number; appointmentSkipped: number; reasons: Record<string, number> };

export default function ImportPage() {
  return <Protected><Wizard /></Protected>;
}

function Wizard() {
  const [source, setSource] = useState<SourceKind>('GENERIC');
  const [patientsSheet, setPatientsSheet] = useState<Sheet | null>(null);
  const [visitsSheet, setVisitsSheet] = useState<Sheet | null>(null);
  const [patientMap, setPatientMap] = useState<Record<string, string>>({});
  const [visitMap, setVisitMap] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [recall, setRecall] = useState<Recall | null>(null);

  const loadRecall = () => api<Recall>('/workspace/recall').then(setRecall).catch(() => undefined);
  useEffect(() => { void loadRecall(); }, []);

  const parsed = useMemo(() => {
    const people = patientsSheet ? readPatients(patientsSheet, patientMap) : { rows: [] as PatientDraft[], issues: [] as Issue[] };
    const visits = visitsSheet ? readVisits(visitsSheet, visitMap) : { rows: [] as VisitDraft[], issues: [] as Issue[] };
    return { people, visits };
  }, [patientsSheet, visitsSheet, patientMap, visitMap]);

  const applyBook = (sheets: { name: string; sheet: Sheet }[], label: string) => {
    const people = sheets.find((item) => sheetKind(item.sheet.headers) === 'patients');
    const visits = sheets.find((item) => sheetKind(item.sheet.headers) === 'visits');
    const patientHeaders = people?.sheet.headers ?? [];
    setPatientsSheet(people?.sheet ?? null);
    setVisitsSheet(visits?.sheet ?? null);
    setPatientMap(people ? guessPatientMap(patientHeaders) : {});
    setVisitMap(visits ? guessVisitMap(visits.sheet.headers) : {});
    setSource(detectSource(patientHeaders.length ? patientHeaders : visits?.sheet.headers ?? []));
    setFileName(label);
    setReport(null);
    setError('');
  };

  const onFile = async (file: File) => {
    setError('');
    try {
      applyBook(await readWorkbook(file), file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Файл не разобрался');
    }
  };

  const commit = async () => {
    setError('');
    const people = parsed.people.rows;
    const visits = parsed.visits.rows;
    if (!people.length && !visits.length) {
      setError('Нет строк, которые можно перенести');
      return;
    }
    const chunk = 40;
    const total = Math.max(1, Math.ceil(people.length / chunk) + (visits.length ? 1 : 0));
    let step = 0;
    const summary: Report = { created: 0, skipped: 0, appointments: 0, appointmentSkipped: 0, reasons: {} };
    setProgress(4);
    try {
      for (let index = 0; index < people.length; index += chunk) {
        const response = await api<Report>('/workspace/import', {
          method: 'POST',
          body: JSON.stringify({ source, patients: people.slice(index, index + chunk) }),
        });
        mergeReport(summary, response);
        step += 1;
        setProgress(Math.round((step / total) * 100));
      }
      if (visits.length) {
        const response = await api<Report>('/workspace/import', {
          method: 'POST',
          body: JSON.stringify({ source, appointments: visits }),
        });
        mergeReport(summary, response);
        setProgress(100);
      }
      setReport(summary);
      await loadRecall();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Перенос остановился');
    } finally {
      setProgress(null);
    }
  };

  const skips = parsed.people.issues.filter((issue) => issue.level === 'skip').length + parsed.visits.issues.filter((issue) => issue.level === 'skip').length;
  const warns = parsed.people.issues.filter((issue) => issue.level === 'warn').length + parsed.visits.issues.filter((issue) => issue.level === 'warn').length;

  return (
    <div className="mv">
      <header className="sd-h">
        <div>
          <h1>Переезд</h1>
          <p>Пациенты и расписание из SQNS, IDENT или АдминДенты. Колонки можно поправить до записи.</p>
        </div>
      </header>
      <div className="mv-drop">
        <label className={patientsSheet || visitsSheet ? 'sd-btn-ghost' : 'sd-btn'}>
          Загрузить xls, xlsx или csv
          <input type="file" accept=".xls,.xlsx,.csv,.txt,.tsv" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }} />
        </label>
        <button className="sd-btn-ghost" type="button" onClick={() => applyBook([{ name: 'Пациенты', sheet: samplePatients() }, { name: 'Расписание', sheet: sampleVisits() }], 'Пример SQNS')}>Пример SQNS</button>
        {fileName && <span>{fileName} · {SOURCE_LABEL[source]}</span>}
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      {(patientsSheet || visitsSheet) && (
        <section className="sd-card sd-stack">
          <div className="mv-stats">
            <b>{parsed.people.rows.length} пациентов</b>
            <b>{parsed.visits.rows.length} записей</b>
            <span>{skips} пропусков</span>
            <span>{warns} предупреждений</span>
          </div>
          {patientsSheet && <MapGrid title="Пациенты" headers={patientsSheet.headers} map={patientMap} fields={PATIENT_FIELDS} onChange={setPatientMap} />}
          {visitsSheet && <MapGrid title="Расписание" headers={visitsSheet.headers} map={visitMap} fields={VISIT_FIELDS} onChange={setVisitMap} />}
          <table className="sd-table">
            <thead><tr><th>Строка</th><th>Кого</th><th>Что не так</th></tr></thead>
            <tbody>
              {[...parsed.people.issues, ...parsed.visits.issues].slice(0, 8).map((issue) => (
                <tr key={`${issue.row}-${issue.reason}`}><td>{issue.row}</td><td>{issue.name || '—'}</td><td>{issue.reason}</td></tr>
              ))}
            </tbody>
          </table>
          {parsed.people.rows.slice(0, 4).map((row) => (
            <p key={`${row.lastName}-${row.phone}`} className="sd-muted">{row.lastName} {row.firstName} · {row.phone || 'без телефона'}{row.lastVisit ? ` · визит ${row.lastVisit}` : ''}</p>
          ))}
          <button className="sd-btn" type="button" disabled={progress != null} onClick={() => void commit()}>Перенести в клинику</button>
          {progress != null && <div className="mv-bar" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
        </section>
      )}
      {report && (
        <section className="sd-card sd-stack">
          <h2>Отчёт</h2>
          <p>Создано карт: {report.created}. Пропущено: {report.skipped}. Записей в расписании: {report.appointments}. Записей без пациента: {report.appointmentSkipped}.</p>
          <ul>{Object.entries(report.reasons).map(([reason, count]) => <li key={reason}>{reason}: {count}</li>)}</ul>
          <Link className="sd-btn-ghost" href="/patients">Открыть пациентов</Link>
        </section>
      )}
      <RecallList data={recall} />
    </div>
  );
}

function MapGrid({
  title,
  headers,
  map,
  fields,
  onChange,
}: {
  title: string;
  headers: string[];
  map: Record<string, string>;
  fields: { field: string; label: string }[];
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div>
      <h2>{title}</h2>
      <div className="mv-map">
        {headers.filter(Boolean).map((header) => (
          <label key={header}>{header}
            <select value={map[header] ?? ''} onChange={(event) => onChange({ ...map, [header]: event.target.value })}>
              <option value="">Не брать</option>
              {fields.map((field) => <option key={field.field} value={field.field}>{field.label}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function RecallList({ data }: { data: Recall | null }) {
  return (
    <section className="sd-card sd-stack">
      <h2>Отзыв / контроль через 6 мес</h2>
      <p className="sd-muted">Кто не был больше полугода, и планы, которые ещё не подписаны.</p>
      {!data && <p>Собираем список…</p>}
      {data && (
        <table className="sd-table">
          <thead><tr><th>Пациент</th><th>Повод</th><th></th></tr></thead>
          <tbody>
            {data.checkups.map((row) => (
              <tr key={row.id}>
                <td>{row.patient}<div className="sd-muted">{row.phone}</div></td>
                <td>Не был {row.days} дн.</td>
                <td>{row.phone ? <a className="sd-btn" href={`tel:${row.phone}`}>Позвонить</a> : <Link className="sd-btn" href={`/patients/${row.id}`}>Открыть</Link>}</td>
              </tr>
            ))}
            {data.plans.map((row) => (
              <tr key={row.planId}>
                <td>{row.patient}<div className="sd-muted">{row.phone}</div></td>
                <td>План «{row.title}» не подписан</td>
                <td><Link className="sd-btn-ghost" href={`/patients/${row.patientId}`}>Открыть</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.checkups.length === 0 && data.plans.length === 0 && <p>Пока никого звать не нужно.</p>}
    </section>
  );
}

function mergeReport(summary: Report, part: Report) {
  summary.created += part.created || 0;
  summary.skipped += part.skipped || 0;
  summary.appointments += part.appointments || 0;
  summary.appointmentSkipped += part.appointmentSkipped || 0;
  for (const [reason, count] of Object.entries(part.reasons ?? {})) summary.reasons[reason] = (summary.reasons[reason] ?? 0) + count;
}
