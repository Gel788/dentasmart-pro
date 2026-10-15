'use client';

import { useEffect, useState } from 'react';
import { Protected } from '@/components/protected';
import { api } from '@/lib/api';

type Person = { id: string; firstName: string; lastName: string; code: string };

export default function CheckInPage() {
  return <Protected><Desk /></Protected>;
}

function Desk() {
  const [people, setPeople] = useState<Person[]>([]);
  const [current, setCurrent] = useState<Person | null>(null);
  const [svg, setSvg] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Person[]>('/showcase/patients').then((rows) => {
      setPeople(rows);
      setCurrent(rows.find((row) => row.id === 'seed-patient-anna') ?? rows[0] ?? null);
    }).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!current) return;
    let live = true;
    void import('qrcode').then((QR) => QR.toString(`SEDRA:${current.code}`, {
      type: 'svg',
      margin: 1,
      color: { dark: '#134e4a', light: '#ffffff' },
    })).then((image) => { if (live) setSvg(image); });
    return () => { live = false; };
  }, [current]);

  const submit = async () => {
    setError('');
    try {
      const result = await api<{ patient: string; status: string }>('/showcase/check-in', {
        method: 'POST',
        body: JSON.stringify({ code: code || current?.code }),
      });
      setNotice(`${result.patient} в очереди стойки.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Код не подошёл');
    }
  };

  return (
    <div className="wow wow-check">
      <header className="wow-head">
        <div>
          <p className="wow-kicker">Стойка</p>
          <h1>QR на входе</h1>
          <p>Пациент сканирует код в своём кабинете или называет шесть символов. Отметка ставит визит в ожидание.</p>
        </div>
      </header>
      <div className="wow-check-grid">
        <section>
          <select value={current?.id ?? ''} onChange={(event) => setCurrent(people.find((row) => row.id === event.target.value) ?? null)}>
            {people.map((person) => <option key={person.id} value={person.id}>{person.lastName} {person.firstName}</option>)}
          </select>
          <div className="wow-qr" dangerouslySetInnerHTML={{ __html: svg }} />
          <strong>{current?.code}</strong>
          <p>{current ? `${current.lastName} ${current.firstName}` : ''}</p>
        </section>
        <section>
          <label>Код с экрана пациента
            <input className="sd-input" value={code} placeholder={current?.code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </label>
          <button className="sd-btn" type="button" onClick={() => void submit()}>Отметить приход</button>
          {notice && <p className="wow-note">{notice}</p>}
          {error && <p className="sd-chip danger">{error}</p>}
        </section>
      </div>
    </div>
  );
}
