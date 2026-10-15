'use client';

import { useMemo, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';
import { parseDelimited, readTable, type Sheet } from '@/lib/sheet';

const FIELDS = [
  ['firstName', 'Имя'],
  ['lastName', 'Фамилия'],
  ['middleName', 'Отчество'],
  ['phone', 'Телефон'],
  ['email', 'Почта'],
  ['birthDate', 'Дата рождения'],
] as const;

const PRESETS: Record<string, { label: string; csv: string; guess: Record<string, string> }> = {
  IDENT: {
    label: 'IDENT',
    csv: 'Фамилия;Имя;Отчество;Телефон;Email;ДатаРождения\nКовалёв;Илья;Сергеевич;+7 900 111-22-33;ilya@example.com;1990-04-02\nОрлова;Марина;Игоревна;+7 900 222-33-44;marina@example.com;1985-11-19',
    guess: { Фамилия: 'lastName', Имя: 'firstName', Отчество: 'middleName', Телефон: 'phone', Email: 'email', ДатаРождения: 'birthDate' },
  },
  DENTAL4WINDOWS: {
    label: 'Dental4Windows',
    csv: 'LastName,FirstName,MiddleName,Phone,Email,BirthDate\nСоколова,Ева,Петровна,+7 900 333-44-55,eva@example.com,1996-07-08',
    guess: { LastName: 'lastName', FirstName: 'firstName', MiddleName: 'middleName', Phone: 'phone', Email: 'email', BirthDate: 'birthDate' },
  },
};

type Row = Record<(typeof FIELDS)[number][0], string>;

export default function ImportPage() {
  return <Protected><Wizard /></Protected>;
}

function Wizard() {
  const [source, setSource] = useState<'IDENT' | 'DENTAL4WINDOWS'>('IDENT');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const apply = (next: Sheet, preset?: Record<string, string>) => {
    setSheet(next);
    const guess = preset ?? guessMap(next.headers);
    setMap(guess);
  };

  const rows = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((cells) => {
      const row = { firstName: '', lastName: '', middleName: '', phone: '', email: '', birthDate: '' };
      sheet.headers.forEach((header, index) => {
        const field = map[header];
        if (field && field in row) row[field as keyof Row] = cells[index] ?? '';
      });
      return row;
    }).filter((row) => row.firstName || row.lastName);
  }, [sheet, map]);

  const commit = async () => {
    setError('');
    try {
      const response = await api<{ created: number; skipped: number }>('/showcase/import', {
        method: 'POST',
        body: JSON.stringify({ source, rows }),
      });
      setResult(`Создано ${response.created}, пропущено ${response.skipped}. Пациенты уже в базе клиники.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Импорт не прошёл');
    }
  };

  return (
    <div className="wow">
      <header className="wow-head">
        <div>
          <h1>Переезд из другой программы</h1>
          <p>Сопоставьте колонки IDENT или Dental4Windows. В базу попадут только новые фамилии и телефоны.</p>
        </div>
      </header>
      <div className="wow-sources">
        {(Object.keys(PRESETS) as ('IDENT' | 'DENTAL4WINDOWS')[]).map((key) => (
          <button key={key} className={source === key ? 'on' : ''} type="button" onClick={() => { setSource(key); apply(parseDelimited(PRESETS[key].csv, key === 'IDENT' ? ';' : ','), PRESETS[key].guess); }}>
            <strong>{PRESETS[key].label}</strong>
            <span>Открыть пример колонок</span>
          </button>
        ))}
        <label className={sheet && !PRESETS[source] ? 'on' : ''}>
          <strong>Свой файл</strong>
          <span>CSV или Excel .xlsx</span>
          <input type="file" accept=".csv,.txt,.tsv,.xlsx" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void readTable(file).then((next) => apply(next)).catch(() => setError('Файл не разобрался'));
          }} />
        </label>
      </div>
      {error && <p className="sd-chip danger">{error}</p>}
      {sheet && (
        <section className="wow-map">
          <div className="wow-map-grid">
            {sheet.headers.map((header) => (
              <label key={header}>
                {header}
                <select value={map[header] ?? ''} onChange={(event) => setMap({ ...map, [header]: event.target.value })}>
                  <option value="">Не брать</option>
                  {FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            ))}
          </div>
          <table>
            <thead><tr><th>Фамилия</th><th>Имя</th><th>Телефон</th><th>Почта</th></tr></thead>
            <tbody>
              {rows.slice(0, 6).map((row) => (
                <tr key={`${row.lastName}-${row.phone}`}><td>{row.lastName}</td><td>{row.firstName}</td><td>{row.phone}</td><td>{row.email}</td></tr>
              ))}
            </tbody>
          </table>
          <button className="sd-btn" type="button" onClick={() => void commit()}>Импортировать {rows.length}</button>
          {result && <p className="wow-note">{result}</p>}
        </section>
      )}
    </div>
  );
}

function guessMap(headers: string[]) {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const key = header.toLowerCase();
    if (key.includes('фамил') || key.includes('last')) map[header] = 'lastName';
    else if (key.includes('имя') || key.includes('first')) map[header] = 'firstName';
    else if (key.includes('отч') || key.includes('middle')) map[header] = 'middleName';
    else if (key.includes('тел') || key.includes('phone')) map[header] = 'phone';
    else if (key.includes('mail') || key.includes('почт')) map[header] = 'email';
    else if (key.includes('рожд') || key.includes('birth') || key.includes('дата')) map[header] = 'birthDate';
  }
  return map;
}
